import { describe, expect, it } from 'vitest'
import { deriveBlogMineGroups, reconcileBlogOrder, reorderBlog } from '@/lib/blog-groups'
import type { AnthropicArticleMeta, BlogCollectionFile } from '@shared/index'

const articles: AnthropicArticleMeta[] = [
  { url: 'saved', title: 'Saved', summary: null, publishedAt: '2026-01-01', imageUrl: null, isSaved: true, filePath: 'saved.md' },
  { url: 'read', title: 'Read', summary: null, publishedAt: '2026-01-02', imageUrl: null, isSaved: true, filePath: 'read.md' },
  { url: 'favorite', title: 'Favorite', summary: null, publishedAt: '2026-01-03', imageUrl: null, isSaved: true, filePath: 'favorite.md' },
]

const collection: BlogCollectionFile = {
  version: 1,
  entries: [{ sourceUrl: 'favorite', filePath: 'favorite.md', title: 'Favorite', addedAt: 'x', origin: 'manual' }],
  dismissed: [],
  history: [],
  read: [{ sourceUrl: 'read', filePath: 'read.md', title: 'Read', readAt: 'x' }],
}

describe('reconcileBlogOrder', () => {
  it('旧数据派生三组，已读和收藏不重复进入已保存', () => {
    const order = reconcileBlogOrder(collection, articles)

    expect(order).toEqual({
      groups: ['saved', 'read', 'favorite'],
      saved: ['saved'],
      read: ['read'],
      favorite: ['favorite'],
    })
  })

  it('标已读后从已保存移到已读首位', () => {
    const readSavedCollection: BlogCollectionFile = {
      ...collection,
      read: [{ sourceUrl: 'saved', filePath: 'saved.md', title: 'Saved', readAt: 'x' }, ...collection.read],
    }

    const order = reconcileBlogOrder(readSavedCollection, articles, { sourceUrl: 'saved', to: 'read', position: 'prepend' })

    expect(order.saved).toEqual([])
    expect(order.read).toEqual(['saved', 'read'])
  })

  it('取消已读后回到已保存，并按请求放到首位', () => {
    const unreadCollection: BlogCollectionFile = { ...collection, read: [] }

    const order = reconcileBlogOrder(unreadCollection, articles, { sourceUrl: 'read', to: 'saved', position: 'prepend' })

    expect(order.saved).toEqual(['read', 'saved'])
    expect(order.read).toEqual([])
  })

  it('清理非法分组、非法 URL 和重复项并补齐缺失分组', () => {
    const corrupted: BlogCollectionFile = {
      ...collection,
      order: {
        groups: ['favorite', 'favorite', 'bogus', 'read'] as never,
        saved: ['saved', 'saved', 'missing'],
        read: ['missing', 'read', 'read'],
        favorite: ['missing', 'favorite'],
      },
    }

    expect(reconcileBlogOrder(corrupted, articles)).toEqual({
      groups: ['favorite', 'read', 'saved'],
      saved: ['saved'],
      read: ['read'],
      favorite: ['favorite'],
    })
  })

  it('收藏保持手动在前，已保存按发布日期倒序补齐', () => {
    const unorderedArticles: AnthropicArticleMeta[] = [
      { ...articles[0], url: 'old', publishedAt: '2025-01-01' },
      { ...articles[0], url: 'new', publishedAt: '2026-02-01' },
    ]
    const unorderedCollection: BlogCollectionFile = {
      ...collection,
      entries: [
        { sourceUrl: 'recommended', filePath: 'r.md', title: 'Recommended', addedAt: 'x', origin: 'recommend' },
        { sourceUrl: 'manual', filePath: 'm.md', title: 'Manual', addedAt: 'y', origin: 'manual' },
      ],
      read: [],
    }

    const order = reconcileBlogOrder(unorderedCollection, unorderedArticles)

    expect(order.saved).toEqual(['new', 'old'])
    expect(order.favorite).toEqual(['manual', 'recommended'])
  })
})

describe('deriveBlogMineGroups', () => {
  it('缓存缺少收藏和已读文章时仍生成可打开的 fallback meta', () => {
    const order = reconcileBlogOrder(collection, [])

    const groups = deriveBlogMineGroups([], { ...collection, order })

    expect(groups.read[0]).toMatchObject({ url: 'read', title: 'Read', filePath: 'read.md' })
    expect(groups.favorite[0]).toMatchObject({ url: 'favorite', title: 'Favorite', filePath: 'favorite.md' })
    expect(groups.saved).toEqual([])
  })
})

describe('reorderBlog', () => {
  it('过滤视图只按可见目标改变相对顺序', () => {
    const base = reconcileBlogOrder(collection, articles)
    const order = { ...base, saved: ['a', 'hidden', 'b', 'c'] }

    expect(reorderBlog(order, { kind: 'article', group: 'saved', sourceUrl: 'a', targetUrl: 'b', placement: 'after' }).saved)
      .toEqual(['hidden', 'b', 'a', 'c'])
    expect(reorderBlog(order, { kind: 'article', group: 'saved', sourceUrl: 'a', targetUrl: 'a', placement: 'after' })).toBe(order)
  })

  it('分组可排序，未知源或目标不会破坏顺序', () => {
    const order = reconcileBlogOrder(collection, articles)

    expect(reorderBlog(order, { kind: 'group', source: 'favorite', target: 'saved', placement: 'before' }).groups)
      .toEqual(['favorite', 'saved', 'read'])
    expect(reorderBlog(order, { kind: 'group', source: 'saved', target: 'bogus' as never, placement: 'after' })).toBe(order)
    expect(reorderBlog(order, { kind: 'article', group: 'saved', sourceUrl: 'missing', targetUrl: 'saved', placement: 'after' })).toBe(order)
  })
})
