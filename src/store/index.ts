// src/store/index.ts
import { create } from 'zustand'
import { normalizeStudyFontSize } from '@/lib/study-font-size'
import { mergeArticlesByUrl } from '@/lib/anthropic-articles'
import { nextThinkingEffort } from '@/lib/assistant-settings'
import { countArticleHeadings, isGuideCacheCurrent } from '@/lib/guide-progress'
import { resetAssistantStreamBuffers } from '@/lib/assistant-stream-buffers'
import { childrenPathsOf, writingPreviewKindOf, isWritingTreePath } from '@/lib/writing-tree-utils'
import type {
  Difficulty, Message, NewTopic, Profile, StateJson, Mode,
  TopicMeta, UnsavedSession, ArchiveResult, Group, GroupMapping,
  TopicContinueCache, SearchResult, SearchSource, SearchErrorCode,
  Terminology, BriefingTheme, BriefingFontSize, BriefingSourceId, AnthropicBlogCache,
  ArticleAnnotation, ArticleAssistantGuide, ArticleAssistantMessage, ArticleAssistantErrorCode,
  AnthropicArticleMeta, AnthropicError, AssistantThinkingEffort,
  WritingTreeNode, WritingTone, WritingAssistantMessage, WritingToolEvent, WritingToolActivity, WritingPreviewKind,
  GuideProgress,
  BlogCollectionFile, RecommendStage, ScrollMemorySlot,
  LocalMaterial,
  NotepadCategory, NotepadFontSize, NotepadItem, NotepadLogEntry,
  NoteEntry, NoteMeta, NoteSource, NoteSortBy,
  BookEntry, BookTocItem, ChapterMeta, BookGuideContext,
} from '@shared/index'
import { ipc } from '@/lib/ipc'
import type { DemoNote, DemoNoteOverrides } from '@/lib/demo-notes'
import { pickRandom, paintingPool, preloadPaintings, manifest } from '@/lib/paintings'
import type { Painting } from '@shared/index'
import { deriveTitle, migrateCoverNotepad, newNotepadId } from '@/lib/notepad'

export type AssistantSession = {
  contextId: string
  contextType: 'anthropic-article' | 'book-chapter'
  articleTitle?: string
  articleContent: string
  /** 章节导读上下文（仅 book-chapter） */
  bookContext?: BookGuideContext
  guide: ArticleAssistantGuide | null
  guideLoading: boolean
  guideProgress: GuideProgress | null
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
  localMaterials?: LocalMaterial[]
  groupId?: string
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
  archivedTopics: string[]

  // 临时
  session: Session | null
  currentPage: Page
  modal: 'preStudy' | null
  preStudyArgs: { mode: Mode; topic: string; dirName?: string; file_path?: string } | null
  toast: { message: string; ts: number } | null
  pendingReports: Record<string, ArchiveResult>
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

  // 简报（写作/博客共用外观设置）
  briefingTheme: BriefingTheme
  briefingFontSize: BriefingFontSize
  studyFontSize: BriefingFontSize
  candlelightEnabled: boolean
  paintingPlateEnabled: boolean
  toggleCandlelight: () => Promise<void>
  togglePaintingPlate: () => Promise<void>
  // Anthropic 博客
  briefingSource: BriefingSourceId
  anthropicBlogCache: AnthropicBlogCache
  anthropicReaderFilePath: string | null
  anthropicReaderBody: string | null
  anthropicReaderTitle: string | null
  anthropicBlogLastSeenAt: string | null
  /** 宪法可视化报告视图是否打开（仅运行时，与 anthropicReader 互斥） */
  constitutionReportOpen: boolean
  setBriefingSource: (source: BriefingSourceId) => Promise<void>
  // 书籍来源
  booksList: BookEntry[]
  booksLoading: boolean
  booksImporting: boolean
  activeBookDir: string | null
  activeBookToc: BookTocItem[]
  activeChapter: { path: string; content: string; meta: ChapterMeta } | null
  bookContext: BookGuideContext | null
  booksLastBook: string | null
  loadBooks: () => Promise<void>
  selectBook: (dir: string) => Promise<void>
  selectChapter: (chapterPath: string) => Promise<void>
  syncBookCompanion: (chapterPath: string) => Promise<void>
  importBook: () => Promise<void>
  removeBook: (dir: string) => Promise<void>
  /** 用当前解析器原地重解析旧书（正文档落格式升级）；成功后刷新书架与当前章节 */
  reparseBook: (dir: string) => Promise<void>
  booksReparsing: boolean
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
  cancelAnthropicImport: (url?: string) => Promise<void>
  openAnthropicReader: (filePath: string) => Promise<void>
  closeAnthropicReader: () => void
  openConstitutionReport: () => void
  closeConstitutionReport: () => void
  setAnthropicReaderContent: (content: { filePath: string; body: string | null; title: string | null }) => void
  deleteAnthropicArticle: (filePath: string) => Promise<void>

  // 博客收藏夹 & 推荐
  blogCollection: BlogCollectionFile
  recommendRunning: boolean
  recommendStage: RecommendStage | null
  recommendViewBatch: number | null
  loadBlogCollection: () => Promise<void>
  toggleBlogCollection: (article: { sourceUrl: string; filePath: string; title: string }) => Promise<void>
  removeBlogCollection: (sourceUrl: string) => Promise<void>
  markBlogRead: (args: { sourceUrl: string; filePath: string; title: string }) => Promise<void>
  removeBlogRead: (sourceUrl: string) => Promise<void>
  toggleBlogRead: (args: { sourceUrl: string; filePath: string; title: string }) => Promise<void>
  openRecommendView: (batch: number) => void
  closeRecommendView: () => void
  removeBlogBatch: (batch: number) => Promise<void>
  startBlogRecommend: (note?: string) => Promise<void>
  cancelBlogRecommend: () => Promise<void>

  setBriefingTheme: (theme: BriefingTheme) => Promise<void>
  increaseBriefingFontSize: () => Promise<void>
  decreaseBriefingFontSize: () => Promise<void>
  increaseStudyFontSize: () => Promise<void>
  decreaseStudyFontSize: () => Promise<void>

  transferArticleToWriting: (args: {
    name: string
    content: string
    sourceType: 'anthropic'
    sourcePath: string
  }) => Promise<void>

  // 画作背景
  currentPaintings: {
    cover: Painting | null
    home: Painting | null
    study: Painting | null
    briefing: Painting | null
  }
  /** 从抽取池隐藏的画作 id（封面删除按钮写入，持久化到 state.json） */
  hiddenPaintings: string[]
  /** 封面是否显示画作删除按钮 */
  paintingDeleteEnabled: boolean
  /** dev 模式下允许在封面拖拽调整画作焦点（打包版/e2e 隐藏入口，启动时经 IPC 拉取） */
  paintingsEditable: boolean
  /** 封面记事板内容（旧纯文本字段，仅作 notepadItems 一次性迁移源） */
  coverNotepad: string
  /** 迭代记事板待办条目 */
  notepadItems: NotepadItem[]
  /** 迭代档案：已解决条目（面板 ✓ 或 notepad-triage skill 写入） */
  notepadLog: NotepadLogEntry[]
  notepadFontSize: NotepadFontSize
  /** 面板自定义尺寸，null=默认 */
  notepadPanelSize: { w: number; h: number } | null

  /** Demo 说明文案的用户改写（noteId → 编辑路径 → 文本），落在 state.json */
  demoNoteOverrides: DemoNoteOverrides
  demoNotesHidden: Array<DemoNote['id']>
  toggleDemoNoteVisibility: (noteId: DemoNote['id']) => void
  /** Demo 信息说明弹层正文字号档位（复用简报十档） */
  demoNoteFontSize: BriefingFontSize
  /** 提交一处说明文案修改（空文本视为改回默认） */
  setDemoNoteOverride: (noteId: string, path: string, text: string) => void
  /** 设置 Demo 信息说明弹层字号档位 */
  setDemoNoteFontSize: (size: BriefingFontSize) => void
  /** 恢复某个说明条目的全部默认文案 */
  resetDemoNoteOverrides: (noteId: string) => void

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
  hidePainting: (surface: 'cover' | 'home' | 'study' | 'briefing') => Promise<void>
  setPaintingDeleteEnabled: (enabled: boolean) => Promise<void>
  setPaintingFocus: (surface: 'cover' | 'home' | 'study' | 'briefing', focus: string) => void
  setCoverNotepad: (text: string) => void
  addNotepadItem: (text: string, category: NotepadCategory) => void
  resolveNotepadItem: (id: string) => void
  deleteNotepadItem: (id: string) => void
  moveNotepadItem: (id: string, toIndex: number) => void
  updateNotepadItem: (id: string, patch: { text?: string; category?: NotepadCategory }) => void
  setNotepadFontSize: (size: NotepadFontSize) => void
  setNotepadPanelSize: (size: { w: number; h: number }) => void
  goto: (p: Page) => Promise<void>
  settingsReturnTo: Page | null
  openPreStudy: (a: { mode: Mode; topic: string; dirName?: string; file_path?: string }) => void
  closePreStudy: () => void
  startSession: (a: {
    mode: Mode; topic: string; dirName?: string; file_path?: string
    difficulty: Difficulty; temperature: number
    userRequirement?: string
    selectedTopic?: string
    enableExternalMaterials?: boolean
    localMaterials?: LocalMaterial[]
    groupId?: string
  }) => void
  appendChunk: (text: string) => void
  finishStreaming: () => void
  pushUserMessage: (text: string) => void
  abortAndReplaceUser: (text: string) => Promise<void>
  dismissArchive: () => void   // 用户点【暂不归档】,清掉本次 ask
  dismissPendingReport: (dirName: string) => void
  resetSession: () => void
  showToast: (m: string) => void
  patchProfile: (p: Partial<Profile>) => Promise<void>
  patchLastUsed: (l: Partial<{ difficulty: Difficulty; temperature: number }>) => Promise<void>
  patchTerminology: (patch: Terminology) => Promise<void>
  resetTerminology: () => Promise<void>
  saveCurrentSession: () => Promise<void>
  restoreSession: (session: UnsavedSession) => void
  removeUnsavedSession: (id: string) => void
  burnLiveSession: (id: string) => void
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
  // 主题归档 / 改名 / 重扫
  archiveTopic: (dirName: string) => Promise<void>
  restoreTopic: (dirName: string) => Promise<void>
  renameTopic: (dirName: string, newName: string) => Promise<void>
  rescanLibrary: () => Promise<void>
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
  openAssistantSession: (args: { contextId: string; contextType: 'anthropic-article' | 'book-chapter'; articleTitle?: string; articleContent: string; bookContext?: BookGuideContext; autoGenerateGuide?: boolean }) => void
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
  guideScrollToChunkIndex: number | null
  setGuideScrollToChunk: (index: number | null) => void
  setAssistantGuideProgress: (p: GuideProgress | null) => void
  persistAssistantState: () => Promise<void>
  generateAssistantGuide: () => Promise<void>

  // 写作板
  writingTree: { writing: WritingTreeNode[]; repository: WritingTreeNode[] } | null
  writingFile: { path: string; body: string; kind: WritingPreviewKind; truncated?: boolean; previewError?: string; dirty: boolean; saving: 'idle' | 'saving' | 'saved' | 'error' } | null
  writingError: string | null
  writingFontSize: BriefingFontSize
  writingTone: WritingTone
  writingListTab: 'articles' | 'repository' | 'notes'
  notesList: NoteEntry[] | null
  notesSortBy: NoteSortBy
  notesCategory: 'all' | NoteSource
  writingAssistantWidth: number
  writingAssistantOpen: boolean
  writingPanelMode: 'assistant' | 'companion'
  writingCompanionMap: Record<string, string>
  companionFile: { path: string; body: string; kind: WritingPreviewKind; truncated?: boolean; previewError?: string; dirty: boolean; saving: 'idle' | 'saving' | 'saved' | 'error' } | null
  writingEditorAction: ((fn: (ctx: any) => void) => void) | null
  lastWritingFile: string | null
  /** 博客最后阅读的文章 filePath(进入博客面板即恢复) */
  lastAnthropicReaderFile: string | null
  /** 四个浏览位置槽位(2026-10-03:只记最后的写作/博客/二者对照,见 StateJson 注释) */
  writingScrollMemory: ScrollMemorySlot | null
  anthropicScrollMemory: ScrollMemorySlot | null
  writingCompanionScrollMemory: ScrollMemorySlot | null
  articleCompanionScrollMemory: ScrollMemorySlot | null
  /** 博客对照槽最后打开的对照文(✕关闭时清 null) */
  lastArticleCompanion: { mainKey: string; filePath: string } | null
  /** 退出点落盘:set + 一次 patchState(滚动中不调用,见 use-scroll-memory) */
  flushWritingScrollPosition: (filePath: string, blockIndex: number) => void
  flushAnthropicScrollPosition: (filePath: string, blockIndex: number) => void
  flushWritingCompanionScrollPosition: (filePath: string, blockIndex: number) => void
  flushArticleCompanionScrollPosition: (filePath: string, blockIndex: number) => void
  writingOrder: Record<string, string[]>
  writingExpandedGroups: Record<string, boolean>
  writingUIFontSize: BriefingFontSize
  writingCodeblockCollapsed: Record<string, string[]>
  // HTML 删除模式（非持久；仅主写作板 HtmlPreview deletable 实例驱动）
  htmlDeleteMode: boolean
  htmlDeleteDirty: boolean
  htmlDeleteFlush: (() => Promise<boolean>) | null
  replaceWritingCodeblockCollapsed: (filePath: string, hashes: string[]) => void
  increaseWritingUIFontSize: () => Promise<void>
  decreaseWritingUIFontSize: () => Promise<void>

  // 写作助手
  writingAssistant: {
    sessionId: string
    articlePath: string | null
    messages: WritingAssistantMessage[]
    streaming: boolean
    error: ArticleAssistantErrorCode | null
  } | null
  writingAssistantSnapshotLit: boolean
  setWritingAssistantSnapshotLit: (lit: boolean) => void
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
  setHtmlDeleteMode: (on: boolean) => void
  setHtmlDeleteDirty: (dirty: boolean) => void
  registerHtmlDeleteFlush: (fn: (() => Promise<boolean>) | null) => void
  selectWritingFile: (filePath: string | null) => Promise<void>
  closeNoteToWall: () => Promise<void>
  updateWritingBody: (body: string) => void
  saveWritingFile: () => Promise<void>
  setWritingPanelMode: (mode: 'assistant' | 'companion') => void
  selectCompanionFile: (path: string) => Promise<void>
  updateCompanionBody: (body: string) => void
  saveCompanionFile: () => Promise<void>
  closeCompanion: () => Promise<void>
  saveAllDirtyWriting: () => Promise<void>
  setWritingListTab: (tab: 'articles' | 'repository' | 'notes') => void
  loadNotes: () => Promise<void>
  createNoteManual: (a: { title: string; url: string }) => Promise<void>
  findOrCreateArticleNote: (a: {
    title: string
    url: string
    source?: 'anthropic' | 'book'
    book?: string
    body?: string
  }) => Promise<{ path: string; created: boolean }>
  updateNoteMetaAction: (path: string, patch: Partial<NoteMeta>) => Promise<void>
  deleteNoteAction: (path: string) => Promise<void>
  importReadNotesAction: () => Promise<{ created: number; skipped: number } | null>
  setNotesSortBy: (s: NoteSortBy) => void
  setNotesCategory: (c: 'all' | NoteSource) => void
  setWritingAssistantWidth: (width: number) => void
  setWritingAssistantOpen: (open: boolean) => void
  setWritingEditorAction: (action: ((fn: (ctx: any) => void) => void) | null) => void
  setLastWritingFile: (file: string | null) => void
  setAssistantSearchEnabled: (enabled: boolean) => void
  setAssistantThinkingEffort: (effort: 'off' | 'high' | 'max') => void
  reorderWritingSibling: (args: { dir: string; src: string; target: string; position: 'before' | 'after'; siblings: string[] }) => void
  setWritingGroupExpanded: (path: string, open: boolean) => void
  appendWritingOrder: (dir: string, newPath: string) => void
  moveWritingNode: (args: { src: string; targetDir: string; index: number | null }) => Promise<void>
  writingRenamed: (oldPath: string, newPath: string) => void

  // 右栏统一：文章旁注面板模式（导读/对照）+ 对照槽
  articlePanelMode: Record<'anthropic' | 'book', 'guide' | 'companion'>
  articleCompanionMap: Record<string, string>
  // 写作树对照挑选器：非 null 时左栏临时换成写作树（瞬态，不持久化），
  // 点文件 = 放入该栏目对照槽。source 切换/切回导读/折叠右栏时清空。
  writingCompanionPicker: 'anthropic' | 'book' | null
  articleCompanion: { key: string; filePath: string; kind: 'md' | 'html' | 'other'; body: string; readonly: boolean; dirty: boolean; saving: 'idle' | 'saving' | 'saved' | 'error' } | null
  setArticlePanelMode: (source: 'anthropic' | 'book', mode: 'guide' | 'companion') => void
  openWritingCompanionPicker: (source: 'anthropic' | 'book') => void
  closeWritingCompanionPicker: () => void
  selectArticleCompanion: (source: 'anthropic' | 'book', mainKey: string, filePath: string, opts?: { readonly?: boolean }) => Promise<void>
  updateArticleCompanionBody: (body: string) => void
  saveArticleCompanion: () => Promise<void>
  closeArticleCompanion: () => Promise<void>
}

let wildcardRequestId = 0

// selectWritingFile 的单调序号：并发/交错的文件选中后写先赢时，丢弃过期的
// writingRead 结果（rules general §7）。
let writingSelectSeq = 0

// selectCompanionFile 的单调序号：同 writingSelectSeq，对照槽的过期读取结果一律丢弃。
let companionSelectSeq = 0

// selectArticleCompanion 的单调序号：同 companionSelectSeq，对照槽的过期读取结果一律丢弃。
let articleCompanionSelectSeq = 0

// 书籍：切换书/章节的单调序号，丢弃过期读取结果
let bookSelectSeq = 0
let chapterSelectSeq = 0
// 全书导读生成中的书（避免重复选中/刷新时并发打两次 LLM）
const bookGuideInFlight = new Set<string>()

/** Ensures sendAssistantMessage waits for history to load before sending, preventing
 *  the race where a user message lands before loadAssistantSession completes and the
 *  cur.messages.length === 0 guard discards the loaded history. */
let historyLoadPromise: Promise<void> | null = null

/** 并行导入时「最后点击的文章」才在完成时打开阅读器——主进程导入队列 FIFO 串行，
 *  若每篇完成都打开会连续抢阅读器（flipbook）。 */
let lastAnthropicImportUrl: string | null = null

let guideWidthSaveTimer: ReturnType<typeof setTimeout> | null = null
function debounceSaveGuideWidth(patch: Partial<StateJson>) {
  if (guideWidthSaveTimer) clearTimeout(guideWidthSaveTimer)
  guideWidthSaveTimer = setTimeout(() => {
    ipc.patchState(patch)
  }, 300)
}

// 进行中的导读生成（key = contextId）。切换文章/日期不中断后台生成：
// 完成后无条件落盘，切回时恢复 loading 显示而不重复发起。
const inFlightGuides = new Map<string, Promise<void>>()

let assistantWidthSaveTimer: ReturnType<typeof setTimeout> | null = null
function debounceSaveAssistantWidth(patch: Partial<StateJson>) {
  if (assistantWidthSaveTimer) clearTimeout(assistantWidthSaveTimer)
  assistantWidthSaveTimer = setTimeout(() => {
    ipc.patchState(patch)
  }, 300)
}

let expandedSaveTimer: ReturnType<typeof setTimeout> | null = null
function debounceSaveExpanded(patch: Partial<StateJson>) {
  if (expandedSaveTimer) clearTimeout(expandedSaveTimer)
  expandedSaveTimer = setTimeout(() => {
    ipc.patchState(patch)
  }, 300)
}

let notepadSaveTimer: ReturnType<typeof setTimeout> | null = null
function debounceSaveNotepad(patch: Partial<StateJson>) {
  if (notepadSaveTimer) clearTimeout(notepadSaveTimer)
  notepadSaveTimer = setTimeout(() => {
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
  archivedTopics: [],
  session: null,
  currentPage: 'cover',
  settingsReturnTo: null,
  pendingReports: {},
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
  hiddenPaintings: [],
  paintingDeleteEnabled: true,
  paintingsEditable: false,
  coverNotepad: '',
  notepadItems: [],
  notepadLog: [],
  notepadFontSize: 'base',
  notepadPanelSize: null,
  demoNoteOverrides: {},
  demoNotesHidden: [],
  demoNoteFontSize: 'base',
  briefingTheme: 'academic',
  briefingFontSize: 'base',
  studyFontSize: 'lg',
  candlelightEnabled: true,
  paintingPlateEnabled: false,
  briefingSource: 'writing',
  booksList: [],
  booksLoading: false,
  booksImporting: false,
  booksReparsing: false,
  activeBookDir: null,
  activeBookToc: [],
  activeChapter: null,
  bookContext: null,
  booksLastBook: null,
  anthropicBlogCache: { lastFetchedAt: null, articles: [], loading: false, error: null, sectionStatus: {} },
  anthropicReaderFilePath: null,
  anthropicReaderBody: null,
  anthropicReaderTitle: null,
  anthropicBlogLastSeenAt: null,
  constitutionReportOpen: false,
  blogCollection: { version: 1, entries: [], dismissed: [], history: [], read: [] },
  recommendRunning: false,
  recommendStage: null,
  recommendViewBatch: null,
  assistantSession: null,
  assistantSearchEnabled: false,
  assistantSocraticMode: true,
  assistantThinkingEffort: 'off',
  articleAssistantGuideWidth: 320,
  articleAssistantGuideCollapsed: false,
  guideScrollToChunkIndex: null,
  writingTree: null,
  writingFile: null,
  writingError: null,
  writingFontSize: 'base',
  writingTone: 'parchment',
  writingListTab: 'articles',
  notesList: null,
  notesSortBy: 'source',
  notesCategory: 'all',
  writingAssistantWidth: 320,
  writingAssistantOpen: false,
  writingPanelMode: 'assistant',
  writingCompanionMap: {},
  companionFile: null,
  writingEditorAction: null,
  lastWritingFile: null,
  lastAnthropicReaderFile: null,
  writingScrollMemory: null,
  anthropicScrollMemory: null,
  writingCompanionScrollMemory: null,
  articleCompanionScrollMemory: null,
  writingOrder: {},
  writingExpandedGroups: {},
  writingUIFontSize: 'base',
  writingCodeblockCollapsed: {},
  htmlDeleteMode: false,
  htmlDeleteDirty: false,
  htmlDeleteFlush: null,
  articlePanelMode: { anthropic: 'guide', book: 'guide' },
  articleCompanionMap: {},
  articleCompanion: null,
  lastArticleCompanion: null,
  writingCompanionPicker: null,
  writingAssistant: null,
  writingAssistantSnapshotLit: false,

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
      studyFontSize: normalizeStudyFontSize(state.studyFontSize),
      briefingSource: state.briefingSource === 'anthropic' || state.briefingSource === 'writing' || state.briefingSource === 'book' ? state.briefingSource : 'writing',
      anthropicBlogCache: state.anthropicBlogCache
        ? { ...state.anthropicBlogCache, loading: false, error: null, sectionStatus: state.anthropicBlogCache.sectionStatus ?? {}, articleMetaCache: state.anthropicBlogCache.articleMetaCache ?? {} }
        : { lastFetchedAt: null, articles: [], loading: false, error: null, sectionStatus: {}, articleMetaCache: {} },
      anthropicBlogLastSeenAt: state.anthropicBlogLastSeenAt ?? null,
      articleAssistantGuideWidth: state.articleAssistantGuideWidth ?? 320,
      articleAssistantGuideCollapsed: state.articleAssistantGuideCollapsed ?? false,
      assistantSearchEnabled: state.assistantSearchEnabled ?? false,
      assistantSocraticMode: state.assistantSocraticMode ?? true,
      assistantThinkingEffort: state.assistantThinkingEffort ?? 'off',
      writingFontSize: state.writingFontSize ?? 'base',
      writingTone: state.writingTone ?? 'parchment',
      writingListTab: state.writingListTab ?? 'articles',
      notesSortBy: state.notesSortBy ?? 'source',
      notesCategory: state.notesCategory ?? 'all',
      writingAssistantWidth: Math.max(200, Math.min(state.writingAssistantWidth ?? 320, 560)),
      writingAssistantOpen: state.writingAssistantOpen ?? false,
      writingPanelMode: state.writingPanelMode ?? 'assistant',
      writingCompanionMap: state.writingCompanionMap ?? {},
      lastWritingFile: state.lastWritingFile ?? null,
      lastAnthropicReaderFile: state.lastAnthropicReaderFile ?? null,
      writingScrollMemory: state.writingScrollMemory ?? null,
      anthropicScrollMemory: state.anthropicScrollMemory ?? null,
      writingCompanionScrollMemory: state.writingCompanionScrollMemory ?? null,
      articleCompanionScrollMemory: state.articleCompanionScrollMemory ?? null,
      lastArticleCompanion: state.lastArticleCompanion ?? null,
      writingOrder: state.writingOrder ?? {},
      writingExpandedGroups: state.writingExpandedGroups ?? {},
      writingUIFontSize: state.writingUIFontSize ?? 'base',
      writingCodeblockCollapsed: state.writingCodeblockCollapsed ?? {},
      articlePanelMode: { anthropic: state.articlePanelMode?.anthropic ?? 'guide', book: state.articlePanelMode?.book ?? 'guide' },
      booksLastBook: state.booksLastBook ?? null,
      articleCompanionMap: state.articleCompanionMap ?? {},
      fableStyleTags: state.fableStyleTags ?? ['科幻', '童话', '历史', '日常生活', '悬疑', '诗意散文'],
      lastFableTags: state.lastFableTags ?? [],
      candlelightEnabled: state.candlelightEnabled ?? true,
      paintingPlateEnabled: state.paintingPlateEnabled ?? false,
      session_count: state.ui?.session_count ?? 0,
      archivedTopics: Array.isArray(state.archivedTopics) ? state.archivedTopics : [],
      hiddenPaintings: Array.isArray(state.hiddenPaintings) ? state.hiddenPaintings : [],
      paintingDeleteEnabled: state.paintingDeleteEnabled ?? true,
      coverNotepad: state.coverNotepad ?? '',
      notepadItems: migrateCoverNotepad(state.coverNotepad ?? '', state.notepadItems),
      notepadLog: Array.isArray(state.notepadLog) ? state.notepadLog : [],
      notepadFontSize: state.notepadFontSize ?? 'base',
      notepadPanelSize: state.notepadPanelSize ?? null,
      demoNoteOverrides: state.demoNoteOverrides ?? {},
      demoNotesHidden: (state.demoNotesHidden ?? []) as Array<DemoNote['id']>,
      demoNoteFontSize: state.demoNoteFontSize ?? 'base',
      library: library.filter(t => !(state.archivedTopics ?? []).includes(t.dirName)),
      unsavedSessions: unsaved,
      groups: groupsData.groups,
      groupMapping: groupsData.mapping
    })
    // 旧 coverNotepad 纯文本已迁移为结构化条目：清空旧字段，迁移结果落盘（一次性）
    if ((state.coverNotepad ?? '').trim() && (state.notepadItems ?? []).length === 0) {
      const migrated = get().notepadItems
      set({ coverNotepad: '' })
      ipc.patchState({ coverNotepad: '', notepadItems: migrated } as Partial<StateJson>)
    }
    get().initPaintings()
    void get().loadBooks()

    // dev-only 裁剪入口开关；失败静默（默认 false 即隐藏入口）
    ipc.paintingsCanEdit().then(v => set({ paintingsEditable: v === true })).catch(() => {})

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
    const pool = paintingPool(get().hiddenPaintings)
    const next = {
      cover: pickRandom(pool, null),
      home: pickRandom(pool, null),
      study: pickRandom(pool, null),
      briefing: pickRandom(pool, null),
    }
    set({ currentPaintings: next })
    // Decode all chosen paintings up front so navigating into a surface shows
    // its background instantly instead of flashing the dark base color.
    preloadPaintings([next.cover, next.home, next.study, next.briefing])
  },

  swapPainting: (surface) => {
    const current = get().currentPaintings[surface]
    const next = pickRandom(paintingPool(get().hiddenPaintings), current?.id ?? null)
    if (!next) return
    set(state => ({
      currentPaintings: { ...state.currentPaintings, [surface]: next }
    }))
  },

  // 拖拽裁剪实时调用：同步改 manifest 条目（本会话内换走再换回仍是新焦点），
  // currentPaintings 换新对象触发 SurfaceBackground 的 objectPosition 更新。
  setPaintingFocus: (surface, focus) => {
    const current = get().currentPaintings[surface]
    if (!current) return
    const entry = manifest.find(p => p.id === current.id)
    if (entry) entry.focus = focus
    set(state => ({
      currentPaintings: { ...state.currentPaintings, [surface]: { ...current, focus } }
    }))
  },

  // 封面删除按钮：当前画作 id 写入隐藏名单（去重 + 持久化），随后自动换画。
  // 隐藏名单即真相源——物理文件不动（打包后 asar 只读），恢复靠手改 state.json。
  hidePainting: async (surface) => {
    const current = get().currentPaintings[surface]
    if (!current) return
    const hidden = get().hiddenPaintings
    const next = hidden.includes(current.id) ? hidden : [...hidden, current.id]
    set({ hiddenPaintings: next })
    await ipc.patchState({ hiddenPaintings: next } as Partial<StateJson>)
    get().swapPainting(surface)
  },

  setPaintingDeleteEnabled: async (enabled) => {
    set({ paintingDeleteEnabled: enabled })
    await ipc.patchState({ paintingDeleteEnabled: enabled } as Partial<StateJson>)
  },
  setCoverNotepad: (text) => {
    set({ coverNotepad: text })
    debounceSaveNotepad({ coverNotepad: text } as Partial<StateJson>)
  },

  addNotepadItem: (text, category) => {
    const t = text.trim()
    if (!t) return
    const items = [...get().notepadItems, { id: newNotepadId(), title: deriveTitle(t), text: t, category, createdAt: new Date().toISOString() }]
    set({ notepadItems: items })
    ipc.patchState({ notepadItems: items } as Partial<StateJson>)
  },

  resolveNotepadItem: (id) => {
    const { notepadItems, notepadLog } = get()
    const item = notepadItems.find(i => i.id === id)
    if (!item) return
    const items = notepadItems.filter(i => i.id !== id)
    const log = [...notepadLog, { ...item, resolvedAt: new Date().toISOString(), source: 'user' as const }]
    set({ notepadItems: items, notepadLog: log })
    ipc.patchState({ notepadItems: items, notepadLog: log } as Partial<StateJson>)
  },

  deleteNotepadItem: (id) => {
    const items = get().notepadItems.filter(i => i.id !== id)
    set({ notepadItems: items })
    ipc.patchState({ notepadItems: items } as Partial<StateJson>)
  },
  updateNotepadItem: (id, patch) => {
    // 文本变更时短标题一并重算（面板待办行展示用 title 兜底见 deriveTitle）
    const items = get().notepadItems.map(i => i.id === id
      ? { ...i, ...patch, ...(patch.text ? { title: deriveTitle(patch.text) } : {}) }
      : i)
    set({ notepadItems: items })
    ipc.patchState({ notepadItems: items } as Partial<StateJson>)
  },

  moveNotepadItem: (id, toIndex) => {
    const items = [...get().notepadItems]
    const from = items.findIndex(i => i.id === id)
    if (from < 0) return
    const [item] = items.splice(from, 1)
    items.splice(Math.max(0, Math.min(items.length, toIndex)), 0, item)
    set({ notepadItems: items })
    ipc.patchState({ notepadItems: items } as Partial<StateJson>)
  },

  setNotepadFontSize: (size) => {
    set({ notepadFontSize: size })
    ipc.patchState({ notepadFontSize: size } as Partial<StateJson>)
  },

  setNotepadPanelSize: (size) => {
    set({ notepadPanelSize: size })
    ipc.patchState({ notepadPanelSize: size } as Partial<StateJson>)
  },

  // ── Demo 说明文案改写 ─────────────────────────────────────
  setDemoNoteOverride: (noteId, path, text) => {
    const prev = get().demoNoteOverrides
    const patched = { ...(prev[noteId] ?? {}) }
    if (text.trim()) patched[path] = text
    else delete patched[path] // 清空即回退默认文案
    const next = { ...prev }
    if (Object.keys(patched).length > 0) next[noteId] = patched
    else delete next[noteId]
    set({ demoNoteOverrides: next })
    ipc.patchState({ demoNoteOverrides: next } as Partial<StateJson>)
  },

  setDemoNoteFontSize: (size) => {
    set({ demoNoteFontSize: size })
    ipc.patchState({ demoNoteFontSize: size } as Partial<StateJson>)
  },

  toggleDemoNoteVisibility: (noteId) => {
    const current = get().demoNotesHidden
    const next = current.includes(noteId) ? current.filter((id) => id !== noteId) : [...current, noteId]
    set({ demoNotesHidden: next })
    ipc.patchState({ demoNotesHidden: next } as Partial<StateJson>)
  },

  resetDemoNoteOverrides: (noteId) => {
    const prev = get().demoNoteOverrides
    if (!(noteId in prev)) return
    const next = { ...prev }
    delete next[noteId]
    set({ demoNoteOverrides: next })
    ipc.patchState({ demoNoteOverrides: next } as Partial<StateJson>)
  },

  // 进入 settings 时记录来源页，Settings 返回按钮优先回来源页（缺省 home）。
  goto: async (p) => {
    // HTML 删除模式有未写回删除时先 flush（离开页面=自动写回）；失败中止导航
    const htmlFlush = get().htmlDeleteFlush
    if (htmlFlush && !(await htmlFlush())) return
    set((s) => ({
      currentPage: p,
      settingsReturnTo: p === 'settings' ? s.currentPage : s.settingsReturnTo,
    }))
  },
  openPreStudy: (a) => set({ modal: 'preStudy', preStudyArgs: a }),
  closePreStudy: () => set({ modal: null, preStudyArgs: null }),

  startSession: (a) => {
    // onBack 不再中断会话,开新会话时旧会话可能还在后台跑:
    // 中止旧流避免孤儿请求白烧 token,并清掉旧主题的外部资料,
    // 否则新会话 kickoff 看到 summary 已存在会跳过搜索、用错主题的资料
    const prev = get().session
    if (prev?.streaming) ipc.llmAbort(prev.abortId)
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
        enableExternalMaterials: a.enableExternalMaterials,
        localMaterials: a.localMaterials,
        groupId: a.groupId
      },
      externalMaterials: null,
      isExternalSummaryOpen: false,
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

  dismissPendingReport: (dirName) => {
    const next = { ...get().pendingReports }
    delete next[dirName]
    set({ pendingReports: next })
  },

  transferArticleToWriting: async (args) => {
    const sanitize = (n: string) =>
      n.replace(/[\\/:*?"<>|]/g, '-').replace(/\s+/g, ' ').trim() || '未命名'
    const base = sanitize(args.name)

    const parentType = 'anthropic-article' as const
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

  increaseStudyFontSize: async () => {
    const { nextStudyFontSize, normalizeStudyFontSize } = await import('@/lib/study-font-size')
    const current = normalizeStudyFontSize(get().studyFontSize)
    const next = nextStudyFontSize(current)
    if (next === current) return
    set({ studyFontSize: next })
    await ipc.patchState({ studyFontSize: next } as Partial<StateJson>)
  },

  decreaseStudyFontSize: async () => {
    const { prevStudyFontSize, normalizeStudyFontSize } = await import('@/lib/study-font-size')
    const current = normalizeStudyFontSize(get().studyFontSize)
    const prev = prevStudyFontSize(current)
    if (prev === current) return
    set({ studyFontSize: prev })
    await ipc.patchState({ studyFontSize: prev } as Partial<StateJson>)
  },

  increaseWritingUIFontSize: async () => {
    const { nextFontSize } = await import('@/lib/briefing-font-size')
    const current = get().writingUIFontSize
    const next = nextFontSize(current)
    if (next === current) return
    set({ writingUIFontSize: next })
    await ipc.patchState({ writingUIFontSize: next } as Partial<StateJson>)
  },

  decreaseWritingUIFontSize: async () => {
    const { prevFontSize } = await import('@/lib/briefing-font-size')
    const current = get().writingUIFontSize
    const prev = prevFontSize(current)
    if (prev === current) return
    set({ writingUIFontSize: prev })
    await ipc.patchState({ writingUIFontSize: prev } as Partial<StateJson>)
  },

  replaceWritingCodeblockCollapsed: (filePath, hashes) => {
    const map = { ...get().writingCodeblockCollapsed }
    if (hashes.length > 0) map[filePath] = hashes
    else delete map[filePath]
    set({ writingCodeblockCollapsed: map })
    ipc.patchState({ writingCodeblockCollapsed: map } as Partial<StateJson>)
  },

  toggleCandlelight: async () => {
    const next = !get().candlelightEnabled
    set({ candlelightEnabled: next })
    await ipc.patchState({ candlelightEnabled: next } as Partial<StateJson>)
  },
  togglePaintingPlate: async () => {
    const next = !get().paintingPlateEnabled
    set({ paintingPlateEnabled: next })
    await ipc.patchState({ paintingPlateEnabled: next } as Partial<StateJson>)
  },

  setBriefingSource: async (source) => {
    // HTML 删除模式有未写回删除时先 flush（离开写作区=自动写回）；失败中止切换
    const htmlFlush = get().htmlDeleteFlush
    if (htmlFlush && !(await htmlFlush())) return
    // 真实 source 切换 = 离开当前栏目，对照挑选器一并关闭
    set({ briefingSource: source, writingCompanionPicker: null })
    await ipc.patchState({ briefingSource: source } as Partial<StateJson>)
    if (source === 'writing') void ipc.writingRefreshCatalog() // 摘要唯一生成时机(spec C)
    if (source === 'book') void get().loadBooks()
  },

  // ── 书籍来源 ──────────────────────────────────────────────
  loadBooks: async () => {
    set({ booksLoading: true })
    try {
      const booksList = await ipc.booksList()
      set({ booksList, booksLoading: false })
      const active = get().activeBookDir
      if (active && !booksList.some((b) => b.dir === active)) {
        // 外部删除了当前书：清空活动状态，避免继续读已不存在的章节
        ++bookSelectSeq
        ++chapterSelectSeq
        set({ activeBookDir: null, activeBookToc: [], activeChapter: null, bookContext: null })
      }
      // 只有用户当前就在书籍来源时才自动恢复/选中，避免应用启动即触发全书导读 LLM
      if (!get().activeBookDir && booksList.length > 0 && get().briefingSource === 'book') {
        const last = get().booksLastBook
        const target = booksList.find((b) => b.dir === last) ?? booksList[0]
        await get().selectBook(target.dir)
      }
    } catch {
      set({ booksLoading: false })
    }
  },

  selectBook: async (dir) => {
    // 任何一次选书（含命中下方早退）都让上一本书仍在途的章节读取失效，
    // 避免旧书的 booksReadChapter 结果回写到新书语境。
    ++chapterSelectSeq
    // 重选当前书（如导读生成后刷新书架）不重置章节与阅读位置
    if (get().activeBookDir === dir && get().activeBookToc.length > 0) {
      const entry = get().booksList.find((b) => b.dir === dir)
      // 上次全书导读失败时，再点书卡允许重试
      if (entry && !entry.bookGuide && !bookGuideInFlight.has(dir)) {
        bookGuideInFlight.add(dir)
        void ipc
          .booksBookGuide({ bookDir: dir })
          .then(() => get().loadBooks())
          .catch((err) => {
            if (get().activeBookDir === dir) get().showToast(err instanceof Error ? err.message : '全书导读生成失败')
          })
          .finally(() => bookGuideInFlight.delete(dir))
      }
      return
    }
    ++bookSelectSeq
    set({ activeBookDir: dir, activeChapter: null, bookContext: null, activeBookToc: [] })
    try {
      const seq = bookSelectSeq
      const activeBookToc = await ipc.booksChapters({ bookDir: dir })
      if (seq !== bookSelectSeq) return
      set({ activeBookToc })
    } catch (err) {
      if (get().activeBookDir === dir) {
        set({ activeBookToc: [] })
        get().showToast(err instanceof Error ? err.message : '章节列表读取失败')
      }
      return
    }
    set({ booksLastBook: dir })
    void ipc.patchState({ booksLastBook: dir } as Partial<StateJson>)
    const entry = get().booksList.find((b) => b.dir === dir)
    if (entry && !entry.bookGuide && !bookGuideInFlight.has(dir)) {
      // 懒生成全书导读；完成后刷新书架卡片（不覆盖当前选中的书）
      bookGuideInFlight.add(dir)
      void ipc
        .booksBookGuide({ bookDir: dir })
        .then(() => get().loadBooks())
        .catch((err) => {
          if (get().activeBookDir === dir) get().showToast(err instanceof Error ? err.message : '全书导读生成失败')
        })
        .finally(() => bookGuideInFlight.delete(dir))
    }
  },

  selectChapter: async (chapterPath) => {
    const seq = ++chapterSelectSeq
    const selectedBook = get().activeBookDir
    try {
      const chapter = await ipc.booksReadChapter({ chapterPath })
      if (seq !== chapterSelectSeq || get().activeBookDir !== selectedBook) return
      const bookDir = get().activeBookDir
      const book = get().booksList.find((b) => b.dir === bookDir)
      const toc = get().activeBookToc
      const idx = toc.findIndex((t) => chapterPath.endsWith(t.chapterFile))
      let prevChapterSummary: string | undefined
      if (idx > 0 && bookDir) {
        try {
          const prevPath = `${bookDir}/${toc[idx - 1].chapterFile}`
          const prevGuide = await ipc.articleAssistantReadGuide({ parentPath: prevPath, parentType: 'book-chapter' })
          prevChapterSummary = prevGuide?.guide.background
        } catch {
          /* 前章没有导读时不影响本章 */
        }
      }
      if (seq !== chapterSelectSeq || get().activeBookDir !== selectedBook) return
      set({
        activeChapter: { path: chapterPath, ...chapter },
        bookContext: {
          bookTitle: book?.title ?? '',
          tocTitles: toc.map((t) => t.title),
          ...(prevChapterSummary ? { prevChapterSummary } : {}),
        },
      })
      await get().syncBookCompanion(chapterPath)
    } catch (err) {
      if (seq === chapterSelectSeq) get().showToast(err instanceof Error ? err.message : '章节读取失败')
    }
  },

  /** 章节切换时让对照槽跟随当前章节：有历史映射则恢复，否则清空旧的书籍对照。 */
  syncBookCompanion: async (chapterPath) => {
    if (get().articlePanelMode.book !== 'companion') return
    const current = get().articleCompanion
    if (current?.key === chapterPath) return
    if (current?.dirty) await get().saveArticleCompanion()
    const mapped = get().articleCompanionMap[chapterPath]
    if (mapped) {
      await get().selectArticleCompanion('book', chapterPath, mapped)
    } else if (current && get().articleCompanion?.key === current.key) {
      set({ articleCompanion: null })
    }
  },

  importBook: async () => {
    if (get().booksImporting) return
    set({ booksImporting: true })
    try {
      const r = await ipc.booksImport()
      if (!r) return
      if ('error' in r) {
        get().showToast(r.error)
        return
      }
      await get().loadBooks()
      await get().selectBook(r.book.dir)
      get().showToast(`已导入《${r.book.title}》`)
    } catch (err) {
      get().showToast(err instanceof Error ? err.message : '导入失败')
    } finally {
      set({ booksImporting: false })
    }
  },

  removeBook: async (dir) => {
    const underDir = (p: string) => p === dir || p.startsWith(dir + '/') || p.startsWith(dir + '\\')
    // 删除前先关掉落在该书目录下的导读/对话会话（避免删除后仍持有失效 contextId）
    const sess = get().assistantSession
    if (sess && underDir(sess.contextId)) {
      if (sess.streaming && sess.abortId) ipc.articleAssistantAbort({ sessionId: sess.abortId })
      get().closeAssistantSession()
    }
    bookGuideInFlight.delete(dir)
    try {
      await ipc.booksDelete({ bookDir: dir })
    } catch (err) {
      get().showToast(err instanceof Error ? err.message : '删除失败')
      return
    }
    // 该书目录下的章节对照映射一并失效，避免书架里再次出现同名书/旧章节时错配
    const prevCompanionMap = get().articleCompanionMap
    const nextCompanionMap: Record<string, string> = {}
    let companionMapChanged = false
    for (const [key, value] of Object.entries(prevCompanionMap)) {
      if (underDir(key)) {
        companionMapChanged = true
        continue
      }
      nextCompanionMap[key] = value
    }
    if (companionMapChanged) {
      set({ articleCompanionMap: nextCompanionMap })
      void ipc.patchState({ articleCompanionMap: nextCompanionMap } as Partial<StateJson>)
    }
    if (get().articleCompanion && underDir(get().articleCompanion!.key)) {
      set({ articleCompanion: null })
    }
    if (get().activeBookDir === dir) {
      ++bookSelectSeq
      ++chapterSelectSeq
      set({ activeBookDir: null, activeBookToc: [], activeChapter: null, bookContext: null })
    }
    if (get().booksLastBook === dir) {
      set({ booksLastBook: null })
      void ipc.patchState({ booksLastBook: null } as Partial<StateJson>)
    }
    await get().loadBooks()
  },

  reparseBook: async (dir) => {
    if (get().booksReparsing) return
    set({ booksReparsing: true })
    try {
      const r = await ipc.booksReparse({ bookDir: dir })
      if (!r.ok) {
        get().showToast(r.error || '重新解析失败')
        return
      }
      await get().loadBooks()
      // 当前正打开的章节已被替换：重读本章（路径不变，内容与页码可能变）
      const cur = get().activeChapter
      if (cur && get().activeBookDir === dir) {
        await get().selectChapter(cur.path)
      }
      const fresh = get().booksList.find((b) => b.dir === dir)
      get().showToast(`已重新解析${fresh ? `：${fresh.chapterCount} 章` : ''}`)
    } catch (err) {
      get().showToast(err instanceof Error ? err.message : '重新解析失败')
    } finally {
      set({ booksReparsing: false })
    }
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
        const cur = get().anthropicBlogCache
        const next: AnthropicBlogCache = {
          ...cur,
          lastFetchedAt: result.lastFetchedAt,
          articles: result.articles,
          loading: false,
          error: null,
          sectionStatus: result.sectionStatus,
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
        articles: mergeArticlesByUrl(s.anthropicBlogCache.articles, newArticles),
      },
    }))
  },

  importAnthropicArticle: async (url) => {
    lastAnthropicImportUrl = url
    try {
      const result = await ipc.anthropicImportArticle(url)
      if (result.ok) {
        const openReader = lastAnthropicImportUrl === url
        set(s => ({
          anthropicBlogCache: {
            ...s.anthropicBlogCache,
            articles: s.anthropicBlogCache.articles.map((a) =>
              a.url === url ? { ...a, isSaved: true, filePath: result.filePath } : a
            ),
          },
          ...(openReader ? { anthropicReaderFilePath: result.filePath, anthropicReaderBody: null, anthropicReaderTitle: null, lastAnthropicReaderFile: result.filePath } : {}),
        }))
        // 导入后自动打开也要持久化「最后阅读」(此路径绕过 openAnthropicReader)
        if (openReader) void ipc.patchState({ lastAnthropicReaderFile: result.filePath } as Partial<StateJson>)
        get().showToast(result.wasAlreadySaved ? '文章已保存' : '导入成功')
      } else {
        get().showToast(result.message || '导入失败')
      }
    } catch (err: any) {
      get().showToast(err.message || '导入失败')
    }
  },

  cancelAnthropicImport: async (url) => {
    await ipc.anthropicCancelImport(url)
    set(s => ({ anthropicBlogCache: { ...s.anthropicBlogCache, loading: false } }))
  },

  openAnthropicReader: async (filePath) => {
    const now = new Date().toISOString()
    // 同一篇已加载完的正文不清空：文章列表点行与「恢复上次阅读」effect 会在
    // reload 后同时触发，后到的 open 若把 body 置 null，挂载条件 readerBody
    // 变 false，旁注面板与右侧 tab 直接消失（正文本身不重读，不会再回填）。
    const sameLoaded = get().anthropicReaderFilePath === filePath && !!get().anthropicReaderBody
    set({
      anthropicReaderFilePath: filePath,
      ...(sameLoaded ? {} : { anthropicReaderBody: null, anthropicReaderTitle: null }),
      anthropicBlogLastSeenAt: now,
      constitutionReportOpen: false,
      recommendViewBatch: null,
      lastAnthropicReaderFile: filePath,
    })
    await ipc.patchState({ anthropicBlogLastSeenAt: now, lastAnthropicReaderFile: filePath } as Partial<StateJson>)
  },
  flushWritingScrollPosition: (filePath, blockIndex) => {
    const mem: ScrollMemorySlot = { filePath, blockIndex }
    set({ writingScrollMemory: mem })
    // 同步落盘:flush 只在退出路径触发(切文档/卸载/beforeunload),量小且必须必达
    ipc.patchStateSync({ writingScrollMemory: mem } as Partial<StateJson>)
  },
  flushAnthropicScrollPosition: (filePath, blockIndex) => {
    const mem: ScrollMemorySlot = { filePath, blockIndex }
    set({ anthropicScrollMemory: mem })
    ipc.patchStateSync({ anthropicScrollMemory: mem } as Partial<StateJson>)
  },
  flushWritingCompanionScrollPosition: (filePath, blockIndex) => {
    const mem: ScrollMemorySlot = { filePath, blockIndex }
    set({ writingCompanionScrollMemory: mem })
    ipc.patchStateSync({ writingCompanionScrollMemory: mem } as Partial<StateJson>)
  },
  flushArticleCompanionScrollPosition: (filePath, blockIndex) => {
    const mem: ScrollMemorySlot = { filePath, blockIndex }
    set({ articleCompanionScrollMemory: mem })
    ipc.patchStateSync({ articleCompanionScrollMemory: mem } as Partial<StateJson>)
  },
  closeAnthropicReader: () => {
    set({ anthropicReaderFilePath: null, anthropicReaderBody: null, anthropicReaderTitle: null, lastAnthropicReaderFile: null })
    void ipc.patchState({ lastAnthropicReaderFile: null } as Partial<StateJson>)
  },
  openConstitutionReport: () =>
    set({
      constitutionReportOpen: true,
      anthropicReaderFilePath: null,
      anthropicReaderBody: null,
      anthropicReaderTitle: null,
      recommendViewBatch: null,
    }),
  closeConstitutionReport: () => set({ constitutionReportOpen: false }),
  setAnthropicReaderContent: ({ filePath, body, title }) => {
    if (get().anthropicReaderFilePath !== filePath) return
    set({ anthropicReaderBody: body, anthropicReaderTitle: title })
  },

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

  loadBlogCollection: async () => {
    const r = await ipc.anthropicCollectionRead()
    if (r.ok) set({ blogCollection: r.collection })
  },
  toggleBlogCollection: async (article) => {
    const existing = get().blogCollection.entries.find(e => e.sourceUrl === article.sourceUrl)
    const r = !existing
      ? await ipc.anthropicCollectionAdd(article)
      : await ipc.anthropicCollectionRemove({ sourceUrl: article.sourceUrl })
    if (r.ok) set({ blogCollection: r.collection })
  },
  removeBlogCollection: async (sourceUrl) => {
    const r = await ipc.anthropicCollectionRemove({ sourceUrl })
    if (r.ok) set({ blogCollection: r.collection })
  },
  markBlogRead: async (args) => {
    if (get().blogCollection.read.some(r => r.sourceUrl === args.sourceUrl)) return
    const r = await ipc.anthropicCollectionMarkRead(args)
    if (r.ok) set({ blogCollection: r.collection })
  },
  removeBlogRead: async (sourceUrl) => {
    const r = await ipc.anthropicCollectionRemoveRead({ sourceUrl })
    if (r.ok) set({ blogCollection: r.collection })
  },
  openRecommendView: (batch) =>
    set({ recommendViewBatch: batch, anthropicReaderFilePath: null, anthropicReaderBody: null, anthropicReaderTitle: null, constitutionReportOpen: false }),
  closeRecommendView: () => set({ recommendViewBatch: null }),
  removeBlogBatch: async (batch) => {
    const r = await ipc.anthropicCollectionRemoveBatch({ batch })
    if (r.ok) set({ blogCollection: r.collection })
  },
  toggleBlogRead: async (args) => {
    if (get().blogCollection.read.some(r => r.sourceUrl === args.sourceUrl)) {
      await get().removeBlogRead(args.sourceUrl)
    } else {
      await get().markBlogRead(args)
    }
  },
  startBlogRecommend: async (note) => {
    if (get().recommendRunning) return
    set({ recommendRunning: true, recommendStage: 'context' })
    const trimmed = note?.trim()
    const r = await ipc.anthropicRecommendStart(trimmed || undefined)
    if (!r.ok) set({ recommendRunning: false, recommendStage: null })
  },
  cancelBlogRecommend: async () => {
    await ipc.anthropicRecommendCancel()
    set({ recommendRunning: false, recommendStage: null })
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
      localMaterials: s.localMaterials,
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
    // 存活守卫:onBack 不再中断会话,若它还在内存里(后台跑完或正在跑),
    // 只切回学习页——不能用磁盘上的旧快照覆盖 live 的 history/materials
    if (get().session?.abortId === unsaved.id) {
      set({ currentPage: 'study' })
      return
    }
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
        enableExternalMaterials: unsaved.enableExternalMaterials,
        localMaterials: unsaved.localMaterials
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

  burnLiveSession: (id) => {
    // 焚毁是唯一真正中断的路径:中止后台流并销毁存活会话
    const live = get().session
    if (live?.abortId !== id) return
    if (live.streaming) ipc.llmAbort(id)
    get().resetSession()
  },

  deleteArchivedSession: async (dirName: string, sessionNumber: number) => {
    await ipc.deleteArchivedSession({ dirName, sessionNumber })
    await get().rescanLibrary()
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
    await get().rescanLibrary()
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
    await get().rescanLibrary()
  },

  archiveTopic: async (dirName) => {
    const next = Array.from(new Set([...get().archivedTopics, dirName]))
    set({ archivedTopics: next })
    await ipc.patchState({ archivedTopics: next } as Partial<StateJson>)
    await get().rescanLibrary()
  },

  restoreTopic: async (dirName) => {
    const next = get().archivedTopics.filter(d => d !== dirName)
    set({ archivedTopics: next })
    await ipc.patchState({ archivedTopics: next } as Partial<StateJson>)
    await get().rescanLibrary()
  },

  renameTopic: async (dirName, newName) => {
    await ipc.renameTopic({ dirName, newName })
    // 迁移续谈推荐缓存键（渲染侧内存同步）
    const suggestions = { ...get().topicContinueSuggestions }
    if (suggestions[dirName] !== undefined) {
      suggestions[newName] = suggestions[dirName]
      delete suggestions[dirName]
      set({ topicContinueSuggestions: suggestions })
    }
    await get().loadGroups()
    await get().rescanLibrary()
  },

  rescanLibrary: async () => {
    const lib = await ipc.scanLibrary()
    const archived = new Set(get().archivedTopics)
    set({ library: lib.filter(t => !archived.has(t.dirName)) })
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
        bookContext: args.bookContext,
        guide: null, guideLoading: false, guideProgress: null, guideError: null,
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
    // 该文章的导读正在后台生成：保持 loading 等其回填，跳过读盘避免竞态覆盖
    if (inFlightGuides.has(s.contextId)) {
      if (!s.guideLoading) set({ assistantSession: { ...s, guideLoading: true, guideError: null } })
      return
    }
    set({ assistantSession: { ...s, guideLoading: true, guideError: null } })
    try {
      const file = await ipc.articleAssistantReadGuide({ parentPath: s.contextId, parentType: s.contextType })
      const cur = get().assistantSession
      if (!cur || cur.contextId !== s.contextId) return
      if (file?.guide && isGuideCacheCurrent(file.guideVersion)) {
        set({ assistantSession: { ...cur, guide: file.guide, guideLoading: false } })
      } else {
        set({ assistantSession: { ...cur, guideLoading: false } })
      }
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
    // 右栏折叠后对照槽不可见：挑选器一并关闭，对照模式一并退出
    // （2026-10-22 回归：折叠后 mode 仍是 companion，点文章全被路由进不可见的对照槽，"退不出来"）
    const cur = get().articlePanelMode
    const modeReset = collapsed && (cur.anthropic !== 'guide' || cur.book !== 'guide')
      ? { anthropic: 'guide' as const, book: 'guide' as const }
      : null
    set({
      articleAssistantGuideCollapsed: collapsed,
      ...(collapsed ? { writingCompanionPicker: null } : {}),
      ...(modeReset ? { articlePanelMode: modeReset } : {}),
    })
    debounceSaveGuideWidth({
      articleAssistantGuideCollapsed: collapsed,
      ...(modeReset ? { articlePanelMode: modeReset } : {}),
    })
  },
  setAssistantActiveChunk: (index) => {
    const s = get().assistantSession
    if (!s) return
    set({ assistantSession: { ...s, activeChunkIndex: index } })
  },
  setGuideScrollToChunk: (index) => {
    set({ guideScrollToChunkIndex: index })
  },
  setAssistantGuideProgress: (p) => {
    const s = get().assistantSession
    if (!s) return
    set({ assistantSession: { ...s, guideProgress: p } })
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
    if (!s || s.guide) return
    // 同一文章的生成已在后台进行：恢复 loading 显示即可，不重复发起
    if (inFlightGuides.has(s.contextId)) {
      if (!s.guideLoading) set({ assistantSession: { ...s, guideLoading: true, guideError: null } })
      return
    }
    if (s.guideLoading) return
    const { contextId, contextType } = s
    const entriesTotal = countArticleHeadings(s.articleContent)
    set({ assistantSession: { ...s, guideLoading: true, guideError: null, guideProgress: { stage: 'planning' } } })
    const run = (async () => {
      try {
        const guide = await ipc.articleAssistantGenerateGuide({
          articleContent: s.articleContent,
          articleType: s.contextType,
          articleTitle: s.articleTitle,
          entriesTotal,
          ...(s.bookContext ? { bookContext: s.bookContext } : {}),
        })
        // 无论用户是否已切到别的文章都先落盘——切回时 loadAssistantGuide 直接命中缓存
        try {
          await ipc.articleAssistantWriteGuide({ parentPath: contextId, parentType: contextType, guide })
        } catch {
          get().showToast('导读已生成但保存失败')
        }
        const cur = get().assistantSession
        if (!cur || cur.contextId !== contextId) return
        set({ assistantSession: { ...cur, guide, guideLoading: false, guideProgress: null } })
      } catch (err) {
        const raw = (err as Error & { code?: string })?.code
        const code: ArticleAssistantErrorCode = raw === 'GUIDE_JSON_ERROR' ? 'GUIDE_JSON_ERROR' : raw === 'GUIDE_ABORT' ? 'GUIDE_ABORT' : 'GUIDE_LLM_ERROR'
        const cur = get().assistantSession
        if (!cur || cur.contextId !== contextId) return
        if (code === 'GUIDE_ABORT') {
          set({ assistantSession: { ...cur, guideLoading: false, guideProgress: null } })
          return
        }
        set({ assistantSession: { ...cur, guideLoading: false, guideError: code, guideProgress: null } })
      } finally {
        inFlightGuides.delete(contextId)
      }
    })()
    inFlightGuides.set(contextId, run)
    await run
  },

  // 写作板设置持久化
  setWritingListTab: (tab) => {
    set({ writingListTab: tab })
    ipc.patchState({ writingListTab: tab } as Partial<StateJson>)
  },
  // 笔记书架
  loadNotes: async () => { set({ notesList: await ipc.notesList() }) },
  createNoteManual: async (a) => {
    const r = await ipc.notesCreate(a)
    await get().loadNotes()
    await get().selectWritingFile(r.path)
  },
  findOrCreateArticleNote: async (a) => {
    if (get().notesList === null) await get().loadNotes()
    const list = get().notesList ?? []
    // 书籍笔记没有 url（url: ''），按 url 去重会让所有书籍笔记互相命中；
    // 书籍按「同一本书 + 同一章节标题」定位，博客仍按 url 精确匹配。
    const existing = a.source === 'book'
      ? list.find(n => n.meta.source === 'book' && n.meta.book === a.book && n.meta.title === a.title)
      : list.find(n => n.meta.url === a.url)
    if (existing) return { path: existing.path, created: false }
    const r = await ipc.notesCreate({ ...a, source: a.source ?? 'anthropic' })
    await get().loadNotes()
    return { path: r.path, created: true }
  },
  updateNoteMetaAction: async (p, patch) => {
    await ipc.notesUpdateMeta({ path: p, patch })
    set(s => ({ notesList: s.notesList?.map(e => e.path === p ? { ...e, meta: { ...e.meta, ...patch } } : e) ?? null }))
  },
  deleteNoteAction: async (p) => {
    await ipc.notesDelete({ path: p })
    const cur = get().writingFile
    if (cur?.path === p) await get().selectWritingFile(null)
    await get().loadNotes()
  },
  importReadNotesAction: async () => {
    const r = await ipc.notesImportRead()
    await get().loadNotes()
    get().showToast(`导入完成：新增 ${r.created} 条，跳过 ${r.skipped} 条`)
    return r
  },
  setNotesSortBy: (s) => {
    set({ notesSortBy: s })
    void ipc.patchState({ notesSortBy: s } as Partial<StateJson>)
  },
  setNotesCategory: (c) => {
    set({ notesCategory: c })
    void ipc.patchState({ notesCategory: c } as Partial<StateJson>)
  },
  setWritingAssistantWidth: (width) => {
    const clamped = Math.max(200, Math.min(width, 1200))
    set({ writingAssistantWidth: clamped })
    debounceSaveAssistantWidth({ writingAssistantWidth: clamped })
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
  setWritingAssistantSnapshotLit: (lit) => set({ writingAssistantSnapshotLit: lit }),

  // --- 写作助手 ---
  sendWritingAssistantMessage: async (text: string) => {
    const f = get().writingFile
    const sessionId = `writing-assistant-${Date.now()}`
    const cur = get().writingAssistant
    const isFirstRun = !cur || cur.messages.length === 0
    const includeSnapshot = isFirstRun || get().writingAssistantSnapshotLit
    const messages: WritingAssistantMessage[] = [
      ...(cur?.messages ?? []),
      { role: 'user' as const, content: text, snapshot: includeSnapshot && f?.body?.trim() ? f.body : undefined },
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
    if (e.tool !== 'read_local' && e.tool !== 'web_search') return
    const msgs = s.messages.slice()
    let last = msgs[msgs.length - 1]
    // 工具调用可能发生在首段正文/思考抵达之前：先占位一条 assistant 消息，
    // 使工具活动始终可见（此前 thinking off 时工具事件会被丢弃）。
    if (!last || last.role !== 'assistant') {
      last = { role: 'assistant', content: '' }
      msgs.push(last)
    }
    const activity: WritingToolActivity = {
      tool: e.tool,
      phase: e.phase,
      ids: e.ids,
      query: e.query,
      error: e.error,
    }
    // 保留 reasoning（思考穿透工具阶段），仅追加结构化工具活动，不污染正文。
    msgs[msgs.length - 1] = {
      ...last,
      toolActivity: [...(last.toolActivity ?? []), activity],
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
          reasoning: m.reasoning,
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

  // 展开/收起持久化：写显式状态（无记录时由组件按根/深度走默认规则）
  setWritingGroupExpanded: (path, open) => {
    const next = { ...get().writingExpandedGroups, [path]: open }
    set({ writingExpandedGroups: next })
    debounceSaveExpanded({ writingExpandedGroups: next } as Partial<StateJson>)
  },

  // 新建节点落末尾：把该容器当前全部子节点（排序后）写回 order，新路径在数组末尾。
  appendWritingOrder: (dir, newPath) => {
    const tree = get().writingTree
    const cur = get().writingOrder
    const siblings = tree ? (childrenPathsOf(tree, dir, cur[dir]) ?? []) : []
    const rest = siblings.filter(p => p !== newPath)
    const next = { ...cur, [dir]: [...rest, newPath] }
    set({ writingOrder: next })
    ipc.patchState({ writingOrder: next } as Partial<StateJson>)
  },

  moveWritingNode: async ({ src, targetDir, index }) => {
    const r = await ipc.writingMove({ path: src, targetDir })
    if (!r.ok) { set({ writingError: r.message }); return }
    await get().loadWritingTree()
    if (index === null) return
    const siblings = childrenPathsOf(get().writingTree, targetDir, get().writingOrder[targetDir])
    if (!siblings) return
    const without = siblings.filter(p => p !== r.value.path)
    const clamped = Math.max(0, Math.min(index, without.length))
    const next = [...without.slice(0, clamped), r.value.path, ...without.slice(clamped)]
    const writingOrder = { ...get().writingOrder, [targetDir]: next }
    set({ writingOrder })
    ipc.patchState({ writingOrder } as Partial<StateJson>)
  },

  // 目录/文件改名后,writingOrder 与 writingExpandedGroups 中该节点及其子级路径全部做前缀改写。
  writingRenamed: (oldPath, newPath) => {
    if (oldPath === newPath) return
    const next: Record<string, string[]> = {}
    for (const [k, paths] of Object.entries(get().writingOrder)) {
      const nk = k === oldPath ? newPath : k.startsWith(oldPath + '/') ? newPath + k.slice(oldPath.length) : k
      next[nk] = paths.map(p => p === oldPath ? newPath : p.startsWith(oldPath + '/') ? newPath + p.slice(oldPath.length) : p)
    }
    const nextExp: Record<string, boolean> = {}
    for (const [k, v] of Object.entries(get().writingExpandedGroups)) {
      const nk = k === oldPath ? newPath : k.startsWith(oldPath + '/') ? newPath + k.slice(oldPath.length) : k
      nextExp[nk] = v
    }
    set({ writingOrder: next, writingExpandedGroups: nextExp })
    ipc.patchState({ writingOrder: next, writingExpandedGroups: nextExp } as Partial<StateJson>)
  },

  loadWritingTree: async () => {
    const r = await ipc.writingScanTree()
    if (r.ok) set({ writingTree: r.value })
    else set({ writingError: r.message })
  },

  setHtmlDeleteMode: (on) => set({ htmlDeleteMode: on }),
  setHtmlDeleteDirty: (dirty) => set({ htmlDeleteDirty: dirty }),
  registerHtmlDeleteFlush: (fn) => set({ htmlDeleteFlush: fn }),

  selectWritingFile: async (filePath: string | null) => {
    const seq = ++writingSelectSeq
    // HTML 删除模式有未写回删除时先 flush（退出=自动写回）；失败中止切换，避免静默丢改动
    const htmlFlush = get().htmlDeleteFlush
    if (htmlFlush && !(await htmlFlush())) return
    if (!filePath) return set({ writingFile: null })
    // lastWritingFile 跨重启持久化(2026-09-22:此前只在内存 set 不落盘,
    // setLastWritingFile 无调用方,「恢复上次打开的文章」永远无法生效)
    void ipc.patchState({ lastWritingFile: filePath } as Partial<StateJson>)
    const cur = get().writingFile
    if (cur?.dirty) await get().saveWritingFile()
    // 对照槽 dirty 先存（不依赖 writingFile，须在主文切换前完成）
    if (get().companionFile?.dirty) await get().saveCompanionFile()
    if (seq !== writingSelectSeq) return
    // 恢复对照文映射：必须在 writingFile set 之后调用。若在主文切换前调
    // selectCompanionFile，其"同文拒绝"会拿尚未切换的旧主文做判断（旧主文恰为映射
    // 值时被误拒），写映射键也错位——这是切主文恢复对照文时序 bug 的根因。
    const restoreCompanion = async () => {
      if (get().writingPanelMode !== 'companion') return
      const mapped = get().writingCompanionMap[filePath]
      if (mapped && mapped !== filePath) await get().selectCompanionFile(mapped)
      else set({ companionFile: null })
    }
    const kind = writingPreviewKindOf(filePath)
    // 非 md 文件没有编辑器/助手会话，读取失败时展示 previewError 而非整页错误
    if (kind !== 'md') {
      const r = await ipc.writingReadPreview({ path: filePath })
      if (seq !== writingSelectSeq) return // 更新的选中已发出，丢弃过期结果
      if (r.ok) {
        set({
          writingFile: {
            path: filePath,
            body: r.value.content ?? '',
            kind: r.value.kind,
            truncated: r.value.truncated,
            dirty: false,
            saving: 'idle',
          },
          lastWritingFile: filePath,
        })
      } else {
        // previewError 存类型化错误码（组件据此分支：PDF_NO_TEXT 专门提示 / 其余通用文案）
        set({ writingFile: { path: filePath, body: '', kind, dirty: false, saving: 'idle', previewError: r.code }, lastWritingFile: filePath })
      }
      await restoreCompanion()
      return
    }
    const r = await ipc.writingRead({ path: filePath })
    if (seq !== writingSelectSeq) return // 更新的选中已发出，丢弃过期结果
    if (r.ok) {
      set({ writingFile: { path: filePath, body: r.value.body ?? '', kind: 'md', dirty: false, saving: 'idle' }, lastWritingFile: filePath })
      await restoreCompanion()
      // 切换文章时重置快照点亮状态，避免把上一篇文章的挂快照意图带到新文章
      if (cur?.path !== filePath) set({ writingAssistantSnapshotLit: false })
      // 切换文章时重置并恢复该文章的助手会话：防止旧文章消息串台写入新文章的
      // .assistant.md，并让已保存的对话跨重启/跨切换恢复（此前 load 无调用方）。
      const wa = get().writingAssistant
      if (wa && wa.articlePath !== filePath) {
        if (wa.streaming) ipc.writingAssistantAbort({ sessionId: wa.sessionId })
        resetAssistantStreamBuffers()
        set({ writingAssistant: null })
      }
      if (!get().writingAssistant) await get().loadWritingAssistantSession(filePath)
    } else {
      set({ writingError: r.message })
    }
  },

  closeNoteToWall: async () => {
    const current = get().writingFile
    if (!current) return
    if (current.dirty) await get().saveWritingFile()
    await get().selectWritingFile(null)
    if (current.path.startsWith('notes/') && get().lastWritingFile === current.path) {
      set({ lastWritingFile: null })
      void ipc.patchState({ lastWritingFile: null } as Partial<StateJson>)
    }
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

  setWritingPanelMode: (mode) => {
    set({ writingPanelMode: mode })
    ipc.patchState({ writingPanelMode: mode } as Partial<StateJson>)
  },

  selectCompanionFile: async (path: string) => {
    const seq = ++companionSelectSeq
    if (path === get().writingFile?.path) {
      get().showToast('该文章已在主编辑区打开')
      return
    }
    if (get().companionFile?.dirty) await get().saveCompanionFile()
    if (seq !== companionSelectSeq) return
    // 写映射：主文路径 → 对照文路径（无主文时 skip，映射以主文为键）
    const main = get().writingFile?.path
    if (main) {
      const map = { ...get().writingCompanionMap, [main]: path }
      set({ writingCompanionMap: map })
      ipc.patchState({ writingCompanionMap: map } as Partial<StateJson>)
    }
    const kind = writingPreviewKindOf(path)
    // 非 md 文件沿用 previewError 路径（照抄 selectWritingFile 分流）
    if (kind !== 'md') {
      const r = await ipc.writingReadPreview({ path })
      if (seq !== companionSelectSeq) return // 更新的选中已发出，丢弃过期结果
      if (r.ok) {
        set({
          companionFile: {
            path,
            body: r.value.content ?? '',
            kind: r.value.kind,
            truncated: r.value.truncated,
            dirty: false,
            saving: 'idle',
          },
        })
      } else {
        set({ companionFile: { path, body: '', kind, dirty: false, saving: 'idle', previewError: r.code } })
      }
      return
    }
    const r = await ipc.writingRead({ path })
    if (seq !== companionSelectSeq) return // 更新的选中已发出，丢弃过期结果
    if (r.ok) {
      set({ companionFile: { path, body: r.value.body ?? '', kind: 'md', dirty: false, saving: 'idle' } })
    } else {
      // 读取失败（如文件被外部删除）：清映射 + toast + 对照槽回空态
      if (main) {
        const map = { ...get().writingCompanionMap }
        delete map[main]
        set({ writingCompanionMap: map, companionFile: null })
        ipc.patchState({ writingCompanionMap: map } as Partial<StateJson>)
      } else {
        set({ companionFile: null })
      }
      get().showToast('对照文读取失败')
    }
  },

  updateCompanionBody: (body: string) => set(s => s.companionFile ? { companionFile: { ...s.companionFile, body, dirty: true } } : {}),

  saveCompanionFile: async () => {
    const f = get().companionFile
    if (!f || !f.dirty) return
    set({ companionFile: { ...f, saving: 'saving' as const } })
    const r = await ipc.writingWrite({ path: f.path, body: f.body })
    const cur = get().companionFile
    if (!cur || cur.path !== f.path) return // 保存期间文件已切换/关闭，丢弃过期结果
    set({ companionFile: { ...cur, dirty: !r.ok, saving: r.ok ? 'saved' as const : 'error' as const } })
  },

  closeCompanion: async () => {
    if (get().companionFile?.dirty) await get().saveCompanionFile()
    set({ companionFile: null })
    get().setWritingPanelMode('assistant') // 映射保留（v1 不做显式清除）
  },

  setArticlePanelMode: (source, mode) => {
    const next = { ...get().articlePanelMode, [source]: mode }
    // 切回导读 tab 后挑选器失去语境，一并关闭
    set({ articlePanelMode: next, ...(mode === 'guide' ? { writingCompanionPicker: null } : {}) })
    ipc.patchState({ articlePanelMode: next } as Partial<StateJson>)
    if (source === 'book' && mode === 'companion') {
      // 章节切换/重进时恢复该书章节最近一次的对照文；无映射则清掉上一章的旧对照
      const chapterPath = get().activeChapter?.path
      const mapped = chapterPath ? get().articleCompanionMap[chapterPath] : undefined
      if (chapterPath && mapped && get().articleCompanion?.key !== chapterPath) {
        void get().selectArticleCompanion('book', chapterPath, mapped)
      } else if (chapterPath && !mapped && get().articleCompanion && get().articleCompanion!.key !== chapterPath) {
        set({ articleCompanion: null })
      }
    }
  },

  openWritingCompanionPicker: (source) => set({ writingCompanionPicker: source }),
  closeWritingCompanionPicker: () => set({ writingCompanionPicker: null }),

  selectArticleCompanion: async (_source, mainKey, filePath, opts) => {
    const seq = ++articleCompanionSelectSeq
    if (get().articleCompanion?.dirty) await get().saveArticleCompanion()
    if (seq !== articleCompanionSelectSeq) return // 更新的选中已发出，丢弃过期结果
    const map = { ...get().articleCompanionMap, [mainKey]: filePath }
    set({ articleCompanionMap: map })
    ipc.patchState({ articleCompanionMap: map } as Partial<StateJson>)
    const kind: 'md' | 'html' | 'other' = filePath.toLowerCase().endsWith('.md') ? 'md' : filePath.toLowerCase().endsWith('.html') ? 'html' : 'other'
    const readonly = opts?.readonly === true || kind === 'html'
    try {
      // 写作树相对路径走写作专属 IPC：readMd/writeArticleBody 按进程 cwd 解析相对路径
      // 且写白名单只含博客目录，相对路径会直接被拒（「对照文读取失败」根因）
      let body: string
      if (isWritingTreePath(filePath)) {
        if (kind === 'md') {
          const r = await ipc.writingRead({ path: filePath })
          if (!r.ok) throw new Error(r.code)
          body = r.value.body ?? ''
        } else {
          const r = await ipc.writingReadPreview({ path: filePath })
          if (!r.ok) throw new Error(r.code)
          body = r.value.content ?? ''
        }
      } else {
        const r = await ipc.readMd(filePath) // { frontmatter, body }
        body = r.body ?? ''
      }
      if (seq !== articleCompanionSelectSeq) return // 更新的选中已发出，丢弃过期结果
      set({ articleCompanion: { key: mainKey, filePath, kind, body, readonly, dirty: false, saving: 'idle' }, lastArticleCompanion: { mainKey, filePath } })
      void ipc.patchState({ lastArticleCompanion: { mainKey, filePath } } as Partial<StateJson>)
    } catch {
      if (seq !== articleCompanionSelectSeq) return // 更新的选中已发出，丢弃过期结果
      // 读取失败（如文件被外部删除）：清映射 + toast + 对照槽回空态；
      // 恢复记录(lastArticleCompanion)若指向同一 mainKey 一并清掉,避免重启反复重试
      const cleanMap = { ...get().articleCompanionMap }
      delete cleanMap[mainKey]
      const clearLac = get().lastArticleCompanion?.mainKey === mainKey
      set({ articleCompanionMap: cleanMap, articleCompanion: null, ...(clearLac ? { lastArticleCompanion: null } : {}) })
      ipc.patchState({ articleCompanionMap: cleanMap, ...(clearLac ? { lastArticleCompanion: null } : {}) } as Partial<StateJson>)
      get().showToast('对照文读取失败')
    }
  },

  updateArticleCompanionBody: (body: string) => set(s => s.articleCompanion ? { articleCompanion: { ...s.articleCompanion, body, dirty: true } } : {}),

  saveArticleCompanion: async () => {
    const f = get().articleCompanion
    if (!f || !f.dirty || f.readonly) return
    set({ articleCompanion: { ...f, saving: 'saving' as const } })
    // 写作树相对路径走 writingWrite（写白名单不含博客通道的 ALLOWED_DIRS 之外目录）
    const r = isWritingTreePath(f.filePath)
      ? await ipc.writingWrite({ path: f.filePath, body: f.body })
      : await ipc.anthropicWriteArticleBody({ filePath: f.filePath, body: f.body })
    const cur = get().articleCompanion
    if (!cur || cur.filePath !== f.filePath) return // 保存期间文件已切换/关闭，丢弃过期结果
    set({ articleCompanion: { ...cur, dirty: !r.ok, saving: r.ok ? 'saved' as const : 'error' as const } })
  },

  closeArticleCompanion: async () => {
    if (get().articleCompanion?.dirty) await get().saveArticleCompanion()
    // ✕ 关闭 = 明确不再对照:清恢复记录,重启不会被重新拉开(2026-09-29 spec)
    set({ articleCompanion: null, lastArticleCompanion: null })
    void ipc.patchState({ lastArticleCompanion: null } as Partial<StateJson>)
  },

  saveAllDirtyWriting: async () => {
    const tasks: Promise<void>[] = []
    if (get().writingFile?.dirty) tasks.push(get().saveWritingFile())
    if (get().companionFile?.dirty) tasks.push(get().saveCompanionFile())
    await Promise.all(tasks)
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
