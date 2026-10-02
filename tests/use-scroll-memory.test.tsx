// @vitest-environment jsdom
// 退出时落盘语义 —— src/lib/use-scroll-memory.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, act, cleanup } from '@testing-library/react'
import React, { useRef } from 'react'
import { useScrollMemory } from '@/lib/use-scroll-memory'

const HEIGHT = 50

function makeLayout(container: HTMLDivElement, blocks: HTMLElement[], containerTop = 0) {
  let scrollTop = 0
  const layout = () => {
    blocks.forEach((b, i) => {
      const top = containerTop + i * HEIGHT - scrollTop
      b.getBoundingClientRect = () => ({ top, bottom: top + HEIGHT }) as DOMRect
    })
    container.getBoundingClientRect = () => ({ top: containerTop, bottom: containerTop + 100 }) as DOMRect
  }
  layout()
  Object.defineProperty(container, 'scrollTop', {
    get: () => scrollTop,
    set: (v) => { scrollTop = v; layout() },
    configurable: true,
  })
}

interface HarnessProps {
  memKey: string | null
  saved?: Record<string, number>
  flush: (key: string, index: number) => void
  isCurrent?: (key: string) => boolean
}

function Harness({ memKey, saved = {}, flush, isCurrent = () => true }: HarnessProps) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const blocksRef = useRef<HTMLElement[]>([])
  const { onScroll } = useScrollMemory({
    memKey,
    containerRef,
    getBlocks: () => blocksRef.current,
    readSaved: (k) => saved[k],
    flush,
    isCurrent,
  })
  return (
    <div
      data-testid="scroller"
      ref={(el) => {
        containerRef.current = el
        if (el && blocksRef.current.length === 0) {
          for (let i = 0; i < 6; i++) {
            const b = document.createElement('p')
            el.appendChild(b)
            blocksRef.current.push(b)
          }
          makeLayout(el, blocksRef.current)
        }
      }}
      onScroll={onScroll}
    />
  )
}

describe('use-scroll-memory', () => {
  beforeEach(() => { vi.useFakeTimers() })
  afterEach(() => { cleanup(); vi.useRealTimers() })

  it('滚动只写 ref:400ms 防抖过后 flush 仍不调用', () => {
    const flush = vi.fn()
    const { getByTestId } = render(<Harness memKey="a.md" flush={flush} />)
    const scroller = getByTestId('scroller')
    act(() => {
      scroller.scrollTop = 100
      scroller.dispatchEvent(new Event('scroll'))
      vi.advanceTimersByTime(500)
    })
    expect(flush).not.toHaveBeenCalled()
  })

  it('卸载(退出点)把待存位置 flush 出去', () => {
    const flush = vi.fn()
    const { getByTestId, unmount } = render(<Harness memKey="a.md" flush={flush} />)
    const scroller = getByTestId('scroller')
    act(() => {
      scroller.scrollTop = 100 // 首可见块 = 2
      scroller.dispatchEvent(new Event('scroll'))
      vi.advanceTimersByTime(500)
    })
    unmount()
    expect(flush).toHaveBeenCalledWith('a.md', 2)
  })

  it('切文档 key A→B:flush 用旧 key A', () => {
    const flush = vi.fn()
    const { getByTestId, rerender } = render(<Harness memKey="a.md" flush={flush} />)
    const scroller = getByTestId('scroller')
    act(() => {
      scroller.scrollTop = 100
      scroller.dispatchEvent(new Event('scroll'))
      vi.advanceTimersByTime(500)
    })
    rerender(<Harness memKey="b.md" flush={flush} />)
    expect(flush).toHaveBeenCalledWith('a.md', 2)
  })

  it('防抖窗内 isCurrent=false(文档已切走)则丢弃本次记录', () => {
    const flush = vi.fn()
    const { getByTestId, unmount } = render(
      <Harness memKey="a.md" flush={flush} isCurrent={() => false} />
    )
    const scroller = getByTestId('scroller')
    act(() => {
      scroller.scrollTop = 100
      scroller.dispatchEvent(new Event('scroll'))
      vi.advanceTimersByTime(500)
    })
    unmount()
    expect(flush).not.toHaveBeenCalled()
  })

  it('beforeunload(窗口关闭/刷新)落盘', () => {
    const flush = vi.fn()
    const { getByTestId } = render(<Harness memKey="a.md" flush={flush} />)
    const scroller = getByTestId('scroller')
    act(() => {
      scroller.scrollTop = 100
      scroller.dispatchEvent(new Event('scroll'))
      vi.advanceTimersByTime(500)
    })
    act(() => { window.dispatchEvent(new Event('beforeunload')) })
    expect(flush).toHaveBeenCalledWith('a.md', 2)
  })

  it('恢复:saved=2 时轮询把容器滚到块 2', () => {
    const flush = vi.fn()
    const { getByTestId } = render(<Harness memKey="a.md" saved={{ 'a.md': 2 }} flush={flush} />)
    const scroller = getByTestId('scroller')
    act(() => { vi.advanceTimersByTime(150) })
    expect(scroller.scrollTop).toBe(100)
  })

  // 2026-10-03 修复:旧实现 blocks>0 即滚一次就停——博客分块渐进渲染时目标索引
  // 未渲染会钳制到浅位置 → 恢复不精准。新实现轮询重滚直到块数稳定。
  it('恢复:渐进渲染(块后挂载)下持续校正到目标索引', () => {
    const flush = vi.fn()
    const blocksRef: HTMLElement[] = []
    let containerEl: HTMLDivElement | null = null
    const addBlocks = (n: number) => {
      for (let i = 0; i < n; i++) {
        const b = document.createElement('p')
        containerEl!.appendChild(b)
        blocksRef.push(b)
      }
      makeLayout(containerEl!, blocksRef)
    }
    function Progressive() {
      const containerRef = useRef<HTMLDivElement | null>(null)
      useScrollMemory({
        memKey: 'a.md',
        containerRef,
        getBlocks: () => blocksRef,
        readSaved: () => 5,
        flush,
        isCurrent: () => true,
      })
      return (
        <div
          data-testid="scroller"
          ref={(el) => {
            containerRef.current = el
            if (el && blocksRef.length === 0) {
              containerEl = el
              addBlocks(3) // 首批只渲染 3 块(目标块 5 未渲染)
            }
          }}
        />
      )
    }
    const { getByTestId } = render(<Progressive />)
    const scroller = getByTestId('scroller')
    act(() => { vi.advanceTimersByTime(250) })
    expect(scroller.scrollTop).toBe(0) // 目标块未渲染时不乱滚(旧实现钳制到块 2 并停)
    act(() => {
      addBlocks(4) // 后续块挂载(共 7 块)
      vi.advanceTimersByTime(200)
    })
    expect(scroller.scrollTop).toBe(250) // 校正到块 5
  })

  it('memKey 为 null:不恢复、滚动不记录', () => {
    const flush = vi.fn()
    const { getByTestId, unmount } = render(
      <Harness memKey={null} saved={{ 'a.md': 2 }} flush={flush} />
    )
    const scroller = getByTestId('scroller')
    act(() => {
      vi.advanceTimersByTime(150)
      scroller.scrollTop = 100
      scroller.dispatchEvent(new Event('scroll'))
      vi.advanceTimersByTime(500)
    })
    expect(scroller.scrollTop).toBe(100) // 未被恢复改写(恢复没跑,scrollTop 保持手动值)
    unmount()
    expect(flush).not.toHaveBeenCalled()
  })
})
