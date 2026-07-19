import { describe, it, expect } from 'vitest'
import {
  DEFAULT_JOB_BRIEFING_CONFIG,
  normalizeJobBriefingConfig,
  buildOfficialPageQueries,
  buildTavilyQueries,
  mergeAndDedupJobs,
  JOB_COMMUNITY_DOMAINS,
  buildEventQueries,
  dedupEvents,
  companyNameMatches,
  selectFocusCompanies,
  buildFocusJobQuery,
} from '../electron/lib/job-briefing'
import type { RawJob } from '../electron/lib/job-briefing'
import { DEFAULT_JOB_PROFILE, isJobProfileEmpty, normalizeJobProfile, formatJobProfile } from '../src/lib/job-briefing-defaults'

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

describe('job profile defaults', () => {
  it('default profile is empty', () => {
    expect(isJobProfileEmpty(DEFAULT_JOB_PROFILE)).toBe(true)
    expect(DEFAULT_JOB_PROFILE.updatedAt).toBe('')
  })

  it('normalizes missing/garbage fields', () => {
    const p = normalizeJobProfile({ targetRoles: ['模型产品经理', 42 as unknown as string], direction: 7 as unknown as string })
    expect(p.targetRoles).toEqual(['模型产品经理'])
    expect(p.direction).toBe('')
    expect(p.skills).toEqual([])
  })

  it('empty check requires all of targetRoles/direction/experience empty', () => {
    expect(isJobProfileEmpty(normalizeJobProfile({ direction: '大模型产品' }))).toBe(false)
    expect(isJobProfileEmpty(normalizeJobProfile({ experience: '某厂实习' }))).toBe(false)
    expect(isJobProfileEmpty(normalizeJobProfile({ targetRoles: ['AI产品经理'] }))).toBe(false)
  })

  it('formats filled profile as prompt lines', () => {
    const text = formatJobProfile(normalizeJobProfile({
      targetRoles: ['模型产品经理'],
      direction: '大模型/Agent 产品',
      skills: ['RAG'],
      experience: '某厂 AI 实习',
    }))
    expect(text).toContain('意向岗位: 模型产品经理')
    expect(text).toContain('方向: 大模型/Agent 产品')
    expect(text).toContain('技能: RAG')
    expect(text).toContain('经历: 某厂 AI 实习')
  })

  it('formats empty profile as fallback notice', () => {
    expect(formatJobProfile(DEFAULT_JOB_PROFILE)).toContain('未提供')
  })
})

describe('event lane', () => {
  it('builds one query per enabled company plus a community query', () => {
    const config = normalizeJobBriefingConfig({
      companies: [
        { name: '腾讯', priority: 2, enabled: true },
        { name: '字节跳动', priority: 1, enabled: true },
        { name: '禁用', priority: 3, enabled: false },
      ],
    })
    const qs = buildEventQueries(config)
    // 按 priority 排序：字节跳动在前
    expect(qs[0]).toEqual({ query: expect.stringContaining('字节跳动'), company: '字节跳动' })
    expect(qs[1]).toEqual({ query: expect.stringContaining('腾讯'), company: '腾讯' })
    expect(qs.some(q => q.query.includes('禁用'))).toBe(false)
    // 最后一条是社区定向查询
    const community = qs[qs.length - 1]
    expect(community.company).toBeUndefined()
    expect(community.includeDomains).toBeDefined()
    expect(community.includeDomains!.every(d => JOB_COMMUNITY_DOMAINS.includes(d))).toBe(true)
  })

  it('dedups events by company+title', () => {
    const events = dedupEvents([
      { company: '腾讯', eventType: '秋招开启', title: '秋招启动', date: '', summary: 'a', url: 'u1' },
      { company: '腾讯', eventType: '秋招开启', title: '秋招启动', date: '', summary: 'b', url: 'u2' },
      { company: '百度', eventType: '新岗位', title: '秋招启动', date: '', summary: 'c', url: 'u3' },
    ])
    expect(events).toHaveLength(2)
  })

  it('matches company names leniently', () => {
    expect(companyNameMatches('腾讯', '腾讯')).toBe(true)
    expect(companyNameMatches('腾讯科技', '腾讯')).toBe(true)
    expect(companyNameMatches('腾讯', '腾讯科技')).toBe(true)
    expect(companyNameMatches('阿里巴巴', '腾讯')).toBe(false)
    expect(companyNameMatches('', '腾讯')).toBe(false)
  })
})

describe('focus selection', () => {
  const config = normalizeJobBriefingConfig({
    companies: [
      { name: '字节跳动', priority: 1, enabled: true },
      { name: '腾讯', priority: 2, enabled: true },
      { name: '百度', priority: 3, enabled: true },
      { name: '美团', priority: 4, enabled: true },
      { name: '阿里', priority: 5, enabled: true },
      { name: 'MiniMax', priority: 6, enabled: true },
    ],
  })

  it('focuses on companies that have fresh events, carrying event title', () => {
    const focus = selectFocusCompanies(
      [{ company: '腾讯科技', eventType: '秋招开启', title: '腾讯 2027 届秋招启动', date: '', summary: '', url: '' }],
      config,
    )
    expect(focus).toEqual([{ name: '腾讯', eventTitle: '腾讯 2027 届秋招启动' }])
  })

  it('falls back to top-5 priority companies when no events', () => {
    const focus = selectFocusCompanies([], config)
    expect(focus.map(f => f.name)).toEqual(['字节跳动', '腾讯', '百度', '美团', '阿里'])
    expect(focus.every(f => f.eventTitle === undefined)).toBe(true)
  })

  it('builds focus job query with profile targetRoles when filled', () => {
    const q = buildFocusJobQuery('腾讯', normalizeJobProfile({ targetRoles: ['模型产品经理'] }), config)
    expect(q).toBe('腾讯 模型产品经理 招聘 校招 2026')
  })

  it('falls back to roleKeywords when profile targetRoles empty', () => {
    const q = buildFocusJobQuery('腾讯', normalizeJobProfile({}), normalizeJobBriefingConfig({ roleKeywords: ['AI产品经理'] }))
    expect(q).toBe('腾讯 AI产品经理 招聘 校招 2026')
  })
})
