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
    searchPrepare: vi.fn()
  }
}))

vi.mock('@/lib/paintings', () => ({
  manifest: [{ id: 'test', painter: 'Test', title: 'Test', url: '/test.jpg' }],
  pickRandom: vi.fn((manifest: unknown[]) => manifest[0] ?? null)
}))

import { useStore } from '@/store'
import { ipc } from '@/lib/ipc'

describe('store core operations', () => {
  beforeEach(() => {
    useStore.setState(useStore.getState(), true) // reset not available, manually reset key fields
    useStore.setState({
      session: null,
      session_count: 0,
      archiveResult: null,
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
        }
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
      vi.mocked(ipc.briefingGenerate).mockImplementation(() => new Promise(() => {}))

      useStore.getState().generateBriefing('2026-06-22')
      useStore.getState().generateBriefing('2026-06-22')

      expect(ipc.briefingGenerate).toHaveBeenCalledTimes(1)
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
})
