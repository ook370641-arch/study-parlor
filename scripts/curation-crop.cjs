// 画作策展：裁剪调整工具。读取 Pictures/index.json + state.json 的 hiddenPaintings，
// 生成单文件 crop-tool.html——原图完整展示，橙色框标出应用当前实际可见范围（object-cover 几何），
// 拖框调整焦点，导出 focus-selection.json；--apply 把焦点写回 index.json、恢复/隐藏写回 state.json。
// 用法：node scripts/curation-crop.cjs            生成 crop-tool.html
//       node scripts/curation-crop.cjs --apply [file] [--dry-run]
// 主文档：docs/superpowers/plans/paintings-collection-draft-2026-09-28.md
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { writeManifest } = require('./vite-paintings-plugin.cjs')

const PROJECT_ROOT = path.resolve(__dirname, '..')
const STAGING_DIR = path.join(PROJECT_ROOT, 'Pictures-staging')
const PICTURES_DIR = path.join(PROJECT_ROOT, 'Pictures')
const STATE_JSON = path.join(os.homedir(), '.studyparlor', 'state.json')

const DEFAULT_FOCUS = '50% 50%'
const FOCUS_RE = /^\d{1,3}% \d{1,3}%$/

function loadLibrary(picturesDir = PICTURES_DIR, stateFile = STATE_JSON) {
  const index = JSON.parse(fs.readFileSync(path.join(picturesDir, 'index.json'), 'utf-8'))
  let hidden = []
  try {
    const state = JSON.parse(fs.readFileSync(stateFile, 'utf-8'))
    hidden = Array.isArray(state.hiddenPaintings) ? state.hiddenPaintings : []
  } catch { /* 无 state.json 时按无隐藏处理 */ }
  const hiddenSet = new Set(hidden)
  const entries = index.map(p => ({
    id: p.id,
    file: `../Pictures/${p.file}`,
    meta: [p.painter, p.title, p.year].filter(v => v != null && v !== '').join(' · '),
    focus: p.focus || DEFAULT_FOCUS,
    hidden: hiddenSet.has(p.id),
  }))
  // 已隐藏的排前面——它们多半因裁切问题被删，是本次调整的重点
  entries.sort((a, b) => Number(b.hidden) - Number(a.hidden))
  return entries
}

function renderCropHtml(entries) {
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<title>学者夜话 · 裁剪调整</title>
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
  /* 裁剪框：框外压暗，框内即应用实际可见范围 */
  #box { position: absolute; border: 2px solid #d97757; cursor: grab;
         box-shadow: 0 0 0 9999px rgba(10,6,4,0.62); touch-action: none; }
  #box.dragging { cursor: grabbing; border-color: #f09a80; }
  #box::after { content: ''; position: absolute; inset: 0; pointer-events: none;
         background:
           linear-gradient(90deg, transparent calc(33.3% - 0.5px), rgba(217,119,87,0.3) 33.3%, transparent calc(33.3% + 0.5px)),
           linear-gradient(90deg, transparent calc(66.6% - 0.5px), rgba(217,119,87,0.3) 66.6%, transparent calc(66.6% + 0.5px)),
           linear-gradient(0deg, transparent calc(33.3% - 0.5px), rgba(217,119,87,0.3) 33.3%, transparent calc(33.3% + 0.5px)),
           linear-gradient(0deg, transparent calc(66.6% - 0.5px), rgba(217,119,87,0.3) 66.6%, transparent calc(66.6% + 0.5px)); }
  #badge { position: absolute; top: 14px; left: 20px; font-size: 11.5px; letter-spacing: 0.2em;
           color: #a8917a; text-shadow: 0 1px 6px rgba(0,0,0,0.8); z-index: 2; }
  #badge .hidden-tag { color: #d98a76; }
  #caption { position: absolute; left: 20px; bottom: 14px; text-shadow: 0 1px 8px rgba(0,0,0,0.85); z-index: 2; }
  #meta { font-style: italic; letter-spacing: 0.06em; font-size: 14px; }
  #focus-readout { font-size: 12px; color: #c9b291; margin-top: 4px; }
  #focus-readout.changed { color: #d97757; }
  #controls { flex: none; display: flex; justify-content: center; align-items: center; gap: 18px; padding: 12px 0 16px; }
  .verdict { padding: 10px 34px; border-radius: 8px; border: 2px solid #6b5340; color: #e8d5b7;
             font: inherit; font-size: 15px; letter-spacing: 0.2em; cursor: pointer; background: rgba(26,18,14,0.7); }
  .verdict:hover { border-color: #d97757; }
  #hide-toggle.on { border-color: #d98a76; color: #d98a76; }
  kbd { border: 1px solid #4a382c; border-radius: 3px; padding: 0 5px; font-size: 11px; color: #a8917a; }
</style>
</head>
<body>
<div id="bar">
  <span id="progress"></span>
  <div id="track"><div id="fill"></div></div>
  <span id="tally"></span>
  <button class="ghost" id="plate-toggle" title="切换封面全屏 / 简报画框 21:9 的裁剪框">画框 21:9</button>
  <button class="ghost" id="export">导出调整</button>
</div>
<div id="stage">
  <span id="badge"></span>
  <div id="canvas"><img id="photo" alt="" draggable="false"><div id="box"></div></div>
  <div id="caption"><div id="meta"></div><div id="focus-readout"></div></div>
</div>
<div id="controls">
  <button class="verdict" id="prev">← 上一幅</button>
  <button class="ghost" id="reset">重置裁剪</button>
  <button class="ghost" id="hide-toggle"></button>
  <button class="verdict" id="next">下一幅 →</button>
</div>
<p style="flex:none;text-align:center;font-size:11px;color:#6b5340;padding-bottom:10px">
  拖拽橙框调整裁剪范围 &nbsp; <kbd>↑</kbd><kbd>↓</kbd> 微调 &nbsp; <kbd>←</kbd><kbd>→</kbd> 换画 &nbsp; <kbd>T</kbd> 画框 21:9
</p>
<script>
  const ENTRIES = ${JSON.stringify(entries)}
  const DEFAULT_FOCUS = '${DEFAULT_FOCUS}'
  const LS = 'painting-crop-v2-' + ENTRIES.length + '-' + (ENTRIES[0] ? ENTRIES[0].id : 'empty')
  let state = JSON.parse(localStorage.getItem(LS) || '{"idx":0,"focus":{},"unhide":[],"hide":[]}')
  const save = () => localStorage.setItem(LS, JSON.stringify(state))
  const photo = document.getElementById('photo')
  const box = document.getElementById('box')
  const canvas = document.getElementById('canvas')
  const stage = document.getElementById('stage')
  const cur = () => ENTRIES[state.idx]
  const focusOf = (e) => state.focus[e.id] || e.focus
  const parseFocus = (f) => f.split(' ').map(s => parseFloat(s))
  const fmt = (x, y) => Math.round(Math.max(0, Math.min(100, x))) + '% ' + Math.round(Math.max(0, Math.min(100, y))) + '%'
  let mode = 'cover' // cover=封面全屏（视口宽高比） | plate=简报画框 21:9

  // 几何：原图 contain 显示在 stage 中央；裁剪框 = object-cover 在该宽高比下实际可见的窗口
  function geo() {
    const iw = photo.naturalWidth, ih = photo.naturalHeight
    if (!iw) return null
    const sw = stage.clientWidth, sh = stage.clientHeight
    const s = Math.min(sw / iw, sh / ih)
    let cw, ch // 裁剪窗口（原图像素）
    if (mode === 'cover') {
      const k = Math.max(sw / iw, sh / ih)
      cw = sw / k; ch = sh / k
    } else {
      const W = 620, H = 620 * 9 / 21 // 应用里画框 max-w 620、aspect 21/9
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
    const [fx, fy] = parseFocus(focusOf(cur()))
    box.style.width = (g.cw * g.s) + 'px'
    box.style.height = (g.ch * g.s) + 'px'
    box.style.left = (g.rx * fx / 100 * g.s) + 'px'
    box.style.top = (g.ry * fy / 100 * g.s) + 'px'
  }

  function render() {
    const e = cur()
    const focus = focusOf(e)
    document.getElementById('progress').textContent = (state.idx + 1) + ' / ' + ENTRIES.length
    document.getElementById('fill').style.width = ((state.idx + 1) / ENTRIES.length * 100) + '%'
    document.getElementById('tally').textContent =
      '已调 ' + Object.keys(state.focus).length + ' · 恢复 ' + state.unhide.length + ' · 隐藏 ' + state.hide.length
    document.getElementById('meta').textContent = e.meta
    const readout = document.getElementById('focus-readout')
    readout.textContent = '焦点 ' + focus + (state.focus[e.id] ? '（已调整）' : '') + (mode === 'plate' ? ' · 画框 21:9' : '')
    readout.className = state.focus[e.id] ? 'changed' : ''
    const hiddenNow = effectiveHidden(e)
    document.getElementById('badge').innerHTML = (hiddenNow ? '<span class="hidden-tag">已隐藏</span> · ' : '') + '裁剪调整'
    const ht = document.getElementById('hide-toggle')
    ht.textContent = hiddenNow ? '恢复入库' : '移出库'
    ht.className = 'ghost' + (hiddenNow ? ' on' : '')
    photo.src = e.file
    layout()
    const next = ENTRIES[state.idx + 1]
    if (next) { const i = new Image(); i.src = next.file }
  }

  function effectiveHidden(e) {
    if (state.unhide.includes(e.id)) return false
    if (state.hide.includes(e.id)) return true
    return e.hidden
  }

  function setFocus(focusStr) {
    const e = cur()
    if (focusStr === e.focus) delete state.focus[e.id]
    else state.focus[e.id] = focusStr
    save(); render()
  }

  // 拖拽裁剪框 → 换算回 object-position 百分比
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
      if (state._pending) { setFocus(state._pending); delete state._pending }
    }
    box.addEventListener('pointermove', move)
    box.addEventListener('pointerup', up)
  })

  function nav(d) { state.idx = Math.max(0, Math.min(ENTRIES.length - 1, state.idx + d)); save(); render() }

  document.getElementById('prev').addEventListener('click', () => nav(-1))
  document.getElementById('next').addEventListener('click', () => nav(1))
  document.getElementById('reset').addEventListener('click', () => setFocus(cur().focus))
  document.getElementById('hide-toggle').addEventListener('click', () => {
    const e = cur()
    const hiddenNow = effectiveHidden(e)
    state.unhide = state.unhide.filter(id => id !== e.id)
    state.hide = state.hide.filter(id => id !== e.id)
    // 切换后与原始态一致 → 只需从列表移除（上面已做）；与原始态不同 → 记录目标态
    if (hiddenNow === e.hidden) {
      if (hiddenNow) state.unhide.push(e.id)
      else state.hide.push(e.id)
    }
    save(); render()
  })
  document.getElementById('plate-toggle').addEventListener('click', () => {
    mode = mode === 'cover' ? 'plate' : 'cover'
    layout(); render()
  })
  document.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowRight') nav(1)
    else if (e.key === 'ArrowLeft') nav(-1)
    else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      e.preventDefault()
      const [x, y] = parseFocus(focusOf(cur()))
      setFocus(fmt(x, y + (e.key === 'ArrowUp' ? -3 : 3)))
    } else if (e.key === 't' || e.key === 'T') {
      mode = mode === 'cover' ? 'plate' : 'cover'
      layout(); render()
    }
  })
  photo.addEventListener('load', layout)
  window.addEventListener('resize', layout)
  document.getElementById('export').addEventListener('click', () => {
    const out = { focus: state.focus, unhide: state.unhide, hide: state.hide }
    const blob = new Blob([JSON.stringify(out, null, 2)], { type: 'application/json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = 'focus-selection.json'
    a.click()
    URL.revokeObjectURL(a.href)
  })
  render()
</script>
</body>
</html>
`
}

function generateCropTool({ stagingDir = STAGING_DIR, picturesDir = PICTURES_DIR, stateFile = STATE_JSON } = {}) {
  const entries = loadLibrary(picturesDir, stateFile)
  const out = path.join(stagingDir, 'crop-tool.html')
  fs.writeFileSync(out, renderCropHtml(entries))
  const hiddenCount = entries.filter(e => e.hidden).length
  return { total: entries.length, hiddenCount, out }
}

// 应用调整：focus 写回 index.json，unhide/hide 写回 state.json 的 hiddenPaintings
function applyCropSelection({ stagingDir = STAGING_DIR, picturesDir = PICTURES_DIR, stateFile = STATE_JSON, file, dryRun = false, regenerateManifest = true } = {}) {
  const selectionFile = file || path.join(stagingDir, 'focus-selection.json')
  if (!fs.existsSync(selectionFile)) throw new Error(`focus-selection.json not found: ${selectionFile}`)
  const sel = JSON.parse(fs.readFileSync(selectionFile, 'utf-8'))
  const indexFile = path.join(picturesDir, 'index.json')
  const index = JSON.parse(fs.readFileSync(indexFile, 'utf-8'))

  const focusChanged = []
  const focusInvalid = []
  for (const [id, focus] of Object.entries(sel.focus || {})) {
    const entry = index.find(p => p.id === id)
    if (!entry || !FOCUS_RE.test(focus)) { focusInvalid.push(id); continue }
    if (focus === DEFAULT_FOCUS) delete entry.focus
    else entry.focus = focus
    focusChanged.push(id)
  }

  let hiddenNow = []
  let state = {}
  try { state = JSON.parse(fs.readFileSync(stateFile, 'utf-8')) } catch { /* 无 state.json 视为空 */ }
  hiddenNow = Array.isArray(state.hiddenPaintings) ? [...state.hiddenPaintings] : []
  const unhidden = []
  const hidden = []
  for (const id of sel.unhide || []) {
    if (hiddenNow.includes(id)) { hiddenNow = hiddenNow.filter(h => h !== id); unhidden.push(id) }
  }
  for (const id of sel.hide || []) {
    if (!hiddenNow.includes(id) && index.some(p => p.id === id)) { hiddenNow.push(id); hidden.push(id) }
  }

  if (!dryRun) {
    fs.writeFileSync(indexFile, JSON.stringify(index, null, 2) + '\n')
    if (unhidden.length || hidden.length || fs.existsSync(stateFile)) {
      state.hiddenPaintings = hiddenNow
      fs.writeFileSync(stateFile, JSON.stringify(state, null, 2) + '\n')
    }
    if (regenerateManifest && focusChanged.length) {
      const count = writeManifest()
      console.log(`[crop] manifest regenerated: ${count} paintings`)
    }
  }

  return { focusChanged, focusInvalid, unhidden, hidden }
}

if (require.main === module) {
  if (process.argv.includes('--apply')) {
    const i = process.argv.indexOf('--apply')
    const file = process.argv[i + 1] && !process.argv[i + 1].startsWith('--') ? process.argv[i + 1] : undefined
    const dryRun = process.argv.includes('--dry-run')
    const r = applyCropSelection({ file, dryRun })
    console.log(`[crop] ${dryRun ? '(dry-run) ' : ''}focus ${r.focusChanged.length}, unhide ${r.unhidden.length}, hide ${r.hidden.length}`)
    if (r.focusInvalid.length) console.log(`[crop] WARNING invalid/unknown: ${r.focusInvalid.join(', ')}`)
  } else {
    const { total, hiddenCount, out } = generateCropTool()
    console.log(`[crop] tool generated: ${total} paintings (${hiddenCount} hidden) → ${out}`)
  }
}

module.exports = { loadLibrary, renderCropHtml, generateCropTool, applyCropSelection, DEFAULT_FOCUS }
