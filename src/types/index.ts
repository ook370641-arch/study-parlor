import type { AppConfig } from '@electron/env'

export type Difficulty = 'high' | 'mid' | 'low'
export type Mode = 'progress' | 'review'
export type Temperature = number
export type Terminology = {
  // 仪式动词
  sessionName?: string
  libraryName?: string
  archiveVerb?: string
  transcriptName?: string
  burnVerb?: string
  newTopicLabel?: string
  continuePrompt?: string
  unsavedSessionLabel?: string

  // 模式与流程
  modeProgress?: string
  modeReview?: string
  newTopicMode?: string
  existingTopicMode?: string
  archiveConfirmTitle?: string
  archiveDismiss?: string
  archiveConfirm?: string

  // 参数标签
  difficultyLabel?: string
  temperatureLabel?: string
  difficultyHigh?: string
  difficultyMid?: string
  difficultyLow?: string
  temperatureCold?: string
  temperatureNeutral?: string
  temperatureWarm?: string

  // 界面名词
  profileNameLabel?: string
  profileFieldLabel?: string
  profileTextLabel?: string
  topicInputLabel?: string
  subTopicLabel?: string
  continueDirectionLabel?: string
  requirementLabel?: string
  homeGreeting?: string
  startButton?: string
  cancelButton?: string
}
export type AnthropicSectionKey = 'engineering' | 'research' | 'alignment' | 'interpretability' | 'product' | 'institute'
export type AnthropicArticleMeta = {
  url: string
  title: string
  summary: string | null
  publishedAt: string | null
  imageUrl: string | null
  isSaved?: boolean
  filePath?: string
  /** 本地内置条目（非网络抓取），如 'constitution' 宪法可视化报告 */
  local?: 'constitution'
  /** 栏目标识；旧缓存/旧数据缺失时视为 'engineering'（见 sectionOf/sectionForUrl 回退） */
  section?: AnthropicSectionKey
}

export type AnthropicErrorCode =
  | 'browser-init-failed'
  | 'network-error'
  | 'http-error'
  | 'parse-error'
  | 'import-failed'
  | 'cancelled'
  | 'unknown'

export type AnthropicError = {
  code: AnthropicErrorCode
  message: string
}

export type AnthropicSectionStatus = {
  fetchedAt: string | null
  error: AnthropicError | null
}

export type AnthropicBlogCache = {
  lastFetchedAt: string | null
  articles: AnthropicArticleMeta[]
  loading: boolean
  error: AnthropicError | null
  /** 各栏目抓取状态；旧 state.json 无此字段，缺省 {} */
  sectionStatus?: Partial<Record<AnthropicSectionKey, AnthropicSectionStatus>>
  /** sitemap 老文章逐页回填的元数据缓存（key=规范化 URL）；旧 state.json 无此字段，缺省 {}。title 可空（回填写入先于 title 过滤） */
  articleMetaCache?: Record<string, { title: string | null; publishedAt: string | null; summary: string | null; imageUrl: string | null }>
}

/** 收藏夹条目来源：recommend=推荐自动入夹，manual=手动 ☆ */
export type BlogCollectionOrigin = 'recommend' | 'manual'

/** 推荐批次内单篇挑选快照（历史卡片逐篇挂钩用） */
export type BlogRecommendPick = {
  sourceUrl: string
  title: string
  filePath: string   // 与收藏夹条目同格式（推荐流程存 absPath）
  reason: string
  gap: string
  guide?: string      // 导读摘要（pick v2 prompt 起）；旧批次无此字段
}

/** 已读文章条目（所有已读文章，不限收藏夹内） */
export type BlogReadEntry = {
  sourceUrl: string   // 主键
  title: string
  filePath: string
  readAt: string      // ISO，首次标记时间
}
/** 笔记来源 */
export type NoteSource = 'anthropic' | 'hermes' | 'manual'

/** 笔记元数据（notes/*.md 的 frontmatter） */
export type NoteMeta = {
  title: string
  url: string
  source: NoteSource
  rating: number        // 0-5，0=未评
  summary: string
  highlight: string
  collected_at: string  // ISO
  read_at?: string      // ISO，可空
}

/** 笔记书架条目；path 为库内相对路径（正斜杠），如 notes/foo.md */
export type NoteEntry = { path: string; meta: NoteMeta; parseError?: boolean }

export type BlogCollectionEntry = {
  sourceUrl: string   // 主键（去重依据）
  filePath: string    // 文件路径（推荐流程与手动收藏均存绝对路径）
  title: string
  addedAt: string     // ISO
  origin: BlogCollectionOrigin
  reason?: string     // 推荐理由（仅 recommend）
  gap?: string        // 补上的认知缺口（仅 recommend）
  batch?: number      // 批次号（仅 recommend）
  guide?: string      // 导读摘要（仅 recommend）
}

export type BlogRecommendBatch = {
  batch: number
  generatedAt: string
  profile: string      // 用户画像（阶段一 LLM 输出）
  gaps: string[]       // 认知缺口
  queries: string[]    // 本次检索词
  searchUsed: boolean  // Tavily 是否可用（false = 降级纯本地匹配）
  focus?: string              // 核心需求方向一句话（v2 prompt 起）；旧批次无此字段
  picks?: BlogRecommendPick[] // 本批挑选快照；旧批次无此字段
}

export type BlogCollectionFile = {
  version: 1
  entries: BlogCollectionEntry[]
  dismissed: string[]      // 用户移除过的推荐 sourceUrl，后续批次不再推荐
  history: BlogRecommendBatch[]  // 往期推荐历史（含用户画像），最新在前
  read: BlogReadEntry[]    // 已读文章，最新在前；后续批次不再推荐
}

export type BlogRecommendErrorCode =
  | 'NO_WRITING_CONTEXT'
  | 'NO_LOCAL_ARTICLES'
  | 'LLM_ERROR'
  | 'LLM_PARSE_ERROR'
  | 'ABORTED'

export type RecommendStage = 'context' | 'profile' | 'search' | 'pick'

export type RecommendDonePayload =
  | { ok: true; collection: BlogCollectionFile }
  | { ok: false; code: BlogRecommendErrorCode }

export type ArticleAssistantTerm = {
  term: string
  translation: string
  explanation: string
}

export type ArticleAssistantChunk = {
  heading: string
  /** v1 摘要式导读；v2 起由 context 取代（仅旧 digest 缓存产出），非 digest 类型仍是 summary */
  summary?: string
  /** v2 背景铺陈，仅旧 digest 链路产出 */
  context?: string
  terms: ArticleAssistantTerm[]
}

export type ArticleAssistantGuide = {
  background: string
  chunks: ArticleAssistantChunk[]
}

/** 导读 v2 生成进度（主进程 articleAssistant:guideProgress 事件负载） */
export type GuideProgress =
  | { stage: 'planning' }
  | { stage: 'searching'; done: number; total: number }
  | { stage: 'writing'; chars: number; entriesDone: number; entriesTotal: number }

export type ArticleAssistantMessage = {
  role: 'user' | 'assistant'
  content: string
  searchSources?: { title: string; url: string; snippet: string }[]
  selection?: string
  reasoning?: string
  snapshot?: string
}

export type ArticleAssistantSessionFile = {
  filePath: string
  messages: ArticleAssistantMessage[]
  createdAt: string
  updatedAt: string
}

export type ArticleChunk = {
  heading: string
  body: string
  startIndex: number
}

export type ArticleAssistantGuideFile = {
  filePath: string
  guide: ArticleAssistantGuide
  generatedAt: string
  /** 导读格式版本；缺失视为 1（摘要式） */
  guideVersion?: number
}

export type AssistantThinkingEffort = 'off' | 'high' | 'max'

export type ArticleAssistantErrorCode =
  | 'GUIDE_LLM_ERROR'
  | 'GUIDE_JSON_ERROR'
  | 'GUIDE_ABORT'
  | 'CHAT_LLM_ERROR'
  | 'CHAT_NETWORK_ERROR'
  | 'CHAT_TIMEOUT'
  | 'CHAT_EMPTY_REPLY'
  | 'SAVE_ERROR'

export type ArticleAnnotation = {
  id: string
  selectedText: string
  note: string
  paragraphIndex: number
  createdAt: string
  updatedAt: string
}

export type DocType = 'progress' | 'review' | 'fable' | 'transcript' | 'external-materials' | 'anthropic-article' | 'article-assistant' | 'writing'

export type Profile = {
  name: string
  profile_text: string
  preferred_topics: string[]
}

export type Frontmatter = {
  title: string
  description?: string
  created: string
  created_at?: string
  updated_at?: string
  last_studied?: string
  last_reviewed?: string
  review_count: number
  difficulty: Difficulty
  tags: string[]
  session_number?: number
  type?: DocType
  progress_summary?: string
  summary?: string
  sources?: SearchSource[]
  topic?: string
  source_url?: string
  source_name?: string
  published_at?: string
  imported_at?: string
  authors?: string[]
  /** Anthropic 博客栏目；旧文章缺省视为 'engineering' */
  section?: string
  parent_path?: string
  parent_type?: 'anthropic-article' | 'writing'
  generated_at?: string
  guide_version?: number
  role_keywords?: string[]
  cities?: string[]
  companies?: string[]
}

export type Group = {
  id: string
  name: string
  color: string
}

export type GroupMapping = Record<string, string>  // dirName → groupId

export type SessionMeta = {
  sessionNumber: number
  date: string
  title?: string
  hasReport: boolean
  hasTranscript: boolean
  hasReview: boolean
  hasFable: boolean
  fableCount: number
  hasDiagram: boolean
  reportFile?: string
  transcriptFile?: string
  reviewFile?: string
  fableFile?: string
  diagramFile?: string
}

export type TopicMeta = {
  dirName: string
  title: string
  sessionCount: number
  sessions: SessionMeta[]
  last_studied: string
  last_studied_days: number
  groupId: string
  pendingReport?: ArchiveResult
}

export type RecCard = {
  type: 'continue' | 'review'
  dirName: string
  title: string
}

export type NewTopic = { topic: string; hook: string }

export type ContinueTopicSuggestion = {
  title: string
  context: string
  rationale: string
  benefit: string
}

export type TopicContinueCache = {
  generatedAt: string
  sessionCount: number
  suggestions: ContinueTopicSuggestion[]
}

export type UnsavedSession = {
  id: string
  mode: Mode
  topic: string
  dirName?: string
  file_path?: string
  difficulty: Difficulty
  temperature: number
  history: Message[]
  userRequirement?: string
  selectedTopic?: string
  enableExternalMaterials?: boolean
  externalMaterials?: SearchResult
}

export type ArchiveResult = {
  mode: Mode
  topic: string
  title: string
  content: string  // progress: body; review: summary + gaps rendered
}

export type SearchSource = {
  title: string
  url: string
  snippet?: string
}

export type SearchResult = {
  summary: string
  sources: SearchSource[]
}

export type SearchErrorCode =
  | 'MISSING_API_KEY'
  | 'NETWORK_ERROR'
  | 'LLM_ERROR'
  | 'NO_RESULTS'

export type BriefingTheme = 'academic' | 'newspaper'

export type BriefingFontSize =
  | 'sm'
  | 'base'
  | 'lg'
  | 'xl'
  | '2xl'
  | '3xl'
  | '4xl'
  | '5xl'
  | '6xl'
  | '7xl'

export type WritingRoot = 'writing' | 'repository'
export type WritingErrorCode = 'WRITING_IO_ERROR' | 'WRITING_PATH_FORBIDDEN' | 'WRITING_NOT_FOUND' | 'WRITING_NAME_CONFLICT' | 'PREVIEW_PARSE_ERROR' | 'PDF_NO_TEXT'

// ── 非 markdown 文件预览支持（writing 树中放置并阅读 xlsx/pdf/docx/html）──
// html 为原文透传（渲染侧 iframe srcdoc），不经文本提取器
export const NON_MD_EXTENSIONS = ['xlsx', 'pdf', 'docx', 'html'] as const
export type NonMdKind = (typeof NON_MD_EXTENSIONS)[number]
export type WritingPreviewKind = 'md' | NonMdKind
export type WritingPreviewResult = {
  kind: NonMdKind
  title: string
  content: string
  truncated: boolean
}
export function isNonMdExt(ext: string): ext is NonMdKind {
  return (NON_MD_EXTENSIONS as readonly string[]).includes(ext.toLowerCase())
}

export type WritingResult<T> = { ok: true; value: T } | { ok: false; code: WritingErrorCode; message: string }
export type WritingTreeNode = {
  name: string
  path: string
  kind: 'dir' | 'file'
  children?: WritingTreeNode[]
  /** @deprecated 摘要不再附到树节点（见 writing:refreshCatalog diff 触发）；保留字段避免级联改动 */
  summary?: string
  /** @deprecated 同上 */
  catalogUpdatedAt?: string
}
export type WritingTone = 'parchment' | 'plain' | 'ink'
export type WritingSourceType = 'study' | 'blog' | 'repository' | 'writing' | 'web' | 'group'
export type WritingSource = { type: WritingSourceType; id: string; label: string }
export type WritingAssistantMessage = {
  role: 'user' | 'assistant'
  content: string
  reasoning?: string
  sources?: WritingSource[]
  snapshot?: string
  toolActivity?: WritingToolActivity[]
}
export type WritingToolEvent = {
  sessionId: string
  phase: 'start' | 'done' | 'error'
  tool: 'read_local' | 'web_search'
  ids?: string[]
  query?: string
  error?: string
}
/** 写作助手工具调用的结构化活动记录（渲染成紧凑、可折叠的工具行，而非注入正文）。 */
export type WritingToolActivity = {
  tool: 'read_local' | 'web_search'
  phase: 'start' | 'done' | 'error'
  ids?: string[]
  query?: string
  error?: string
}
export type WritingCatalogEntry = { title: string; summary: string; updatedAt?: string; mtimeMs?: number }
export type WritingGroupSummaryEntry = { summary: string; signature: string }
// stamped: 已确认含 created frontmatter 的文件 → 当时 mtimeMs（repository 扫描补 created 的台账，
// 命中即跳过 readFileSync；文件变动后 mtime 变化自然失效）。仅 repository root 使用。
export type WritingCatalog = { version: 2; entries: Record<string, WritingCatalogEntry>; groups: Record<string, WritingGroupSummaryEntry>; stamped: Record<string, number> }

export type Message = { role: 'system' | 'user' | 'assistant'; content: string }

export type BriefingSourceId = 'writing' | 'anthropic' | 'fitness'

export type FitnessSet = { weight: number; reps: number }
export type FitnessExercise = { id: string; name: string; sets: number }
export type FitnessRoutine = { id: string; name: string; exercises: FitnessExercise[] }
export type FitnessScheduleEntry = { weekday: number; routineId: string }
export type FitnessRecordEntry = { exerciseId: string; name: string; sets: FitnessSet[] }
export type FitnessRecord = { id: string; date: string; routineId: string; entries: FitnessRecordEntry[] }
export type BodyMetric = {
  date: string
  weight?: number; chest?: number; waist?: number; hip?: number; arm?: number; thigh?: number
}
export type FitnessData = {
  version: 1
  routines: FitnessRoutine[]
  schedule: FitnessScheduleEntry[]
  records: FitnessRecord[]
  bodyMetrics: BodyMetric[]
}

export type LlmConfig = { id: string; apiKey: string; baseUrl: string; model: string }

/** 浏览位置槽位:某文档(filePath)的首可见块索引(粗粒度,见 src/lib/scroll-memory.ts) */
export interface ScrollMemorySlot {
  filePath: string
  blockIndex: number
}

export type StateJson = {
  version: 1
  profile: Profile
  lastUsed: { difficulty: Difficulty; temperature: Temperature }
  groupInspirations: Record<string, NewTopic>
  wildcardInspiration?: NewTopic
  ui: { session_count: number }
  inspirationStrategy: 'v1' | 'v2' | 'v3'
  fableStyleTags: string[]
  lastFableTags: string[]
  topicContinueSuggestions: Record<string, TopicContinueCache>
  terminology?: Terminology
  briefingTheme?: BriefingTheme
  briefingFontSize?: BriefingFontSize
  studyFontSize?: BriefingFontSize
  briefingSource?: BriefingSourceId
  anthropicBlogCache?: AnthropicBlogCache
  anthropicBlogLastSeenAt?: string | null
  articleAssistantGuideWidth?: number
  articleAssistantGuideCollapsed?: boolean
  assistantSearchEnabled?: boolean
  assistantSocraticMode?: boolean
  assistantThinkingEffort?: AssistantThinkingEffort
  writingFontSize?: BriefingFontSize
  writingTone?: WritingTone
  writingListTab?: 'articles' | 'repository'
  writingAssistantWidth?: number
  writingAssistantOpen?: boolean
  lastWritingFile?: string | null
  /** 博客最后阅读的文章 filePath(进入博客面板即恢复) */
  lastAnthropicReaderFile?: string | null
  /** 四个浏览位置槽位(2026-10-03 用户指令:只记最后的写作/博客/二者对照,
   *  其他文章不记位置);恢复时校验 filePath 与当前文档一致才生效 */
  writingScrollMemory?: ScrollMemorySlot | null
  anthropicScrollMemory?: ScrollMemorySlot | null
  writingCompanionScrollMemory?: ScrollMemorySlot | null
  writingOrder?: Record<string, string[]>
  writingExpandedGroups?: Record<string, boolean>
  writingUIFontSize?: BriefingFontSize
  /** 各写作文件的折叠代码块 hash 多重集合(filePath → codeblockHash 列表) */
  writingCodeblockCollapsed?: Record<string, string[]>
  candlelightEnabled?: boolean
  paintingPlateEnabled?: boolean
  /** 已归档（隐藏）的主题目录名，主页/卫星图不显示，可在设置恢复 */
  archivedTopics?: string[]
  /** 从抽取池隐藏的画作 id（封面删除按钮写入；物理文件不动，打包后 asar 只读） */
  hiddenPaintings?: string[]
  /** 封面是否显示画作删除按钮（设置页开关） */
  paintingDeleteEnabled?: boolean
  /** 封面记事板内容（随手记录迭代想法） */
  coverNotepad?: string
  /** LLM 多配置：首条由 .env 迁移播种；切换免重启 */
  llmConfigs?: LlmConfig[]
  activeLlmConfigId?: string | null
  writingPanelMode?: 'assistant' | 'companion'
  writingCompanionMap?: Record<string, string>
  articlePanelMode?: Record<'anthropic', 'guide' | 'companion'>
  articleCompanionMap?: Record<string, string>
  /** 博客对照槽最后打开的对照文(✕关闭时清 null,重开应用按此恢复) */
  lastArticleCompanion?: { mainKey: string; filePath: string } | null
  articleCompanionScrollMemory?: ScrollMemorySlot | null
}

export type IpcApi = {
  scanLibrary: () => Promise<TopicMeta[]>
  readMd: (path: string) => Promise<{ frontmatter: Frontmatter; body: string }>
  readAssetAsDataUrl: (mdFilePath: string, relativePath: string) => Promise<string>
  writeProgressMd: (args: { title: string; description?: string; body: string; difficulty: Difficulty; dirName: string; session_number: number; progress_summary?: string }) => Promise<{ file_path: string }>
  getState: () => Promise<StateJson>
  patchState: (patch: Partial<StateJson>) => Promise<void>
  /** 同步落盘(sendSync):仅退出路径(beforeunload)使用,保证渲染进程卸载前必达主进程 */
  patchStateSync: (patch: Partial<StateJson>) => void
  fitnessLoad: () => Promise<FitnessData>
  fitnessSaveRecord: (r: FitnessRecord) => Promise<FitnessData>
  fitnessDeleteRecord: (id: string) => Promise<FitnessData>
  fitnessSaveBodyMetric: (m: BodyMetric) => Promise<FitnessData>
  fitnessDeleteBodyMetric: (date: string) => Promise<FitnessData>
  fitnessSavePlan: (p: { routines: FitnessRoutine[]; schedule: FitnessScheduleEntry[] }) => Promise<FitnessData>
  llmProbe: () => Promise<{ ok: boolean; reason?: string }>
  llmStart: (args: { sessionId: string; mode: Mode; difficulty: Difficulty; profile: Profile; reviewFileBody?: string; progressSummary?: string; history: Message[]; temperature: number; selectedTopic?: string; userRequirement?: string; externalMaterialsSummary?: string }) => Promise<void>
  llmAbort: (sessionId: string) => Promise<void>
  llmFinalizeProgress: (history: Message[]) => Promise<{ title: string; description?: string; body: string; progress_summary?: string }>
  llmFinalizeReview: (args: { history: Message[]; existingBody: string }) => Promise<{ summary: string; gaps: string[]; mastery_assessment?: string; mastery_checklist?: string[]; future_advice?: string[] }>
  llmGenerateFable: (args: { history: Message[]; topic: string }) => Promise<{ title: string; body: string }>
  llmGroupInspiration: (args: {
    groupName: string
    topics: { dirName: string; title: string }[]
    profile: Profile
    strategy?: 'v1' | 'v2' | 'v3'
  }) => Promise<NewTopic>
  llmWildcardInspiration: (args: {
    profile: Profile
    topics: { title: string }[]
  }) => Promise<NewTopic>
  llmGenerateFableFromReport: (args: {
    reportBody: string
    topic: string
    userPrompt?: string
  }) => Promise<{ title: string; body: string }>
  llmGenerateContinueSuggestions: (args: {
    topic: string
    dirName: string
  }) => Promise<ContinueTopicSuggestion[]>
  llmGenerateDiagram: (args: {
    dirName: string
    sessionNumber: number
    reportBody: string
  }) => Promise<void>
  onLlmChunk: (cb: (sessionId: string, text: string) => void) => () => void
  onLlmDone: (cb: (sessionId: string) => void) => () => void
  onLlmError: (cb: (sessionId: string, err: { code: string; message: string }) => void) => () => void
  onArticleAssistantSearchDone: (cb: (sessionId: string, payload: { searchSources?: { title: string; url: string; snippet: string }[]; searchError?: 'NO_RESULTS' | 'SEARCH_ERROR' }) => void) => () => void
  onArticleAssistantGuideProgress: (cb: (payload: GuideProgress) => void) => () => void
  onArticleAssistantReasoningChunk: (cb: (sessionId: string, text: string) => void) => () => void
  bootFatal: () => Promise<string | null>
  bootStart: () => Promise<{ alreadyCompleted: boolean }>
  onBootProgress: (cb: (stage: string, progress: number) => void) => () => void
  onBootComplete: (cb: () => void) => () => void

  // Session persistence (stubs until main handlers implemented)
  loadSessions: () => Promise<UnsavedSession[]>
  saveSession: (s: UnsavedSession) => Promise<void>
  deleteSession: (id: string) => Promise<void>

  // Anchor file reading (stub until main handler implemented)
  readAnchorFile: (dirName: string) => Promise<{ frontmatter: Frontmatter; body: string }>

  // Review report writing (stub until main handler implemented)
  writeReviewReport: (args: { topic: string; dirName: string; summary: string; gaps: string[]; review_index: number; mastery_checklist?: string[]; future_advice?: string[] }) => Promise<void>
  writeFable: (args: { dirName: string; sessionNumber: number; title: string; body: string }) => Promise<void>

  // Session file operations
  writeTranscript: (args: { dirName: string; sessionNumber: number; content: string }) => Promise<void>
  readSessionFile: (args: { dirName: string; sessionNumber: number; fileName: string }) => Promise<{ content: string; mimeType?: string }>

  // Group management
  loadGroups: () => Promise<{ groups: Group[]; mapping: GroupMapping }>
  updateGroupMapping: (mapping: GroupMapping) => Promise<void>
  createGroup: (name: string, color: string) => Promise<Group>
  renameGroup: (id: string, name: string) => Promise<void>
  deleteGroup: (id: string, fallbackId: string) => Promise<void>
  deleteArchivedSession: (args: {
    dirName: string
    sessionNumber: number
  }) => Promise<void>
  renameTopic: (args: { dirName: string; newName: string }) => Promise<void>

  // Recovery dump
  recoveryDump: (args: { filename: string; content: string }) => Promise<void>

  // External materials
  readExternalMaterials: (dirName: string) => Promise<{ summary: string; sources: SearchSource[]; topic?: string } | null>
  writeExternalMaterials: (args: {
    dirName: string
    sessionNumber: number
    topic: string
    summary: string
    sources: SearchSource[]
  }) => Promise<void>

  // Search
  searchPrepare: (args: { topic: string }) => Promise<SearchResult>
  searchCheckConfig: () => Promise<{ configured: boolean }>
  setSearchApiKey: (key: string) => Promise<void>

  // Extension info
  getExtensionInfo: () => Promise<{ libraryPath: string; paintingCount: number }>

  // Config
  getConfig: () => Promise<AppConfig>
  llmConfigList: () => Promise<{ configs: LlmConfig[]; activeId: string }>
  llmConfigSetActive: (id: string) => Promise<{ ok: true } | { ok: false; code: string }>
  llmConfigSave: (id: string | null, fields: { apiKey: string; baseUrl: string; model: string }) => Promise<{ ok: true; id: string } | { ok: false; code: string }>
  configSetLibraryPath: (path: string) => Promise<{ ok: true }>

  // Setup wizard
  bootNeedsSetup: () => Promise<boolean>
  setupSelectDirectory: () => Promise<{ canceled: boolean; path: string | null }>
  setupProbeKey: (args: { apiKey: string; baseUrl?: string; model?: string }) => Promise<{ ok: boolean; reason?: string }>
  setupWriteConfig: (args: {
    apiKey: string
    baseUrl: string
    model: string
    libraryPath: string
    name: string
    profile_text?: string
    preferred_topics?: string[]
  }) => Promise<void>
  onSetupDone: (cb: () => void) => () => void

  // Anthropic blog
  anthropicDiscover: () => Promise<
    | { ok: true; lastFetchedAt: string; articles: AnthropicArticleMeta[]; sectionStatus: Partial<Record<AnthropicSectionKey, AnthropicSectionStatus>> }
    | { ok: false; code: AnthropicErrorCode; message: string }
  >
  anthropicImportArticle: (url: string) => Promise<
    | { ok: true; filePath: string; wasAlreadySaved: boolean }
    | { ok: false; code: AnthropicErrorCode; message: string }
  >
  anthropicCancelImport: (url?: string) => Promise<void>
  anthropicDeleteArticle: (args: { filePath: string }) => Promise<
    { ok: true } | { ok: false; message: string }
  >
  anthropicWriteArticleBody: (args: { filePath: string; body: string }) => Promise<{ ok: true } | { ok: false; code: 'ARTICLE_PATH_FORBIDDEN' | 'ARTICLE_WRITE_ERROR' }>
  /** 后台元数据回填进度：sitemap 老文章逐页取到元数据后分批推送 */
  onAnthropicBackfill: (cb: (payload: { articles: AnthropicArticleMeta[] }) => void) => () => void
    anthropicCollectionRead: () => Promise<{ ok: true; collection: BlogCollectionFile }>
    anthropicCollectionAdd: (args: { sourceUrl: string; filePath: string; title: string }) => Promise<{ ok: true; collection: BlogCollectionFile }>
    anthropicCollectionRemove: (args: { sourceUrl: string }) => Promise<{ ok: true; collection: BlogCollectionFile }>
    anthropicCollectionMarkRead: (args: { sourceUrl: string; filePath: string; title: string }) => Promise<{ ok: true; collection: BlogCollectionFile }>
    anthropicCollectionRemoveRead: (args: { sourceUrl: string }) => Promise<{ ok: true; collection: BlogCollectionFile }>
    anthropicCollectionRemoveBatch: (args: { batch: number }) => Promise<{ ok: true; collection: BlogCollectionFile }>
    anthropicRecommendStart: () => Promise<{ ok: true } | { ok: false; code: 'ALREADY_RUNNING' }>
    anthropicRecommendCancel: () => Promise<void>
    onAnthropicRecommendStage: (cb: (p: { stage: RecommendStage }) => void) => () => void
    onAnthropicRecommendDone: (cb: (p: RecommendDonePayload) => void) => () => void

  // Annotations
  annotationsRead: (articlePath: string) => Promise<ArticleAnnotation[]>
  annotationsWrite: (articlePath: string, annotations: ArticleAnnotation[]) => Promise<void>

  // Notes
  notesList: () => Promise<NoteEntry[]>
  notesCreate: (a: { title: string; url: string }) => Promise<{ path: string }>
  notesUpdateMeta: (a: { path: string; patch: Partial<NoteMeta> }) => Promise<void>
  notesDelete: (a: { path: string }) => Promise<void>
  notesImportRead: () => Promise<{ created: number; skipped: number }>

  // Article assistant
  articleAssistantGenerateGuide: (args: {
    articleContent: string
    articleType: 'anthropic-article'
    articleTitle?: string
    /** 导读 v2：正文 H2/H3 标题数，用于撰写进度分母 */
    entriesTotal?: number
  }) => Promise<ArticleAssistantGuide>

  articleAssistantSendMessage: (args: {
    sessionId: string
    articleContent: string
    articleType: 'anthropic-article'
    messages: ArticleAssistantMessage[]
    annotations?: ArticleAnnotation[]
    selection?: string
    useSearch?: boolean
    guide?: ArticleAssistantGuide | null
    socraticMode?: boolean
    thinkingEffort?: AssistantThinkingEffort
  }) => Promise<void>

  articleAssistantAbort: (args: { sessionId: string }) => Promise<void>

  articleAssistantReadSession: (args: {
    parentPath: string
    parentType: 'anthropic-article' | 'writing'
  }) => Promise<ArticleAssistantSessionFile | null>

  articleAssistantWriteSession: (args: {
    parentPath: string
    parentType: 'anthropic-article' | 'writing'
    messages: ArticleAssistantMessage[]
  }) => Promise<{ filePath: string }>

  articleAssistantReadGuide: (args: {
    parentPath: string
    parentType: 'anthropic-article' | 'writing'
  }) => Promise<ArticleAssistantGuideFile | null>

  articleAssistantWriteGuide: (args: {
    parentPath: string
    parentType: 'anthropic-article' | 'writing'
    guide: ArticleAssistantGuide
  }) => Promise<{ filePath: string }>

  // App shell
  openExternal: (url: string) => Promise<void>
  // 打开本地文件(file:// URL,如写作笔记里的 file:/// 链接),用系统默认程序
  openLocalFile: (url: string) => Promise<void>

  // Timing instrumentation (renderer → main, fire-and-forget)
  logTiming: (label: string, elapsed: number) => void

  // Writing feature
  writingScanTree: () => Promise<WritingResult<{ writing: WritingTreeNode[]; repository: WritingTreeNode[] }>>
  writingCreateFile: (a: { root: WritingRoot; dir: string; name: string }) => Promise<WritingResult<{ path: string }>>
  writingCreateFolder: (a: { root: WritingRoot; dir: string; name: string }) => Promise<WritingResult<{ path: string }>>
  writingRename: (a: { path: string; newName: string }) => Promise<WritingResult<{ path: string }>>
  writingMove: (a: { path: string; targetDir: string }) => Promise<WritingResult<{ path: string }>>
  writingDelete: (a: { path: string }) => Promise<WritingResult<{ moved: { from: string; to: string }[] }>>
  writingRead: (a: { path: string }) => Promise<WritingResult<{ frontmatter: Record<string, unknown>; body: string }>>
  writingWrite: (a: { path: string; body: string }) => Promise<WritingResult<null>>
  writingImportFiles: (a: { targetDir: string }) => Promise<WritingResult<{ imported: string[]; skipped: string[] }>>
  writingImportPaths: (a: { targetDir: string; paths: string[] }) => Promise<WritingResult<{ imported: string[]; skipped: string[] }>>
  writingReadPreview: (a: { path: string }) => Promise<WritingResult<WritingPreviewResult>>
  writingOpenInSystem: (a: { path: string }) => Promise<WritingResult<null>>
  writingSaveHtml: (a: { path: string; html: string }) => Promise<WritingResult<null>>
  getPathForFile: (file: File) => string
  writingRefreshCatalog: () => Promise<WritingResult<{ refreshed: number }>>
  writingAssistantSendMessage: (a: {
    sessionId: string
    articlePath: string | null
    articleContent: string
    messages: WritingAssistantMessage[]
    useSearch: boolean
    thinkingEffort: 'off' | 'high' | 'max'
  }) => Promise<void>
  writingAssistantAbort: (a: { sessionId: string }) => Promise<void>
  onWritingAssistantTool: (cb: (e: WritingToolEvent) => void) => () => void
  onWritingAssistantReasoningChunk: (cb: (sessionId: string, text: string) => void) => () => void

  // 画作裁剪（dev-only，打包版/e2e 下 canEdit=false）
  paintingsCanEdit: () => Promise<boolean>
  paintingsSetFocus: (args: { id: string; focus: string }) => Promise<{ ok: true } | { ok: false; code: PaintingFocusErrorCode; message: string }>
}

export type Painting = {
  id: string
  /** 画家或导演（影视画作填导演名，展签统一显示 painter · title · year） */
  painter: string
  title: string
  year?: number
  url: string
  category?: string
  /** CSS object-position（如 "50% 30%"），竖构图画作指定展示的关键部位；缺省居中 */
  focus?: string
}

/** 画作焦点写回的错误码（paintings:setFocus IPC） */
export type PaintingFocusErrorCode = 'INVALID_FOCUS' | 'UNKNOWN_PAINTING' | 'INDEX_UNREADABLE' | 'WRITE_FAILED'

declare global {
  interface Window {
    api: IpcApi
  }
}
