import { describe, it, expect } from 'vitest'
import { pickRandom, formatAttribution, preloadPaintings } from '@/lib/paintings'
import type { Painting } from '@shared/index'

const sample: Painting[] = [
  { id: 'rothko-1', painter: 'Mark Rothko', title: 'Purple Brown', year: 1957, url: 'paintings/a.jpg' },
  { id: 'rothko-2', painter: 'Mark Rothko', title: 'Untitled', url: 'paintings/b.jpg' },
  { id: 'billout-1', painter: 'Guy Billout', title: 'Moon', url: 'paintings/c.jpg' },
]

describe('pickRandom', () => {
  it('returns null for an empty pool', () => {
    expect(pickRandom([], null)).toBeNull()
  })

  it('returns the only painting when pool has one', () => {
    const one = [sample[0]]
    expect(pickRandom(one, null)).toBe(sample[0])
  })

  it('returns a painting from the pool when no exclusion', () => {
    const picked = pickRandom(sample, null)
    expect(picked).not.toBeNull()
    expect(sample).toContain(picked!)
  })

  it('never returns the excluded painting (1000 trials)', () => {
    for (let i = 0; i < 1000; i++) {
      const picked = pickRandom(sample, 'rothko-1')
      expect(picked!.id).not.toBe('rothko-1')
    }
  })

  it('returns null if pool only contains the excluded id', () => {
    expect(pickRandom([sample[0]], 'rothko-1')).toBeNull()
  })
})

describe('formatAttribution', () => {
  it('includes painter, title, and year when year exists', () => {
    expect(formatAttribution(sample[0])).toBe('Mark Rothko · Purple Brown · 1957')
  })

  it('omits year when year is undefined', () => {
    expect(formatAttribution(sample[1])).toBe('Mark Rothko · Untitled')
  })

  it('handles Billout paintings', () => {
    expect(formatAttribution(sample[2])).toBe('Guy Billout · Moon')
  })
})

describe('preloadPaintings', () => {
  it('sets src only for entries with a url, skipping null/empty', () => {
    const created: string[] = []
    const OrigImage = globalThis.Image
    // @ts-expect-error minimal Image stub for the test
    globalThis.Image = class {
      set src(v: string) {
        created.push(v)
      }
    }
    preloadPaintings([
      sample[0],
      null,
      undefined,
      { id: 'x', painter: 'p', title: 't', url: '' } as Painting,
    ])
    globalThis.Image = OrigImage
    expect(created).toEqual(['paintings/a.jpg'])
  })

  it('does not throw when Image is unavailable (node env)', () => {
    const OrigImage = globalThis.Image
    // @ts-expect-error simulate non-DOM environment
    globalThis.Image = undefined
    expect(() => preloadPaintings([sample[0]])).not.toThrow()
    globalThis.Image = OrigImage
  })
})
