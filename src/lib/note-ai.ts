import type { NoteEntry } from '@shared/index'
import { noteChapter } from './notes-list'

export type AiNoteSourceTarget =
  | { type: 'blog'; url: string }
  | { type: 'book'; book: string; chapter: string }

export type AiNoteCompanionFile = { filePath: string; kind: 'md' | 'html' | 'other'; readonly: boolean }

function normalizeUrl(url: string): string {
  try {
    const normalized = new URL(url.trim())
    normalized.hash = ''
    normalized.pathname = normalized.pathname.replace(/\/+$/, '') || '/'
    return normalized.toString()
  } catch {
    return url.trim().replace(/\/+$/, '')
  }
}

export function canGenerateAiNote(entry: NoteEntry): boolean {
  const normalizedPath = entry.path.replace(/\\/g, '/')
  const editableNote = normalizedPath.startsWith('notes/') && !normalizedPath.slice('notes/'.length).includes('/') && normalizedPath.endsWith('.md')
  const supportedSource = entry.meta.source === 'anthropic' || entry.meta.source === 'web' || entry.meta.source === 'book'
  return editableNote && supportedSource && !entry.parseError && !entry.meta.ai_generated_at
}

export function canGenerateCompanionAiNote(
  entry: NoteEntry,
  target: AiNoteSourceTarget | null,
  file: AiNoteCompanionFile,
): boolean {
  if (!target || !canGenerateAiNote(entry)) return false
  if (file.filePath !== entry.path || file.kind !== 'md' || file.readonly) return false
  if (target.type === 'blog') {
    return (entry.meta.source === 'anthropic' || entry.meta.source === 'web')
      && normalizeUrl(entry.meta.url) === normalizeUrl(target.url)
  }
  return entry.meta.source === 'book' && entry.meta.book === target.book && noteChapter(entry) === target.chapter
}
