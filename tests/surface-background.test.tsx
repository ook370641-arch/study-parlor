import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup, act } from '@testing-library/react'

vi.mock('@/lib/ipc', () => ({ ipc: { patchState: vi.fn(), getState: vi.fn() } }))
const mockManifest = vi.hoisted(() => [] as { id: string; painter: string; title: string; url: string; focus?: string }[])
vi.mock('@/lib/paintings', () => ({ manifest: mockManifest, pickRandom: vi.fn(() => null) }))

import { useStore } from '@/store'
import { SurfaceBackground } from '@/components/SurfaceBackground'

const PAINT_A = { id: 'a', painter: 'Mark Rothko', title: 'A', url: 'paintings/a.jpg' }
const PAINT_B = { id: 'b', painter: 'Guy Billout', title: 'B', url: 'paintings/b.jpg' }
const PAINT_FOCUSED = { id: 'c', painter: 'Vermeer', title: 'C', url: 'paintings/c.jpg', focus: '50% 24%' }

function seedPaintings(p: typeof PAINT_A | null) {
  useStore.setState({
    currentPaintings: { cover: null, home: null, study: null, briefing: p },
  })
}

describe('SurfaceBackground weight grammar', () => {
  beforeEach(() => { cleanup(); vi.useFakeTimers() })
  afterEach(() => { vi.useRealTimers() })

  it('first mount shows the painting immediately with no swap animation', () => {
    seedPaintings(PAINT_A)
    render(<SurfaceBackground surface="briefing" />)
    const bg = screen.getByTestId('surface-background')
    expect(bg.getAttribute('data-swapping')).toBeNull()
    const img = bg.querySelector('img')!
    expect(img.getAttribute('src')).toBe('paintings/a.jpg')
    expect(img.className).not.toContain('painting-drop-in')
  })

  it('swap: old falls out, new drops in delayed, settles after 850ms', () => {
    seedPaintings(PAINT_A)
    render(<SurfaceBackground surface="briefing" />)
    act(() => { seedPaintings(PAINT_B) })

    const bg = screen.getByTestId('surface-background')
    expect(bg.getAttribute('data-swapping')).toBe('')
    const imgs = bg.querySelectorAll('img')
    expect(imgs.length).toBe(2)
    expect(imgs[0].className).toContain('painting-fall-out')
    expect(imgs[1].className).toContain('painting-drop-in')
    expect(imgs[1].style.animationDelay).toBe('240ms')

    act(() => { vi.advanceTimersByTime(900) })
    expect(bg.getAttribute('data-swapping')).toBeNull()
    const settled = bg.querySelectorAll('img')
    expect(settled.length).toBe(1)
    expect(settled[0].getAttribute('src')).toBe('paintings/b.jpg')
    expect(settled[0].className).not.toContain('painting-drop-in')
  })

  it('renders vignette darkening even when no painting is set (dev HMR resilience)', () => {
    // SurfaceBackground must render the vignette overlay even if currentPaintings
    // is null — otherwise dev-mode timing / HMR reload / Strict Mode remounting
    // can leave the page without darkening, making text unreadable over bright art.
    seedPaintings(null)
    render(<SurfaceBackground surface="briefing" />)
    const bg = screen.getByTestId('surface-background')
    // Should still render with vignette div
    expect(bg.querySelectorAll('img').length).toBe(0)
    const vignetteEl = bg.children[0] as HTMLElement
    expect(vignetteEl.tagName).toBe('DIV')
    expect(vignetteEl.style.background).toContain('radial-gradient')
  })

  it('swap: outgoing image keeps its custom focus (no snap to center)', () => {
    // 回归：裁剪改过焦点的画作被换掉时，坠出的旧图必须保持原 object-position，
    // 否则焦点偏离居中的画会在换画瞬间跳回 50% 50%，表现为画面大幅跳动。
    mockManifest.push(PAINT_FOCUSED)
    seedPaintings(PAINT_FOCUSED)
    render(<SurfaceBackground surface="briefing" />)
    act(() => { seedPaintings(PAINT_B) })

    const outgoing = screen.getByTestId('surface-background').querySelector('img.painting-fall-out')! as HTMLImageElement
    expect(outgoing.getAttribute('src')).toBe('paintings/c.jpg')
    expect(outgoing.style.objectPosition).toBe('50% 24%')
  })

  it('CRT grain overlay activates during swap', () => {
    seedPaintings(PAINT_A)
    render(<SurfaceBackground surface="briefing" />)
    act(() => { seedPaintings(PAINT_B) })
    const crt = screen.getByTestId('surface-background').querySelector('.painting-crt')!
    expect(crt.className).toContain('on')
  })
})
