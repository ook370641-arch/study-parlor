// src/store/index.ts
import { create } from 'zustand'
import type {
  Difficulty, Message, NewTopic, Profile, StateJson, Mode,
  TopicMeta, UnsavedSession
} from '@shared/index'
import { ipc } from '@/lib/ipc'

type Page = 'cover' | 'home' | 'study' | 'profile'

type Session = {
  mode: Mode
  topic: string
  dirName?: string
  file_path?: string
  difficulty: Difficulty
  temperature: number
  history: Message[]
  streaming: boolean
  abortId: string
  suggestEnd: boolean
  reviewFileBody?: string
}

type AppStore = {
  // 持久化
  profile: Profile
  lastUsed: { difficulty: Difficulty; temperature: number }
  inspirations: NewTopic[]
  inspirationsLoading: boolean
  inspirationsError: boolean
  session_count: number

  // 派生
  library: TopicMeta[]
  modelInvalid: boolean
  modelInvalidReason?: string
  unsavedSessions: UnsavedSession[]

  // 临时
  session: Session | null
  currentPage: Page
  modal: 'preStudy' | null
  preStudyArgs: { mode: Mode; topic: string; dirName?: string; file_path?: string } | null
  toast: { message: string; ts: number } | null

  // 操作
  init: () => Promise<void>
  goto: (p: Page) => void
  openPreStudy: (a: { mode: Mode; topic: string; dirName?: string; file_path?: string }) => void
  closePreStudy: () => void
  startSession: (a: {
    mode: Mode; topic: string; dirName?: string; file_path?: string
    difficulty: Difficulty; temperature: number
  }) => void
  appendChunk: (text: string) => void
  finishStreaming: () => void
  pushUserMessage: (text: string) => void
  abortAndReplaceUser: (text: string) => Promise<void>
  endSession: () => void
  resetSession: () => void
  showToast: (m: string) => void
  setInspirations: (t: NewTopic[]) => void
  setInspirationsLoading: (v: boolean) => void
  setInspirationsError: (v: boolean) => void
  patchProfile: (p: Partial<Profile>) => Promise<void>
  patchLastUsed: (l: Partial<{ difficulty: Difficulty; temperature: number }>) => Promise<void>
  saveCurrentSession: () => Promise<void>
  restoreSession: (session: UnsavedSession) => void
  removeUnsavedSession: (id: string) => void
}

export const useStore = create<AppStore>((set, get) => ({
  profile: { name: '', profile_text: '', preferred_topics: [] },
  lastUsed: { difficulty: 'mid', temperature: 0.7 },
  inspirations: [],
  inspirationsLoading: false,
  inspirationsError: false,
  session_count: 0,
  library: [],
  modelInvalid: false,
  unsavedSessions: [],
  session: null,
  currentPage: 'cover',
  modal: null,
  preStudyArgs: null,
  toast: null,

  init: async () => {
    const [state, library, unsaved] = await Promise.all([
      ipc.getState(), ipc.scanLibrary(), ipc.loadSessions()
    ])
    set({
      profile: state.profile,
      lastUsed: state.lastUsed,
      inspirations: state.suggested_new_topics?.topics ?? [],
      session_count: state.ui?.session_count ?? 0,
      library,
      unsavedSessions: unsaved
    })
  },

  goto: (p) => set({ currentPage: p }),
  openPreStudy: (a) => set({ modal: 'preStudy', preStudyArgs: a }),
  closePreStudy: () => set({ modal: null, preStudyArgs: null }),

  startSession: (a) => {
    const sid = crypto.randomUUID()
    const nextCount = get().session_count + 1
    set({
      session_count: nextCount,
      session: {
        mode: a.mode, topic: a.topic, dirName: a.dirName, file_path: a.file_path,
        difficulty: a.difficulty, temperature: a.temperature,
        history: [], streaming: false, abortId: sid, suggestEnd: false
      },
      modal: null,
      preStudyArgs: null,
      currentPage: 'study'
    })
    ipc.patchState({ ui: { session_count: nextCount } } as Partial<StateJson>)
  },

  appendChunk: (text) => set(s => {
    if (!s.session) return s
    const history = [...s.session.history]
    const last = history[history.length - 1]
    if (last?.role === 'assistant') {
      history[history.length - 1] = { ...last, content: last.content + text }
    } else {
      history.push({ role: 'assistant', content: text })
    }
    // 非粘性:仅以"当前正在流的这条 assistant 消息"是否含「本轮归档」决定
    // suggestEnd。这样 LLM 后续轮如果不再判定该结束,UI 提示也能撤回。
    // token 是**可见**的协议字符 —— LLM 在判定本轮可结束时显式写在最末一行,
    // ChatBubble 不再剥离它,用户能直接验证 LLM 是否真说了这 4 个字。
    const suggestEnd = history[history.length - 1]?.content.includes('「本轮归档」') ?? false
    return { session: { ...s.session, history, streaming: true, suggestEnd } }
  }),

  finishStreaming: () => set(s => s.session
    ? { session: { ...s.session, streaming: false } }
    : s),

  pushUserMessage: (text) => set(s => {
    if (!s.session) return s
    return { session: { ...s.session, history: [...s.session.history, { role: 'user', content: text }] } }
  }),

  abortAndReplaceUser: async (text) => {
    const s = get()
    if (!s.session) return
    if (s.session.streaming) {
      await ipc.llmAbort(s.session.abortId)
      // chunk 流可能还在飞,先把 streaming 关掉等下条 done 信号
    }
    set(state => state.session
      ? { session: { ...state.session,
          streaming: false,
          history: [...state.session.history, { role: 'user', content: text }] } }
      : state)
  },

  endSession: () => {
    // 占位,实际 finalize 流程由 Study 页触发
  },

  resetSession: () => set({ session: null, currentPage: 'home' }),
  showToast: (message) => set({ toast: { message, ts: Date.now() } }),
  setInspirations: (t) => set({ inspirations: t }),
  setInspirationsLoading: (v) => set({ inspirationsLoading: v }),
 setInspirationsError: (v) => set({ inspirationsError: v }),

  patchProfile: async (p) => {
    const next = { ...get().profile, ...p }
    set({ profile: next })
    await ipc.patchState({ profile: next } as Partial<StateJson>)
  },

  patchLastUsed: async (l) => {
    const next = { ...get().lastUsed, ...l }
    set({ lastUsed: next })
    await ipc.patchState({ lastUsed: next } as Partial<StateJson>)
  },

  saveCurrentSession: async () => {
    const s = get().session
    if (!s) return
    // 空对话不写入 unsaved 队列:onBack 在用户一句话都没说时也会调本方法,
    // 没有 history 的 stub 既不能恢复也不该污染首页"未完成的会话"提示。
    if (s.history.length === 0) return
    const unsaved: UnsavedSession = {
      id: s.abortId,
      mode: s.mode,
      topic: s.topic,
      dirName: s.dirName,
      file_path: s.file_path,
      difficulty: s.difficulty,
      temperature: s.temperature,
      history: s.history
    }
    await ipc.saveSession(unsaved)
  },

  restoreSession: (unsaved) => {
    set({
      session: {
        mode: unsaved.mode,
        topic: unsaved.topic,
        dirName: unsaved.dirName,
        file_path: unsaved.file_path,
        difficulty: unsaved.difficulty,
        temperature: unsaved.temperature,
        history: unsaved.history,
        streaming: false,
        abortId: crypto.randomUUID(),
        suggestEnd: false
      },
      currentPage: 'study'
    })
  },

  removeUnsavedSession: (id) => {
    set(s => ({
      unsavedSessions: s.unsavedSessions.filter(us => us.id !== id)
    }))
    ipc.deleteSession(id)
  }
}))
