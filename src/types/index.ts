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
export type AnthropicArticleMeta = {
  url: string
  title: string
  summary: string | null
  publishedAt: string | null
  imageUrl: string | null
  isSaved?: boolean
  filePath?: string
}

export type AnthropicErrorCode =
  | 'browser-init-failed'
  | 'network-error'
  | 'parse-error'
  | 'import-failed'
  | 'cancelled'
  | 'unknown'

export type AnthropicError = {
  code: AnthropicErrorCode
  message: string
}

export type AnthropicBlogCache = {
  lastFetchedAt: string | null
  articles: AnthropicArticleMeta[]
  loading: boolean
  error: AnthropicError | null
}

export type ArticleAssistantTerm = {
  term: string
  translation: string
  explanation: string
}

export type ArticleAssistantChunk = {
  heading: string
  summary: string
  terms: ArticleAssistantTerm[]
}

export type ArticleAssistantGuide = {
  background: string
  chunks: ArticleAssistantChunk[]
}

export type ArticleAssistantMessage = {
  role: 'user' | 'assistant'
  content: string
  searchSources?: { title: string; url: string; snippet: string }[]
  selection?: string
  reasoning?: string
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
}

export type AssistantThinkingEffort = 'off' | 'high' | 'max'

export type ArticleAssistantErrorCode =
  | 'GUIDE_LLM_ERROR'
  | 'GUIDE_JSON_ERROR'
  | 'GUIDE_ABORT'
  | 'CHAT_LLM_ERROR'
  | 'CHAT_NETWORK_ERROR'
  | 'CHAT_TIMEOUT'
  | 'SAVE_ERROR'

export type ArticleAnnotation = {
  id: string
  selectedText: string
  note: string
  paragraphIndex: number
  createdAt: string
  updatedAt: string
}

export type DocType = 'progress' | 'review' | 'fable' | 'transcript' | 'briefing' | 'external-materials' | 'anthropic-article' | 'article-assistant' | 'job-briefing' | 'writing'

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
  published_at?: string
  imported_at?: string
  authors?: string[]
  parent_path?: string
  parent_type?: 'briefing' | 'anthropic-article' | 'job-briefing' | 'writing'
  generated_at?: string
  role_keywords?: string[]
  cities?: string[]
  companies?: string[]
  job_sources?: string
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

export type BriefingSourceType = 'x' | 'podcast' | 'blog'

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

export type BriefingSourceStatus = Record<string, 'ok' | 'failed'>

export type BriefingStage =
  | 'fetching'
  | 'extracting'
  | 'assembling'
  | 'finalizing'
  | 'done'
  | JobBriefingStage

export type BriefingSourceItem = {
  text?: string
  url?: string
  timestamp?: string
}

export type BriefingSource = {
  type: BriefingSourceType
  author?: string
  title?: string
  url?: string
  items: BriefingSourceItem[]
}

export type BriefingResult = {
  title: string
  date: string
  content: string
  sources: BriefingSource[]
  filePath: string
  cached: boolean
  cacheWriteFailed?: boolean
  generatedAt: string
  sourceStatus: BriefingSourceStatus
}

export type JobCompany = {
  name: string
  careerPageUrl?: string
  priority: number
  enabled: boolean
}

export type JobBriefingConfig = {
  companies: JobCompany[]
  roleKeywords: string[]
  cities: string[]
  skillKeywords: string[]
}

export type JobErrorCode =
  | 'MISSING_SEARCH_KEY'
  | 'NETWORK_ERROR'
  | 'OFFICIAL_PAGE_FAILED'
  | 'EXTRACTION_ERROR'
  | 'EMPTY_RESULTS'
  | 'CACHE_WRITE_FAILED'
  | 'TIMEOUT'

export type JobProfile = {
  targetRoles: string[]
  direction: string
  skills: string[]
  experience: string
  additionalNotes: string
  updatedAt: string
}

export type JobEventType = '秋招开启' | '新岗位' | '线下活动' | '宣讲会' | '其他'

export type JobEvent = {
  company: string
  eventType: JobEventType
  title: string
  date: string
  summary: string
  url: string
}

export type MatchedJob = {
  title: string
  city: string
  salary: string
  requirements: string[]
  url: string
  source: 'official' | 'tavily'
  company: string
  matchLevel: 1 | 2 | 3 | 4 | 5
  matchReason: string
  sourceEventTitle?: string
}

export type InterviewQuestion = {
  question: string
  intent: string
  prepTip: string
  frequency: string
  companies: string[]
  url: string
}

export type JobBriefingSourceStatus = {
  events: 'ok' | 'failed'
  jobs: 'ok' | 'failed'
  questions: 'ok' | 'failed'
  official: Record<string, 'ok' | 'failed'>
}

export type JobBriefingStage =
  | 'scanning-events'
  | 'digging-jobs'
  | 'aggregating-questions'
  | 'synthesizing'
  | 'finalizing'
  | 'done'

export type JobBriefingResult = {
  title: string
  date: string
  content: string
  filePath: string
  cached: boolean
  cacheWriteFailed?: boolean
  generatedAt: string
  sourceStatus: JobBriefingSourceStatus
}

export type WritingRoot = 'writing' | 'repository'
export type WritingErrorCode = 'WRITING_IO_ERROR' | 'WRITING_PATH_FORBIDDEN' | 'WRITING_NOT_FOUND' | 'WRITING_NAME_CONFLICT'
export type WritingResult<T> = { ok: true; value: T } | { ok: false; code: WritingErrorCode; message: string }
export type WritingTreeNode = {
  name: string
  path: string
  kind: 'dir' | 'file'
  children?: WritingTreeNode[]
  summary?: string
  catalogUpdatedAt?: string
}
export type WritingTone = 'parchment' | 'plain' | 'ink'
export type WritingSourceType = 'study' | 'blog' | 'digest' | 'job' | 'repository' | 'writing' | 'web'
export type WritingSource = { type: WritingSourceType; id: string; label: string }
export type WritingAssistantMessage = {
  role: 'user' | 'assistant'
  content: string
  reasoning?: string
  sources?: WritingSource[]
}
export type WritingToolEvent = {
  sessionId: string
  phase: 'start' | 'done' | 'error'
  tool: 'read_local' | 'web_search' | 'insert_into_article'
  ids?: string[]
  query?: string
  markdown?: string
  error?: string
}
export type WritingCatalogEntry = { title: string; summary: string; updatedAt: string }
export type WritingCatalog = { version: 1; entries: Record<string, WritingCatalogEntry> }

export type Message = { role: 'system' | 'user' | 'assistant'; content: string }

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
  externalSummaryFontSize?: BriefingFontSize
  briefingSource?: 'digest' | 'anthropic' | 'job-briefing' | 'writing'
  jobBriefingConfig?: JobBriefingConfig
  jobProfile?: JobProfile
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
}

export type IpcApi = {
  scanLibrary: () => Promise<TopicMeta[]>
  readMd: (path: string) => Promise<{ frontmatter: Frontmatter; body: string }>
  readAssetAsDataUrl: (mdFilePath: string, relativePath: string) => Promise<string>
  writeProgressMd: (args: { title: string; description?: string; body: string; difficulty: Difficulty; dirName: string; session_number: number; progress_summary?: string }) => Promise<{ file_path: string }>
  getState: () => Promise<StateJson>
  patchState: (patch: Partial<StateJson>) => Promise<void>
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
  onArticleAssistantReasoningChunk: (cb: (sessionId: string, text: string) => void) => () => void
  onBriefingProgress: (cb: (stage: BriefingStage, detail?: string) => void) => () => void
  briefingGenerate: (args: { date: string; profile: Profile; force?: boolean }) => Promise<BriefingResult>
  briefingList: () => Promise<{ date: string; filePath: string }[]>
  briefingDelete: (args: { filePath: string }) => Promise<{ ok: true } | { ok: false; message: string }>
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
  writeConfig: (config: AppConfig) => Promise<void>

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
    | { ok: true; lastFetchedAt: string; articles: AnthropicArticleMeta[] }
    | { ok: false; code: AnthropicErrorCode; message: string }
  >
  anthropicImportArticle: (url: string) => Promise<
    | { ok: true; filePath: string; wasAlreadySaved: boolean }
    | { ok: false; code: AnthropicErrorCode; message: string }
  >
  anthropicCancelImport: () => Promise<void>

  // Annotations
  annotationsRead: (articlePath: string) => Promise<ArticleAnnotation[]>
  annotationsWrite: (articlePath: string, annotations: ArticleAnnotation[]) => Promise<void>

  // Article assistant
  articleAssistantGenerateGuide: (args: {
    articleContent: string
    articleType: 'briefing' | 'anthropic-article'
    articleTitle?: string
  }) => Promise<ArticleAssistantGuide>

  articleAssistantSendMessage: (args: {
    sessionId: string
    articleContent: string
    articleType: 'briefing' | 'anthropic-article'
    messages: ArticleAssistantMessage[]
    selection?: string
    useSearch?: boolean
    guide?: ArticleAssistantGuide | null
    socraticMode?: boolean
    thinkingEffort?: AssistantThinkingEffort
  }) => Promise<void>

  articleAssistantAbort: (args: { sessionId: string }) => Promise<void>

  articleAssistantReadSession: (args: {
    parentPath: string
    parentType: 'briefing' | 'anthropic-article' | 'writing'
  }) => Promise<ArticleAssistantSessionFile | null>

  articleAssistantWriteSession: (args: {
    parentPath: string
    parentType: 'briefing' | 'anthropic-article' | 'writing'
    messages: ArticleAssistantMessage[]
  }) => Promise<{ filePath: string }>

  articleAssistantReadGuide: (args: {
    parentPath: string
    parentType: 'briefing' | 'anthropic-article' | 'writing'
  }) => Promise<ArticleAssistantGuideFile | null>

  articleAssistantWriteGuide: (args: {
    parentPath: string
    parentType: 'briefing' | 'anthropic-article' | 'writing'
    guide: ArticleAssistantGuide
  }) => Promise<{ filePath: string }>

  // Job briefing
  jobBriefingGenerate: (args: { date: string; force?: boolean }) => Promise<JobBriefingResult>
  jobBriefingList: () => Promise<{ date: string; filePath: string }[]>
  jobBriefingDelete: (args: { filePath: string }) => Promise<{ ok: true } | { ok: false; message: string }>
  jobBriefingDiscoverPages: () => Promise<
    | { ok: true; companies: JobCompany[] }
    | { ok: false; code: JobErrorCode; message: string }
  >

  // App shell
  openExternal: (url: string) => Promise<void>

  // Timing instrumentation (renderer → main, fire-and-forget)
  logTiming: (label: string, elapsed: number) => void

  // Writing feature
  writingScanTree: () => Promise<WritingResult<{ writing: WritingTreeNode[]; repository: WritingTreeNode[] }>>
  writingCreateFile: (a: { root: WritingRoot; dir: string; name: string }) => Promise<WritingResult<{ path: string }>>
  writingCreateFolder: (a: { root: WritingRoot; dir: string; name: string }) => Promise<WritingResult<{ path: string }>>
  writingRename: (a: { path: string; newName: string }) => Promise<WritingResult<{ path: string }>>
  writingMove: (a: { path: string; targetDir: string }) => Promise<WritingResult<{ path: string }>>
  writingDelete: (a: { path: string }) => Promise<WritingResult<null>>
  writingRead: (a: { path: string }) => Promise<WritingResult<{ frontmatter: Record<string, unknown>; body: string }>>
  writingWrite: (a: { path: string; body: string }) => Promise<WritingResult<null>>
  writingImportFiles: (a: { targetDir: string }) => Promise<WritingResult<{ imported: string[] }>>
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
}

export type Painting = {
  id: string
  painter: 'Mark Rothko' | 'Guy Billout'
  title: string
  year?: number
  url: string
  category?: string
}

declare global {
  interface Window {
    api: IpcApi
  }
}
