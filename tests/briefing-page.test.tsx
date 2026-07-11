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
  pickRandom: vi.fn((manifest: unknown[]) => manifest[0] ?? null),
  formatAttribution: vi.fn((p: unknown) => (p as { painter?: string })?.painter ?? ''),
}))

import { useStore } from '@/store'
import { Briefing } from '@/pages/Briefing'
import { ipc } from '@/lib/ipc'

describe('Briefing history drawer', () => {
  beforeEach(() => {
    cleanup()
    useStore.setState({
      briefing: { result: null, loading: false, error: null },
      briefingSource: 'digest',
      briefingTheme: 'academic',
      briefingHistory: { list: [], loading: false, error: null },
      currentPaintings: {
        briefing: null,
        cover: null,
        home: null,
        study: null,
      },
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

  it('switches to digest source when selecting a date from anthropic source', async () => {
    useStore.setState({
      briefingSource: 'anthropic',
      briefingHistory: {
        list: [{ date: '2026-07-01', filePath: '/test/2026-07-01.md' }],
        loading: false,
        error: null,
      },
    })
    vi.mocked(ipc.briefingList).mockResolvedValue([
      { date: '2026-07-01', filePath: '/test/2026-07-01.md' },
    ])
    const setBriefingSourceSpy = vi.spyOn(useStore.getState(), 'setBriefingSource')
    const generateBriefingSpy = vi.spyOn(useStore.getState(), 'generateBriefing')
    render(<Briefing />)
    fireEvent.click(screen.getByTestId('briefing-history-button'))
    await waitFor(() => {
      expect(screen.getByTestId('briefing-history-drawer')).toBeInTheDocument()
    })
    fireEvent.click(screen.getByText('07-01'))
    await waitFor(() => {
      expect(setBriefingSourceSpy).toHaveBeenCalledWith('digest')
      expect(generateBriefingSpy).toHaveBeenCalledWith('2026-07-01')
    })
  })
})

describe('Briefing global chrome', () => {
  beforeEach(() => {
    cleanup()
    useStore.setState({
      briefing: { result: null, loading: false, error: null },
      briefingSource: 'anthropic',
      briefingTheme: 'academic',
      briefingHistory: { list: [], loading: false, error: null },
      currentPaintings: {
        briefing: { id: 'test', painter: 'Test', title: 'Test', url: '/test.jpg' },
        cover: null,
        home: null,
        study: null,
      },
    })
  })

  it('renders surface background for anthropic source in academic theme', () => {
    render(<Briefing />)
    expect(screen.getByTestId('surface-background')).toBeInTheDocument()
    expect(screen.getByTestId('briefing-swap-painting-button')).toBeInTheDocument()
  })

  it('does not render surface background for newspaper theme', () => {
    useStore.setState({ briefingTheme: 'newspaper' })
    render(<Briefing />)
    expect(screen.queryByTestId('surface-background')).not.toBeInTheDocument()
    expect(screen.queryByTestId('briefing-swap-painting-button')).not.toBeInTheDocument()
  })
})
