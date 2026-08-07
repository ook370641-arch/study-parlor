import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { mapWithConcurrency, parseAlignmentIndex, parseArticleMetaHtml, parseAtomFeed, parseSitemapUrls } from '../electron/lib/anthropic-discover'
import { ANTHROPIC_SOURCES } from '../electron/lib/anthropic-sections'

const fx = (name: string) => fs.readFileSync(path.join(__dirname, 'fixtures/blog-sources', name), 'utf8')
const src = (key: string) => ANTHROPIC_SOURCES.find((s) => s.key === key)!

describe('parseSitemapUrls', () => {
  it('research: 144 篇，排除 team 页', () => {
    const urls = parseSitemapUrls(fx('anthropic-sitemap.xml'), src('research'))
    expect(urls.length).toBe(144)
    expect(urls.every((u) => !u.url.includes('/research/team/'))).toBe(true)
    expect(urls.every((u) => u.lastmod)).toBe(true)
  })
  it('engineering: 25 篇', () => {
    expect(parseSitemapUrls(fx('anthropic-sitemap.xml'), src('engineering')).length).toBe(25)
  })
  it('product: 204 篇英文，排除本地化前缀', () => {
    const urls = parseSitemapUrls(fx('claude-sitemap.xml'), src('product'))
    expect(urls.length).toBe(204)
    expect(urls.every((u) => /^https:\/\/claude\.com\/blog\/[^/]+$/.test(u.url))).toBe(true)
  })
})

describe('parseAlignmentIndex', () => {
  it('解析 54 篇内链文章（排除 4 条外部链接），标题/描述/月份齐全，date 头对连续卡片生效', () => {
    const links = parseAlignmentIndex(fx('alignment-index.html'), 'https://alignment.anthropic.com/')
    expect(links.length).toBe(54)
    for (const l of links) {
      expect(l.title).toBeTruthy()
      expect(l.dateText).toMatch(/\w+ \d{4}/)
      expect(l.url).toMatch(/^https:\/\/alignment\.anthropic\.com\/\d{4}\//)
    }
    // 外部链接（arxiv / drive / anthropic.com/research）不进入文章列表
    expect(links.every((l) => l.url.startsWith('https://alignment.anthropic.com/'))).toBe(true)
    // date 头后续卡片继承同一月份（July 2026 有两篇）
    const july = links.filter((l) => l.dateText === 'July 2026')
    expect(july.length).toBeGreaterThanOrEqual(2)
  })
  it('M1: title/summary 解 HTML 实体（&ndash; → –），不留字面实体给 React', () => {
    const links = parseAlignmentIndex(fx('alignment-index.html'), 'https://alignment.anthropic.com/')
    const openai = links.find((l) => l.url.endsWith('/2025/openai-findings/'))!
    expect(openai.title).toBe('Findings from a Pilot Anthropic–OpenAI Alignment Evaluation Exercise')
    expect(openai.title).not.toContain('&')
  })
})

describe('parseArticleMetaHtml', () => {
  it('主站老文章：RSC publishedOn + og:title', () => {
    const meta = parseArticleMetaHtml(fx('research-article-old.html'), 'https://www.anthropic.com/research/exploring-model-welfare')
    expect(meta.title).toBe('Exploring model welfare')
    expect(meta.publishedAt).toBe('2025-04-24T10:59:00.000Z')
  })
  it('claude 文章：og 属性顺序不固定也能取到标题；JSON-LD datePublished', () => {
    const meta = parseArticleMetaHtml(fx('claude-blog-article.html'), 'https://claude.com/blog/1m-context')
    expect(meta.title).toContain('1M')
    expect(meta.publishedAt).toBeTruthy()
  })
  it('缺字段不抛：空 HTML 全 null', () => {
    const meta = parseArticleMetaHtml('<html></html>', 'https://x.com/a')
    expect(meta).toEqual({ canonicalUrl: 'https://x.com/a', title: null, summary: null, publishedAt: null, imageUrl: null })
  })
})

describe('mapWithConcurrency', () => {
  it('保持顺序且限制并发', async () => {
    let active = 0, peak = 0
    const items = Array.from({ length: 20 }, (_, i) => i)
    const rs = await mapWithConcurrency(items, 4, async (i) => {
      active++; peak = Math.max(peak, active)
      await new Promise((r) => setTimeout(r, 5))
      active--
      return i * 2
    })
    expect(rs).toEqual(items.map((i) => i * 2))
    expect(peak).toBeLessThanOrEqual(4)
  })
})

describe('parseAtomFeed', () => {
  it('解析 51 条 circuits 内链 entry（排除 4 条转发外站 link），字段完整，保留 /index.html 结尾', () => {
    const links = parseAtomFeed(fx('circuits-feed.xml'))
    expect(links.length).toBe(51)
    for (const l of links) {
      expect(l.title).toBeTruthy()
      expect(l.url).toContain('transformer-circuits.pub')
      expect(l.dateText).toBeTruthy()
    }
  })
})
