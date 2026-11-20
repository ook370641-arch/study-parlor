import { describe, expect, it } from 'vitest'
import { normalizeBriefingSource } from '@/lib/briefing-source'

describe('normalizeBriefingSource', () => {
  it.each(['study', 'writing', 'anthropic', 'book'])('accepts %s', value => {
    expect(normalizeBriefingSource(value)).toBe(value)
  })

  it.each([undefined, null, 'home', 'digest', 42])('falls back for %s', value => {
    expect(normalizeBriefingSource(value)).toBe('writing')
  })
})
