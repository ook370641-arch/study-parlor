import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'

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
  manifest: [],
  pickRandom: vi.fn(() => null)
}))

import { useStore } from '@/store'
import { BriefingSourceSidebar } from '@/components/BriefingSourceSidebar'

describe('BriefingSourceSidebar', () => {
  beforeEach(() => {
    cleanup()
    useStore.setState({ briefingSource: 'digest' })
  })

  it('renders newspaper theme colors when theme is newspaper', () => {
    render(<BriefingSourceSidebar theme="newspaper" collapsed={false} onToggle={() => {}} />)
    const aside = screen.getByTestId('briefing-source-sidebar')
    expect(aside).toHaveClass('bg-[#e8e4de]')
    expect(aside).toHaveClass('border-[#c9c3b8]')
  })

  it('renders academic theme colors when theme is academic', () => {
    render(<BriefingSourceSidebar theme="academic" collapsed={false} onToggle={() => {}} />)
    const aside = screen.getByTestId('briefing-source-sidebar')
    expect(aside).toHaveClass('bg-[#3d2f27]')
    expect(aside).toHaveClass('border-r')
  })

  it('shows SVG icons instead of single characters when collapsed', () => {
    render(<BriefingSourceSidebar theme="academic" collapsed={true} onToggle={() => {}} />)
    expect(screen.queryByText('日')).not.toBeInTheDocument()
    expect(screen.queryByText('A')).not.toBeInTheDocument()
    const svgs = screen.getAllByTestId('briefing-source-icon')
    expect(svgs).toHaveLength(2)
  })

  it('switches source on click', () => {
    render(<BriefingSourceSidebar theme="academic" collapsed={false} onToggle={() => {}} />)
    fireEvent.click(screen.getByTestId('briefing-source-anthropic'))
    expect(useStore.getState().briefingSource).toBe('anthropic')
  })
})
