import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react'

vi.mock('@/lib/ipc', () => ({
  ipc: {
    patchState: vi.fn(),
    getState: vi.fn(),
    scanLibrary: vi.fn(),
    loadGroups: vi.fn(),
    loadSessions: vi.fn(),
    llmWildcardInspiration: vi.fn(),
    briefingGenerate: vi.fn(),
    onBriefingProgress: vi.fn(() => () => {}),
    briefingList: vi.fn().mockResolvedValue([]),
    searchPrepare: vi.fn(),
  }
}))

vi.mock('@/lib/paintings', () => ({
  manifest: [{ id: 'test', painter: 'Test', title: 'Test', url: '/test.jpg' }],
  pickRandom: vi.fn((manifest: unknown[]) => manifest[0] ?? null)
}))

import { useStore } from '@/store'
import { Briefing } from '@/pages/Briefing'

describe('Briefing history drawer', () => {
  beforeEach(() => {
    cleanup()
    useStore.setState({
      briefing: { result: null, loading: false, error: null },
      briefingSource: 'digest',
      briefingTheme: 'academic',
      briefingHistory: { list: [], loading: false, error: null },
    })
  })

  it('opens drawer from empty state', async () => {
    render(<Briefing />)
    fireEvent.click(screen.getByTestId('briefing-history-button'))
    await waitFor(() => {
      expect(screen.getByTestId('briefing-history-drawer')).toBeInTheDocument()
    })
  })

  it('opens drawer when source is anthropic', async () => {
    useStore.setState({ briefingSource: 'anthropic' })
    render(<Briefing />)
    fireEvent.click(screen.getByTestId('briefing-history-button'))
    await waitFor(() => {
      expect(screen.getByTestId('briefing-history-drawer')).toBeInTheDocument()
    })
  })

  it('opens drawer in error state', async () => {
    useStore.setState({ briefing: { result: null, loading: false, error: 'NETWORK_ERROR' } })
    render(<Briefing />)
    fireEvent.click(screen.getByTestId('briefing-history-button'))
    await waitFor(() => {
      expect(screen.getByTestId('briefing-history-drawer')).toBeInTheDocument()
    })
  })
})
