import { describe, expect, it } from 'vitest'
import { findNewArticleUrls, mergeNewArticles, sortArticlesByDateDesc } from '@/lib/anthropic-articles'
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
