import type { NoteEntry } from '@shared/index'

export function canGenerateAiNote(entry: NoteEntry): boolean {
  const normalizedPath = entry.path.replace(/\\/g, '/')
  const editableNote = normalizedPath.startsWith('notes/') && !normalizedPath.slice('notes/'.length).includes('/') && normalizedPath.endsWith('.md')
  const supportedSource = entry.meta.source === 'anthropic' || entry.meta.source === 'web' || entry.meta.source === 'book'
  return editableNote && supportedSource && !entry.parseError && !entry.meta.ai_generated_at
}
