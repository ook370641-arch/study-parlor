// src/store/index.ts
import { create } from 'zustand'
import type {
  Difficulty, Message, NewTopic, Profile, StateJson, Mode,
  TopicMeta, UnsavedSession, ArchiveResult, Group, GroupMapping,
  TopicContinueCache, BriefingResult, SearchResult, SearchSource, SearchErrorCode,
  Terminology
} from '@shared/index'
import { ipc } from '@/lib/ipc'
import { manifest, pickRandom } from '@/lib/paintings'
import type { Painting } from '@shared/index'

type Page = 'cover' | 'home' | 'study' | 'profile' | 'extension' | 'settings' | 'briefing'

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
  userRequirement?: string
  selectedTopic?: string
  enableExternalMaterials?: boolean
}

type AppStore = {
  // 持久化
  profile: Profile
  lastUsed: { difficulty: Difficulty; temperature: number }
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
  wildcardInspiration: NewTopic | null
  wildcardLoading: boolean
  wildcardError: string | null
  topicContinueSuggestions: Record<string, TopicContinueCache>
  terminology: Terminology

  // 后台归档占位
  pendingArchives: Array<{
    dirName: string
    topic: string
    sessionNumber: number
    mode: Mode
    date: string
  }>

  // 简报
  briefing: {
    result: BriefingResult | null
    loading: boolean
    error: string | null
  }
  briefingHistory: {
    list: { date: string; filePath: string }[]
    loading: boolean
    error: string | null
  }
  generateBriefing: (date: string) => Promise<void>
  loadBriefingHistory: () => Promise<void>

  // 画作背景
  currentPaintings: {
    cover: Painting | null
    home: Painting | null
    study: Painting | null
    briefing: Painting | null
  }

  // 外部资料
  externalMaterials: {
    summary: string | null
    sources: SearchSource[]
    loading: boolean
    error: SearchErrorCode | null
  } | null

  // 操作
  init: () => Promise<void>
  initPaintings: () => void
  swapPainting: (surface: 'cover' | 'home' | 'study' | 'briefing') => void
  goto: (p: Page) => void
  openPreStudy: (a: { mode: Mode; topic: string; dirName?: string; file_path?: string }) => void
  closePreStudy: () => void
  startSession: (a: {
    mode: Mode; topic: string; dirName?: string; file_path?: string
    difficulty: Difficulty; temperature: number
    userRequirement?: string
    selectedTopic?: string
    enableExternalMaterials?: boolean
  }) => void
  appendChunk: (text: string) => void
  finishStreaming: () => void
  pushUserMessage: (text: string) => void
  abortAndReplaceUser: (text: string) => Promise<void>
  dismissArchive: () => void   // 用户点【暂不归档】,清掉本次 ask
  clearArchiveResult: () => void
  resetSession: () => void
  showToast: (m: string) => void
  patchProfile: (p: Partial<Profile>) => Promise<void>
  patchLastUsed: (l: Partial<{ difficulty: Difficulty; temperature: number }>) => Promise<void>
  patchTerminology: (patch: Terminology) => Promise<void>
  resetTerminology: () => Promise<void>
  saveCurrentSession: () => Promise<void>
  restoreSession: (session: UnsavedSession) => void
  removeUnsavedSession: (id: string) => void
  deleteArchivedSession: (dirName: string, sessionNumber: number) => Promise<void>

  // 外部资料操作
  prepareExternalMaterials: (topic: string) => Promise<void>
  setExternalMaterials: (materials: SearchResult) => void
  setExternalMaterialsError: (error: SearchErrorCode) => void
  clearExternalMaterials: () => void

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
  setWildcardInspiration: (topic: NewTopic | null) => void
  refreshWildcardInspiration: () => Promise<void>
  fableStyleTags: string[]
  lastFableTags: string[]
  setFableStyleTags: (tags: string[]) => void
  setLastFableTags: (tags: string[]) => void

  addPendingArchive: (pending: {
    dirName: string
    topic: string
    sessionNumber: number
    mode: Mode
    date: string
  }) => void
  removePendingArchive: (dirName: string, sessionNumber: number) => void
}

let wildcardRequestId = 0

export const useStore = create<AppStore>((set, get) => ({
  profile: { name: '', profile_text: '', preferred_topics: [] },
  lastUsed: { difficulty: 'mid', temperature: 0.7 },
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
  wildcardInspiration: null,
  wildcardLoading: false,
  wildcardError: null,
  topicContinueSuggestions: {},
  terminology: {},
  pendingArchives: [],
  fableStyleTags: ['科幻', '童话', '历史', '日常生活', '悬疑', '诗意散文'],
  lastFableTags: [],
  externalMaterials: null,
  modal: null,
  preStudyArgs: null,
  toast: null,
  currentPaintings: { cover: null, home: null, study: null, briefing: null },
  briefing: { result: null, loading: false, error: null },
  briefingHistory: { list: [], loading: false, error: null },

  init: async () => {
    const [state, library, unsaved, groupsData] = await Promise.all([
      ipc.getState(), ipc.scanLibrary(), ipc.loadSessions(), ipc.loadGroups()
    ])
    set({
      profile: state.profile,
      lastUsed: state.lastUsed ?? { difficulty: 'mid', temperature: 0.7 },
      groupInspirations: state.groupInspirations ?? {},
      inspirationStrategy: state.inspirationStrategy ?? 'v2',
      wildcardInspiration: state.wildcardInspiration ?? null,
      topicContinueSuggestions: state.topicContinueSuggestions ?? {},
      terminology: state.terminology ?? {},
      fableStyleTags: state.fableStyleTags ?? ['科幻', '童话', '历史', '日常生活', '悬疑', '诗意散文'],
      lastFableTags: state.lastFableTags ?? [],
      session_count: state.ui?.session_count ?? 0,
      library,
      unsavedSessions: unsaved,
      groups: groupsData.groups,
      groupMapping: groupsData.mapping
    })
    get().initPaintings()

    // 首次启动且没有缓存推荐时，在后台生成一次意外之径
    // 不 await，避免阻塞首页渲染；加载状态由 WildCardRecCard 展示
    if (!state.wildcardInspiration) {
      get().refreshWildcardInspiration().catch((err) => {
        const msg = String(err?.message ?? err)
        console.error('[init] wildcard generation failed:', msg)
        set({ wildcardError: msg })
      })
    }
  },

  initPaintings: () => {
    set({
      currentPaintings: {
        cover: pickRandom(manifest, null),
        home: pickRandom(manifest, null),
        study: pickRandom(manifest, null),
        briefing: pickRandom(manifest, null),
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
        history: [], streaming: false, abortId: sid, archivePending: false,
        userRequirement: a.userRequirement,
        selectedTopic: a.selectedTopic,
        enableExternalMaterials: a.enableExternalMaterials
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

  generateBriefing: async (date: string) => {
    const s = get()
    if (s.briefing.loading) return
    set({ briefing: { result: null, loading: true, error: null } })
    try {
      const result = await ipc.briefingGenerate({ date, profile: s.profile })
      set({ briefing: { result, loading: false, error: null } })
    } catch (err: any) {
      set({ briefing: { result: null, loading: false, error: err.message || String(err) } })
    }
  },

  loadBriefingHistory: async () => {
    set({ briefingHistory: { ...get().briefingHistory, loading: true, error: null } })
    try {
      const list = await ipc.briefingList()
      set({ briefingHistory: { list, loading: false, error: null } })
    } catch (err: any) {
      set({ briefingHistory: { ...get().briefingHistory, loading: false, error: err.message || String(err) } })
    }
  },

  resetSession: () => set({ session: null, currentPage: 'home', externalMaterials: null }),
  showToast: (message) => set({ toast: { message, ts: Date.now() } }),

  prepareExternalMaterials: async (topic) => {
    if (get().externalMaterials?.loading) return
    set({ externalMaterials: { summary: null, sources: [], loading: true, error: null } })
    try {
      const result = await ipc.searchPrepare({ topic })
      set({ externalMaterials: { summary: result.summary, sources: result.sources, loading: false, error: null } })
    } catch (err: any) {
      const code: SearchErrorCode = err?.code ?? 'NETWORK_ERROR'
      const messages: Record<SearchErrorCode, string> = {
        MISSING_API_KEY: '请先在设置中配置 Tavily API Key',
        NETWORK_ERROR: '外部资料获取失败，本次不使用联网内容',
        LLM_ERROR: '外部资料整理失败，本次不使用联网内容',
        NO_RESULTS: '未找到相关外部资料，本次不使用联网内容'
      }
      get().showToast(messages[code] ?? '外部资料获取失败')
      set({ externalMaterials: { summary: null, sources: [], loading: false, error: code } })
    }
  },

  setExternalMaterials: (materials) => set({
    externalMaterials: { summary: materials.summary, sources: materials.sources, loading: false, error: null }
  }),

  setExternalMaterialsError: (error) => set({
    externalMaterials: { summary: null, sources: [], loading: false, error }
  }),

  clearExternalMaterials: () => set({ externalMaterials: null }),

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
    const state = get()
    const s = state.session
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
      history: s.history,
      userRequirement: s.userRequirement,
      selectedTopic: s.selectedTopic,
      enableExternalMaterials: s.enableExternalMaterials,
      externalMaterials: state.externalMaterials?.summary
        ? { summary: state.externalMaterials.summary, sources: state.externalMaterials.sources }
        : undefined
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
        archivePending: false,
        userRequirement: unsaved.userRequirement,
        selectedTopic: unsaved.selectedTopic,
        enableExternalMaterials: unsaved.enableExternalMaterials
      },
      externalMaterials: unsaved.externalMaterials
        ? { summary: unsaved.externalMaterials.summary, sources: unsaved.externalMaterials.sources, loading: false, error: null }
        : null,
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
  setWildcardInspiration: (topic) => {
    set({ wildcardInspiration: topic, wildcardError: null })
    ipc.patchState({ wildcardInspiration: topic } as Partial<StateJson>)
  },
  refreshWildcardInspiration: async () => {
    if (get().wildcardLoading) return
    const requestId = ++wildcardRequestId
    set({ wildcardLoading: true, wildcardError: null })
    try {
      const { profile, library } = get()
      const topics = library.map(t => ({ title: t.title }))
      const result = await ipc.llmWildcardInspiration({ profile, topics })
      if (requestId !== wildcardRequestId) return
      get().setWildcardInspiration(result)
    } catch (err: any) {
      if (requestId !== wildcardRequestId) return
      const msg = String(err?.message ?? err)
      console.error('[refreshWildcardInspiration] error:', msg)
      set({ wildcardError: msg })
    } finally {
      if (requestId === wildcardRequestId) {
        set({ wildcardLoading: false })
      }
    }
  },
  setFableStyleTags: (tags) => {
    set({ fableStyleTags: tags })
    ipc.patchState({ fableStyleTags: tags } as Partial<StateJson>)
  },
  setLastFableTags: (tags) => {
    set({ lastFableTags: tags })
    ipc.patchState({ lastFableTags: tags } as Partial<StateJson>)
  },

  patchTerminology: async (patch: Terminology) => {
    const current = get().terminology
    const next: Terminology = { ...current }
    for (const [key, value] of Object.entries(patch)) {
      if (value === undefined || value === '') {
        delete (next as Record<string, string | undefined>)[key]
      } else {
        (next as Record<string, string | undefined>)[key] = value
      }
    }
    set({ terminology: next })
    await ipc.patchState({ terminology: next } as Partial<StateJson>)
  },

  resetTerminology: async () => {
    set({ terminology: {} })
    await ipc.patchState({ terminology: {} } as Partial<StateJson>)
  },

  addPendingArchive: (pending) => set(s => ({
    pendingArchives: [...s.pendingArchives, pending]
  })),

  removePendingArchive: (dirName, sessionNumber) => set(s => ({
    pendingArchives: s.pendingArchives.filter(
      p => !(p.dirName === dirName && p.sessionNumber === sessionNumber)
    )
  })),
}))

// Expose store for E2E automation so tests can deterministically drive internal state.
if (typeof window !== 'undefined') {
  ;(window as any).useStore = useStore
}

function generateGroupColor(): string {
  const darkColors = [
    '#8b5a2b', '#5a4632', '#4a6741', '#4a5568', '#6b4c3b',
    '#4c5c6b', '#6b5b4c', '#5c4b6b', '#4b6b5c', '#6b4b5c'
  ]
  return darkColors[Math.floor(Math.random() * darkColors.length)]
}
