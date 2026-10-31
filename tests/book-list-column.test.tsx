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
    selectBook: vi.fn(),
    importBook: vi.fn(),
    reparseBook: vi.fn(),
  } as any)
})

describe('BookListColumn 删除入口', () => {
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
})
