import { beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'

const mockIpc = vi.hoisted(() => ({ booksChapters: vi.fn() }))

vi.mock('@/lib/ipc', () => ({ ipc: mockIpc }))

vi.mock('@/components/Tooltip', () => ({ Tooltip: ({ children }: { children: React.ReactNode }) => children }))

import { BookListColumn } from '@/components/books/BookListColumn'
import { useStore } from '@/store'

beforeEach(() => {
  cleanup()
  vi.clearAllMocks()
  mockIpc.booksChapters.mockResolvedValue([])
  useStore.setState({
    booksList: [{
      dir: 'book-a',
      title: 'Book A',
      importedAt: '2026-10-27T00:00:00.000Z',
      hasToc: true,
      chapterCount: 1,
      parserVersion: 3,
    }],
    booksLoading: false,
    booksImporting: false,
    booksReparsing: false,
    activeBookDir: 'book-a',
    activeBookToc: [{ title: 'Chapter 1', chapterFile: 'chapters/01.md', chapterIndex: 1, pageRange: [1, 2] }],
    activeChapter: null,
    booksLastChapter: null,
    selectBook: vi.fn(),
    selectChapter: vi.fn(),
    importBook: vi.fn(),
    reparseBook: vi.fn(),
  } as any)
})

describe('BookListColumn 书籍条目', () => {
  it('当前书显示垃圾桶图标并保留原删除行为', () => {
    const onRequestDelete = vi.fn()
    render(<BookListColumn theme="academic" onRequestDelete={onRequestDelete} />)

    const button = screen.getByTestId('book-delete-0')
    expect(button.querySelector('svg')).not.toBeNull()
    expect(button).not.toHaveTextContent('删除')

    fireEvent.click(button)
    expect(onRequestDelete).toHaveBeenCalledWith('book-a', 'Book A')
    expect(useStore.getState().selectBook).not.toHaveBeenCalled()
  })

  it('当前书在书卡下展开章节，并可折叠和选择章节', () => {
    render(<BookListColumn theme="academic" />)

    fireEvent.click(screen.getByTestId('chapter-row-0'))
    expect(useStore.getState().selectChapter).toHaveBeenCalledWith('book-a/chapters/01.md')

    fireEvent.click(screen.getByTestId('book-chapters-toggle-0'))
    expect(screen.queryByTestId('chapter-row-0')).toBeNull()
    fireEvent.click(screen.getByTestId('book-chapters-toggle-0'))
    expect(screen.getByTestId('chapter-row-0')).toBeTruthy()
  })

  it('展开其他书只读取目录，不改变当前选中书籍', async () => {
    const otherToc = [{ title: 'Other Chapter', chapterFile: 'chapters/02.md', chapterIndex: 1, pageRange: [3, 4] }]
    mockIpc.booksChapters.mockResolvedValue(otherToc)
    useStore.setState({
      booksList: [
        ...useStore.getState().booksList,
        { dir: 'book-b', title: 'Book B', importedAt: '2026-10-28T00:00:00.000Z', hasToc: true, chapterCount: 1, parserVersion: 3 },
      ],
    })
    render(<BookListColumn theme="academic" />)

    fireEvent.click(screen.getByTestId('book-chapters-toggle-1'))

    expect(useStore.getState().selectBook).not.toHaveBeenCalled()
    expect(mockIpc.booksChapters).toHaveBeenCalledWith({ bookDir: 'book-b' })
    expect(await screen.findByTestId('book-b-chapter-row-0')).toHaveTextContent('1. Other Chapter')
    expect(screen.getByTestId('chapter-row-0')).toHaveTextContent('1. Chapter 1')
    expect(useStore.getState().activeBookDir).toBe('book-a')
  })

  it('最近阅读章节使用无文字圆点标记', () => {
    useStore.setState({ booksLastChapter: 'book-a/chapters/01.md' })
    render(<BookListColumn theme="academic" />)

    const marker = screen.getByTestId('book-recent-chapter-marker')
    expect(marker).toHaveAttribute('title', '最近阅读')
    expect(marker).toHaveClass('rounded-full')
    expect(marker).toHaveTextContent('')
  })
})
