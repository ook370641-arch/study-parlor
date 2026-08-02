import { describe, expect, it, vi, beforeEach } from 'vitest'

// Mock ipc before importing store
vi.mock('@/lib/ipc', () => ({
  ipc: {
    patchState: vi.fn(),
    saveSession: vi.fn(),
    loadSessions: vi.fn(),
    llmAbort: vi.fn(),
    getState: vi.fn(),
    scanLibrary: vi.fn(),
    loadGroups: vi.fn(),
    llmWildcardInspiration: vi.fn(),
    briefingGenerate: vi.fn(),
    onBriefingProgress: vi.fn(() => () => {}),
    briefingList: vi.fn(),
    briefingAbort: vi.fn(),
    searchPrepare: vi.fn()
  }
}))

vi.mock('@/lib/paintings', () => ({
  manifest: [{ id: 'test', painter: 'Test', title: 'Test', url: '/test.jpg' }],
  pickRandom: vi.fn((manifest: unknown[]) => manifest[0] ?? null),
  preloadPaintings: vi.fn()
}))

import { useStore } from '@/store'
import { ipc } from '@/lib/ipc'
import { formatBriefingDate } from '@/lib/format-briefing-date'

describe('store core operations', () => {
  beforeEach(() => {
    useStore.setState(useStore.getState(), true) // reset not available, manually reset key fields
    useStore.setState({
      session: null,
      session_count: 0,
      pendingReports: {},
      unsavedSessions: [],
      currentPage: 'cover'
    })
    vi.restoreAllMocks()
  })

  describe('startSession', () => {
    it('creates a session with correct initial state', () => {
      useStore.getState().startSession({
        mode: 'progress',
        topic: 'TypeScript',
        difficulty: 'mid',
        temperature: 0.7
      })

      const s = useStore.getState().session
      expect(s).not.toBeNull()
      expect(s!.mode).toBe('progress')
      expect(s!.topic).toBe('TypeScript')
      expect(s!.difficulty).toBe('mid')
      expect(s!.temperature).toBe(0.7)
      expect(s!.history).toEqual([])
      expect(s!.streaming).toBe(false)
      expect(s!.archivePending).toBe(false)
      expect(s!.abortId).toBeTruthy()
    })

    it('increments session_count', () => {
      useStore.getState().startSession({
        mode: 'progress', topic: 'A', difficulty: 'mid', temperature: 0.7
      })
      expect(useStore.getState().session_count).toBe(1)
    })

    it('switches to study page', () => {
      useStore.getState().startSession({
        mode: 'progress', topic: 'A', difficulty: 'mid', temperature: 0.7
      })
      expect(useStore.getState().currentPage).toBe('study')
    })

    it('clears external materials and aborts previous streaming session', () => {
      useStore.getState().startSession({
        mode: 'progress', topic: '旧主题', difficulty: 'mid', temperature: 0.7
      })
      const prevId = useStore.getState().session!.abortId
      useStore.setState(st => ({ session: st.session ? { ...st.session, streaming: true } : st.session }))
      useStore.getState().setExternalMaterials({ summary: '旧主题资料', sources: [] })

      useStore.getState().startSession({
        mode: 'progress', topic: '新主题', difficulty: 'mid', temperature: 0.7
      })

      expect(ipc.llmAbort).toHaveBeenCalledWith(prevId)
      expect(useStore.getState().externalMaterials).toBeNull()
      expect(useStore.getState().session!.topic).toBe('新主题')
    })
  })

  describe('appendChunk', () => {
    it('creates new assistant message when history is empty', () => {
      useStore.getState().startSession({
        mode: 'progress', topic: 'A', difficulty: 'mid', temperature: 0.7
      })
      useStore.getState().appendChunk('Hello')

      const h = useStore.getState().session!.history
      expect(h).toHaveLength(1)
      expect(h[0]).toEqual({ role: 'assistant', content: 'Hello' })
    })

    it('appends to existing assistant message', () => {
      useStore.getState().startSession({
        mode: 'progress', topic: 'A', difficulty: 'mid', temperature: 0.7
      })
      useStore.getState().appendChunk('Hello')
      useStore.getState().appendChunk(' world')

      const h = useStore.getState().session!.history
      expect(h).toHaveLength(1)
      expect(h[0].content).toBe('Hello world')
    })

    it('creates new assistant message after user message', () => {
      useStore.getState().startSession({
        mode: 'progress', topic: 'A', difficulty: 'mid', temperature: 0.7
      })
      useStore.getState().appendChunk('Hello')
      useStore.getState().pushUserMessage('question')
      useStore.getState().appendChunk('Answer')

      const h = useStore.getState().session!.history
      expect(h).toHaveLength(3)
      expect(h[2]).toEqual({ role: 'assistant', content: 'Answer' })
    })

    it('does nothing when session is null', () => {
      useStore.setState({ session: null })
      useStore.getState().appendChunk('test') // should not throw
      expect(useStore.getState().session).toBeNull()
    })
  })

  describe('pushUserMessage', () => {
    it('adds user message to history', () => {
      useStore.getState().startSession({
        mode: 'progress', topic: 'A', difficulty: 'mid', temperature: 0.7
      })
      useStore.getState().pushUserMessage('My question')

      const h = useStore.getState().session!.history
      expect(h).toHaveLength(1)
      expect(h[0]).toEqual({ role: 'user', content: 'My question' })
    })

    it('does nothing when session is null', () => {
      useStore.setState({ session: null })
      useStore.getState().pushUserMessage('test')
      expect(useStore.getState().session).toBeNull()
    })
  })

  describe('finishStreaming', () => {
    it('sets streaming=false', () => {
      useStore.getState().startSession({
        mode: 'progress', topic: 'A', difficulty: 'mid', temperature: 0.7
      })
      useStore.getState().appendChunk('Done')
      useStore.getState().finishStreaming()

      expect(useStore.getState().session!.streaming).toBe(false)
    })

    it('sets archivePending=true when assistant asks 需要存档吗', () => {
      useStore.getState().startSession({
        mode: 'progress', topic: 'A', difficulty: 'mid', temperature: 0.7
      })
      useStore.getState().appendChunk('需要存档吗？')
      useStore.getState().finishStreaming()

      expect(useStore.getState().session!.archivePending).toBe(true)
    })

    it('sets archivePending=true with half-width question mark', () => {
      useStore.getState().startSession({
        mode: 'progress', topic: 'A', difficulty: 'mid', temperature: 0.7
      })
      useStore.getState().appendChunk('需要存档吗?')
      useStore.getState().finishStreaming()

      expect(useStore.getState().session!.archivePending).toBe(true)
    })

    it('sets archivePending=true with space before question mark', () => {
      useStore.getState().startSession({
        mode: 'progress', topic: 'A', difficulty: 'mid', temperature: 0.7
      })
      useStore.getState().appendChunk('需要存档吗 ？')
      useStore.getState().finishStreaming()

      expect(useStore.getState().session!.archivePending).toBe(true)
    })

    it('does not set archivePending for normal text', () => {
      useStore.getState().startSession({
        mode: 'progress', topic: 'A', difficulty: 'mid', temperature: 0.7
      })
      useStore.getState().appendChunk('Here is your answer')
      useStore.getState().finishStreaming()

      expect(useStore.getState().session!.archivePending).toBe(false)
    })
  })

  describe('saveCurrentSession', () => {
    it('does not save when history is empty', async () => {
      useStore.getState().startSession({
        mode: 'progress', topic: 'A', difficulty: 'mid', temperature: 0.7
      })
      await useStore.getState().saveCurrentSession()

      expect(ipc.saveSession).not.toHaveBeenCalled()
    })

    it('saves session with history', async () => {
      vi.mocked(ipc.loadSessions).mockResolvedValue([])

      useStore.getState().startSession({
        mode: 'progress', topic: 'A', difficulty: 'mid', temperature: 0.7
      })
      useStore.getState().pushUserMessage('Hello')
      await useStore.getState().saveCurrentSession()

      expect(ipc.saveSession).toHaveBeenCalledOnce()
      const saved = vi.mocked(ipc.saveSession).mock.calls[0][0]
      expect(saved.mode).toBe('progress')
      expect(saved.topic).toBe('A')
      expect(saved.history).toHaveLength(1)
    })
  })

  describe('abortAndReplaceUser', () => {
    it('calls llmAbort when streaming', async () => {
      useStore.getState().startSession({
        mode: 'progress', topic: 'A', difficulty: 'mid', temperature: 0.7
      })
      // Simulate streaming state by appending a chunk
      useStore.getState().appendChunk('partial')

      await useStore.getState().abortAndReplaceUser('new message')

      expect(ipc.llmAbort).toHaveBeenCalledOnce()
      const h = useStore.getState().session!.history
      expect(h[h.length - 1]).toEqual({ role: 'user', content: 'new message' })
    })

    it('adds user message even when not streaming', async () => {
      useStore.getState().startSession({
        mode: 'progress', topic: 'A', difficulty: 'mid', temperature: 0.7
      })

      await useStore.getState().abortAndReplaceUser('new message')

      expect(ipc.llmAbort).not.toHaveBeenCalled()
      const h = useStore.getState().session!.history
      expect(h[h.length - 1]).toEqual({ role: 'user', content: 'new message' })
    })
  })

  describe('terminology', () => {
    it('patches a terminology key', async () => {
      vi.mocked(ipc.patchState).mockResolvedValue(undefined)
      await useStore.getState().patchTerminology({ sessionName: '炉边谈话' })
      expect(useStore.getState().terminology.sessionName).toBe('炉边谈话')
      expect(vi.mocked(ipc.patchState)).toHaveBeenCalledWith(
        expect.objectContaining({ terminology: { sessionName: '炉边谈话' } })
      )
    })

    it('deletes a key when patched with empty string', async () => {
      vi.mocked(ipc.patchState).mockResolvedValue(undefined)
      useStore.setState({ terminology: { sessionName: '炉边谈话' } })
      await useStore.getState().patchTerminology({ sessionName: '' })
      expect(useStore.getState().terminology.sessionName).toBeUndefined()
    })

    it('deletes a key when patched with undefined', async () => {
      vi.mocked(ipc.patchState).mockResolvedValue(undefined)
      useStore.setState({ terminology: { sessionName: '炉边谈话' } })
      await useStore.getState().patchTerminology({ sessionName: undefined })
      expect(useStore.getState().terminology.sessionName).toBeUndefined()
    })

    it('resets terminology to empty object', async () => {
      vi.mocked(ipc.patchState).mockResolvedValue(undefined)
      useStore.setState({ terminology: { sessionName: '炉边谈话' } })
      await useStore.getState().resetTerminology()
      expect(useStore.getState().terminology).toEqual({})
      expect(vi.mocked(ipc.patchState)).toHaveBeenCalledWith(
        expect.objectContaining({ terminology: {} })
      )
    })
  })

  describe('dismissArchive', () => {
    it('clears archivePending flag', () => {
      useStore.getState().startSession({
        mode: 'progress', topic: 'A', difficulty: 'mid', temperature: 0.7
      })
      useStore.getState().appendChunk('需要存档吗？')
      useStore.getState().finishStreaming()
      expect(useStore.getState().session!.archivePending).toBe(true)

      useStore.getState().dismissArchive()
      expect(useStore.getState().session!.archivePending).toBe(false)
    })
  })

  describe('restoreSession', () => {
    it('restores from unsaved session', () => {
      useStore.getState().restoreSession({
        id: 'test-id',
        mode: 'progress',
        topic: 'Restored',
        difficulty: 'high',
        temperature: 0.5,
        history: [{ role: 'user', content: 'hi' }]
      } as any)

      const s = useStore.getState().session
      expect(s).not.toBeNull()
      expect(s!.topic).toBe('Restored')
      expect(s!.difficulty).toBe('high')
      expect(s!.history).toHaveLength(1)
      expect(s!.streaming).toBe(false)
      expect(s!.archivePending).toBe(false)
      expect(useStore.getState().currentPage).toBe('study')
    })

    it('keeps live session state when unsaved id matches (back did not interrupt)', () => {
      useStore.getState().startSession({
        mode: 'progress', topic: 'Live', difficulty: 'mid', temperature: 0.7
      })
      const liveId = useStore.getState().session!.abortId
      // 模拟 onBack 后后台流式继续跑出的完整内容
      useStore.setState(st => ({
        session: st.session ? { ...st.session, history: [
          { role: 'user', content: '今夜想学:Live' },
          { role: 'assistant', content: '完整回答' }
        ] } : st.session,
        currentPage: 'home'
      }))
      useStore.getState().setExternalMaterials({ summary: '资料摘要', sources: [] })

      // 磁盘快照是退出时刻的残缺版本
      useStore.getState().restoreSession({
        id: liveId,
        mode: 'progress',
        topic: 'Live',
        difficulty: 'mid',
        temperature: 0.7,
        history: [{ role: 'user', content: '今夜想学:Live' }]
      } as any)

      const st = useStore.getState()
      expect(st.currentPage).toBe('study')
      expect(st.session!.history).toHaveLength(2)
      expect(st.session!.history[1].content).toBe('完整回答')
      expect(st.externalMaterials?.summary).toBe('资料摘要')
    })
  })

  describe('burnLiveSession', () => {
    it('aborts stream and resets when burning the live session', () => {
      useStore.getState().startSession({
        mode: 'progress', topic: 'Burn', difficulty: 'mid', temperature: 0.7
      })
      const liveId = useStore.getState().session!.abortId
      useStore.setState(st => ({ session: st.session ? { ...st.session, streaming: true } : st.session }))

      useStore.getState().burnLiveSession(liveId)

      expect(ipc.llmAbort).toHaveBeenCalledWith(liveId)
      expect(useStore.getState().session).toBeNull()
      expect(useStore.getState().currentPage).toBe('home')
    })

    it('does nothing when id does not match live session', () => {
      useStore.getState().startSession({
        mode: 'progress', topic: 'Keep', difficulty: 'mid', temperature: 0.7
      })

      useStore.getState().burnLiveSession('some-other-id')

      expect(ipc.llmAbort).not.toHaveBeenCalled()
      expect(useStore.getState().session).not.toBeNull()
    })
  })

  describe('refreshWildcardInspiration', () => {
    it('sets recommendation and clears error on success', async () => {
      vi.mocked(ipc.llmWildcardInspiration).mockResolvedValue({
        topic: '熵增定律',
        hook: '它解释为什么房间总会变乱。'
      })
      useStore.setState({
        profile: { name: 'Test', profile_text: 'p', preferred_topics: [] },
        library: [{ title: '康德' } as any]
      })

      await useStore.getState().refreshWildcardInspiration()

      expect(useStore.getState().wildcardInspiration).toEqual({
        topic: '熵增定律',
        hook: '它解释为什么房间总会变乱。'
      })
      expect(useStore.getState().wildcardError).toBeNull()
      expect(useStore.getState().wildcardLoading).toBe(false)
    })

    it('preserves old recommendation and sets error on failure', async () => {
      vi.mocked(ipc.llmWildcardInspiration).mockRejectedValue(new Error('LLM 超时'))
      useStore.setState({
        profile: { name: 'Test', profile_text: 'p', preferred_topics: [] },
        library: [{ title: '康德' } as any],
        wildcardInspiration: { topic: '旧主题', hook: '旧 hook' }
      })

      await useStore.getState().refreshWildcardInspiration()

      expect(useStore.getState().wildcardInspiration).toEqual({ topic: '旧主题', hook: '旧 hook' })
      expect(useStore.getState().wildcardError).toBe('LLM 超时')
      expect(useStore.getState().wildcardLoading).toBe(false)
    })

    it('does not run concurrent refreshes', async () => {
      vi.mocked(ipc.llmWildcardInspiration).mockImplementation(() =>
        new Promise((resolve) => setTimeout(() => resolve({ topic: 'T', hook: 'H' }), 50))
      )
      useStore.setState({
        profile: { name: 'Test', profile_text: 'p', preferred_topics: [] },
        library: [{ title: '康德' } as any]
      })

      const p1 = useStore.getState().refreshWildcardInspiration()
      const p2 = useStore.getState().refreshWildcardInspiration()
      await Promise.all([p1, p2])

      expect(ipc.llmWildcardInspiration).toHaveBeenCalledTimes(1)
    })

    it('ignores stale results from slow requests', async () => {
      let resolveFirst: (value: { topic: string; hook: string }) => void
      let resolveSecond: (value: { topic: string; hook: string }) => void

      vi.mocked(ipc.llmWildcardInspiration)
        .mockImplementationOnce(() => new Promise((resolve) => { resolveFirst = resolve }))
        .mockImplementationOnce(() => new Promise((resolve) => { resolveSecond = resolve }))

      useStore.setState({
        profile: { name: 'Test', profile_text: 'p', preferred_topics: [] },
        library: [{ title: '康德' } as any]
      })

      const p1 = useStore.getState().refreshWildcardInspiration()
      // 模拟 loading 守卫被绕过（如两次调用间恰好 reset 了 loading）
      useStore.setState({ wildcardLoading: false })
      const p2 = useStore.getState().refreshWildcardInspiration()

      resolveSecond!({ topic: 'Second', hook: 'second hook' })
      await p2
      expect(useStore.getState().wildcardInspiration).toEqual({ topic: 'Second', hook: 'second hook' })

      resolveFirst!({ topic: 'First', hook: 'first hook' })
      await p1
      expect(useStore.getState().wildcardInspiration).toEqual({ topic: 'Second', hook: 'second hook' })
    })
  })

  describe('prepareExternalMaterials', () => {
    beforeEach(() => {
      useStore.setState({ externalMaterials: null })
    })

    it('does not run concurrent calls', async () => {
      vi.mocked(ipc.searchPrepare).mockImplementation(() => new Promise((resolve) => setTimeout(() => resolve({ summary: 's', sources: [] }), 50)))

      const p1 = useStore.getState().prepareExternalMaterials('topic1')
      const p2 = useStore.getState().prepareExternalMaterials('topic2')
      await Promise.all([p1, p2])

      expect(ipc.searchPrepare).toHaveBeenCalledTimes(1)
    })

    it('sets error on failure', async () => {
      vi.mocked(ipc.searchPrepare).mockRejectedValue({ code: 'NETWORK_ERROR', message: 'fail' })

      await useStore.getState().prepareExternalMaterials('topic')

      const em = useStore.getState().externalMaterials
      expect(em?.loading).toBe(false)
      expect(em?.error).toBe('NETWORK_ERROR')
    })
  })

  describe('generateBriefing', () => {
    beforeEach(() => {
      useStore.setState({
        briefing: {
          result: { title: '旧', date: '2026-06-20', content: '旧内容', sources: [], filePath: '/x.md', cached: true },
          loading: false,
          error: null
        },
        briefingViewingDate: null,
        briefingGeneration: null,
        briefingStage: null,
        briefingStageDetail: null,
      })
      vi.mocked(ipc.briefingGenerate).mockReset()
    })

    it('clears previous result and sets loading immediately', () => {
      vi.mocked(ipc.briefingGenerate).mockImplementation(() => new Promise(() => {}))

      useStore.getState().generateBriefing('2026-06-22')

      const b = useStore.getState().briefing
      expect(b.loading).toBe(true)
      expect(b.result).toBeNull()
      expect(b.error).toBeNull()
    })

    it('does not start a second call while one is in flight', () => {
      const today = formatBriefingDate(new Date())
      vi.mocked(ipc.briefingGenerate).mockImplementation(() => new Promise(() => {}))

      useStore.getState().generateBriefing(today)
      useStore.getState().generateBriefing(today)

      // 第二次只切视图观看进度，不发第二个 IPC
      expect(ipc.briefingGenerate).toHaveBeenCalledTimes(1)
      expect(useStore.getState().briefingGeneration).toMatchObject({ date: today, status: 'running' })
      expect(useStore.getState().briefing.loading).toBe(true)
    })

    it('sets result on success', async () => {
      vi.mocked(ipc.briefingGenerate).mockResolvedValue({
        title: '夜航简报',
        date: '2026-06-22',
        content: '新内容',
        sources: [],
        filePath: '/b.md',
        cached: false
      } as any)

      await useStore.getState().generateBriefing('2026-06-22')

      const b = useStore.getState().briefing
      expect(b.loading).toBe(false)
      expect(b.error).toBeNull()
      expect(b.result).toMatchObject({ content: '新内容', cached: false })
    })

    it('sets error and clears result on failure', async () => {
      vi.mocked(ipc.briefingGenerate).mockRejectedValue(new Error('FEED_EMPTY'))

      await useStore.getState().generateBriefing('2026-06-22')

      const b = useStore.getState().briefing
      expect(b.loading).toBe(false)
      expect(b.result).toBeNull()
      expect(b.error).toBe('FEED_EMPTY')
    })

    it('views a cached past date while today is generating, generation record untouched', async () => {
      const today = formatBriefingDate(new Date())
      vi.mocked(ipc.briefingGenerate)
        .mockImplementationOnce(() => new Promise(() => {})) // 今日生成：永挂
        .mockResolvedValueOnce({
          title: '夜航简报', date: '2026-06-22', content: '往期', sources: [],
          filePath: '/past.md', cached: true,
        } as any)

      useStore.getState().generateBriefing(today)
      await useStore.getState().generateBriefing('2026-06-22')

      const s = useStore.getState()
      expect(ipc.briefingGenerate).toHaveBeenCalledTimes(2)
      expect(s.briefing.result).toMatchObject({ date: '2026-06-22', content: '往期' })
      expect(s.briefingViewingDate).toBe('2026-06-22')
      // 后台生成记录不受影响
      expect(s.briefingGeneration).toMatchObject({ date: today, status: 'running' })
    })

    it('background completion does not steal the view, only refreshes history', async () => {
      const today = formatBriefingDate(new Date())
      let resolveGen: (r: unknown) => void = () => {}
      vi.mocked(ipc.briefingGenerate)
        .mockImplementationOnce(() => new Promise((res) => { resolveGen = res }))
        .mockResolvedValueOnce({
          title: '夜航简报', date: '2026-06-22', content: '往期', sources: [],
          filePath: '/past.md', cached: true,
        } as any)
      vi.mocked(ipc.briefingList).mockResolvedValue([])

      const genPromise = useStore.getState().generateBriefing(today)
      await useStore.getState().generateBriefing('2026-06-22') // 切去看往期

      resolveGen({
        title: '夜航简报', date: today, content: '今日新内容', sources: [],
        filePath: '/today.md', cached: false,
      })
      await genPromise

      const s = useStore.getState()
      // 视图仍是往期，不被今日结果抢占
      expect(s.briefing.result).toMatchObject({ date: '2026-06-22', content: '往期' })
      expect(s.briefingGeneration).toBeNull()
      expect(ipc.briefingList).toHaveBeenCalled() // 历史/火焰刷新
    })

    it('failed generation record shows cold error on revisit; force retry regenerates', async () => {
      const today = formatBriefingDate(new Date())
      vi.mocked(ipc.briefingGenerate).mockRejectedValueOnce(new Error('FEED_EMPTY'))

      await useStore.getState().generateBriefing(today)
      expect(useStore.getState().briefingGeneration).toMatchObject({ date: today, status: 'failed', error: 'FEED_EMPTY' })
      expect(useStore.getState().briefing.error).toBe('FEED_EMPTY')

      // 切回失败日期（非 force）：直接冷展示错误，不发 IPC
      vi.mocked(ipc.briefingGenerate).mockClear()
      await useStore.getState().generateBriefing(today)
      expect(ipc.briefingGenerate).not.toHaveBeenCalled()
      expect(useStore.getState().briefing.error).toBe('FEED_EMPTY')
    })

    it('cancelBriefing aborts and clears record and watching view', () => {
      const today = formatBriefingDate(new Date())
      vi.mocked(ipc.briefingGenerate).mockImplementation(() => new Promise(() => {}))

      useStore.getState().generateBriefing(today)
      useStore.getState().cancelBriefing()

      const s = useStore.getState()
      expect(ipc.briefingAbort).toHaveBeenCalled()
      expect(s.briefingGeneration).toBeNull()
      expect(s.briefing).toEqual({ result: null, loading: false, error: null })
    })
  })

  describe('init', () => {
    it('triggers wildcard generation when no cached recommendation', async () => {
      vi.mocked(ipc.getState).mockResolvedValue({
        version: 1,
        profile: { name: 'Test', profile_text: 'p', preferred_topics: [] },
        lastUsed: { difficulty: 'mid', temperature: 0.7 },
        groupInspirations: {},
        wildcardInspiration: undefined,
        ui: { session_count: 0 },
        inspirationStrategy: 'v2',
        fableStyleTags: [],
        lastFableTags: [],
        topicContinueSuggestions: {},
        terminology: {}
      } as any)
      vi.mocked(ipc.scanLibrary).mockResolvedValue([{ title: '康德' } as any])
      vi.mocked(ipc.loadSessions).mockResolvedValue([])
      vi.mocked(ipc.loadGroups).mockResolvedValue({ groups: [], mapping: {} })
      vi.mocked(ipc.llmWildcardInspiration).mockResolvedValue({ topic: 'T', hook: 'H' })

      await useStore.getState().init()
      await new Promise((r) => setTimeout(r, 10)) // let async refresh settle

      expect(ipc.llmWildcardInspiration).toHaveBeenCalledOnce()
      expect(useStore.getState().wildcardInspiration).toEqual({ topic: 'T', hook: 'H' })
    })

    it('does not trigger wildcard generation when cached recommendation exists', async () => {
      vi.mocked(ipc.getState).mockResolvedValue({
        version: 1,
        profile: { name: 'Test', profile_text: 'p', preferred_topics: [] },
        lastUsed: { difficulty: 'mid', temperature: 0.7 },
        groupInspirations: {},
        wildcardInspiration: { topic: 'Cached', hook: 'Hook' },
        ui: { session_count: 0 },
        inspirationStrategy: 'v2',
        fableStyleTags: [],
        lastFableTags: [],
        topicContinueSuggestions: {},
        terminology: {}
      } as any)
      vi.mocked(ipc.scanLibrary).mockResolvedValue([{ title: '康德' } as any])
      vi.mocked(ipc.loadSessions).mockResolvedValue([])
      vi.mocked(ipc.loadGroups).mockResolvedValue({ groups: [], mapping: {} })

      await useStore.getState().init()
      await new Promise((r) => setTimeout(r, 10))

      expect(ipc.llmWildcardInspiration).not.toHaveBeenCalled()
      expect(useStore.getState().wildcardInspiration).toEqual({ topic: 'Cached', hook: 'Hook' })
    })

    it('sets wildcardError when background generation fails', async () => {
      vi.mocked(ipc.getState).mockResolvedValue({
        version: 1,
        profile: { name: 'Test', profile_text: 'p', preferred_topics: [] },
        lastUsed: { difficulty: 'mid', temperature: 0.7 },
        groupInspirations: {},
        wildcardInspiration: undefined,
        ui: { session_count: 0 },
        inspirationStrategy: 'v2',
        fableStyleTags: [],
        lastFableTags: [],
        topicContinueSuggestions: {},
        terminology: {}
      } as any)
      vi.mocked(ipc.scanLibrary).mockResolvedValue([{ title: '康德' } as any])
      vi.mocked(ipc.loadSessions).mockResolvedValue([])
      vi.mocked(ipc.loadGroups).mockResolvedValue({ groups: [], mapping: {} })
      vi.mocked(ipc.llmWildcardInspiration).mockRejectedValue(new Error('network error'))

      await useStore.getState().init()
      await new Promise((r) => setTimeout(r, 10))

      expect(useStore.getState().wildcardError).toBe('network error')
      expect(useStore.getState().wildcardInspiration).toBeNull()
    })
  })

  describe('briefing font size', () => {
    beforeEach(() => {
      useStore.setState({ briefingFontSize: 'base' })
      vi.mocked(ipc.patchState).mockResolvedValue(undefined)
    })

    it('defaults to base', () => {
      expect(useStore.getState().briefingFontSize).toBe('base')
    })

    it('increases font size', async () => {
      await useStore.getState().increaseBriefingFontSize()
      expect(useStore.getState().briefingFontSize).toBe('lg')
      expect(vi.mocked(ipc.patchState)).toHaveBeenCalledWith(
        expect.objectContaining({ briefingFontSize: 'lg' })
      )
    })

    it('decreases font size', async () => {
      await useStore.getState().decreaseBriefingFontSize()
      expect(useStore.getState().briefingFontSize).toBe('sm')
      expect(vi.mocked(ipc.patchState)).toHaveBeenCalledWith(
        expect.objectContaining({ briefingFontSize: 'sm' })
      )
    })

    it('does not increase beyond 7xl', async () => {
      useStore.setState({ briefingFontSize: '7xl' })
      await useStore.getState().increaseBriefingFontSize()
      expect(useStore.getState().briefingFontSize).toBe('7xl')
      expect(vi.mocked(ipc.patchState)).not.toHaveBeenCalled()
    })

    it('does not decrease below sm', async () => {
      useStore.setState({ briefingFontSize: 'sm' })
      await useStore.getState().decreaseBriefingFontSize()
      expect(useStore.getState().briefingFontSize).toBe('sm')
      expect(vi.mocked(ipc.patchState)).not.toHaveBeenCalled()
    })
  })
})
