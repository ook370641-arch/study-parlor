import { describe, expect, it, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { Quote } from '@/components/Quote'
import * as quotesModule from '@/lib/quotes'

describe('Quote', () => {
  beforeEach(() => {
    cleanup()
    vi.restoreAllMocks()
  })

  const fullQuote = {
    id: 'test-01',
    text: '测试中文句子。',
    original: 'Test original sentence.',
    author: '测试作者',
    source: '《测试出处》',
  }

  const minimalQuote = {
    id: 'test-02',
    text: '只有中文和作者。',
    author: '作者乙',
  }

  it('renders full quote on cover surface', () => {
    vi.spyOn(quotesModule, 'pickRandomQuote').mockReturnValue(fullQuote)
    render(<Quote surface="cover" />)

    expect(screen.getByTestId('quote-text').textContent).toBe('“测试中文句子。”')
    expect(screen.getByTestId('quote-original').textContent).toBe('Test original sentence.')

    const meta = screen.getByTestId('quote-meta')
    expect(meta.textContent).toContain('测试作者')
    expect(meta.textContent).toContain('《测试出处》')
  })

  it('renders minimal quote without original or source', () => {
    vi.spyOn(quotesModule, 'pickRandomQuote').mockReturnValue(minimalQuote)
    render(<Quote surface="home" />)

    expect(screen.getByTestId('quote-text').textContent).toBe('“只有中文和作者。”')
    expect(screen.queryByTestId('quote-original')).toBeNull()

    const meta = screen.getByTestId('quote-meta')
    expect(meta.textContent).toContain('作者乙')
    expect(meta.textContent).not.toContain('·')
  })

  it('renders all three surfaces without error', () => {
    vi.spyOn(quotesModule, 'pickRandomQuote').mockReturnValue(fullQuote)
    const { rerender } = render(<Quote surface="cover" />)
    expect(screen.getByTestId('quote-text')).toBeTruthy()

    rerender(<Quote surface="home" />)
    expect(screen.getByTestId('quote-text')).toBeTruthy()

    rerender(<Quote surface="study" />)
    expect(screen.getByTestId('quote-text')).toBeTruthy()
  })

  it('refresh button changes quote on click', () => {
    vi.spyOn(quotesModule, 'pickRandomQuote')
      .mockReturnValueOnce(fullQuote)
      .mockReturnValueOnce(minimalQuote)

    render(<Quote surface="home" />)
    const initialText = screen.getByTestId('quote-text').textContent
    const button = screen.getByRole('button', { name: /换一句/i })
    fireEvent.click(button)
    const newText = screen.getByTestId('quote-text').textContent

    expect(newText).not.toBe(initialText)
  })
})
