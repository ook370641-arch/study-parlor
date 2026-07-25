import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useGenerationTransition, RESOLVED_MS, DEPART_MS, FAILING_MS } from '@/lib/use-generation-transition'

describe('useGenerationTransition', () => {
  beforeEach(() => { vi.useFakeTimers() })
  afterEach(() => { vi.useRealTimers() })

  it('success: generating → resolved → departing → idle, fresh=true', () => {
    const { result, rerender } = renderHook(
      ({ loading, hasResult, hasError }) => useGenerationTransition('k1', loading, hasResult, hasError),
      { initialProps: { loading: true, hasResult: false, hasError: false } },
    )
    expect(result.current.phase).toBe('generating')

    rerender({ loading: false, hasResult: true, hasError: false })
    expect(result.current.phase).toBe('resolved')
    expect(result.current.fresh).toBe(true)

    act(() => { vi.advanceTimersByTime(RESOLVED_MS + 10) })
    expect(result.current.phase).toBe('departing')
    act(() => { vi.advanceTimersByTime(DEPART_MS + 10) })
    expect(result.current.phase).toBe('idle')
    expect(result.current.fresh).toBe(true)
  })

  it('failure: generating → failing (1000ms) → failed', () => {
    const { result, rerender } = renderHook(
      ({ loading, hasResult, hasError }) => useGenerationTransition('k1', loading, hasResult, hasError),
      { initialProps: { loading: true, hasResult: false, hasError: false } },
    )
    rerender({ loading: false, hasResult: false, hasError: true })
    expect(result.current.phase).toBe('failing')
    act(() => { vi.advanceTimersByTime(FAILING_MS + 10) })
    expect(result.current.phase).toBe('failed')
  })

  it('cancel: loading drops with no result/error → back to idle', () => {
    const { result, rerender } = renderHook(
      ({ loading, hasResult, hasError }) => useGenerationTransition('k1', loading, hasResult, hasError),
      { initialProps: { loading: true, hasResult: false, hasError: false } },
    )
    rerender({ loading: false, hasResult: false, hasError: false })
    expect(result.current.phase).toBe('idle')
  })

  it('revisit: result already present on mount without loading → idle, fresh=false', () => {
    const { result } = renderHook(() => useGenerationTransition('k1', false, true, false))
    expect(result.current.phase).toBe('idle')
    expect(result.current.fresh).toBe(false)
  })

  it('key change resets phase and fresh', () => {
    const { result, rerender } = renderHook(
      ({ k, loading }) => useGenerationTransition(k, loading, false, false),
      { initialProps: { k: 'a', loading: true } },
    )
    expect(result.current.phase).toBe('generating')
    rerender({ k: 'b', loading: false })
    expect(result.current.phase).toBe('idle')
    expect(result.current.fresh).toBe(false)
  })
})
