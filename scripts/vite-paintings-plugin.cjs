const fs = require('node:fs')
const fsp = require('node:fs/promises')
const path = require('node:path')

const PROJECT_ROOT = path.resolve(__dirname, '..')
const PICTURES_DIR = path.join(PROJECT_ROOT, 'Pictures')
const INDEX_JSON = path.join(PICTURES_DIR, 'index.json')
const MANIFEST_OUT = path.join(PROJECT_ROOT, 'src/assets/painting-manifest.json')
const OUTPUT_PAINTINGS_DIR = path.join(PROJECT_ROOT, 'out/renderer/paintings')

function buildManifest() {
  if (!fs.existsSync(INDEX_JSON)) {
    console.warn(`[paintings] index.json not found: ${INDEX_JSON}`)
    return []
  }

  let items
  try {
    items = JSON.parse(fs.readFileSync(INDEX_JSON, 'utf-8'))
  } catch (err) {
    console.warn(`[paintings] failed to parse ${INDEX_JSON}: ${err.message}`)
    return []
  }

  const all = []
  for (const item of items) {
    if (!item.file) continue

    const absPath = path.join(PICTURES_DIR, item.file)
    if (!fs.existsSync(absPath)) {
      console.warn(`[paintings] file not found, skipping: ${item.file}`)
      continue
    }

    const url = 'paintings/' + encodeURIComponent(item.file)
    const entry = {
      id: item.id,
      painter: item.painter,
      title: item.title,
      url,
      ...(item.year ? { year: item.year } : {}),
      ...(item.category ? { category: item.category } : {}),
    }
    all.push(entry)
  }
  return all
}

function writeManifest() {
  const manifest = buildManifest()
  fs.mkdirSync(path.dirname(MANIFEST_OUT), { recursive: true })
  fs.writeFileSync(MANIFEST_OUT, JSON.stringify(manifest, null, 2))
  return manifest.length
}

async function copyDir(src, dest) {
  await fsp.mkdir(dest, { recursive: true })
  for (const entry of await fsp.readdir(src, { withFileTypes: true })) {
    const s = path.join(src, entry.name)
    const d = path.join(dest, entry.name)
    if (entry.isDirectory()) await copyDir(s, d)
    else if (entry.isFile()) await fsp.copyFile(s, d)
  }
}

module.exports = function vitePaintingsPlugin() {
  return {
    name: 'study-parlor-paintings',

    configureServer(server) {
      const count = writeManifest()
      console.log(`[paintings] dev manifest generated: ${count} paintings`)

      server.middlewares.use('/paintings', (req, res, next) => {
        const urlPath = decodeURIComponent(req.url.split('?')[0].replace(/^\/+/, ''))
        const filePath = path.join(PICTURES_DIR, urlPath)
        if (!filePath.startsWith(PICTURES_DIR + path.sep) && filePath !== PICTURES_DIR) {
          res.statusCode = 403
          res.end()
          return
        }
        if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
          return next()
        }
        const ext = path.extname(filePath).toLowerCase()
        const mime = {
          '.jpg': 'image/jpeg',
          '.jpeg': 'image/jpeg',
          '.png': 'image/png',
          '.webp': 'image/webp',
        }[ext] || 'application/octet-stream'
        res.setHeader('Content-Type', mime)
        res.setHeader('Cache-Control', 'public, max-age=3600')
        fs.createReadStream(filePath).pipe(res)
      })
    },

    buildStart() {
      const count = writeManifest()
      console.log(`[paintings] build manifest generated: ${count} paintings`)
    },

    async closeBundle() {
      if (!fs.existsSync(PICTURES_DIR)) {
        console.warn(`[paintings] Pictures dir not found, skip copy: ${PICTURES_DIR}`)
        return
      }
      console.log(`[paintings] copying Pictures → ${OUTPUT_PAINTINGS_DIR}`)
      await copyDir(PICTURES_DIR, OUTPUT_PAINTINGS_DIR)
      console.log(`[paintings] copy complete`)
    },
  }
}

module.exports.buildManifest = buildManifest
module.exports.writeManifest = writeManifest
