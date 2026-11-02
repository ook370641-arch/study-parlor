import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, fireEvent, cleanup } from '@testing-library/react'
import { useStore } from '@/store'
import { NotesWall } from '@/components/notes/NotesWall'
import type { NoteEntry } from '@shared/index'

const mk = (slug: string, source: NoteEntry['meta']['source']): NoteEntry => ({
  path: `notes/${slug}.md`,
  meta: { title: `标题${slug}`, url: `https://x.com/${slug}`, source, rating: 4, summary: '', highlight: '', collected_at: '2026-09-01' },
})

const bookChapter = (chapter: string, date: string): NoteEntry => ({
  path: `notes/${chapter}.md`,
  meta: { title: `深度工作 · ${chapter}`, url: `https://x.com/${chapter}`, source: 'book', book: '深度工作', chapter, rating: 4, summary: '', highlight: '', collected_at: date },
})

beforeEach(() => {
  cleanup()
  useStore.setState({ notesList: [mk('a', 'web'), mk('b', 'book')], notesCategory: 'all', notesSortBy: 'time', writingFile: null })
})

describe('NotesWall', () => {
  it('第一行提供来源筛选和排序，并更新共享状态', () => {
    const setNotesCategory = vi.fn()
    const setNotesSortBy = vi.fn()
    useStore.setState({ setNotesCategory, setNotesSortBy })
    const { getByTestId } = render(<NotesWall />)
    fireEvent.change(getByTestId('notes-wall-category-select'), { target: { value: 'web' } })
    fireEvent.change(getByTestId('notes-wall-sort-select'), { target: { value: 'source' } })
    expect(setNotesCategory).toHaveBeenCalledWith('web')
    expect(setNotesSortBy).toHaveBeenCalledWith('source')
  })
  it('渲染全部专辑卡', () => {
    const { getByTestId } = render(<NotesWall />)
    expect(getByTestId('wall-album-a')).toBeTruthy()
    expect(getByTestId('wall-album-b')).toBeTruthy()
  })
  it('点专辑打开正文', () => {
    const spy = vi.fn()
    useStore.setState({ selectWritingFile: spy })
    const { getByTestId } = render(<NotesWall />)
    fireEvent.click(getByTestId('wall-album-a'))
    expect(spy).toHaveBeenCalledWith('notes/a.md')
  })
  it('同书只显示一张卡，切换章节只打开所选笔记', () => {
    const spy = vi.fn()
    useStore.setState({ notesList: [bookChapter('ch1', '2026-09-01'), bookChapter('ch2', '2026-09-02')], selectWritingFile: spy })
    const { container, getByTestId } = render(<NotesWall />)
    expect(container.querySelectorAll('[data-testid^="wall-album-"]')).toHaveLength(1)
    const select = getByTestId('book-chapter-select-深度工作')
    expect(select).toHaveValue('notes/ch2.md')
    fireEvent.change(select, { target: { value: 'notes/ch1.md' } })
    expect(spy).toHaveBeenCalledTimes(1)
    expect(spy).toHaveBeenCalledWith('notes/ch1.md')
  })
  it('空列表显示空态', () => {
    useStore.setState({ notesList: [] })
    const { getByTestId } = render(<NotesWall />)
    expect(getByTestId('notes-wall-empty')).toBeTruthy()
    expect(getByTestId('notes-wall-category-select')).toBeTruthy()
    expect(getByTestId('notes-wall-sort-select')).toBeTruthy()
  })
  it('只为没有原图和生成封面的卡片显示生成入口', () => {
    const generated = { ...mk('generated', 'web'), coverUrl: 'data:image/svg+xml;base64,generated' }
    const original = mk('a', 'anthropic')
    original.meta.url = 'https://www.anthropic.com/engineering/foo'
    useStore.setState({
      notesList: [mk('plain', 'web'), generated, original],
      anthropicBlogCache: { articleMetaCache: { [original.meta.url]: { imageUrl: 'https://cdn.example.com/foo.png' } } },
    } as any)
    const { getAllByTestId } = render(<NotesWall />)
    expect(getAllByTestId('note-cover-generate')).toHaveLength(1)
  })
})
