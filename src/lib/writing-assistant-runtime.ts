import { ipc } from '@/lib/ipc'
import { useStore } from '@/store'
import type { ArticleAssistantErrorCode } from '@shared/index'
import {
  appendToContentBuffer,
  appendToReasoningBuffer,
  clearFlushTimer,
  drainContentBuffer,
  drainReasoningBuffer,
  hasFlushTimer,
  setFlushTimer,
} from '@/lib/assistant-stream-buffers'

let attached = false

const FLUSH_MS = 50

function flushBuffers() {
  clearFlushTimer()
  const state = useStore.getState()
  if (!state.writingAssistant) return
  const content = drainContentBuffer()
  if (content) {
    state.appendWritingAssistantChunk(content)
  }
  const reasoning = drainReasoningBuffer()
  if (reasoning) {
    state.appendWritingAssistantReasoning(reasoning)
  }
}

function scheduleFlush() {
  if (hasFlushTimer()) return
  setFlushTimer(setTimeout(flushBuffers, FLUSH_MS))
}

export function attachWritingAssistantListeners() {
  if (attached) return
  attached = true

  ipc.onLlmChunk((sid, text) => {
    const s = useStore.getState().writingAssistant
    if (!s || s.sessionId !== sid) return
    appendToContentBuffer(text)
    scheduleFlush()
  })

  ipc.onLlmDone((sid) => {
    const s = useStore.getState().writingAssistant
    if (!s || s.sessionId !== sid) return
    flushBuffers()
    useStore.getState().finishWritingAssistantStreaming()
  })

  ipc.onLlmError((sid, err) => {
    const s = useStore.getState().writingAssistant
    if (!s || s.sessionId !== sid) return
    flushBuffers()
    const code: ArticleAssistantErrorCode = err.code === 'CHAT_NETWORK_ERROR' ? 'CHAT_NETWORK_ERROR'
      : err.code === 'CHAT_TIMEOUT' ? 'CHAT_TIMEOUT'
      : err.code === 'CHAT_EMPTY_REPLY' ? 'CHAT_EMPTY_REPLY'
      : 'CHAT_LLM_ERROR'
    useStore.setState({ writingAssistant: { ...s, streaming: false, error: code } })
  })

  ipc.onWritingAssistantTool((e) => {
    const s = useStore.getState().writingAssistant
    if (!s || s.sessionId !== e.sessionId) return
    flushBuffers() // flush pending content before tool event
    useStore.getState().applyWritingAssistantToolEvent(e)
  })

  ipc.onWritingAssistantReasoningChunk((sid, text) => {
    const s = useStore.getState().writingAssistant
    if (!s || s.sessionId !== sid) return
    appendToReasoningBuffer(text)
    scheduleFlush()
  })
}
