import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'

const store = vi.hoisted(() => ({
  notepadItems: [],
  notepadLog: [],
  notepadFontSize: 'base',
  notepadPanelSize: null,
  addNotepadItem: vi.fn(),
  resolveNotepadItem: vi.fn(),
  deleteNotepadItem: vi.fn(),
  moveNotepadItem: vi.fn(),
  updateNotepadItem: vi.fn(),
  setNotepadFontSize: vi.fn(),
  setNotepadPanelSize: vi.fn(),
}))

vi.mock('@/store', () => ({
  useStore: (selector: (s: typeof store) => unknown) => selector(store),
}))

import { NotepadPanel } from '@/components/NotepadPanel'

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

function renderPanel(placement?: 'left' | 'right') {
  const onClose = vi.fn()
  render(
    <>
      <NotepadPanel open onClose={onClose} placement={placement} />
      <div data-testid="article-assistant-tab">
        <span data-testid="article-assistant-tab-child" />
      </div>
      <div data-testid="article-assistant-chat-window">
        <input data-testid="article-assistant-input" />
      </div>
      <div data-testid="notepad-test-outside" />
    </>,
  )
  return onClose
}

describe('NotepadPanel 与旁注聊天窗共存', () => {
  it('默认位于右侧，可切换为左侧', () => {
    const { unmount } = render(<NotepadPanel open onClose={vi.fn()} />)
    expect(screen.getByTestId('notepad-panel')).toHaveClass('right-5')
    unmount()

    renderPanel('left')
    expect(screen.getByTestId('notepad-panel')).toHaveClass('left-5')
  })

  it('旁注交互不关闭面板，普通外部区域仍关闭', () => {
    const onClose = renderPanel('left')

    fireEvent.mouseDown(screen.getByTestId('article-assistant-tab-child'))
    fireEvent.mouseDown(screen.getByTestId('article-assistant-input'))
    expect(onClose).not.toHaveBeenCalled()

    fireEvent.mouseDown(screen.getByTestId('notepad-test-outside'))
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})
