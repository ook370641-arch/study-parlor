import { describe, expect, it, vi, beforeAll, beforeEach } from 'vitest'

vi.mock('@/lib/ipc', () => ({
  ipc: {
    onLlmChunk: vi.fn(() => () => {}),
    onLlmDone: vi.fn(() => () => {}),
    onLlmError: vi.fn(() => () => {}),
    onWritingAssistantTool: vi.fn(() => () => {}),
    onWritingAssistantReasoningChunk: vi.fn(() => () => {}),
  },
}))

vi.mock('@/lib/assistant-stream-buffers', () => ({
  appendToContentBuffer: vi.fn(),
  appendToReasoningBuffer: vi.fn(),
  clearFlushTimer: vi.fn(),
  drainContentBuffer: vi.fn(() => ''),
  drainReasoningBuffer: vi.fn(() => ''),
  hasFlushTimer: vi.fn(() => false),
  setFlushTimer: vi.fn(),
}))

import { attachWritingAssistantListeners } from '@/lib/writing-assistant-runtime'
import { ipc } from '@/lib/ipc'
import { useStore } from '@/store'

const errorCb = () => vi.mocked(ipc.onLlmError).mock.calls[0][0]

describe('writing assistant runtime llm:error mapping', () => {
  beforeAll(() => {
    attachWritingAssistantListeners()
  })

  beforeEach(() => {
    useStore.setState({
      writingAssistant: {
        sessionId: 'wa-001', articlePath: null,
        messages: [{ role: 'user', content: 'q' }],
        streaming: true, error: null,
      },
    })
  })

  it('maps CHAT_EMPTY_REPLY to CHAT_EMPTY_REPLY', () => {
    errorCb()('wa-001', { code: 'CHAT_EMPTY_REPLY', message: '助手未产生回答' })
    const s = useStore.getState().writingAssistant!
    expect(s.streaming).toBe(false)
    expect(s.error).toBe('CHAT_EMPTY_REPLY')
  })

  it('falls back to CHAT_LLM_ERROR for unknown codes', () => {
    errorCb()('wa-001', { code: 'SOMETHING_ELSE', message: 'x' })
    expect(useStore.getState().writingAssistant!.error).toBe('CHAT_LLM_ERROR')
  })
})
