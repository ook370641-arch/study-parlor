import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { NotepadItem } from '@shared/index'

vi.mock('@/lib/ipc', () => ({
  ipc: { getState: vi.fn(), patchState: vi.fn() },
}))

import { ipc } from '@/lib/ipc'
import { useStore } from '@/store'
import { NotepadPanel } from '@/components/NotepadPanel'

const item: NotepadItem = {
  id: 'n1',
  text: '设置中心',
  category: 'feature',
  createdAt: '2026-11-11T00:00:00Z',
}

beforeEach(() => {
  useStore.setState({ notepadItems: [], notepadLog: [], coverNotepad: '', toast: null } as any)
  vi.mocked(ipc.getState).mockReset()
  vi.mocked(ipc.patchState).mockReset()
})

afterEach(cleanup)

describe('记事板 agent 认领', () => {
  it('打开和窗口聚焦时刷新，并显示认领者', async () => {
    vi.mocked(ipc.getState).mockResolvedValue({
      coverNotepad: '',
      notepadItems: [{
        ...item,
        claim: { claimedBy: 'codex/a', claimedAt: '2026-11-11T01:00:00Z' },
      }],
      notepadLog: [],
    } as any)

    render(<NotepadPanel open onClose={vi.fn()} />)

    expect(await screen.findByTestId('notepad-claim-n1')).toHaveTextContent('处理中 · codex/a')
    expect(ipc.getState).toHaveBeenCalledTimes(1)

    fireEvent.focus(window)

    await waitFor(() => expect(ipc.getState).toHaveBeenCalledTimes(2))
  })

  it('刷新失败保留当前条目并提示', async () => {
    useStore.setState({ notepadItems: [item] })
    vi.mocked(ipc.getState).mockRejectedValue(new Error('boom'))

    render(<NotepadPanel open onClose={vi.fn()} />)

    await waitFor(() => expect(useStore.getState().toast?.message).toBe('记事板刷新失败'))
    expect(useStore.getState().notepadItems).toEqual([item])
    expect(screen.getByText('设置中心')).toBeInTheDocument()
  })
})
