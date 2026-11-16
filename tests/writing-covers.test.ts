import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import matter from 'gray-matter'
import type { NoteCoverDesign } from '@shared/index'
import { deleteWritingCovers, saveWritingCover, writingCoverDataUrl } from '@electron/lib/writing-covers'
import { generateWritingCoverCandidates } from '@electron/lib/llm-tasks'
import { attachWritingWallMetadata } from '@electron/lib/writing-wall-metadata'

function makeDesign(index = 0): NoteCoverDesign {
  return {
    concept: `文章符号 ${index}`,
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

function createWriting(lib: string, rel = 'writing/研究/a.md'): string {
  const absolutePath = path.join(lib, rel)
  fs.mkdirSync(path.dirname(absolutePath), { recursive: true })
  fs.writeFileSync(absolutePath, matter.stringify('正文保持不变', { title: '河流', custom: '保留未知字段' }))
  return absolutePath
}

describe('写作封面存储', () => {
  let lib: string

  beforeEach(() => {
    lib = fs.mkdtempSync(path.join(os.tmpdir(), 'writing-covers-test-'))
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
    vi.unstubAllEnvs()
    fs.rmSync(lib, { recursive: true, force: true })
  })

  it('Markdown 封面保留正文与未知 frontmatter，其他格式仍被拒绝', () => {
    const absolutePath = createWriting(lib)
    expect(() => saveWritingCover(lib, 'notes/a.md', makeDesign())).toThrow()
    expect(() => saveWritingCover(lib, 'writing/a.pdf', makeDesign())).toThrow()

    const saved = saveWritingCover(lib, 'writing/研究/a.md', makeDesign(1))
    expect(saved.cover).toMatch(/^writing\/\.covers\/[a-f0-9]{24}\.svg$/)
    expect(saved.coverUrl).toMatch(/^data:image\/svg\+xml;base64,/)
    expect(writingCoverDataUrl(lib, saved.cover)).toBe(saved.coverUrl)
    expect(writingCoverDataUrl(lib, 'writing/outside.svg')).toBeNull()

    const document = matter(fs.readFileSync(absolutePath, 'utf8'))
    expect(document.content).toContain('正文保持不变')
    expect(document.data).toMatchObject({ title: '河流', custom: '保留未知字段', cover: saved.cover })
  })

  it('同名文章使用不同路径哈希，替换封面后清理旧文件', () => {
    createWriting(lib, 'writing/一组/a.md')
    createWriting(lib, 'writing/二组/a.md')
    const first = saveWritingCover(lib, 'writing/一组/a.md', makeDesign(1))
    const other = saveWritingCover(lib, 'writing/二组/a.md', makeDesign(1))
    expect(other.cover).not.toBe(first.cover)

    const second = saveWritingCover(lib, 'writing/一组/a.md', makeDesign(2))
    expect(fs.existsSync(path.join(lib, first.cover))).toBe(false)
    expect(fs.existsSync(path.join(lib, other.cover))).toBe(true)
    deleteWritingCovers(lib, 'writing/一组/a.md')
    expect(fs.existsSync(path.join(lib, second.cover))).toBe(false)
    expect(fs.existsSync(path.join(lib, other.cover))).toBe(true)
  })

  it('frontmatter 更新失败时删除新文件并保留旧封面', () => {
    const absolutePath = createWriting(lib)
    const first = saveWritingCover(lib, 'writing/研究/a.md', makeDesign(1))
    const rename = fs.renameSync
    vi.spyOn(fs, 'renameSync').mockImplementation((from, to) => {
      if (path.resolve(String(to)) === absolutePath) throw new Error('元数据写入失败')
      return rename(from, to)
    })

    expect(() => saveWritingCover(lib, 'writing/研究/a.md', makeDesign(2))).toThrow('元数据写入失败')
    expect(matter(fs.readFileSync(absolutePath, 'utf8')).data.cover).toBe(first.cover)
    expect(fs.existsSync(path.join(lib, first.cover))).toBe(true)
    expect(fs.readdirSync(path.join(lib, 'writing', '.covers'))).toEqual([path.basename(first.cover)])
  })

  it('生成只读取正文前 12000 字符，候选不落盘', async () => {
    createWriting(lib)
    fs.writeFileSync(path.join(lib, 'writing/研究/a.md'), matter.stringify(`${'正'.repeat(12000)}TRIMMED`, { title: '深度工作', summary: '注意力机制' }))
    const fetchSpy = vi.fn(async () => ({
      ok: true,
      json: async () => ({ choices: [{ message: { content: JSON.stringify({ designs: [makeDesign(0), makeDesign(1), makeDesign(2)] }) } }] }),
    }))
    vi.stubGlobal('fetch', fetchSpy)

    const candidates = await generateWritingCoverCandidates({ apiKey: 'k', baseUrl: 'https://x', model: 'm', libraryPath: lib }, 'writing/研究/a.md')
    expect(candidates).toHaveLength(3)
    const request = JSON.parse((fetchSpy.mock.calls[0][1] as RequestInit).body as string)
    expect(request.messages[1].content).toContain('深度工作')
    expect(request.messages[1].content).toContain('注意力机制')
    expect(request.messages[1].content).not.toContain('TRIMMED')
    expect(fs.existsSync(path.join(lib, 'writing', '.covers'))).toBe(false)
  })

  it('HTML 只把可见正文注入封面提示词，封面存入目录元数据且不改原文', async () => {
    const rel = 'writing/网页.html'
    const absolutePath = path.join(lib, rel)
    fs.mkdirSync(path.dirname(absolutePath), { recursive: true })
    const html = '<!doctype html><html><head><title>网页标题</title><style>.hidden{color:red}</style><script>secret()</script></head><body><main><h1>可见标题</h1><p>有效正文</p></main></body></html>'
    fs.writeFileSync(absolutePath, html)
    const fetchSpy = vi.fn(async () => ({
      ok: true,
      json: async () => ({ choices: [{ message: { content: JSON.stringify({ designs: [makeDesign(0), makeDesign(1), makeDesign(2)] }) } }] }),
    }))
    vi.stubGlobal('fetch', fetchSpy)

    await generateWritingCoverCandidates({ apiKey: 'k', baseUrl: 'https://x', model: 'm', libraryPath: lib }, rel)
    const request = JSON.parse((fetchSpy.mock.calls[0][1] as RequestInit).body as string)
    expect(request.messages[1].content).toContain('可见标题')
    expect(request.messages[1].content).toContain('有效正文')
    expect(request.messages[1].content).not.toContain('<main>')
    expect(request.messages[1].content).not.toContain('color:red')
    expect(request.messages[1].content).not.toContain('secret()')

    const saved = saveWritingCover(lib, rel, makeDesign(1))
    expect(fs.readFileSync(absolutePath, 'utf8')).toBe(html)
    const [entry] = attachWritingWallMetadata(lib, 'writing', [{ kind: 'file', name: '网页.html', path: rel }])
    expect(entry.coverUrl).toBe(saved.coverUrl)
  })

  it('E2E 使用确定性三候选，不请求模型', async () => {
    createWriting(lib)
    vi.stubEnv('NODE_ENV', 'test')
    vi.stubEnv('E2E_CONFIG_DIR', 'isolated-e2e')
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)

    const candidates = await generateWritingCoverCandidates({ apiKey: 'k', baseUrl: 'https://x', model: 'm', libraryPath: lib }, 'writing/研究/a.md')
    expect(candidates).toHaveLength(3)
    expect(candidates.map(candidate => candidate.design.concept)).toEqual(['E2E 符号一', 'E2E 符号二', 'E2E 符号三'])
    expect(candidates.every(candidate => candidate.svgDataUrl.startsWith('data:image/svg+xml;base64,'))).toBe(true)
    expect(fetchSpy).not.toHaveBeenCalled()
  })
})
