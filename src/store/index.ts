// src/store/index.ts
import { create } from 'zustand'
import type {
  Difficulty, Message, NewTopic, Profile, StateJson, Mode,
  TopicMeta, UnsavedSession, ArchiveResult, Group, GroupMapping
} from '@shared/index'
import { ipc } from '@/lib/ipc'
import { manifest, pickRandom } from '@/lib/paintings'
import type { Painting } from '@shared/index'

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

  // 分组管理
  groups: Group[]
  groupMapping: GroupMapping
  activeGroupId: string | null
  gravityFieldOpen: boolean
  draggingTopic: TopicMeta | null

  // 临时
  session: Session | null
  currentPage: Page
  modal: 'preStudy' | null
  preStudyArgs: { mode: Mode; topic: string; dirName?: string; file_path?: string } | null
  toast: { message: string; ts: number } | null
  archiveResult: ArchiveResult | null
  groupInspirations: Record<string, NewTopic>
  inspirationStrategy: 'v1' | 'v2' | 'v3'

  // 画作背景
  currentPaintings: {
    cover: Painting | null
    home: Painting | null
    study: Painting | null
  }

  // 操作
  init: () => Promise<void>
  initPaintings: () => void
  swapPainting: (surface: 'cover' | 'home' | 'study') => void
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
  dismissArchive: () => void   // 用户点【暂不归档】,清掉本次 ask
  clearArchiveResult: () => void
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
  deleteArchivedSession: (dirName: string, sessionNumber: number) => Promise<void>

  // 分组操作
  loadGroups: () => Promise<void>
  setActiveGroup: (id: string | null) => void
  moveTopicToGroup: (dirName: string, groupId: string) => Promise<void>
  createGroup: (name: string) => Promise<void>
  renameGroup: (id: string, name: string) => Promise<void>
  deleteGroup: (id: string) => Promise<void>
  setGravityFieldOpen: (open: boolean) => void
  setDraggingTopic: (topic: TopicMeta | null) => void
  setGroupInspiration: (groupId: string, topic: NewTopic) => void
  removeGroupInspiration: (groupId: string) => void
  setInspirationStrategy: (s: 'v1' | 'v2' | 'v3') => void
  fableStyleTags: string[]
  lastFableTags: string[]
  setFableStyleTags: (tags: string[]) => void
  setLastFableTags: (tags: string[]) => void
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
  groups: [],
  groupMapping: {},
  activeGroupId: null,
  gravityFieldOpen: false,
  draggingTopic: null,
  session: null,
  currentPage: 'cover',
  archiveResult: null,
  groupInspirations: {},
  inspirationStrategy: 'v2',
  fableStyleTags: ['科幻', '童话', '历史', '日常生活', '悬疑', '诗意散文'],
  lastFableTags: [],
  modal: null,
  preStudyArgs: null,
  toast: null,
  currentPaintings: { cover: null, home: null, study: null },

  init: async () => {
    const [state, library, unsaved, groupsData] = await Promise.all([
      ipc.getState(), ipc.scanLibrary(), ipc.loadSessions(), ipc.loadGroups()
    ])
    set({
      profile: state.profile,
      lastUsed: state.lastUsed,
      inspirations: state.suggested_new_topics?.topics ?? [],
      groupInspirations: state.groupInspirations ?? {},
      inspirationStrategy: state.inspirationStrategy ?? 'v2',
      fableStyleTags: state.fableStyleTags ?? ['科幻', '童话', '历史', '日常生活', '悬疑', '诗意散文'],
      lastFableTags: state.lastFableTags ?? [],
      session_count: state.ui?.session_count ?? 0,
      library,
      unsavedSessions: unsaved,
      groups: groupsData.groups,
      groupMapping: groupsData.mapping
    })
    get().initPaintings()
  },

  initPaintings: () => {
    set({
      currentPaintings: {
        cover: pickRandom(manifest, null),
        home: pickRandom(manifest, null),
        study: pickRandom(manifest, null),
      }
    })
  },

  swapPainting: (surface) => {
    const current = get().currentPaintings[surface]
    const next = pickRandom(manifest, current?.id ?? null)
    if (!next) return
    set(state => ({
      currentPaintings: { ...state.currentPaintings, [surface]: next }
    }))
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

    if (last?.role === 'assistant') {
      history[history.length - 1] = { ...last, content: last.content + text }
    } else {
      history.push({ role: 'assistant', content: text })
    }

    return { session: { ...s.session, history, streaming: true } }
  }),

  finishStreaming: () => set(s => {
    if (!s.session) return s
    const lastMsg = s.session.history[s.session.history.length - 1]
    // 宽容检测:支持全角/半角问号及可选空格,防止 LLM 输出格式微差导致漏检
    const content = lastMsg?.content ?? ''
    const archivePending = lastMsg?.role === 'assistant' &&
                           /需要存档吗\s*[?？]/.test(content)
    return { session: { ...s.session, streaming: false, archivePending } }
  }),

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

  dismissArchive: () => set(s =>
    s.session ? { session: { ...s.session, archivePending: false } } : s
  ),

  clearArchiveResult: () => set({ archiveResult: null }),

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
    // 刷新 store 中的未保存会话列表，确保返回首页后立即可见
    const refreshed = await ipc.loadSessions()
    set({ unsavedSessions: refreshed })
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
        abortId: unsaved.id,
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
  },

  deleteArchivedSession: async (dirName: string, sessionNumber: number) => {
    await ipc.deleteArchivedSession({ dirName, sessionNumber })
    const library = await ipc.scanLibrary()
    set({ library })
  },

  loadGroups: async () => {
    const data = await ipc.loadGroups()
    set({ groups: data.groups, groupMapping: data.mapping })
  },

  setActiveGroup: (id) => set({ activeGroupId: id }),

  moveTopicToGroup: async (dirName, groupId) => {
    const mapping = { ...get().groupMapping, [dirName]: groupId }
    await ipc.updateGroupMapping(mapping)
    set({ groupMapping: mapping })
    const library = await ipc.scanLibrary()
    set({ library })
  },

  createGroup: async (name) => {
    const color = generateGroupColor()
    const group = await ipc.createGroup(name, color)
    set(s => ({ groups: [...s.groups, group] }))
  },

  renameGroup: async (id, name) => {
    await ipc.renameGroup(id, name)
    set(s => ({
      groups: s.groups.map(g => g.id === id ? { ...g, name } : g)
    }))
  },

  deleteGroup: async (id) => {
    await ipc.deleteGroup(id, 'default')
    set(s => {
      const mapping = { ...s.groupMapping }
      for (const [dirName, gid] of Object.entries(mapping)) {
        if (gid === id) mapping[dirName] = 'default'
      }
      return {
        groups: s.groups.filter(g => g.id !== id),
        groupMapping: mapping,
        activeGroupId: s.activeGroupId === id ? null : s.activeGroupId
      }
    })
    const library = await ipc.scanLibrary()
    set({ library })
  },

  setGravityFieldOpen: (open) => set({ gravityFieldOpen: open }),

  setDraggingTopic: (topic) => set({ draggingTopic: topic }),

  setGroupInspiration: (groupId, topic) => {
    const next = { ...get().groupInspirations, [groupId]: topic }
    set({ groupInspirations: next })
    ipc.patchState({ groupInspirations: next } as Partial<StateJson>)
  },

  removeGroupInspiration: (groupId) => {
    const next = { ...get().groupInspirations }
    delete next[groupId]
    set({ groupInspirations: next })
    ipc.patchState({ groupInspirations: next } as Partial<StateJson>)
  },

  setInspirationStrategy: (strategy) => {
    set({ inspirationStrategy: strategy })
    ipc.patchState({ inspirationStrategy: strategy } as Partial<StateJson>)
  },
  setFableStyleTags: (tags) => {
    set({ fableStyleTags: tags })
    ipc.patchState({ fableStyleTags: tags } as Partial<StateJson>)
  },
  setLastFableTags: (tags) => {
    set({ lastFableTags: tags })
    ipc.patchState({ lastFableTags: tags } as Partial<StateJson>)
  },
}))

function generateGroupColor(): string {
  const darkColors = [
    '#8b5a2b', '#5a4632', '#4a6741', '#4a5568', '#6b4c3b',
    '#4c5c6b', '#6b5b4c', '#5c4b6b', '#4b6b5c', '#6b4b5c'
  ]
  return darkColors[Math.floor(Math.random() * darkColors.length)]
}
