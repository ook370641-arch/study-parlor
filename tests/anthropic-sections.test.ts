import { describe, it, expect } from 'vitest'
import {
  ANTHROPIC_SOURCES as MAIN_SOURCES,
  LEGACY_SECTION_META as MAIN_LEGACY,
  sectionForUrl as mainSectionForUrl,
} from '../electron/lib/anthropic-sections'
import {
  ANTHROPIC_SOURCES as RENDER_SOURCES,
  LEGACY_SECTION_META as RENDER_LEGACY,
  sectionForUrl,
  sectionOf,
  filterGroupOf,
} from '../src/lib/anthropic-sections'

describe('ANTHROPIC_SOURCES config', () => {
  it('has exactly the five sources in order (dedup priority)', () => {
    expect(MAIN_SOURCES.map((s) => s.key)).toEqual([
      'engineering',
      'research',
      'alignment',
      'interpretability',
      'product',
    ])
  })

  it('research excludes team pages', () => {
    const research = MAIN_SOURCES.find((s) => s.key === 'research')
    expect(research?.excludePrefixes).toEqual(['/research/team/'])
  })

  it('sitemap 源带 sitemapUrl 与 linkPrefix/sitemapInclude；static-list/rss 不带', () => {
    const sitemapKeys = MAIN_SOURCES.filter((s) => s.discover === 'sitemap').map((s) => s.key)
    expect(sitemapKeys).toEqual(['engineering', 'research', 'product'])
    for (const s of MAIN_SOURCES) {
      if (s.discover === 'sitemap') expect(s.sitemapUrl).toBeTruthy()
      else expect(s.sitemapUrl).toBeUndefined()
    }
  })

  it('each source has a valid color and indexUrl', () => {
    for (const s of MAIN_SOURCES) {
      expect(s.indexUrl).toBeTruthy()
      expect(s.color).toMatch(/^#[0-9a-f]{6}$/)
    }
  })

  it('www.anthropic.com 源的 indexUrl 匹配其 linkPrefix', () => {
    for (const s of MAIN_SOURCES) {
      if (!s.linkPrefix) continue
      expect(s.indexUrl).toBe(`https://www.anthropic.com${s.linkPrefix.slice(0, -1)}`)
    }
  })

  it('product 用 sitemapInclude 排除本地化前缀', () => {
    const product = MAIN_SOURCES.find((s) => s.key === 'product')!
    expect(product.sitemapInclude?.test('https://claude.com/blog/1m-context')).toBe(true)
    expect(product.sitemapInclude?.test('https://claude.com/ja/blog/foo')).toBe(false)
    expect(product.sitemapInclude?.test('https://claude.com/')).toBe(false)
  })

  it('LEGACY_SECTION_META 仅 institute 一键', () => {
    expect(MAIN_LEGACY).toEqual({ institute: { label: 'Institute', color: '#8a9a5b' } })
  })

  it('renderer copy stays in sync with main copy (sources + legacy meta)', () => {
    expect(RENDER_SOURCES).toEqual(MAIN_SOURCES)
    expect(RENDER_LEGACY).toEqual(MAIN_LEGACY)
  })
})

describe('sectionForUrl', () => {
  it('maps each source url to its key', () => {
    expect(sectionForUrl('https://www.anthropic.com/engineering/foo')).toBe('engineering')
    expect(sectionForUrl('https://www.anthropic.com/research/global-workspace')).toBe('research')
    expect(sectionForUrl('https://alignment.anthropic.com/2026/msm/')).toBe('alignment')
    expect(sectionForUrl('https://transformer-circuits.pub/2026/workspace/index.html')).toBe('interpretability')
    expect(sectionForUrl('https://claude.com/blog/1m-context')).toBe('product')
    expect(sectionForUrl('https://www.anthropic.com/institute/recursive-self-improvement')).toBe('institute')
  })

  it('falls back to engineering for unknown urls', () => {
    expect(sectionForUrl('https://www.anthropic.com/news/claude-opus-5')).toBe('engineering')
    expect(sectionForUrl('')).toBe('engineering')
  })
})

describe('sectionOf', () => {
  it('prefers meta.section over url inference', () => {
    expect(sectionOf({ url: 'https://www.anthropic.com/institute/x', section: 'research' })).toBe('research')
  })

  it('infers from url when section missing (old cache)', () => {
    expect(sectionOf({ url: 'https://www.anthropic.com/research/x' })).toBe('research')
    expect(sectionOf({ url: 'https://www.anthropic.com/engineering/x' })).toBe('engineering')
  })
})

describe('filterGroupOf', () => {
  it('groups constitution into engineering', () => {
    expect(filterGroupOf({ local: 'constitution', url: 'x' })).toBe('engineering')
  })

  it('maps legacy institute to research', () => {
    expect(filterGroupOf({ url: 'https://www.anthropic.com/institute/x' })).toBe('research')
  })

  it('passes through other sources', () => {
    expect(filterGroupOf({ url: 'https://alignment.anthropic.com/2026/msm/' })).toBe('alignment')
    expect(filterGroupOf({ url: 'https://transformer-circuits.pub/2026/workspace/index.html' })).toBe('interpretability')
    expect(filterGroupOf({ url: 'https://claude.com/blog/1m-context' })).toBe('product')
    expect(filterGroupOf({ url: 'https://www.anthropic.com/engineering/x' })).toBe('engineering')
  })
})
