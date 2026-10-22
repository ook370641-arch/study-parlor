import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, fireEvent, cleanup } from '@testing-library/react'
import { useStore } from '@/store'
import { NotesShelf } from '@/components/notes/NotesShelf'
import type { NoteEntry } from '@shared/index'

const entry: NoteEntry = {
  path: 'notes/a.md',
  meta: { title: 'A', url: 'https://x.com/a', source: 'web', rating: 3, summary: '', highlight: '', collected_at: '2026-09-01' },
}

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
})
