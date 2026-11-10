import { beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, within } from '@testing-library/react'
import type { NoteEntry, NoteMeta } from '@shared/index'

const mockIpc = vi.hoisted(() => ({ booksChapters: vi.fn() }))

vi.mock('@/lib/ipc', () => ({ ipc: mockIpc }))

vi.mock('@/components/Tooltip', () => ({ Tooltip: ({ children }: { children: React.ReactNode }) => children }))

import { BookListColumn } from '@/components/books/BookListColumn'
import { useStore } from '@/store'

function bookNote(meta: Partial<NoteMeta>): NoteEntry {
  return {
    path: `notes/${meta.title ?? 'note'}.md`,
    meta: {
      title: 'JTBD · 第 23 章',
      url: '',
      source: 'book',
      rating: 0,
      summary: '',
      highlight: '',
      collected_at: '2026-11-10T00:00:00.000Z',
      book: 'JTBD',
      ...meta,
    },
  }
}

beforeEach(() => {
  cleanup()
  vi.clearAllMocks()
  mockIpc.booksChapters.mockResolvedValue([])
  useStore.setState({
    booksList: [{
      dir: 'jtbd',
      title: 'JTBD',
      importedAt: '2026-10-27T00:00:00.000Z',
      hasToc: true,
      chapterCount: 2,
      parserVersion: 3,
    }],
    booksLoading: false,
    booksImporting: false,
    booksReparsing: false,
    activeBookDir: 'jtbd',
    activeBookToc: [
      { title: '第 23 章', chapterFile: 'chapters/23.md', chapterIndex: 23, pageRange: [100, 109] },
      { title: '第 24 章', chapterFile: 'chapters/24.md', chapterIndex: 24, pageRange: [110, 119] },
    ],
    activeChapter: null,
    booksLastChapter: null,
    notesList: [],
    selectBook: vi.fn(),
    selectChapter: vi.fn(),
    importBook: vi.fn(),
    reparseBook: vi.fn(),
  } as any)
})

describe('BookListColumn 章节 AI 笔记标识', () => {
  it('显式 meta.chapter 匹配时显示标识，且不误标其他章节', () => {
    useStore.setState({
      notesList: [bookNote({
        title: '自定义笔记标题',
        chapter: '第 23 章',
        ai_generated_at: '2026-11-10T01:00:00.000Z',
      })],
    })
    render(<BookListColumn theme="academic" />)

    const marker = within(screen.getByTestId('chapter-row-0')).getByTestId('book-ai-note-marker')
    expect(marker).toHaveAccessibleName('已生成 AI 笔记')
    expect(marker).toHaveAttribute('title', '已生成 AI 笔记')
    expect(within(screen.getByTestId('chapter-row-1')).queryByTestId('book-ai-note-marker')).toBeNull()
  })

  it('旧笔记通过 meta.book 和书名 · 章节标题推导匹配', () => {
    useStore.setState({
      notesList: [bookNote({
        title: 'JTBD · 第 23 章',
        ai_generated_at: '2026-11-10T01:00:00.000Z',
      })],
    })
    render(<BookListColumn theme="academic" />)

    expect(within(screen.getByTestId('chapter-row-0')).getByTestId('book-ai-note-marker')).toBeTruthy()
    expect(within(screen.getByTestId('chapter-row-1')).queryByTestId('book-ai-note-marker')).toBeNull()
  })

  it('普通笔记、非书籍来源和其他章节均不显示标识', () => {
    useStore.setState({
      notesList: [
        bookNote({ chapter: '第 23 章' }),
        bookNote({ source: 'web', chapter: '第 23 章', ai_generated_at: '2026-11-10T01:00:00.000Z' }),
        bookNote({ chapter: '其他章节', ai_generated_at: '2026-11-10T01:00:00.000Z' }),
      ],
    })
    render(<BookListColumn theme="academic" />)

    expect(screen.queryByTestId('book-ai-note-marker')).toBeNull()
  })
})
