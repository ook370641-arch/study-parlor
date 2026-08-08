import type { AnthropicSource } from './anthropic-sections'

export interface DiscoveredLink {
  url: string
  title: string | null
  summary: string | null
  dateText: string | null
  imageUrl: string | null
}

/** sitemap <url> 条目按来源配置过滤；输出保持 sitemap 原顺序 */
export function parseSitemapUrls(xml: string, source: AnthropicSource): { url: string; lastmod: string | null }[] {
  const out: { url: string; lastmod: string | null }[] = []
  const seen = new Set<string>()
  for (const m of xml.matchAll(/<url>\s*<loc>([^<]+)<\/loc>(?:\s*<lastmod>([^<]*)<\/lastmod>)?[\s\S]*?<\/url>/g)) {
    const url = m[1]
    if (source.sitemapInclude && !source.sitemapInclude.test(url)) continue
    if (source.linkPrefix && !url.includes(source.linkPrefix)) continue
    if (source.excludePrefixes?.some((p) => url.includes(p))) continue
    if (seen.has(url)) continue
    seen.add(url)
    out.push({ url, lastmod: m[2] ?? null })
  }
  return out
}

/** alignment 首页：date 头对后续连续卡片生效，直到下一个 date 头；只收同源内链（外链 arxiv/drive/anthropic.research 不是本博客文章） */
export function parseAlignmentIndex(html: string, baseUrl: string): DiscoveredLink[] {
  const out: DiscoveredLink[] = []
  const tokenRe = /<div class="date">([^<]+)<\/div>|<a href="([^"]+)" class="note">\s*<h3>([\s\S]*?)<\/h3>\s*<div class="description">([\s\S]*?)<\/div>\s*<\/a>/g
  let currentDate: string | null = null
  for (const m of html.matchAll(tokenRe)) {
    if (m[1] !== undefined) { currentDate = m[1].trim(); continue }
    if (/^https?:\/\//.test(m[2])) continue // 外链卡片排除
    out.push({
      url: new URL(m[2], baseUrl).toString(),
      dateText: currentDate,
      title: unescapeXml(m[3].replace(/<[^>]+>/g, '')).trim() || null,
      summary: unescapeXml(m[4].replace(/<[^>]+>/g, '')).replace(/\s+/g, ' ').trim() || null,
      imageUrl: null,
    })
  }
  return out
}

function unescapeXml(s: string): string {
  return s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/&ndash;/g, '–').replace(/&mdash;/g, '—')
}

/** Atom feed（transformer-circuits.pub/feed.xml）；entry URL 保留 /index.html 原样；只收 circuits 本域 link（feed 转发的外站 entry 非本博客文章） */
export function parseAtomFeed(xml: string): DiscoveredLink[] {
  const out: DiscoveredLink[] = []
  for (const m of xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g)) {
    const e = m[1]
    const url = e.match(/<link[^>]*href="([^"]+)"/)?.[1]
    if (!url || !url.includes('transformer-circuits.pub')) continue
    const title = e.match(/<title>([\s\S]*?)<\/title>/)?.[1]
    const updated = e.match(/<updated>([^<]+)<\/updated>/)?.[1]
    const summary = e.match(/<summary>([\s\S]*?)<\/summary>/)?.[1]
    out.push({
      url,
      title: title ? unescapeXml(title).trim() || null : null,
      dateText: updated ?? null,
      summary: summary ? unescapeXml(summary).replace(/\s+/g, ' ').trim() || null : null,
      imageUrl: null,
    })
  }
  return out
}

export interface ArticleMeta {
  canonicalUrl: string
  title: string | null
  summary: string | null
  publishedAt: string | null
  imageUrl: string | null
}

/** Task 4 discover 与 IPC 用：articleMetaCache 的 value 结构（与 src/types/index.ts 的 articleMetaCache 字段一致） */
export type ArticleMetaCache = Record<string, { title: string | null; publishedAt: string | null; summary: string | null; imageUrl: string | null }>

/** 从文章页 HTML 提取元数据。og meta 属性顺序不固定（content 可在前），两种顺序都匹配；
 *  日期链：RSC "publishedOn" → JSON-LD datePublished → 正文日期文本（调用方再补 sitemap lastmod 兜底） */
export function parseArticleMetaHtml(html: string, finalUrl: string): ArticleMeta {
  const meta = (prop: string): string | null =>
    html.match(new RegExp(`<meta[^>]*property="${prop}"[^>]*content="([^"]*)"`, 'i'))?.[1]
    ?? html.match(new RegExp(`<meta[^>]*content="([^"]*)"[^>]*property="${prop}"`, 'i'))?.[1]
    ?? null
  const h1 = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/)?.[1]?.replace(/<[^>]+>/g, '').trim()
  const publishedOn = html.match(/\\?"publishedOn\\?":\\?"([^"\\]+)/)?.[1]
  const ldDate = html.match(/"datePublished"\s*:\s*"([^"]+)"/)?.[1]
  const dateText = html.match(/\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{1,2},?\s+\d{4}\b/)?.[0]
  return {
    canonicalUrl: finalUrl,
    title: meta('og:title') ?? h1 ?? null,
    summary: meta('og:description'),
    publishedAt: publishedOn ?? ldDate ?? dateText ?? null,
    imageUrl: meta('og:image'),
  }
}

export async function mapWithConcurrency<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length)
  let next = 0
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const i = next++
        results[i] = await fn(items[i])
      }
    })
  )
  return results
}
