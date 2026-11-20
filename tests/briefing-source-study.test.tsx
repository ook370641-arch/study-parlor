import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { BriefingSourceSidebar } from '@/components/BriefingSourceSidebar'

vi.mock('@/lib/ipc', () => ({ ipc: { patchState: vi.fn() } }))

describe('study source navigation', () => {
  it('puts study first and keeps its entry in the collapsed rail', () => {
    const { rerender } = render(<BriefingSourceSidebar theme="academic" collapsed={false} onToggle={vi.fn()} />)
    expect(screen.getByRole('navigation').firstElementChild).toHaveAttribute('data-testid', 'briefing-source-study')
    rerender(<BriefingSourceSidebar theme="academic" collapsed onToggle={vi.fn()} />)
    expect(screen.getByTestId('briefing-source-study')).toHaveAttribute('title', '学习')
  })
})
