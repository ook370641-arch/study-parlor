import { describe, expect, it } from 'vitest'
import { coverImageUrl, findNewArticleUrls, mergeNewArticles, sortArticlesByDateDesc, sortBlogArticles } from '@/lib/anthropic-articles'
import type { AnthropicArticleMeta } from '@shared/index'

function article(url: string): AnthropicArticleMeta {
  return {
    url,
    title: url,
    summary: null,
    publishedAt: null,
    imageUrl: null,
  }
}

describe('anthropic article helpers', () => {
  it('finds new urls not in cache', () => {
    const cached = [article('a'), article('b')]
    const fetched = [article('b'), article('c'), article('d')]
    expect(findNewArticleUrls(cached, fetched)).toEqual(['c', 'd'])
  })

  it('returns empty when all urls exist', () => {
    const cached = [article('a'), article('b')]
    const fetched = [article('a'), article('b')]
    expect(findNewArticleUrls(cached, fetched)).toEqual([])
  })

  it('merges new articles at front preserving old order', () => {
    const cached = [article('a'), article('b')]
    const newArticles = [article('c'), article('b')]
    expect(mergeNewArticles(cached, newArticles).map((a) => a.url)).toEqual(['c', 'a', 'b'])
  })

  it('handles empty cache', () => {
    const fetched = [article('a'), article('b')]
    expect(findNewArticleUrls([], fetched)).toEqual(['a', 'b'])
    expect(mergeNewArticles([], fetched)).toEqual(fetched)
  })
})

describe('sortArticlesByDateDesc', () => {
  it('local 条目在前，其余按 publishedAt 倒序，缺失日期排尾', () => {
    const a = (url: string, publishedAt: string | null, local?: 'constitution') =>
      ({ url, title: url, summary: null, publishedAt, imageUrl: null, local })
    const sorted = sortArticlesByDateDesc([
      a('old', '2026-07-01T00:00:00.000Z'),
      a('const', null, 'constitution'),
      a('new', '2026-08-05T00:00:00.000Z'),
      a('nodate', null),
    ])
    expect(sorted.map((x) => x.url)).toEqual(['const', 'new', 'old', 'nodate'])
  })
})

describe('sortBlogArticles', () => {
  const a = (url: string, publishedAt: string | null, local?: 'constitution') =>
    ({ url, title: url, summary: null, publishedAt, imageUrl: null, local })

  it('支持最新/最早排序，本地条目置顶且缺失日期始终排尾', () => {
    const input = [a('nodate', null), a('old', '2026-07-01'), a('const', null, 'constitution'), a('new', '2026-08-05')]
    expect(sortBlogArticles(input, 'newest').map(x => x.url)).toEqual(['const', 'new', 'old', 'nodate'])
    expect(sortBlogArticles(input, 'oldest').map(x => x.url)).toEqual(['const', 'old', 'new', 'nodate'])
  })
})

describe('coverImageUrl', () => {
  it('Sanity 与 Anthropic CDN 统一使用 512px 缩略图并保留其他参数', () => {
    for (const host of ['cdn.sanity.io', 'www-cdn.anthropic.com']) {
      const result = new URL(coverImageUrl(`https://${host}/images/example.jpg?token=abc&w=3840`))
      expect(result.searchParams.get('w')).toBe('512')
      expect(result.searchParams.get('q')).toBe('75')
      expect(result.searchParams.get('auto')).toBe('format')
      expect(result.searchParams.get('token')).toBe('abc')
    }
  })

  it('其他图片来源保持原 URL', () => {
    const url = 'https://img.test/a.jpg'
    expect(coverImageUrl(url)).toBe(url)
  })

  it('Next.js 图片代理解包为 CDN 直链，避免代理不支持的 512px 宽度', () => {
    const source = 'https://www.anthropic.com/_next/image?url=https%3A%2F%2Fwww-cdn.anthropic.com%2Fimages%2Fa.jpg&w=3840&q=75'
    expect(coverImageUrl(source)).toBe('https://www-cdn.anthropic.com/images/a.jpg?w=512&q=75&auto=format')
  })
})
