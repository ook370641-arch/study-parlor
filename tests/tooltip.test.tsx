import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { Tooltip } from '@/components/Tooltip'

/**
 * jsdom 不做布局：所有元素的 scrollWidth / clientWidth / scrollHeight / clientHeight
 * 默认都是 0，因此「未截断」是默认状态，「被截断」需要用 Object.defineProperty 显式模拟。
 */
function mockOverflow(
  el: HTMLElement,
  box: { scrollWidth?: number; clientWidth?: number; scrollHeight?: number; clientHeight?: number },
) {
  for (const [key, value] of Object.entries(box)) {
    Object.defineProperty(el, key, { configurable: true, value })
  }
}

function renderTooltip(props?: { theme?: 'academic' | 'newspaper'; delay?: number }) {
  return render(
    <Tooltip content="完整的很长的章节标题，用来验证 tooltip 是否显示全文" {...props}>
      <button type="button" data-testid="trigger">
        1. 完整的很长…
      </button>
    </Tooltip>,
  )
}

/** 越过延迟并冲刷 React 更新 */
function advance(ms: number) {
  act(() => {
    vi.advanceTimersByTime(ms)
  })
}

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('Tooltip', () => {
  it('未被截断时 hover 350ms 不出现 tooltip', () => {
    renderTooltip()
    const trigger = screen.getByTestId('trigger')
    // scrollWidth === clientWidth === 0，即未省略
    fireEvent.mouseEnter(trigger)
    advance(350)
    expect(screen.queryByRole('tooltip')).toBeNull()
  })

  it('被截断时 hover 350ms 出现，未到 350ms 不出现', () => {
    renderTooltip()
    const trigger = screen.getByTestId('trigger')
    mockOverflow(trigger, { scrollWidth: 400, clientWidth: 200 })

    fireEvent.mouseEnter(trigger)
    advance(349)
    expect(screen.queryByRole('tooltip')).toBeNull()

    advance(1)
    const tip = screen.getByRole('tooltip')
    expect(tip).toHaveTextContent('完整的很长的章节标题，用来验证 tooltip 是否显示全文')
  })

  it('line-clamp 形截断（scrollHeight > clientHeight）也会显示', () => {
    renderTooltip()
    const trigger = screen.getByTestId('trigger')
    mockOverflow(trigger, { scrollWidth: 0, clientWidth: 0, scrollHeight: 120, clientHeight: 40 })

    fireEvent.mouseEnter(trigger)
    advance(350)
    expect(screen.getByRole('tooltip')).toBeInTheDocument()
  })

  it('focus 立即显示，不等延迟', () => {
    renderTooltip()
    const trigger = screen.getByTestId('trigger')
    mockOverflow(trigger, { scrollWidth: 400, clientWidth: 200 })

    fireEvent.focus(trigger)
    // 不推进任何计时器
    expect(screen.getByRole('tooltip')).toBeInTheDocument()
  })

  it('按 Escape 关闭', () => {
    renderTooltip()
    const trigger = screen.getByTestId('trigger')
    mockOverflow(trigger, { scrollWidth: 400, clientWidth: 200 })

    fireEvent.focus(trigger)
    expect(screen.getByRole('tooltip')).toBeInTheDocument()

    act(() => {
      fireEvent.keyDown(document, { key: 'Escape' })
    })
    expect(screen.queryByRole('tooltip')).toBeNull()
  })

  it('mouseLeave 关闭', () => {
    renderTooltip()
    const trigger = screen.getByTestId('trigger')
    mockOverflow(trigger, { scrollWidth: 400, clientWidth: 200 })

    fireEvent.mouseEnter(trigger)
    advance(350)
    expect(screen.getByRole('tooltip')).toBeInTheDocument()

    fireEvent.mouseLeave(trigger)
    expect(screen.queryByRole('tooltip')).toBeNull()
  })

  it('滚动关闭', () => {
    renderTooltip()
    const trigger = screen.getByTestId('trigger')
    mockOverflow(trigger, { scrollWidth: 400, clientWidth: 200 })

    fireEvent.focus(trigger)
    expect(screen.getByRole('tooltip')).toBeInTheDocument()

    act(() => {
      window.dispatchEvent(new Event('scroll'))
    })
    expect(screen.queryByRole('tooltip')).toBeNull()
  })

  it('显示时触发元素 aria-describedby 指向 tooltip', () => {
    renderTooltip()
    const trigger = screen.getByTestId('trigger')
    mockOverflow(trigger, { scrollWidth: 400, clientWidth: 200 })

    fireEvent.focus(trigger)
    const tip = screen.getByRole('tooltip')
    expect(trigger.getAttribute('aria-describedby')?.split(' ')).toContain(tip.id)
  })

  it('newspaper 主题使用浅底样式', () => {
    renderTooltip({ theme: 'newspaper' })
    const trigger = screen.getByTestId('trigger')
    mockOverflow(trigger, { scrollWidth: 400, clientWidth: 200 })

    fireEvent.focus(trigger)
    const tip = screen.getByRole('tooltip')
    expect(tip.className).toContain('bg-white')
    expect(tip.className).toContain('text-[#1a1a1a]')
  })

  it('academic 主题使用深底样式', () => {
    renderTooltip()
    const trigger = screen.getByTestId('trigger')
    mockOverflow(trigger, { scrollWidth: 400, clientWidth: 200 })

    fireEvent.focus(trigger)
    const tip = screen.getByRole('tooltip')
    expect(tip.className).toContain('bg-ink/95')
    expect(tip.className).toContain('text-parchment/90')
  })

  it('不产生额外包裹元素，触发元素仍是直接可查询的节点', () => {
    const { container } = renderTooltip()
    // Tooltip 用 Fragment 返回，children 直接存在于容器下
    expect(container.firstElementChild).toBe(screen.getByTestId('trigger'))
  })
})
