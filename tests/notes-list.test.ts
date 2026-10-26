import { describe, it, expect } from 'vitest'
import { sortNotes } from '@/lib/notes-list'
import type { NoteEntry } from '@shared/index'

const mk = (path: string, source: NoteEntry['meta']['source'], rating: number, collected_at: string): NoteEntry => ({
  path, meta: { title: path, url: '', source, rating, summary: '', highlight: '', collected_at },
})

const list = [
  mk('notes/a.md', 'web', 3, '2026-09-01'),
  mk('notes/b.md', 'anthropic', 5, '2026-09-03'),
  mk('notes/c.md', 'web', 4, '2026-09-02'),
]

describe('sortNotes', () => {
  it('source：按来源类型分组，组内按收录时间倒序', () => {
    const input = [
      mk('notes/web-old.md', 'web', 3, '2026-09-01'),
      mk('notes/book.md', 'book', 3, '2026-09-04'),
      mk('notes/anthropic.md', 'anthropic', 3, '2026-09-02'),
      mk('notes/web-new.md', 'web', 3, '2026-09-03'),
      mk('notes/unknown.md', 'unknown', 3, '2026-09-05'),
    ]
    expect(sortNotes(input, 'source', 'all').map(e => e.path)).toEqual([
      'notes/anthropic.md',
      'notes/web-new.md',
      'notes/web-old.md',
      'notes/book.md',
      'notes/unknown.md',
    ])
  })
  it('time：按收录时间倒序', () => {
    expect(sortNotes(list, 'time', 'all').map(e => e.path)).toEqual(['notes/b.md', 'notes/c.md', 'notes/a.md'])
  })
  it('rating：星标倒序，同分按时间倒序', () => {
    expect(sortNotes(list, 'rating', 'all').map(e => e.path)).toEqual(['notes/b.md', 'notes/c.md', 'notes/a.md'])
  })
  it('分类过滤', () => {
    expect(sortNotes(list, 'time', 'web').map(e => e.path)).toEqual(['notes/c.md', 'notes/a.md'])
  })
})
