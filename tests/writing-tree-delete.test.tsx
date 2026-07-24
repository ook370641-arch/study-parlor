import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react'

const writingDelete = vi.fn()
vi.mock('@/lib/ipc', () => ({
  ipc: {
    writingDelete: (...args: unknown[]) => writingDelete(...args),
    writingRename: vi.fn(), writingCreateFile: vi.fn(), writingCreateFolder: vi.fn(), writingMove: vi.fn(),
  },
}))

import { useStore } from '@/store'
import { WritingTree } from '@/components/writing/WritingTree'

describe('WritingTree delete', () => {
  beforeEach(() => {
    cleanup()
    writingDelete.mockReset()
    writingDelete.mockResolvedValue({ ok: true })
    useStore.setState({
      writingTree: { writing: [{ kind: 'file', name: 'a.md', path: 'writing/a.md' }], repository: [] },
      writingFile: null, selectWritingFile: vi.fn(), loadWritingTree: vi.fn(),
    } as any)
  })

  it('asks via ConfirmDialog and deletes on confirm', async () => {
    render(<WritingTree root="writing" />)
    fireEvent.contextMenu(screen.getByTestId('writing-tree-node'))
    fireEvent.click(screen.getByText('删除'))
    expect(screen.getByTestId('confirm-dialog')).toBeInTheDocument()
    expect(writingDelete).not.toHaveBeenCalled()
    fireEvent.click(screen.getByTestId('confirm-dialog-confirm'))
    await waitFor(() => expect(writingDelete).toHaveBeenCalledWith({ path: 'writing/a.md' }))
  })

  it('does not delete on cancel', () => {
    render(<WritingTree root="writing" />)
    fireEvent.contextMenu(screen.getByTestId('writing-tree-node'))
    fireEvent.click(screen.getByText('删除'))
    fireEvent.click(screen.getByTestId('confirm-dialog-cancel'))
    expect(writingDelete).not.toHaveBeenCalled()
  })
})
