import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent, act } from '@testing-library/react'

vi.mock('@/lib/ipc', () => ({ ipc: { patchState: vi.fn(), getState: vi.fn() } }))
vi.mock('@/lib/paintings', async () => {
  const actual = await vi.importActual('@/lib/paintings')
  return { ...actual, manifest: [], pickRandom: vi.fn(() => null) }
})

import { useStore } from '@/store'
import { SwapPaintingButton } from '@/components/SwapPaintingButton'

const PAINT = { id: 'a', painter: 'Mark Rothko', title: 'A', url: 'paintings/a.jpg' }

describe('SwapPaintingButton', () => {
  beforeEach(() => {
    cleanup()
    vi.useFakeTimers()
    useStore.setState({ currentPaintings: { cover: null, home: null, study: null, briefing: PAINT } })
  })
  afterEach(() => { vi.useRealTimers() })

  it('renders wall label and no title tooltip (single visible protocol)', () => {
    render(<SwapPaintingButton surface="briefing" data-testid="swap-btn" />)
    expect(screen.getByTestId('painting-label')).toBeInTheDocument()
    expect(screen.getByTestId('swap-btn').getAttribute('title')).toBeNull()
  })

  it('locks against double-click during the 850ms swap, unlocks after', () => {
    render(<SwapPaintingButton surface="briefing" data-testid="swap-btn" />)
    const btn = screen.getByTestId('swap-btn') as HTMLButtonElement
    fireEvent.click(btn)
    expect(btn.disabled).toBe(true)
    act(() => { vi.advanceTimersByTime(900) })
    expect(btn.disabled).toBe(false)
  })
})
