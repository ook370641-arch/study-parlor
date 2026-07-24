// src/store/index.ts
import { create } from 'zustand'
import { editorViewCtx } from '@milkdown/core'
import type { Ctx } from '@milkdown/ctx'
import { normalizeSummaryFontSize } from '@/lib/external-summary-font-size'
import { mergeNewArticles } from '@/lib/anthropic-articles'
import { nextThinkingEffort } from '@/lib/assistant-settings'
import { resetAssistantStreamBuffers } from '@/lib/assistant-stream-buffers'
import type {
  Difficulty, Message, NewTopic, Profile, StateJson, Mode,
  TopicMeta, UnsavedSession, ArchiveResult, Group, GroupMapping,
  TopicContinueCache, BriefingResult, SearchResult, SearchSource, SearchErrorCode,
  Terminology, BriefingTheme, BriefingStage, BriefingFontSize, AnthropicBlogCache,
  ArticleAnnotation, ArticleAssistantGuide, ArticleAssistantMessage, ArticleAssistantErrorCode,
  AnthropicArticleMeta, AnthropicError, AssistantThinkingEffort,
  JobBriefingResult, JobBriefingConfig, JobCompany, JobErrorCode, JobProfile,
  WritingTreeNode, WritingTone, WritingAssistantMessage, WritingToolEvent,
} from '@shared/index'
import { ipc } from '@/lib/ipc'
import { manifest, pickRandom, preloadPaintings } from '@/lib/paintings'
import { DEFAULT_JOB_BRIEFING_CONFIG, DEFAULT_JOB_PROFILE } from '@/lib/job-briefing-defaults'
import type { Painting } from '@shared/index'

export type AssistantSession = {
  contextId: string
  contextType: 'briefing' | 'anthropic-article'
  articleTitle?: string
  articleContent: string
  guide: ArticleAssistantGuide | null
  guideLoading: boolean
  guideError: ArticleAssistantErrorCode | null
  messages: ArticleAssistantMessage[]
  streaming: boolean
  abortId: string
  searchLoading: boolean
  searchError: 'NO_RESULTS' | 'SEARCH_ERROR' | null
  chatError: ArticleAssistantErrorCode | null
  retryContext: { text: string; useSearch: boolean } | null
  pendingSelection?: string
  isOpen: boolean
  activeChunkIndex: number | null
}

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
  briefingTheme: BriefingTheme
  briefingFontSize: BriefingFontSize
  externalSummaryFontSize: BriefingFontSize
  briefingStage: BriefingStage | null
  briefingStageDetail: string | null
  jobBriefingStage: BriefingStage | null
  jobBriefingStageDetail: string | null
  setBriefingStage: (stage: BriefingStage | null) => void
  // Anthropic 博客
  briefingSource: 'digest' | 'anthropic' | 'job-briefing' | 'writing'
  anthropicBlogCache: AnthropicBlogCache
  anthropicReaderFilePath: string | null
  anthropicReaderBody: string | null
  anthropicReaderTitle: string | null
  anthropicBlogLastSeenAt: string | null
  setBriefingSource: (source: 'digest' | 'anthropic' | 'job-briefing' | 'writing') => Promise<void>
  discoverAnthropicArticles: (
    opts?: { commit?: boolean }
  ) => Promise<
    | { ok: true; lastFetchedAt: string; articles: AnthropicArticleMeta[] }
    | { ok: false; error: AnthropicError }
  >
  mergeAnthropicArticles: (
    newArticles: AnthropicArticleMeta[],
    lastFetchedAt: string
  ) => void
  importAnthropicArticle: (url: string) => Promise<void>
  cancelAnthropicImport: () => Promise<void>
  openAnthropicReader: (filePath: string) => Promise<void>
  closeAnthropicReader: () => void
  setAnthropicReaderContent: (content: { body: string | null; title: string | null }) => void
  deleteAnthropicArticle: (filePath: string) => Promise<void>
  generateBriefing: (date: string, opts?: { force?: boolean }) => Promise<void>
  loadBriefingHistory: () => Promise<void>
  deleteBriefings: (filePaths: string[]) => Promise<void>
  cancelBriefing: () => void
  setBriefingTheme: (theme: BriefingTheme) => Promise<void>
  increaseBriefingFontSize: () => Promise<void>
  decreaseBriefingFontSize: () => Promise<void>
  increaseExternalSummaryFontSize: () => Promise<void>
  decreaseExternalSummaryFontSize: () => Promise<void>

  // 求职简报
  jobBriefing: {
    result: JobBriefingResult | null
    loading: boolean
    error: JobErrorCode | string | null
  }
  jobBriefingHistory: {
    list: { date: string; filePath: string }[]
    loading: boolean
    error: string | null
  }
  jobBriefingConfig: JobBriefingConfig
  jobProfile: JobProfile
  updateJobProfile: (profile: JobProfile) => Promise<void>
  generateJobBriefing: (date: string, opts?: { force?: boolean }) => Promise<void>
  loadJobBriefingHistory: () => Promise<void>
  deleteJobBriefings: (filePaths: string[]) => Promise<void>
  cancelJobBriefing: () => void
  transferArticleToWriting: (args: {
    name: string
    content: string
    sourceType: 'digest' | 'anthropic'
    sourcePath: string
  }) => Promise<void>
  setJobBriefingConfig: (config: JobBriefingConfig) => Promise<void>
  discoverJobBriefingPages: () => Promise<{ ok: true; companies: JobCompany[] } | { ok: false; error: JobErrorCode | string; message: string }>

  // 画作背景
  currentPaintings: {
    cover: Painting | null
    home: Painting | null
    study: Painting | null
    briefing: Painting | null
  }

  // 外部资料摘要面板
  isExternalSummaryOpen: boolean

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
  settingsReturnTo: Page | null
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

  // 外部资料摘要面板操作
  openExternalSummary: () => void
  closeExternalSummary: () => void
  toggleExternalSummary: () => void

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

  // 文章旁注助手
  assistantSession: AssistantSession | null
  assistantSearchEnabled: boolean
  assistantSocraticMode: boolean
  assistantThinkingEffort: AssistantThinkingEffort
  toggleAssistantSocratic: () => void
  cycleAssistantThinkingEffort: () => void
  openAssistantSession: (args: { contextId: string; contextType: 'briefing' | 'anthropic-article'; articleTitle?: string; articleContent: string; autoGenerateGuide?: boolean }) => void
  closeAssistantSession: () => void
  toggleAssistantOpen: () => void
  toggleAssistantSearch: () => void
  setAssistantSelection: (text: string) => void
  loadAssistantGuide: () => Promise<void>
  loadAssistantSession: () => Promise<void>
  saveAssistantSession: () => Promise<void>
  sendAssistantMessage: (text: string) => Promise<void>
  retryAssistantMessage: () => Promise<void>
  runAssistantStream: (history: ArticleAssistantMessage[], useSearch: boolean, selection?: string) => Promise<void>
  applyAssistantSearchResult: (sessionId: string, payload: { searchSources?: { title: string; url: string; snippet: string }[]; searchError?: 'NO_RESULTS' | 'SEARCH_ERROR' }) => void
  appendAssistantChunk: (text: string) => void
  appendAssistantReasoning: (text: string) => void
  finishAssistantStreaming: () => void
  abortAssistantStream: () => void
  articleAssistantGuideWidth: number
  articleAssistantGuideCollapsed: boolean
  setArticleAssistantGuideWidth: (width: number) => void
  setArticleAssistantGuideCollapsed: (collapsed: boolean) => void
  setAssistantActiveChunk: (index: number | null) => void
  persistAssistantState: () => Promise<void>
  generateAssistantGuide: () => Promise<void>

  // 写作板
  writingTree: { writing: WritingTreeNode[]; repository: WritingTreeNode[] } | null
  writingFile: { path: string; body: string; dirty: boolean; saving: 'idle' | 'saving' | 'saved' | 'error' } | null
  writingError: string | null
  writingFontSize: BriefingFontSize
  writingTone: WritingTone
  writingListTab: 'articles' | 'repository'
  writingAssistantWidth: number
  writingAssistantOpen: boolean
  writingEditorAction: ((fn: (ctx: any) => void) => void) | null
  lastWritingFile: string | null
  writingOrder: Record<string, string[]>

  // 写作助手
  writingAssistant: {
    sessionId: string
    articlePath: string | null
    messages: WritingAssistantMessage[]
    streaming: boolean
    error: ArticleAssistantErrorCode | null
  } | null
  sendWritingAssistantMessage: (text: string) => Promise<void>
  appendWritingAssistantChunk: (text: string) => void
  appendWritingAssistantReasoning: (text: string) => void
  applyWritingAssistantToolEvent: (e: WritingToolEvent) => void
  finishWritingAssistantStreaming: () => void
  abortWritingAssistant: () => void
  retryWritingAssistantMessage: () => Promise<void>
  saveWritingAssistantSession: () => Promise<void>
  loadWritingAssistantSession: (articlePath: string) => Promise<void>

  loadWritingTree: () => Promise<void>
  selectWritingFile: (filePath: string | null) => Promise<void>
  updateWritingBody: (body: string) => void
  saveWritingFile: () => Promise<void>
  setWritingFontSize: (size: BriefingFontSize) => void
  setWritingTone: (tone: WritingTone) => void
  setWritingListTab: (tab: 'articles' | 'repository') => void
  setWritingAssistantWidth: (width: number) => void
  setWritingAssistantOpen: (open: boolean) => void
  setWritingEditorAction: (action: ((fn: (ctx: any) => void) => void) | null) => void
  insertTextIntoWritingEditor: (text: string) => void
  setLastWritingFile: (file: string | null) => void
  setAssistantSearchEnabled: (enabled: boolean) => void
  setAssistantThinkingEffort: (effort: 'off' | 'high' | 'max') => void
  reorderWritingSibling: (args: { dir: string; src: string; target: string; position: 'before' | 'after'; siblings: string[] }) => void
}

let wildcardRequestId = 0

// selectWritingFile 的单调序号：并发/交错的文件选中后写先赢时，丢弃过期的
// writingRead 结果（rules general §7）。
let writingSelectSeq = 0

/** Ensures sendAssistantMessage waits for history to load before sending, preventing
 *  the race where a user message lands before loadAssistantSession completes and the
 *  cur.messages.length === 0 guard discards the loaded history. */
let historyLoadPromise: Promise<void> | null = null

let guideWidthSaveTimer: ReturnType<typeof setTimeout> | null = null
function debounceSaveGuideWidth(patch: Partial<StateJson>) {
  if (guideWidthSaveTimer) clearTimeout(guideWidthSaveTimer)
  guideWidthSaveTimer = setTimeout(() => {
    ipc.patchState(patch)
  }, 300)
}

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
  settingsReturnTo: null,
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
  isExternalSummaryOpen: false,
  modal: null,
  preStudyArgs: null,
  toast: null,
  currentPaintings: { cover: null, home: null, study: null, briefing: null },
  briefing: { result: null, loading: false, error: null },
  briefingHistory: { list: [], loading: false, error: null },
  briefingTheme: 'academic',
  briefingFontSize: 'base',
  externalSummaryFontSize: 'base',
  briefingStage: null,
  briefingStageDetail: null,
  jobBriefingStage: null,
  jobBriefingStageDetail: null,
  briefingSource: 'digest',
  anthropicBlogCache: { lastFetchedAt: null, articles: [], loading: false, error: null },
  anthropicReaderFilePath: null,
  anthropicReaderBody: null,
  anthropicReaderTitle: null,
  anthropicBlogLastSeenAt: null,
  jobBriefing: { result: null, loading: false, error: null },
  jobBriefingHistory: { list: [], loading: false, error: null },
  jobBriefingConfig: DEFAULT_JOB_BRIEFING_CONFIG,
  jobProfile: DEFAULT_JOB_PROFILE,
  assistantSession: null,
  assistantSearchEnabled: false,
  assistantSocraticMode: true,
  assistantThinkingEffort: 'off',
  articleAssistantGuideWidth: 320,
  articleAssistantGuideCollapsed: false,
  writingTree: null,
  writingFile: null,
  writingError: null,
  writingFontSize: 'base',
  writingTone: 'parchment',
  writingListTab: 'articles',
  writingAssistantWidth: 320,
  writingAssistantOpen: false,
  writingEditorAction: null,
  lastWritingFile: null,
  writingOrder: {},
  writingAssistant: null,

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
      briefingTheme: state.briefingTheme ?? 'academic',
      briefingFontSize: state.briefingFontSize ?? 'base',
      externalSummaryFontSize: normalizeSummaryFontSize(state.externalSummaryFontSize),
      briefingSource: state.briefingSource === 'anthropic' || state.briefingSource === 'job-briefing' || state.briefingSource === 'writing' ? state.briefingSource : 'digest',
      anthropicBlogCache: state.anthropicBlogCache
        ? { ...state.anthropicBlogCache, loading: false, error: null }
        : { lastFetchedAt: null, articles: [], loading: false, error: null },
      anthropicBlogLastSeenAt: state.anthropicBlogLastSeenAt ?? null,
      jobBriefingConfig: state.jobBriefingConfig ?? DEFAULT_JOB_BRIEFING_CONFIG,
      jobProfile: state.jobProfile ?? DEFAULT_JOB_PROFILE,
      articleAssistantGuideWidth: state.articleAssistantGuideWidth ?? 320,
      articleAssistantGuideCollapsed: state.articleAssistantGuideCollapsed ?? false,
      assistantSearchEnabled: state.assistantSearchEnabled ?? false,
      assistantSocraticMode: state.assistantSocraticMode ?? true,
      assistantThinkingEffort: state.assistantThinkingEffort ?? 'off',
      writingFontSize: state.writingFontSize ?? 'base',
      writingTone: state.writingTone ?? 'parchment',
      writingListTab: state.writingListTab ?? 'articles',
      writingAssistantWidth: state.writingAssistantWidth ?? 320,
      writingAssistantOpen: state.writingAssistantOpen ?? false,
      lastWritingFile: state.lastWritingFile ?? null,
      writingOrder: state.writingOrder ?? {},
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
    const next = {
      cover: pickRandom(manifest, null),
      home: pickRandom(manifest, null),
      study: pickRandom(manifest, null),
      briefing: pickRandom(manifest, null),
    }
    set({ currentPaintings: next })
    // Decode all chosen paintings up front so navigating into a surface shows
    // its background instantly instead of flashing the dark base color.
    preloadPaintings([next.cover, next.home, next.study, next.briefing])
  },

  swapPainting: (surface) => {
    const current = get().currentPaintings[surface]
    const next = pickRandom(manifest, current?.id ?? null)
    if (!next) return
    set(state => ({
      currentPaintings: { ...state.currentPaintings, [surface]: next }
    }))
  },

  // 进入 settings 时记录来源页，Settings 返回按钮优先回来源页（缺省 home）。
  goto: (p) => set((s) => ({
    currentPage: p,
    settingsReturnTo: p === 'settings' ? s.currentPage : s.settingsReturnTo,
  })),
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

  generateBriefing: async (date: string, opts?: { force?: boolean }) => {
    const s = get()
    if (s.briefing.loading) return
    set({
      briefing: { result: null, loading: true, error: null },
      briefingStage: 'fetching',
    })

    const unsubscribe = ipc.onBriefingProgress((stage, detail) => {
      set({ briefingStage: stage, briefingStageDetail: detail ?? null })
    })

    try {
      const result = await ipc.briefingGenerate({ date, profile: s.profile, force: opts?.force })
      set({
        briefing: { result, loading: false, error: null },
        briefingStage: null,
        briefingStageDetail: null,
      })
    } catch (err: any) {
      const raw = err.message || String(err)
      if (raw.includes('BRIEFING_ABORTED')) return
      const error = raw.includes('FEED_EMPTY')
        ? 'FEED_EMPTY'
        : raw.includes('NETWORK_ERROR')
          ? 'NETWORK_ERROR'
          : raw.includes('LLM_ERROR')
            ? 'LLM_ERROR'
            : raw.includes('ASSEMBLY_ERROR')
              ? 'ASSEMBLY_ERROR'
              : raw
      set({
        briefing: { result: null, loading: false, error },
        briefingStage: null,
        briefingStageDetail: null,
      })
    } finally {
      unsubscribe()
    }
  },

  loadBriefingHistory: async () => {
    set({ briefingHistory: { ...get().briefingHistory, loading: true, error: null } })
    try {
      const list = await ipc.briefingList()
      set({ briefingHistory: { list: Array.isArray(list) ? list : [], loading: false, error: null } })
    } catch (err: any) {
      set({ briefingHistory: { ...get().briefingHistory, loading: false, error: err.message || String(err) } })
    }
  },

  deleteBriefings: async (filePaths: string[]) => {
    const current = get().briefing.result?.filePath
    for (const p of filePaths) {
      await ipc.briefingDelete({ filePath: p })
    }
    if (current && filePaths.includes(current)) {
      set({ briefing: { result: null, loading: false, error: null } })
    }
    await get().loadBriefingHistory()
  },

  cancelBriefing: () => {
    if (!get().briefing.loading) return
    ipc.briefingAbort()
    set({ briefing: { result: null, loading: false, error: null }, briefingStage: null })
  },

  generateJobBriefing: async (date, opts) => {
    const s = get()
    if (s.jobBriefing.loading) return
    set({ jobBriefing: { result: null, loading: true, error: null }, jobBriefingStage: 'scanning-events' })
    const unsubscribe = ipc.onBriefingProgress((stage, detail) => set({ jobBriefingStage: stage, jobBriefingStageDetail: detail ?? null }))
    try {
      const result = await ipc.jobBriefingGenerate({ date, force: opts?.force })
      set({ jobBriefing: { result, loading: false, error: null }, jobBriefingStage: null, jobBriefingStageDetail: null })
    } catch (err: any) {
      const raw = err.message || String(err)
      if (raw.includes('JOB_ABORTED')) return
      // job-briefing IPC throws JOB_${code}; preserve the JOB_ prefix so
      // BriefingError.MESSAGES picks up the correct job-specific text.
      const error = raw.includes('JOB_MISSING_SEARCH_KEY') ? 'JOB_MISSING_SEARCH_KEY'
        : raw.includes('JOB_NETWORK_ERROR') ? 'JOB_NETWORK_ERROR'
        : raw.includes('JOB_OFFICIAL_PAGE_FAILED') ? 'JOB_OFFICIAL_PAGE_FAILED'
        : raw.includes('JOB_EXTRACTION_ERROR') ? 'JOB_EXTRACTION_ERROR'
        : raw.includes('JOB_EMPTY_RESULTS') ? 'JOB_EMPTY_RESULTS'
        : raw.includes('JOB_CACHE_WRITE_FAILED') ? 'JOB_CACHE_WRITE_FAILED'
        : raw.includes('JOB_TIMEOUT') ? 'JOB_TIMEOUT'
        : raw
      set({ jobBriefing: { result: null, loading: false, error }, jobBriefingStage: null, jobBriefingStageDetail: null })
    } finally {
      unsubscribe()
    }
  },

  loadJobBriefingHistory: async () => {
    set({ jobBriefingHistory: { ...get().jobBriefingHistory, loading: true, error: null } })
    try {
      const list = await ipc.jobBriefingList()
      set({ jobBriefingHistory: { list: Array.isArray(list) ? list : [], loading: false, error: null } })
    } catch (err: any) {
      set({ jobBriefingHistory: { ...get().jobBriefingHistory, loading: false, error: err.message || String(err) } })
    }
  },

  deleteJobBriefings: async (filePaths: string[]) => {
    const current = get().jobBriefing.result?.filePath
    for (const p of filePaths) {
      await ipc.jobBriefingDelete({ filePath: p })
    }
    if (current && filePaths.includes(current)) {
      set({ jobBriefing: { result: null, loading: false, error: null } })
    }
    await get().loadJobBriefingHistory()
  },

  cancelJobBriefing: () => {
    if (!get().jobBriefing.loading) return
    ipc.jobBriefingAbort()
    set({ jobBriefing: { result: null, loading: false, error: null }, jobBriefingStage: null })
  },

  transferArticleToWriting: async (args) => {
    const sanitize = (n: string) =>
      n.replace(/[\\/:*?"<>|]/g, '-').replace(/\s+/g, ' ').trim() || '未命名'
    const base = sanitize(args.name)

    const parentType = args.sourceType === 'digest' ? 'briefing' as const : 'anthropic-article' as const
    const annotations = await ipc.annotationsRead(args.sourcePath).catch(() => [] as ArticleAnnotation[])
    const session = await ipc.articleAssistantReadSession({ parentPath: args.sourcePath, parentType }).catch(() => null)

    const annoSection = annotations.length === 0
      ? '（无）'
      : annotations
          .map((a) => `> 「${a.selectedText}」（§${a.paragraphIndex}）\n>\n> 批注：${a.note?.trim() ? a.note.trim() : '（无批注）'}`)
          .join('\n\n')
    const chatSection = !session || session.messages.length === 0
      ? '（无）'
      : session.messages
          .map((m) => `**${m.role === 'user' ? '用户' : '助手'}**：${m.content}`)
          .join('\n\n')

    const fm = `---\ntitle: ${base}\nsource_type: ${args.sourceType}\nsource_path: ${args.sourcePath}\n---\n\n`
    const body = `${fm}## 标注摘录\n\n${annoSection}\n\n## 旁注对话\n\n${chatSection}\n`

    const tryCreate = async (name: string): Promise<string | null> => {
      const r = await ipc.writingCreateFile({ root: 'writing', dir: '', name })
      if (r.ok) return r.value.path
      if (r.code === 'WRITING_NAME_CONFLICT') return null
      throw new Error(r.message)
    }

    try {
      let filePath = await tryCreate(base)
      if (!filePath) {
        const now = new Date()
        const suffix = `${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}`
        filePath = await tryCreate(`${base}-${suffix}`)
      }
      if (!filePath) { get().showToast('转入写作失败：文件名冲突'); return }
      const w = await ipc.writingWrite({ path: filePath, body })
      if (!w.ok) { get().showToast('转入写作失败'); return }
      get().showToast('已转入写作')
    } catch { get().showToast('转入写作失败') }
  },

  setJobBriefingConfig: async (config) => {
    set({ jobBriefingConfig: config })
    await ipc.patchState({ jobBriefingConfig: config } as Partial<StateJson>)
  },

  updateJobProfile: async (profile) => {
    const stamped = { ...profile, updatedAt: new Date().toISOString() }
    set({ jobProfile: stamped })
    await ipc.patchState({ jobProfile: stamped } as Partial<StateJson>)
  },

  discoverJobBriefingPages: async () => {
    try {
      const result = await ipc.jobBriefingDiscoverPages()
      if (result.ok) {
        const next = { ...get().jobBriefingConfig, companies: result.companies }
        await get().setJobBriefingConfig(next)
      }
      return result.ok ? { ok: true, companies: result.companies } : { ok: false, error: result.code, message: result.message }
    } catch (err: any) {
      return { ok: false, error: 'NETWORK_ERROR', message: err.message || String(err) }
    }
  },

  setBriefingTheme: async (theme: BriefingTheme) => {
    set({ briefingTheme: theme })
    await ipc.patchState({ briefingTheme: theme } as Partial<StateJson>)
  },

  increaseBriefingFontSize: async () => {
    const { BRIEFING_FONT_SIZES } = await import('@/lib/briefing-font-size')
    const current = get().briefingFontSize
    const idx = BRIEFING_FONT_SIZES.indexOf(current)
    const next = BRIEFING_FONT_SIZES[Math.min(idx + 1, BRIEFING_FONT_SIZES.length - 1)]
    if (next === current) return
    set({ briefingFontSize: next })
    await ipc.patchState({ briefingFontSize: next } as Partial<StateJson>)
  },

  decreaseBriefingFontSize: async () => {
    const { BRIEFING_FONT_SIZES } = await import('@/lib/briefing-font-size')
    const current = get().briefingFontSize
    const idx = BRIEFING_FONT_SIZES.indexOf(current)
    const prev = BRIEFING_FONT_SIZES[Math.max(idx - 1, 0)]
    if (prev === current) return
    set({ briefingFontSize: prev })
    await ipc.patchState({ briefingFontSize: prev } as Partial<StateJson>)
  },

  increaseExternalSummaryFontSize: async () => {
    const { nextSummaryFontSize } = await import('@/lib/external-summary-font-size')
    const current = normalizeSummaryFontSize(get().externalSummaryFontSize)
    const next = nextSummaryFontSize(current)
    if (next === current) return
    set({ externalSummaryFontSize: next })
    await ipc.patchState({ externalSummaryFontSize: next } as Partial<StateJson>)
  },

  decreaseExternalSummaryFontSize: async () => {
    const { prevSummaryFontSize } = await import('@/lib/external-summary-font-size')
    const current = normalizeSummaryFontSize(get().externalSummaryFontSize)
    const prev = prevSummaryFontSize(current)
    if (prev === current) return
    set({ externalSummaryFontSize: prev })
    await ipc.patchState({ externalSummaryFontSize: prev } as Partial<StateJson>)
  },

  setBriefingStage: (stage) => set({ briefingStage: stage }),

  setBriefingSource: async (source) => {
    set({ briefingSource: source })
    await ipc.patchState({ briefingSource: source } as Partial<StateJson>)
  },

  discoverAnthropicArticles: async (opts) => {
    const commit = opts?.commit !== false
    if (commit) {
      set((s) => ({
        anthropicBlogCache: { ...s.anthropicBlogCache, loading: true, error: null },
      }))
    }
    try {
      const result = await ipc.anthropicDiscover()
      if (result.ok) {
        const next: AnthropicBlogCache = {
          lastFetchedAt: result.lastFetchedAt,
          articles: result.articles,
          loading: false,
          error: null,
        }
        if (commit) {
          set({ anthropicBlogCache: next })
        }
        return { ok: true as const, lastFetchedAt: result.lastFetchedAt, articles: result.articles }
      }
      const error: AnthropicError = { code: result.code, message: result.message }
      if (commit) {
        set((s) => ({
          anthropicBlogCache: { ...s.anthropicBlogCache, loading: false, error },
        }))
      }
      return { ok: false as const, error }
    } catch (err: any) {
      const error: AnthropicError = { code: 'unknown', message: err.message || String(err) }
      if (commit) {
        set((s) => ({
          anthropicBlogCache: { ...s.anthropicBlogCache, loading: false, error },
        }))
      }
      return { ok: false as const, error }
    }
  },

  mergeAnthropicArticles: (newArticles, lastFetchedAt) => {
    set((s) => ({
      anthropicBlogCache: {
        ...s.anthropicBlogCache,
        lastFetchedAt,
        articles: mergeNewArticles(s.anthropicBlogCache.articles, newArticles),
      },
    }))
  },

  importAnthropicArticle: async (url) => {
    try {
      const result = await ipc.anthropicImportArticle(url)
      if (result.ok) {
        set(s => ({
          anthropicBlogCache: {
            ...s.anthropicBlogCache,
            articles: s.anthropicBlogCache.articles.map((a) =>
              a.url === url ? { ...a, isSaved: true, filePath: result.filePath } : a
            ),
          },
          anthropicReaderFilePath: result.filePath,
        }))
        get().showToast(result.wasAlreadySaved ? '文章已保存' : '导入成功')
      } else {
        get().showToast(result.message || '导入失败')
      }
    } catch (err: any) {
      get().showToast(err.message || '导入失败')
    }
  },

  cancelAnthropicImport: async () => {
    await ipc.anthropicCancelImport()
    set(s => ({ anthropicBlogCache: { ...s.anthropicBlogCache, loading: false } }))
  },

  openAnthropicReader: async (filePath) => {
    const now = new Date().toISOString()
    set({ anthropicReaderFilePath: filePath, anthropicBlogLastSeenAt: now })
    await ipc.patchState({ anthropicBlogLastSeenAt: now } as Partial<StateJson>)
  },
  closeAnthropicReader: () => set({ anthropicReaderFilePath: null, anthropicReaderBody: null, anthropicReaderTitle: null }),
  setAnthropicReaderContent: ({ body, title }) =>
    set({ anthropicReaderBody: body, anthropicReaderTitle: title }),

  deleteAnthropicArticle: async (filePath) => {
    const r = await ipc.anthropicDeleteArticle({ filePath })
    if (!r.ok) {
      get().showToast('删除失败：' + r.message)
      return
    }
    const cache = get().anthropicBlogCache
    set({
      anthropicBlogCache: {
        ...cache,
        articles: cache.articles.map((a) =>
          a.filePath === filePath ? { ...a, isSaved: false, filePath: undefined } : a
        ),
      },
    })
    if (get().anthropicReaderFilePath === filePath) {
      get().closeAnthropicReader()
    }
  },

  resetSession: () => set({ session: null, currentPage: 'home', externalMaterials: null, isExternalSummaryOpen: false }),
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

  openExternalSummary: () => set({ isExternalSummaryOpen: true }),
  closeExternalSummary: () => set({ isExternalSummaryOpen: false }),
  toggleExternalSummary: () => set(s => ({ isExternalSummaryOpen: !s.isExternalSummaryOpen })),

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

  // --- 文章旁注助手 ---
  openAssistantSession: (args) => {
    const prev = get().assistantSession
    if (prev && prev.contextId === args.contextId) return
    set({
      assistantSession: {
        contextId: args.contextId,
        contextType: args.contextType,
        articleTitle: args.articleTitle,
        articleContent: args.articleContent,
        guide: null, guideLoading: false, guideError: null,
        messages: [], streaming: false, abortId: '',
        searchLoading: false, searchError: null, chatError: null,
        retryContext: null, pendingSelection: undefined, isOpen: false,
        activeChunkIndex: null,
      },
    })
    get().loadAssistantGuide().then(() => {
      if (args.autoGenerateGuide) {
        const cur = get().assistantSession
        if (cur && cur.contextId === args.contextId && !cur.guide && !cur.guideLoading) {
          get().generateAssistantGuide()
        }
      }
    })
    historyLoadPromise = get().loadAssistantSession()
  },

  closeAssistantSession: () => {
    const s = get().assistantSession
    if (!s) return
    if (s.streaming) ipc.articleAssistantAbort({ sessionId: s.abortId })
    get().persistAssistantState()
    set({ assistantSession: null })
  },

  toggleAssistantOpen: () => {
    const s = get().assistantSession
    if (!s) return
    set({ assistantSession: { ...s, isOpen: !s.isOpen } })
  },

  toggleAssistantSearch: () => {
    const next = !get().assistantSearchEnabled
    set({ assistantSearchEnabled: next })
    ipc.patchState({ assistantSearchEnabled: next })
  },

  toggleAssistantSocratic: () => {
    const next = !get().assistantSocraticMode
    set({ assistantSocraticMode: next })
    ipc.patchState({ assistantSocraticMode: next })
  },

  cycleAssistantThinkingEffort: () => {
    const next = nextThinkingEffort(get().assistantThinkingEffort)
    set({ assistantThinkingEffort: next })
    ipc.patchState({ assistantThinkingEffort: next })
  },

  setAssistantSelection: (text) => {
    const s = get().assistantSession
    if (!s) return
    const trimmed = text.trim()
    set({ assistantSession: { ...s, pendingSelection: trimmed || undefined } })
  },

  loadAssistantGuide: async () => {
    const s = get().assistantSession
    if (!s) return
    set({ assistantSession: { ...s, guideLoading: true, guideError: null } })
    try {
      const file = await ipc.articleAssistantReadGuide({ parentPath: s.contextId, parentType: s.contextType })
      const cur = get().assistantSession
      if (!cur || cur.contextId !== s.contextId) return
      if (file?.guide) set({ assistantSession: { ...cur, guide: file.guide, guideLoading: false } })
      else set({ assistantSession: { ...cur, guideLoading: false } })
    } catch {
      const cur = get().assistantSession
      if (!cur || cur.contextId !== s.contextId) return
      set({ assistantSession: { ...cur, guideLoading: false } })
    }
  },

  loadAssistantSession: async () => {
    const s = get().assistantSession
    if (!s) return
    const file = await ipc.articleAssistantReadSession({ parentPath: s.contextId, parentType: s.contextType })
    const cur = get().assistantSession
    if (!cur || cur.contextId !== s.contextId) return
    if (file?.messages.length && cur.messages.length === 0) {
      set({ assistantSession: { ...cur, messages: file.messages } })
    }
  },

  saveAssistantSession: async () => {
    const s = get().assistantSession
    if (!s) return
    const persistable = s.messages.filter(
      (m) => m.content.trim().length > 0 || (m.role === 'user' && !!m.selection)
    )
    if (persistable.length === 0) return
    try {
      await ipc.articleAssistantWriteSession({ parentPath: s.contextId, parentType: s.contextType, messages: persistable })
    } catch (_err) {
      get().showToast('旁注记录已暂存到恢复目录')
    }
  },

  sendAssistantMessage: async (text) => {
    // Wait for any in-flight history load to settle so we don't discard loaded
    // messages (the loadAssistantSession guard requires messages.length === 0).
    if (historyLoadPromise) {
      await historyLoadPromise
      historyLoadPromise = null
    }
    const s = get().assistantSession
    if (!s || s.streaming || s.searchLoading) return
    const content = text.trim()
    if (!content && !s.pendingSelection) return
    const useSearch = get().assistantSearchEnabled
    // 发送即消费选段：chip 随之清除，下一条消息不再重复注入同一选段。
    // 选段值必须显式传给 runAssistantStream——它会重新 get()，读不到快照里的值。
    const selection = s.pendingSelection
    const userMessage: ArticleAssistantMessage = { role: 'user', content, selection }
    const history = [...s.messages, userMessage]
    set({ assistantSession: { ...s, messages: history, retryContext: { text, useSearch }, pendingSelection: undefined } })
    await get().runAssistantStream(history, useSearch, selection)
  },

  retryAssistantMessage: async () => {
    const s = get().assistantSession
    if (!s || s.streaming || !s.retryContext) return
    let msgs = s.messages
    const last = msgs.at(-1)
    if (last && last.role === 'assistant' && last.content.trim() === '') msgs = msgs.slice(0, -1)
    const lastUser = [...msgs].reverse().find((m) => m.role === 'user')
    set({ assistantSession: { ...s, messages: msgs, chatError: null } })
    await get().runAssistantStream(msgs, s.retryContext.useSearch, lastUser?.selection)
  },

  runAssistantStream: async (history, useSearch, selection) => {
    const s = get().assistantSession
    if (!s) return
    resetAssistantStreamBuffers()
    const abortId = `article-assistant-${Date.now()}`
    const placeholder: ArticleAssistantMessage = { role: 'assistant', content: '' }
    set({
      assistantSession: {
        ...s,
        messages: [...history, placeholder],
        streaming: true,
        searchLoading: useSearch,
        searchError: null,
        chatError: null,
        abortId,
        isOpen: true,
      },
    })
    try {
      // Read annotations for context injection
      let annotations: ArticleAnnotation[] | undefined
      try {
        const annoList = await ipc.annotationsRead(s.contextId)
        if (annoList.length > 0) annotations = annoList
      } catch { /* annotationsRead returns [] for missing file */ }

      await ipc.articleAssistantSendMessage({
        sessionId: abortId,
        articleContent: s.articleContent,
        articleType: s.contextType,
        messages: history,
        annotations,
        selection,
        useSearch,
        guide: s.guide,
        socraticMode: get().assistantSocraticMode,
        thinkingEffort: get().assistantThinkingEffort,
      })
    } catch (err) {
      const code: ArticleAssistantErrorCode = (err as Error & { code?: string })?.code === 'CHAT_NETWORK_ERROR' ? 'CHAT_NETWORK_ERROR'
        : (err as Error & { code?: string })?.code === 'CHAT_TIMEOUT' ? 'CHAT_TIMEOUT'
        : 'CHAT_LLM_ERROR'
      const cur = get().assistantSession
      if (!cur || cur.abortId !== abortId) return
      const trimmed = cur.messages.at(-1)?.content.trim() === '' ? cur.messages.slice(0, -1) : cur.messages
      set({ assistantSession: { ...cur, messages: trimmed, streaming: false, searchLoading: false, chatError: code } })
    }
  },

  applyAssistantSearchResult: (sessionId, payload) => {
    const s = get().assistantSession
    if (!s || s.abortId !== sessionId) return
    const msgs = s.messages.slice()
    const lastIdx = msgs.length - 1
    if (lastIdx >= 0 && msgs[lastIdx].role === 'assistant' && payload.searchSources) {
      msgs[lastIdx] = { ...msgs[lastIdx], searchSources: payload.searchSources }
    }
    set({ assistantSession: { ...s, messages: msgs, searchLoading: false, searchError: payload.searchError ?? null } })
  },

  appendAssistantChunk: (text) => {
    const s = get().assistantSession
    if (!s || !s.streaming) return
    const last = s.messages.at(-1)
    if (!last || last.role !== 'assistant') return
    const updated = s.messages.slice(0, -1)
    updated.push({ ...last, content: last.content + text })
    set({ assistantSession: { ...s, messages: updated } })
  },

  appendAssistantReasoning: (text) => {
    const s = get().assistantSession
    if (!s || !s.streaming) return
    const last = s.messages.at(-1)
    if (!last || last.role !== 'assistant') return
    const updated = s.messages.slice(0, -1)
    updated.push({ ...last, reasoning: (last.reasoning ?? '') + text })
    set({ assistantSession: { ...s, messages: updated } })
  },

  finishAssistantStreaming: () => {
    const s = get().assistantSession
    if (!s) return
    set({ assistantSession: { ...s, streaming: false, searchLoading: false } })
    get().saveAssistantSession()
  },

  abortAssistantStream: () => {
    const s = get().assistantSession
    if (!s || !s.streaming) return
    resetAssistantStreamBuffers()
    ipc.articleAssistantAbort({ sessionId: s.abortId })
    set({ assistantSession: { ...s, streaming: false, searchLoading: false } })
    get().saveAssistantSession()
  },

  setArticleAssistantGuideWidth: (width) => {
    const clamped = Math.max(200, Math.min(width, 1200))
    set({ articleAssistantGuideWidth: clamped })
    debounceSaveGuideWidth({ articleAssistantGuideWidth: clamped })
  },
  setArticleAssistantGuideCollapsed: (collapsed) => {
    set({ articleAssistantGuideCollapsed: collapsed })
    debounceSaveGuideWidth({ articleAssistantGuideCollapsed: collapsed })
  },
  setAssistantActiveChunk: (index) => {
    const s = get().assistantSession
    if (!s) return
    set({ assistantSession: { ...s, activeChunkIndex: index } })
  },
  persistAssistantState: async () => {
    const s = get().assistantSession
    if (!s) return
    if (s.guide) {
      try {
        await ipc.articleAssistantWriteGuide({ parentPath: s.contextId, parentType: s.contextType, guide: s.guide })
      } catch {
        get().showToast('导读保存失败')
      }
    }
    await get().saveAssistantSession()
  },
  generateAssistantGuide: async () => {
    const s = get().assistantSession
    if (!s || s.guideLoading || s.guide) return
    set({ assistantSession: { ...s, guideLoading: true, guideError: null } })
    try {
      const guide = await ipc.articleAssistantGenerateGuide({
        articleContent: s.articleContent,
        articleType: s.contextType,
        articleTitle: s.articleTitle,
      })
      const cur = get().assistantSession
      if (!cur || cur.contextId !== s.contextId) return
      set({ assistantSession: { ...cur, guide, guideLoading: false } })
      try {
        await ipc.articleAssistantWriteGuide({ parentPath: s.contextId, parentType: s.contextType, guide })
      } catch {
        get().showToast('导读已生成但保存失败')
      }
    } catch (err) {
      const raw = (err as Error & { code?: string })?.code
      const code: ArticleAssistantErrorCode = raw === 'GUIDE_JSON_ERROR' ? 'GUIDE_JSON_ERROR' : raw === 'GUIDE_ABORT' ? 'GUIDE_ABORT' : 'GUIDE_LLM_ERROR'
      const cur = get().assistantSession
      if (!cur || cur.contextId !== s.contextId) return
      set({ assistantSession: { ...cur, guideLoading: false, guideError: code } })
    }
  },

  // 写作板设置持久化
  setWritingFontSize: (size) => {
    set({ writingFontSize: size })
    ipc.patchState({ writingFontSize: size } as Partial<StateJson>)
  },
  setWritingTone: (tone) => {
    set({ writingTone: tone })
    ipc.patchState({ writingTone: tone } as Partial<StateJson>)
  },
  setWritingListTab: (tab) => {
    set({ writingListTab: tab })
    ipc.patchState({ writingListTab: tab } as Partial<StateJson>)
  },
  setWritingAssistantWidth: (width) => {
    set({ writingAssistantWidth: width })
    ipc.patchState({ writingAssistantWidth: width } as Partial<StateJson>)
  },
  setWritingAssistantOpen: (open) => {
    if (!open) {
      const s = get().writingAssistant
      if (s && s.messages.length > 0 && !s.streaming) {
        get().saveWritingAssistantSession()
      }
    }
    set({ writingAssistantOpen: open })
    ipc.patchState({ writingAssistantOpen: open } as Partial<StateJson>)
  },
  setWritingEditorAction: (action) => set({ writingEditorAction: action }),

  insertTextIntoWritingEditor: (text) => {
    const act = get().writingEditorAction
    if (!act) return
    // Use the Milkdown Ctx to get the ProseMirror EditorView and dispatch an
    // insertText transaction.  After Task 9's editor-freeze fix, the editor
    // no longer responds to `initial` prop changes, so insert must go through
    // the ProseMirror view, not through updateWritingBody.
    act((ctx: Ctx) => {
      const view = ctx.get(editorViewCtx)
      view.dispatch(view.state.tr.insertText(text, view.state.doc.content.size))
    })
  },
  setLastWritingFile: (file) => {
    set({ lastWritingFile: file })
    ipc.patchState({ lastWritingFile: file } as Partial<StateJson>)
  },
  setAssistantSearchEnabled: (enabled) => {
    set({ assistantSearchEnabled: enabled })
    ipc.patchState({ assistantSearchEnabled: enabled } as Partial<StateJson>)
  },
  setAssistantThinkingEffort: (effort) => {
    set({ assistantThinkingEffort: effort })
    ipc.patchState({ assistantThinkingEffort: effort } as Partial<StateJson>)
  },

  // --- 写作助手 ---
  sendWritingAssistantMessage: async (text: string) => {
    const f = get().writingFile
    const sessionId = `writing-assistant-${Date.now()}`
    const messages: WritingAssistantMessage[] = [
      ...(get().writingAssistant?.messages ?? []),
      { role: 'user' as const, content: text, snapshot: f?.body?.trim() ? f.body : undefined },
    ]
    set({
      writingAssistant: {
        sessionId,
        articlePath: f?.path ?? null,
        messages,
        streaming: true,
        error: null,
      },
    })
    try {
      await ipc.writingAssistantSendMessage({
        sessionId,
        articlePath: f?.path ?? null,
        articleContent: f?.body ?? '',
        messages,
        useSearch: get().assistantSearchEnabled,
        thinkingEffort: get().assistantThinkingEffort,
      })
    } catch (err) {
      const code: ArticleAssistantErrorCode =
        (err as Error & { code?: string })?.code === 'CHAT_NETWORK_ERROR' ? 'CHAT_NETWORK_ERROR'
        : (err as Error & { code?: string })?.code === 'CHAT_TIMEOUT' ? 'CHAT_TIMEOUT'
        : 'CHAT_LLM_ERROR'
      const cur = get().writingAssistant
      if (!cur || cur.sessionId !== sessionId) return
      set({ writingAssistant: { ...cur, streaming: false, error: code } })
    }
  },

  appendWritingAssistantChunk: (text: string) => {
    const s = get().writingAssistant
    if (!s || !s.streaming) return
    const msgs = s.messages.slice()
    const last = msgs[msgs.length - 1]
    if (last && last.role === 'assistant') {
      msgs[msgs.length - 1] = { ...last, content: last.content + text }
    } else {
      msgs.push({ role: 'assistant', content: text })
    }
    set({ writingAssistant: { ...s, messages: msgs } })
  },

  appendWritingAssistantReasoning: (text: string) => {
    const s = get().writingAssistant
    if (!s || !s.streaming) return
    const msgs = s.messages.slice()
    const last = msgs[msgs.length - 1]
    if (last && last.role === 'assistant') {
      msgs[msgs.length - 1] = { ...last, reasoning: (last.reasoning ?? '') + text }
    } else {
      msgs.push({ role: 'assistant', content: '', reasoning: text })
    }
    set({ writingAssistant: { ...s, messages: msgs } })
  },

  applyWritingAssistantToolEvent: (e: WritingToolEvent) => {
    const s = get().writingAssistant
    if (!s || s.sessionId !== e.sessionId) return
    const msgs = s.messages.slice()
    const last = msgs[msgs.length - 1]
    if (!last || last.role !== 'assistant') return

    if (e.phase === 'start') {
      const label = e.tool === 'read_local' && e.ids
        ? `> 读取：${e.ids.map(id => `\`${id}\``).join('、')}`
        : e.tool === 'web_search' && e.query
        ? `> 搜索：${e.query}`
        : e.tool === 'insert_into_article'
        ? `> 插入到文章`
        : `> ${e.tool}`
      const content = last.content + `\n${label}\n`
      const sources = [...(last.sources ?? [])]
      if (e.ids) {
        for (const id of e.ids) {
          if (!sources.some(src => src.id === id)) {
            const type = id.includes(':') ? id.split(':')[0] as WritingToolEvent['tool'] extends 'read_local' ? string : never : 'repository'
            sources.push({ type: type as any, id, label: id })
          }
        }
      }
      msgs[msgs.length - 1] = { ...last, content, sources }
    } else if (e.phase === 'done') {
      const marker = e.ids && e.ids.length > 0
        ? `\n> 来源：[${e.tool}] ${e.ids.join(', ')}\n`
        : e.tool === 'insert_into_article' && e.markdown
        ? `\n> 已插入：\n> ${e.markdown.split('\n').join('\n> ')}\n`
        : e.tool === 'web_search'
        ? `\n> 搜索完成\n`
        : `\n> ${e.tool} 完成\n`
      msgs[msgs.length - 1] = { ...last, content: last.content + marker }
    } else if (e.phase === 'error') {
      msgs[msgs.length - 1] = { ...last, content: last.content + `\n> ${e.tool} 失败：${e.error ?? '未知错误'}\n` }
    }
    set({ writingAssistant: { ...s, messages: msgs } })
  },

  finishWritingAssistantStreaming: () => {
    const s = get().writingAssistant
    if (!s) return
    set({ writingAssistant: { ...s, streaming: false } })
    get().saveWritingAssistantSession()
  },

  abortWritingAssistant: () => {
    const s = get().writingAssistant
    if (!s || !s.streaming) return
    ipc.writingAssistantAbort({ sessionId: s.sessionId })
    set({ writingAssistant: { ...s, streaming: false } })
    get().saveWritingAssistantSession()
  },

  retryWritingAssistantMessage: async () => {
    const s = get().writingAssistant
    if (!s || s.streaming) return
    const msgs = s.messages.slice()
    // 移除最后一条空的 assistant 消息
    const last = msgs[msgs.length - 1]
    if (last && last.role === 'assistant' && last.content.trim() === '') {
      msgs.pop()
    }
    // 找到最后一条 user 消息
    const lastUser = msgs.filter(m => m.role === 'user').at(-1)
    if (!lastUser) return
    const text = lastUser.content
    // 再移除那条 user 消息（sendWritingAssistantMessage 会重新添加它）
    const userIdx = msgs.lastIndexOf(lastUser)
    if (userIdx !== -1) msgs.splice(userIdx, 1)
    set({ writingAssistant: { ...s, messages: msgs, error: null } })
    // 重新发送
    await get().sendWritingAssistantMessage(text)
  },

  saveWritingAssistantSession: async () => {
    const s = get().writingAssistant
    if (!s || !s.articlePath) return
    const persistable = s.messages.filter(
      (m) => m.content.trim().length > 0
    )
    if (persistable.length === 0) return
    try {
      await ipc.articleAssistantWriteSession({
        parentPath: s.articlePath,
        parentType: 'writing' as const,
        messages: persistable,
      })
    } catch (_err) {
      get().showToast('助手对话暂存失败')
    }
  },

  loadWritingAssistantSession: async (articlePath: string) => {
    const file = await ipc.articleAssistantReadSession({
      parentPath: articlePath,
      parentType: 'writing',
    })
    if (!file?.messages.length) return
    set({
      writingAssistant: {
        sessionId: '',
        articlePath,
        messages: file.messages.map(m => ({
          role: m.role,
          content: m.content,
          sources: m.searchSources?.map(s => ({
            type: 'web' as const,
            id: s.url,
            label: s.title,
          })),
        })),
        streaming: false,
        error: null,
      },
    })
  },

  // --- 写作板：树、当前文件、保存 ---
  reorderWritingSibling: ({ dir, src, target, position, siblings }) => {
    const rest = siblings.filter((p) => p !== src)
    const idx = rest.indexOf(target)
    if (idx === -1 || src === target) return
    const next = [...rest.slice(0, position === 'before' ? idx : idx + 1), src, ...rest.slice(position === 'before' ? idx : idx + 1)]
    const writingOrder = { ...get().writingOrder, [dir]: next }
    set({ writingOrder })
    ipc.patchState({ writingOrder } as Partial<StateJson>)
  },

  loadWritingTree: async () => {
    const r = await ipc.writingScanTree()
    if (r.ok) set({ writingTree: r.value })
    else set({ writingError: r.message })
  },

  selectWritingFile: async (filePath: string | null) => {
    const seq = ++writingSelectSeq
    if (!filePath) return set({ writingFile: null })
    const cur = get().writingFile
    if (cur?.dirty) await get().saveWritingFile()
    const r = await ipc.writingRead({ path: filePath })
    if (seq !== writingSelectSeq) return // 更新的选中已发出，丢弃过期结果
    if (r.ok) set({ writingFile: { path: filePath, body: r.value.body ?? '', dirty: false, saving: 'idle' }, lastWritingFile: filePath })
    else set({ writingError: r.message })
  },

  updateWritingBody: (body: string) => set(s => s.writingFile ? { writingFile: { ...s.writingFile, body, dirty: true } } : {}),

  saveWritingFile: async () => {
    const f = get().writingFile
    if (!f || !f.dirty) return
    set({ writingFile: { ...f, saving: 'saving' as const } })
    const r = await ipc.writingWrite({ path: f.path, body: f.body })
    const cur = get().writingFile
    if (!cur || cur.path !== f.path) return // 保存期间文件已切换/关闭，丢弃过期结果
    set({ writingFile: { ...cur, dirty: !r.ok, saving: r.ok ? 'saved' as const : 'error' as const } })
  },
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
