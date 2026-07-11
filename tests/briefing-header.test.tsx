import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'

vi.mock('@/lib/ipc', () => ({ ipc: { patchState: vi.fn(), getState: vi.fn() } }))
vi.mock('@/lib/paintings', () => ({ manifest: [], pickRandom: vi.fn(() => null) }))

import { useStore } from '@/store'
import { BriefingHeader } from '@/components/BriefingHeader'

describe('BriefingHeader', () => {
  beforeEach(() => {
    cleanup()
    useStore.setState({ briefingTheme: 'academic', briefingFontSize: 'base' })
  })

  it('renders title and date', () => {
    render(<BriefingHeader displayDate="2026 年 07 月 11 日" />)
    expect(screen.getByText('夜航简报')).toBeInTheDocument()
    expect(screen.getByText('2026 年 07 月 11 日')).toBeInTheDocument()
  })

  it('does not render regenerate or history buttons', () => {
    render(<BriefingHeader displayDate="2026 年 07 月 11 日" />)
    expect(screen.queryByTestId('briefing-regenerate-button')).not.toBeInTheDocument()
    expect(screen.queryByTestId('briefing-history-button')).not.toBeInTheDocument()
  })

  it('renders font size controls and theme toggle', () => {
    render(<BriefingHeader displayDate="2026 年 07 月 11 日" />)
    expect(screen.getByTestId('briefing-font-size-decrease')).toBeInTheDocument()
    expect(screen.getByTestId('briefing-font-size-increase')).toBeInTheDocument()
    expect(screen.getByTestId('briefing-theme-toggle')).toBeInTheDocument()
  })
})
