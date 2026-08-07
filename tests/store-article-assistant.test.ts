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
    articleAssistantAbort: vi.fn(),
    collectionRead: vi.fn().mockResolvedValue({ version: 1, entries: [] })
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
        articleTitle: 'B',
        entriesTotal: 0,
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
        generatedAt: '2026-07-11',
        guideVersion: 2,
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

  describe('guide v2 cache versioning and progress', () => {
    const openBriefing = (articleContent = 'article body') =>
      useStore.getState().openAssistantSession({
        contextId: '/lib/d.md',
        contextType: 'briefing',
        articleContent,
        articleTitle: 'D',
        autoGenerateGuide: true,
      })

    it('regenerates when briefing cache has no guideVersion (v1)', async () => {
      vi.mocked(ipc.articleAssistantReadGuide).mockResolvedValue({
        filePath: '/g.md',
        guide: guideFixture as any,
        generatedAt: '2026-08-01',
      })
      openBriefing()
      await flush(); await flush(); await flush()
      expect(ipc.articleAssistantGenerateGuide).toHaveBeenCalled()
    })

    it('uses briefing cache when guideVersion is 2', async () => {
      vi.mocked(ipc.articleAssistantReadGuide).mockResolvedValue({
        filePath: '/g.md',
        guide: guideFixture as any,
        generatedAt: '2026-08-04',
        guideVersion: 2,
      })
      openBriefing()
      await flush(); await flush()
      expect(ipc.articleAssistantGenerateGuide).not.toHaveBeenCalled()
      expect(useStore.getState().assistantSession?.guide).toEqual(guideFixture)
    })

    it('uses web-article cache without version check', async () => {
      vi.mocked(ipc.articleAssistantReadGuide).mockResolvedValue({
        filePath: '/g.md',
        guide: guideFixture as any,
        generatedAt: '2026-08-01',
      })
      useStore.getState().openAssistantSession({
        contextId: '/lib/e.md',
        contextType: 'web-article',
        articleContent: 'body',
        autoGenerateGuide: true,
      })
      await flush(); await flush()
      expect(ipc.articleAssistantGenerateGuide).not.toHaveBeenCalled()
    })

    it('counts H2/H3 headings as entriesTotal', async () => {
      openBriefing('## 一\nx\n### 二\ny\n## 三\nz')
      await flush(); await flush(); await flush()
      expect(ipc.articleAssistantGenerateGuide).toHaveBeenCalledWith(
        expect.objectContaining({ entriesTotal: 3 })
      )
    })

    it('tracks guideProgress and clears it on success', async () => {
      // 挂起生成，避免 microtask 一把跑完导致断言不到中间态
      let resolveGuide!: (g: unknown) => void
      vi.mocked(ipc.articleAssistantGenerateGuide).mockReturnValue(
        new Promise((r) => { resolveGuide = r }) as Promise<any>
      )
      openBriefing()
      await flush(); await flush()
      expect(useStore.getState().assistantSession?.guideProgress).toEqual({ stage: 'planning' })

      useStore.getState().setAssistantGuideProgress({ stage: 'searching', done: 1, total: 2 })
      expect(useStore.getState().assistantSession?.guideProgress).toEqual({ stage: 'searching', done: 1, total: 2 })

      resolveGuide(guideFixture)
      await flush(); await flush()
      expect(useStore.getState().assistantSession?.guide).toEqual(guideFixture)
      expect(useStore.getState().assistantSession?.guideProgress).toBeNull()
    })

    it('clears guideProgress on failure', async () => {
      vi.mocked(ipc.articleAssistantGenerateGuide).mockRejectedValue(Object.assign(new Error('x'), { code: 'GUIDE_LLM_ERROR' }))
      openBriefing()
      await flush(); await flush(); await flush()
      expect(useStore.getState().assistantSession?.guideError).toBe('GUIDE_LLM_ERROR')
      expect(useStore.getState().assistantSession?.guideProgress).toBeNull()
    })

    it('web-article 生成中不置 guideProgress（articleType 门控）', async () => {
      vi.mocked(ipc.articleAssistantGenerateGuide).mockReturnValue(new Promise(() => {}) as Promise<any>)
      useStore.getState().openAssistantSession({
        contextId: '/lib/a.md',
        contextType: 'web-article',
        articleContent: 'body',
        autoGenerateGuide: true,
      })
      await flush(); await flush()
      expect(useStore.getState().assistantSession?.guideLoading).toBe(true)
      expect(useStore.getState().assistantSession?.guideProgress).toBeNull()
    })

    it('anthropic-article 生成中置 guideProgress（博客 v2 进度）', async () => {
      vi.mocked(ipc.articleAssistantGenerateGuide).mockReturnValue(new Promise(() => {}) as Promise<any>)
      useStore.getState().openAssistantSession({
        contextId: '/lib/f.md',
        contextType: 'anthropic-article',
        articleContent: 'body',
        autoGenerateGuide: true,
      })
      await flush(); await flush()
      expect(useStore.getState().assistantSession?.guideLoading).toBe(true)
      expect(useStore.getState().assistantSession?.guideProgress).toEqual({ stage: 'planning' })
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
