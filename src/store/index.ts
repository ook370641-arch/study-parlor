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
  archivePending: boolean   // LLM 是否问了 "需要存档吗?" 且尚未被用户处理(归档/dismiss)
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
  dismissArchive: () => void   // 用户点【暂不归档】,清掉本次 ask
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
        history: [], streaming: false, abortId: sid, archivePending: false
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
    // 记录 append 之前的 assistant 消息内容(用于边沿检测)
    const beforeContent = (last?.role === 'assistant') ? last.content : ''

    if (last?.role === 'assistant') {
      history[history.length - 1] = { ...last, content: last.content + text }
    } else {
      history.push({ role: 'assistant', content: text })
    }

    const afterContent = history[history.length - 1].content
    const phrase = '需要存档吗?'
    // 边沿检测:本次 append 让消息**从无到有**包含问句
    const newAsk = !beforeContent.includes(phrase) && afterContent.includes(phrase)
    // archivePending 是粘性的"有未处理的 ask",但**只在新 ask 边沿**才置位
    // → 用户 dismiss 后,只有 LLM 真的再问一次才会重新置位(不会被同一句反复触发)
    const archivePending = s.session.archivePending || newAsk

    return { session: { ...s.session, history, streaming: true, archivePending } }
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

  dismissArchive: () => set(s =>
    s.session ? { session: { ...s.session, archivePending: false } } : s
  ),

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
        archivePending: false
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
