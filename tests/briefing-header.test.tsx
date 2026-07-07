import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react'

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
  }
}))

vi.mock('@/lib/paintings', () => ({
  manifest: [{ id: 'test', painter: 'Test', title: 'Test', url: '/test.jpg' }],
  pickRandom: vi.fn((manifest: unknown[]) => manifest[0] ?? null)
}))

import { useStore } from '@/store'
import { BriefingHeader } from '@/components/BriefingHeader'

describe('BriefingHeader', () => {
  beforeEach(() => {
    cleanup()
    useStore.setState({
      briefingTheme: 'academic',
      briefingFontSize: 'base',
    })
  })

  it('renders font size and history buttons in loading state', () => {
    render(<BriefingHeader displayDate="" onHistory={() => {}} />)
    expect(screen.getByTestId('briefing-font-size-decrease')).toBeInTheDocument()
    expect(screen.getByTestId('briefing-font-size-increase')).toBeInTheDocument()
    expect(screen.getByTestId('briefing-history-button')).toBeInTheDocument()
    expect(screen.getByTestId('briefing-theme-toggle')).toBeInTheDocument()
  })

  it('renders regenerate button when showRegenerate is true', () => {
    render(<BriefingHeader displayDate="" onHistory={() => {}} showRegenerate />)
    expect(screen.getByTestId('briefing-regenerate-button')).toBeInTheDocument()
  })

  it('increases font size when A+ clicked', async () => {
    render(<BriefingHeader displayDate="" onHistory={() => {}} />)
    fireEvent.click(screen.getByTestId('briefing-font-size-increase'))
    await waitFor(() => {
      expect(useStore.getState().briefingFontSize).toBe('lg')
    })
  })
})
