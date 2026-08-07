import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import os from 'node:os'
import path from 'node:path'
import fs from 'node:fs'
import {
  parseDateString,
  firstParagraphToSummary,
  toAbsoluteUrl,
  importArticle,
} from '../electron/lib/anthropic-scraper'
import { runScriptInScraperWindow } from '../electron/lib/anthropic-browser'

vi.mock('../electron/lib/anthropic-browser', () => ({
  runScriptInScraperWindow: vi.fn(),
  closeScraperWindow: vi.fn(),
  cancelCurrentOperation: vi.fn(),
}))

describe('anthropic helpers', () => {
  it('toAbsoluteUrl converts relative urls', () => {
    expect(toAbsoluteUrl('/engineering/foo')).toBe('https://www.anthropic.com/engineering/foo')
    expect(toAbsoluteUrl('https://example.com')).toBe('https://example.com')
    expect(toAbsoluteUrl('//cdn.example.com/a.png')).toBe('https://cdn.example.com/a.png')
  })

  it('parseDateString parses Apr 23, 2026', () => {
    const result = parseDateString('Apr 23, 2026')
    expect(result).toBeTruthy()
    expect(result).toBe(new Date('Apr 23, 2026').toISOString())
  })

  it('firstParagraphToSummary extracts first non-heading paragraph', () => {
    const md = '# Title\n\nHello world.\n\nSecond paragraph.'
    expect(firstParagraphToSummary(md)).toBe('Hello world.')
  })

  it('firstParagraphToSummary truncates long paragraph', () => {
    const long = 'a'.repeat(300)
    const md = `# Title\n\n${long}\n\nNext.`
    expect(firstParagraphToSummary(md).endsWith('…')).toBe(true)
  })
})

describe('anthropic integration', () => {
  const TEST_URL = 'https://www.anthropic.com/engineering/test-article'
  const IMAGE_URL = 'https://www.anthropic.com/images/test.png'
  let tmp: string

  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sp-anthropic-'))
    vi.mocked(runScriptInScraperWindow).mockImplementation(async (script) => {
      if (script.includes('a[href^="/engineering/"]')) {
        return [
          {
            url: TEST_URL,
            title: 'Test Anthropic Article',
            summary: 'A short summary.',
            dateText: 'Jul 1, 2026',
            imageUrl: '/images/test.png',
          },
        ]
      }
      if (script.includes('a[href^="/institute/"]') || script.includes('a[href^="/research/"]')) {
        return []
      }
      if (script.includes('article:published_time')) {
        return {
          title: 'Test Anthropic Article',
          url: TEST_URL,
          publishedAt: '2026-07-01T00:00:00.000Z',
          authors: ['Alice', 'Bob'],
          summary: 'A short summary.',
          contentHtml: `<article><p>Hello world.</p><img src="${IMAGE_URL}" alt="diagram" /></article>`,
          images: [{ url: IMAGE_URL, alt: 'diagram' }],
        }
      }
      if (script.includes('querySelectorAll(\'article img')) {
        return [{ url: IMAGE_URL, alt: 'diagram' }]
      }
      throw new Error(`Unexpected script: ${script.slice(0, 80)}`)
    })

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      arrayBuffer: async () => new ArrayBuffer(8),
    } as Response)
  })

  afterEach(() => {
    fs.rmSync(tmp, { recursive: true, force: true })
    vi.restoreAllMocks()
  })

  it('imports an article and rewrites images to local assets', async () => {
    const { filePath, wasAlreadySaved } = await importArticle(TEST_URL, tmp)
    expect(wasAlreadySaved).toBe(false)
    expect(fs.existsSync(filePath)).toBe(true)

    const raw = fs.readFileSync(filePath, 'utf8')
    expect(raw).toContain('source_url:')
    expect(raw).toContain('published_at:')
    expect(raw).toContain('imported_at:')
    expect(raw).toContain('type: anthropic-article')
    expect(raw).toContain('Hello world.')

    // 图片路径被重写为本地 .assets/ 路径
    expect(raw).toContain('./.assets/')
    const assetsDir = path.join(path.dirname(filePath), '.assets')
    expect(fs.existsSync(assetsDir)).toBe(true)

    // 重复导入返回已保存
    const second = await importArticle(TEST_URL, tmp)
    expect(second.wasAlreadySaved).toBe(true)
    expect(second.filePath).toBe(filePath)
  })

  it('falls back to absolute image URL when download fails', async () => {
    vi.mocked(globalThis.fetch as any).mockResolvedValue({
      ok: false,
      status: 403,
    } as Response)

    const { filePath } = await importArticle(TEST_URL, tmp)
    const raw = fs.readFileSync(filePath, 'utf8')
    expect(raw).toContain(IMAGE_URL)
  })
})

describe('discoverArticles multi-section', () => {
  const ENG = { url: 'https://www.anthropic.com/engineering/e1', title: 'Eng', summary: null, dateText: 'Aug 1, 2026', imageUrl: null }
  const INS = { url: 'https://www.anthropic.com/institute/i1', title: 'Inst', summary: null, dateText: 'Aug 3, 2026', imageUrl: null }
  const RES = { url: 'https://www.anthropic.com/research/r1', title: 'Res', summary: null, dateText: 'Aug 2, 2026', imageUrl: null }
  let tmp: string

  function mockListing(impl: (url: string) => unknown) {
    vi.mocked(runScriptInScraperWindow).mockImplementation(async (_script, opts) => {
      return impl((opts as { url: string }).url) as never
    })
  }

  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sp-anthropic-ms-'))
  })
  afterEach(() => {
    fs.rmSync(tmp, { recursive: true, force: true })
  })

  it('buildListingScript 参数化前缀与排除规则', async () => {
    const { buildListingScript } = await import('../electron/lib/anthropic-scraper')
    const { ANTHROPIC_SECTIONS } = await import('../electron/lib/anthropic-sections')
    const eng = ANTHROPIC_SECTIONS.find((s) => s.key === 'engineering')!
    const res = ANTHROPIC_SECTIONS.find((s) => s.key === 'research')!
    expect(buildListingScript(eng)).toContain('a[href^="/engineering/"]')
    expect(buildListingScript(res)).toContain('a[href^="/research/"]')
    expect(buildListingScript(res)).toContain('/research/team/')
    expect(buildListingScript(eng)).toContain('EXCLUDE_PREFIXES')
  })

  it('三栏目文章带 section 合并返回，sectionStatus 全部成功', async () => {
    mockListing((url) => (url.includes('/institute') ? [INS] : url.includes('/research') ? [RES] : [ENG]))
    const { discoverArticles } = await import('../electron/lib/anthropic-scraper')
    const result = await discoverArticles(tmp)
    expect(result.articles).toHaveLength(3)
    expect(result.articles.map((a) => a.section).sort()).toEqual(['engineering', 'institute', 'research'])
    expect(result.sectionStatus.institute?.error).toBeNull()
    expect(result.sectionStatus.research?.fetchedAt).toBeTruthy()
  })

  it('单栏目失败隔离：其他栏目正常返回，失败栏目记入 sectionStatus', async () => {
    mockListing((url) => {
      if (url.includes('/institute')) throw new Error('timeout waiting for selector')
      return url.includes('/research') ? [RES] : [ENG]
    })
    const { discoverArticles } = await import('../electron/lib/anthropic-scraper')
    const result = await discoverArticles(tmp)
    expect(result.articles).toHaveLength(2)
    expect(result.sectionStatus.institute?.error?.code).toBe('network-error')
    expect(result.sectionStatus.engineering?.error).toBeNull()
  })

  it('全部栏目失败时整体抛错', async () => {
    mockListing(() => { throw new Error('load failed') })
    const { discoverArticles } = await import('../electron/lib/anthropic-scraper')
    await expect(discoverArticles(tmp)).rejects.toThrow('load failed')
  })
})
