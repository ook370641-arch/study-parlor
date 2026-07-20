import { ipc } from '@/lib/ipc'
import { useStore } from '@/store'
import type { ArticleAssistantErrorCode } from '@shared/index'

let attached = false

export function attachWritingAssistantListeners() {
  if (attached) return
  attached = true

  ipc.onLlmChunk((sid, text) => {
    const s = useStore.getState().writingAssistant
    if (!s || s.sessionId !== sid) return
    useStore.getState().appendWritingAssistantChunk(text)
  })

  ipc.onLlmDone((sid) => {
    const s = useStore.getState().writingAssistant
    if (!s || s.sessionId !== sid) return
    useStore.getState().finishWritingAssistantStreaming()
  })

  ipc.onLlmError((sid, err) => {
    const s = useStore.getState().writingAssistant
    if (!s || s.sessionId !== sid) return
    const code: ArticleAssistantErrorCode = err.code === 'CHAT_NETWORK_ERROR' ? 'CHAT_NETWORK_ERROR'
      : err.code === 'CHAT_TIMEOUT' ? 'CHAT_TIMEOUT'
      : 'CHAT_LLM_ERROR'
    useStore.setState({ writingAssistant: { ...s, streaming: false, error: code } })
  })

  ipc.onWritingAssistantTool((e) => {
    const s = useStore.getState().writingAssistant
    if (!s || s.sessionId !== e.sessionId) return
    useStore.getState().applyWritingAssistantToolEvent(e)
  })

  ipc.onWritingAssistantReasoningChunk((sid, text) => {
    const s = useStore.getState().writingAssistant
    if (!s || s.sessionId !== sid) return
    useStore.getState().appendWritingAssistantReasoning(text)
  })
}
