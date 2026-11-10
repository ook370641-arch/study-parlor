import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, fireEvent, cleanup } from '@testing-library/react'
import { useStore } from '@/store'
import { NoteBoard } from '@/components/notes/NoteBoard'
import type { NoteEntry } from '@shared/index'

vi.mock('@/components/writing/WritingEditor', () => ({ WritingEditor: () => <div data-testid="main-writing-editor" /> }))

const entry: NoteEntry = {
  path: 'notes/a.md',
  meta: { title: 'A', url: 'https://x.com/a', source: 'anthropic', rating: 4, summary: '摘要', highlight: '亮点', collected_at: '2026-09-01' },
}

beforeEach(() => {
  cleanup()
  useStore.setState({
    notesList: [entry],
    writingFile: { path: 'notes/a.md', body: '# 正文', kind: 'md', dirty: false, saving: 'idle' },
    aiNoteGenerations: {},
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
  it('正文与写作页共享宽度和字号设置', () => {
    useStore.setState({ writingUIFontSize: 'xl' })
    const { getByTestId } = render(<NoteBoard />)
    const board = getByTestId('note-board')
    expect(board.style.getPropertyValue('--writing-body-size')).toBe('23px')
    const editor = getByTestId('note-editor')
    expect(editor).toHaveClass('px-8', 'py-6')
    expect(editor.style.fontSize).toBe('var(--writing-body-size)')
    expect(editor.querySelector('[style*="max-width"]')).toBeNull()
  })
  it('链接/亮点输入收在 ⓘ 弹层，默认不可见，点 toggle 可见', () => {
    const { getByTestId, queryByTestId } = render(<NoteBoard />)
    expect(queryByTestId('note-meta-url')).toBeNull()
    fireEvent.click(getByTestId('note-meta-info-toggle'))
    expect(getByTestId('note-meta-url')).toBeTruthy()
    expect(getByTestId('note-meta-highlight')).toBeTruthy()
  })

  it('AI 自动写入期间卸载主笔记编辑器，阻止新输入被覆盖', () => {
    useStore.setState({
      aiNoteGenerations: {
        [entry.path]: {
          path: entry.path,
          stage: 'writing',
          candidate: { generationId: 'generation-1', path: entry.path, body: 'AI 正文' },
          applying: true,
        },
      },
    })

    const { queryByTestId, getByTestId } = render(<NoteBoard />)

    expect(queryByTestId('main-writing-editor')).toBeNull()
    expect(getByTestId('note-ai-applying')).toHaveTextContent('正在写入')
  })
})
