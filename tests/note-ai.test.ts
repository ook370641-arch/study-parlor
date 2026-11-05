import { describe, expect, it } from 'vitest'
import type { NoteEntry } from '@shared/index'
import { canGenerateAiNote } from '@/lib/note-ai'

const entry: NoteEntry = {
  path: 'notes/a.md',
  meta: { title: 'A', url: 'https://example.com/a', source: 'anthropic', rating: 0, summary: '', highlight: '', collected_at: '2026-11-05' },
}

describe('AI 笔记主入口资格', () => {
  it('只允许未生成的可编辑博客或书籍笔记', () => {
    expect(canGenerateAiNote(entry)).toBe(true)
    expect(canGenerateAiNote({ ...entry, meta: { ...entry.meta, source: 'web' } })).toBe(true)
    expect(canGenerateAiNote({ ...entry, meta: { ...entry.meta, source: 'book', url: '', book: '书', chapter: '章' } })).toBe(true)
  })

  it('普通文件、解析失败与已生成笔记无入口', () => {
    expect(canGenerateAiNote({ ...entry, path: 'writing/a.md' })).toBe(false)
    expect(canGenerateAiNote({ ...entry, parseError: true })).toBe(false)
    expect(canGenerateAiNote({ ...entry, meta: { ...entry.meta, source: 'unknown' } })).toBe(false)
    expect(canGenerateAiNote({ ...entry, meta: { ...entry.meta, ai_generated_at: '2026-11-05T00:00:00.000Z' } })).toBe(false)
  })
})
