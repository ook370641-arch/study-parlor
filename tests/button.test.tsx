import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { Button } from '@/components/Button'

vi.mock('@/store', () => ({
  useStore: (selector: (state: unknown) => unknown) => selector({
    profile: { name: '访客' },
    goto: vi.fn(),
    patchProfile: vi.fn(),
    paintingDeleteEnabled: false,
  }),
}))
vi.mock('@/components/SurfaceBackground', () => ({ SurfaceBackground: () => null }))
vi.mock('@/components/SwapPaintingButton', () => ({ SwapPaintingButton: () => null }))
vi.mock('@/components/DeletePaintingButton', () => ({ DeletePaintingButton: () => null }))
vi.mock('@/components/PaintingCropButton', () => ({ PaintingCropButton: () => null }))
vi.mock('@/components/Quote', () => ({ Quote: () => null }))

import { Cover } from '@/pages/Cover'

afterEach(cleanup)

// jsdom cannot do native hit testing. These guard the styling contract; the
// regression is also checked with real mouse down/up at the button edges.
function expectStationaryHitArea(button: HTMLElement) {
  expect(button.className).not.toMatch(/(?:hover|active):(?:translate|scale|rotate)/)
  expect(button.className).toContain('active:shadow-none')
}

describe('Button stationary pointer target', () => {
  it.each(['academic', 'newspaper'] as const)('%s retains press feedback without moving the target', theme => {
    render(<Button theme={theme}>打开</Button>)
    expectStationaryHitArea(screen.getByRole('button'))
  })

  it('cover buttons do not reintroduce translated hover/active overrides', () => {
    render(<Cover />)
    expectStationaryHitArea(screen.getByTestId('cover-light-button'))
    expectStationaryHitArea(screen.getByTestId('cover-briefing-button'))
  })

  it('preserves native disabled behavior and click handlers', () => {
    const onClick = vi.fn()
    const { rerender } = render(<Button disabled onClick={onClick}>打开</Button>)
    fireEvent.click(screen.getByRole('button'))
    expect(onClick).not.toHaveBeenCalled()
    rerender(<Button onClick={onClick}>打开</Button>)
    fireEvent.click(screen.getByRole('button'))
    expect(onClick).toHaveBeenCalledTimes(1)
  })
})
