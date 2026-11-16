import { ipc } from '@/lib/ipc'
import { hasAssistantStream, useStore } from '@/store'
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

function flushBuffers(sessionId: string) {
  clearFlushTimer(sessionId)
  const state = useStore.getState()
  const content = drainContentBuffer(sessionId)
  if (content) {
    state.appendAssistantChunk(content, sessionId)
  }
  const reasoning = drainReasoningBuffer(sessionId)
  if (reasoning) {
    state.appendAssistantReasoning(reasoning, sessionId)
  }
}

// 固定窗口节流（非 debounce）：首个 chunk 开窗，窗口内 chunk 合并；连续 token 流不会饿死 UI。
function scheduleFlush(sessionId: string) {
  if (hasFlushTimer(sessionId)) return
  setFlushTimer(setTimeout(() => flushBuffers(sessionId), FLUSH_MS), sessionId)
}

export function attachAssistantSessionListeners() {
  if (attached) return
  attached = true
  ipc.onLlmChunk((sid, text) => {
    if (!hasAssistantStream(sid)) return
    appendToContentBuffer(text, sid)
    scheduleFlush(sid)
  })
  ipc.onLlmDone((sid) => {
    if (!hasAssistantStream(sid)) return
    flushBuffers(sid)
    useStore.getState().finishAssistantStreaming(sid)
  })
  ipc.onLlmError((sid, err) => {
    if (!hasAssistantStream(sid)) return
    flushBuffers(sid)
    const code: ArticleAssistantErrorCode = err.code === 'CHAT_NETWORK_ERROR' ? 'CHAT_NETWORK_ERROR'
      : err.code === 'CHAT_TIMEOUT' ? 'CHAT_TIMEOUT'
      : 'CHAT_LLM_ERROR'
    useStore.getState().finishAssistantStreaming(sid, code)
  })
  ipc.onArticleAssistantReasoningChunk((sid, text) => {
    if (!hasAssistantStream(sid)) return
    appendToReasoningBuffer(text, sid)
    scheduleFlush(sid)
  })
  ipc.onArticleAssistantSearchDone((sid, payload) => {
    if (!hasAssistantStream(sid)) return
    useStore.getState().applyAssistantSearchResult(sid, payload)
  })
  ipc.onArticleAssistantGuideProgress((payload) => {
    const s = useStore.getState().assistantSession
    if (!s || !s.guideLoading) return
    useStore.getState().setAssistantGuideProgress(payload)
  })
}
