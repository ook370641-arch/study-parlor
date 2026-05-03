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
}

export type FileMeta = Frontmatter & { file_path: string }

export type RecCard = {
  type: 'continue' | 'review'
  file_path: string
  title: string
}

export type NewTopic = { topic: string; hook: string }

export type Message = { role: 'system' | 'user' | 'assistant'; content: string }

export type StateJson = {
  version: 1
  profile: Profile
  lastUsed: { difficulty: Difficulty; temperature: Temperature }
  recommendation_cache: { generated_at?: string; left?: RecCard; right?: RecCard }
  suggested_new_topics: { generated_at: string; topics: NewTopic[] } | null
  ui: { session_count: number }
}

export type IpcApi = {
  scanLibrary: () => Promise<FileMeta[]>
  readMd: (path: string) => Promise<{ frontmatter: Frontmatter; body: string }>
  writeProgressMd: (args: { title: string; body: string; difficulty: Difficulty }) => Promise<{ file_path: string }>
  appendReviewRecord: (args: { file_path: string; summary: string }) => Promise<void>
  getState: () => Promise<StateJson>
  patchState: (patch: Partial<StateJson>) => Promise<void>
  llmProbe: () => Promise<{ ok: boolean; reason?: string }>
  llmStart: (args: { messages: Message[]; temperature: number; sessionId: string }) => Promise<void>
  llmAbort: (sessionId: string) => Promise<void>
  llmInspirations: (args: { profile: Profile; existingTitles: string[] }) => Promise<NewTopic[]>
  llmFinalizeProgress: (history: Message[]) => Promise<{ title: string; body: string }>
  llmFinalizeReview: (args: { history: Message[]; existingBody: string }) => Promise<string>
  onLlmChunk: (cb: (sessionId: string, text: string) => void) => () => void
  onLlmDone: (cb: (sessionId: string) => void) => () => void
  onLlmError: (cb: (sessionId: string, err: { code: string; message: string }) => void) => () => void
}

declare global {
  interface Window {
    api: IpcApi
  }
}
