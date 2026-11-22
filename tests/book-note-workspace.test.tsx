import { beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react'
import { BookNoteWorkspace } from '@/components/notes/BookNoteWorkspace'
import { NoteBoard } from '@/components/notes/NoteBoard'
import { useStore } from '@/store'
import type { BookEntry, NoteEntry } from '@shared/index'

const mockIpc = vi.hoisted(() => ({
  booksChapters: vi.fn(),
  writingRead: vi.fn(),
  articleAssistantReadGuide: vi.fn(),
  patchState: vi.fn(async () => {}),
}))
vi.mock('@/lib/ipc', () => ({ ipc: mockIpc }))
vi.mock('@/components/writing/WritingEditor', () => ({ WritingEditor: () => <div data-testid="main-writing-editor" /> }))

const whole: NoteEntry = {
  path: 'notes/whole.md',
  meta: { title: '书 · 整书笔记', url: '', source: 'book', book: '书', bookScope: 'whole', rating: 0, summary: '', highlight: '', collected_at: '2026-11-22' },
}
const chapterOne: NoteEntry = {
  path: 'notes/chapter-1.md',
  meta: { title: '书 · 第一章', url: '', source: 'book', book: '书', chapter: '第一章', rating: 0, summary: '', highlight: '', collected_at: '2026-11-21' },
}
const chapterTwo: NoteEntry = {
  path: 'notes/chapter-2.md',
  meta: { title: '书 · 第二章', url: '', source: 'book', book: '书', chapter: '第二章', rating: 0, summary: '', highlight: '', collected_at: '2026-11-20' },
}
const book: BookEntry = { dir: '/library/books/book', title: '书', importedAt: '2026-11-01', hasToc: true, chapterCount: 2, bookGuide: '短全书导读内容' }
const toc = [
  { title: '第一章', chapterFile: 'chapters/01.md', pageStart: 1, pageEnd: 2 },
  { title: '第二章', chapterFile: 'chapters/02.md', pageStart: 3, pageEnd: 4 },
]

beforeEach(() => {
  cleanup()
  vi.clearAllMocks()
  mockIpc.booksChapters.mockResolvedValue(toc)
  mockIpc.writingRead.mockImplementation(async ({ path }: { path: string }) => ({
    ok: true,
    value: { frontmatter: {}, body: path === chapterOne.path ? '第一章笔记正文' : '第二章笔记正文' },
  }))
  mockIpc.articleAssistantReadGuide.mockImplementation(async ({ parentPath }: { parentPath: string }) => ({
    filePath: `${parentPath}.guide.md`, generatedAt: '2026-11-22', guideVersion: 2,
    guide: { background: parentPath.includes('02.md') ? '第二章导读背景' : '第一章导读背景', chunks: [] },
  }))
  useStore.setState({
    booksList: [book], notesList: [whole, chapterOne, chapterTwo], briefingTheme: 'academic', immersiveMode: false,
    writingFile: { path: whole.path, body: '整书正文', kind: 'md', dirty: false, saving: 'idle' },
    articleAssistantGuideWidth: 320, articleAssistantGuideCollapsed: false,
    setArticleAssistantGuideWidth: vi.fn(), setArticleAssistantGuideCollapsed: vi.fn(),
    selectWritingFile: vi.fn(async () => {}), findOrCreateArticleNote: vi.fn(), showToast: vi.fn(), loadBooks: vi.fn(),
  })
})

describe('书籍笔记统一工作区', () => {
  it('右侧独立切换章节笔记和导读，不改变中间整书笔记', async () => {
    const screen = render(<BookNoteWorkspace entry={whole}><div data-testid="center-note">中间整书笔记</div></BookNoteWorkspace>)

    expect(await screen.findByText('第一章笔记正文')).toBeVisible()
    expect(screen.getByTestId('center-note')).toHaveTextContent('中间整书笔记')
    fireEvent.change(screen.getByTestId('book-material-chapter-select'), { target: { value: '/library/books/book/chapters/02.md' } })
    expect(await screen.findByText('第二章笔记正文')).toBeVisible()
    expect(useStore.getState().selectWritingFile).not.toHaveBeenCalled()
    expect(screen.getByTestId('center-note')).toHaveTextContent('中间整书笔记')

    fireEvent.click(screen.getByTestId('book-material-tab-guide'))
    expect(await screen.findByText('第二章导读背景')).toBeVisible()
    expect(useStore.getState().selectWritingFile).not.toHaveBeenCalled()

    fireEvent.click(screen.getByTestId(`book-note-top-${chapterOne.path}`))
    expect(useStore.getState().selectWritingFile).toHaveBeenCalledWith(chapterOne.path)
  })

  it('顶部整书入口按需创建后打开，不自动生成章节导读', async () => {
    useStore.setState({
      notesList: [chapterOne],
      writingFile: { path: chapterOne.path, body: '章节正文', kind: 'md', dirty: false, saving: 'idle' },
      findOrCreateArticleNote: vi.fn(async () => ({ path: whole.path, created: true })),
    })
    const screen = render(<BookNoteWorkspace entry={chapterOne}><div /></BookNoteWorkspace>)

    fireEvent.click(await screen.findByTestId('book-note-top-whole'))

    expect(useStore.getState().findOrCreateArticleNote).toHaveBeenCalledWith({
      title: '书 · 整书笔记', url: '', source: 'book', book: '书', bookScope: 'whole',
    })
    await waitFor(() => expect(useStore.getState().selectWritingFile).toHaveBeenCalledWith(whole.path))
    expect(mockIpc.articleAssistantReadGuide).not.toHaveBeenCalled()
  })

  it('沿用现有侧栏折叠控制和拖拽分隔条', async () => {
    const setCollapsed = vi.fn()
    useStore.setState({ setArticleAssistantGuideCollapsed: setCollapsed })
    const screen = render(<BookNoteWorkspace entry={whole}><div /></BookNoteWorkspace>)

    expect(await screen.findByTestId('article-assistant-divider')).toBeVisible()
    fireEvent.click(screen.getByTestId('article-assistant-divider-toggle'))
    expect(setCollapsed).toHaveBeenCalledWith(true)
  })

  it('书籍笔记接入统一工作区，整书正文使用原笔迹输入区', async () => {
    useStore.setState({
      notesList: [whole, chapterOne],
      writingFile: { path: whole.path, body: '已有全书笔记', kind: 'md', dirty: false, saving: 'idle' },
      updateWritingBody: vi.fn(), saveWritingFile: vi.fn(), aiNoteGenerations: {},
    })
    const screen = render(<NoteBoard />)

    expect(await screen.findByTestId('book-note-workspace')).toBeVisible()
    expect(screen.getByTestId('whole-book-note-editor')).toBeVisible()
    expect(screen.getByLabelText('已有全书笔记')).toHaveValue('已有全书笔记')
    expect(screen.getByText('短全书导读内容')).toBeVisible()
  })
})
