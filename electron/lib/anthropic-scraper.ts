import TurndownService from 'turndown'
import fs from 'node:fs'
import path from 'node:path'
import { runScriptInScraperWindow } from './anthropic-browser'
import { parseFrontmatter, serializeFrontmatter } from './frontmatter'
import type { AnthropicArticleMeta } from '@shared/index'
import { ANTHROPIC_SOURCES, sectionForUrl, type AnthropicSource } from './anthropic-sections'
import type { AnthropicSectionKey, AnthropicSectionStatus, AnthropicErrorCode } from '@shared/index'
import { httpFetch, httpFetchWithRetry } from './net-fetch'
import {
  mapWithConcurrency,
  parseAlignmentIndex,
  parseArticleMetaHtml,
  parseAtomFeed,
  parseSitemapUrls,
  type ArticleMetaCache,
  type DiscoveredLink,
} from './anthropic-discover'

const BASE_URL = 'https://www.anthropic.com'
export const IMPORT_DIR = 'Anthropic博客'

const turndown = new TurndownService({
  headingStyle: 'atx',
  codeBlockStyle: 'fenced',
})

export function classifyError(err: unknown): { code: AnthropicErrorCode; message: string } {
  const msg = err instanceof Error ? err.message : String(err)
  const lower = msg.toLowerCase()
  if (lower.includes('cancelled')) {
    return { code: 'cancelled', message: '导入已取消' }
  }
  if (lower.includes('offline') || lower.includes('network_error') || lower.includes('networkerror')) {
    return { code: 'network-error', message: '网络连接失败，请检查网络后重试' }
  }
  if (lower.includes('timeout')) {
    return { code: 'network-error', message: '请求超时，请稍后重试' }
  }
  if (lower.includes('parse') || lower.includes('json')) {
    return { code: 'parse-error', message: '解析页面失败，Anthropic 网站结构可能已变更' }
  }
  if (lower.includes('load failed')) {
    return { code: 'network-error', message: '页面加载失败，请检查网络后重试' }
  }
  return { code: 'unknown', message: msg || '未知错误' }
}

export function toAbsoluteUrl(relativeOrAbsolute: string): string {
  if (!relativeOrAbsolute) return relativeOrAbsolute
  if (relativeOrAbsolute.startsWith('http://') || relativeOrAbsolute.startsWith('https://')) {
    return relativeOrAbsolute
  }
  if (relativeOrAbsolute.startsWith('//')) return `https:${relativeOrAbsolute}`
  return `${BASE_URL}${relativeOrAbsolute.startsWith('/') ? '' : '/'}${relativeOrAbsolute}`
}

export function parseDateString(str: string | null | undefined): string | null {
  if (!str) return null
  try {
    const cleaned = String(str).trim().replace(/\.$/, '')
    const parsed = new Date(cleaned)
    if (!Number.isNaN(parsed.getTime())) return parsed.toISOString()
  } catch {}
  return null
}

export function firstParagraphToSummary(markdown: string, maxLength = 280): string {
  if (!markdown) return ''
  const firstBlock = markdown
    .split('\n\n')
    .map((b) => b.trim())
    .find((b) => b.length > 0 && !b.startsWith('#'))
  if (!firstBlock) return ''
  const text = firstBlock.replace(/\n/g, ' ').replace(/\s+/g, ' ').trim()
  if (text.length <= maxLength) return text
  return `${text.slice(0, maxLength - 1)}…`
}

export function safeFileName(title: string): string {
  return title
    .replace(/[\\/:*?"<>|]/g, '_')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120)
}

function getImportFolder(publishedAt: string): string {
  try {
    const d = new Date(publishedAt)
    if (!Number.isNaN(d.getTime())) {
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    }
  } catch {}
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

function walkMdFiles(dir: string, cb: (filePath: string) => void) {
  if (!fs.existsSync(dir)) return
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      walkMdFiles(full, cb)
    } else if (entry.isFile() && entry.name.endsWith('.md')) {
      cb(full)
    }
  }
}

export function findSavedArticles(libraryRoot: string): Map<string, string> {
  const map = new Map<string, string>()
  const dir = path.join(libraryRoot, IMPORT_DIR)
  walkMdFiles(dir, (filePath) => {
    try {
      const raw = fs.readFileSync(filePath, 'utf8')
      const { frontmatter } = parseFrontmatter(raw, { filename: path.basename(filePath) })
      if (frontmatter.source_url) map.set(frontmatter.source_url, filePath)
    } catch {}
  })
  return map
}

export function buildListingScript(section: AnthropicSource): string {
  return `(() => {
  const seen = new Set()
  const results = []
  const EXCLUDE_PREFIXES = ${JSON.stringify(section.excludePrefixes ?? [])}
  const datePattern = /\\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\\s+\\d{1,2},?\\s+\\d{4}\\b/

  // Find the card container for an <a> element, then extract all metadata
  // from the container. This avoids the bug where the first <a> (often an
  // image-only link) "wins" the per-URL dedup and blocks the title-bearing
  // <a> from contributing its data.
  const extractCard = (a) => {
    let container = a.closest('[class*="ArticleList"], article, li')
    if (!container) container = a.parentElement

    const href = a.getAttribute('href')
    const url = new URL(href, window.location.href).toString()

    const titleEl = container?.querySelector('h2, h3, h4, [class*="__title"], [class*="title"]')
    const title = titleEl?.textContent?.trim() || a.textContent?.trim() || null

    const summaryEl = container?.querySelector('[class*="__summary"]')
    const summary = summaryEl?.textContent?.trim() || null

    const dateEl = container?.querySelector('[class*="__date"]')
    const dateText = dateEl?.textContent?.trim()
      || container?.textContent?.match(datePattern)?.[0]
      || null

    const img = container?.querySelector('img')
    const imageUrl = img?.getAttribute('src') || img?.getAttribute('data-src') || null

    return { url, title, summary, dateText, imageUrl }
  }

  document.querySelectorAll('a[href^="${section.linkPrefix}"]').forEach((a) => {
    const href = a.getAttribute('href')
    if (!href) return
    if (EXCLUDE_PREFIXES.some((p) => href.startsWith(p))) return
    const url = new URL(href, window.location.href).toString()
    if (seen.has(url)) return
    seen.add(url)
    results.push(extractCard(a))
  })

  return results
})()`
}

type BackfillMiss = { source: AnthropicSource; url: string; lastmod: string | null }

type ListingCard = {
  url: string
  title: string | null
  summary: string | null
  dateText: string | null
  imageUrl: string | null
}

/** sitemap 策略：sitemap 全量 URL（parseSitemapUrls）为骨架；
 *  索引页卡片（buildListingScript，隐藏窗 DOM 提取）与 articleMetaCache 提供富元数据；
 *  两者都覆盖不到的 URL 进 backfill 队列——不产生「无标题裸行」。 */
async function discoverSitemapSource(
  section: AnthropicSource,
  metaCache: ArticleMetaCache,
  backfillMisses: BackfillMiss[]
): Promise<DiscoveredLink[]> {
  const xml = await (await httpFetch(section.sitemapUrl!)).text()
  const all = parseSitemapUrls(xml, section)
  const cards = await runScriptInScraperWindow<ListingCard[]>(
    buildListingScript(section),
    { url: section.indexUrl, waitForSelector: `a[href^="${section.linkPrefix}"]` }
  ).catch(() => [] as ListingCard[])
  const byUrl = new Map(cards.map((c) => [c.url, c]))

  const out: DiscoveredLink[] = []
  for (const { url, lastmod } of all) {
    const card = byUrl.get(url)
    if (card?.title) {
      out.push({ url, title: card.title, summary: card.summary, dateText: card.dateText, imageUrl: card.imageUrl })
      continue
    }
    const cached = metaCache[url]
    if (cached?.title) {
      out.push({ url, title: cached.title, summary: cached.summary, dateText: cached.publishedAt, imageUrl: cached.imageUrl })
      continue
    }
    backfillMisses.push({ source: section, url, lastmod })
  }
  return out
}

/** 按发现策略分派：sitemap → 上面；static-list/rss → httpFetch 拉索引/feed 后纯解析（数据已全量，不触发回填） */
async function dispatchDiscover(
  section: AnthropicSource,
  metaCache: ArticleMetaCache,
  backfillMisses: BackfillMiss[]
): Promise<DiscoveredLink[]> {
  if (section.discover === 'sitemap') {
    return discoverSitemapSource(section, metaCache, backfillMisses)
  }
  const html = await (await httpFetch(section.indexUrl)).text()
  if (section.discover === 'rss') return parseAtomFeed(html)
  return parseAlignmentIndex(html, section.indexUrl)
}

/** 后台元数据回填：并发 5，每完成 10 篇经 onBackfill 推送一批。
 *  写 metaCache（miss.url 与 canonicalUrl 都写）；canonicalUrl 与已发现文章重复 → 丢弃该占位（重定向去重）。 */
async function runBackfill(
  misses: BackfillMiss[],
  knownUrls: Set<string>,
  metaCache: ArticleMetaCache,
  saved: Map<string, string>,
  onBackfill: (articles: AnthropicArticleMeta[], metaCache: ArticleMetaCache) => void
): Promise<void> {
  const results = await mapWithConcurrency(misses, 5, async (miss) => {
    try {
      // 带退避重试：并发回填打站点会触发限流（429/5xx），错误页无 og:title → 否则静默丢篇
      const res = await httpFetchWithRetry(miss.url)
      if (!res.ok) return null
      const meta = parseArticleMetaHtml(await res.text(), res.url || miss.url)
      meta.publishedAt = meta.publishedAt ?? (miss.lastmod ? parseDateString(miss.lastmod) : null)
      return { miss, meta }
    } catch {
      return null
    }
  })

  let batch: AnthropicArticleMeta[] = []
  const flush = () => {
    if (batch.length > 0) {
      onBackfill(batch, metaCache)
      batch = []
    }
  }

  for (const r of results) {
    if (!r) continue
    const { miss, meta } = r
    const entry: ArticleMetaCache[string] = { title: meta.title, publishedAt: meta.publishedAt, summary: meta.summary, imageUrl: meta.imageUrl }
    if (meta.canonicalUrl && meta.canonicalUrl !== miss.url) {
      // 重定向：只写 canonical。不写 miss URL——否则二次 discover 缓存复活已去重文章（终审 I-1）
      metaCache[meta.canonicalUrl] = entry
    } else {
      metaCache[miss.url] = entry
    }
    if (!meta.title) continue
    if (knownUrls.has(meta.canonicalUrl)) continue
    knownUrls.add(meta.canonicalUrl)
    const filePath = saved.get(meta.canonicalUrl)
    batch.push({
      url: meta.canonicalUrl,
      title: meta.title,
      summary: meta.summary,
      publishedAt: meta.publishedAt,
      imageUrl: meta.imageUrl ? toAbsoluteUrl(meta.imageUrl) : null,
      section: miss.source.key,
      isSaved: !!filePath,
      filePath,
    })
    if (batch.length >= 10) flush()
  }
  flush()
}

export async function discoverArticles(
  libraryRoot: string,
  opts?: {
    metaCache?: ArticleMetaCache
    onBackfill?: (articles: AnthropicArticleMeta[], metaCache: ArticleMetaCache) => void
  }
): Promise<{
  lastFetchedAt: string
  articles: AnthropicArticleMeta[]
  sectionStatus: Partial<Record<AnthropicSectionKey, AnthropicSectionStatus>>
}> {
  const saved = findSavedArticles(libraryRoot)
  const metaCache: ArticleMetaCache = opts?.metaCache ?? {}
  const backfillMisses: BackfillMiss[] = []
  const sectionStatus: Partial<Record<AnthropicSectionKey, AnthropicSectionStatus>> = {}
  const failures: unknown[] = []
  const discovered: { link: DiscoveredLink; section: AnthropicSectionKey }[] = []

  // 逐源独立 try/catch：单源失败隔离，仅记录 sectionStatus；全部失败才整体 throw。
  for (const section of ANTHROPIC_SOURCES) {
    try {
      const links = await dispatchDiscover(section, metaCache, backfillMisses)
      for (const link of links) discovered.push({ link, section: section.key })
      sectionStatus[section.key] = { fetchedAt: new Date().toISOString(), error: null }
    } catch (err) {
      failures.push(err)
      sectionStatus[section.key] = { fetchedAt: null, error: classifyError(err) }
    }
  }

  const mapped = discovered.map(({ link, section }) => {
    const filePath = saved.get(link.url)
    return {
      url: link.url,
      title: link.title,
      summary: link.summary,
      publishedAt: link.dateText ? parseDateString(link.dateText) : null,
      imageUrl: toAbsoluteUrl(link.imageUrl ?? ''),
      section,
      isSaved: !!filePath,
      filePath,
    }
  })
  // 防御：static-list/rss 真实脏数据缺 h3/title 时会产出 title:null 裸行，过滤掉（无裸行契约）
  const articles: AnthropicArticleMeta[] = []
  for (const a of mapped) {
    if (a.title && a.url) articles.push(a as AnthropicArticleMeta)
  }

  // 全部失败才整体报错（走 IPC classifyError → parse-error/network-error 路径）；
  // 部分失败按栏目降级，面板逐栏目提示。
  if (articles.length === 0 && failures.length > 0) throw failures[0]

  // 后台回填（主结果返回后继续）：索引页与缓存都未覆盖的 sitemap URL 逐页取元数据，
  // 每 10 篇一批经 onBackfill 推送；未提供 onBackfill 的调用方（如 importArticle）不背回填成本。
  if (backfillMisses.length > 0 && opts?.onBackfill) {
    await runBackfill(
      backfillMisses,
      new Set(articles.map((a) => a.url)),
      metaCache,
      saved,
      opts.onBackfill
    )
  }

  return { lastFetchedAt: new Date().toISOString(), articles, sectionStatus }
}

const DEFAULT_CONTENT_SELECTORS = [
  'article',
  'main article',
  'main > div',
  '[data-testid="article-body"]',
  '.prose',
  '.article-content',
  'main',
]

/** 按来源参数化生成文章提取脚本：
 *  内容容器 = 来源 contentSelectors + 主站默认链（去重）；
 *  图片绝对化基于页面 URL（`new URL(src, window.location.href)`），不再硬编码主站域名；
 *  日期链在 time/meta/JSON-LD 回退后追加 RSC `publishedOn` 提取（读原始 HTML 转义 JSON）。 */
export function buildArticleScript(source: AnthropicSource): string {
  const selectors = [...new Set([...(source.contentSelectors ?? []), ...DEFAULT_CONTENT_SELECTORS])]
  return `(() => {
  const data = {
    title: '',
    url: window.location.href,
    publishedAt: null,
    authors: [],
    summary: '',
    contentHtml: '',
    images: []
  }

  data.title = document.querySelector('h1')?.textContent?.trim()
    || document.querySelector('title')?.textContent?.trim()
    || ''

  const timeEl = document.querySelector('time[datetime]')
  if (timeEl) data.publishedAt = timeEl.getAttribute('datetime')
  if (!data.publishedAt) {
    data.publishedAt =
      document.querySelector('meta[property="article:published_time"]')?.getAttribute('content')
      || document.querySelector('meta[name="publish-date"]')?.getAttribute('content')
      || null
  }
  if (!data.publishedAt) {
    try {
      document.querySelectorAll('script[type="application/ld+json"]').forEach((script) => {
        if (data.publishedAt) return
        const json = JSON.parse(script.textContent || '{}')
        const candidates = [
          json.datePublished,
          json?.['@graph']?.find?.((x) => x.datePublished)?.datePublished
        ]
        for (const d of candidates) {
          if (d) { data.publishedAt = d; break }
        }
      })
    } catch {}
  }
  if (!data.publishedAt) {
    try {
      const m = document.documentElement.innerHTML.match(/\\\\?"publishedOn\\\\?":\\\\?"([^"\\\\]+)/)
      if (m && m[1]) data.publishedAt = m[1]
    } catch {}
  }

  document.querySelectorAll('a[href*="/authors/"], [data-testid="author-name"], .author').forEach((el) => {
    const name = el.textContent?.trim()
    if (name && !data.authors.includes(name)) data.authors.push(name)
  })
  if (data.authors.length === 0) {
    const authorMeta = document.querySelector('meta[name="author"]')?.getAttribute('content')
    if (authorMeta) data.authors.push(authorMeta)
  }
  if (data.authors.length === 0) {
    try {
      document.querySelectorAll('script[type="application/ld+json"]').forEach((script) => {
        if (data.authors.length > 0) return
        const json = JSON.parse(script.textContent || '{}')
        const author = json.author?.name || json?.['@graph']?.find?.((x) => x.author)?.author?.name
        if (author && !data.authors.includes(author)) data.authors.push(author)
      })
    } catch {}
  }

  data.summary =
    document.querySelector('meta[property="og:description"]')?.getAttribute('content')
    || document.querySelector('meta[name="twitter:description"]')?.getAttribute('content')
    || document.querySelector('meta[name="description"]')?.getAttribute('content')
    || ''

  const selectors = ${JSON.stringify(selectors)}
  let contentEl = null
  for (const sel of selectors) {
    contentEl = document.querySelector(sel)
    if (contentEl) break
  }

  if (contentEl) {
    const clone = contentEl.cloneNode(true)
    clone.querySelectorAll('nav, header, footer, aside, script, style, form, .related-posts').forEach((el) => el.remove())
    clone.querySelectorAll('img').forEach((img) => {
      const src = img.getAttribute('src') || img.getAttribute('data-src')
      if (src) {
        img.setAttribute('src', new URL(src, window.location.href).toString())
        img.removeAttribute('data-src')
      }
    })
    data.contentHtml = clone.innerHTML.trim()
    clone.querySelectorAll('img').forEach((img) => {
      const src = img.getAttribute('src')
      if (src) data.images.push({ url: src, alt: img.getAttribute('alt') || '' })
    })
  }

  return data
})()`
}

async function extractArticle(
  url: string,
  listingMeta: AnthropicArticleMeta | null,
  source: AnthropicSource
) {
  const result = await runScriptInScraperWindow<{
    title: string
    url: string
    publishedAt: string | null
    authors: string[]
    summary: string
    contentHtml: string
    images: { url: string; alt: string }[]
  }>(buildArticleScript(source), {
    url,
    waitForSelector: source.contentSelectors?.[0] ?? 'main, article, [role="main"]',
  })

  const pageImages = await runScriptInScraperWindow<
    { url: string | null; alt: string }[]
  >(
    `Array.from(document.querySelectorAll('d-article img, article img, main img')).map((img) => ({
      url: img.getAttribute('src') || img.getAttribute('data-src'),
      alt: img.getAttribute('alt') || ''
    })).filter((img) => img.url)`,
    { url, timeoutMs: 30000 }
  )

  const imageMap = new Map<string, { url: string; alt: string }>()
  for (const img of [...result.images, ...pageImages]) {
    if (!img.url || img.url.includes('data:image')) continue
    const absolute = new URL(img.url, url).toString()
    imageMap.set(absolute, { url: absolute, alt: img.alt })
  }
  const images = Array.from(imageMap.values())

  const markdown = result.contentHtml ? turndown.turndown(result.contentHtml) : ''

  const GENERIC_SUMMARY_MARKERS = [
    'Anthropic is an AI safety',
    'reliable, interpretable, and steerable AI systems',
  ]
  const isGeneric = result.summary && GENERIC_SUMMARY_MARKERS.some((marker) => result.summary.includes(marker))
  const summary = result.summary && !isGeneric
    ? result.summary
    : (listingMeta?.summary || firstParagraphToSummary(markdown))

  return {
    title: result.title,
    url: result.url,
    publishedAt: result.publishedAt || listingMeta?.publishedAt || new Date().toISOString(),
    authors: result.authors.length > 0 ? result.authors : ['Anthropic'],
    summary,
    content: { markdown, html: result.contentHtml },
    images,
    scrapedAt: new Date().toISOString(),
  }
}

function imageFileName(url: string): string {
  try {
    const u = new URL(url)
    const base = path.basename(u.pathname)
    const clean = base.replace(/[^a-zA-Z0-9._-]/g, '_')
    if (clean && clean.includes('.')) return clean
    if (clean) return `${clean}.jpg`
  } catch {}
  return `image-${Date.now()}.jpg`
}

async function downloadImages(
  images: { url: string; alt: string }[],
  assetsDir: string
): Promise<Map<string, string>> {
  fs.mkdirSync(assetsDir, { recursive: true })
  const map = new Map<string, string>()
  const usedNames = new Set<string>()

  for (const { url } of images) {
    if (!url || map.has(url)) continue
    let name = imageFileName(url)
    if (usedNames.has(name)) {
      const ext = path.extname(name)
      const base = path.basename(name, ext)
      let counter = 2
      let candidate = `${base}-${counter}${ext}`
      while (usedNames.has(candidate)) {
        counter++
        candidate = `${base}-${counter}${ext}`
      }
      name = candidate
    }
    usedNames.add(name)
    const dest = path.join(assetsDir, name)
    try {
      const res = await httpFetch(url)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const buffer = Buffer.from(await res.arrayBuffer())
      fs.writeFileSync(dest, buffer)
      map.set(url, `./.assets/${name}`)
    } catch (err) {
      console.error(`[anthropic-scraper] failed to download image ${url}:`, err)
      // Fallback: keep absolute URL
      map.set(url, url)
    }
  }
  return map
}

function rewriteMarkdownImages(markdown: string, urlMap: Map<string, string>): string {
  return markdown.replace(
    /!\[([^\]]*)\]\(([^)]+)\)/g,
    (_full, alt: string, url: string) => {
      const replacement = urlMap.get(url) || url
      return `![${alt}](${replacement})`
    }
  )
}

export async function importArticle(
  url: string,
  libraryRoot: string,
  listingMeta: AnthropicArticleMeta | null = null
): Promise<{ filePath: string; wasAlreadySaved: boolean }> {
  const saved = findSavedArticles(libraryRoot)
  const existing = saved.get(url)
  if (existing) {
    // Verify the file still exists on disk; re-import if the user deleted it.
    if (fs.existsSync(existing)) return { filePath: existing, wasAlreadySaved: true }
  }

  const section = listingMeta?.section ?? sectionForUrl(url)
  // institute 等遗留 URL 不在 ANTHROPIC_SOURCES 中，回落 engineering 默认链
  const source = ANTHROPIC_SOURCES.find((s) => s.key === section) ?? ANTHROPIC_SOURCES.find((s) => s.key === 'engineering')!
  const article = await extractArticle(url, listingMeta, source)
  const publishedAt = article.publishedAt || new Date().toISOString()
  const folder = getImportFolder(publishedAt)
  const dir = path.join(libraryRoot, IMPORT_DIR, folder)
  fs.mkdirSync(dir, { recursive: true })

  const baseName = safeFileName(article.title) || 'untitled'
  let filePath = path.join(dir, `${baseName}.md`)
  let counter = 2
  while (fs.existsSync(filePath)) {
    filePath = path.join(dir, `${baseName}-${counter}.md`)
    counter++
  }

  const assetsDir = path.join(path.dirname(filePath), '.assets')
  const urlMap = await downloadImages(article.images, assetsDir)
  const markdownWithLocalImages = rewriteMarkdownImages(article.content.markdown, urlMap)

  const raw = serializeFrontmatter(
    'anthropic-article',
    {
      title: article.title,
      type: 'anthropic-article',
      created: publishedAt,
      tags: ['anthropic', section],
      section,
      source_url: article.url,
      published_at: publishedAt,
      imported_at: new Date().toISOString(),
      authors: article.authors,
      summary: article.summary || firstParagraphToSummary(article.content.markdown) || undefined,
      description: article.summary || firstParagraphToSummary(article.content.markdown) || undefined,
    },
    markdownWithLocalImages
  )

  fs.writeFileSync(filePath, raw, 'utf8')
  return { filePath, wasAlreadySaved: false }
}
