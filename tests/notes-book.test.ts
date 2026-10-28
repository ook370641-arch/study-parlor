import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

// store 侧 findOrCreateArticleNote 走 renderer ipc facade；用内存笔记库模拟 notesCreate/notesList
const mockIpc = vi.hoisted(() => ({
  notesCreate: vi.fn(),
  notesList: vi.fn(),
  patchState: vi.fn(async () => {}),
}))
vi.mock('@/lib/ipc', () => ({ ipc: mockIpc }))

import { createNoteFile, scanNotes } from '../electron/lib/notes'
import { useStore } from '@/store'
import type { NoteEntry } from '@shared/index'

let lib: string
beforeEach(() => {
  lib = fs.mkdtempSync(path.join(os.tmpdir(), 'sp-notebook-'))
})
afterEach(() => {
  fs.rmSync(lib, { recursive: true, force: true })
})

describe('createNoteFile with book', () => {
  it('frontmatter 写入 source=book 与 book 字段，scan 可读回', () => {
    createNoteFile(lib, { title: 'JTBD · Foreword', url: '', source: 'book', book: 'Intercom on Jobs-to-be-Done' })
    const notes = scanNotes(lib)
    expect(notes).toHaveLength(1)
    expect(notes[0].meta.source).toBe('book')
    expect(notes[0].meta.book).toBe('Intercom on Jobs-to-be-Done')
  })

  it('旁注存为笔记时正文一并写入', () => {
    createNoteFile(lib, {
      title: 'JTBD · Foreword · 标注',
      url: '',
      source: 'book',
      book: 'Intercom on Jobs-to-be-Done',
      body: '> 原文摘录\n\n我的备注',
    })
    const note = scanNotes(lib)[0]
    const raw = fs.readFileSync(path.join(lib, 'notes', path.basename(note.path)), 'utf8')
    expect(raw).toContain('> 原文摘录')
    expect(raw).toContain('我的备注')
  })
})

// —— findOrCreateArticleNote 去重键：书籍按 (source, book, title)，不看 url ——
// 这些断言依赖 store 的新行为（source/book 透传 + 书籍去重键）；store 未改前此处应红。
describe('findOrCreateArticleNote 书籍去重键', () => {
  let store: NoteEntry[]
  beforeEach(() => {
    store = []
    vi.clearAllMocks()
    mockIpc.notesList.mockImplementation(async () => [...store])
    mockIpc.notesCreate.mockImplementation(async (a: { title: string; url: string; source?: string; book?: string }) => {
      const rel = `notes/${a.title.replace(/[\\/:*?"<>|]/g, '')}.md`
      store.push({
        path: rel,
        meta: {
          title: a.title,
          url: a.url,
          source: (a.source ?? 'unknown') as NoteEntry['meta']['source'],
          rating: 0,
          summary: '',
          highlight: '',
          collected_at: '2026-10-27',
          ...(a.book ? { book: a.book } : {}),
        },
      })
      return { path: rel }
    })
    useStore.setState({ notesList: null } as any)
  })

  it('同一本书两个不同章节标题 → 各建一条', async () => {
    const book = 'Intercom on Jobs-to-be-Done'
    const a = await (useStore.getState().findOrCreateArticleNote as any)({
      title: `${book} · Foreword`, url: '', source: 'book', book,
    })
    const b = await (useStore.getState().findOrCreateArticleNote as any)({
      title: `${book} · Chapter 1`, url: '', source: 'book', book,
    })
    expect(a.created).toBe(true)
    expect(b.created).toBe(true)
    expect(mockIpc.notesCreate).toHaveBeenCalledTimes(2)
    expect(a.path).not.toBe(b.path)
  })

  it('同章二次 → 命中已有，不重复创建', async () => {
    const args = { title: 'JTBD · Foreword', url: '', source: 'book' as const, book: 'JTBD' }
    const first = await (useStore.getState().findOrCreateArticleNote as any)(args)
    const second = await (useStore.getState().findOrCreateArticleNote as any)(args)
    expect(second).toEqual({ path: first.path, created: false })
    expect(mockIpc.notesCreate).toHaveBeenCalledTimes(1)
  })

  it('不同书同名章节 → 不互相命中', async () => {
    const a = await (useStore.getState().findOrCreateArticleNote as any)({
      title: 'Preface', url: '', source: 'book', book: '书A',
    })
    const b = await (useStore.getState().findOrCreateArticleNote as any)({
      title: 'Preface', url: '', source: 'book', book: '书B',
    })
    expect(a.created).toBe(true)
    expect(b.created).toBe(true)
    expect(mockIpc.notesCreate).toHaveBeenCalledTimes(2)
  })
})
