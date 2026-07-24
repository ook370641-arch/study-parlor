import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react'

const patchState = vi.fn()
vi.mock('@/lib/ipc', () => ({
  ipc: {
    patchState: (...a: unknown[]) => patchState(...a),
    writingCreateFile: vi.fn(),
    writingCreateFolder: vi.fn(),
    writingImportFiles: vi.fn(),
  },
}))
vi.mock('@/lib/paintings', () => ({ manifest: [], pickRandom: vi.fn(() => null) }))

import { useStore } from '@/store'
import { BriefingSourceSidebar } from '@/components/BriefingSourceSidebar'
import { WritingListColumn } from '@/components/writing/WritingListColumn'

describe('writing UI font size', () => {
  beforeEach(() => {
    cleanup()
    patchState.mockReset()
    useStore.setState({
      briefingSource: 'writing',
      writingUIFontSize: 'base',
      writingListTab: 'articles',
      writingTree: { writing: [{ kind: 'file', name: 'a.md', path: 'writing/a.md' }], repository: [] },
      writingFile: null,
      loadWritingTree: vi.fn(),
      selectWritingFile: vi.fn(),
    } as any)
  })

  it('rail shows writing-ui controls on writing source and persists changes', async () => {
    render(<BriefingSourceSidebar collapsed={false} onToggle={vi.fn()} theme="academic" />)
    expect(screen.queryByTestId('briefing-font-size-increase')).not.toBeInTheDocument()
    fireEvent.click(screen.getByTestId('writing-ui-font-size-increase'))
    await waitFor(() => {
      expect(useStore.getState().writingUIFontSize).toBe('lg')
    })
    expect(patchState).toHaveBeenCalledWith({ writingUIFontSize: 'lg' })
  })

  it('writing list column tabs and tree nodes consume --writing-ui-size', () => {
    useStore.setState({
      writingOrder: {},
    } as any)
    render(<WritingListColumn theme="academic" />)
    expect(screen.getByTestId('writing-list-tab-articles').style.fontSize).toBe('var(--writing-ui-size)')
    expect(screen.getByTestId('writing-tree-node').style.fontSize).toBe('var(--writing-ui-size)')
  })
})
