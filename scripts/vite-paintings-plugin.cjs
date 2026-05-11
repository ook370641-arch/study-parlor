const fs = require('node:fs')
const fsp = require('node:fs/promises')
const path = require('node:path')

const PROJECT_ROOT = path.resolve(__dirname, '..')
const PICTURES_DIR = path.join(PROJECT_ROOT, 'Pictures')
const MANIFEST_OUT = path.join(PROJECT_ROOT, 'src/assets/painting-manifest.json')
const OUTPUT_PAINTINGS_DIR = path.join(PROJECT_ROOT, 'out/renderer/paintings')

const PAINTERS = [
  { name: 'Mark Rothko', dir: 'Mark Rothko', prefix: 'rothko' },
  { name: 'Guy Billout', dir: 'Guy Billout', prefix: 'billout' },
]

const SUBDIR_CATEGORIES = new Set([
  'fine-art', 'early-figurative', 'surrealist', 'transitional',
])

function buildManifest() {
  const all = []
  for (const p of PAINTERS) {
    const indexPath = path.join(PICTURES_DIR, p.dir, 'index.json')
    if (!fs.existsSync(indexPath)) continue
    let items
    try {
      items = JSON.parse(fs.readFileSync(indexPath, 'utf-8'))
    } catch (err) {
      console.warn(`[paintings] failed to parse ${indexPath}: ${err.message}`)
      continue
    }
    for (const item of items) {
      if (!item.file) continue
      const subDir = item.category && SUBDIR_CATEGORIES.has(item.category)
        ? item.category + '/'
        : ''
      const relSegments = [p.dir, ...(subDir ? [subDir.replace(/\/$/, '')] : []), item.file]
      const absPath = path.join(PICTURES_DIR, ...relSegments)
      if (!fs.existsSync(absPath)) continue
      const slug = item.slug || item.file
      const yearMatch = slug.match(/\b(19|20)\d{2}\b/)
      const year = yearMatch ? parseInt(yearMatch[0]) : undefined
      const url = 'paintings/' + relSegments.map(encodeURIComponent).join('/')
      all.push({
        id: `${p.prefix}-${item.n}`,
        painter: p.name,
        title: item.title,
        ...(year ? { year } : {}),
        url,
        ...(item.category ? { category: item.category } : {}),
      })
    }
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
