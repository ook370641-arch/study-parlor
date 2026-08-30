import { describe, it, expect } from 'vitest'
import { findReadTarget } from '../src/lib/blog-read-lookup'
import type { BlogCollectionEntry, AnthropicArticleMeta } from '../src/types'

const entry = (over: Partial<BlogCollectionEntry> = {}): BlogCollectionEntry => ({
  sourceUrl: 'https://anthropic.com/a', filePath: 'lib/a.md', title: 'A', addedAt: 'x', origin: 'manual', ...over,
})
const article = (over: Partial<AnthropicArticleMeta> = {}): AnthropicArticleMeta => ({
  url: 'https://anthropic.com/b', title: 'B', summary: null, publishedAt: null, imageUrl: null,
  isSaved: true, filePath: 'lib/b.md', ...over,
} as AnthropicArticleMeta)

describe('findReadTarget', () => {
  it('收藏夹条目命中优先', () => {
    const t = findReadTarget('lib/a.md', { entries: [entry()], articles: [article({ filePath: 'lib/a.md' })] })
    expect(t).toEqual({ sourceUrl: 'https://anthropic.com/a', title: 'A', filePath: 'lib/a.md' })
  })
  it('收藏夹未命中时回退文章缓存', () => {
    const t = findReadTarget('lib/b.md', { entries: [], articles: [article()] })
    expect(t).toEqual({ sourceUrl: 'https://anthropic.com/b', title: 'B', filePath: 'lib/b.md' })
  })
  it('两处都查不到返回 null', () => {
    expect(findReadTarget('lib/z.md', { entries: [], articles: [] })).toBeNull()
  })
  it('缓存中未保存（无 filePath）的文章不命中', () => {
    const t = findReadTarget('lib/b.md', { entries: [], articles: [article({ isSaved: false, filePath: undefined })] })
    expect(t).toBeNull()
  })
})
