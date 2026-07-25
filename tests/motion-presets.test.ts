import { describe, expect, it } from 'vitest'
import {
  SPRING_SETTLE, SPRING_SLIDE,
  SWAP_FALL_MS, SWAP_DROP_MS, SWAP_DROP_DELAY_MS, SWAP_TOTAL_MS,
} from '@/lib/motion-presets'

describe('motion-presets', () => {
  it('exposes the two spring curves of the weight grammar', () => {
    expect(SPRING_SETTLE).toBe('cubic-bezier(0.34, 1.4, 0.5, 1)')
    expect(SPRING_SLIDE).toBe('cubic-bezier(0.22, 1, 0.36, 1)')
  })

  it('swap timing: fall 500ms, drop 550ms delayed 240ms, total 850ms lock', () => {
    expect(SWAP_FALL_MS).toBe(500)
    expect(SWAP_DROP_MS).toBe(550)
    expect(SWAP_DROP_DELAY_MS).toBe(240)
    expect(SWAP_TOTAL_MS).toBe(850)
  })
})
