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
import { httpFetch } from '../electron/lib/net-fetch'
import { parseSitemapUrls, type ArticleMetaCache } from '../electron/lib/anthropic-discover'
import { ANTHROPIC_SOURCES } from '../electron/lib/anthropic-sections'
import type { AnthropicArticleMeta } from '@shared/index'

vi.mock('../electron/lib/anthropic-browser', () => ({
  runScriptInScraperWindow: vi.fn(),
  closeScraperWindow: vi.fn(),
  cancelCurrentOperation: vi.fn(),
}))

vi.mock('../electron/lib/net-fetch', () => ({ httpFetch: vi.fn() }))

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

    vi.mocked(httpFetch).mockImplementation(async (url: string) => {
      if (url.includes('sitemap.xml')) {
        return {
          ok: true,
          url,
          text: async () =>
            `<urlset><url><loc>${TEST_URL}</loc></url></urlset>`,
        } as unknown as Response
      }
      return { ok: true, url, text: async () => '<html></html>' } as unknown as Response
    })
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

describe('discoverArticles multi-source', () => {
  const fx = (name: string) => fs.readFileSync(path.join(__dirname, 'fixtures/blog-sources', name), 'utf8')
  const textResponse = (body: string, url?: string) =>
    ({ ok: true, url: url ?? '', text: async () => body }) as unknown as Response
  const src = (key: string) => ANTHROPIC_SOURCES.find((s) => s.key === key)!
  let tmp: string

  function sitemapCards(key: string): { url: string; title: string; summary: null; dateText: string; imageUrl: null }[] {
    const section = src(key)
    const xml = key === 'product' ? fx('claude-sitemap.xml') : fx('anthropic-sitemap.xml')
    return parseSitemapUrls(xml, section).map((u, i) => ({
      url: u.url,
      title: `${key} title ${i}`,
      summary: null,
      dateText: 'Aug 1, 2026',
      imageUrl: null,
    }))
  }

  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sp-anthropic-ms-'))
    vi.mocked(runScriptInScraperWindow).mockReset()
    vi.mocked(httpFetch).mockReset()
  })
  afterEach(() => {
    fs.rmSync(tmp, { recursive: true, force: true })
  })

  it('buildListingScript 参数化前缀与排除规则', async () => {
    const { buildListingScript } = await import('../electron/lib/anthropic-scraper')
    expect(buildListingScript(src('engineering'))).toContain('a[href^="/engineering/"]')
    expect(buildListingScript(src('research'))).toContain('a[href^="/research/"]')
    expect(buildListingScript(src('research'))).toContain('/research/team/')
    expect(buildListingScript(src('engineering'))).toContain('EXCLUDE_PREFIXES')
  })

  it('五源合并返回：每源文章数 = fixture 数（25/144/54/51/204），research 无 team 页，每篇有标题', async () => {
    vi.mocked(httpFetch).mockImplementation(async (url: string) => {
      if (url === 'https://www.anthropic.com/sitemap.xml') return textResponse(fx('anthropic-sitemap.xml'))
      if (url === 'https://claude.com/sitemap.xml') return textResponse(fx('claude-sitemap.xml'))
      if (url === 'https://alignment.anthropic.com/') return textResponse(fx('alignment-index.html'))
      if (url === 'https://transformer-circuits.pub/feed.xml') return textResponse(fx('circuits-feed.xml'))
      throw new Error(`Unexpected httpFetch url: ${url}`)
    })
    vi.mocked(runScriptInScraperWindow).mockImplementation(async (_script, opts) => {
      const url = (opts as { url: string }).url
      if (url.includes('/engineering')) return sitemapCards('engineering')
      if (url.includes('/research')) return sitemapCards('research')
      if (url.includes('claude.com')) return sitemapCards('product')
      return []
    })

    const { discoverArticles } = await import('../electron/lib/anthropic-scraper')
    const result = await discoverArticles(tmp)
    expect(result.articles).toHaveLength(25 + 144 + 54 + 51 + 204)
    const bySection = (k: string) => result.articles.filter((a) => a.section === k)
    expect(bySection('engineering')).toHaveLength(25)
    expect(bySection('research')).toHaveLength(144)
    expect(bySection('alignment')).toHaveLength(54)
    expect(bySection('interpretability')).toHaveLength(51)
    expect(bySection('product')).toHaveLength(204)
    // research 无 team 页；每篇 section 正确；无裸行（每篇都有标题）
    expect(bySection('research').every((a) => !a.url.includes('/research/team/'))).toBe(true)
    expect(result.articles.every((a) => a.title && a.section)).toBe(true)
    expect(result.sectionStatus.product?.error).toBeNull()
    expect(result.sectionStatus.research?.fetchedAt).toBeTruthy()
  })

  it('单源失败隔离：claude sitemap 失败 → 其他四源正常，sectionStatus.product.error 非空', async () => {
    vi.mocked(httpFetch).mockImplementation(async (url: string) => {
      if (url === 'https://claude.com/sitemap.xml') throw new Error('timeout waiting for selector')
      if (url === 'https://www.anthropic.com/sitemap.xml') return textResponse(fx('anthropic-sitemap.xml'))
      if (url === 'https://alignment.anthropic.com/') return textResponse(fx('alignment-index.html'))
      if (url === 'https://transformer-circuits.pub/feed.xml') return textResponse(fx('circuits-feed.xml'))
      throw new Error(`Unexpected httpFetch url: ${url}`)
    })
    vi.mocked(runScriptInScraperWindow).mockImplementation(async (_script, opts) => {
      const url = (opts as { url: string }).url
      if (url.includes('/engineering')) return sitemapCards('engineering')
      if (url.includes('/research')) return sitemapCards('research')
      return []
    })

    const { discoverArticles } = await import('../electron/lib/anthropic-scraper')
    const result = await discoverArticles(tmp)
    expect(result.articles).toHaveLength(25 + 144 + 54 + 51)
    expect(result.sectionStatus.product?.error?.code).toBe('network-error')
    expect(result.sectionStatus.engineering?.error).toBeNull()
  })

  it('全部栏目失败时整体抛错', async () => {
    vi.mocked(httpFetch).mockRejectedValue(new Error('load failed'))
    vi.mocked(runScriptInScraperWindow).mockRejectedValue(new Error('load failed'))
    const { discoverArticles } = await import('../electron/lib/anthropic-scraper')
    await expect(discoverArticles(tmp)).rejects.toThrow('load failed')
  })

  it('无裸行：索引页与缓存未覆盖的 sitemap URL 不进初始结果；回填后经 onBackfill 入场；重定向按最终 URL 去重', async () => {
    const ENG_SITEMAP = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>https://www.anthropic.com/engineering/a</loc><lastmod>2026-08-01</lastmod></url>
  <url><loc>https://www.anthropic.com/engineering/b</loc><lastmod>2026-08-02</lastmod></url>
  <url><loc>https://www.anthropic.com/engineering/c</loc><lastmod>2026-08-03</lastmod></url>
  <url><loc>https://www.anthropic.com/engineering/dup</loc><lastmod>2026-08-04</lastmod></url>
</urlset>`

    vi.mocked(httpFetch).mockImplementation(async (url: string) => {
      if (url === 'https://www.anthropic.com/sitemap.xml') return textResponse(ENG_SITEMAP)
      if (url === 'https://claude.com/sitemap.xml') return textResponse('<urlset></urlset>')
      if (url === 'https://alignment.anthropic.com/') return textResponse('<html></html>')
      if (url === 'https://transformer-circuits.pub/feed.xml') return textResponse('<feed></feed>')
      if (url === 'https://www.anthropic.com/engineering/c') {
        return textResponse(
          '<html><head><meta property="og:title" content="C Real Title"/><meta property="og:description" content="C summary"/></head></html>',
          'https://www.anthropic.com/engineering/c'
        )
      }
      if (url === 'https://www.anthropic.com/engineering/dup') {
        // 重定向：最终 URL 落到已发现的 a → canonicalUrl 与已发现文章相同 → 不推送
        return textResponse(
          '<html><head><meta property="og:title" content="A Title"/></head></html>',
          'https://www.anthropic.com/engineering/a'
        )
      }
      throw new Error(`Unexpected httpFetch url: ${url}`)
    })
    vi.mocked(runScriptInScraperWindow).mockImplementation(async (_script, opts) => {
      const url = (opts as { url: string }).url
      if (url.includes('/engineering')) {
        return [{ url: 'https://www.anthropic.com/engineering/a', title: 'A Title', summary: 'A summary', dateText: 'Aug 1, 2026', imageUrl: null }]
      }
      return []
    })

    const { discoverArticles } = await import('../electron/lib/anthropic-scraper')
    const onBackfill = vi.fn()
    const metaCache: ArticleMetaCache = {
      'https://www.anthropic.com/engineering/b': { title: 'B Title', publishedAt: '2026-08-02T00:00:00.000Z', summary: 'B summary', imageUrl: null },
    }
    const result = await discoverArticles(tmp, { metaCache, onBackfill })

    // 初始结果只含 a（卡片覆盖）与 b（缓存命中）；c/dup 不进初始列表
    expect(result.articles.map((a) => a.url)).toEqual([
      'https://www.anthropic.com/engineering/a',
      'https://www.anthropic.com/engineering/b',
    ])
    expect(result.articles.every((a) => a.title)).toBe(true)

    // 回填：c 入场（含解析出的 title + lastmod 兜底日期）；dup 重定向去重不推送
    expect(onBackfill).toHaveBeenCalledTimes(1)
    const pushed = onBackfill.mock.calls[0][0] as AnthropicArticleMeta[]
    expect(pushed).toHaveLength(1)
    expect(pushed[0].url).toBe('https://www.anthropic.com/engineering/c')
    expect(pushed[0].title).toBe('C Real Title')
    expect(pushed[0].section).toBe('engineering')
    expect(pushed[0].publishedAt).toBe(new Date('2026-08-03').toISOString())

    // metaCache 持久化：miss.url 与 canonicalUrl 都写
    const finalCache = onBackfill.mock.calls[0][1] as ArticleMetaCache
    expect(finalCache['https://www.anthropic.com/engineering/c']?.title).toBe('C Real Title')
    expect(finalCache['https://www.anthropic.com/engineering/dup']?.title).toBe('A Title')
  })

  it('未提供 onBackfill 时不抓取回填文章页（调用方不背回填成本）', async () => {
    const ENG_SITEMAP = `<?xml version="1.0" encoding="UTF-8"?>
<urlset><url><loc>https://www.anthropic.com/engineering/z</loc></urlset>`
    vi.mocked(httpFetch).mockImplementation(async (url: string) => {
      if (url === 'https://www.anthropic.com/sitemap.xml') return textResponse(ENG_SITEMAP)
      if (url === 'https://claude.com/sitemap.xml') return textResponse('<urlset></urlset>')
      if (url === 'https://alignment.anthropic.com/') return textResponse('<html></html>')
      if (url === 'https://transformer-circuits.pub/feed.xml') return textResponse('<feed></feed>')
      throw new Error(`Unexpected httpFetch url: ${url}`)
    })
    vi.mocked(runScriptInScraperWindow).mockImplementation(async () => [])

    const { discoverArticles } = await import('../electron/lib/anthropic-scraper')
    const result = await discoverArticles(tmp) // 不传 onBackfill → 跳过回填
    expect(result.articles).toHaveLength(0) // z 未覆盖，不进初始结果
    const calledUrls = vi.mocked(httpFetch).mock.calls.map((c) => c[0])
    expect(calledUrls).not.toContain('https://www.anthropic.com/engineering/z')
  })

  it('metaCache 跨 run 持久化：二次 discover 命中缓存不触发回填', async () => {
    const ENG_SITEMAP = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>https://www.anthropic.com/engineering/a</loc><lastmod>2026-08-01</lastmod></url>
  <url><loc>https://www.anthropic.com/engineering/c</loc><lastmod>2026-08-03</lastmod></url>
</urlset>`
    vi.mocked(httpFetch).mockImplementation(async (url: string) => {
      if (url === 'https://www.anthropic.com/sitemap.xml') return textResponse(ENG_SITEMAP)
      if (url === 'https://claude.com/sitemap.xml') return textResponse('<urlset></urlset>')
      if (url === 'https://alignment.anthropic.com/') return textResponse('<html></html>')
      if (url === 'https://transformer-circuits.pub/feed.xml') return textResponse('<feed></feed>')
      if (url === 'https://www.anthropic.com/engineering/c') {
        return textResponse('<html><head><meta property="og:title" content="C Real Title"/></head></html>', url)
      }
      throw new Error(`Unexpected httpFetch url: ${url}`)
    })
    vi.mocked(runScriptInScraperWindow).mockImplementation(async (_script, opts) => {
      const url = (opts as { url: string }).url
      if (url.includes('/engineering')) {
        return [{ url: 'https://www.anthropic.com/engineering/a', title: 'A Title', summary: null, dateText: 'Aug 1, 2026', imageUrl: null }]
      }
      return []
    })

    const { discoverArticles } = await import('../electron/lib/anthropic-scraper')

    // 第一轮：c 未覆盖 → 回填 → metaCache 被写入
    let cache: ArticleMetaCache = {}
    const firstBackfill = vi.fn((_a: AnthropicArticleMeta[], updated: ArticleMetaCache) => { cache = updated })
    const r1 = await discoverArticles(tmp, { metaCache: {}, onBackfill: firstBackfill })
    expect(r1.articles.map((a) => a.url)).not.toContain('https://www.anthropic.com/engineering/c')
    expect(firstBackfill).toHaveBeenCalled()
    expect(cache['https://www.anthropic.com/engineering/c']?.title).toBe('C Real Title')

    // 第二轮：同一 metaCache 传入 → c 命中缓存进初始结果，不再触发回填（跨 run 缓存命中）
    const secondBackfill = vi.fn()
    const r2 = await discoverArticles(tmp, { metaCache: cache, onBackfill: secondBackfill })
    expect(r2.articles.map((a) => a.url)).toContain('https://www.anthropic.com/engineering/c')
    expect(secondBackfill).not.toHaveBeenCalled()
  })

  it('static-list/rss 脏数据缺标题的裸行被过滤（无裸行契约）', async () => {
    vi.mocked(httpFetch).mockImplementation(async (url: string) => {
      if (url === 'https://www.anthropic.com/sitemap.xml') return textResponse('<urlset></urlset>')
      if (url === 'https://claude.com/sitemap.xml') return textResponse('<urlset></urlset>')
      if (url === 'https://alignment.anthropic.com/') return textResponse('<html></html>')
      if (url === 'https://transformer-circuits.pub/feed.xml') {
        return textResponse(`<?xml version="1.0"?>
<feed>
  <entry><title>Good Circuit</title><link href="https://transformer-circuits.pub/2026/good/index.html"/><updated>2026-08-01T00:00:00Z</updated></entry>
  <entry><title></title><link href="https://transformer-circuits.pub/2026/bad/index.html"/><updated>2026-08-02T00:00:00Z</updated></entry>
</feed>`)
      }
      throw new Error(`Unexpected httpFetch url: ${url}`)
    })
    vi.mocked(runScriptInScraperWindow).mockImplementation(async () => [])

    const { discoverArticles } = await import('../electron/lib/anthropic-scraper')
    const result = await discoverArticles(tmp)
    expect(result.articles).toHaveLength(1)
    expect(result.articles[0].url).toBe('https://transformer-circuits.pub/2026/good/index.html')
    expect(result.articles[0].title).toBe('Good Circuit')
  })
})

describe('importArticle section', () => {
  it('institute 文章写入 section/tags', async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sp-anthropic-sec-'))
    const INS_URL = 'https://www.anthropic.com/institute/recursive-self-improvement'
    vi.mocked(httpFetch).mockImplementation(async (url: string) => {
      if (url.includes('sitemap.xml')) {
        return { ok: true, url, text: async () => '<urlset></urlset>' } as unknown as Response
      }
      return { ok: true, url, text: async () => '<html></html>' } as unknown as Response
    })
    vi.mocked(runScriptInScraperWindow).mockImplementation(async (script, opts) => {
      const url = (opts as { url?: string } | undefined)?.url ?? ''
      if (script.includes('a[href^="/institute/"]')) {
        return [{ url: INS_URL, title: 'When AI builds itself', summary: 'S', dateText: 'Aug 5, 2026', imageUrl: null }] as never
      }
      if (script.includes('a[href^="/engineering/"]') || script.includes('a[href^="/research/"]')) return [] as never
      if (script.includes('article:published_time')) {
        return {
          title: 'When AI builds itself',
          url: INS_URL,
          publishedAt: '2026-08-05T00:00:00.000Z',
          authors: ['Anthropic'],
          summary: 'S',
          contentHtml: '<article><p>Body.</p></article>',
          images: [],
        } as never
      }
      return [] as never
    })
    // 全局 fetch（图片下载）不需要——无图片
    const { importArticle } = await import('../electron/lib/anthropic-scraper')
    const { filePath } = await importArticle(INS_URL, tmp)
    const raw = fs.readFileSync(filePath, 'utf8')
    const { parseFrontmatter } = await import('../electron/lib/frontmatter')
    const { frontmatter } = parseFrontmatter(raw, { filename: path.basename(filePath) })
    expect(frontmatter.section).toBe('institute')
    expect(frontmatter.tags).toEqual(['anthropic', 'institute'])
    fs.rmSync(tmp, { recursive: true, force: true })
  })
})
