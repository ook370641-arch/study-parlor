import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react'

const patchState = vi.fn()
vi.mock('@/lib/ipc', () => ({
  ipc: {
    patchState: (...a: unknown[]) => patchState(...a),
    getState: vi.fn(),
    scanLibrary: vi.fn(),
    loadGroups: vi.fn(),
    loadSessions: vi.fn(),
    llmWildcardInspiration: vi.fn(),
    briefingGenerate: vi.fn(),
    onBriefingProgress: vi.fn(() => () => {}),
    briefingList: vi.fn().mockResolvedValue([]),
    searchPrepare: vi.fn(),
    writingScanTree: vi.fn().mockResolvedValue({ ok: true, value: [] }),
    writingRefreshCatalog: vi.fn(),
    writingCreateFile: vi.fn(),
    writingCreateFolder: vi.fn(),
    writingImportFiles: vi.fn(),
    articleAssistantReadSession: vi.fn().mockResolvedValue(null),
    annotationsRead: vi.fn().mockResolvedValue([]),
    collectionRead: vi.fn().mockResolvedValue({ entries: [] }),
    anthropicCollectionRead: vi.fn().mockResolvedValue({ ok: true, collection: { version: 1, entries: [], dismissed: [], history: [] } }),
  },
}))
vi.mock('@/lib/paintings', () => ({ manifest: [], pickRandom: vi.fn(() => null) }))

import { useStore } from '@/store'
import { Briefing } from '@/pages/Briefing'
import { WritingListColumn } from '@/components/writing/WritingListColumn'

describe('writing UI font size', () => {
  beforeEach(() => {
    cleanup()
    patchState.mockReset()
    useStore.setState({
      briefing: { result: null, loading: false, error: null },
      briefingSource: 'writing',
      briefingTheme: 'academic',
      briefingHistory: { list: [], loading: false, error: null },
      currentPaintings: { briefing: null, cover: null, home: null, study: null },
      writingUIFontSize: 'base',
      writingListTab: 'articles',
      writingTree: { writing: [{ kind: 'file', name: 'a.md', path: 'writing/a.md' }], repository: [] },
      writingFile: null,
      loadWritingTree: vi.fn(),
      selectWritingFile: vi.fn(),
    } as any)
  })

  it('writing source shows writing-ui controls (not briefing font controls) and persists changes', async () => {
    render(<Briefing />)
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
