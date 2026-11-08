import { beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'

const mockIpc = vi.hoisted(() => ({
  notesCreate: vi.fn(),
  notesList: vi.fn(),
  patchState: vi.fn(),
  writingRead: vi.fn(),
}))

vi.mock('@/lib/ipc', () => ({ ipc: mockIpc }))
vi.mock('@/components/article-assistant/GuideSidebar', () => ({ GuideSidebar: () => null }))
vi.mock('@/components/article-assistant/ArticleCompanionBoard', () => ({ ArticleCompanionBoard: () => null }))

import { ArticleGuideTabs } from '@/components/article-assistant/ArticleGuideTabs'
import { useStore } from '@/store'
import type { NoteEntry } from '@shared/index'

const article = {
  url: 'https://a.com/post',
  title: '当前博客',
  summary: null,
  publishedAt: null,
  imageUrl: null,
  filePath: '/lib/blog/post.md',
}

const existingNote: NoteEntry = {
  path: 'notes/existing.md',
  meta: {
    title: '已有笔记',
    url: article.url,
    source: 'anthropic',
    rating: 0,
    summary: '',
    highlight: '',
    collected_at: '2026-11-02',
  },
}

beforeEach(() => {
  cleanup()
  vi.clearAllMocks()
  mockIpc.patchState.mockResolvedValue(undefined)
  mockIpc.writingRead.mockResolvedValue({ ok: true, value: { body: '' } })
  useStore.setState({
    articlePanelMode: { anthropic: 'companion', book: 'companion' },
    anthropicReaderFilePath: article.filePath,
    anthropicBlogCache: { lastFetchedAt: null, articles: [article], loading: false, error: null, sectionStatus: {} },
    activeBookDir: 'book-a',
    booksList: [{ dir: 'book-a', title: 'Book A', importedAt: '2026-11-02', hasToc: true, chapterCount: 1 }],
    activeChapter: { path: '/lib/books/book-a/chapters/01.md', content: '', meta: { title: 'Chapter 1', chapterIndex: 1, pageRange: [1, 2] } },
    notesList: [existingNote],
    articleCompanion: null,
    articleCompanionMap: {},
  })
})

describe('对照页笔记快捷入口', () => {
  it('博客已有对应笔记时直接在对照槽打开，不重复创建', async () => {
    render(<ArticleGuideTabs source="anthropic" />)

    const shortcut = screen.getByTestId('article-note-shortcut-anthropic')
    expect(shortcut.querySelector('svg')).not.toBeNull()
    expect(shortcut).toHaveClass('h-9', 'w-9')
    expect(shortcut.querySelector('svg')).toHaveAttribute('width', '20')
    expect(shortcut.parentElement).toHaveClass('h-11')
    expect(screen.getByTestId('article-panel-tab-companion-anthropic')).toHaveClass('text-sm')
    expect(shortcut).not.toHaveTextContent('笔记')
    fireEvent.click(shortcut)

    await waitFor(() => expect(useStore.getState().articleCompanion?.filePath).toBe(existingNote.path))
    expect(mockIpc.notesCreate).not.toHaveBeenCalled()
  })

  it('书籍章节没有对应笔记时自动新建并放进对照槽', async () => {
    useStore.setState({ notesList: [] })
    mockIpc.notesCreate.mockResolvedValue({ path: 'notes/chapter-1.md' })
    mockIpc.notesList.mockResolvedValue([])
    render(<ArticleGuideTabs source="book" />)

    fireEvent.click(screen.getByTestId('article-note-shortcut-book'))

    await waitFor(() => expect(useStore.getState().articleCompanion?.filePath).toBe('notes/chapter-1.md'))
    expect(mockIpc.notesCreate).toHaveBeenCalledWith({
      title: 'Book A · Chapter 1',
      url: '',
      source: 'book',
      book: 'Book A',
    })
  })

  it('当前对照已是对应笔记时禁用快捷入口', () => {
    useStore.setState({
      articleCompanion: {
        key: article.filePath,
        filePath: existingNote.path,
        kind: 'md',
        body: '',
        readonly: false,
        dirty: false,
        saving: 'idle',
      },
    })
    render(<ArticleGuideTabs source="anthropic" />)

    expect(screen.getByTestId('article-note-shortcut-anthropic')).toBeDisabled()
  })
})
