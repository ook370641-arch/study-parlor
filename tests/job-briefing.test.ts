import { describe, it, expect } from 'vitest'
import {
  DEFAULT_JOB_BRIEFING_CONFIG,
  normalizeJobBriefingConfig,
  buildOfficialPageQueries,
  buildTavilyQueries,
  mergeAndDedupJobs,
} from '../electron/lib/job-briefing'
import type { RawJob } from '../electron/lib/job-briefing'

describe('job-briefing config', () => {
  it('normalizes empty config to defaults', () => {
    const config = normalizeJobBriefingConfig({})
    expect(config.companies.length).toBe(DEFAULT_JOB_BRIEFING_CONFIG.companies.length)
    expect(config.roleKeywords).toEqual(DEFAULT_JOB_BRIEFING_CONFIG.roleKeywords)
    expect(config.cities).toEqual(DEFAULT_JOB_BRIEFING_CONFIG.cities)
    expect(config.skillKeywords).toEqual(DEFAULT_JOB_BRIEFING_CONFIG.skillKeywords)
  })

  it('normalizes undefined config to defaults', () => {
    const config = normalizeJobBriefingConfig()
    expect(config.companies.length).toBe(DEFAULT_JOB_BRIEFING_CONFIG.companies.length)
  })

  it('preserves provided values', () => {
    const config = normalizeJobBriefingConfig({
      roleKeywords: ['测试'],
      cities: ['成都'],
      skillKeywords: ['AIGC'],
      companies: [{ name: 'Test', priority: 1, enabled: true }],
    })
    expect(config.roleKeywords).toEqual(['测试'])
    expect(config.cities).toEqual(['成都'])
    expect(config.skillKeywords).toEqual(['AIGC'])
    expect(config.companies).toHaveLength(1)
  })

  it('builds official page queries', () => {
    const qs = buildOfficialPageQueries('字节跳动')
    expect(qs).toContain('字节跳动 官方招聘 AI产品经理')
    expect(qs).toContain('字节跳动 careers AI product manager')
  })

  it('builds Tavily queries with enabled companies only', () => {
    const config = normalizeJobBriefingConfig({
      companies: [
        { name: '字节跳动', priority: 1, enabled: true },
        { name: '禁用公司', priority: 2, enabled: false },
      ],
    })
    const qs = buildTavilyQueries(config)
    expect(qs.some((q) => q.includes('字节跳动'))).toBe(true)
    expect(qs.some((q) => q.includes('禁用公司'))).toBe(false)
  })
})

describe('job-briefing dedup', () => {
  it('removes duplicate company/title/url jobs', () => {
    const jobs: RawJob[] = [
      { title: 'AI产品经理', company: '腾讯', city: '深圳', salary: '40W', requirements: [], url: 'https://t.com/1', source: 'official' },
      { title: 'AI产品经理', company: '腾讯', city: '深圳', salary: '45W', requirements: [], url: 'https://t.com/1', source: 'tavily' },
      { title: '大模型产品经理', company: '腾讯', city: '深圳', salary: '40W', requirements: [], url: 'https://t.com/2', source: 'official' },
    ]
    const merged = mergeAndDedupJobs(jobs)
    expect(merged).toHaveLength(2)
  })

  it('keeps jobs with same title but different company', () => {
    const jobs: RawJob[] = [
      { title: 'AI产品经理', company: '腾讯', city: '深圳', salary: '', requirements: [], url: 'https://a.com', source: 'official' },
      { title: 'AI产品经理', company: '字节跳动', city: '北京', salary: '', requirements: [], url: 'https://b.com', source: 'official' },
    ]
    expect(mergeAndDedupJobs(jobs)).toHaveLength(2)
  })

  it('returns empty array for empty input', () => {
    expect(mergeAndDedupJobs([])).toEqual([])
  })
})
