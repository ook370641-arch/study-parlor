import { render, screen, cleanup } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Quote } from '@/components/Quote'

describe('Quote briefing variant', () => {
  it('renders the amber double-line band with text and meta', () => {
    cleanup()
    render(<Quote surface="briefing" />)
    expect(screen.getByTestId('quote-band')).toBeInTheDocument()
    expect(screen.getByTestId('quote-text').textContent).toMatch(/“.+”/)
    expect(screen.getByTestId('quote-meta').textContent).toContain('—')
  })

  it('offers a refresh button', () => {
    cleanup()
    render(<Quote surface="briefing" />)
    expect(screen.getByTestId('quote-refresh-button')).toBeInTheDocument()
  })
})
