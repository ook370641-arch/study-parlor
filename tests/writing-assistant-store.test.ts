import { describe, expect, it, vi, beforeEach } from 'vitest'

// Mock ipc before importing store
vi.mock('@/lib/ipc', () => ({
  ipc: {
    patchState: vi.fn(),
    writingScanTree: vi.fn(),
    writingRead: vi.fn(),
    writingWrite: vi.fn(),
    writingAssistantSendMessage: vi.fn(),
    writingAssistantAbort: vi.fn(),
    articleAssistantReadSession: vi.fn(),
    articleAssistantWriteSession: vi.fn(),
  }
}))

vi.mock('@/lib/paintings', () => ({
  manifest: [{ id: 'test', painter: 'Test', title: 'Test', url: '/test.jpg' }],
  pickRandom: vi.fn((manifest: unknown[]) => manifest[0] ?? null)
}))

import { useStore } from '@/store'
import { ipc } from '@/lib/ipc'

describe('writing assistant store', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useStore.setState({
      writingAssistant: null,
      writingFile: null,
      assistantSearchEnabled: false,
      assistantThinkingEffort: 'off',
    })
    vi.mocked(ipc.writingAssistantSendMessage).mockResolvedValue(undefined)
    vi.mocked(ipc.articleAssistantReadSession).mockResolvedValue(null)
  })

  describe('sendWritingAssistantMessage', () => {
    it('creates a session and calls writingAssistantSendMessage', async () => {
      useStore.setState({
        writingFile: { path: 'writing/a.md', body: '# 文章内容', dirty: false, saving: 'idle' },
      })

      await useStore.getState().sendWritingAssistantMessage('帮我润色这段文字')

      const state = useStore.getState().writingAssistant
      expect(state).not.toBeNull()
      expect(state!.articlePath).toBe('writing/a.md')
      expect(state!.messages).toHaveLength(1)
      expect(state!.messages[0]).toEqual({ role: 'user', content: '帮我润色这段文字', snapshot: '# 文章内容' })
      expect(state!.streaming).toBe(true)
      expect(state!.error).toBeNull()

      expect(ipc.writingAssistantSendMessage).toHaveBeenCalledWith({
        sessionId: state!.sessionId,
        articlePath: 'writing/a.md',
        articleContent: '# 文章内容',
        messages: [{ role: 'user', content: '帮我润色这段文字', snapshot: '# 文章内容' }],
        useSearch: false,
        thinkingEffort: 'off',
      })
    })

    it('uses search and thinking settings from store', async () => {
      useStore.setState({
        assistantSearchEnabled: true,
        assistantThinkingEffort: 'max',
      })

      await useStore.getState().sendWritingAssistantMessage('搜索一下相关资料')

      expect(ipc.writingAssistantSendMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          useSearch: true,
          thinkingEffort: 'max',
        })
      )
    })

    it('accumulates messages across multiple sends', async () => {
      await useStore.getState().sendWritingAssistantMessage('第一条消息')
      // Simulate receiving a chunk to create assistant message
      useStore.setState(s => s.writingAssistant ? {
        writingAssistant: {
          ...s.writingAssistant,
          messages: [...s.writingAssistant.messages, { role: 'assistant' as const, content: '回复' }],
          streaming: false,
        }
      } : {})

      await useStore.getState().sendWritingAssistantMessage('第二条消息')

      expect(useStore.getState().writingAssistant!.messages).toHaveLength(3)
      expect(useStore.getState().writingAssistant!.messages[2].role).toBe('user')
    })

    it('handles null writingFile gracefully', async () => {
      await useStore.getState().sendWritingAssistantMessage('独立消息')

      expect(ipc.writingAssistantSendMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          articlePath: null,
          articleContent: '',
        })
      )
    })

    it('attaches snapshot only on first run and when lit (S1)', async () => {
      useStore.setState({
        writingFile: { path: 'writing/a.md', body: '# v1', dirty: false, saving: 'idle' },
      })
      await useStore.getState().sendWritingAssistantMessage('首轮')
      expect(useStore.getState().writingAssistant!.messages[0].snapshot).toBe('# v1')

      // 第二轮未点亮：不挂新快照
      useStore.setState(s => s.writingAssistant ? {
        writingAssistant: { ...s.writingAssistant, messages: [...s.writingAssistant.messages, { role: 'assistant' as const, content: 'r' }], streaming: false },
      } : {})
      await useStore.getState().sendWritingAssistantMessage('第二轮未点亮')
      const m2 = useStore.getState().writingAssistant!.messages
      expect(m2[m2.length - 1].snapshot).toBeUndefined()

      // 点亮后：挂新快照
      useStore.getState().setWritingAssistantSnapshotLit(true)
      await useStore.getState().sendWritingAssistantMessage('第三轮点亮')
      const m3 = useStore.getState().writingAssistant!.messages
      expect(m3[m3.length - 1].snapshot).toBe('# v1')
    })

    it('clears snapshotLit when switching articles', async () => {
      useStore.getState().setWritingAssistantSnapshotLit(true)
      useStore.setState({ writingFile: { path: 'writing/a.md', body: '# a', dirty: false, saving: 'idle' } })
      vi.mocked(ipc.writingRead).mockResolvedValue({ ok: true, value: { body: '# b' } })
      vi.mocked(ipc.articleAssistantReadSession).mockResolvedValue(null)
      await useStore.getState().selectWritingFile('writing/b.md')
      expect(useStore.getState().writingAssistantSnapshotLit).toBe(false)
    })
  })

  describe('appendWritingAssistantChunk', () => {
    it('creates an assistant message on first chunk', () => {
      useStore.setState({
        writingAssistant: {
          sessionId: 'wa-001',
          articlePath: null,
          messages: [{ role: 'user', content: '你好' }],
          streaming: true,
          error: null,
        },
      })

      useStore.getState().appendWritingAssistantChunk('你好，')

      const msgs = useStore.getState().writingAssistant!.messages
      expect(msgs).toHaveLength(2)
      expect(msgs[1]).toEqual({ role: 'assistant', content: '你好，' })
    })

    it('appends to existing assistant message', () => {
      useStore.setState({
        writingAssistant: {
          sessionId: 'wa-001',
          articlePath: null,
          messages: [
            { role: 'user', content: '你好' },
            { role: 'assistant', content: '你好，' },
          ],
          streaming: true,
          error: null,
        },
      })

      useStore.getState().appendWritingAssistantChunk('有什么可以帮你的？')

      expect(useStore.getState().writingAssistant!.messages[1].content).toBe('你好，有什么可以帮你的？')
    })

    it('is a no-op when not streaming', () => {
      useStore.setState({
        writingAssistant: {
          sessionId: 'wa-001',
          articlePath: null,
          messages: [{ role: 'user', content: '你好' }],
          streaming: false,
          error: null,
        },
      })

      useStore.getState().appendWritingAssistantChunk('忽略')

      expect(useStore.getState().writingAssistant!.messages).toHaveLength(1)
    })

    it('is a no-op when writingAssistant is null', () => {
      useStore.getState().appendWritingAssistantChunk('忽略')
      expect(useStore.getState().writingAssistant).toBeNull()
    })
  })

  describe('appendWritingAssistantReasoning', () => {
    it('creates an assistant message with reasoning if none exists', () => {
      useStore.setState({
        writingAssistant: {
          sessionId: 'wa-001',
          articlePath: null,
          messages: [{ role: 'user', content: '问题' }],
          streaming: true,
          error: null,
        },
      })

      useStore.getState().appendWritingAssistantReasoning('让我想想...')

      const msgs = useStore.getState().writingAssistant!.messages
      expect(msgs).toHaveLength(2)
      expect(msgs[1]).toEqual({ role: 'assistant', content: '', reasoning: '让我想想...' })
    })

    it('appends to existing reasoning', () => {
      useStore.setState({
        writingAssistant: {
          sessionId: 'wa-001',
          articlePath: null,
          messages: [
            { role: 'user', content: '问题' },
            { role: 'assistant', content: '', reasoning: '让我想想...' },
          ],
          streaming: true,
          error: null,
        },
      })

      useStore.getState().appendWritingAssistantReasoning('用户想要润色文章')

      expect(useStore.getState().writingAssistant!.messages[1].reasoning).toBe('让我想想...用户想要润色文章')
    })
  })

  describe('applyWritingAssistantToolEvent', () => {
    beforeEach(() => {
      useStore.setState({
        writingAssistant: {
          sessionId: 'wa-001',
          articlePath: null,
          messages: [
            { role: 'user', content: '查一下资料' },
            { role: 'assistant', content: '让我来查一下。' },
          ],
          streaming: true,
          error: null,
        },
      })
    })

    it('adds read_local start event with source chips', () => {
      useStore.getState().applyWritingAssistantToolEvent({
        sessionId: 'wa-001',
        phase: 'start',
        tool: 'read_local',
        ids: ['repository:旧随笔.md', 'writing:草稿.md'],
      })

      const msgs = useStore.getState().writingAssistant!.messages
      expect(msgs[1].content).toContain('读取：`repository:旧随笔.md`、`writing:草稿.md`')
      expect(msgs[1].sources).toEqual([
        { type: 'repository', id: 'repository:旧随笔.md', label: 'repository:旧随笔.md' },
        { type: 'writing', id: 'writing:草稿.md', label: 'writing:草稿.md' },
      ])
    })

    it('adds read_local done event', () => {
      useStore.getState().applyWritingAssistantToolEvent({
        sessionId: 'wa-001',
        phase: 'done',
        tool: 'read_local',
        ids: ['repository:旧随笔.md'],
      })

      expect(useStore.getState().writingAssistant!.messages[1].content).toContain('来源：[read_local] repository:旧随笔.md')
    })

    it('ignores insert_into_article events (removed tool)', () => {
      useStore.getState().applyWritingAssistantToolEvent({
        sessionId: 'wa-001',
        phase: 'done',
        tool: 'insert_into_article',
        markdown: '# 标题',
      } as any)
      const msgs = useStore.getState().writingAssistant!.messages
      expect(msgs[1].content).toBe('让我来查一下。')
    })

    it('adds web_search start event', () => {
      useStore.getState().applyWritingAssistantToolEvent({
        sessionId: 'wa-001',
        phase: 'start',
        tool: 'web_search',
        query: 'TypeScript best practices',
      })

      expect(useStore.getState().writingAssistant!.messages[1].content).toContain('搜索：TypeScript best practices')
    })

    it('adds error event', () => {
      useStore.getState().applyWritingAssistantToolEvent({
        sessionId: 'wa-001',
        phase: 'error',
        tool: 'read_local',
        error: '文件不存在',
      })

      expect(useStore.getState().writingAssistant!.messages[1].content).toContain('read_local 失败：文件不存在')
    })

    it('ignores events for wrong sessionId', () => {
      useStore.getState().applyWritingAssistantToolEvent({
        sessionId: 'wa-other',
        phase: 'done',
        tool: 'read_local',
        ids: ['x'],
      })

      expect(useStore.getState().writingAssistant!.messages[1].content).toBe('让我来查一下。')
    })
  })

  describe('finishWritingAssistantStreaming', () => {
    it('sets streaming to false', () => {
      useStore.setState({
        writingAssistant: {
          sessionId: 'wa-001',
          articlePath: null,
          messages: [{ role: 'user', content: '你好' }],
          streaming: true,
          error: null,
        },
      })

      useStore.getState().finishWritingAssistantStreaming()

      expect(useStore.getState().writingAssistant!.streaming).toBe(false)
    })

    it('is a no-op when writingAssistant is null', () => {
      useStore.getState().finishWritingAssistantStreaming()
      expect(useStore.getState().writingAssistant).toBeNull()
    })

    it('calls articleAssistantWriteSession when articlePath is set', async () => {
      useStore.setState({
        writingAssistant: {
          sessionId: 'wa-001',
          articlePath: 'writing/a.md',
          messages: [
            { role: 'user', content: '你好' },
            { role: 'assistant', content: '回复内容' },
          ],
          streaming: true,
          error: null,
        },
      })

      // finishWritingAssistantStreaming calls saveWritingAssistantSession which is async
      useStore.getState().finishWritingAssistantStreaming()

      expect(useStore.getState().writingAssistant!.streaming).toBe(false)

      // Wait for the async save to settle
      await vi.waitFor(() => {
        expect(ipc.articleAssistantWriteSession).toHaveBeenCalledWith({
          parentPath: 'writing/a.md',
          parentType: 'writing',
          messages: [
            { role: 'user', content: '你好' },
            { role: 'assistant', content: '回复内容' },
          ],
        })
      })
    })
  })

  describe('abortWritingAssistant', () => {
    it('calls writingAssistantAbort and sets streaming to false', () => {
      useStore.setState({
        writingAssistant: {
          sessionId: 'wa-001',
          articlePath: null,
          messages: [{ role: 'user', content: '你好' }],
          streaming: true,
          error: null,
        },
      })

      useStore.getState().abortWritingAssistant()

      expect(ipc.writingAssistantAbort).toHaveBeenCalledWith({ sessionId: 'wa-001' })
      expect(useStore.getState().writingAssistant!.streaming).toBe(false)
    })

    it('is a no-op when not streaming', () => {
      useStore.setState({
        writingAssistant: {
          sessionId: 'wa-001',
          articlePath: null,
          messages: [{ role: 'user', content: '你好' }],
          streaming: false,
          error: null,
        },
      })

      useStore.getState().abortWritingAssistant()

      expect(ipc.writingAssistantAbort).not.toHaveBeenCalled()
    })

    it('calls articleAssistantWriteSession when streaming with articlePath set', async () => {
      useStore.setState({
        writingAssistant: {
          sessionId: 'wa-001',
          articlePath: 'writing/a.md',
          messages: [
            { role: 'user', content: '你好' },
            { role: 'assistant', content: '部分回复' },
          ],
          streaming: true,
          error: null,
        },
      })

      useStore.getState().abortWritingAssistant()

      expect(ipc.writingAssistantAbort).toHaveBeenCalledWith({ sessionId: 'wa-001' })
      expect(useStore.getState().writingAssistant!.streaming).toBe(false)

      await vi.waitFor(() => {
        expect(ipc.articleAssistantWriteSession).toHaveBeenCalledWith({
          parentPath: 'writing/a.md',
          parentType: 'writing',
          messages: [
            { role: 'user', content: '你好' },
            { role: 'assistant', content: '部分回复' },
          ],
        })
      })
    })
  })

  describe('saveWritingAssistantSession', () => {
    it('calls articleAssistantWriteSession with filtered messages', async () => {
      useStore.setState({
        writingAssistant: {
          sessionId: 'wa-001',
          articlePath: 'writing/a.md',
          messages: [
            { role: 'user', content: '你好' },
            { role: 'assistant', content: '' },
            { role: 'user', content: '另一个问题' },
            { role: 'assistant', content: '回答' },
          ],
          streaming: false,
          error: null,
        },
      })

      await useStore.getState().saveWritingAssistantSession()

      // Empty assistant message should be filtered out
      expect(ipc.articleAssistantWriteSession).toHaveBeenCalledWith({
        parentPath: 'writing/a.md',
        parentType: 'writing',
        messages: [
          { role: 'user', content: '你好' },
          { role: 'user', content: '另一个问题' },
          { role: 'assistant', content: '回答' },
        ],
      })
    })

    it('skips when articlePath is null', async () => {
      useStore.setState({
        writingAssistant: {
          sessionId: 'wa-001',
          articlePath: null,
          messages: [{ role: 'user', content: '你好' }],
          streaming: false,
          error: null,
        },
      })

      await useStore.getState().saveWritingAssistantSession()

      expect(ipc.articleAssistantWriteSession).not.toHaveBeenCalled()
    })

    it('skips when writingAssistant is null', async () => {
      await useStore.getState().saveWritingAssistantSession()

      expect(ipc.articleAssistantWriteSession).not.toHaveBeenCalled()
    })

    it('skips when all messages are empty', async () => {
      useStore.setState({
        writingAssistant: {
          sessionId: 'wa-001',
          articlePath: 'writing/a.md',
          messages: [
            { role: 'assistant', content: '' },
            { role: 'assistant', content: '   ' },
          ],
          streaming: false,
          error: null,
        },
      })

      await useStore.getState().saveWritingAssistantSession()

      expect(ipc.articleAssistantWriteSession).not.toHaveBeenCalled()
    })

    it('shows toast on write failure', async () => {
      vi.mocked(ipc.articleAssistantWriteSession).mockRejectedValueOnce(new Error('IO error'))

      useStore.setState({
        writingAssistant: {
          sessionId: 'wa-001',
          articlePath: 'writing/a.md',
          messages: [{ role: 'user', content: '你好' }],
          streaming: false,
          error: null,
        },
      })

      await useStore.getState().saveWritingAssistantSession()

      expect(useStore.getState().toast).toEqual({ message: '助手对话暂存失败', ts: expect.any(Number) })
    })
  })

  describe('setWritingAssistantOpen', () => {
    beforeEach(() => {
      // Reset toast for assertions
      useStore.setState({ toast: null as any })
    })

    it('saves session when closing panel with messages present', async () => {
      useStore.setState({
        writingAssistant: {
          sessionId: 'wa-001',
          articlePath: 'writing/a.md',
          messages: [
            { role: 'user', content: '你好' },
            { role: 'assistant', content: '回复' },
          ],
          streaming: false,
          error: null,
        },
        writingAssistantOpen: true,
      })

      useStore.getState().setWritingAssistantOpen(false)

      expect(useStore.getState().writingAssistantOpen).toBe(false)

      await vi.waitFor(() => {
        expect(ipc.articleAssistantWriteSession).toHaveBeenCalledWith({
          parentPath: 'writing/a.md',
          parentType: 'writing',
          messages: [
            { role: 'user', content: '你好' },
            { role: 'assistant', content: '回复' },
          ],
        })
      })
      expect(ipc.patchState).toHaveBeenCalledWith({ writingAssistantOpen: false } as any)
    })

    it('does not save when opening panel', () => {
      useStore.setState({
        writingAssistant: {
          sessionId: 'wa-001',
          articlePath: 'writing/a.md',
          messages: [{ role: 'user', content: '你好' }],
          streaming: false,
          error: null,
        },
        writingAssistantOpen: false,
      })

      useStore.getState().setWritingAssistantOpen(true)

      expect(useStore.getState().writingAssistantOpen).toBe(true)
      expect(ipc.articleAssistantWriteSession).not.toHaveBeenCalled()
    })

    it('does not save when streaming', () => {
      useStore.setState({
        writingAssistant: {
          sessionId: 'wa-001',
          articlePath: 'writing/a.md',
          messages: [{ role: 'user', content: '你好' }],
          streaming: true,
          error: null,
        },
        writingAssistantOpen: true,
      })

      useStore.getState().setWritingAssistantOpen(false)

      expect(useStore.getState().writingAssistantOpen).toBe(false)
      expect(ipc.articleAssistantWriteSession).not.toHaveBeenCalled()
    })

    it('does not save when no messages', () => {
      useStore.setState({
        writingAssistant: {
          sessionId: 'wa-001',
          articlePath: 'writing/a.md',
          messages: [],
          streaming: false,
          error: null,
        },
        writingAssistantOpen: true,
      })

      useStore.getState().setWritingAssistantOpen(false)

      expect(useStore.getState().writingAssistantOpen).toBe(false)
      expect(ipc.articleAssistantWriteSession).not.toHaveBeenCalled()
    })

    it('does not save when writingAssistant is null', () => {
      useStore.setState({
        writingAssistantOpen: true,
      })

      useStore.getState().setWritingAssistantOpen(false)

      expect(useStore.getState().writingAssistantOpen).toBe(false)
      expect(ipc.articleAssistantWriteSession).not.toHaveBeenCalled()
    })
  })

  describe('loadWritingAssistantSession', () => {
    it('loads messages from .assistant.md via articleAssistantReadSession', async () => {
      vi.mocked(ipc.articleAssistantReadSession).mockResolvedValue({
        filePath: 'writing/a.assistant.md',
        messages: [
          { role: 'user', content: '之前的问题' },
          { role: 'assistant', content: '之前的回答', searchSources: [{ title: '参考', url: 'https://example.com', snippet: '...' }] },
        ],
        createdAt: '2026-01-01',
        updatedAt: '2026-01-01',
      })

      await useStore.getState().loadWritingAssistantSession('writing/a.md')

      expect(ipc.articleAssistantReadSession).toHaveBeenCalledWith({
        parentPath: 'writing/a.md',
        parentType: 'writing',
      })

      const state = useStore.getState().writingAssistant!
      expect(state.messages).toHaveLength(2)
      expect(state.messages[0]).toEqual({ role: 'user', content: '之前的问题' })
      expect(state.messages[1].role).toBe('assistant')
      expect(state.messages[1].content).toBe('之前的回答')
      expect(state.messages[1].sources).toEqual([{ type: 'web', id: 'https://example.com', label: '参考' }])
      expect(state.articlePath).toBe('writing/a.md')
      expect(state.streaming).toBe(false)
    })

    it('does nothing when session file returns null', async () => {
      vi.mocked(ipc.articleAssistantReadSession).mockResolvedValue(null)

      await useStore.getState().loadWritingAssistantSession('writing/a.md')

      expect(useStore.getState().writingAssistant).toBeNull()
    })

    it('does nothing when session file has no messages', async () => {
      vi.mocked(ipc.articleAssistantReadSession).mockResolvedValue({
        filePath: 'writing/a.assistant.md',
        messages: [],
        createdAt: '2026-01-01',
        updatedAt: '2026-01-01',
      })

      await useStore.getState().loadWritingAssistantSession('writing/a.md')

      expect(useStore.getState().writingAssistant).toBeNull()
    })
  })

  describe('selectWritingFile assistant session wiring', () => {
    beforeEach(() => {
      vi.mocked(ipc.writingRead).mockResolvedValue({ ok: true, value: { body: '# 正文' } })
    })

    it('restores the assistant session from .assistant.md when selecting a file', async () => {
      vi.mocked(ipc.articleAssistantReadSession).mockResolvedValue({
        filePath: 'writing/b.assistant.md',
        messages: [
          { role: 'user', content: '旧问题' },
          { role: 'assistant', content: '旧回复' },
        ],
        createdAt: '2026-01-01',
        updatedAt: '2026-01-01',
      })

      await useStore.getState().selectWritingFile('writing/b.md')

      expect(ipc.articleAssistantReadSession).toHaveBeenCalledWith({
        parentPath: 'writing/b.md',
        parentType: 'writing',
      })
      const wa = useStore.getState().writingAssistant!
      expect(wa.articlePath).toBe('writing/b.md')
      expect(wa.messages.map((m) => m.content)).toEqual(['旧问题', '旧回复'])
    })

    it('drops the previous file\'s messages when switching files (no cross-file contamination)', async () => {
      useStore.setState({
        writingAssistant: {
          sessionId: 'wa-1',
          articlePath: 'writing/a.md',
          messages: [{ role: 'user', content: 'A 的消息' }],
          streaming: false,
          error: null,
        },
      })
      // B 没有已保存会话 → 重置为 null，而不是带着 A 的消息
      vi.mocked(ipc.articleAssistantReadSession).mockResolvedValue(null)

      await useStore.getState().selectWritingFile('writing/b.md')

      expect(useStore.getState().writingAssistant).toBeNull()
    })

    it('aborts an in-flight stream when switching files', async () => {
      useStore.setState({
        writingAssistant: {
          sessionId: 'wa-1',
          articlePath: 'writing/a.md',
          messages: [],
          streaming: true,
          error: null,
        },
      })

      await useStore.getState().selectWritingFile('writing/b.md')

      expect(ipc.writingAssistantAbort).toHaveBeenCalledWith({ sessionId: 'wa-1' })
    })

    it('keeps the in-memory session when reselecting the same file', async () => {
      useStore.setState({
        writingAssistant: {
          sessionId: 'wa-1',
          articlePath: 'writing/a.md',
          messages: [{ role: 'user', content: '继续聊' }],
          streaming: false,
          error: null,
        },
      })

      await useStore.getState().selectWritingFile('writing/a.md')

      expect(ipc.articleAssistantReadSession).not.toHaveBeenCalled()
      expect(useStore.getState().writingAssistant!.messages).toHaveLength(1)
    })
  })
})
