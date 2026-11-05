import { describe, expect, it } from 'vitest'
import type { NoteEntry } from '@shared/index'
import { canGenerateAiNote, canGenerateCompanionAiNote } from '@/lib/note-ai'

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

describe('AI 笔记对照入口资格', () => {
  const file = { filePath: entry.path, kind: 'md' as const, readonly: false }

  it('博客要求规范化 URL 与当前文章精确匹配', () => {
    expect(canGenerateCompanionAiNote(entry, { type: 'blog', url: ' HTTPS://Example.com/a/#section ' }, file)).toBe(true)
    expect(canGenerateCompanionAiNote(entry, { type: 'blog', url: 'https://example.com/other' }, file)).toBe(false)
  })

  it('书籍要求书名与 noteChapter 同时匹配', () => {
    const bookEntry: NoteEntry = { ...entry, meta: { ...entry.meta, source: 'book', url: '', book: '书', title: '书 · 第一章', chapter: undefined } }
    expect(canGenerateCompanionAiNote(bookEntry, { type: 'book', book: '书', chapter: '第一章' }, file)).toBe(true)
    expect(canGenerateCompanionAiNote(bookEntry, { type: 'book', book: '书', chapter: '第二章' }, file)).toBe(false)
    expect(canGenerateCompanionAiNote(bookEntry, { type: 'book', book: '另一本', chapter: '第一章' }, file)).toBe(false)
  })

  it('空目标、错文件、只读或非 Markdown 对照均无入口', () => {
    const target = { type: 'blog' as const, url: entry.meta.url }
    expect(canGenerateCompanionAiNote(entry, null, file)).toBe(false)
    expect(canGenerateCompanionAiNote(entry, target, { ...file, filePath: 'notes/other.md' })).toBe(false)
    expect(canGenerateCompanionAiNote(entry, target, { ...file, readonly: true })).toBe(false)
    expect(canGenerateCompanionAiNote(entry, target, { ...file, kind: 'html' as const })).toBe(false)
  })
})
