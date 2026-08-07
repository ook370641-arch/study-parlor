import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/ipc', () => ({
  ipc: {
    anthropicDiscover: vi.fn(),
    patchState: vi.fn(),
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
