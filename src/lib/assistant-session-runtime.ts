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

export { resetAssistantStreamBuffers } from '@/lib/assistant-stream-buffers'

let attached = false

const FLUSH_MS = 50

function flushBuffers() {
  clearFlushTimer()
  const state = useStore.getState()
  const content = drainContentBuffer()
  if (content) {
    state.appendAssistantChunk(content)
  }
  const reasoning = drainReasoningBuffer()
  if (reasoning) {
    state.appendAssistantReasoning(reasoning)
  }
}

// 固定窗口节流（非 debounce）：首个 chunk 开窗，窗口内 chunk 合并；连续 token 流不会饿死 UI。
function scheduleFlush() {
  if (hasFlushTimer()) return
  setFlushTimer(setTimeout(flushBuffers, FLUSH_MS))
}

export function attachAssistantSessionListeners() {
  if (attached) return
  attached = true
  ipc.onLlmChunk((sid, text) => {
    const s = useStore.getState().assistantSession
    if (!s || s.abortId !== sid) return
    appendToContentBuffer(text)
    scheduleFlush()
  })
  ipc.onLlmDone((sid) => {
    const s = useStore.getState().assistantSession
    if (!s || s.abortId !== sid) return
    flushBuffers()
    useStore.getState().finishAssistantStreaming()
  })
  ipc.onLlmError((sid, err) => {
    const s = useStore.getState().assistantSession
    if (!s || s.abortId !== sid) return
    flushBuffers()
    const code: ArticleAssistantErrorCode = err.code === 'CHAT_NETWORK_ERROR' ? 'CHAT_NETWORK_ERROR'
      : err.code === 'CHAT_TIMEOUT' ? 'CHAT_TIMEOUT'
      : 'CHAT_LLM_ERROR'
    const cur = useStore.getState().assistantSession
    if (!cur) return
    useStore.setState({ assistantSession: { ...cur, streaming: false, searchLoading: false, chatError: code } })
  })
  ipc.onArticleAssistantReasoningChunk((sid, text) => {
    const s = useStore.getState().assistantSession
    if (!s || s.abortId !== sid) return
    appendToReasoningBuffer(text)
    scheduleFlush()
  })
  ipc.onArticleAssistantSearchDone((sid, payload) => {
    useStore.getState().applyAssistantSearchResult(sid, payload)
  })
}
