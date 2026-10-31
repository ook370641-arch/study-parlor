// 书籍 store 健壮性：不依赖真实 Electron，mock 掉 renderer 侧 ipc facade。
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/ipc', () => ({
  ipc: {
    patchState: vi.fn(async () => {}),
    patchStateSync: vi.fn(),
    booksList: vi.fn(async () => []),
    booksChapters: vi.fn(async () => []),
    booksReadChapter: vi.fn(async () => ({
      content: '# C1',
      meta: { title: 'C1', chapterIndex: 1, pageRange: [1, 2] },
    })),
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
const booksReadChapterMock = vi.mocked(ipc.booksReadChapter)
const booksBookGuideMock = vi.mocked(ipc.booksBookGuide)
const booksDeleteMock = vi.mocked(ipc.booksDelete)
const patchStateMock = vi.mocked(ipc.patchState)
const patchStateSyncMock = vi.mocked(ipc.patchStateSync)

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
    booksLastChapter: null,
    bookScrollMemory: null,
    annotationHighlightColor: 'gold',
    articleCompanion: null,
    articleCompanionMap: {},
    articlePanelMode: { anthropic: 'guide', book: 'guide' },
    assistantSession: null,
  } as any)
})

describe('书籍阅读记忆', () => {
  it('章节读取成功后持久化最后章节并同步保存滚动位置', async () => {
    useStore.setState({
      activeBookDir: 'book-a',
      activeBookToc: [{ title: 'C1', chapterFile: 'chapters/01.md', pageStart: 1, pageEnd: 2 }],
    } as any)

    await useStore.getState().selectChapter('book-a/chapters/01.md')
    expect(patchStateMock).toHaveBeenCalledWith(expect.objectContaining({ booksLastChapter: 'book-a/chapters/01.md' }))

    useStore.getState().flushBookScrollPosition('book-a/chapters/01.md', 7)
    expect(patchStateSyncMock).toHaveBeenCalledWith({ bookScrollMemory: { filePath: 'book-a/chapters/01.md', blockIndex: 7 } })
  })

  it('选书后恢复属于本书且仍在目录中的最后章节', async () => {
    useStore.setState({ booksLastChapter: 'book-a/chapters/01.md' } as any)
    booksChaptersMock.mockResolvedValue([{ title: 'C1', chapterFile: 'chapters/01.md', pageStart: 1, pageEnd: 2 }])

    await useStore.getState().selectBook('book-a')

    expect(booksReadChapterMock).toHaveBeenCalledWith({ chapterPath: 'book-a/chapters/01.md' })
    expect(useStore.getState().activeChapter?.path).toBe('book-a/chapters/01.md')
  })

  it.each([
    ['其他书', 'book-b/chapters/01.md', [{ title: 'C1', chapterFile: 'chapters/01.md', pageStart: 1, pageEnd: 2 }]],
    ['已不在目录中的章节', 'book-a/chapters/removed.md', [{ title: 'C1', chapterFile: 'chapters/01.md', pageStart: 1, pageEnd: 2 }]],
  ])('不恢复%s', async (_label, booksLastChapter, toc) => {
    useStore.setState({ booksLastChapter } as any)
    booksChaptersMock.mockResolvedValue(toc)

    await useStore.getState().selectBook('book-a')

    expect(booksReadChapterMock).not.toHaveBeenCalled()
    expect(useStore.getState().activeChapter).toBeNull()
  })

  it('删除书时清理该书的持久章节和滚动槽', async () => {
    const dir = 'book-a'
    useStore.setState({
      booksLastChapter: `${dir}/chapters/01.md`,
      bookScrollMemory: { filePath: `${dir}/chapters/01.md`, blockIndex: 7 },
    } as any)

    await useStore.getState().removeBook(dir)

    expect(useStore.getState().booksLastChapter).toBeNull()
    expect(useStore.getState().bookScrollMemory).toBeNull()
    expect(patchStateMock).toHaveBeenCalledWith(expect.objectContaining({ booksLastChapter: null, bookScrollMemory: null }))
  })

  it('删除后到达的待处理滚动 flush 不会恢复已删章节', async () => {
    const dir = 'book-a'
    const chapterPath = `${dir}/chapters/01.md`
    useStore.setState({
      activeBookDir: dir,
      activeChapter: { path: chapterPath, content: 'x', meta: { title: 'C1', chapterIndex: 1, pageRange: [1, 2] } },
      booksLastChapter: chapterPath,
      bookScrollMemory: { filePath: chapterPath, blockIndex: 7 },
    } as any)
    const pendingFlush = () => useStore.getState().flushBookScrollPosition(chapterPath, 9)

    await useStore.getState().removeBook(dir)
    patchStateSyncMock.mockClear()
    pendingFlush()

    expect(useStore.getState().bookScrollMemory).toBeNull()
    expect(patchStateSyncMock).not.toHaveBeenCalled()
  })

  it('恢复章节等待期间换书后不再生成旧书全书导读', async () => {
    let finishChapterRead: (() => void) | undefined
    booksReadChapterMock.mockImplementationOnce(() => new Promise<Awaited<ReturnType<typeof ipc.booksReadChapter>>>((resolve) => {
      finishChapterRead = () => resolve({
        content: '# C1',
        meta: { title: 'C1', chapterIndex: 1, pageRange: [1, 2] },
      })
    }))
    booksChaptersMock.mockImplementation(async ({ bookDir }) => bookDir === 'book-a'
      ? [{ title: 'C1', chapterFile: 'chapters/01.md', pageStart: 1, pageEnd: 2 }]
      : [])
    useStore.setState({
      booksList: [book('book-a', 'A')],
      booksLastChapter: 'book-a/chapters/01.md',
    } as any)

    const restoring = useStore.getState().selectBook('book-a')
    await vi.waitFor(() => expect(booksReadChapterMock).toHaveBeenCalledWith({ chapterPath: 'book-a/chapters/01.md' }))
    await useStore.getState().selectBook('book-b')
    finishChapterRead!()
    await restoring

    expect(booksBookGuideMock).not.toHaveBeenCalled()
  })

  it('持久化当前高亮色', () => {
    useStore.getState().setAnnotationHighlightColor('blue')

    expect(useStore.getState().annotationHighlightColor).toBe('blue')
    expect(patchStateMock).toHaveBeenCalledWith({ annotationHighlightColor: 'blue' })
  })
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
