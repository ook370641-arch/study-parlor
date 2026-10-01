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

// 逐张审判模式：全屏一张 + 底部 ✗弃 / ✓选，点击进下一张，localStorage 记录判定。
// 键盘：← 弃 / → 选 / Backspace 撤回上一张。导出 = 已「选」的 id 列表。
function renderSwipeHtml(candidates) {
  const data = candidates.map(c => ({
    id: c.id, file: c._missing ? null : c.file,
    meta: [c.painter, c.title, c.year].filter(v => v != null && v !== '').join(' · '),
    note: c.note || '', line: LINE_LABELS[c.line] || c.line || '',
  }))
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<title>学者夜话 · 画作审判</title>
<style>
  :root { color-scheme: dark; }
  * { box-sizing: border-box; margin: 0; }
  html, body { height: 100%; }
  body { background: #1a120e; color: #e8d5b7; font-family: Georgia, 'Songti SC', serif;
         display: flex; flex-direction: column; overflow: hidden; }
  #bar { display: flex; align-items: center; gap: 14px; padding: 10px 20px; font-size: 13px;
         color: #a8917a; border-bottom: 1px solid #3a2c22; flex: none; }
  #progress { color: #d97757; letter-spacing: 0.1em; }
  #track { flex: 1; height: 3px; background: #3a2c22; border-radius: 2px; overflow: hidden; }
  #fill { height: 100%; width: 0; background: #d97757; transition: width 0.2s; }
  #export { margin-left: auto; background: none; border: 1px solid #6b5340; color: #e8d5b7;
            border-radius: 4px; padding: 5px 14px; font: inherit; font-size: 12.5px; cursor: pointer; }
  #export:hover { border-color: #d97757; }
  #stage { flex: 1; position: relative; display: flex; align-items: center; justify-content: center;
           min-height: 0; padding: 18px; }
  #photo { max-width: 100%; max-height: 100%; object-fit: contain; border-radius: 4px;
           box-shadow: 0 8px 60px rgba(0,0,0,0.6); transition: opacity 0.15s, transform 0.15s; }
  #photo.out-l { opacity: 0; transform: translateX(-40px); }
  #photo.out-r { opacity: 0; transform: translateX(40px); }
  #photo.in { opacity: 0; }
  #missing { display: none; color: #8a6f57; font-size: 14px; }
  #caption { position: absolute; left: 24px; bottom: 16px; max-width: 60%; }
  #meta { font-style: italic; letter-spacing: 0.06em; font-size: 14px; text-shadow: 0 1px 8px rgba(0,0,0,0.8); }
  #note { font-size: 12px; color: #c9b291; margin-top: 4px; text-shadow: 0 1px 8px rgba(0,0,0,0.8); }
  #line-tag { position: absolute; top: 14px; left: 24px; font-size: 11.5px; letter-spacing: 0.2em;
              color: #a8917a; text-shadow: 0 1px 6px rgba(0,0,0,0.8); }
  #undo { position: absolute; top: 12px; right: 20px; background: none; border: none; color: #6b5340;
          font: inherit; font-size: 12px; cursor: pointer; letter-spacing: 0.1em; }
  #undo:hover { color: #e8d5b7; }
  #controls { flex: none; display: flex; justify-content: center; gap: 28px; padding: 14px 0 22px; }
  .verdict { width: 132px; padding: 14px 0; border-radius: 8px; border: 2px solid; font: inherit;
             font-size: 17px; letter-spacing: 0.3em; cursor: pointer; background: rgba(26,18,14,0.7);
             transition: all 0.15s; backdrop-filter: blur(4px); }
  #no { border-color: #6b5340; color: #a8917a; }
  #no:hover { border-color: #8a4a3a; color: #d98a76; }
  #yes { border-color: #d97757; color: #d97757; }
  #yes:hover { background: #d97757; color: #1a120e; }
  #done { display: none; text-align: center; color: #c9b291; }
  #done h2 { font-weight: normal; letter-spacing: 0.2em; margin-bottom: 10px; }
  kbd { border: 1px solid #4a382c; border-radius: 3px; padding: 0 5px; font-size: 11px; color: #a8917a; }
</style>
</head>
<body>
<div id="bar">
  <span id="progress"></span>
  <div id="track"><div id="fill"></div></div>
  <span id="tally"></span>
  <button id="export">导出选中</button>
</div>
<div id="stage">
  <span id="line-tag"></span>
  <button id="undo" title="撤回上一张">← 撤回</button>
  <img id="photo" alt="">
  <div id="missing">图片缺失，请重新下载后刷新</div>
  <div id="caption"><div id="meta"></div><div id="note"></div></div>
  <div id="done"><div><h2>审判完毕</h2><p id="done-tally"></p><p style="margin-top:14px">点「导出选中」把结果给我</p></div></div>
</div>
<div id="controls">
  <button class="verdict" id="no">✗ 弃</button>
  <button class="verdict" id="yes">✓ 选</button>
</div>
<p style="flex:none;text-align:center;font-size:11px;color:#6b5340;padding-bottom:10px">
  <kbd>←</kbd> 弃 &nbsp; <kbd>→</kbd> 选 &nbsp; <kbd>Backspace</kbd> 撤回
</p>
<script>
  const CANDS = ${JSON.stringify(data)};
  // 进度 key 随候选集内容变化：新批次自动生成新 key，旧批次进度不串。
  const LS = 'painting-curation-swipe-' + CANDS.map(c => c.id).join(',').length + '-' + (CANDS[0] ? CANDS[0].id : 'empty')
  let state = JSON.parse(localStorage.getItem(LS) || '{"verdicts":{},"idx":0}')
  const save = () => localStorage.setItem(LS, JSON.stringify(state))
  const photo = document.getElementById('photo')
  const decidedCount = () => Object.keys(state.verdicts).length

  function render() {
    const total = CANDS.length
    const yes = Object.values(state.verdicts).filter(v => v).length
    document.getElementById('tally').textContent = '已选 ' + yes + ' / 已判 ' + decidedCount()
    document.getElementById('fill').style.width = (decidedCount() / total * 100) + '%'
    if (state.idx >= total) {
      document.getElementById('progress').textContent = total + ' / ' + total
      photo.style.display = 'none'
      document.getElementById('caption').style.display = 'none'
      document.getElementById('missing').style.display = 'none'
      document.getElementById('line-tag').textContent = ''
      document.getElementById('done-tally').textContent = '共 ' + total + ' 张，选中 ' + yes + ' 张'
      document.getElementById('done').style.display = 'block'
      return
    }
    const c = CANDS[state.idx]
    document.getElementById('progress').textContent = (state.idx + 1) + ' / ' + total
    document.getElementById('done').style.display = 'none'
    document.getElementById('caption').style.display = 'block'
    document.getElementById('line-tag').textContent = c.line
    document.getElementById('meta').textContent = c.meta
    document.getElementById('note').textContent = c.note
    photo.className = 'in'
    if (c.file) {
      photo.style.display = 'block'
      document.getElementById('missing').style.display = 'none'
      photo.src = c.file
    } else {
      photo.style.display = 'none'
      document.getElementById('missing').style.display = 'block'
    }
    requestAnimationFrame(() => requestAnimationFrame(() => { photo.className = '' }))
    // 预取下一张
    const next = CANDS[state.idx + 1]
    if (next && next.file) { const i = new Image(); i.src = next.file }
  }

  function judge(keep) {
    if (state.idx >= CANDS.length) return
    const c = CANDS[state.idx]
    state.verdicts[c.id] = keep
    photo.className = keep ? 'out-r' : 'out-l'
    setTimeout(() => { state.idx++; save(); render() }, 150)
    save()
  }

  function undo() {
    if (state.idx <= 0) return
    state.idx--
    delete state.verdicts[CANDS[state.idx].id]
    save(); render()
  }

  document.getElementById('yes').addEventListener('click', () => judge(true))
  document.getElementById('no').addEventListener('click', () => judge(false))
  document.getElementById('undo').addEventListener('click', undo)
  document.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowRight') judge(true)
    else if (e.key === 'ArrowLeft') judge(false)
    else if (e.key === 'Backspace') { e.preventDefault(); undo() }
  })
  document.getElementById('export').addEventListener('click', () => {
    const selected = CANDS.filter(c => state.verdicts[c.id] === true).map(c => c.id)
    const blob = new Blob([JSON.stringify({ selected }, null, 2)], { type: 'application/json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = 'selection.json'
    a.click()
    URL.revokeObjectURL(a.href)
  })
  render()
</script>
</body>
</html>
`
}

// 勾选+定焦点一体模式（批三起）：原图完整展示 + 可拖拽橙色裁剪框（object-cover 几何，与 crop-tool 一致），
// ✗弃/✓选 判定。导出 selection.json = { selected, focus }；focus 由 curation-merge 写入 index.json。
function renderPickHtml(candidates) {
  const data = candidates.map(c => ({
    id: c.id, file: c._missing ? null : c.file,
    meta: [c.painter, c.title, c.year].filter(v => v != null && v !== '').join(' · '),
    note: c.note || '', line: LINE_LABELS[c.line] || c.line || '',
  }))
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<title>学者夜话 · 画作勾选+定焦点</title>
<style>
  :root { color-scheme: dark; }
  * { box-sizing: border-box; margin: 0; }
  html, body { height: 100%; }
  body { background: #1a120e; color: #e8d5b7; font-family: Georgia, 'Songti SC', serif;
         display: flex; flex-direction: column; overflow: hidden; }
  #bar { display: flex; align-items: center; gap: 14px; padding: 10px 20px; font-size: 13px;
         color: #a8917a; border-bottom: 1px solid #3a2c22; flex: none; }
  #progress { color: #d97757; letter-spacing: 0.1em; }
  #track { flex: 1; height: 3px; background: #3a2c22; border-radius: 2px; overflow: hidden; }
  #fill { height: 100%; width: 0; background: #d97757; transition: width 0.2s; }
  .ghost { background: none; border: 1px solid #6b5340; color: #e8d5b7; border-radius: 4px;
           padding: 5px 14px; font: inherit; font-size: 12.5px; cursor: pointer; }
  .ghost:hover { border-color: #d97757; }
  #export { background: #d97757; color: #1a120e; border: none; }
  #export:hover { filter: brightness(1.1); }
  #stage { flex: 1; position: relative; min-height: 0; overflow: hidden; }
  #canvas { position: absolute; }
  #photo { display: block; width: 100%; height: 100%; user-select: none; -webkit-user-drag: none; }
  #box { position: absolute; border: 2px solid #d97757; cursor: grab;
         box-shadow: 0 0 0 9999px rgba(10,6,4,0.62); touch-action: none; }
  #box.dragging { cursor: grabbing; border-color: #f09a80; }
  #box::after { content: ''; position: absolute; inset: 0; pointer-events: none;
         background:
           linear-gradient(90deg, transparent calc(33.3% - 0.5px), rgba(217,119,87,0.3) 33.3%, transparent calc(33.3% + 0.5px)),
           linear-gradient(90deg, transparent calc(66.6% - 0.5px), rgba(217,119,87,0.3) 66.6%, transparent calc(66.6% + 0.5px)),
           linear-gradient(0deg, transparent calc(33.3% - 0.5px), rgba(217,119,87,0.3) 33.3%, transparent calc(33.3% + 0.5px)),
           linear-gradient(0deg, transparent calc(66.6% - 0.5px), rgba(217,119,87,0.3) 66.6%, transparent calc(66.6% + 0.5px)); }
  #line-tag { position: absolute; top: 14px; left: 20px; font-size: 11.5px; letter-spacing: 0.2em;
              color: #a8917a; text-shadow: 0 1px 6px rgba(0,0,0,0.8); z-index: 2; }
  #verdict-tag { position: absolute; top: 14px; right: 20px; font-size: 12px; letter-spacing: 0.15em; z-index: 2;
              text-shadow: 0 1px 6px rgba(0,0,0,0.8); }
  #caption { position: absolute; left: 20px; bottom: 14px; max-width: 70%; text-shadow: 0 1px 8px rgba(0,0,0,0.85); z-index: 2; }
  #meta { font-style: italic; letter-spacing: 0.06em; font-size: 14px; }
  #note { font-size: 12px; color: #c9b291; margin-top: 4px; }
  #focus-readout { font-size: 12px; color: #c9b291; margin-top: 2px; }
  #focus-readout.changed { color: #d97757; }
  #controls { flex: none; display: flex; justify-content: center; align-items: center; gap: 24px; padding: 12px 0 16px; }
  .verdict { width: 120px; padding: 12px 0; border-radius: 8px; border: 2px solid; font: inherit;
             font-size: 16px; letter-spacing: 0.3em; cursor: pointer; background: rgba(26,18,14,0.7); }
  #no { border-color: #6b5340; color: #a8917a; }
  #no:hover { border-color: #8a4a3a; color: #d98a76; }
  #yes { border-color: #d97757; color: #d97757; }
  #yes:hover { background: #d97757; color: #1a120e; }
  #done { display: none; text-align: center; color: #c9b291; z-index: 2; }
  kbd { border: 1px solid #4a382c; border-radius: 3px; padding: 0 5px; font-size: 11px; color: #a8917a; }
</style>
</head>
<body>
<div id="bar">
  <span id="progress"></span>
  <div id="track"><div id="fill"></div></div>
  <span id="tally"></span>
  <button class="ghost" id="plate-toggle">画框 21:9</button>
  <button class="ghost" id="export">导出选中</button>
</div>
<div id="stage">
  <span id="line-tag"></span>
  <span id="verdict-tag"></span>
  <div id="canvas"><img id="photo" alt="" draggable="false"><div id="box"></div></div>
  <div id="caption"><div id="meta"></div><div id="note"></div><div id="focus-readout"></div></div>
  <div id="done"><div><h2 style="font-weight:normal;letter-spacing:0.2em;margin-bottom:10px">勾选完毕</h2><p id="done-tally"></p><p style="margin-top:14px">点「导出选中」把结果给我</p></div></div>
</div>
<div id="controls">
  <button class="ghost" id="undo" title="撤回上一张">← 撤回</button>
  <button class="verdict" id="no">✗ 弃</button>
  <button class="verdict" id="yes">✓ 选</button>
</div>
<p style="flex:none;text-align:center;font-size:11px;color:#6b5340;padding-bottom:10px">
  拖拽橙框定焦点（选中的图才带焦点入库） &nbsp; <kbd>←</kbd> 弃 &nbsp; <kbd>→</kbd> 选 &nbsp; <kbd>Backspace</kbd> 撤回 &nbsp; <kbd>T</kbd> 画框 21:9
</p>
<script>
  const CANDS = ${JSON.stringify(data)}
  const LS = 'painting-pick-' + CANDS.map(c => c.id).join(',').length + '-' + (CANDS[0] ? CANDS[0].id : 'empty')
  let state = JSON.parse(localStorage.getItem(LS) || '{"idx":0,"verdicts":{},"focus":{}}')
  const save = () => localStorage.setItem(LS, JSON.stringify(state))
  const photo = document.getElementById('photo')
  const box = document.getElementById('box')
  const canvas = document.getElementById('canvas')
  const stage = document.getElementById('stage')
  const cur = () => CANDS[state.idx]
  const parseFocus = (f) => f.split(' ').map(s => parseFloat(s))
  const fmt = (x, y) => Math.round(Math.max(0, Math.min(100, x))) + '% ' + Math.round(Math.max(0, Math.min(100, y))) + '%'
  const decidedCount = () => Object.keys(state.verdicts).length
  let mode = 'cover'

  function geo() {
    const iw = photo.naturalWidth, ih = photo.naturalHeight
    if (!iw) return null
    const sw = stage.clientWidth, sh = stage.clientHeight
    const s = Math.min(sw / iw, sh / ih)
    let cw, ch
    if (mode === 'cover') {
      const k = Math.max(sw / iw, sh / ih)
      cw = sw / k; ch = sh / k
    } else {
      const W = 620, H = 620 * 9 / 21
      const k = Math.max(W / iw, H / ih)
      cw = W / k; ch = H / k
    }
    return { iw, ih, s, cw, ch, rx: Math.max(0, iw - cw), ry: Math.max(0, ih - ch),
             left: (sw - iw * s) / 2, top: (sh - ih * s) / 2 }
  }

  function layout() {
    const g = geo()
    if (!g) return
    canvas.style.left = g.left + 'px'
    canvas.style.top = g.top + 'px'
    canvas.style.width = (g.iw * g.s) + 'px'
    canvas.style.height = (g.ih * g.s) + 'px'
    const [fx, fy] = parseFocus(state.focus[cur().id] || '50% 50%')
    box.style.width = (g.cw * g.s) + 'px'
    box.style.height = (g.ch * g.s) + 'px'
    box.style.left = (g.rx * fx / 100 * g.s) + 'px'
    box.style.top = (g.ry * fy / 100 * g.s) + 'px'
  }

  function render() {
    const total = CANDS.length
    const yes = Object.values(state.verdicts).filter(v => v).length
    document.getElementById('tally').textContent = '已选 ' + yes + ' / 已判 ' + decidedCount()
    document.getElementById('fill').style.width = (decidedCount() / total * 100) + '%'
    const done = state.idx >= total
    document.getElementById('done').style.display = done ? 'block' : 'none'
    canvas.style.display = done ? 'none' : 'block'
    document.getElementById('caption').style.display = done ? 'none' : 'block'
    if (done) {
      document.getElementById('progress').textContent = total + ' / ' + total
      document.getElementById('done-tally').textContent = '共 ' + total + ' 张，选中 ' + yes + ' 张'
      document.getElementById('line-tag').textContent = ''
      document.getElementById('verdict-tag').textContent = ''
      return
    }
    const c = cur()
    document.getElementById('progress').textContent = (state.idx + 1) + ' / ' + total
    document.getElementById('line-tag').textContent = c.line
    document.getElementById('meta').textContent = c.meta
    document.getElementById('note').textContent = c.note
    const v = state.verdicts[c.id]
    const vt = document.getElementById('verdict-tag')
    vt.textContent = v === true ? '已选 ✓' : v === false ? '已弃 ✗' : ''
    vt.style.color = v === true ? '#d97757' : '#a8917a'
    const readout = document.getElementById('focus-readout')
    readout.textContent = '焦点 ' + (state.focus[c.id] || '50% 50%') + (state.focus[c.id] ? '（已调整）' : '')
    readout.className = state.focus[c.id] ? 'changed' : ''
    photo.src = c.file || ''
    layout()
    const next = CANDS[state.idx + 1]
    if (next && next.file) { const i = new Image(); i.src = next.file }
  }

  box.addEventListener('pointerdown', (ev) => {
    ev.preventDefault()
    const g = geo()
    if (!g) return
    box.classList.add('dragging')
    box.setPointerCapture(ev.pointerId)
    const startX = ev.clientX, startY = ev.clientY
    const bl = box.offsetLeft, bt = box.offsetTop
    const move = (e2) => {
      const nl = Math.max(0, Math.min(g.rx * g.s, bl + e2.clientX - startX))
      const nt = Math.max(0, Math.min(g.ry * g.s, bt + e2.clientY - startY))
      box.style.left = nl + 'px'
      box.style.top = nt + 'px'
      const fx = g.rx ? nl / g.s / g.rx * 100 : 50
      const fy = g.ry ? nt / g.s / g.ry * 100 : 50
      document.getElementById('focus-readout').textContent = '焦点 ' + fmt(fx, fy)
      state._pending = fmt(fx, fy)
    }
    const up = () => {
      box.classList.remove('dragging')
      box.removeEventListener('pointermove', move)
      box.removeEventListener('pointerup', up)
      if (state._pending) {
        const f = state._pending
        delete state._pending
        if (f === '50% 50%') delete state.focus[cur().id]
        else state.focus[cur().id] = f
        save(); render()
      }
    }
    box.addEventListener('pointermove', move)
    box.addEventListener('pointerup', up)
  })

  function judge(keep) {
    if (state.idx >= CANDS.length) return
    state.verdicts[cur().id] = keep
    state.idx++
    save(); render()
  }
  function undo() {
    if (state.idx <= 0) return
    state.idx--
    delete state.verdicts[cur().id]
    save(); render()
  }

  document.getElementById('yes').addEventListener('click', () => judge(true))
  document.getElementById('no').addEventListener('click', () => judge(false))
  document.getElementById('undo').addEventListener('click', undo)
  document.getElementById('plate-toggle').addEventListener('click', () => {
    mode = mode === 'cover' ? 'plate' : 'cover'
    layout(); render()
  })
  document.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowRight') judge(true)
    else if (e.key === 'ArrowLeft') judge(false)
    else if (e.key === 'Backspace') { e.preventDefault(); undo() }
    else if (e.key === 't' || e.key === 'T') { mode = mode === 'cover' ? 'plate' : 'cover'; layout(); render() }
    else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      e.preventDefault()
      if (state.idx >= CANDS.length) return
      const c = cur()
      const [x, y] = parseFocus(state.focus[c.id] || '50% 50%')
      const f = fmt(x, y + (e.key === 'ArrowUp' ? -3 : 3))
      if (f === '50% 50%') delete state.focus[c.id]
      else state.focus[c.id] = f
      save(); render()
    }
  })
  photo.addEventListener('load', layout)
  window.addEventListener('resize', layout)
  document.getElementById('export').addEventListener('click', () => {
    const selected = CANDS.filter(c => state.verdicts[c.id] === true).map(c => c.id)
    const focus = {}
    for (const id of selected) if (state.focus[id]) focus[id] = state.focus[id]
    const blob = new Blob([JSON.stringify({ selected, focus }, null, 2)], { type: 'application/json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = 'selection.json'
    a.click()
    URL.revokeObjectURL(a.href)
  })
  render()
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
  const swipeOut = path.join(stagingDir, 'gallery-swipe.html')
  fs.writeFileSync(swipeOut, renderSwipeHtml(candidates))
  const pickOut = path.join(stagingDir, 'gallery-pick.html')
  fs.writeFileSync(pickOut, renderPickHtml(candidates))
  const missing = candidates.filter(c => c._missing)
  if (missing.length) {
    console.warn(`[curation] ${missing.length} candidates missing files: ${missing.map(c => c.id).join(', ')}`)
  }
  return { total: candidates.length, missing: missing.map(c => c.id), out, swipeOut, pickOut }
}

if (require.main === module) {
  const { total, missing, out } = generateGallery()
  console.log(`[curation] gallery generated: ${total} candidates → ${out}`)
  if (missing.length) console.log(`[curation] WARNING missing: ${missing.join(', ')}`)
}

module.exports = { loadCandidates, withFileStatus, groupCandidates, renderGalleryHtml, renderSwipeHtml, renderPickHtml, generateGallery }
