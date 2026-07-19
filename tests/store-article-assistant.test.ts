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
    articleAssistantSendMessage: vi.fn(),
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
    useStore.setState({ assistantSession: null, articleAssistantGuideWidth: 320, articleAssistantGuideCollapsed: false, assistantSearchEnabled: false, assistantSocraticMode: true, assistantThinkingEffort: 'off' })
    vi.mocked(ipc.articleAssistantReadGuide).mockResolvedValue(null)
    vi.mocked(ipc.articleAssistantReadSession).mockResolvedValue(null)
    vi.mocked(ipc.articleAssistantGenerateGuide).mockResolvedValue(guideFixture as any)
    vi.mocked(ipc.articleAssistantWriteGuide).mockResolvedValue({ filePath: '/guide.json' })
    vi.mocked(ipc.articleAssistantSendMessage).mockResolvedValue(undefined)
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

  describe('toggleAssistantSearch', () => {
    it('initializes assistantSearchEnabled to false and toggles it on/off', async () => {
      expect(useStore.getState().assistantSearchEnabled).toBe(false)

      useStore.getState().toggleAssistantSearch()
      expect(useStore.getState().assistantSearchEnabled).toBe(true)
      expect(ipc.patchState).toHaveBeenCalledWith({ assistantSearchEnabled: true })

      useStore.getState().toggleAssistantSearch()
      expect(useStore.getState().assistantSearchEnabled).toBe(false)
      expect(ipc.patchState).toHaveBeenCalledWith({ assistantSearchEnabled: false })
    })

    it('toggles globally without requiring a session', () => {
      useStore.getState().toggleAssistantSearch()
      expect(useStore.getState().assistantSearchEnabled).toBe(true)
    })

    it('keeps assistantSearchEnabled true after a full send cycle', async () => {
      useStore.getState().openAssistantSession({
        contextId: '/lib/e.md',
        contextType: 'briefing',
        articleContent: 'body'
      })
      await flush()

      useStore.getState().toggleAssistantSearch()
      expect(useStore.getState().assistantSearchEnabled).toBe(true)

      await useStore.getState().sendAssistantMessage('q')
      useStore.getState().finishAssistantStreaming()

      expect(useStore.getState().assistantSession?.streaming).toBe(false)
      expect(useStore.getState().assistantSearchEnabled).toBe(true)
    })
  })

  describe('sendAssistantMessage', () => {
    it('passes global socraticMode and thinkingEffort to the IPC send', async () => {
      useStore.setState({ assistantSocraticMode: false, assistantThinkingEffort: 'max' })
      useStore.getState().openAssistantSession({
        contextId: '/lib/c.md',
        contextType: 'briefing',
        articleContent: 'body',
        articleTitle: 'C',
      })
      await flush()
      await useStore.getState().sendAssistantMessage('问题')

      expect(ipc.articleAssistantSendMessage).toHaveBeenCalledWith(
        expect.objectContaining({ socraticMode: false, thinkingEffort: 'max' })
      )
    })

    it('records the pending selection on the user message when sending', async () => {
      useStore.getState().openAssistantSession({
        contextId: '/lib/d.md',
        contextType: 'briefing',
        articleContent: 'body',
        articleTitle: 'D',
      })
      await flush()
      useStore.getState().setAssistantSelection('选中的一段原文')
      await useStore.getState().sendAssistantMessage('这段什么意思')

      const msgs = useStore.getState().assistantSession!.messages
      const userMsg = msgs.find((m) => m.role === 'user')
      expect(userMsg?.selection).toBe('选中的一段原文')
    })

    it('persists selection-only user messages (empty content with selection)', async () => {
      useStore.getState().openAssistantSession({
        contextId: '/lib/e.md',
        contextType: 'briefing',
        articleContent: 'body',
        articleTitle: 'E',
      })
      await flush()
      useStore.getState().setAssistantSelection('只有选段')
      await useStore.getState().sendAssistantMessage('')
      // 等 mock 流完成（articleAssistantSendMessage 已 mock resolved）
      await useStore.getState().saveAssistantSession()

      const written = vi.mocked(ipc.articleAssistantWriteSession).mock.calls.at(-1)?.[0]
      expect(written?.messages.some((m) => m.role === 'user' && m.selection === '只有选段')).toBe(true)
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
