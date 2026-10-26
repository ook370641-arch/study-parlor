import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, fireEvent, cleanup } from '@testing-library/react'
import { useStore } from '@/store'
import { NoteBoard } from '@/components/notes/NoteBoard'
import type { NoteEntry } from '@shared/index'

vi.mock('@/components/writing/WritingEditor', () => ({ WritingEditor: () => null }))

const entry: NoteEntry = {
  path: 'notes/a.md',
  meta: { title: 'A', url: 'https://x.com/a', source: 'anthropic', rating: 4, summary: '摘要', highlight: '亮点', collected_at: '2026-09-01' },
}

beforeEach(() => {
  cleanup()
  useStore.setState({
    notesList: [entry],
    writingFile: { path: 'notes/a.md', body: '# 正文', kind: 'md', dirty: false, saving: 'idle' },
    updateWritingBody: vi.fn(), saveWritingFile: vi.fn(),
  })
})

describe('NoteBoard 阅读室', () => {
  it('返回按钮清空当前文件回专辑墙', () => {
    const spy = vi.fn()
    useStore.setState({ closeNoteToWall: spy })
    const { getByTestId } = render(<NoteBoard />)
    fireEvent.click(getByTestId('note-back-to-wall'))
    expect(spy).toHaveBeenCalled()
  })
  it('链接/亮点输入收在 ⓘ 弹层，默认不可见，点 toggle 可见', () => {
    const { getByTestId, queryByTestId } = render(<NoteBoard />)
    expect(queryByTestId('note-meta-url')).toBeNull()
    fireEvent.click(getByTestId('note-meta-info-toggle'))
    expect(getByTestId('note-meta-url')).toBeTruthy()
    expect(getByTestId('note-meta-highlight')).toBeTruthy()
  })
})
