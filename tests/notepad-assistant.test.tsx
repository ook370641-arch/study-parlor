import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { NotepadLogEntry } from '@shared/index'

const store = vi.hoisted(() => ({
  notepadItems: [],
  notepadLog: [] as NotepadLogEntry[],
  notepadFontSize: 'base',
  notepadPanelSize: null,
  addNotepadItem: vi.fn(),
  resolveNotepadItem: vi.fn(),
  deleteNotepadItem: vi.fn(),
  moveNotepadItem: vi.fn(),
  updateNotepadItem: vi.fn(),
  refreshNotepad: vi.fn(),
  setNotepadFontSize: vi.fn(),
  setNotepadPanelSize: vi.fn(),
}))

vi.mock('@/store', () => ({
  useStore: (selector: (s: typeof store) => unknown) => selector(store),
}))

import { NotepadPanel } from '@/components/NotepadPanel'

afterEach(() => {
  cleanup()
  store.notepadLog = []
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

  it.each([
    { placement: 'left' as const, startX: 20, endX: 60 },
    { placement: 'right' as const, startX: 100, endX: 60 },
  ])('$placement 布局沿上左拖柄向外拖动时加宽', ({ placement, startX, endX }) => {
    renderPanel(placement)

    fireEvent.pointerDown(screen.getByTestId('notepad-resize-grip'), { clientX: startX, clientY: 20 })
    fireEvent.pointerMove(window, { clientX: endX, clientY: 20 })

    expect(screen.getByTestId('notepad-panel')).toHaveStyle({ width: '424px' })
    fireEvent.pointerUp(window)
  })
})

describe('NotepadPanel 已完成时间线', () => {
  it('按解决时间倒序展示，最近完成的需求在最上方', () => {
    store.notepadLog = [
      {
        id: 'older',
        title: '较早完成的需求',
        text: '较早完成的需求',
        category: 'feature',
        createdAt: '2026-09-01T00:00:00.000Z',
        resolvedAt: '2026-10-01T00:00:00.000Z',
        source: 'user',
      },
      {
        id: 'newer',
        title: '最近完成的需求',
        text: '最近完成的需求',
        category: 'improvement',
        createdAt: '2026-10-01T00:00:00.000Z',
        resolvedAt: '2026-11-05T00:00:00.000Z',
        source: 'agent',
      },
    ]

    renderPanel()
    fireEvent.click(screen.getByTestId('notepad-tab-done'))

    const entries = screen.getAllByTestId('notepad-log-entry')
    expect(entries).toHaveLength(2)
    expect(entries[0]).toHaveTextContent('最近完成的需求')
    expect(entries[1]).toHaveTextContent('较早完成的需求')
  })
})
