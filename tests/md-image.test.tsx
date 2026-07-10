import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'

vi.mock('@/lib/ipc', () => ({
  ipc: { openExternal: vi.fn() }
}))

import { MarkdownRenderer } from '@/components/md/MarkdownRenderer'

afterEach(() => {
  cleanup()
})

describe('MarkdownRenderer images', () => {
  it('renders external image', () => {
    render(<MarkdownRenderer content="![alt](https://example.com/img.png)" fileName="test.md" />)
    const img = screen.getByAltText('alt')
    expect(img).toHaveAttribute('src', 'https://example.com/img.png')
    expect(img).toHaveClass('max-w-full')
  })

  it('renders local file:// image', () => {
    render(<MarkdownRenderer content="![local](file:///tmp/img.png)" fileName="test.md" />)
    const img = screen.getByAltText('local')
    expect(img).toHaveAttribute('src', 'file:///tmp/img.png')
  })

  it('shows placeholder on image error', () => {
    render(<MarkdownRenderer content="![broken](https://example.com/missing.png)" fileName="test.md" />)
    const img = screen.getByAltText('broken')
    fireEvent.error(img)
    expect(screen.getByTestId('md-image-error')).toBeInTheDocument()
  })
})
