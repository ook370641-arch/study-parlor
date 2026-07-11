import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'

vi.mock('@/lib/ipc', () => ({ ipc: { patchState: vi.fn(), getState: vi.fn() } }))
vi.mock('@/lib/paintings', () => ({ manifest: [], pickRandom: vi.fn(() => null) }))

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
})
