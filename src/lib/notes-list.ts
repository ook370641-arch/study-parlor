import type { NoteEntry, NoteSortBy, NoteSource } from '@shared/index'

const SOURCE_ORDER: NoteSource[] = ['anthropic', 'web', 'book', 'unknown']

export type SingleNoteDisplayItem = { kind: 'note'; key: string; entry: NoteEntry }
export type BookNoteDisplayItem = {
  kind: 'book'
  key: string
  book: string
  entries: NoteEntry[]
  latest: NoteEntry
  rating: number
  collectedAt: string
}
export type NoteDisplayItem = SingleNoteDisplayItem | BookNoteDisplayItem

export function inferBookChapter(title: string, book?: string): string {
  if (!book) return '未分章'
  const prefix = `${book} · `
  if (!title.startsWith(prefix)) return '未分章'
  const chapter = title.slice(prefix.length).replace(/ · 标注(?: \d+)?$/, '').trim()
  return chapter || '未分章'
}

export function noteChapter(entry: NoteEntry): string {
  return entry.meta.chapter?.trim() || inferBookChapter(entry.meta.title, entry.meta.book)
}

/** 笔记列表过滤 + 排序（NotesShelf 封面行与 NotesWall 专辑墙共用，保证两侧顺序一致） */
export function sortNotes(list: NoteEntry[], sortBy: NoteSortBy, category: 'all' | NoteSource): NoteEntry[] {
  const out = list.filter(e => category === 'all' || e.meta.source === category)
  if (sortBy === 'source') {
    out.sort((a, b) => SOURCE_ORDER.indexOf(a.meta.source) - SOURCE_ORDER.indexOf(b.meta.source)
      || b.meta.collected_at.localeCompare(a.meta.collected_at))
  } else if (sortBy === 'rating') {
    out.sort((a, b) => b.meta.rating - a.meta.rating || b.meta.collected_at.localeCompare(a.meta.collected_at))
  } else {
    out.sort((a, b) => b.meta.collected_at.localeCompare(a.meta.collected_at))
  }
  return out
}

export function groupNotesForDisplay(list: NoteEntry[], sortBy: NoteSortBy, category: 'all' | NoteSource): NoteDisplayItem[] {
  const output: NoteDisplayItem[] = []
  const books = new Map<string, BookNoteDisplayItem>()
  for (const entry of sortNotes(list, sortBy, category)) {
    if (entry.meta.source !== 'book') {
      output.push({ kind: 'note', key: entry.path, entry })
      continue
    }
    const book = entry.meta.book?.trim() || '未命名书籍'
    const normalized = { ...entry, meta: { ...entry.meta, chapter: noteChapter(entry) } }
    let group = books.get(book)
    if (!group) {
      group = { kind: 'book', key: `book:${book}`, book, entries: [], latest: normalized, rating: 0, collectedAt: '' }
      books.set(book, group)
      output.push(group)
    }
    group.entries.push(normalized)
    group.rating = Math.max(group.rating, normalized.meta.rating)
    if (normalized.meta.collected_at > group.collectedAt) {
      group.collectedAt = normalized.meta.collected_at
      group.latest = normalized
    }
  }
  for (const group of books.values()) {
    const chapterStarted = new Map<string, string>()
    for (const entry of group.entries) {
      const chapter = noteChapter(entry)
      const started = chapterStarted.get(chapter)
      if (!started || entry.meta.collected_at < started) chapterStarted.set(chapter, entry.meta.collected_at)
    }
    group.entries.sort((a, b) => chapterStarted.get(noteChapter(a))!.localeCompare(chapterStarted.get(noteChapter(b))!)
      || Number(/ · 标注(?: \d+)?$/.test(a.meta.title)) - Number(/ · 标注(?: \d+)?$/.test(b.meta.title))
      || b.meta.collected_at.localeCompare(a.meta.collected_at))
  }
  return output
}
