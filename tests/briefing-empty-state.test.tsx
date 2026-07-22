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
    briefingList: vi.fn(),
    searchPrepare: vi.fn(),
    articleAssistantReadSession: vi.fn(),
    articleAssistantWriteSession: vi.fn(),
    articleAssistantGenerateGuide: vi.fn(),
    articleAssistantSendMessage: vi.fn(),
    articleAssistantAbort: vi.fn(),
    annotationsRead: vi.fn().mockResolvedValue([]),
  }
}))

vi.mock('@/lib/paintings', () => ({
  manifest: [],
  pickRandom: vi.fn(() => null)
}))

import { useStore } from '@/store'
import { Briefing } from '@/pages/Briefing'

describe('Briefing empty state', () => {
  beforeEach(() => {
    cleanup()
    useStore.setState({
      briefing: { result: null, loading: false, error: null },
      briefingSource: 'digest',
      briefingTheme: 'academic',
    })
  })

  it('shows 查收日报 button when digest has no result and is not loading', () => {
    render(<Briefing />)
    expect(screen.getByText('今日夜航简报尚未生成')).toBeInTheDocument()
    expect(screen.getByTestId('briefing-receive-digest-button')).toBeInTheDocument()
    expect(screen.queryByTestId('briefing-skeleton')).not.toBeInTheDocument()
  })

  it('does not auto-generate digest on mount', () => {
    const generate = vi.fn()
    useStore.setState({ generateBriefing: generate })
    render(<Briefing />)
    expect(generate).not.toHaveBeenCalled()
  })

  it('calls generateBriefing when button clicked', async () => {
    const generate = vi.fn().mockResolvedValue(undefined)
    useStore.setState({ generateBriefing: generate })
    render(<Briefing />)
    fireEvent.click(screen.getByTestId('briefing-receive-digest-button'))
    await waitFor(() => expect(generate).toHaveBeenCalledTimes(1))
  })

  it('does not show empty state when result exists', () => {
    useStore.setState({
      briefing: {
        result: {
          title: '夜航简报',
          date: '2026-07-10',
          content: '## X\n\ntext',
          sources: [],
          filePath: '/tmp/briefing.md',
          cached: false,
          generatedAt: new Date().toISOString(),
          sourceStatus: { x: 'ok', blogs: 'ok', podcasts: 'ok' },
        },
        loading: false,
        error: null,
      }
    })
    render(<Briefing />)
    expect(screen.queryByTestId('briefing-receive-digest-button')).not.toBeInTheDocument()
  })

  it('uses newspaper button class when theme is newspaper', () => {
    useStore.setState({ briefingTheme: 'newspaper' })
    render(<Briefing />)
    expect(screen.getByTestId('briefing-receive-digest-button')).toHaveClass('bg-[#1a1a1a]')
  })

  it('does not show empty state button when digest has a network error', () => {
    useStore.setState({
      briefing: { result: null, loading: false, error: 'NETWORK_ERROR' }
    })
    render(<Briefing />)
    expect(screen.queryByTestId('briefing-receive-digest-button')).not.toBeInTheDocument()
  })
})
