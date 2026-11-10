import { beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render } from '@testing-library/react'
import { ArticleCompanionBoard } from '@/components/article-assistant/ArticleCompanionBoard'
import { useStore } from '@/store'
import type { NoteEntry } from '@shared/index'

vi.mock('@/components/writing/WritingEditor', () => ({ WritingEditor: () => <div data-testid="companion-writing-editor" /> }))

const blogEntry: NoteEntry = {
  path: 'notes/a.md',
  meta: { title: 'A', url: 'https://example.com/a', source: 'anthropic', rating: 0, summary: '', highlight: '', collected_at: '2026-11-05' },
}

function setBlogCompanion(url = 'https://example.com/a/'): void {
  useStore.setState({
    articleCompanion: { key: 'article-path', filePath: blogEntry.path, kind: 'md', body: '原笔迹', readonly: false, dirty: false, saving: 'idle' },
    notesList: [blogEntry],
    anthropicReaderFilePath: 'article-path',
    anthropicBlogCache: {
      lastFetchedAt: null, loading: false, error: null, sectionStatus: {}, articleMetaCache: {},
      articles: [{ filePath: 'article-path', url, title: 'A' }],
    } as any,
    activeChapter: null,
    activeBookDir: null,
    booksList: [],
    aiNoteGenerations: {},
    generateAiNote: vi.fn(),
  })
}

beforeEach(() => {
  cleanup()
  setBlogCompanion()
})

describe('对照页 AI 笔记入口', () => {
  it('当前博客与对照笔记精确匹配时显示 Sparkles', () => {
    const { getByTestId, getByText, queryByTestId } = render(<ArticleCompanionBoard />)
    expect(getByTestId('article-companion-ai-entry')).toBeTruthy()
    expect(getByTestId('note-ai-generate')).toHaveAttribute('aria-label', '生成笔记')
    expect(getByText('a.md')).toHaveClass('text-base')
    expect(getByTestId('article-companion-insert-hr')).toHaveClass('h-9', 'w-9')
    expect(getByTestId('article-companion-insert-hr').querySelector('svg')).toHaveAttribute('width', '22')
    expect(getByTestId('note-ai-generate')).toHaveClass('h-9', 'w-9')
    expect(getByTestId('note-ai-generate').querySelector('svg')).toHaveAttribute('width', '18')
    expect(getByTestId('article-companion-actions')).toHaveClass('ml-auto')
    expect(queryByTestId('article-companion-close')).toBeNull()
  })

  it('错配、只读与已生成笔记不显示入口', () => {
    setBlogCompanion('https://example.com/other')
    const mismatched = render(<ArticleCompanionBoard />)
    expect(mismatched.queryByTestId('note-ai-generate')).toBeNull()
    mismatched.unmount()

    setBlogCompanion()
    useStore.setState({ articleCompanion: { ...useStore.getState().articleCompanion!, readonly: true } })
    const readonly = render(<ArticleCompanionBoard />)
    expect(readonly.queryByTestId('note-ai-generate')).toBeNull()
    readonly.unmount()

    setBlogCompanion()
    useStore.setState({ notesList: [{ ...blogEntry, meta: { ...blogEntry.meta, ai_generated_at: '2026-11-05T00:00:00.000Z' } }] })
    expect(render(<ArticleCompanionBoard />).queryByTestId('note-ai-generate')).toBeNull()
  })

  it('当前书籍章节匹配时显示，章节错配时不显示', () => {
    const bookEntry: NoteEntry = { ...blogEntry, meta: { ...blogEntry.meta, source: 'book', url: '', book: '书', chapter: '第一章', title: '书 · 第一章' } }
    useStore.setState({
      articleCompanion: { key: 'chapter-path', filePath: bookEntry.path, kind: 'md', body: '原笔迹', readonly: false, dirty: false, saving: 'idle' },
      notesList: [bookEntry],
      activeChapter: { path: 'chapter-path', content: '正文', meta: { title: '第一章', chapterIndex: 0, pageRange: [1, 2] } },
      activeBookDir: 'book-dir',
      booksList: [{ dir: 'book-dir', title: '书', importedAt: '2026-11-05', hasToc: true, chapterCount: 2 }],
    })
    const matched = render(<ArticleCompanionBoard />)
    expect(matched.getByTestId('note-ai-generate')).toBeTruthy()
    matched.unmount()

    useStore.setState({ activeChapter: { path: 'chapter-path', content: '正文', meta: { title: '第二章', chapterIndex: 1, pageRange: [3, 4] } } })
    expect(render(<ArticleCompanionBoard />).queryByTestId('note-ai-generate')).toBeNull()
  })

  it('生成动画像导读一样占正文区，查看原笔迹才弹窗', () => {
    useStore.setState({
      aiNoteGenerations: {
        [blogEntry.path]: { path: blogEntry.path, stage: 'round2', candidate: null, applying: false },
      },
    })
    const { getByTestId, getByText, queryByTestId } = render(<ArticleCompanionBoard />)

    expect(getByTestId('note-ai-generating')).not.toHaveClass('fixed')
    expect(queryByTestId('article-companion-editor-scroll')).toBeNull()
    expect(queryByTestId('note-ai-original')).toBeNull()
    fireEvent.click(getByTestId('note-ai-view-original'))
    expect(getByTestId('note-ai-original')).toBeTruthy()
    expect(getByText('原笔迹', { selector: 'p' })).toBeTruthy()
  })

  it('AI 自动写入期间卸载对照编辑器，阻止新输入被覆盖', () => {
    useStore.setState({
      aiNoteGenerations: {
        [blogEntry.path]: {
          path: blogEntry.path,
          stage: 'writing',
          candidate: { generationId: 'generation-1', path: blogEntry.path, body: 'AI 正文' },
          applying: true,
        },
      },
    })

    const { queryByTestId, getByTestId } = render(<ArticleCompanionBoard />)

    expect(queryByTestId('companion-writing-editor')).toBeNull()
    expect(getByTestId('article-companion-applying')).toHaveTextContent('正在写入')
  })
})
