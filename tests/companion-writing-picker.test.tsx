import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, fireEvent, waitFor, cleanup } from '@testing-library/react'
import { useStore } from '@/store'
import { CompanionWritingPicker } from '@/components/article-assistant/CompanionWritingPicker'
import type { NoteEntry } from '@shared/index'

const note: NoteEntry = {
  path: 'notes/n1.md',
  meta: { title: '笔记一', url: 'https://x.com/n1', source: 'web', rating: 0, summary: '', highlight: '', collected_at: '2026-09-01' },
}

const bookChapter = (chapter: string, date: string): NoteEntry => ({
  path: `notes/${chapter}.md`,
  meta: { title: `深度工作 · ${chapter}`, url: `https://x.com/${chapter}`, source: 'book', book: '深度工作', chapter, rating: 0, summary: '', highlight: '', collected_at: date },
})

beforeEach(() => {
  cleanup()
  useStore.setState({ notesList: [note], notesCategory: 'all', notesSortBy: 'time', writingTree: null, loadNotes: vi.fn(), loadWritingTree: vi.fn() })
})

describe('CompanionWritingPicker 笔记区', () => {
  it('列出笔记，点击交给 onPickFile', () => {
    const onPick = vi.fn()
    const { getByTestId } = render(<CompanionWritingPicker onPickFile={onPick} />)
    fireEvent.click(getByTestId('picker-note-n1'))
    expect(onPick).toHaveBeenCalledWith('notes/n1.md')
  })

  it('笔记/仓库/文章三段可折叠，笔记前置', () => {
    const onPick = vi.fn()
    const { getByTestId, queryByTestId, getByText } = render(<CompanionWritingPicker onPickFile={onPick} />)
    // 笔记段排在仓库、文章之前
    const notesHeader = getByTestId('picker-section-notes')
    const repoHeader = getByTestId('picker-section-repository')
    const writingHeader = getByTestId('picker-section-writing')
    expect(notesHeader.compareDocumentPosition(repoHeader) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(repoHeader.compareDocumentPosition(writingHeader) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    // 折叠笔记段
    expect(getByTestId('picker-note-n1')).toBeTruthy()
    fireEvent.click(notesHeader)
    expect(queryByTestId('picker-note-n1')).toBeNull()
    expect(getByText('笔记')).toBeTruthy()
  })

  it('当前博客无对应笔记时显示「＋ 新建」，点击创建并选中', async () => {
    const onPick = vi.fn()
    const findOrCreateArticleNote = vi.fn().mockResolvedValue({ path: 'notes/new-note.md', created: true })
    useStore.setState({ findOrCreateArticleNote } as any)
    const { getByTestId } = render(
      <CompanionWritingPicker onPickFile={onPick} currentArticle={{ url: 'https://a.com/post', title: 'A 社新文' }} />
    )
    fireEvent.click(getByTestId('picker-note-create'))
    await waitFor(() => {
      expect(findOrCreateArticleNote).toHaveBeenCalledWith({ title: 'A 社新文', url: 'https://a.com/post' })
      expect(onPick).toHaveBeenCalledWith('notes/new-note.md')
    })
  })

  it('当前博客有对应笔记时高亮该笔记，不显示新建按钮', () => {
    const onPick = vi.fn()
    const { getByTestId, queryByTestId } = render(
      <CompanionWritingPicker onPickFile={onPick} currentArticle={{ url: 'https://x.com/n1', title: '笔记一' }} />
    )
    expect(getByTestId('picker-note-n1').getAttribute('data-current')).toBe('true')
    expect(queryByTestId('picker-note-create')).toBeNull()
  })
  it('书组保留当前章节匹配，并能切换挑选其他章节', () => {
    const onPick = vi.fn()
    useStore.setState({ notesList: [bookChapter('ch1', '2026-09-01'), bookChapter('ch2', '2026-09-02')] })
    const { getByTestId } = render(
      <CompanionWritingPicker
        onPickFile={onPick}
        currentTarget={{ key: 'books/deep/ch1.md', label: '深度工作 · ch1', noteExists: true }}
      />
    )
    const current = getByTestId('picker-note-ch2')
    expect(current).toHaveAttribute('data-current', 'true')
    const select = getByTestId('book-chapter-select-深度工作')
    expect(select).toHaveValue('notes/ch1.md')
    fireEvent.change(select, { target: { value: 'notes/ch2.md' } })
    expect(select).toHaveValue('notes/ch2.md')
    expect(onPick).toHaveBeenCalledTimes(1)
    expect(onPick).toHaveBeenCalledWith('notes/ch2.md')
  })
  it('对照书组复用任意章节已有的生成封面', () => {
    const covered = { ...bookChapter('ch1', '2026-09-01'), coverUrl: 'data:image/svg+xml;base64,book-cover' }
    useStore.setState({ notesList: [covered, bookChapter('ch2', '2026-09-02')] })
    const { getByTestId } = render(<CompanionWritingPicker onPickFile={vi.fn()} />)
    expect(getByTestId('picker-note-ch2').querySelector('img')).toHaveAttribute('src', covered.coverUrl)
  })
})
