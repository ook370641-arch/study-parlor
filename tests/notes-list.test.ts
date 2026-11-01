import { describe, it, expect } from 'vitest'
import { groupNotesForDisplay, noteChapter, sortNotes } from '@/lib/notes-list'
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

describe('groupNotesForDisplay', () => {
  const bookNote = (path: string, title: string, book: string, collectedAt: string, rating = 0): NoteEntry => ({
    path,
    meta: { title, url: '', source: 'book', rating, summary: '', highlight: '', collected_at: collectedAt, book },
  })

  it('按书聚合同章与不同章节，并从旧标题推导章节', () => {
    const chapterOne = bookNote('notes/a1.md', '书A · 第一章', '书A', '2026-09-01')
    const chapterTwo = bookNote('notes/a2.md', '书A · 第二章', '书A', '2026-09-03', 4)
    const annotation = bookNote('notes/a1-note.md', '书A · 第一章 · 标注', '书A', '2026-09-04', 2)

    const groups = groupNotesForDisplay([chapterOne, chapterTwo, annotation], 'time', 'all')

    expect(groups).toHaveLength(1)
    expect(groups[0]).toMatchObject({ kind: 'book', book: '书A', rating: 4, collectedAt: '2026-09-04' })
    if (groups[0].kind !== 'book') throw new Error('expected book group')
    expect(groups[0].entries.map(entry => entry.meta.chapter)).toEqual(['第一章', '第一章', '第二章'])
    expect(groups[0].latest.path).toBe('notes/a1-note.md')
    expect(groups[0].entries.map(entry => entry.path)).toContain('notes/a1-note.md')
  })

  it('不同书的同名章节不会合并，非书笔记保持单项', () => {
    const first = bookNote('notes/a.md', '书A · 序章', '书A', '2026-09-01')
    const second = bookNote('notes/b.md', '书B · 序章', '书B', '2026-09-02')
    const web = mk('notes/web.md', 'web', 3, '2026-09-03')

    const groups = groupNotesForDisplay([first, second, web], 'time', 'all')

    expect(groups.map(item => item.kind)).toEqual(['note', 'book', 'book'])
  })

  it('无法推导的旧章节归入未分章，筛选先于聚合', () => {
    const legacy = bookNote('notes/legacy.md', '自定义标题', '书A', '2026-09-01')
    expect(noteChapter(legacy)).toBe('未分章')
    expect(groupNotesForDisplay([legacy, ...list], 'time', 'web')).toHaveLength(2)
    expect(groupNotesForDisplay([legacy, ...list], 'time', 'book')[0].kind).toBe('book')
  })
})
