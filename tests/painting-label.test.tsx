import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup, act } from '@testing-library/react'

vi.mock('@/lib/ipc', () => ({ ipc: { patchState: vi.fn(), getState: vi.fn() } }))
vi.mock('@/lib/paintings', async () => {
  const actual = await vi.importActual('@/lib/paintings')
  return { ...actual, manifest: [], pickRandom: vi.fn(() => null) }
})

import { useStore } from '@/store'
import { PaintingLabel } from '@/components/PaintingLabel'

const PAINT = { id: 'a', painter: 'Mark Rothko', title: 'Composition I', url: 'paintings/a.jpg', year: 1931 } as const

function seed(p: typeof PAINT | null) {
  useStore.setState({ currentPaintings: { cover: null, home: null, study: null, briefing: p } })
}

describe('PaintingLabel', () => {
  beforeEach(() => { cleanup(); vi.useFakeTimers() })
  afterEach(() => { vi.useRealTimers() })

  it('renders attribution in wall-label style, hidden until hover (opacity-0 base)', () => {
    seed(PAINT)
    render(<PaintingLabel surface="briefing" />)
    const label = screen.getByTestId('painting-label')
    expect(label.textContent).toBe('Mark Rothko · Composition I · 1931')
    expect(label.className).toContain('italic')
    expect(label.className).toContain('opacity-0')
    expect(label.className).toContain('group-hover:opacity-70')
  })

  it('renders nothing when no painting', () => {
    seed(null)
    const { container } = render(<PaintingLabel surface="briefing" />)
    expect(container).toBeEmptyDOMElement()
  })

  it('flashes once (~1.8s) after the painting changes, then retreats', () => {
    seed(PAINT)
    render(<PaintingLabel surface="briefing" />)
    const label = screen.getByTestId('painting-label')
    expect(label.getAttribute('data-flash')).toBeNull()

    act(() => { seed({ ...PAINT, id: 'b', url: 'paintings/b.jpg', title: 'Interior' }) })
    expect(label.getAttribute('data-flash')).toBe('')

    act(() => { vi.advanceTimersByTime(1900) })
    expect(label.getAttribute('data-flash')).toBeNull()
  })
})
