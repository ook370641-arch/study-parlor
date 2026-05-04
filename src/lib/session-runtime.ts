import { useStore } from '@/store'
import { ipc } from '@/lib/ipc'

let unsubChunk: (() => void) | null = null
let unsubDone: (() => void) | null = null
let unsubError: (() => void) | null = null

export function attachSessionListeners() {
  unsubChunk?.(); unsubDone?.(); unsubError?.()
  unsubChunk = ipc.onLlmChunk((sid, text) => {
    const s = useStore.getState().session
    if (!s || s.abortId !== sid) return
    useStore.getState().appendChunk(text)
  })
  unsubDone = ipc.onLlmDone((sid) => {
    const s = useStore.getState().session
    if (!s || s.abortId !== sid) return
    useStore.getState().finishStreaming()
  })
  unsubError = ipc.onLlmError((sid, err) => {
    const s = useStore.getState().session
    if (!s || s.abortId !== sid) return
    useStore.getState().finishStreaming()
    useStore.getState().showToast('流式失败:' + err.message)
  })
}

export async function kickoffSession() {
  const s = useStore.getState()
  if (!s.session) return

  let history = s.session.history
  let reviewFileBody: string | undefined
  if (s.session.mode === 'progress' && history.length === 0) {
    history = [{ role: 'user', content: `今夜想学:${s.session.topic}` }]
    useStore.setState(state => state.session
      ? { session: { ...state.session, history, streaming: true } }
      : state)
  } else if (s.session.mode === 'review') {
    if (!s.session.file_path) throw new Error('review session needs file_path')
    const { body } = await ipc.readMd(s.session.file_path)
    reviewFileBody = body
    useStore.setState(state => state.session
      ? { session: { ...state.session, streaming: true, reviewFileBody: body } }
      : state)
  }

  await ipc.llmStart({
    sessionId: s.session.abortId,
    mode: s.session.mode,
    difficulty: s.session.difficulty,
    profile: s.profile,
    reviewFileBody,
    history,
    temperature: s.session.temperature
  })
}

export async function sendOrInterrupt(text: string) {
  const s = useStore.getState()
  if (!s.session) return
  if (s.session.streaming) {
    await s.abortAndReplaceUser(text)
  } else {
    s.pushUserMessage(text)
  }
  // 触发新一轮
  useStore.setState(state => state.session
    ? { session: { ...state.session, streaming: true } }
    : state)
  const state = useStore.getState()
  const MAX_PAIRS = 30
  const history = state.session!.history.slice(-MAX_PAIRS * 2)

  await ipc.llmStart({
    sessionId: state.session!.abortId,
    mode: state.session!.mode,
    difficulty: state.session!.difficulty,
    profile: state.profile,
    reviewFileBody: state.session!.reviewFileBody,
    history,
    temperature: state.session!.temperature
  })
}
