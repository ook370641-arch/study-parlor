import { describe, it, expect } from 'vitest'
import {
  DEFAULT_JOB_BRIEFING_CONFIG,
  DEFAULT_JOB_PROFILE,
  normalizeJobProfile,
  normalizeJobBriefingConfig,
  isJobProfileEmpty,
} from '../src/lib/job-briefing-defaults'

describe('normalizeJobProfile (renderer)', () => {
  it('returns defaults for undefined input', () => {
    const p = normalizeJobProfile(undefined)
    expect(p.targetRoles).toEqual([])
    expect(p.skills).toEqual([])
    expect(p.direction).toBe('')
    expect(p.experience).toBe('')
  })

  it('returns defaults for null input', () => {
    const p = normalizeJobProfile(null as any)
    expect(p.targetRoles).toEqual([])
    expect(p.skills).toEqual([])
  })

  it('returns defaults for empty object', () => {
    const p = normalizeJobProfile({})
    expect(p.targetRoles).toEqual([])
    expect(p.skills).toEqual([])
    expect(p.direction).toBe('')
  })

  it('preserves valid values', () => {
    const p = normalizeJobProfile({
      targetRoles: ['AI产品经理'],
      direction: '找AI方向工作',
      skills: ['RAG', 'Agent'],
      experience: '3年经验',
    })
    expect(p.targetRoles).toEqual(['AI产品经理'])
    expect(p.skills).toEqual(['RAG', 'Agent'])
    expect(p.direction).toBe('找AI方向工作')
    expect(p.experience).toBe('3年经验')
  })

  it('fills missing fields with defaults (partial old state.json)', () => {
    // Simulates old state.json that only had direction
    const p = normalizeJobProfile({ direction: 'old data' } as any)
    expect(p.targetRoles).toEqual([])   // was undefined → []
    expect(p.skills).toEqual([])        // was undefined → []
    expect(p.direction).toBe('old data')
    expect(p.experience).toBe('')
  })

  it('filters non-string entries from arrays', () => {
    const p = normalizeJobProfile({
      targetRoles: ['valid', 123 as any, '', '  ', null as any],
      skills: [undefined as any, 'valid-skill', false as any],
    } as any)
    expect(p.targetRoles).toEqual(['valid'])
    expect(p.skills).toEqual(['valid-skill'])
  })

  it('handles completely empty arrays', () => {
    const p = normalizeJobProfile({ targetRoles: [], skills: [] })
    expect(p.targetRoles).toEqual([])
    expect(p.skills).toEqual([])
  })
})

describe('normalizeJobBriefingConfig (renderer)', () => {
  it('returns defaults for undefined input', () => {
    const c = normalizeJobBriefingConfig(undefined)
    expect(c.companies.length).toBe(DEFAULT_JOB_BRIEFING_CONFIG.companies.length)
    expect(Array.isArray(c.eventSearchKeywords)).toBe(true)
    expect(Array.isArray(c.jobSearchKeywords)).toBe(true)
  })

  it('returns defaults for null input', () => {
    const c = normalizeJobBriefingConfig(null)
    expect(c.companies.length).toBe(DEFAULT_JOB_BRIEFING_CONFIG.companies.length)
    expect(c.eventSearchKeywords).toEqual([])
    expect(c.jobSearchKeywords).toEqual([])
  })

  it('returns defaults for empty object', () => {
    const c = normalizeJobBriefingConfig({})
    expect(c.companies.length).toBe(DEFAULT_JOB_BRIEFING_CONFIG.companies.length)
    expect(c.eventSearchKeywords).toEqual([])
    expect(c.jobSearchKeywords).toEqual([])
    expect(c.searchFallRecruit).toBe(true)
    expect(c.searchInternship).toBe(false)
  })

  it('fills missing array fields with empty arrays (partial old state.json)', () => {
    // Simulates state.json saved before eventSearchKeywords/jobSearchKeywords were added
    const c = normalizeJobBriefingConfig({
      companies: [{ name: 'TestCo', priority: 1, enabled: true }],
    } as any)
    expect(c.eventSearchKeywords).toEqual([])  // was undefined → []
    expect(c.jobSearchKeywords).toEqual([])    // was undefined → []
    expect(c.searchFallRecruit).toBe(true)      // was undefined → default
    expect(c.searchInternship).toBe(false)      // was undefined → default
    expect(c.companies).toHaveLength(1)
  })

  it('preserves valid eventSearchKeywords and jobSearchKeywords', () => {
    const c = normalizeJobBriefingConfig({
      eventSearchKeywords: ['秋招', '校招'],
      jobSearchKeywords: ['AI产品', '大模型'],
    })
    expect(c.eventSearchKeywords).toEqual(['秋招', '校招'])
    expect(c.jobSearchKeywords).toEqual(['AI产品', '大模型'])
  })

  it('filters non-string entries from keyword arrays', () => {
    const c = normalizeJobBriefingConfig({
      eventSearchKeywords: ['valid', 123 as any, '', null as any],
      jobSearchKeywords: [undefined as any, 'valid-job'],
    } as any)
    expect(c.eventSearchKeywords).toEqual(['valid'])
    expect(c.jobSearchKeywords).toEqual(['valid-job'])
  })

  it('normalizes corrupt company entries', () => {
    const c = normalizeJobBriefingConfig({
      companies: [
        { name: 'GoodCo', priority: 1, enabled: true },
        { name: '', priority: 99, enabled: false } as any,
      ],
    })
    expect(c.companies).toHaveLength(2)
    expect(c.companies[0].name).toBe('GoodCo')
    expect(c.companies[1].name).toBe('')
  })

  it('falls back to default companies when companies array is empty', () => {
    const c = normalizeJobBriefingConfig({ companies: [] })
    expect(c.companies.length).toBe(DEFAULT_JOB_BRIEFING_CONFIG.companies.length)
  })

  it('defaults searchInternship to false when missing', () => {
    const c = normalizeJobBriefingConfig({ searchFallRecruit: false } as any)
    expect(c.searchFallRecruit).toBe(false)
    expect(c.searchInternship).toBe(false) // default
  })
})

describe('isJobProfileEmpty', () => {
  it('returns true for default profile', () => {
    expect(isJobProfileEmpty(DEFAULT_JOB_PROFILE)).toBe(true)
  })

  it('returns true when only skills filled', () => {
    expect(isJobProfileEmpty({ ...DEFAULT_JOB_PROFILE, skills: ['RAG'] })).toBe(true)
  })

  it('returns false when targetRoles filled', () => {
    expect(isJobProfileEmpty({ ...DEFAULT_JOB_PROFILE, targetRoles: ['AI产品经理'] })).toBe(false)
  })

  it('returns false when direction filled', () => {
    expect(isJobProfileEmpty({ ...DEFAULT_JOB_PROFILE, direction: '找AI工作' })).toBe(false)
  })
})
