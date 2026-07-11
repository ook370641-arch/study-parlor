import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ArticleDivider } from '../src/components/article-assistant/ArticleDivider'

describe('ArticleDivider', () => {
  it('calls onToggleCollapse when button clicked', () => {
    const onToggle = vi.fn()
    render(<ArticleDivider collapsed={false} onToggleCollapse={onToggle} onResize={vi.fn()} />)
    fireEvent.click(screen.getByTestId('article-assistant-divider-toggle'))
    expect(onToggle).toHaveBeenCalled()
  })
})
