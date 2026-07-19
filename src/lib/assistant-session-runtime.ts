import { ipc } from '@/lib/ipc'
import { useStore } from '@/store'
import type { ArticleAssistantErrorCode } from '@shared/index'

let attached = false
let contentBuffer = ''
let reasoningBuffer = ''
let flushTimer: ReturnType<typeof setTimeout> | null = null

const FLUSH_MS = 50

export function resetAssistantStreamBuffers() {
  if (flushTimer) {
    clearTimeout(flushTimer)
    flushTimer = null
  }
  contentBuffer = ''
  reasoningBuffer = ''
}

function flushBuffers() {
  if (flushTimer) {
    clearTimeout(flushTimer)
    flushTimer = null
  }
  const state = useStore.getState()
  if (contentBuffer) {
    const text = contentBuffer
    contentBuffer = ''
    state.appendAssistantChunk(text)
  }
  if (reasoningBuffer) {
    const text = reasoningBuffer
    reasoningBuffer = ''
    state.appendAssistantReasoning(text)
  }
}

function scheduleFlush() {
  if (flushTimer) return
  flushTimer = setTimeout(flushBuffers, FLUSH_MS)
}

export function attachAssistantSessionListeners() {
  if (attached) return
  attached = true
  ipc.onLlmChunk((sid, text) => {
    const s = useStore.getState().assistantSession
    if (!s || s.abortId !== sid) return
    contentBuffer += text
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
    reasoningBuffer += text
    scheduleFlush()
  })
  ipc.onArticleAssistantSearchDone((sid, payload) => {
    useStore.getState().applyAssistantSearchResult(sid, payload)
  })
}
