import { describe, expect, it, vi, beforeEach } from 'vitest'

// Mock ipc before importing store
vi.mock('@/lib/ipc', () => ({
  ipc: {
    patchState: vi.fn(),
    articleAssistantReadGuide: vi.fn(),
    articleAssistantWriteGuide: vi.fn(),
    articleAssistantGenerateGuide: vi.fn(),
    articleAssistantReadSession: vi.fn(),
    articleAssistantWriteSession: vi.fn(),
    articleAssistantAbort: vi.fn()
  }
}))

vi.mock('@/lib/paintings', () => ({
  manifest: [{ id: 'test', painter: 'Test', title: 'Test', url: '/test.jpg' }],
  pickRandom: vi.fn((manifest: unknown[]) => manifest[0] ?? null)
}))

import { useStore } from '@/store'
import { ipc } from '@/lib/ipc'

const guideFixture = {
  chunks: [{ heading: '开头', summary: '介绍', body: '正文', startIndex: 0 }]
}

const flush = () => new Promise((r) => setTimeout(r, 0))

describe('store article assistant', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useStore.setState({ assistantSession: null, articleAssistantGuideWidth: 320, articleAssistantGuideCollapsed: false })
    vi.mocked(ipc.articleAssistantReadGuide).mockResolvedValue(null)
    vi.mocked(ipc.articleAssistantReadSession).mockResolvedValue(null)
    vi.mocked(ipc.articleAssistantGenerateGuide).mockResolvedValue(guideFixture as any)
    vi.mocked(ipc.articleAssistantWriteGuide).mockResolvedValue({ filePath: '/guide.json' })
  })

  describe('openAssistantSession', () => {
    it('reads the cached guide from disk', async () => {
      useStore.getState().openAssistantSession({
        contextId: '/lib/a.md',
        contextType: 'anthropic-article',
        articleContent: 'hello world',
        articleTitle: 'A'
      })
      await flush()

      expect(ipc.articleAssistantReadGuide).toHaveBeenCalledWith({
        parentPath: '/lib/a.md',
        parentType: 'anthropic-article'
      })
    })

    it('auto-generates and persists when cache is empty and autoGenerateGuide is set', async () => {
      vi.mocked(ipc.articleAssistantReadGuide).mockResolvedValue(null)

      useStore.getState().openAssistantSession({
        contextId: '/lib/b.md',
        contextType: 'briefing',
        articleContent: 'article body',
        articleTitle: 'B',
        autoGenerateGuide: true
      })
      // Flush the loadGuide -> .then -> generate -> write microtask chain.
      await flush()
      await flush()
      await flush()

      expect(ipc.articleAssistantGenerateGuide).toHaveBeenCalledWith({
        articleContent: 'article body',
        articleType: 'briefing',
        articleTitle: 'B'
      })
      expect(ipc.articleAssistantWriteGuide).toHaveBeenCalledWith({
        parentPath: '/lib/b.md',
        parentType: 'briefing',
        guide: guideFixture
      })
      expect(useStore.getState().assistantSession?.guide).toEqual(guideFixture)
    })

    it('does not auto-generate when a cached guide already exists', async () => {
      vi.mocked(ipc.articleAssistantReadGuide).mockResolvedValue({
        filePath: '/guide.json',
        guide: guideFixture as any,
        generatedAt: '2026-07-11'
      })

      useStore.getState().openAssistantSession({
        contextId: '/lib/c.md',
        contextType: 'briefing',
        articleContent: 'body',
        autoGenerateGuide: true
      })
      await flush()
      await flush()

      expect(ipc.articleAssistantGenerateGuide).not.toHaveBeenCalled()
      expect(useStore.getState().assistantSession?.guide).toEqual(guideFixture)
    })
  })

  describe('setArticleAssistantGuideWidth', () => {
    it('clamps below 200 up to 200', () => {
      useStore.getState().setArticleAssistantGuideWidth(50)
      expect(useStore.getState().articleAssistantGuideWidth).toBe(200)
    })

    it('clamps above 1200 down to 1200', () => {
      useStore.getState().setArticleAssistantGuideWidth(5000)
      expect(useStore.getState().articleAssistantGuideWidth).toBe(1200)
    })

    it('keeps values within range', () => {
      useStore.getState().setArticleAssistantGuideWidth(400)
      expect(useStore.getState().articleAssistantGuideWidth).toBe(400)
    })
  })
})
