import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, fireEvent } from '@testing-library/react'
import { useStore } from '@/store'
import { CompanionWritingPicker } from '@/components/article-assistant/CompanionWritingPicker'
import type { NoteEntry } from '@shared/index'

const note: NoteEntry = {
  path: 'notes/n1.md',
  meta: { title: '笔记一', url: 'https://x.com/n1', source: 'web', rating: 0, summary: '', highlight: '', collected_at: '2026-09-01' },
}

beforeEach(() => {
  useStore.setState({ notesList: [note], notesCategory: 'all', notesSortBy: 'time', writingTree: null, loadNotes: vi.fn(), loadWritingTree: vi.fn() })
})

describe('CompanionWritingPicker 笔记区', () => {
  it('列出笔记，点击交给 onPickFile', () => {
    const onPick = vi.fn()
    const { getByTestId } = render(<CompanionWritingPicker onPickFile={onPick} />)
    fireEvent.click(getByTestId('picker-note-n1'))
    expect(onPick).toHaveBeenCalledWith('notes/n1.md')
  })
})
