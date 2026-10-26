import type { NoteEntry, NoteSortBy, NoteSource } from '@shared/index'

const SOURCE_ORDER: NoteSource[] = ['anthropic', 'web', 'book', 'unknown']

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
