import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, fireEvent, cleanup } from '@testing-library/react'
import { useStore } from '@/store'
import { NotesWall } from '@/components/notes/NotesWall'
import type { NoteEntry } from '@shared/index'

const mk = (slug: string, source: NoteEntry['meta']['source']): NoteEntry => ({
  path: `notes/${slug}.md`,
  meta: { title: `标题${slug}`, url: `https://x.com/${slug}`, source, rating: 4, summary: '', highlight: '', collected_at: '2026-09-01' },
})

beforeEach(() => {
  cleanup()
  useStore.setState({ notesList: [mk('a', 'web'), mk('b', 'book')], notesCategory: 'all', notesSortBy: 'time', writingFile: null })
})

describe('NotesWall', () => {
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
  it('空列表显示空态', () => {
    useStore.setState({ notesList: [] })
    const { getByTestId } = render(<NotesWall />)
    expect(getByTestId('notes-empty')).toBeTruthy()
  })
})
