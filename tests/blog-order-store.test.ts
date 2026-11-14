import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/ipc', () => ({
  ipc: {
    patchState: vi.fn(),
    getState: vi.fn(),
    anthropicCollectionReorder: vi.fn(),
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
})
