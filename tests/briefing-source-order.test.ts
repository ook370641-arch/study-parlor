import { describe, expect, it } from 'vitest'
import { DEFAULT_BRIEFING_SOURCE_ORDER, normalizeBriefingSourceOrder } from '@/lib/briefing-source-order'

describe('normalizeBriefingSourceOrder', () => {
  it('returns default order when raw is undefined', () => {
    expect(normalizeBriefingSourceOrder(undefined)).toEqual(['writing', 'digest', 'anthropic', 'job-briefing', 'scout'])
  })

  it('returns default order when raw is not an array', () => {
    expect(normalizeBriefingSourceOrder('anthropic')).toEqual(DEFAULT_BRIEFING_SOURCE_ORDER)
    expect(normalizeBriefingSourceOrder(null)).toEqual(DEFAULT_BRIEFING_SOURCE_ORDER)
  })

  it('preserves user order', () => {
    expect(normalizeBriefingSourceOrder(['anthropic', 'writing', 'digest', 'job-briefing', 'scout']))
      .toEqual(['anthropic', 'writing', 'digest', 'job-briefing', 'scout'])
  })

  it('filters unknown ids', () => {
    expect(normalizeBriefingSourceOrder(['anthropic', 'nope', 'writing', 'digest', 'job-briefing', 'scout']))
      .toEqual(['anthropic', 'writing', 'digest', 'job-briefing', 'scout'])
  })

  it('appends missing ids at the end (future new source)', () => {
    expect(normalizeBriefingSourceOrder(['anthropic', 'writing']))
      .toEqual(['anthropic', 'writing', 'digest', 'job-briefing', 'scout'])
  })

  it('dedupes repeated ids keeping first occurrence', () => {
    expect(normalizeBriefingSourceOrder(['anthropic', 'anthropic', 'writing', 'digest', 'job-briefing', 'scout']))
      .toEqual(['anthropic', 'writing', 'digest', 'job-briefing', 'scout'])
  })
})
