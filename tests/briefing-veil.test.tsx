import { render, screen, cleanup } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { BriefingVeil } from '@/components/briefing/BriefingVeil'

describe('BriefingVeil', () => {
  it('renders a fixed pointer-events-none overlay with the layered gradient', () => {
    cleanup()
    render(<BriefingVeil />)
    const veil = screen.getByTestId('briefing-veil')
    expect(veil.className).toContain('pointer-events-none')
    expect(veil.className).toContain('fixed')
    expect(veil.style.background).toContain('linear-gradient')
    expect(veil.style.background).toContain('rgba(12, 8, 6, 0.3)')
  })
})
