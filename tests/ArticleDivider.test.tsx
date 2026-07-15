import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { ArticleDivider } from '../src/components/article-assistant/ArticleDivider'

describe('ArticleDivider', () => {
  afterEach(cleanup)

  it('calls onToggleCollapse when button clicked', () => {
    const onToggle = vi.fn()
    render(<ArticleDivider collapsed={false} onToggleCollapse={onToggle} onResize={vi.fn()} />)
    fireEvent.click(screen.getByTestId('article-assistant-divider-toggle'))
    expect(onToggle).toHaveBeenCalled()
  })

  it('does not capture the pointer on button pointerdown, so toggle click still works', () => {
    // Real browsers fire pointerdown before click. If the divider's pointerdown handler
    // calls setPointerCapture for events originating on the toggle button, the capture
    // redirects the subsequent click to the divider and onToggleCollapse never fires.
    // jsdom doesn't implement capture semantics, so we assert the capture is never taken.
    const onToggle = vi.fn()
    render(<ArticleDivider collapsed={false} onToggleCollapse={onToggle} onResize={vi.fn()} />)
    const divider = screen.getByTestId('article-assistant-divider')
    const capture = vi.fn()
    divider.setPointerCapture = capture
    const button = screen.getByTestId('article-assistant-divider-toggle')
    fireEvent.pointerDown(button, { pointerId: 1 })
    expect(capture).not.toHaveBeenCalled()
    fireEvent.click(button)
    expect(onToggle).toHaveBeenCalled()
  })

  it('does not start a drag when pointerdown originates on the toggle button', () => {
    const onResizeStart = vi.fn()
    render(
      <ArticleDivider
        collapsed={false}
        onToggleCollapse={vi.fn()}
        onResize={vi.fn()}
        onResizeStart={onResizeStart}
      />
    )
    const divider = screen.getByTestId('article-assistant-divider')
    divider.setPointerCapture = vi.fn()
    fireEvent.pointerDown(screen.getByTestId('article-assistant-divider-toggle'), { pointerId: 1 })
    expect(onResizeStart).not.toHaveBeenCalled()
  })

  it('calls onResizeStart on divider pointerdown and onResizeEnd on pointerup', () => {
    const onResizeStart = vi.fn()
    const onResizeEnd = vi.fn()
    render(
      <ArticleDivider
        collapsed={false}
        onToggleCollapse={vi.fn()}
        onResize={vi.fn()}
        onResizeStart={onResizeStart}
        onResizeEnd={onResizeEnd}
      />
    )
    const divider = screen.getByTestId('article-assistant-divider')
    // jsdom does not implement pointer capture
    divider.setPointerCapture = vi.fn()
    divider.releasePointerCapture = vi.fn()
    fireEvent.pointerDown(divider, { pointerId: 1, clientX: 100 })
    expect(onResizeStart).toHaveBeenCalledTimes(1)
    expect(onResizeEnd).not.toHaveBeenCalled()
    fireEvent.pointerUp(window)
    expect(onResizeEnd).toHaveBeenCalledTimes(1)
  })
})
