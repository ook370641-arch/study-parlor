import type { AppConfig } from '@electron/env'

export type Difficulty = 'high' | 'mid' | 'low'
export type Mode = 'progress' | 'review'
export type Temperature = number
export type DocType = 'progress' | 'review' | 'fable' | 'transcript' | 'external-materials'

export type Profile = {
  name: string
  profile_text: string
  preferred_topics: string[]
}

export type Frontmatter = {
  title: string
  description?: string
  created: string
  last_studied?: string
  last_reviewed?: string
  review_count: number
  difficulty: Difficulty
  tags: string[]
  session_number?: number
  type?: DocType
  progress_summary?: string
  topic?: string
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

export type Message = { role: 'system' | 'user' | 'assistant'; content: string }

export type StateJson = {
  version: 1
  profile: Profile
  lastUsed: { difficulty: Difficulty; temperature: Temperature }
  groupInspirations: Record<string, NewTopic>
  ui: { session_count: number }
  inspirationStrategy: 'v1' | 'v2' | 'v3'
  fableStyleTags: string[]
  lastFableTags: string[]
  topicContinueSuggestions: Record<string, TopicContinueCache>
}

export type IpcApi = {
  scanLibrary: () => Promise<TopicMeta[]>
  readMd: (path: string) => Promise<{ frontmatter: Frontmatter; body: string }>
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
  bootFatal: () => Promise<string | null>
  bootStart: () => Promise<void>
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

  // External materials writing
  writeExternalMaterials: (args: {
    dirName: string
    sessionNumber: number
    topic: string
    summary: string
    sources: SearchSource[]
  }) => Promise<void>

  // Search & external materials
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
