import { render, screen, cleanup } from '@testing-library/react'
import { describe, expect, it, beforeEach } from 'vitest'
import { Quote } from '@/components/Quote'
import { useStore } from '@/store'

describe('Quote briefing variant', () => {
  beforeEach(() => {
    useStore.setState({ briefingTheme: 'academic' })
  })

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

  it('uses ink palette in newspaper theme', () => {
    cleanup()
    useStore.setState({ briefingTheme: 'newspaper' })
    render(<Quote surface="briefing" />)
    expect(screen.getByTestId('quote-text').className).toContain('text-[#1a1a1a]')
  })
})
