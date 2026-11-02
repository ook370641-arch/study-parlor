import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {
  noteCoverDataUrl,
  parseNoteCoverDesigns,
  renderNoteCoverSvg,
  saveNoteCover,
  validateNoteCoverDesign,
} from '@electron/lib/note-covers'
import { generateNoteCoverCandidates } from '@electron/lib/llm-tasks'
import { createNoteFile, scanNotes, updateNoteMeta } from '@electron/lib/notes'
import type { NoteCoverDesign } from '@shared/index'

function makeDesign(index = 0): NoteCoverDesign {
  return {
    concept: `内容符号 ${index}`,
    palette: { background: '#211a18', ink: '#e8d5b7', accent: '#d97757', secondary: '#6f8892' },
    background: 'linear',
    grain: 0.06,
    elements: [
      { type: 'path', d: 'M 40 80 C 120 20 180 220 280 120', fill: 'none', stroke: 'ink', strokeWidth: 8 },
      { type: 'circle', cx: 220, cy: 240, r: 46, fill: 'accent', opacity: 0.7 },
      { type: 'polyline', points: '80,320 160,260 260,360', fill: 'none', stroke: 'secondary' },
    ],
  }
}

const validRaw = () => JSON.stringify({ designs: [makeDesign(0), makeDesign(1), makeDesign(2)] })

describe('笔记封面设计协议', () => {
  it('严格解析三个候选并接受代码围栏', () => {
    expect(parseNoteCoverDesigns(validRaw())).toHaveLength(3)
    expect(parseNoteCoverDesigns(`\`\`\`json\n${validRaw()}\n\`\`\``)).toHaveLength(3)
    expect(() => parseNoteCoverDesigns(JSON.stringify({ designs: [makeDesign()] }))).toThrow()
  })

  it('拒绝不安全或无效的图元和颜色', () => {
    const withDesign = (patch: object) => JSON.stringify({ designs: [{ ...makeDesign(), ...patch }, makeDesign(1), makeDesign(2)] })
    expect(() => parseNoteCoverDesigns(withDesign({ elements: makeDesign().elements.slice(0, 2) }))).toThrow()
    expect(() => parseNoteCoverDesigns(withDesign({ palette: { ...makeDesign().palette, ink: 'url(https://x)' } }))).toThrow()
    expect(() => parseNoteCoverDesigns(withDesign({ elements: [{ ...makeDesign().elements[0], d: 'M 0 0 S 1 1 2 2' }, ...makeDesign().elements.slice(1)] }))).toThrow()
    expect(() => parseNoteCoverDesigns(withDesign({ elements: [{ ...makeDesign().elements[0], fill: 'url(#external)' }, ...makeDesign().elements.slice(1)] }))).toThrow()
    expect(() => parseNoteCoverDesigns(withDesign({ elements: [{ type: 'polygon', points: '0,0 1,1\" onload=\"alert(1)' }, ...makeDesign().elements.slice(1)] }))).toThrow()
    expect(() => parseNoteCoverDesigns(withDesign({ elements: [{ type: 'image', href: 'https://x' }, ...makeDesign().elements.slice(1)] }))).toThrow()
  })

  it('确定性渲染安全 SVG，并截断越界样式数值', () => {
    const design = makeDesign()
    design.grain = 9
    design.elements[0] = { ...design.elements[0], strokeWidth: 80, opacity: -2, transform: 'rotate(30)' } as NoteCoverDesign['elements'][number]
    const validated = validateNoteCoverDesign(design)
    const svg = renderNoteCoverSvg(validated)
    expect(validated.grain).toBe(0.12)
    expect(svg).toContain('viewBox="0 0 600 800"')
    expect(svg).toContain('stroke-width="30"')
    expect(svg).toContain('opacity="0.05"')
    expect(svg).toContain('feTurbulence')
    expect(svg).not.toContain('<text')
    expect(svg).not.toContain('transform=')
    expect(svg).toBe(renderNoteCoverSvg(validated))
  })
})

describe('笔记封面落盘与生成', () => {
  let lib: string

  beforeEach(() => {
    lib = fs.mkdtempSync(path.join(os.tmpdir(), 'note-covers-test-'))
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
    fs.rmSync(lib, { recursive: true, force: true })
  })

  it('选中后写入安全封面，重新生成成功后清理旧文件', () => {
    const note = createNoteFile(lib, { title: '河流', url: '', body: '正文保持不变' })
    const first = saveNoteCover(lib, note.path, makeDesign(1))
    expect(first.coverUrl).toMatch(/^data:image\/svg\+xml;base64,/)
    expect(scanNotes(lib)[0].coverUrl).toBe(first.coverUrl)
    expect(fs.readFileSync(path.join(lib, note.path), 'utf8')).toContain('正文保持不变')
    const second = saveNoteCover(lib, note.path, makeDesign(2))
    expect(second.cover).not.toBe(first.cover)
    expect(fs.existsSync(path.join(lib, first.cover))).toBe(false)
    expect(scanNotes(lib)[0].meta.cover).toBe(second.cover)
  })

  it('元数据更新失败时删除新文件并保留旧封面', () => {
    const note = createNoteFile(lib, { title: '回滚', url: '', body: '旧正文' })
    const first = saveNoteCover(lib, note.path, makeDesign(1))
    const noteAbs = path.resolve(lib, note.path)
    const rename = fs.renameSync
    vi.spyOn(fs, 'renameSync').mockImplementation((from, to) => {
      if (path.resolve(String(to)) === noteAbs) throw new Error('元数据写入失败')
      return rename(from, to)
    })
    expect(() => saveNoteCover(lib, note.path, makeDesign(2))).toThrow('元数据写入失败')
    expect(scanNotes(lib)[0].meta.cover).toBe(first.cover)
    expect(fs.existsSync(path.join(lib, first.cover))).toBe(true)
    expect(fs.readdirSync(path.join(lib, 'notes', 'covers'))).toEqual([path.basename(first.cover)])
  })

  it('只读取 notes/covers 内的 SVG', () => {
    const note = createNoteFile(lib, { title: '安全', url: '' })
    fs.mkdirSync(path.join(lib, 'notes', 'covers'), { recursive: true })
    fs.writeFileSync(path.join(lib, 'notes', 'covers', 'safe.svg'), '<svg xmlns="http://www.w3.org/2000/svg"/>')
    fs.writeFileSync(path.join(lib, 'notes', 'outside.svg'), '<svg/>')
    updateNoteMeta(lib, note.path, { cover: 'notes/covers/safe.svg' })
    expect(scanNotes(lib)[0].coverUrl).toMatch(/^data:image\/svg\+xml;base64,/)
    expect(noteCoverDataUrl(lib, 'notes/outside.svg')).toBeNull()
    updateNoteMeta(lib, note.path, { cover: 'notes/outside.svg' })
    expect(scanNotes(lib)[0].coverUrl).toBeUndefined()
  })

  it('生成只读取正文前 12000 字符，不落盘候选', async () => {
    const note = createNoteFile(lib, { title: '深度工作', url: '', body: `${'正'.repeat(12000)}TRIMMED` })
    updateNoteMeta(lib, note.path, { summary: '注意力机制' })
    const fetchSpy = vi.fn(async () => ({
      ok: true,
      json: async () => ({ choices: [{ message: { content: validRaw() } }] }),
    }))
    vi.stubGlobal('fetch', fetchSpy)
    const candidates = await generateNoteCoverCandidates({ apiKey: 'k', baseUrl: 'https://x', model: 'm', libraryPath: lib }, note.path)
    expect(candidates).toHaveLength(3)
    expect(candidates.every(candidate => candidate.svgDataUrl.startsWith('data:image/svg+xml;base64,'))).toBe(true)
    const request = JSON.parse((fetchSpy.mock.calls[0][1] as RequestInit).body as string)
    expect(request.messages[0].content).toContain('新标识符号')
    expect(request.messages[1].content).toContain('深度工作')
    expect(request.messages[1].content).toContain('注意力机制')
    expect(request.messages[1].content).not.toContain('TRIMMED')
    expect(fs.existsSync(path.join(lib, 'notes', 'covers'))).toBe(false)
  })
})
