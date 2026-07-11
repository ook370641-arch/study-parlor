import { ipc } from '@/lib/ipc'
import { useStore } from '@/store'
import type { ArticleAssistantErrorCode } from '@shared/index'

let attached = false

export function attachAssistantSessionListeners() {
  if (attached) return
  attached = true
  ipc.onLlmChunk((sid, text) => {
    const s = useStore.getState().assistantSession
    if (!s || s.abortId !== sid) return
    useStore.getState().appendAssistantChunk(text)
  })
  ipc.onLlmDone((sid) => {
    const s = useStore.getState().assistantSession
    if (!s || s.abortId !== sid) return
    useStore.getState().finishAssistantStreaming()
  })
  ipc.onLlmError((sid, err) => {
    const s = useStore.getState().assistantSession
    if (!s || s.abortId !== sid) return
    const code: ArticleAssistantErrorCode = err.code === 'CHAT_NETWORK_ERROR' ? 'CHAT_NETWORK_ERROR'
      : err.code === 'CHAT_TIMEOUT' ? 'CHAT_TIMEOUT'
      : 'CHAT_LLM_ERROR'
    useStore.setState({ assistantSession: { ...s, streaming: false, searchLoading: false, chatError: code } })
  })
  ipc.onArticleAssistantSearchDone((sid, payload) => {
    useStore.getState().applyAssistantSearchResult(sid, payload)
  })
}
