import { describe, expect, it, beforeEach, afterEach } from 'vitest'
import { createRequire } from 'node:module'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'

const require = createRequire(import.meta.url)
const merge = require('../scripts/curation-merge.cjs')
const gallery = require('../scripts/curation-gallery.cjs')
const crop = require('../scripts/curation-crop.cjs')

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'sp-curation-'))

// 搭一个最小 staging + pictures 场景：
// staging: 3 个候选（newman 两幅、van-gogh 一幅缺文件）
// pictures: 已有 171-xxx.jpg + index.json 含 rothko-2
function setup() {
  const dir = tmp()
  const staging = path.join(dir, 'Pictures-staging')
  const pictures = path.join(dir, 'Pictures')
  fs.mkdirSync(staging, { recursive: true })
  fs.mkdirSync(pictures, { recursive: true })

  const candidates = [
    { id: 'cand-newman-a', painter: 'Barnett Newman', title: 'The Wild', year: 1950, category: 'color-field', file: 'cand-newman-a.jpg', line: 'peers', focus: '50% 30%' },
    { id: 'cand-newman-b', painter: 'Barnett Newman', title: 'Onement I', year: 1948, category: 'color-field', file: 'cand-newman-b.jpg', line: 'peers' },
    { id: 'cand-vangogh-a', painter: 'Vincent van Gogh', title: 'The Starry Night', year: 1889, category: 'post-impressionism', file: 'cand-vangogh-a.jpg', line: 'classics' },
  ]
  fs.writeFileSync(path.join(staging, 'candidates.json'), JSON.stringify(candidates, null, 2))
  fs.writeFileSync(path.join(staging, 'cand-newman-a.jpg'), 'fake-a')
  fs.writeFileSync(path.join(staging, 'cand-newman-b.jpg'), 'fake-b')
  // cand-vangogh-a.jpg 故意不建：缺文件场景

  fs.writeFileSync(path.join(pictures, '171-old.jpg'), 'old')
  fs.writeFileSync(path.join(pictures, 'index.json'), JSON.stringify([
    { id: 'rothko-2', painter: 'Mark Rothko', title: 'Old', file: '171-old.jpg', category: 'color-field' },
  ], null, 2))

  return { dir, staging, pictures, candidates }
}

describe('curation-merge helpers', () => {
  it('slugify handles accents, case, specials, empty', () => {
    expect(merge.slugify('The Starry Night')).toBe('the-starry-night')
    expect(merge.slugify('Café Terrace at Night')).toBe('cafe-terrace-at-night')
    expect(merge.slugify('  ')).toBe('untitled')
    expect(merge.slugify('No. 61 (Rust and Blue)')).toBe('no-61-rust-and-blue')
  })

  it('painterKey uses surname; single names stay whole', () => {
    expect(merge.painterKey('Mark Rothko')).toBe('rothko')
    expect(merge.painterKey('Vincent van Gogh')).toBe('gogh')
    expect(merge.painterKey('庄子')).toBe('庄子')
  })
})

describe('curation-merge mergeSelection', () => {
  let dir: string
  afterEach(() => fs.rmSync(dir, { recursive: true, force: true }))

  it('moves selected into Pictures with continued numbering and ids, rejects the rest', () => {
    const s = setup(); dir = s.dir
    fs.writeFileSync(path.join(s.staging, 'selection.json'), JSON.stringify({ selected: ['cand-newman-a', 'cand-vangogh-a'] }))

    const { added, rejected, skipped } = merge.mergeSelection({ stagingDir: s.staging, picturesDir: s.pictures, regenerateManifest: false })

    // 缺文件的选中项进 skipped，不入库
    expect(skipped).toEqual(['cand-vangogh-a'])
    expect(added).toHaveLength(1)
    expect(added[0].id).toBe('newman-1')
    expect(added[0].file).toBe('172-the-wild.jpg')
    expect(fs.existsSync(path.join(s.pictures, '172-the-wild.jpg'))).toBe(true)

    // 落选移入 rejected/
    expect(rejected).toEqual(['cand-newman-b'])
    expect(fs.existsSync(path.join(s.staging, 'rejected', 'cand-newman-b.jpg'))).toBe(true)
    expect(fs.existsSync(path.join(s.staging, 'cand-newman-b.jpg'))).toBe(false)

    // index.json 追加
    const index = JSON.parse(fs.readFileSync(path.join(s.pictures, 'index.json'), 'utf8'))
    expect(index).toHaveLength(2)
    expect(index[1]).toMatchObject({ id: 'newman-1', painter: 'Barnett Newman', title: 'The Wild', file: '172-the-wild.jpg', category: 'color-field', year: 1950, focus: '50% 30%' })

    // candidates.json 只剩缺文件的 vangogh
    const remaining = JSON.parse(fs.readFileSync(path.join(s.staging, 'candidates.json'), 'utf8'))
    expect(remaining.map((c: { id: string }) => c.id)).toEqual(['cand-vangogh-a'])
  })

  it('continues painter id numbering from existing index entries', () => {
    const s = setup(); dir = s.dir
    const index = JSON.parse(fs.readFileSync(path.join(s.pictures, 'index.json'), 'utf8'))
    index.push({ id: 'newman-7', painter: 'Barnett Newman', title: 'X', file: '171-old.jpg' })
    fs.writeFileSync(path.join(s.pictures, 'index.json'), JSON.stringify(index))
    fs.writeFileSync(path.join(s.staging, 'selection.json'), JSON.stringify({ selected: ['cand-newman-a'] }))

    const { added } = merge.mergeSelection({ stagingDir: s.staging, picturesDir: s.pictures, regenerateManifest: false })
    expect(added[0].id).toBe('newman-8')
  })

  it('dry-run reports without touching the filesystem', () => {
    const s = setup(); dir = s.dir
    fs.writeFileSync(path.join(s.staging, 'selection.json'), JSON.stringify({ selected: ['cand-newman-a'] }))

    const { added, rejected } = merge.mergeSelection({ stagingDir: s.staging, picturesDir: s.pictures, dryRun: true, regenerateManifest: false })
    expect(added).toHaveLength(1)
    expect(rejected).toHaveLength(1)
    expect(fs.existsSync(path.join(s.staging, 'cand-newman-a.jpg'))).toBe(true) // 未移动
    const index = JSON.parse(fs.readFileSync(path.join(s.pictures, 'index.json'), 'utf8'))
    expect(index).toHaveLength(1) // 未写入
  })

  it('throws when selection.json is absent', () => {
    const s = setup(); dir = s.dir
    expect(() => merge.mergeSelection({ stagingDir: s.staging, picturesDir: s.pictures, regenerateManifest: false })).toThrow(/selection\.json/)
  })
})

describe('curation-gallery', () => {
  let dir: string
  afterEach(() => fs.rmSync(dir, { recursive: true, force: true }))

  it('renders cards grouped by line and painter, flags missing files', () => {
    const s = setup(); dir = s.dir
    const candidates = gallery.withFileStatus(gallery.loadCandidates(s.staging), s.staging)
    const html = gallery.renderGalleryHtml(candidates)

    expect(html).toContain('data-id="cand-newman-a"')
    expect(html).toContain('Barnett Newman · The Wild · 1950')
    expect(html).toContain('同类画家') // line 分组标题
    expect(html).toContain('经典画作')
    // 缺文件的候选有缺失占位
    expect(html).toContain('is-missing')
  })

  it('generateGallery writes gallery.html and reports missing ids', () => {
    const s = setup(); dir = s.dir
    const { total, missing, out } = gallery.generateGallery(s.staging)
    expect(total).toBe(3)
    expect(missing).toEqual(['cand-vangogh-a'])
    expect(fs.existsSync(out)).toBe(true)
  })

  it('renderSwipeHtml embeds candidates and verdict controls', () => {
    const s = setup(); dir = s.dir
    const candidates = gallery.withFileStatus(gallery.loadCandidates(s.staging), s.staging)
    const html = gallery.renderSwipeHtml(candidates)
    expect(html).toContain('cand-newman-a') // 内嵌候选数据
    expect(html).toContain('Barnett Newman · The Wild · 1950')
    expect(html).toContain('id="yes"') // ✓选 / ✗弃 双按钮
    expect(html).toContain('id="no"')
    expect(html).toContain('painting-curation-swipe-') // localStorage 判定记录（key 随批次变化）
    expect(html).toContain('selection.json') // 导出
  })

  it('renderPickHtml embeds crop box and exports selection with focus', () => {
    const s = setup(); dir = s.dir
    const candidates = gallery.withFileStatus(gallery.loadCandidates(s.staging), s.staging)
    const html = gallery.renderPickHtml(candidates)
    expect(html).toContain('cand-newman-a')
    expect(html).toContain('id="yes"')
    expect(html).toContain('id="no"')
    expect(html).toContain('id="box"') // 可拖拽裁剪框
    expect(html).toContain('pointerdown')
    expect(html).toContain('selection.json')
    expect(html).toContain('focus') // 导出带焦点
  })

  it('generateGallery writes gallery.html, gallery-swipe.html and gallery-pick.html', () => {
    const s = setup(); dir = s.dir
    const { swipeOut, pickOut } = gallery.generateGallery(s.staging)
    expect(fs.existsSync(swipeOut)).toBe(true)
    expect(fs.existsSync(pickOut)).toBe(true)
  })

  it('mergeSelection applies focus from selection.json over candidate focus', () => {
    const s = setup(); dir = s.dir
    // cand-newman-a 自带 focus 50% 30%，selection 里覆盖为 50% 70%
    fs.writeFileSync(path.join(s.staging, 'selection.json'), JSON.stringify({
      selected: ['cand-newman-a'], focus: { 'cand-newman-a': '50% 70%' },
    }))
    merge.mergeSelection({ stagingDir: s.staging, picturesDir: s.pictures, regenerateManifest: false })
    const index = JSON.parse(fs.readFileSync(path.join(s.pictures, 'index.json'), 'utf8'))
    expect(index[1].focus).toBe('50% 70%')
  })

  it('generateGallery also writes gallery-swipe.html', () => {
    const s = setup(); dir = s.dir
    const { swipeOut } = gallery.generateGallery(s.staging)
    expect(fs.existsSync(swipeOut)).toBe(true)
  })
})

describe('curation-crop', () => {
  let dir: string
  afterEach(() => fs.rmSync(dir, { recursive: true, force: true }))

  // pictures: 两幅（rothko-2 无 focus、gogh-1 带 focus）；state: rothko-2 已隐藏
  function setupCrop() {
    const dir = tmp()
    const staging = path.join(dir, 'Pictures-staging')
    const pictures = path.join(dir, 'Pictures')
    fs.mkdirSync(staging, { recursive: true })
    fs.mkdirSync(pictures, { recursive: true })
    fs.writeFileSync(path.join(pictures, 'index.json'), JSON.stringify([
      { id: 'rothko-2', painter: 'Mark Rothko', title: 'Old', file: '171-old.jpg' },
      { id: 'gogh-1', painter: 'Vincent van Gogh', title: 'Night', file: '172-night.jpg', focus: '50% 40%' },
    ], null, 2))
    const stateFile = path.join(dir, 'state.json')
    fs.writeFileSync(stateFile, JSON.stringify({ hiddenPaintings: ['rothko-2'], other: 'keep' }))
    return { dir, staging, pictures, stateFile }
  }

  it('loadLibrary defaults focus, flags hidden, sorts hidden first', () => {
    const s = setupCrop(); dir = s.dir
    const entries = crop.loadLibrary(s.pictures, s.stateFile)
    expect(entries.map((e: { id: string }) => e.id)).toEqual(['rothko-2', 'gogh-1'])
    expect(entries[0].hidden).toBe(true)
    expect(entries[0].focus).toBe('50% 50%')
    expect(entries[1].focus).toBe('50% 40%')
    expect(entries[0].file).toBe('../Pictures/171-old.jpg')
  })

  it('renderCropHtml embeds entries, drag binding and export', () => {
    const s = setupCrop(); dir = s.dir
    const html = crop.renderCropHtml(crop.loadLibrary(s.pictures, s.stateFile))
    expect(html).toContain('rothko-2')
    expect(html).toContain('Mark Rothko · Old')
    expect(html).toContain('pointerdown') // 拖拽调焦
    expect(html).toContain('focus-selection.json') // 导出
    expect(html).toContain('恢复入库') // 隐藏/恢复切换
  })

  it('applyCropSelection writes focus back, unhides/hides, preserves other state', () => {
    const s = setupCrop(); dir = s.dir
    fs.writeFileSync(path.join(s.staging, 'focus-selection.json'), JSON.stringify({
      focus: { 'rothko-2': '50% 30%', 'gogh-1': '50% 50%', 'ghost-1': '10% 10%' },
      unhide: ['rothko-2'],
      hide: [],
    }))
    const r = crop.applyCropSelection({ stagingDir: s.staging, picturesDir: s.pictures, stateFile: s.stateFile, regenerateManifest: false })

    expect(r.focusChanged.sort()).toEqual(['gogh-1', 'rothko-2'])
    expect(r.focusInvalid).toEqual(['ghost-1']) // 未知 id 跳过
    expect(r.unhidden).toEqual(['rothko-2'])

    const index = JSON.parse(fs.readFileSync(path.join(s.pictures, 'index.json'), 'utf8'))
    expect(index[0].focus).toBe('50% 30%')
    expect(index[1].focus).toBeUndefined() // 回到默认居中 → 移除字段

    const state = JSON.parse(fs.readFileSync(s.stateFile, 'utf8'))
    expect(state.hiddenPaintings).toEqual([])
    expect(state.other).toBe('keep') // 其他字段不动
  })

  it('applyCropSelection dry-run reports without touching files', () => {
    const s = setupCrop(); dir = s.dir
    fs.writeFileSync(path.join(s.staging, 'focus-selection.json'), JSON.stringify({
      focus: { 'rothko-2': '50% 30%' }, unhide: [], hide: ['gogh-1'],
    }))
    const r = crop.applyCropSelection({ stagingDir: s.staging, picturesDir: s.pictures, stateFile: s.stateFile, dryRun: true, regenerateManifest: false })
    expect(r.focusChanged).toEqual(['rothko-2'])
    expect(r.hidden).toEqual(['gogh-1'])
    const index = JSON.parse(fs.readFileSync(path.join(s.pictures, 'index.json'), 'utf8'))
    expect(index[0].focus).toBeUndefined() // 未写入
    const state = JSON.parse(fs.readFileSync(s.stateFile, 'utf8'))
    expect(state.hiddenPaintings).toEqual(['rothko-2']) // 未写入
  })

  it('applyCropSelection rejects malformed focus values', () => {
    const s = setupCrop(); dir = s.dir
    fs.writeFileSync(path.join(s.staging, 'focus-selection.json'), JSON.stringify({
      focus: { 'rothko-2': 'top left' }, unhide: [], hide: [],
    }))
    const r = crop.applyCropSelection({ stagingDir: s.staging, picturesDir: s.pictures, stateFile: s.stateFile, regenerateManifest: false })
    expect(r.focusChanged).toEqual([])
    expect(r.focusInvalid).toEqual(['rothko-2'])
  })
})
