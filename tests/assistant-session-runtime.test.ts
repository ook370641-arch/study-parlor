import { describe, expect, it, vi, beforeAll, beforeEach, afterEach } from 'vitest'

vi.mock('@/lib/ipc', () => ({
  ipc: {
    onLlmChunk: vi.fn(() => () => {}),
    onLlmDone: vi.fn(() => () => {}),
    onLlmError: vi.fn(() => () => {}),
    onArticleAssistantSearchDone: vi.fn(() => () => {}),
    onArticleAssistantReasoningChunk: vi.fn(() => () => {}),
    articleAssistantWriteSession: vi.fn().mockResolvedValue({ filePath: '/x.assistant.md' }),
    articleAssistantWriteGuide: vi.fn(),
    articleAssistantAbort: vi.fn(),
  },
}))

vi.mock('@/lib/paintings', () => ({
  manifest: [{ id: 'test', painter: 'Test', title: 'Test', url: '/test.jpg' }],
  pickRandom: vi.fn((m: unknown[]) => m[0] ?? null),
}))

import { ipc } from '@/lib/ipc'
import { attachAssistantSessionListeners } from '@/lib/assistant-session-runtime'
import { resetAssistantStreamBuffers } from '@/lib/assistant-stream-buffers'
import { useStore } from '@/store'
import type { AssistantSession } from '@/store'

function makeSession(overrides: Partial<AssistantSession> = {}): AssistantSession {
  return {
    contextId: '/lib/a.md',
    contextType: 'briefing',
    articleContent: '正文',
    guide: null,
    guideLoading: false,
    guideError: null,
    messages: [{ role: 'assistant', content: '' }],
    streaming: true,
    abortId: 's1',
    searchLoading: false,
    searchError: null,
    chatError: null,
    retryContext: null,
    pendingSelection: undefined,
    isOpen: true,
    activeChunkIndex: null,
    ...overrides,
  }
}

const chunkCb = () => vi.mocked(ipc.onLlmChunk).mock.calls[0][0]
const doneCb = () => vi.mocked(ipc.onLlmDone).mock.calls[0][0]
const reasoningCb = () => vi.mocked(ipc.onArticleAssistantReasoningChunk).mock.calls[0][0]
const errorCb = () => vi.mocked(ipc.onLlmError).mock.calls[0][0]

describe('assistant session runtime', () => {
  beforeAll(() => {
    attachAssistantSessionListeners()
  })

  beforeEach(() => {
    resetAssistantStreamBuffers()
    useStore.setState({ assistantSession: makeSession() })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('batches rapid chunks into a single store update per flush window', () => {
    vi.useFakeTimers()
    let updates = 0
    const unsub = useStore.subscribe(() => { updates++ })

    chunkCb()('s1', 'a')
    chunkCb()('s1', 'b')
    chunkCb()('s1', 'c')
    // 未到 flush 窗口，store 尚未更新
    expect(useStore.getState().assistantSession!.messages.at(-1)!.content).toBe('')

    vi.advanceTimersByTime(60)
    expect(useStore.getState().assistantSession!.messages.at(-1)!.content).toBe('abc')
    expect(updates).toBe(1)
    unsub()
  })

  it('flushes immediately on done and finishes streaming', () => {
    vi.useFakeTimers()
    chunkCb()('s1', 'hello')
    doneCb()('s1')
    const s = useStore.getState().assistantSession!
    expect(s.messages.at(-1)!.content).toBe('hello')
    expect(s.streaming).toBe(false)
  })

  it('appends reasoning chunks to the last assistant message', () => {
    vi.useFakeTimers()
    reasoningCb()('s1', '先梳理')
    reasoningCb()('s1', '文章结构。')
    vi.advanceTimersByTime(60)
    expect(useStore.getState().assistantSession!.messages.at(-1)!.reasoning).toBe('先梳理文章结构。')
  })

  it('ignores chunks for a stale abortId', () => {
    vi.useFakeTimers()
    chunkCb()('other-session', 'x')
    vi.advanceTimersByTime(60)
    expect(useStore.getState().assistantSession!.messages.at(-1)!.content).toBe('')
  })

  it('flushes buffered content before surfacing an error', () => {
    vi.useFakeTimers()
    chunkCb()('s1', '部分内容')
    errorCb()('s1', { code: 'CHAT_NETWORK_ERROR', message: 'boom' })
    const s = useStore.getState().assistantSession!
    expect(s.messages.at(-1)!.content).toBe('部分内容')
    expect(s.streaming).toBe(false)
    expect(s.chatError).toBe('CHAT_NETWORK_ERROR')
  })

  it('drops buffered text when the stream is aborted', () => {
    vi.useFakeTimers()
    chunkCb()('s1', '残留')
    useStore.getState().abortAssistantStream()
    vi.advanceTimersByTime(120)
    expect(useStore.getState().assistantSession!.messages.at(-1)!.content).toBe('')
  })
})
