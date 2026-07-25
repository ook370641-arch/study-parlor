import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'

vi.mock('@/lib/ipc', () => ({ ipc: { patchState: vi.fn(), getState: vi.fn() } }))
vi.mock('@/lib/paintings', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/paintings')>()
  return { ...actual, manifest: [], pickRandom: vi.fn(() => null) }
})

import { useStore } from '@/store'
import { PaintingPlate } from '@/components/briefing/PaintingPlate'

const PAINT = { id: 'b1', painter: 'Guy Billout', title: 'World', url: 'paintings/001-world.jpg' }

describe('PaintingPlate', () => {
  beforeEach(() => {
    cleanup()
    useStore.setState({
      paintingPlateEnabled: false,
      currentPaintings: { cover: null, home: null, study: null, briefing: PAINT },
    })
  })

  it('hidden by default (paintingPlateEnabled=false)', () => {
    const { container } = render(<PaintingPlate />)
    expect(container).toBeEmptyDOMElement()
  })

  it('shows framed painting with attribution caption when enabled', () => {
    useStore.setState({ paintingPlateEnabled: true })
    render(<PaintingPlate />)
    const plate = screen.getByTestId('painting-plate')
    expect(plate.querySelector('img')!.getAttribute('src')).toBe('paintings/001-world.jpg')
    expect(screen.getByTestId('painting-plate-caption').textContent).toContain('Guy Billout · World')
  })

  it('renders nothing when no painting even if enabled', () => {
    useStore.setState({
      paintingPlateEnabled: true,
      currentPaintings: { cover: null, home: null, study: null, briefing: null },
    })
    const { container } = render(<PaintingPlate />)
    expect(container).toBeEmptyDOMElement()
  })
})
