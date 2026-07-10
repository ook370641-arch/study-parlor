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
