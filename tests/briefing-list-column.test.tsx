import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { BriefingListColumn } from '../src/components/BriefingListColumn'

function renderColumn(collapsed: boolean) {
  return render(
    <BriefingListColumn collapsed={collapsed} onToggle={() => {}} theme="academic" width={64} title="书架">
      <div data-testid="inside">卡片内容</div>
    </BriefingListColumn>
  )
}

describe('BriefingListColumn', () => {
  beforeEach(() => {
    cleanup()
  })

  it('does not render children while collapsed', () => {
    renderColumn(true)
    expect(screen.queryByTestId('inside')).not.toBeInTheDocument()
    expect(screen.getByTestId('briefing-list-column-toggle')).toBeInTheDocument()
  })

  it('renders children while expanded', () => {
    renderColumn(false)
    expect(screen.getByTestId('inside')).toBeInTheDocument()
    expect(screen.getByText('卡片内容')).toBeInTheDocument()
  })

  it('does not render the title text while collapsed', () => {
    renderColumn(true)
    expect(screen.queryByText('书架')).not.toBeInTheDocument()
  })
})
