import { render, screen, cleanup } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { BriefingProgress } from '@/components/BriefingProgress'

describe('BriefingProgress', () => {
  it('renders all four steps', () => {
    cleanup()
    render(<BriefingProgress stage="fetching" />)
    expect(screen.getByTestId('briefing-progress-step-fetching')).toBeInTheDocument()
    expect(screen.getByTestId('briefing-progress-step-extracting')).toBeInTheDocument()
    expect(screen.getByTestId('briefing-progress-step-assembling')).toBeInTheDocument()
    expect(screen.getByTestId('briefing-progress-step-finalizing')).toBeInTheDocument()
  })

  it('highlights the active step', () => {
    cleanup()
    render(<BriefingProgress stage="assembling" />)
    const activeStep = screen.getByTestId('briefing-progress-step-assembling')
    expect(activeStep).toBeInTheDocument()
    expect(activeStep.textContent).toContain('正在组装夜航简报')
  })
})
