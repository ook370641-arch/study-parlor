// 书籍 store 健壮性：不依赖真实 Electron，mock 掉 renderer 侧 ipc facade。
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/ipc', () => ({
  ipc: {
    patchState: vi.fn(async () => {}),
    booksList: vi.fn(async () => []),
    booksChapters: vi.fn(async () => []),
    booksBookGuide: vi.fn(async () => ({ content: '' })),
    booksDelete: vi.fn(async () => {}),
    articleAssistantAbort: vi.fn(async () => {}),
  },
}))

import { ipc } from '@/lib/ipc'
import { useStore } from '@/store'
import type { BookEntry } from '@shared/index'

const booksListMock = vi.mocked(ipc.booksList)
const booksChaptersMock = vi.mocked(ipc.booksChapters)
const booksDeleteMock = vi.mocked(ipc.booksDelete)
const patchStateMock = vi.mocked(ipc.patchState)

const book = (dir: string, title: string): BookEntry => ({
  dir,
  title,
  importedAt: '2026-10-27T00:00:00.000Z',
  hasToc: true,
  chapterCount: 1,
})

beforeEach(() => {
  vi.clearAllMocks()
  booksListMock.mockResolvedValue([])
  booksChaptersMock.mockResolvedValue([])
  useStore.setState({
    briefingSource: 'writing',
    booksList: [],
    booksLoading: false,
    booksImporting: false,
    activeBookDir: null,
    activeBookToc: [],
    activeChapter: null,
    bookContext: null,
    booksLastBook: null,
    articleCompanion: null,
    articleCompanionMap: {},
    articlePanelMode: { anthropic: 'guide', book: 'guide' },
    assistantSession: null,
  } as any)
})

describe('loadBooks', () => {
  it('非书籍栏目启动时不自动选书（避免全书导读 LLM）', async () => {
    booksListMock.mockResolvedValue([book('/lib/books/A', 'A')])

    await useStore.getState().loadBooks()

    expect(useStore.getState().booksList.map((b) => b.title)).toEqual(['A'])
    expect(useStore.getState().activeBookDir).toBeNull()
    expect(booksChaptersMock).not.toHaveBeenCalled()
  })

  it('书籍栏目下按 booksLastBook 恢复选中', async () => {
    useStore.setState({ briefingSource: 'book', booksLastBook: '/lib/books/B' } as any)
    booksListMock.mockResolvedValue([book('/lib/books/A', 'A'), book('/lib/books/B', 'B')])
    booksChaptersMock.mockResolvedValue([{ title: 'C1', chapterFile: 'chapters/01.md', pageStart: 1, pageEnd: 2 }])

    await useStore.getState().loadBooks()

    expect(useStore.getState().activeBookDir).toBe('/lib/books/B')
    expect(booksChaptersMock).toHaveBeenCalledWith({ bookDir: '/lib/books/B' })
  })

  it('activeBookDir 已不在列表时清空活动状态', async () => {
    useStore.setState({
      briefingSource: 'writing',
      activeBookDir: '/lib/books/gone',
      activeBookToc: [{ title: 'C1', chapterFile: 'chapters/01.md', pageStart: 1, pageEnd: 2 }],
      activeChapter: { path: '/lib/books/gone/chapters/01.md', content: 'x', meta: { title: 'C1', chapterIndex: 1, pageRange: [1, 2] } },
      bookContext: { bookTitle: 'gone', tocTitles: ['C1'] },
    } as any)
    booksListMock.mockResolvedValue([book('/lib/books/A', 'A')])

    await useStore.getState().loadBooks()

    const s = useStore.getState()
    expect(s.activeBookDir).toBeNull()
    expect(s.activeBookToc).toEqual([])
    expect(s.activeChapter).toBeNull()
    expect(s.bookContext).toBeNull()
  })
})

describe('removeBook', () => {
  it('清理 booksLastBook、活动章与该书目录下的对照映射', async () => {
    const dir = '/lib/books/JTBD'
    useStore.setState({
      briefingSource: 'writing',
      activeBookDir: dir,
      activeBookToc: [{ title: 'C1', chapterFile: 'chapters/01.md', pageStart: 1, pageEnd: 2 }],
      activeChapter: { path: `${dir}/chapters/01.md`, content: 'x', meta: { title: 'C1', chapterIndex: 1, pageRange: [1, 2] } },
      bookContext: { bookTitle: 'JTBD', tocTitles: ['C1'] },
      booksLastBook: dir,
      articleCompanion: {
        key: `${dir}/chapters/01.md`,
        filePath: '/lib/writing/companion.md',
        kind: 'md',
        body: 'x',
        readonly: false,
        dirty: false,
        saving: 'idle',
      },
      articleCompanionMap: {
        [`${dir}/chapters/01.md`]: '/lib/writing/companion.md',
        '/lib/books/OTHER/chapters/01.md': '/lib/writing/other.md',
      },
    } as any)
    booksDeleteMock.mockResolvedValue(undefined)

    await useStore.getState().removeBook(dir)

    expect(booksDeleteMock).toHaveBeenCalledWith({ bookDir: dir })
    const s = useStore.getState()
    expect(s.booksLastBook).toBeNull()
    expect(s.activeBookDir).toBeNull()
    expect(s.activeBookToc).toEqual([])
    expect(s.activeChapter).toBeNull()
    expect(s.articleCompanion).toBeNull()
    expect(s.articleCompanionMap).toEqual({ '/lib/books/OTHER/chapters/01.md': '/lib/writing/other.md' })
    expect(patchStateMock).toHaveBeenCalledWith({ booksLastBook: null })
    expect(patchStateMock).toHaveBeenCalledWith({
      articleCompanionMap: { '/lib/books/OTHER/chapters/01.md': '/lib/writing/other.md' },
    })
  })
})
