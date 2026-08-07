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
      title: m[3].replace(/<[^>]+>/g, '').trim() || null,
      summary: m[4].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim() || null,
      imageUrl: null,
    })
  }
  return out
}

function unescapeXml(s: string): string {
  return s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'")
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
