import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'

const state = vi.hoisted(() => ({ chatOpen: false }))

vi.mock('@/store', () => ({
  useStore: (selector: (s: unknown) => unknown) =>
    selector({ assistantSession: state.chatOpen ? { isOpen: true } : null }),
}))
vi.mock('@/components/NotepadPanel', () => ({
  NotepadPanel: ({ placement }: { placement?: 'left' | 'right' }) => (
    <div data-testid="notepad-panel-props" data-placement={placement} />
  ),
}))

import { NotepadFab } from '@/components/NotepadFab'

afterEach(cleanup)

describe('NotepadFab 与旁注聊天窗共存', () => {
  it('聊天关闭时显示悬浮球', () => {
    state.chatOpen = false
    render(<NotepadFab />)
    expect(screen.getByTestId('notepad-fab-button')).toBeInTheDocument()
    expect(screen.getByTestId('notepad-fab-button')).toHaveClass('right-5')
    expect(screen.getByTestId('notepad-panel-props')).toHaveAttribute('data-placement', 'right')
  })

  it('聊天打开时悬浮球与面板移到左侧', () => {
    state.chatOpen = true
    render(<NotepadFab />)
    expect(screen.getByTestId('notepad-fab-button')).toHaveClass('left-5')
    expect(screen.getByTestId('notepad-panel-props')).toHaveAttribute('data-placement', 'left')
  })
})
