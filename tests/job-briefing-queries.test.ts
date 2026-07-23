import { describe, it, expect } from 'vitest'
import { buildEventQueries, buildFocusJobQuery } from '../electron/lib/job-briefing'
import { DEFAULT_JOB_BRIEFING_CONFIG, DEFAULT_JOB_PROFILE } from '../src/lib/job-briefing-defaults'

describe('buildEventQueries cities injection', () => {
  it('company and aggregate queries include city keyword', () => {
    const config = { ...DEFAULT_JOB_BRIEFING_CONFIG, cities: ['西安'] }
    const queries = buildEventQueries(config)
    expect(queries.length).toBeGreaterThan(1)
    for (const q of queries) expect(q.query).toContain('西安')
  })
  it('empty cities produces no trailing whitespace', () => {
    const config = { ...DEFAULT_JOB_BRIEFING_CONFIG, cities: [] }
    for (const q of buildEventQueries(config)) {
      expect(q.query).not.toMatch(/\s{2,}/)
      expect(q.query).not.toMatch(/\s$/)
    }
  })
})

describe('buildFocusJobQuery cities injection', () => {
  it('focus job query contains city', () => {
    const config = { ...DEFAULT_JOB_BRIEFING_CONFIG, cities: ['成都'] }
    expect(buildFocusJobQuery('腾讯', DEFAULT_JOB_PROFILE, config)).toContain('成都')
  })
})
