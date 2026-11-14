import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/ipc', () => ({
  ipc: {
    patchState: vi.fn(),
    getState: vi.fn(),
    anthropicCollectionReorder: vi.fn(),
    anthropicImportArticle: vi.fn(),
  },
}))
vi.mock('@/lib/paintings', () => ({ manifest: [], pickRandom: vi.fn(() => null) }))

import { ipc } from '@/lib/ipc'
import { useStore } from '@/store'
import type { BlogCollectionFile, BlogReorderRequest } from '@shared/index'

const previous: BlogCollectionFile = {
  version: 1,
  entries: [],
  dismissed: [],
  history: [],
  read: [],
  order: { groups: ['saved', 'read', 'favorite'], saved: ['a', 'b'], read: [], favorite: [] },
}
const request: BlogReorderRequest = {
  kind: 'article',
  group: 'saved',
  sourceUrl: 'a',
  targetUrl: 'b',
  placement: 'after',
}

describe('blog reorder store action', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useStore.setState({ blogCollection: previous, toast: null })
  })

  it('成功时使用主进程返回的完整 collection', async () => {
    const serverCollection: BlogCollectionFile = {
      ...previous,
      order: { ...previous.order!, saved: ['from-server'] },
    }
    vi.mocked(ipc.anthropicCollectionReorder).mockResolvedValue({ ok: true, collection: serverCollection })

    await useStore.getState().reorderBlog(request)

    expect(ipc.anthropicCollectionReorder).toHaveBeenCalledWith(request)
    expect(useStore.getState().blogCollection).toEqual(serverCollection)
  })

  it('失败时恢复拖拽前顺序并提示保存失败', async () => {
    vi.mocked(ipc.anthropicCollectionReorder).mockResolvedValue({ ok: false, message: 'disk full' })

    await useStore.getState().reorderBlog(request)

    expect(useStore.getState().blogCollection).toEqual(previous)
    expect(useStore.getState().toast?.message).toBe('排序保存失败，请重试')
  })

  it('导入成功时同步主进程返回的共享顺序', async () => {
    const serverCollection: BlogCollectionFile = {
      ...previous,
      order: { ...previous.order!, saved: ['a'] },
    }
    useStore.setState({
      anthropicBlogCache: {
        lastFetchedAt: null,
        articles: [{ url: 'a', title: 'A', summary: null, publishedAt: null, imageUrl: null, isSaved: false }],
        loading: false,
        error: null,
      },
    })
    vi.mocked(ipc.anthropicImportArticle).mockResolvedValue({
      ok: true,
      filePath: 'a.md',
      wasAlreadySaved: false,
      collection: serverCollection,
    })

    await useStore.getState().importAnthropicArticle('a')

    expect(useStore.getState().blogCollection).toEqual(serverCollection)
  })

  it('集合尚未载入 order 时按当前文章派生后再排序', async () => {
    useStore.setState({
      blogCollection: { ...previous, order: undefined },
      anthropicBlogCache: {
        lastFetchedAt: null,
        articles: ['a', 'b'].map(url => ({ url, title: url, summary: null, publishedAt: null, imageUrl: null, isSaved: true, filePath: `${url}.md` })),
        loading: false,
        error: null,
      },
    })
    const serverCollection: BlogCollectionFile = {
      ...previous,
      order: { ...previous.order!, saved: ['b', 'a'] },
    }
    vi.mocked(ipc.anthropicCollectionReorder).mockResolvedValue({ ok: true, collection: serverCollection })

    await useStore.getState().reorderBlog(request)

    expect(ipc.anthropicCollectionReorder).toHaveBeenCalledWith(request)
    expect(useStore.getState().blogCollection).toEqual(serverCollection)
  })
})
