import { describe, expect, it, beforeEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { Quote } from '@/components/Quote'

describe('Quote', () => {
  beforeEach(() => {
    cleanup()
  })

  it('renders quote text and author', () => {
    render(<Quote surface="cover" />)
    const text = screen.getByTestId('quote-text')
    expect(text).toBeTruthy()
    expect(text.textContent).toMatch(/[，。]/)
    const author = screen.getByText(/—/)
    expect(author).toBeTruthy()
  })

  it('refresh button changes quote on click', () => {
    render(<Quote surface="home" />)
    const initialText = screen.getByTestId('quote-text').textContent
    const button = screen.getByRole('button', { name: /换一句/i })
    fireEvent.click(button)
    const newText = screen.getByTestId('quote-text').textContent
    let changed = false
    for (let i = 0; i < 10; i++) {
      fireEvent.click(button)
      if (screen.getByTestId('quote-text').textContent !== initialText) {
        changed = true
        break
      }
    }
    expect(changed).toBe(true)
  })
})
