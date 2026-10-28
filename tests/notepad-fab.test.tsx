// 2026-10-27 回归：旁注聊天窗固定在右下角，记事板悬浮球（z-30）会压住发送按钮。
// 聊天打开时隐藏悬浮球，让出点击区域；关闭聊天后恢复。
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'

const state = vi.hoisted(() => ({ chatOpen: false }))

vi.mock('@/store', () => ({
  useStore: (selector: (s: unknown) => unknown) =>
    selector({ assistantSession: state.chatOpen ? { isOpen: true } : null }),
}))
vi.mock('@/components/NotepadPanel', () => ({ NotepadPanel: () => null }))

import { NotepadFab } from '@/components/NotepadFab'

afterEach(cleanup)

describe('NotepadFab 与旁注聊天窗的叠层让位', () => {
  it('聊天关闭时显示悬浮球', () => {
    state.chatOpen = false
    render(<NotepadFab />)
    expect(screen.getByTestId('notepad-fab-button')).toBeInTheDocument()
  })

  it('聊天打开时隐藏悬浮球，避免遮挡发送按钮', () => {
    state.chatOpen = true
    render(<NotepadFab />)
    expect(screen.queryByTestId('notepad-fab-button')).toBeNull()
  })
})
