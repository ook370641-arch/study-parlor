import { describe, it, expect, vi, beforeEach } from 'vitest'

const anthropicDeleteArticle = vi.fn()
vi.mock('@/lib/ipc', () => ({
  ipc: {
    anthropicDeleteArticle: (...args: unknown[]) => anthropicDeleteArticle(...args),
  },
}))

import { useStore } from '@/store'

describe('deleteAnthropicArticle', () => {
  beforeEach(() => {
    anthropicDeleteArticle.mockReset()
    useStore.setState({
      anthropicBlogCache: {
        articles: [
          { url: 'https://a', title: 'A', isSaved: true, filePath: '/lib/Anthropic博客/a.md' },
          { url: 'https://b', title: 'B', isSaved: false, filePath: null },
        ],
        loading: false, error: null, lastFetchedAt: null,
      },
      anthropicReaderFilePath: '/lib/Anthropic博客/a.md',
      showToast: vi.fn(),
    } as any)
  })

  it('marks article unsaved and closes the reader after successful delete', async () => {
    anthropicDeleteArticle.mockResolvedValue({ ok: true })
    await useStore.getState().deleteAnthropicArticle('/lib/Anthropic博客/a.md')
    const s = useStore.getState()
    expect(s.anthropicBlogCache.articles[0].isSaved).toBe(false)
    expect(s.anthropicBlogCache.articles[0].filePath).toBeUndefined()
    expect(s.anthropicBlogCache.articles[1].isSaved).toBe(false)
    expect(s.anthropicReaderFilePath).toBeNull()
  })

  it('keeps state and toasts on failure', async () => {
    anthropicDeleteArticle.mockResolvedValue({ ok: false, message: '文件不存在或路径非法' })
    await useStore.getState().deleteAnthropicArticle('/lib/Anthropic博客/a.md')
    const s = useStore.getState()
    expect(s.anthropicBlogCache.articles[0].isSaved).toBe(true)
    expect(s.showToast).toHaveBeenCalled()
  })
})
