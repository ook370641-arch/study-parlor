import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { BriefingProgress } from '@/components/BriefingProgress'

describe('BriefingProgress', () => {
  it('renders all four steps', () => {
    render(<BriefingProgress stage="fetching" />)
    expect(screen.getByTestId('briefing-progress-step-fetching')).toBeInTheDocument()
    expect(screen.getByTestId('briefing-progress-step-extracting')).toBeInTheDocument()
    expect(screen.getByTestId('briefing-progress-step-assembling')).toBeInTheDocument()
    expect(screen.getByTestId('briefing-progress-step-finalizing')).toBeInTheDocument()
  })

  it('highlights the active step', () => {
    render(<BriefingProgress stage="assembling" />)
    expect(screen.getByText('正在组装夜航简报…')).toBeInTheDocument()
  })
})
