import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, cleanup, fireEvent, createEvent, within } from '@testing-library/react'

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
import { ipc } from '@/lib/ipc'
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
    expect(aside).toHaveClass('rounded-xl')
    expect(aside).toHaveClass('border')
    expect(aside).toHaveClass('border-parchment/15')
    expect(aside).not.toHaveClass('border-r')
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
    expect(screen.getByText('前沿')).toBeInTheDocument()
    expect(screen.getByText('博客')).toBeInTheDocument()
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

  it('hosts back-to-cover and theme toggle in the rail bottom cluster', () => {
    render(<BriefingSourceSidebar collapsed={false} onToggle={vi.fn()} theme="academic" />)
    const cluster = screen.getByTestId('briefing-rail-controls')
    expect(cluster).toBeInTheDocument()
    expect(within(cluster).getByTestId('briefing-back-to-cover')).toBeInTheDocument()
    expect(within(cluster).getByTestId('briefing-theme-toggle')).toBeInTheDocument()
  })

  it('hosts candlelight and painting-plate toggles in the rail controls cluster', () => {
    useStore.setState({ currentPaintings: { briefing: { id: 'p1', src: '' } } } as any)
    render(<BriefingSourceSidebar collapsed={false} onToggle={vi.fn()} theme="academic" />)
    const cluster = screen.getByTestId('briefing-rail-controls')
    expect(within(cluster).getByTestId('briefing-candlelight-toggle')).toBeInTheDocument()
    expect(within(cluster).getByTestId('painting-plate-toggle')).toBeInTheDocument()
  })

  it('hides candlelight and painting-plate toggles in newspaper theme', () => {
    render(<BriefingSourceSidebar collapsed={false} onToggle={vi.fn()} theme="newspaper" />)
    expect(screen.queryByTestId('briefing-candlelight-toggle')).not.toBeInTheDocument()
    expect(screen.queryByTestId('painting-plate-toggle')).not.toBeInTheDocument()
  })

})

describe('BriefingSourceSidebar 拖拽排序', () => {
  beforeEach(() => {
    cleanup()
    vi.mocked(ipc.patchState).mockClear()
    useStore.setState({
      briefingSource: 'digest',
      briefingSourceOrder: ['writing', 'digest', 'anthropic', 'job-briefing', 'scout'],
    })
  })

  function stubRect(el: HTMLElement, top: number, height: number) {
    el.getBoundingClientRect = () =>
      ({ top, height, bottom: top + height, left: 0, right: 160, width: 160, x: 0, y: top, toJSON: () => ({}) }) as DOMRect
  }

  // jsdom 无 DragEvent 实现，fireEvent.dragOver 退化为 plain Event，clientY 不会随 init 传入；
  // 需在 dispatch 前手动挂上 clientY，组件的 before/after 判定才能读到。
  function fireDragOver(el: HTMLElement, dt: unknown, clientY: number) {
    const ev = createEvent.dragOver(el, { dataTransfer: dt })
    Object.defineProperty(ev, 'clientY', { value: clientY })
    fireEvent(el, ev)
  }

  it('renders nav items in store order', () => {
    useStore.setState({ briefingSourceOrder: ['anthropic', 'writing', 'digest', 'job-briefing', 'scout'] })
    render(<BriefingSourceSidebar theme="academic" collapsed={false} onToggle={() => {}} />)
    const buttons = screen.getAllByRole('button').filter((b) => b.dataset.testid?.startsWith('briefing-source-'))
    expect(buttons[0].dataset.testid).toBe('briefing-source-anthropic')
  })

  it('drop before target reorders and persists', () => {
    render(<BriefingSourceSidebar theme="academic" collapsed={false} onToggle={() => {}} />)
    const writing = screen.getByTestId('briefing-source-writing')
    const anthropic = screen.getByTestId('briefing-source-anthropic')
    stubRect(writing, 0, 32)
    const dt = { setData: vi.fn(), effectAllowed: '' }
    fireEvent.dragStart(anthropic, { dataTransfer: dt })
    fireDragOver(writing, dt, 4) // 上半 → before
    fireEvent.drop(writing, { dataTransfer: dt, clientY: 4 })
    expect(useStore.getState().briefingSourceOrder).toEqual(['anthropic', 'writing', 'digest', 'job-briefing', 'scout'])
    expect(vi.mocked(ipc.patchState)).toHaveBeenCalledWith(
      expect.objectContaining({ briefingSourceOrder: ['anthropic', 'writing', 'digest', 'job-briefing', 'scout'] })
    )
  })

  it('drop after target inserts after', () => {
    render(<BriefingSourceSidebar theme="academic" collapsed={false} onToggle={() => {}} />)
    const writing = screen.getByTestId('briefing-source-writing')
    const digest = screen.getByTestId('briefing-source-digest')
    stubRect(digest, 32, 32)
    const dt = { setData: vi.fn(), effectAllowed: '' }
    fireEvent.dragStart(writing, { dataTransfer: dt })
    fireDragOver(digest, dt, 32 + 28) // 下半 → after
    fireEvent.drop(digest, { dataTransfer: dt, clientY: 32 + 28 })
    expect(useStore.getState().briefingSourceOrder).toEqual(['digest', 'writing', 'anthropic', 'job-briefing', 'scout'])
  })

  it('drop onto itself is a no-op', () => {
    render(<BriefingSourceSidebar theme="academic" collapsed={false} onToggle={() => {}} />)
    const digest = screen.getByTestId('briefing-source-digest')
    stubRect(digest, 32, 32)
    const dt = { setData: vi.fn(), effectAllowed: '' }
    fireEvent.dragStart(digest, { dataTransfer: dt })
    fireDragOver(digest, dt, 32 + 4)
    fireEvent.drop(digest, { dataTransfer: dt, clientY: 32 + 4 })
    expect(useStore.getState().briefingSourceOrder).toEqual(['writing', 'digest', 'anthropic', 'job-briefing', 'scout'])
    expect(vi.mocked(ipc.patchState)).not.toHaveBeenCalled()
  })

  it('collapsed mode disables dragging', () => {
    render(<BriefingSourceSidebar theme="academic" collapsed={true} onToggle={() => {}} />)
    expect(screen.getByTestId('briefing-source-anthropic')).not.toHaveAttribute('draggable', 'true')
  })
})
