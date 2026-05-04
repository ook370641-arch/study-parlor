// src/store/index.ts
import { create } from 'zustand'
import type {
  Difficulty, FileMeta, Message, NewTopic, Profile, RecCard, StateJson, Mode
} from '@shared/index'
import { ipc } from '@/lib/ipc'

type Page = 'cover' | 'home' | 'study' | 'profile'

type Session = {
  mode: Mode
  topic: string
  file_path?: string
  difficulty: Difficulty
  temperature: number
  history: Message[]
  streaming: boolean
  abortId: string                 // sessionId 给 IPC 用
  suggestEnd: boolean
  reviewFileBody?: string         // review 模式下缓存文件 body,避免重复读取
}

type AppStore = {
  // 持久化
  profile: Profile
  lastUsed: { difficulty: Difficulty; temperature: number }
  recommendation: { left: RecCard | null; right: RecCard | null }
  inspirations: NewTopic[]
  inspirationsLoading: boolean
  inspirationsError: boolean

  // 派生
  library: FileMeta[]
  modelInvalid: boolean
  modelInvalidReason?: string

  // 临时
  session: Session | null
  currentPage: Page
  modal: 'preStudy' | null
  preStudyArgs: { mode: Mode; topic: string; file_path?: string } | null
  toast: { message: string; ts: number } | null

  // 操作
  init: () => Promise<void>
  goto: (p: Page) => void
  openPreStudy: (a: { mode: Mode; topic: string; file_path?: string }) => void
  closePreStudy: () => void
  startSession: (a: {
    mode: Mode; topic: string; file_path?: string
    difficulty: Difficulty; temperature: number
  }) => void
  appendChunk: (text: string) => void
  finishStreaming: () => void
  pushUserMessage: (text: string) => void
  abortAndReplaceUser: (text: string) => Promise<void>
  endSession: () => void
  resetSession: () => void
  showToast: (m: string) => void
  setRecommendation: (r: { left: RecCard | null; right: RecCard | null }) => void
  setInspirations: (t: NewTopic[]) => void
  setInspirationsLoading: (v: boolean) => void
  setInspirationsError: (v: boolean) => void
  patchProfile: (p: Partial<Profile>) => Promise<void>
  patchLastUsed: (l: Partial<{ difficulty: Difficulty; temperature: number }>) => Promise<void>
}

export const useStore = create<AppStore>((set, get) => ({
  profile: { name: '', profile_text: '', preferred_topics: [] },
  lastUsed: { difficulty: 'mid', temperature: 0.7 },
  recommendation: { left: null, right: null },
  inspirations: [],
  inspirationsLoading: false,
  inspirationsError: false,
  library: [],
  modelInvalid: false,
  session: null,
  currentPage: 'cover',
  modal: null,
  preStudyArgs: null,
  toast: null,

  init: async () => {
    const [state, library] = await Promise.all([ipc.getState(), ipc.scanLibrary()])
    set({
      profile: state.profile,
      lastUsed: state.lastUsed,
      recommendation: {
        left:  state.recommendation_cache.left  ?? null,
        right: state.recommendation_cache.right ?? null
      },
      inspirations: state.suggested_new_topics?.topics ?? [],
      library
    })
  },

  goto: (p) => set({ currentPage: p }),
  openPreStudy: (a) => set({ modal: 'preStudy', preStudyArgs: a }),
  closePreStudy: () => set({ modal: null, preStudyArgs: null }),

  startSession: (a) => {
    const sid = crypto.randomUUID()
    set({
      session: {
        mode: a.mode, topic: a.topic, file_path: a.file_path,
        difficulty: a.difficulty, temperature: a.temperature,
        history: [], streaming: false, abortId: sid, suggestEnd: false
      },
      modal: null,
      preStudyArgs: null,
      currentPage: 'study'
    })
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
    const suggestEnd = s.session.suggestEnd ||
      (history[history.length - 1]?.content.includes('[[SUGGEST_END]]') ?? false)
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
  setRecommendation: (r) => set({ recommendation: r }),
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
  }
}))
