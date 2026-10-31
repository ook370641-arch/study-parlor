import { beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'

const { useScrollMemoryMock, onScrollMock } = vi.hoisted(() => ({
  useScrollMemoryMock: vi.fn(() => ({ onScroll: vi.fn() })),
  onScrollMock: vi.fn(),
}))

vi.mock('@/lib/use-scroll-memory', () => ({ useScrollMemory: useScrollMemoryMock }))
vi.mock('@/lib/ipc', () => ({ ipc: { notesCreate: vi.fn() } }))
vi.mock('@/components/md/MarkdownRenderer', () => ({
  MarkdownRenderer: () => <div className="md-body"><div><p>第一段</p><p>第二段</p></div></div>,
}))
vi.mock('@/components/article-assistant/ArticleAnnotations', () => ({ ArticleAnnotations: () => null }))
vi.mock('@/components/article-assistant/AnnotationListButton', () => ({ AnnotationListButton: () => null }))
vi.mock('@/components/article-assistant/ArticleAssistantPanel', () => ({ ArticleAssistantPanel: () => null }))
vi.mock('@/components/briefing/PaintingPlate', () => ({ PaintingPlate: () => null }))
vi.mock('@/components/briefing/BriefingReaderControls', () => ({ BriefingReaderControls: () => null }))
vi.mock('@/components/Quote', () => ({ Quote: () => null }))

import { BookReader } from '@/components/books/BookReader'
import { useStore } from '@/store'

const chapterPath = 'book-a/chapters/01.md'

beforeEach(() => {
  cleanup()
  vi.clearAllMocks()
  useScrollMemoryMock.mockReturnValue({ onScroll: onScrollMock })
  useStore.setState({
    activeChapter: {
      path: chapterPath,
      content: '第一段\n\n第二段',
      meta: { title: 'C1', chapterIndex: 1, pageRange: [1, 2] },
    },
    bookContext: null,
    booksList: [],
    activeBookDir: 'book-a',
    briefingFontSize: 'base',
    bookScrollMemory: null,
  } as any)
})

describe('BookReader 阅读记忆与排版', () => {
  it('接线滚动容器、共同定位层与正文排版类', () => {
    render(<BookReader theme="academic" />)

    const scroll = screen.getByTestId('book-reader-scroll')
    expect(scroll).toBeInTheDocument()
    expect(screen.getByTestId('book-chapter-body').parentElement).toHaveClass('relative')
    expect(screen.getByTestId('book-chapter-body')).toHaveClass('book-chapter-reader')

    fireEvent.scroll(scroll)
    expect(onScrollMock).toHaveBeenCalled()
  })

  it('按章节路径和 Markdown 块配置滚动记忆', () => {
    const flushBookScrollPosition = vi.fn()
    useStore.setState({ flushBookScrollPosition } as any)

    render(<BookReader theme="academic" />)

    const options = useScrollMemoryMock.mock.calls[0][0]
    expect(options.memKey).toBe(chapterPath)
    expect(options.getBlocks()).toHaveLength(2)
    options.flush(chapterPath, 7)
    expect(flushBookScrollPosition).toHaveBeenCalledWith(chapterPath, 7)
  })
})
