import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { GuidePopover } from '../../src/components/GuidePopover'

describe('GuidePopover', () => {
  let anchorRef: React.RefObject<HTMLButtonElement | null>

  beforeEach(() => {
    cleanup()
    const btn = document.createElement('button')
    anchorRef = { current: btn }
    document.body.appendChild(btn)
  })

  afterEach(() => {
    if (anchorRef.current && anchorRef.current.parentNode) {
      anchorRef.current.parentNode.removeChild(anchorRef.current)
    }
  })

  it('does not render when closed', () => {
    render(
      <GuidePopover
        open={false}
        anchorRef={anchorRef}
        onClose={vi.fn()}
      />
    )
    expect(screen.queryByText('分组使用指南')).toBeNull()
  })

  it('renders when open', () => {
    render(
      <GuidePopover
        open={true}
        anchorRef={anchorRef}
        onClose={vi.fn()}
      />
    )
    expect(screen.getByText('分组使用指南')).toBeTruthy()
    expect(screen.getByText('新创建的默认保存到「默认」分组中')).toBeTruthy()
    expect(screen.getByText('新建分组可包含多个主题，左侧推荐会根据你的分组智能推荐学习主题')).toBeTruthy()
    expect(screen.getByText('长按主题卡片并拖动，可将其移入其他分组')).toBeTruthy()
  })

  it('renders numbered items', () => {
    render(
      <GuidePopover
        open={true}
        anchorRef={anchorRef}
        onClose={vi.fn()}
      />
    )
    expect(screen.getByText('1')).toBeTruthy()
    expect(screen.getByText('2')).toBeTruthy()
    expect(screen.getByText('3')).toBeTruthy()
  })

  it('renders drag demo image for third item', () => {
    render(
      <GuidePopover
        open={true}
        anchorRef={anchorRef}
        onClose={vi.fn()}
      />
    )
    const img = screen.getByAltText('拖拽分组示意图') as HTMLImageElement
    expect(img).toBeTruthy()
    expect(img.src).toContain('group-guide-drag-demo.png')
    expect(img.draggable).toBe(false)
  })

  it('calls onClose when Escape is pressed', () => {
    const onClose = vi.fn()
    render(
      <GuidePopover
        open={true}
        anchorRef={anchorRef}
        onClose={onClose}
      />
    )
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).toHaveBeenCalled()
  })

  it('calls onClose when clicking outside', () => {
    const onClose = vi.fn()
    render(
      <GuidePopover
        open={true}
        anchorRef={anchorRef}
        onClose={onClose}
      />
    )
    fireEvent.mouseDown(document.body)
    expect(onClose).toHaveBeenCalled()
  })

  it('does not call onClose when clicking inside panel', () => {
    const onClose = vi.fn()
    render(
      <GuidePopover
        open={true}
        anchorRef={anchorRef}
        onClose={onClose}
      />
    )
    const panel = screen.getByText('分组使用指南').parentElement
    if (panel) {
      fireEvent.mouseDown(panel)
    }
    expect(onClose).not.toHaveBeenCalled()
  })

  it('does not call onClose when clicking on anchor', () => {
    const onClose = vi.fn()
    render(
      <GuidePopover
        open={true}
        anchorRef={anchorRef}
        onClose={onClose}
      />
    )
    fireEvent.mouseDown(anchorRef.current!)
    expect(onClose).not.toHaveBeenCalled()
  })

  it('calls onClose when window is resized', () => {
    const onClose = vi.fn()
    render(
      <GuidePopover
        open={true}
        anchorRef={anchorRef}
        onClose={onClose}
      />
    )
    fireEvent.resize(window)
    expect(onClose).toHaveBeenCalled()
  })

  it('positions panel below anchor', () => {
    const onClose = vi.fn()
    const { container } = render(
      <GuidePopover
        open={true}
        anchorRef={anchorRef}
        onClose={onClose}
      />
    )
    const panel = container.firstChild as HTMLElement
    // The component uses Tailwind 'fixed' class, not inline style
    expect(panel.classList.contains('fixed')).toBe(true)
    // left/top are set via inline styles in updatePosition
    expect(panel.style.left).not.toBe('')
    expect(panel.style.top).not.toBe('')
  })

  it('cleans up event listeners on unmount', () => {
    const onClose = vi.fn()
    const { unmount } = render(
      <GuidePopover
        open={true}
        anchorRef={anchorRef}
        onClose={onClose}
      />
    )
    unmount()
    // After unmount, events should not trigger onClose
    fireEvent.keyDown(document, { key: 'Escape' })
    fireEvent.mouseDown(document.body)
    fireEvent.resize(window)
    expect(onClose).toHaveBeenCalledTimes(0)
  })
})