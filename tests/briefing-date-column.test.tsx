import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'

vi.mock('@/lib/ipc', () => ({ ipc: { patchState: vi.fn(), getState: vi.fn() } }))
vi.mock('@/lib/paintings', () => ({ manifest: [], pickRandom: vi.fn(() => null) }))

import { useStore } from '@/store'
import { BriefingDateColumn } from '@/components/BriefingDateColumn'

describe('BriefingDateColumn', () => {
  beforeEach(() => cleanup())

  it('renders today entry and history dates when expanded', () => {
    render(
      <BriefingDateColumn
        collapsed={false}
        history={[{ date: '2026-07-10', filePath: '/x.md' }]}
        today="2026-07-11"
        onSelect={vi.fn()}
        onReceiveToday={vi.fn()}
        theme="academic"
      />
    )
    expect(screen.getByText('查收日报')).toBeInTheDocument()
    expect(screen.getByText('7月10日')).toBeInTheDocument()
  })

  it('highlights current date', () => {
    render(
      <BriefingDateColumn
        collapsed={false}
        history={[{ date: '2026-07-10', filePath: '/x.md' }]}
        currentDate="2026-07-10"
        today="2026-07-11"
        onSelect={vi.fn()}
        onReceiveToday={vi.fn()}
        theme="academic"
      />
    )
    expect(screen.getByTestId('briefing-date-item-2026-07-10')).toHaveClass('bg-ember/20')
  })

  it('calls onSelect when a date is clicked', () => {
    const onSelect = vi.fn()
    render(
      <BriefingDateColumn
        collapsed={false}
        history={[{ date: '2026-07-10', filePath: '/x.md' }]}
        today="2026-07-11"
        onSelect={onSelect}
        onReceiveToday={vi.fn()}
        theme="academic"
      />
    )
    fireEvent.click(screen.getByTestId('briefing-date-item-2026-07-10'))
    expect(onSelect).toHaveBeenCalledWith('2026-07-10')
  })

  it('calls onReceiveToday when today entry clicked', () => {
    const onReceiveToday = vi.fn()
    render(
      <BriefingDateColumn
        collapsed={false}
        history={[]}
        today="2026-07-11"
        onSelect={vi.fn()}
        onReceiveToday={onReceiveToday}
        theme="academic"
      />
    )
    fireEvent.click(screen.getByText('查收日报'))
    expect(onReceiveToday).toHaveBeenCalled()
  })

  it('renders collapsed rail with today and latest mini buttons', () => {
    render(
      <BriefingDateColumn
        collapsed={true}
        history={[{ date: '2026-07-10', filePath: '/x.md' }]}
        today="2026-07-11"
        onSelect={vi.fn()}
        onReceiveToday={vi.fn()}
        theme="academic"
      />
    )
    expect(screen.getByTestId('briefing-date-today-mini')).toBeInTheDocument()
    expect(screen.getByTestId('briefing-date-latest-mini')).toBeInTheDocument()
  })

  it('does not render a duplicate row when history already contains today', () => {
    render(
      <BriefingDateColumn
        collapsed={false}
        history={[
          { date: '2026-07-11', filePath: '/today.md' },
          { date: '2026-07-10', filePath: '/x.md' },
        ]}
        today="2026-07-11"
        onSelect={vi.fn()}
        onReceiveToday={vi.fn()}
        theme="academic"
      />
    )
    // Today appears only as the synthetic top entry, not a second history row.
    expect(screen.getAllByTestId('briefing-date-item-2026-07-11')).toHaveLength(1)
    expect(screen.getByText('7月10日')).toBeInTheDocument()
  })

  it('shows empty-history hint when history only contains today', () => {
    render(
      <BriefingDateColumn
        collapsed={false}
        history={[{ date: '2026-07-11', filePath: '/today.md' }]}
        today="2026-07-11"
        onSelect={vi.fn()}
        onReceiveToday={vi.fn()}
        theme="academic"
      />
    )
    expect(screen.getByText('暂无往期简报')).toBeInTheDocument()
  })

  it('tints the today entry star-blue when job source is active', () => {
    useStore.setState({ briefingSource: 'job-briefing' })
    render(
      <BriefingDateColumn
        collapsed={true}
        history={[]}
        currentDate={undefined}
        today="2026-07-23"
        onSelect={() => {}}
        onReceiveToday={() => {}}
        theme="academic"
      />
    )
    const todayMini = screen.getByTestId('briefing-date-today-mini')
    expect(todayMini.className).toContain('#7fa8d9')
  })

  it('tints the expanded active-item star-blue when job source is active', () => {
    useStore.setState({ briefingSource: 'job-briefing' })
    render(
      <BriefingDateColumn
        collapsed={false}
        history={[{ date: '2026-07-23', filePath: '/x.md' }]}
        currentDate="2026-07-23"
        today="2026-07-23"
        onSelect={() => {}}
        onReceiveToday={() => {}}
        theme="academic"
      />
    )
    const activeItem = screen.getByTestId('briefing-date-item-2026-07-23')
    expect(activeItem.className).toContain('#7fa8d9')
  })

  it('opens delete menu on right-click and calls onDelete with the single item', () => {
    const onDelete = vi.fn()
    render(
      <BriefingDateColumn collapsed={false} history={[{ date: '2026-07-10', filePath: '/x.md' }]}
        today="2026-07-11" onSelect={vi.fn()} onReceiveToday={vi.fn()} theme="academic" onDelete={onDelete} />
    )
    fireEvent.contextMenu(screen.getByTestId('briefing-date-item-2026-07-10'))
    fireEvent.click(screen.getByTestId('briefing-date-delete'))
    expect(onDelete).toHaveBeenCalledWith([{ date: '2026-07-10', filePath: '/x.md' }])
  })

  it('no longer renders the trash toggle', () => {
    render(<BriefingDateColumn collapsed={false} history={[{ date: '2026-07-10', filePath: '/x.md' }]}
      today="2026-07-11" onSelect={vi.fn()} onReceiveToday={vi.fn()} theme="academic" onDelete={vi.fn()} />)
    expect(screen.queryByTestId('briefing-delete-mode-toggle')).not.toBeInTheDocument()
  })

  it('settles the current date item 4px toward content with the settle spring', () => {
    render(
      <BriefingDateColumn
        collapsed={false}
        history={[{ date: '2026-07-10', filePath: '/x.md' }]}
        currentDate="2026-07-10"
        today="2026-07-11"
        onSelect={vi.fn()}
        onReceiveToday={vi.fn()}
        theme="academic"
      />
    )
    const item = screen.getByTestId('briefing-date-item-2026-07-10')
    expect(item.style.transform).toBe('translateX(4px)')
    expect(item.style.transitionTimingFunction).toBe('cubic-bezier(0.34, 1.4, 0.5, 1)')
  })

  it('does not open menu for today entry when its file is absent from history', () => {
    render(<BriefingDateColumn collapsed={false} history={[]}
      today="2026-07-11" onSelect={vi.fn()} onReceiveToday={vi.fn()} theme="academic" onDelete={vi.fn()} />)
    fireEvent.contextMenu(screen.getByTestId('briefing-date-item-2026-07-11'))
    expect(screen.queryByTestId('briefing-date-menu')).not.toBeInTheDocument()
  })

  it('renders flame states: spent for read, lit for generated-unread, unlit for not-generated today', () => {
    render(
      <BriefingDateColumn
        collapsed={false}
        history={[{ date: '2026-07-10', filePath: '/x.md' }, { date: '2026-07-11', filePath: '/y.md' }]}
        currentDate="2026-07-11"
        today="2026-07-11"
        generatedDates={['2026-07-10', '2026-07-11']}
        readDates={['2026-07-10']}
        onSelect={vi.fn()}
        onReceiveToday={vi.fn()}
        theme="academic"
      />
    )
    expect(screen.getByTestId('briefing-date-flame-2026-07-10').dataset.state).toBe('spent')
    expect(screen.getByTestId('briefing-date-flame-2026-07-11').dataset.state).toBe('lit')
  })

  it('renders star-blue flames for job source', () => {
    useStore.setState({ briefingSource: 'job-briefing' })
    render(
      <BriefingDateColumn
        collapsed={false}
        history={[{ date: '2026-07-10', filePath: '/x.md' }]}
        currentDate="2026-07-10"
        today="2026-07-11"
        generatedDates={['2026-07-10']}
        readDates={[]}
        onSelect={vi.fn()}
        onReceiveToday={vi.fn()}
        theme="academic"
      />
    )
    const flame = screen.getByTestId('briefing-date-flame-2026-07-10')
    expect(flame.style.background).toContain('127, 168, 217')
  })

  it('today without generation shows an unlit flame', () => {
    render(
      <BriefingDateColumn
        collapsed={false}
        history={[]}
        today="2026-07-11"
        generatedDates={[]}
        readDates={[]}
        onSelect={vi.fn()}
        onReceiveToday={vi.fn()}
        theme="academic"
      />
    )
    expect(screen.getByTestId('briefing-date-flame-2026-07-11').dataset.state).toBe('unlit')
  })
})
