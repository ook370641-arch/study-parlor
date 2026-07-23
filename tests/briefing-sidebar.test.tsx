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
    expect(aside).toHaveClass('bg-ink/70')
    expect(aside).toHaveClass('border-r')
  })

  it('shows SVG icons instead of single characters when collapsed', () => {
    render(<BriefingSourceSidebar theme="academic" collapsed={true} onToggle={() => {}} />)
    expect(screen.queryByText('日')).not.toBeInTheDocument()
    expect(screen.queryByText('A')).not.toBeInTheDocument()
    expect(screen.getByTestId('briefing-source-icon-digest')).toBeInTheDocument()
    expect(screen.getByTestId('briefing-source-icon-anthropic')).toBeInTheDocument()
  })

  it('renders text labels in expanded mode', () => {
    render(<BriefingSourceSidebar theme="academic" collapsed={false} onToggle={() => {}} />)
    expect(screen.getByText('AI 日报')).toBeInTheDocument()
    expect(screen.getByText('Anthropic 博客')).toBeInTheDocument()
  })

  it('calls onToggle when a source is clicked while collapsed', () => {
    const onToggle = vi.fn()
    render(<BriefingSourceSidebar theme="academic" collapsed={true} onToggle={onToggle} />)
    fireEvent.click(screen.getByTestId('briefing-source-anthropic'))
    expect(onToggle).toHaveBeenCalledTimes(1)
  })

  it('applies academic active button styles', () => {
    useStore.setState({ briefingSource: 'anthropic' })
    render(<BriefingSourceSidebar theme="academic" collapsed={false} onToggle={() => {}} />)
    const button = screen.getByTestId('briefing-source-anthropic')
    expect(button).toHaveClass('bg-[rgba(232,213,183,0.1)]')
    expect(button).toHaveClass('text-parchment')
    expect(button).toHaveClass('border-l-[3px]')
    expect(button).toHaveClass('border-[#d97757]')
    expect(button).toHaveClass('rounded-none')
  })

  it('applies newspaper active button styles', () => {
    useStore.setState({ briefingSource: 'anthropic' })
    render(<BriefingSourceSidebar theme="newspaper" collapsed={false} onToggle={() => {}} />)
    const button = screen.getByTestId('briefing-source-anthropic')
    expect(button).toHaveClass('bg-[rgba(0,0,0,0.06)]')
    expect(button).toHaveClass('text-[#2a1f1a]')
    expect(button).toHaveClass('border-l-[3px]')
    expect(button).toHaveClass('border-[#1a1a1a]')
    expect(button).toHaveClass('rounded-none')
  })

  it('shows border active indicator in collapsed mode', () => {
    useStore.setState({ briefingSource: 'anthropic' })
    render(<BriefingSourceSidebar theme="academic" collapsed={true} onToggle={() => {}} />)
    const button = screen.getByTestId('briefing-source-anthropic')
    expect(button).toHaveClass('border-l-[3px]')
    expect(button).toHaveClass('border-[#d97757]')
  })

  it('switches source on click', () => {
    render(<BriefingSourceSidebar theme="academic" collapsed={false} onToggle={() => {}} />)
    fireEvent.click(screen.getByTestId('briefing-source-anthropic'))
    expect(useStore.getState().briefingSource).toBe('anthropic')
  })

  it('uses star-blue left border for the active job source under academic theme', () => {
    useStore.setState({ briefingSource: 'job-briefing' })
    render(<BriefingSourceSidebar theme="academic" collapsed={false} onToggle={() => {}} />)
    const jobButton = screen.getByTestId('briefing-source-job-briefing')
    expect(jobButton.className).toContain('border-[#7fa8d9]')
  })

  it('keeps ember left border for the active digest source under academic theme', () => {
    useStore.setState({ briefingSource: 'digest' })
    render(<BriefingSourceSidebar theme="academic" collapsed={false} onToggle={() => {}} />)
    const digestButton = screen.getByTestId('briefing-source-digest')
    expect(digestButton.className).toContain('border-[#d97757]')
  })

  it('has z-index above surface background', () => {
    render(<BriefingSourceSidebar theme="academic" collapsed={false} onToggle={() => {}} />)
    const aside = screen.getByTestId('briefing-source-sidebar')
    expect(aside).toHaveClass('z-[5]')
  })
})
