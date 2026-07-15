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

describe('Briefing date column', () => {
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

  it('shows the date column in the digest empty state', () => {
    render(<Briefing />)
    expect(screen.getByTestId('briefing-date-column')).toBeInTheDocument()
  })

  it('does not show the digest date column when source is anthropic', () => {
    useStore.setState({ briefingSource: 'anthropic' })
    render(<Briefing />)
    expect(screen.queryByTestId('briefing-date-column')).not.toBeInTheDocument()
  })

  it('calls generateBriefing when selecting a past date', async () => {
    useStore.setState({
      briefingHistory: {
        list: [{ date: '2026-07-01', filePath: '/test/2026-07-01.md' }],
        loading: false,
        error: null,
      },
    })
    const generate = vi.fn().mockResolvedValue(undefined)
    useStore.setState({ generateBriefing: generate })
    render(<Briefing />)
    fireEvent.click(screen.getByTestId('briefing-date-item-2026-07-01'))
    await waitFor(() => expect(generate).toHaveBeenCalledWith('2026-07-01'))
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

  it('renders surface background without page-level swap button for anthropic source', () => {
    render(<Briefing />)
    expect(screen.getByTestId('surface-background')).toBeInTheDocument()
    // Digest keeps a body-level button inside its layout; anthropic renders its own
    // inside AnthropicArticleReader; only job-briefing uses the page-level one.
    expect(screen.queryByTestId('briefing-swap-painting-button')).not.toBeInTheDocument()
  })

  it('renders the page-level swap button for job-briefing source in academic theme', () => {
    useStore.setState({ briefingSource: 'job-briefing' })
    render(<Briefing />)
    expect(screen.getByTestId('briefing-swap-painting-button')).toBeInTheDocument()
  })

  it('does not render surface background for newspaper theme', () => {
    useStore.setState({ briefingTheme: 'newspaper' })
    render(<Briefing />)
    expect(screen.queryByTestId('surface-background')).not.toBeInTheDocument()
    expect(screen.queryByTestId('briefing-swap-painting-button')).not.toBeInTheDocument()
  })
})
