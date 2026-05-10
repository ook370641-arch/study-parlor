import { useStore } from '@/store'
import { ipc } from '@/lib/ipc'

let unsubChunk: (() => void) | null = null
let unsubDone: (() => void) | null = null
let unsubError: (() => void) | null = null
let isSending = false

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
    // 流完成后自动保存
    useStore.getState().saveCurrentSession().catch((e) => {
      console.error('[auto-save] failed:', e)
    })
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
  let progressSummary: string | undefined

  if (s.session.mode === 'progress' && history.length === 0) {
    history = [{ role: 'user', content: `今夜想学:${s.session.topic}` }]
    useStore.setState(state => state.session
      ? { session: { ...state.session, history, streaming: true } }
      : state)

    // 继续学习：读取锚点文件的 progress_summary
    if (s.session.dirName) {
      try {
        const { frontmatter } = await ipc.readAnchorFile(s.session.dirName)
        progressSummary = frontmatter.progress_summary
      } catch (err) {
        console.warn('[kickoff] failed to read anchor:', err)
      }
    }
  } else if (s.session.mode === 'review') {
    // 复习现取最新一次 session 的 学习报告.md(via readAnchorFile),
    // 不再依赖 file_path —— StudyLibrary 复习入口本就没传 file_path,
    // 之前的 `if (!file_path) throw` 会让 kickoff 直接挂掉。
    if (!s.session.dirName) throw new Error('review session needs dirName')
    const { body } = await ipc.readAnchorFile(s.session.dirName)
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
    progressSummary,
    history,
    temperature: s.session.temperature
  })
}

export async function sendOrInterrupt(text: string) {
  if (isSending) return
  isSending = true

  try {
    const s = useStore.getState()
    if (!s.session) return

    // 复习模式补水:从"未完成会话"恢复时 reviewFileBody 是 undefined
    // (UnsavedSession 不持久化正文;kickoff 又只在 history.length===0 时触发)
    // → 这里懒加载一次,否则 llm:start 收到 undefined 会让 assemblePrompt 抛错
    if (s.session.mode === 'review' && !s.session.reviewFileBody && s.session.dirName) {
      try {
        const { body } = await ipc.readAnchorFile(s.session.dirName)
        useStore.setState(state => state.session
          ? { session: { ...state.session, reviewFileBody: body } }
          : state)
      } catch (err: any) {
        useStore.getState().showToast('读取笔记失败:' + err.message)
        return
      }
    }

    if (s.session.streaming) {
      await s.abortAndReplaceUser(text)
    } else {
      s.pushUserMessage(text)
    }

    // 自动保存 session
    await s.saveCurrentSession()

    // 触发新一轮
    useStore.setState(state => state.session
      ? { session: { ...state.session, streaming: true } }
      : state)
    const state = useStore.getState()
    const MAX_PAIRS = 30
    const history = state.session!.history
      .slice(-MAX_PAIRS * 2)

    await ipc.llmStart({
      sessionId: state.session!.abortId,
      mode: state.session!.mode,
      difficulty: state.session!.difficulty,
      profile: state.profile,
      reviewFileBody: state.session!.reviewFileBody,
      history,
      temperature: state.session!.temperature
    })
  } finally {
    isSending = false
  }
}
