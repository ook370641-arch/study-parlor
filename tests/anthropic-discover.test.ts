import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { parseAlignmentIndex, parseAtomFeed, parseSitemapUrls } from '../electron/lib/anthropic-discover'
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
