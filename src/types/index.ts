export type Difficulty = 'high' | 'mid' | 'low'
export type Mode = 'progress' | 'review'
export type Temperature = 0.3 | 0.7 | 1.0

export type Profile = {
  name: string
  profile_text: string
  preferred_topics: string[]
}

export type Frontmatter = {
  title: string
  created: string
  last_studied?: string
  last_reviewed?: string
  review_count: number
  difficulty: Difficulty
  tags: string[]
  session_number?: number
  type?: 'progress' | 'review' | 'research'
  progress_summary?: string
}

export type FileMeta = Frontmatter & { file_path: string }

export type SessionMeta = {
  sessionNumber: number
  date: string
  title?: string
  hasReport: boolean
  hasTranscript: boolean
  hasReview: boolean
  hasFable: boolean
  fableCount: number
  hasImage: boolean
  hasFableImage: boolean
  reportFile?: string
  transcriptFile?: string
  reviewFile?: string
  fableFile?: string
  imageFile?: string
  fableImageFile?: string
}

export type TopicMeta = {
  dirName: string
  title: string
  sessionCount: number
  sessions: SessionMeta[]
  last_studied: string
  last_studied_days: number
}

export type RecCard = {
  type: 'continue' | 'review'
  dirName: string
  title: string
}

export type NewTopic = { topic: string; hook: string }

export type UnsavedSession = {
  id: string
  mode: Mode
  topic: string
  dirName?: string
  file_path?: string
  difficulty: Difficulty
  temperature: number
  history: Message[]
}

export type ArchiveResult = {
  mode: Mode
  topic: string
  title: string
  content: string  // progress: body; review: summary + gaps rendered
}

export type Message = { role: 'system' | 'user' | 'assistant'; content: string }

export type StateJson = {
  version: 1
  profile: Profile
  lastUsed: { difficulty: Difficulty; temperature: Temperature }
  suggested_new_topics: { generated_at: string; topics: NewTopic[] } | null
  ui: { session_count: number }
}

export type IpcApi = {
  scanLibrary: () => Promise<TopicMeta[]>
  readMd: (path: string) => Promise<{ frontmatter: Frontmatter; body: string }>
  writeProgressMd: (args: { title: string; body: string; difficulty: Difficulty; dirName: string; session_number: number; progress_summary?: string }) => Promise<{ file_path: string }>
  recoveryDump: (args: { filename: string; content: string }) => Promise<void>
  getState: () => Promise<StateJson>
  patchState: (patch: Partial<StateJson>) => Promise<void>
  llmProbe: () => Promise<{ ok: boolean; reason?: string }>
  llmStart: (args: { sessionId: string; mode: Mode; difficulty: Difficulty; profile: Profile; reviewFileBody?: string; progressSummary?: string; history: Message[]; temperature: number }) => Promise<void>
  llmAbort: (sessionId: string) => Promise<void>
  llmInspirations: (args: { profile: Profile; existingTitles: string[] }) => Promise<NewTopic[]>
  llmFinalizeProgress: (history: Message[]) => Promise<{ title: string; body: string; progress_summary?: string }>
  llmFinalizeReview: (args: { history: Message[]; existingBody: string }) => Promise<{ summary: string; gaps: string }>
  llmGenerateFable: (args: { history: Message[]; topic: string }) => Promise<{ title: string; body: string }>
  onLlmChunk: (cb: (sessionId: string, text: string) => void) => () => void
  onLlmDone: (cb: (sessionId: string) => void) => () => void
  onLlmError: (cb: (sessionId: string, err: { code: string; message: string }) => void) => () => void
  bootFatal: () => Promise<string | null>

  // Session persistence (stubs until main handlers implemented)
  loadSessions: () => Promise<UnsavedSession[]>
  saveSession: (s: UnsavedSession) => Promise<void>
  deleteSession: (id: string) => Promise<void>

  // Anchor file reading (stub until main handler implemented)
  readAnchorFile: (dirName: string) => Promise<{ frontmatter: Frontmatter; body: string }>

  // Review report writing (stub until main handler implemented)
  writeReviewReport: (args: { topic: string; dirName: string; summary: string; gaps: string; review_index: number }) => Promise<void>

  // Session file operations
  writeTranscript: (args: { dirName: string; sessionNumber: number; content: string }) => Promise<void>
  readSessionFile: (args: { dirName: string; sessionNumber: number; fileName: string }) => Promise<{ content: string; mimeType?: string }>
}

declare global {
  interface Window {
    api: IpcApi
  }
}
