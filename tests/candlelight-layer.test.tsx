import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render } from '@testing-library/react'
import { CandlelightLayer } from '@/components/briefing/CandlelightLayer'
import { useStore } from '@/store'

describe('CandlelightLayer', () => {
  beforeEach(() => {
    useStore.setState({ candlelightEnabled: true, briefingTheme: 'academic', assistantSession: null })
  })

  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
  })

  it('静止时不持续请求动画帧，移动后只在跟随期间运行', () => {
    let nextId = 1
    const callbacks = new Map<number, FrameRequestCallback>()
    const request = vi.fn((callback: FrameRequestCallback) => {
      const id = nextId++
      callbacks.set(id, callback)
      return id
    })
    vi.stubGlobal('requestAnimationFrame', request)
    vi.stubGlobal('cancelAnimationFrame', (id: number) => callbacks.delete(id))

    render(<CandlelightLayer />)
    expect(request).not.toHaveBeenCalled()

    fireEvent.mouseMove(window, { clientX: 120, clientY: 80 })
    expect(request).toHaveBeenCalledTimes(1)
    for (let frame = 0; frame < 200 && callbacks.size > 0; frame += 1) {
      const pending = [...callbacks.entries()]
      callbacks.clear()
      pending.forEach(([, callback]) => callback(frame * 16))
    }
    expect(callbacks.size).toBe(0)
    expect(request.mock.calls.length).toBeLessThan(200)
  })
})
