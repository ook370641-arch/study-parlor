import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useReadingFinished } from '@/lib/use-reading-finished'

let ioCallback: ((entries: { isIntersecting: boolean }[]) => void) | null = null
class MockIO {
  constructor(cb: typeof ioCallback) { ioCallback = cb }
  observe = vi.fn()
  disconnect = vi.fn()
}

function setup(resetKey = 'k1') {
  const container = document.createElement('div')
  const sentinel = document.createElement('div')
  document.body.appendChild(container)
  container.appendChild(sentinel)
  const containerRef = { current: container }
  const sentinelRef = { current: sentinel }
  const hook = renderHook(({ k }) => useReadingFinished(containerRef, sentinelRef, k), { initialProps: { k: resetKey } })
  return { container, hook }
}

describe('useReadingFinished', () => {
  beforeEach(() => { ioCallback = null; vi.stubGlobal('IntersectionObserver', MockIO) })
  afterEach(() => { vi.unstubAllGlobals(); document.body.innerHTML = '' })

  it('does not finish before any scroll (hasScrolled guard)', () => {
    const { hook } = setup()
    act(() => { ioCallback!([{ isIntersecting: true }]) })
    expect(hook.result.current).toBe(false)
  })

  it('finishes when sentinel intersects after a scroll', () => {
    const { container, hook } = setup()
    act(() => { container.dispatchEvent(new Event('scroll')) })
    act(() => { ioCallback!([{ isIntersecting: true }]) })
    expect(hook.result.current).toBe(true)
  })

  it('resets when resetKey changes', () => {
    const { container, hook } = setup()
    act(() => { container.dispatchEvent(new Event('scroll')) })
    act(() => { ioCallback!([{ isIntersecting: true }]) })
    expect(hook.result.current).toBe(true)
    hook.rerender({ k: 'k2' })
    expect(hook.result.current).toBe(false)
  })
})
