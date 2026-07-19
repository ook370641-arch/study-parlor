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
      expect(state!.messages[0]).toEqual({ role: 'user', content: '帮我润色这段文字' })
      expect(state!.streaming).toBe(true)
      expect(state!.error).toBeNull()

      expect(ipc.writingAssistantSendMessage).toHaveBeenCalledWith({
        sessionId: state!.sessionId,
        articlePath: 'writing/a.md',
        articleContent: '# 文章内容',
        messages: [{ role: 'user', content: '帮我润色这段文字' }],
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

    it('adds insert_into_article done event with markdown', () => {
      useStore.getState().applyWritingAssistantToolEvent({
        sessionId: 'wa-001',
        phase: 'done',
        tool: 'insert_into_article',
        markdown: '# 新标题\n内容段落',
      })

      const content = useStore.getState().writingAssistant!.messages[1].content
      expect(content).toContain('已插入：')
      expect(content).toContain('# 新标题')
      expect(content).toContain('内容段落')
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
})
