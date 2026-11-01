import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, fireEvent, cleanup } from '@testing-library/react'
import { useStore } from '@/store'
import { NotesShelf } from '@/components/notes/NotesShelf'
import type { NoteEntry } from '@shared/index'

const entry: NoteEntry = {
  path: 'notes/a.md',
  meta: { title: 'A', url: 'https://x.com/a', source: 'web', rating: 3, summary: '', highlight: '', collected_at: '2026-09-01' },
}

const bookChapter = (chapter: string, date: string): NoteEntry => ({
  path: `notes/${chapter}.md`,
  meta: { title: `深度工作 · ${chapter}`, url: `https://x.com/${chapter}`, source: 'book', book: '深度工作', chapter, rating: 4, summary: '', highlight: '', collected_at: date },
})

beforeEach(() => {
  cleanup()
  useStore.setState({
    notesList: [entry], notesCategory: 'all', notesSortBy: 'time',
    writingAssistantOpen: false, writingPanelMode: 'assistant', writingFile: null,
    loadNotes: vi.fn(),
  })
})

describe('NotesShelf 点击分派', () => {
  it('常态点击打开主文', () => {
    const spy = vi.fn()
    useStore.setState({ selectWritingFile: spy })
    const { getByTestId } = render(<NotesShelf />)
    fireEvent.click(getByTestId('note-card-a'))
    expect(spy).toHaveBeenCalledWith('notes/a.md')
  })
  it('对照 armed 点击放入对照槽', () => {
    const spy = vi.fn()
    useStore.setState({ writingAssistantOpen: true, writingPanelMode: 'companion', selectCompanionFile: spy })
    const { getByTestId } = render(<NotesShelf />)
    fireEvent.click(getByTestId('note-card-a'))
    expect(spy).toHaveBeenCalledWith('notes/a.md')
  })
  it('同书聚合成一行，章节下拉打开所选主文', () => {
    const spy = vi.fn()
    useStore.setState({ notesList: [bookChapter('ch1', '2026-09-01'), bookChapter('ch2', '2026-09-02')], selectWritingFile: spy })
    const { container, getByTestId } = render(<NotesShelf />)
    expect(container.querySelectorAll('[data-testid^="note-card-"]')).toHaveLength(1)
    fireEvent.change(getByTestId('book-chapter-select-深度工作'), { target: { value: 'notes/ch1.md' } })
    expect(spy).toHaveBeenCalledTimes(1)
    expect(spy).toHaveBeenCalledWith('notes/ch1.md')
  })
  it('对照模式的章节下拉只选择对应笔记', () => {
    const spy = vi.fn()
    useStore.setState({
      notesList: [bookChapter('ch1', '2026-09-01'), bookChapter('ch2', '2026-09-02')],
      writingAssistantOpen: true, writingPanelMode: 'companion', selectCompanionFile: spy,
    })
    const { getByTestId } = render(<NotesShelf />)
    fireEvent.change(getByTestId('book-chapter-select-深度工作'), { target: { value: 'notes/ch2.md' } })
    expect(spy).toHaveBeenCalledTimes(1)
    expect(spy).toHaveBeenCalledWith('notes/ch2.md')
  })
})
