// 画作策展：读取 Pictures-staging/selection.json（用户在画廊里导出），
// 把选中的候选移入正式库（Pictures/ + index.json），未选中的移入 rejected/。
// 用法：node scripts/curation-merge.cjs  [--dry-run]
// 设计：docs/superpowers/specs/2026-09-28-paintings-collection-design.md
const fs = require('node:fs')
const path = require('node:path')
const { writeManifest } = require('./vite-paintings-plugin.cjs')

const PROJECT_ROOT = path.resolve(__dirname, '..')
const STAGING_DIR = path.join(PROJECT_ROOT, 'Pictures-staging')
const PICTURES_DIR = path.join(PROJECT_ROOT, 'Pictures')
const INDEX_JSON = path.join(PICTURES_DIR, 'index.json')

function slugify(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9一-鿿]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48) || 'untitled'
}

// 现有文件命名规范：NNN-slug.jpg（如 145-rothko-chapel-1967.jpg）。
// 新文件从当前最大编号 +1 续编。
function nextNumber(picturesDir) {
  let max = 0
  for (const name of fs.readdirSync(picturesDir)) {
    const m = /^(\d+)-/.exec(name)
    if (m) max = Math.max(max, parseInt(m[1], 10))
  }
  return max + 1
}

// id 规范：<画家key>-NN，同一画家在 index.json 已有条目时续编号。
// 画家 key 取姓氏 slug（"Mark Rothko" → rothko）；单名/中文名整体 slug。
function painterKey(painter) {
  const parts = String(painter || 'unknown').trim().split(/\s+/)
  return slugify(parts[parts.length - 1])
}

function nextIdFor(painter, takenIds) {
  const key = painterKey(painter)
  let max = 0
  for (const id of takenIds) {
    const m = new RegExp(`^${key}-(\\d+)$`).exec(id)
    if (m) max = Math.max(max, parseInt(m[1], 10))
  }
  return { key, next: max + 1 }
}

function mergeSelection({ stagingDir = STAGING_DIR, picturesDir = PICTURES_DIR, dryRun = false, regenerateManifest = true } = {}) {
  const selectionFile = path.join(stagingDir, 'selection.json')
  const candidatesFile = path.join(stagingDir, 'candidates.json')
  if (!fs.existsSync(selectionFile)) throw new Error(`selection.json not found: ${selectionFile}`)
  if (!fs.existsSync(candidatesFile)) throw new Error(`candidates.json not found: ${candidatesFile}`)

  const selectedIds = new Set(JSON.parse(fs.readFileSync(selectionFile, 'utf-8')).selected || [])
  const candidates = JSON.parse(fs.readFileSync(candidatesFile, 'utf-8'))
  const index = JSON.parse(fs.readFileSync(path.join(picturesDir, 'index.json'), 'utf-8'))

  const takenIds = new Set(index.map(i => i.id))
  let fileNum = nextNumber(picturesDir)
  const added = []
  const rejected = []
  const skipped = []
  const processedIds = new Set() // 候选 id：已处理（入库或落选），从 candidates.json 移除

  const rejectedDir = path.join(stagingDir, 'rejected')
  if (!dryRun) fs.mkdirSync(rejectedDir, { recursive: true })

  for (const c of candidates) {
    const src = path.join(stagingDir, c.file || '')
    const isSelected = selectedIds.has(c.id)

    if (!c.file || !fs.existsSync(src)) {
      if (isSelected) skipped.push(c.id)
      continue // 缺文件：留在原地，等补图后再跑
    }

    if (!isSelected) {
      if (!dryRun) fs.renameSync(src, path.join(rejectedDir, path.basename(c.file)))
      rejected.push(c.id)
      processedIds.add(c.id)
      continue
    }

    // 选中：续编号命名移入 Pictures/，追加 index.json
    const ext = path.extname(c.file).toLowerCase() || '.jpg'
    const newFile = `${String(fileNum).padStart(3, '0')}-${slugify(c.title)}${ext}`
    fileNum += 1
    const { key, next } = nextIdFor(c.painter, takenIds)
    const id = `${key}-${next}`
    takenIds.add(id)

    if (!dryRun) fs.renameSync(src, path.join(picturesDir, newFile))
    const entry = { id, painter: c.painter, title: c.title, file: newFile }
    if (c.category) entry.category = c.category
    if (c.year) entry.year = c.year
    if (c.focus) entry.focus = c.focus
    index.push(entry)
    added.push({ id, file: newFile })
    processedIds.add(c.id)
  }

  if (!dryRun) {
    fs.writeFileSync(path.join(picturesDir, 'index.json'), JSON.stringify(index, null, 2) + '\n')
    // 从 candidates.json 移除已处理（选中+落选）的条目；缺文件的留下等补图
    const remaining = candidates.filter(c => !processedIds.has(c.id))
    fs.writeFileSync(candidatesFile, JSON.stringify(remaining, null, 2) + '\n')
    if (regenerateManifest) {
      const count = writeManifest()
      console.log(`[curation] manifest regenerated: ${count} paintings`)
    }
  }

  return { added, rejected, skipped }
}

if (require.main === module) {
  const dryRun = process.argv.includes('--dry-run')
  const { added, rejected, skipped } = mergeSelection({ dryRun })
  console.log(`[curation] ${dryRun ? '(dry-run) ' : ''}added ${added.length}, rejected ${rejected.length}, skipped(missing file) ${skipped.length}`)
  for (const a of added) console.log(`  + ${a.id} → ${a.file}`)
  if (skipped.length) console.log(`  ! selected but file missing: ${skipped.join(', ')}`)
}

module.exports = { slugify, nextNumber, painterKey, nextIdFor, mergeSelection }
