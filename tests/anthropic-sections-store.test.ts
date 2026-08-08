import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/ipc', () => ({
  ipc: {
    anthropicDiscover: vi.fn(),
    patchState: vi.fn(),
    getState: vi.fn(),
    scanLibrary: vi.fn().mockResolvedValue([]),
    loadSessions: vi.fn().mockResolvedValue([]),
    loadGroups: vi.fn().mockResolvedValue({ groups: [], mapping: {} }),
  },
}))

import { ipc } from '@/lib/ipc'
import { useStore } from '@/store'

describe('discoverAnthropicArticles sectionStatus', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useStore.setState({
      anthropicBlogCache: { lastFetchedAt: null, articles: [], loading: false, error: null, sectionStatus: {} },
    } as never)
  })

  it('commit 时写入最新 sectionStatus', async () => {
    const sectionStatus = {
      engineering: { fetchedAt: '2026-08-07T00:00:00.000Z', error: null },
      institute: { fetchedAt: null, error: { code: 'parse-error', message: '解析失败' } },
    }
    vi.mocked(ipc.anthropicDiscover).mockResolvedValue({
      ok: true,
      lastFetchedAt: '2026-08-07T00:00:00.000Z',
      articles: [],
      sectionStatus,
    } as never)
    const result = await useStore.getState().discoverAnthropicArticles()
    expect(result.ok).toBe(true)
    expect(useStore.getState().anthropicBlogCache.sectionStatus).toEqual(sectionStatus)
  })

  it('整体失败时保留旧 sectionStatus', async () => {
    const old = { engineering: { fetchedAt: '2026-08-06T00:00:00.000Z', error: null } }
    useStore.setState({
      anthropicBlogCache: { lastFetchedAt: null, articles: [], loading: false, error: null, sectionStatus: old },
    } as never)
    vi.mocked(ipc.anthropicDiscover).mockResolvedValue({
      ok: false, code: 'network-error', message: '网络连接失败，请检查网络后重试',
    } as never)
    const result = await useStore.getState().discoverAnthropicArticles()
    expect(result.ok).toBe(false)
    expect(useStore.getState().anthropicBlogCache.sectionStatus).toEqual(old)
  })
})

describe('backfill merge (mergeAnthropicArticles)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('按 URL 覆盖：占位文章获得 title/publishedAt', () => {
    useStore.setState({
      anthropicBlogCache: {
        lastFetchedAt: '2026-08-07T00:00:00.000Z',
        articles: [
          { url: 'https://www.anthropic.com/research/x', title: null, summary: null, publishedAt: null, imageUrl: null, section: 'research' },
        ],
        loading: false, error: null, sectionStatus: {},
      },
    } as never)
    useStore.getState().mergeAnthropicArticles(
      [{ url: 'https://www.anthropic.com/research/x', title: 'Real title', summary: 'S', publishedAt: '2026-08-01T00:00:00.000Z', imageUrl: null, section: 'research' }],
      '2026-08-07T00:00:00.000Z'
    )
    const articles = useStore.getState().anthropicBlogCache.articles
    expect(articles).toHaveLength(1)
    expect(articles[0].title).toBe('Real title')
    expect(articles[0].publishedAt).toBe('2026-08-01T00:00:00.000Z')
  })

  it('覆盖时保留既有 isSaved/filePath，不因回填元数据清空保存态', () => {
    useStore.setState({
      anthropicBlogCache: {
        lastFetchedAt: null,
        articles: [
          { url: 'X', title: null, summary: null, publishedAt: null, imageUrl: null, section: 'engineering', isSaved: true, filePath: '/tmp/x.md' },
        ],
        loading: false, error: null, sectionStatus: {},
      },
    } as never)
    useStore.getState().mergeAnthropicArticles(
      [{ url: 'X', title: 'T', summary: null, publishedAt: null, imageUrl: null, section: 'engineering', isSaved: false }],
      '2026-08-07T00:00:00.000Z'
    )
    const a = useStore.getState().anthropicBlogCache.articles[0]
    expect(a.title).toBe('T')
    expect(a.isSaved).toBe(true)
    expect(a.filePath).toBe('/tmp/x.md')
  })

  it('新 URL 置前，不产生重复', () => {
    useStore.setState({
      anthropicBlogCache: {
        lastFetchedAt: null,
        articles: [{ url: 'A', title: 'A', summary: null, publishedAt: null, imageUrl: null, section: 'engineering' }],
        loading: false, error: null, sectionStatus: {},
      },
    } as never)
    useStore.getState().mergeAnthropicArticles(
      [{ url: 'B', title: 'B', summary: null, publishedAt: null, imageUrl: null, section: 'product' }],
      '2026-08-07T00:00:00.000Z'
    )
    const urls = useStore.getState().anthropicBlogCache.articles.map((a) => a.url)
    expect(urls).toEqual(['B', 'A'])
  })
})

describe('articleMetaCache 旧 state 兼容', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('旧 state 无 articleMetaCache 字段时 init 缺省 {}', async () => {
    vi.mocked(ipc.getState).mockResolvedValue({
      version: 1,
      profile: { name: '', profile_text: '', preferred_topics: [] },
      lastUsed: { difficulty: 'mid', temperature: 0.7 },
      groupInspirations: {},
      ui: { session_count: 0 },
      anthropicBlogCache: {
        lastFetchedAt: null,
        articles: [],
        loading: false,
        error: null,
        sectionStatus: {},
        // 旧格式：无 articleMetaCache
      },
    } as never)
    await useStore.getState().init()
    expect(useStore.getState().anthropicBlogCache.articleMetaCache).toEqual({})
  })
})
