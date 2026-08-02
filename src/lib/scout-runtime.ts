import { ipc } from '@/lib/ipc'
import { useStore } from '@/store'

let initialized = false

export function initScoutRuntime(): void {
  if (initialized) return
  initialized = true

  ipc.onLlmChunk((sessionId: string, text: string) => {
    const s = useStore.getState()
    if (sessionId !== s.scoutActiveConversationId || !s.scoutStreaming) return
    const msgs = [...s.scoutMessages]
    const last = msgs[msgs.length - 1]
    if (last?.role === 'assistant' && !(last as any).__finalized) {
      msgs[msgs.length - 1] = { ...last, content: last.content + text }
    } else {
      msgs.push({ role: 'assistant', content: text })
    }
    useStore.setState({ scoutMessages: msgs })
  })

  ipc.onScoutTool((e) => {
    const s = useStore.getState()
    if (e.conversationId !== s.scoutActiveConversationId) return
    if (e.phase === 'candidates') {
      // 把候选卡片挂到最近一条 assistant 消息
      const msgs = [...s.scoutMessages]
      for (let i = msgs.length - 1; i >= 0; i--) {
        if (msgs[i].role === 'assistant') {
          msgs[i] = { ...msgs[i], candidates: e.candidates, candidatesResolved: false }
          break
        }
      }
      if (msgs.length === 0 || msgs[msgs.length - 1].role !== 'assistant') {
        msgs.push({ role: 'assistant', content: '', candidates: e.candidates, candidatesResolved: false })
      }
      useStore.setState({ scoutMessages: msgs })
    }
    if (e.phase === 'done' && e.tool === 'fetch_and_save') {
      // 抓取完成刷新文章列表
      void ipc.scoutListArticles().then((articles) => useStore.setState({ scoutArticles: articles }))
    }
  })
}
