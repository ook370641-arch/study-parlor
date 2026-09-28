// 画作策展：读取 Pictures-staging/candidates.json，生成单文件暗色勾选画廊 gallery.html。
// 用法：node scripts/curation-gallery.cjs
// 设计：docs/superpowers/specs/2026-09-28-paintings-collection-design.md
const fs = require('node:fs')
const path = require('node:path')

const PROJECT_ROOT = path.resolve(__dirname, '..')
const STAGING_DIR = path.join(PROJECT_ROOT, 'Pictures-staging')
const CANDIDATES_JSON = path.join(STAGING_DIR, 'candidates.json')
const GALLERY_OUT = path.join(STAGING_DIR, 'gallery.html')

const LINE_LABELS = {
  peers: '同类画家',
  classics: '经典画作',
  films: '影视画面',
}

function loadCandidates(stagingDir = STAGING_DIR) {
  const file = path.join(stagingDir, 'candidates.json')
  if (!fs.existsSync(file)) return []
  try {
    const items = JSON.parse(fs.readFileSync(file, 'utf-8'))
    return Array.isArray(items) ? items : []
  } catch (err) {
    console.warn(`[curation] failed to parse candidates.json: ${err.message}`)
    return []
  }
}

// 标注缺文件的候选（不剔除，画廊里显示缺失占位，提醒重新下载）
function withFileStatus(candidates, stagingDir = STAGING_DIR) {
  return candidates.map(c => ({
    ...c,
    _missing: !c.file || !fs.existsSync(path.join(stagingDir, c.file)),
  }))
}

function esc(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function groupCandidates(candidates) {
  // line → painter → items，保持 candidates.json 内的出现顺序
  const lines = new Map()
  for (const c of candidates) {
    const line = c.line || 'misc'
    if (!lines.has(line)) lines.set(line, new Map())
    const painters = lines.get(line)
    const painter = c.painter || 'Unknown'
    if (!painters.has(painter)) painters.set(painter, [])
    painters.get(painter).push(c)
  }
  return lines
}

function renderGalleryHtml(candidates) {
  const lines = groupCandidates(candidates)
  const sections = []
  for (const [line, painters] of lines) {
    const groups = []
    for (const [painter, items] of painters) {
      const cards = items.map(c => {
        const meta = [c.painter, c.title, c.year].filter(v => v != null && v !== '').join(' · ')
        const img = c._missing
          ? '<div class="missing">缺失<br>请重新下载</div>'
          : `<img src="${esc(c.file)}" loading="lazy" alt="${esc(c.title)}">`
        return `      <figure class="card${c._missing ? ' is-missing' : ''}" data-id="${esc(c.id)}" title="${esc(c.note || '')}">
        <div class="thumb">${img}</div>
        <figcaption>
          <span class="meta">${esc(meta)}</span>
          ${c.note ? `<span class="note">${esc(c.note)}</span>` : ''}
          ${c.source ? `<a class="src" href="${esc(c.source)}" target="_blank" rel="noopener noreferrer">来源</a>` : ''}
        </figcaption>
        <span class="check" aria-hidden="true">✓</span>
      </figure>`
      }).join('\n')
      groups.push(`    <section class="painter">
      <h3>${esc(painter)} <em>${items.length}</em></h3>
      <div class="grid">
${cards}
      </div>
    </section>`)
    }
    const total = [...painters.values()].reduce((n, arr) => n + arr.length, 0)
    sections.push(`  <section class="line" data-line="${esc(line)}">
    <h2>${esc(LINE_LABELS[line] || line)} <em>${total}</em></h2>
${groups.join('\n')}
  </section>`)
  }

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<title>学者夜话 · 画作勾选</title>
<style>
  :root { color-scheme: dark; }
  * { box-sizing: border-box; margin: 0; }
  body { background: #2a1f1a; color: #e8d5b7; font-family: Georgia, 'Songti SC', serif; padding: 72px 24px 120px; }
  header { position: fixed; inset: 0 0 auto 0; z-index: 10; display: flex; align-items: center; gap: 16px;
           padding: 12px 24px; background: rgba(26,18,14,0.92); backdrop-filter: blur(6px); border-bottom: 1px solid #4a382c; }
  header h1 { font-size: 16px; font-weight: normal; letter-spacing: 0.1em; }
  #count { color: #d97757; font-size: 14px; }
  button { font: inherit; cursor: pointer; border-radius: 4px; }
  #export { margin-left: auto; background: #d97757; color: #1a120e; border: none; padding: 8px 18px; letter-spacing: 0.1em; }
  #export:hover { filter: brightness(1.1); }
  .ghost { background: none; border: 1px solid #6b5340; color: #e8d5b7; padding: 6px 12px; font-size: 13px; }
  .ghost:hover { border-color: #d97757; }
  h2 { font-size: 20px; margin: 40px 0 8px; letter-spacing: 0.15em; border-bottom: 1px solid #4a382c; padding-bottom: 6px; }
  h2 em, h3 em { color: #d97757; font-style: normal; font-size: 0.7em; margin-left: 6px; }
  h3 { font-size: 15px; margin: 24px 0 10px; color: #c9b291; letter-spacing: 0.08em; font-weight: normal; }
  .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 14px; }
  .card { position: relative; cursor: pointer; border: 2px solid transparent; border-radius: 6px; overflow: hidden;
          background: #1a120e; transition: border-color 0.15s, transform 0.15s; }
  .card:hover { transform: translateY(-2px); }
  .card.selected { border-color: #d97757; }
  .thumb { aspect-ratio: 16 / 10; overflow: hidden; }
  .thumb img { width: 100%; height: 100%; object-fit: cover; display: block; }
  .missing { display: flex; align-items: center; justify-content: center; height: 100%; color: #8a6f57; font-size: 13px; text-align: center; }
  .card.is-missing { opacity: 0.45; }
  figcaption { padding: 8px 10px 10px; display: flex; flex-direction: column; gap: 3px; }
  .meta { font-size: 12.5px; font-style: italic; letter-spacing: 0.04em; }
  .note { font-size: 11.5px; color: #a8917a; }
  .src { font-size: 11px; color: #6b8ea8; text-decoration: none; align-self: flex-start; }
  .src:hover { text-decoration: underline; }
  .check { position: absolute; top: 8px; right: 8px; width: 26px; height: 26px; border-radius: 50%;
           background: #d97757; color: #1a120e; display: flex; align-items: center; justify-content: center;
           font-size: 15px; opacity: 0; transform: scale(0.6); transition: all 0.15s; pointer-events: none; }
  .card.selected .check { opacity: 1; transform: scale(1); }
</style>
</head>
<body>
<header>
  <h1>学者夜话 · 画作勾选</h1>
  <span id="count"></span>
  <button class="ghost" id="select-all">全选</button>
  <button class="ghost" id="clear-all">清空</button>
  <button id="export">导出选中</button>
</header>
${sections.join('\n')}
<script>
  const LS_KEY = 'painting-curation-selected'
  const selected = new Set(JSON.parse(localStorage.getItem(LS_KEY) || '[]'))
  const countEl = document.getElementById('count')
  function persist() { localStorage.setItem(LS_KEY, JSON.stringify([...selected])) }
  function refresh() {
    document.querySelectorAll('.card').forEach(c => c.classList.toggle('selected', selected.has(c.dataset.id)))
    countEl.textContent = '已选 ' + selected.size + ' / ' + document.querySelectorAll('.card').length
  }
  document.querySelectorAll('.card').forEach(card => {
    card.addEventListener('click', (e) => {
      if (e.target.closest('a')) return
      const id = card.dataset.id
      selected.has(id) ? selected.delete(id) : selected.add(id)
      persist(); refresh()
    })
  })
  document.getElementById('select-all').addEventListener('click', () => {
    document.querySelectorAll('.card').forEach(c => selected.add(c.dataset.id)); persist(); refresh()
  })
  document.getElementById('clear-all').addEventListener('click', () => { selected.clear(); persist(); refresh() })
  document.getElementById('export').addEventListener('click', () => {
    const blob = new Blob([JSON.stringify({ selected: [...selected] }, null, 2)], { type: 'application/json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = 'selection.json'
    a.click()
    URL.revokeObjectURL(a.href)
  })
  refresh()
</script>
</body>
</html>
`
}

function generateGallery(stagingDir = STAGING_DIR) {
  const candidates = withFileStatus(loadCandidates(stagingDir), stagingDir)
  const html = renderGalleryHtml(candidates)
  const out = path.join(stagingDir, 'gallery.html')
  fs.writeFileSync(out, html)
  const missing = candidates.filter(c => c._missing)
  if (missing.length) {
    console.warn(`[curation] ${missing.length} candidates missing files: ${missing.map(c => c.id).join(', ')}`)
  }
  return { total: candidates.length, missing: missing.map(c => c.id), out }
}

if (require.main === module) {
  const { total, missing, out } = generateGallery()
  console.log(`[curation] gallery generated: ${total} candidates → ${out}`)
  if (missing.length) console.log(`[curation] WARNING missing: ${missing.join(', ')}`)
}

module.exports = { loadCandidates, withFileStatus, groupCandidates, renderGalleryHtml, generateGallery }
