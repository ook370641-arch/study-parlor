import { beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'

vi.mock('@/components/Tooltip', () => ({ Tooltip: ({ children }: { children: React.ReactNode }) => children }))

import { BookListColumn } from '@/components/books/BookListColumn'
import { useStore } from '@/store'

beforeEach(() => {
  cleanup()
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
})
