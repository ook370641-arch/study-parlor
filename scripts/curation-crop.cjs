// 画作策展：裁剪调整工具。读取 Pictures/index.json + state.json 的 hiddenPaintings，
// 生成单文件 crop-tool.html——全屏逐张展示当前裁剪效果（与应用 object-cover 一致），
// 拖拽调整焦点，导出 focus-selection.json；--apply 把焦点写回 index.json、恢复/隐藏写回 state.json。
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
  #photo { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover;
           cursor: grab; user-select: none; -webkit-user-drag: none; }
  #photo.dragging { cursor: grabbing; }
  #stage.plate #photo { position: static; width: 100%; height: 100%;
           filter: brightness(1.1) saturate(1.06); }
  #stage.plate { display: flex; align-items: center; justify-content: center; background: #241a14; }
  #plate-frame { display: none; width: min(620px, 90%); aspect-ratio: 21 / 9; overflow: hidden;
           padding: 10px; background: #1c130d; border: 1px solid rgba(232,213,183,0.15);
           box-shadow: 0 18px 50px rgba(0,0,0,0.5); }
  #stage.plate #plate-frame { display: block; }
  #stage.plate > #photo { display: none; }
  #plate-frame img { width: 100%; height: 100%; object-fit: cover;
           filter: brightness(1.1) saturate(1.06); cursor: grab; user-select: none; -webkit-user-drag: none; }
  #crosshair { position: absolute; width: 22px; height: 22px; margin: -11px 0 0 -11px; pointer-events: none;
           border: 1.5px solid rgba(217,119,87,0.9); border-radius: 50%; display: none; }
  #stage.plate #crosshair { display: none !important; }
  #badge { position: absolute; top: 14px; left: 20px; font-size: 11.5px; letter-spacing: 0.2em;
           color: #a8917a; text-shadow: 0 1px 6px rgba(0,0,0,0.8); }
  #badge .hidden-tag { color: #d98a76; }
  #caption { position: absolute; left: 20px; bottom: 14px; text-shadow: 0 1px 8px rgba(0,0,0,0.85); }
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
  <button class="ghost" id="plate-toggle" title="切换简报画框 21:9 预览">画框预览</button>
  <button class="ghost" id="export">导出调整</button>
</div>
<div id="stage">
  <span id="badge"></span>
  <img id="photo" alt="" draggable="false">
  <div id="plate-frame"><img id="plate-photo" alt="" draggable="false"></div>
  <div id="crosshair"></div>
  <div id="caption"><div id="meta"></div><div id="focus-readout"></div></div>
</div>
<div id="controls">
  <button class="verdict" id="prev">← 上一幅</button>
  <button class="ghost" id="reset">重置裁剪</button>
  <button class="ghost" id="hide-toggle"></button>
  <button class="verdict" id="next">下一幅 →</button>
</div>
<p style="flex:none;text-align:center;font-size:11px;color:#6b5340;padding-bottom:10px">
  拖拽画面调整焦点 &nbsp; <kbd>↑</kbd><kbd>↓</kbd> 微调 &nbsp; <kbd>←</kbd><kbd>→</kbd> 换画 &nbsp; <kbd>T</kbd> 画框预览
</p>
<script>
  const ENTRIES = ${JSON.stringify(entries)}
  const DEFAULT_FOCUS = '${DEFAULT_FOCUS}'
  const LS = 'painting-crop-' + ENTRIES.length + '-' + (ENTRIES[0] ? ENTRIES[0].id : 'empty')
  let state = JSON.parse(localStorage.getItem(LS) || '{"idx":0,"focus":{},"unhide":[],"hide":[]}')
  const save = () => localStorage.setItem(LS, JSON.stringify(state))
  const photo = document.getElementById('photo')
  const platePhoto = document.getElementById('plate-photo')
  const stage = document.getElementById('stage')
  const crosshair = document.getElementById('crosshair')
  const cur = () => ENTRIES[state.idx]
  const focusOf = (e) => state.focus[e.id] || e.focus
  const parseFocus = (f) => f.split(' ').map(s => parseFloat(s))
  const fmt = (x, y) => Math.round(Math.max(0, Math.min(100, x))) + '% ' + Math.round(Math.max(0, Math.min(100, y))) + '%'

  function render() {
    const e = cur()
    const focus = focusOf(e)
    document.getElementById('progress').textContent = (state.idx + 1) + ' / ' + ENTRIES.length
    document.getElementById('fill').style.width = ((state.idx + 1) / ENTRIES.length * 100) + '%'
    const changed = Object.keys(state.focus).length
    document.getElementById('tally').textContent =
      '已调 ' + changed + ' · 恢复 ' + state.unhide.length + ' · 隐藏 ' + state.hide.length
    document.getElementById('meta').textContent = e.meta
    const readout = document.getElementById('focus-readout')
    readout.textContent = '焦点 ' + focus + (state.focus[e.id] ? '（已调整）' : '')
    readout.className = state.focus[e.id] ? 'changed' : ''
    const hiddenNow = effectiveHidden(e)
    document.getElementById('badge').innerHTML = (hiddenNow ? '<span class="hidden-tag">已隐藏</span> · ' : '') + '裁剪调整'
    const ht = document.getElementById('hide-toggle')
    ht.textContent = hiddenNow ? '恢复入库' : '移出库'
    ht.className = 'ghost' + (hiddenNow ? ' on' : '')
    photo.style.objectPosition = focus
    photo.src = e.file
    platePhoto.style.objectPosition = focus
    platePhoto.src = e.file
    positionCrosshair()
    const next = ENTRIES[state.idx + 1]
    if (next) { const i = new Image(); i.src = next.file }
  }

  function effectiveHidden(e) {
    if (state.unhide.includes(e.id)) return false
    if (state.hide.includes(e.id)) return true
    return e.hidden
  }

  // 十字准星放在焦点实际对应的屏幕位置（cover 裁切几何）
  function positionCrosshair() {
    if (!photo.naturalWidth || stage.classList.contains('plate')) { crosshair.style.display = 'none'; return }
    const vw = stage.clientWidth, vh = stage.clientHeight
    const iw = photo.naturalWidth, ih = photo.naturalHeight
    const scale = Math.max(vw / iw, vh / ih)
    const dispW = iw * scale, dispH = ih * scale
    const [fx, fy] = parseFocus(focusOf(cur()))
    // object-position p%：图上 p% 的点对齐到视口 p% 的点
    const x = (dispW - vw) * (fx / 100) * -1 + dispW * (fx / 100)
    const y = (dispH - vh) * (fy / 100) * -1 + dispH * (fy / 100)
    crosshair.style.display = 'block'
    crosshair.style.left = x + 'px'
    crosshair.style.top = y + 'px'
  }

  function setFocus(focusStr) {
    const e = cur()
    if (focusStr === e.focus) delete state.focus[e.id]
    else state.focus[e.id] = focusStr
    save(); render()
  }

  // 拖拽 = 平移可视窗口：像素位移按 cover 缩放换算成 object-position 百分比
  function bindDrag(img, box) {
    img.addEventListener('pointerdown', (ev) => {
      ev.preventDefault()
      img.classList.add('dragging')
      img.setPointerCapture(ev.pointerId)
      const startX = ev.clientX, startY = ev.clientY
      const [sx, sy] = parseFocus(focusOf(cur()))
      const iw = img.naturalWidth, ih = img.naturalHeight
      if (!iw) return
      const vw = box.clientWidth, vh = box.clientHeight
      const scale = Math.max(vw / iw, vh / ih)
      const rangeX = Math.max(0, iw * scale - vw)
      const rangeY = Math.max(0, ih * scale - vh)
      const move = (e2) => {
        const nx = rangeX ? sx - (e2.clientX - startX) / rangeX * 100 : sx
        const ny = rangeY ? sy - (e2.clientY - startY) / rangeY * 100 : sy
        const f = fmt(nx, ny)
        state.focus[cur().id] = f === cur().focus ? undefined : f
        if (state.focus[cur().id] === undefined) delete state.focus[cur().id]
        photo.style.objectPosition = f
        platePhoto.style.objectPosition = f
        document.getElementById('focus-readout').textContent = '焦点 ' + f
        positionCrosshair()
      }
      const up = () => {
        img.classList.remove('dragging')
        img.removeEventListener('pointermove', move)
        img.removeEventListener('pointerup', up)
        save(); render()
      }
      img.addEventListener('pointermove', move)
      img.addEventListener('pointerup', up)
    })
  }
  bindDrag(photo, stage)
  bindDrag(platePhoto, document.getElementById('plate-frame'))

  function nav(d) { state.idx = Math.max(0, Math.min(ENTRIES.length - 1, state.idx + d)); save(); render() }

  document.getElementById('prev').addEventListener('click', () => nav(-1))
  document.getElementById('next').addEventListener('click', () => nav(1))
  document.getElementById('reset').addEventListener('click', () => setFocus(cur().focus))
  document.getElementById('hide-toggle').addEventListener('click', () => {
    const e = cur()
    const hiddenNow = effectiveHidden(e)
    // 目标态与原始态一致 → 从两个列表里都移除；否则写入对应列表
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
    stage.classList.toggle('plate')
    positionCrosshair()
  })
  document.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowRight') nav(1)
    else if (e.key === 'ArrowLeft') nav(-1)
    else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      e.preventDefault()
      const [x, y] = parseFocus(focusOf(cur()))
      setFocus(fmt(x, y + (e.key === 'ArrowUp' ? -3 : 3)))
    } else if (e.key === 't' || e.key === 'T') {
      stage.classList.toggle('plate'); positionCrosshair()
    }
  })
  photo.addEventListener('load', positionCrosshair)
  window.addEventListener('resize', positionCrosshair)
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
