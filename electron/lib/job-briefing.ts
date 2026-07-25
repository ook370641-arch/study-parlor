import fs from 'node:fs'
import path from 'node:path'
import { BrowserWindow } from 'electron'
import { chatNonStream } from './kimi'
import { searchWeb, type TavilyResult } from './search'
import { getSearchApiKey } from './credentials'
import { extractJsonObject } from './extract-json'
import { dumpRecovery } from './recovery'
import { serializeFrontmatter } from './frontmatter'
import type { AppConfig } from '../env'
import type {
  InterviewQuestion,
  JobBriefingConfig,
  JobCompany,
  JobBriefingResult,
  JobBriefingSourceStatus,
  JobErrorCode,
  JobBriefingStage,
  JobEvent,
  JobEventType,
  JobProfile,
  MatchedJob,
  Message,
} from '@shared/index'

import { toJobErrorCode } from './job-error-codes'
import { DEFAULT_JOB_BRIEFING_CONFIG, formatJobProfile } from '../../src/lib/job-briefing-defaults'

export { DEFAULT_JOB_BRIEFING_CONFIG }

// Simple promise-based semaphore: serialize BrowserWindow creation to avoid
// multiple concurrent hidden Electron windows competing for resources.
let browserSemaphore: Promise<void> = Promise.resolve()
function withBrowserLimit<T>(fn: () => Promise<T>): Promise<T> {
  const prev = browserSemaphore
  let release: () => void
  browserSemaphore = new Promise<void>(resolve => { release = resolve })
  return prev.then(() => fn().finally(() => release!()))
}

export function normalizeJobBriefingConfig(raw?: Partial<JobBriefingConfig>): JobBriefingConfig {
  return {
    companies: raw?.companies?.length ? raw.companies : DEFAULT_JOB_BRIEFING_CONFIG.companies,
    roleKeywords: raw?.roleKeywords?.length ? raw.roleKeywords : DEFAULT_JOB_BRIEFING_CONFIG.roleKeywords,
    cities: raw?.cities?.length ? raw.cities : DEFAULT_JOB_BRIEFING_CONFIG.cities,
    skillKeywords: raw?.skillKeywords?.length ? raw.skillKeywords : DEFAULT_JOB_BRIEFING_CONFIG.skillKeywords,
    eventSearchKeywords: raw?.eventSearchKeywords ?? DEFAULT_JOB_BRIEFING_CONFIG.eventSearchKeywords,
    jobSearchKeywords: raw?.jobSearchKeywords ?? DEFAULT_JOB_BRIEFING_CONFIG.jobSearchKeywords,
    searchInternship: raw?.searchInternship ?? DEFAULT_JOB_BRIEFING_CONFIG.searchInternship,
    searchFallRecruit: raw?.searchFallRecruit ?? DEFAULT_JOB_BRIEFING_CONFIG.searchFallRecruit,
  }
}

export function buildOfficialPageQueries(company: string): string[] {
  return [
    `${company} 官方招聘 AI产品经理`,
    `${company} careers AI product manager`,
  ]
}

export const JOB_COMMUNITY_DOMAINS = ['nowcoder.com', 'yingjiesheng.com', 'zhihu.com', 'xiaohongshu.com']

export type EventQuery = { query: string; company?: string; includeDomains?: string[]; dimension?: 'fallRecruit' | 'internship' | 'general' }

export function buildEventQueries(config: JobBriefingConfig): EventQuery[] {
  const cities = config.cities.join(' ')
  const enabledCompanies = config.companies.filter(c => c.enabled)
  const companyNames = enabledCompanies.map(c => c.name).join(' ')
  const keywords = config.eventSearchKeywords.length > 0
    ? config.eventSearchKeywords.join(' ')
    : config.roleKeywords.join(' ')

  const queries: EventQuery[] = []
  if (config.searchFallRecruit) {
    queries.push({
      query: `${keywords} 秋招 校招 2026 2027届 ${companyNames} ${cities}`.trim(),
      includeDomains: ['nowcoder.com', 'yingjiesheng.com'],
      dimension: 'fallRecruit' as const,
    })
  }
  if (config.searchInternship) {
    queries.push({
      query: `${keywords} 实习 提前批 2026 2027届 ${companyNames} ${cities}`.trim(),
      includeDomains: ['nowcoder.com', 'yingjiesheng.com'],
      dimension: 'internship' as const,
    })
  }
  if (queries.length === 0) {
    queries.push({
      query: `${keywords} 招聘 2026 2027届 ${companyNames} ${cities}`.trim(),
      includeDomains: ['nowcoder.com', 'yingjiesheng.com'],
      dimension: 'general' as const,
    })
  }
  return queries
}

export function dedupEvents(events: JobEvent[]): JobEvent[] {
  const seen = new Set<string>()
  const out: JobEvent[] = []
  for (const e of events) {
    const key = `${e.company}|${e.title}`
    if (seen.has(key)) continue
    seen.add(key)
    out.push(e)
  }
  return out
}

export function companyNameMatches(a: string, b: string): boolean {
  if (!a || !b) return false
  return a === b || a.includes(b) || b.includes(a)
}

export type RawJob = {
  title: string
  city: string
  salary: string
  requirements: string[]
  url: string
  source: 'official' | 'tavily'
  company: string
}

export function mergeAndDedupJobs(jobs: RawJob[]): RawJob[] {
  const seen = new Set<string>()
  const out: RawJob[] = []
  for (const job of jobs) {
    const key = `${job.company}|${job.title}|${job.url}`
    if (seen.has(key)) continue
    seen.add(key)
    out.push(job)
  }
  return out
}

function promptsDir(): string {
  const candidates = [
    path.resolve(__dirname, '..', 'prompts', 'job-briefing'),
    path.resolve(__dirname, '..', '..', 'electron', 'prompts', 'job-briefing'),
  ]
  for (const c of candidates) {
    if (fs.existsSync(c)) return c
  }
  throw new Error(`job-briefing prompts dir not found. Tried: ${candidates.join(', ')}`)
}

function readPrompt(name: string): string {
  return fs.readFileSync(path.join(promptsDir(), `${name}.md`), 'utf8')
}

export function jobBriefingDir(cfg: AppConfig): string {
  return path.join(cfg.libraryPath, '求职简报')
}

export function jobBriefingFilePath(cfg: AppConfig, date: string): string {
  return path.join(jobBriefingDir(cfg), `求职简报-${date}.md`)
}

export async function discoverCareerPage(
  company: string,
  opts: { apiKey: string; signal?: AbortSignal }
): Promise<{ url?: string; confidence: number }> {
  const queries = buildOfficialPageQueries(company)
  for (const query of queries) {
    try {
      const results = await searchWeb({ query, apiKey: opts.apiKey, maxResults: 3, signal: opts.signal })
      const official = results.find(r =>
        r.url.includes('jobs.') ||
        r.url.includes('careers.') ||
        r.url.includes('zhaopin') ||
        r.url.includes('join') ||
        /hr\.\w+\.com/.test(r.url)
      )
      if (official) {
        return { url: official.url, confidence: official.score ?? 0.8 }
      }
      if (results[0]) {
        return { url: results[0].url, confidence: 0.5 }
      }
    } catch (err) {
      console.warn(`[job-briefing] discover failed for ${company}: ${query}`, err)
    }
  }
  return { confidence: 0 }
}

export async function fetchPageHtml(
  url: string,
  opts: { signal?: AbortSignal; useBrowserFallback?: boolean } = {}
): Promise<string> {
  const ctl = new AbortController()
  const timeoutId = setTimeout(() => ctl.abort(), 15_000)
  const onExternalAbort = () => ctl.abort()
  let externalListenerAdded = false
  if (opts.signal) {
    if (opts.signal.aborted) ctl.abort()
    else {
      opts.signal.addEventListener('abort', onExternalAbort, { once: true })
      externalListenerAdded = true
    }
  }

  try {
    const res = await fetch(url, {
      signal: ctl.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
        'Accept': 'text/html',
      },
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const text = await res.text()
    if (text.length > 1000) return text
    if (!opts.useBrowserFallback) throw new Error('HTML too short')
  } catch (err) {
    if (!opts.useBrowserFallback) throw err
  } finally {
    clearTimeout(timeoutId)
    if (externalListenerAdded) opts.signal?.removeEventListener('abort', onExternalAbort)
  }

  // Browser fallback for JS-rendered pages (serialized via semaphore)
  return withBrowserLimit(() => new Promise((resolve, reject) => {
    const win = new BrowserWindow({
      width: 1280,
      height: 800,
      show: false,
      webPreferences: { offscreen: true },
    })
    const browserCtl = new AbortController()
    const browserTimeout = setTimeout(() => {
      browserCtl.abort()
      win.destroy()
      reject(new Error('browser fetch timeout'))
    }, 20_000)

    if (opts.signal) {
      opts.signal.addEventListener('abort', () => {
        browserCtl.abort()
        win.destroy()
        clearTimeout(browserTimeout)
        reject(new Error('cancelled'))
      }, { once: true })
    }

    win.webContents.on('did-finish-load', async () => {
      try {
        const html = await win.webContents.executeJavaScript('document.documentElement.outerHTML')
        clearTimeout(browserTimeout)
        win.destroy()
        resolve(String(html))
      } catch (e) {
        clearTimeout(browserTimeout)
        win.destroy()
        reject(e)
      }
    })

    win.webContents.on('did-fail-load', (_, code, desc) => {
      clearTimeout(browserTimeout)
      win.destroy()
      reject(new Error(`browser load failed: ${desc} (${code})`))
    })

    win.loadURL(url)
  }))
}

export async function extractJobsFromHtml(
  cfg: AppConfig,
  args: { html: string; company: string; url: string; source: 'official' | 'tavily' }
): Promise<RawJob[]> {
  const prompt = readPrompt('extract-jobs')
    .replace('{{company}}', args.company)
    .replace('{{url}}', args.url)
    .replace('{{content}}', args.html.slice(0, 80_000))

  const text = await chatNonStream(cfg, {
    messages: [{ role: 'user', content: prompt } as Message],
    temperature: 0.3,
    thinking: { type: 'enabled' },
  })

  const extracted = extractJsonObject(text)
  if (!extracted) throw new Error('EXTRACTION_ERROR: JSON extraction failed')
  const obj = JSON.parse(extracted)
  if (!Array.isArray(obj.jobs)) throw new Error('EXTRACTION_ERROR: jobs is not an array')

  return obj.jobs
    .filter((j: any) => j && typeof j.title === 'string' && j.title.trim())
    .map((j: any) => ({
      title: String(j.title).trim(),
      city: String(j.city ?? '').trim(),
      salary: String(j.salary ?? '').trim(),
      requirements: Array.isArray(j.requirements)
        ? j.requirements.filter((r: unknown) => typeof r === 'string').map((r: string) => r.trim())
        : [],
      url: String(j.url ?? args.url).trim(),
      source: args.source,
      company: args.company,
    }))
}

function normalizeEventType(raw: unknown): JobEventType {
  const valid: JobEventType[] = ['秋招开启', '新岗位', '线下活动', '宣讲会', '其他']
  return valid.includes(raw as JobEventType) ? (raw as JobEventType) : '其他'
}

export async function discoverEvents(
  cfg: AppConfig,
  config: JobBriefingConfig,
  opts: { apiKey: string; signal?: AbortSignal }
): Promise<{ fallRecruit: JobEvent[]; internship: JobEvent[] }> {
  const today = new Date().toISOString().slice(0, 10)
  const queries = buildEventQueries(config)

  // Parallel Tavily search with per-dimension tagging
  const searchResults = await Promise.all(
    queries.map(q =>
      searchWeb({
        query: q.query, apiKey: opts.apiKey, maxResults: 15, days: 14,
        includeDomains: q.includeDomains, signal: opts.signal,
      }).then(results => ({ dimension: q.dimension ?? 'general', results }))
       .catch(err => {
         console.warn(`[job-briefing] event search failed for ${q.dimension}: ${q.query}`, err)
         return { dimension: q.dimension ?? 'general', results: [] as TavilyResult[] }
       })
    )
  )

  const fallRecruitEvents: JobEvent[] = []
  const internshipEvents: JobEvent[] = []

  for (const { dimension, results } of searchResults) {
    if (opts.signal?.aborted) break
    if (results.length === 0) continue

    const content = results.map(r => `标题: ${r.title}\nURL: ${r.url}\n摘要: ${r.content}`).join('\n\n')
    const prompt = readPrompt('extract-events')
      .replace('{{today}}', today)
      .replace('{{company}}', '全部关注公司')
      .replace('{{content}}', content.slice(0, 25000))

    try {
      const text = await chatNonStream(cfg, {
        messages: [{ role: 'user', content: prompt } as Message],
        temperature: 0.3,
        thinking: { type: 'enabled', reasoning_effort: 'high' },
        signal: opts.signal,
      })
      const extracted = extractJsonObject(text)
      if (!extracted) continue
      const obj = JSON.parse(extracted)
      if (!Array.isArray(obj.events)) continue

      const events = obj.events
        .filter((e: any) => e && typeof e.title === 'string' && e.title.trim())
        .map((e: any) => ({
          company: String(e.company ?? '').trim(),
          eventType: normalizeEventType(e.eventType),
          title: e.title.trim(),
          date: String(e.date ?? '').trim(),
          summary: String(e.summary ?? '').trim(),
          url: String(e.url ?? '').trim(),
        }))

      if (dimension === 'fallRecruit') fallRecruitEvents.push(...events)
      else if (dimension === 'internship') internshipEvents.push(...events)
      else {
        // general dimension (no toggles enabled): put in both
        fallRecruitEvents.push(...events)
        internshipEvents.push(...events)
      }
    } catch (err) {
      console.warn(`[job-briefing] LLM extraction failed for ${dimension}`, err)
    }
  }

  return {
    fallRecruit: filterAndCapEvents(dedupEvents(fallRecruitEvents), config, today),
    internship: filterAndCapEvents(dedupEvents(internshipEvents), config, today),
  }
}

/** Post-extraction filter: keep only watchlist companies, drop clearly stale events, cap at 20. */
export function filterAndCapEvents(events: JobEvent[], config: JobBriefingConfig, today: string): JobEvent[] {
  // 1. Only keep companies in the enabled watchlist
  const enabled = config.companies.filter(c => c.enabled)
  events = events.filter(e => enabled.some(c => companyNameMatches(c.name, e.company)))

  // 2. Drop events with explicit dates older than 90 days
  const cutoff = new Date(today)
  cutoff.setDate(cutoff.getDate() - 90)
  events = events.filter(e => {
    if (!e.date) return true // keep if date unknown (LLM couldn't extract it)
    const d = new Date(e.date)
    return !isNaN(d.getTime()) && d >= cutoff
  })

  // 3. Sort by date descending (unknown dates last), cap at 20
  events.sort((a, b) => {
    if (!a.date && !b.date) return 0
    if (!a.date) return 1
    if (!b.date) return -1
    return b.date.localeCompare(a.date)
  })
  return events.slice(0, 20)
}

export type FocusCompany = { name: string; eventTitle?: string }

export function selectFocusCompanies(
  fallRecruitEvents: JobEvent[],
  internshipEvents: JobEvent[],
  config: JobBriefingConfig
): FocusCompany[] {
  const allEvents = [...fallRecruitEvents, ...internshipEvents]
  const enabled = config.companies
    .filter(c => c.enabled)
    .sort((a, b) => a.priority - b.priority)
  const withEvents: FocusCompany[] = []
  for (const c of enabled) {
    const ev = allEvents.find(e => companyNameMatches(e.company, c.name))
    if (ev) withEvents.push({ name: c.name, eventTitle: ev.title })
  }
  if (withEvents.length > 0) return withEvents
  return enabled.slice(0, 5).map(c => ({ name: c.name }))
}

export function buildFocusJobQuery(company: string, profile: JobProfile, config: JobBriefingConfig): string {
  const roles = profile.targetRoles.length ? profile.targetRoles : config.roleKeywords
  const cities = config.cities.join(' ')
  return `${company} ${roles.join(' ')} 招聘 校招 2026 ${cities}`.trim()
}

export function buildFocusJobQueries(
  focus: FocusCompany[],
  profile: JobProfile,
  config: JobBriefingConfig,
): { query: string; dimension: 'fallRecruit' | 'internship' }[] {
  const focusNames = focus.map(f => f.name).join(' ')
  const cities = config.cities.join(' ')
  const keywords = config.jobSearchKeywords.length > 0
    ? config.jobSearchKeywords.join(' ')
    : (profile.targetRoles.length ? profile.targetRoles.join(' ') : config.roleKeywords.join(' '))

  const queries: { query: string; dimension: 'fallRecruit' | 'internship' }[] = []
  if (config.searchFallRecruit) {
    queries.push({
      query: `${keywords} 秋招 校招 招聘 2026 ${focusNames} ${cities}`.trim(),
      dimension: 'fallRecruit',
    })
  }
  if (config.searchInternship) {
    queries.push({
      query: `${keywords} 实习 提前批 招聘 2026 ${focusNames} ${cities}`.trim(),
      dimension: 'internship',
    })
  }
  if (queries.length === 0) {
    queries.push({
      query: `${keywords} 招聘 2026 ${focusNames} ${cities}`.trim(),
      dimension: 'fallRecruit',
    })
  }
  return queries
}

export async function matchJobsToProfile(
  cfg: AppConfig,
  jobs: RawJob[],
  profile: JobProfile,
  focus: FocusCompany[],
  opts: { signal?: AbortSignal } = {}
): Promise<MatchedJob[]> {
  const top = jobs.slice(0, 30)
  if (top.length === 0) return []
  const prompt = readPrompt('match-jobs')
    .replace('{{profile}}', formatJobProfile(profile))
    .replace('{{jobsJson}}', JSON.stringify(top, null, 2))
  const text = await chatNonStream(cfg, {
    messages: [{ role: 'user', content: prompt } as Message],
    temperature: 0.3,
    thinking: { type: 'enabled', reasoning_effort: 'max' },
    signal: opts.signal,
  })
  const extracted = extractJsonObject(text)
  if (!extracted) throw new Error('EXTRACTION_ERROR: match-jobs JSON extraction failed')
  const obj = JSON.parse(extracted)
  if (!Array.isArray(obj.jobs)) throw new Error('EXTRACTION_ERROR: match-jobs jobs is not an array')
  const matched: MatchedJob[] = []
  for (const m of obj.jobs) {
    const idx = typeof m.index === 'number' ? m.index : -1
    const job = top[idx]
    if (!job) continue
    const level = Number(m.matchLevel)
    matched.push({
      ...job,
      matchLevel: (level >= 1 && level <= 5 ? level : 3) as MatchedJob['matchLevel'],
      matchReason: String(m.matchReason ?? '').trim(),
      sourceEventTitle: focus.find(f => companyNameMatches(f.name, job.company))?.eventTitle,
    })
  }
  return matched.sort((a, b) => b.matchLevel - a.matchLevel).slice(0, 10)
}

export type QuestionQuery = { query: string; includeDomains: string[] }

function questionDirection(profile: JobProfile, config: JobBriefingConfig): string {
  return profile.direction || profile.targetRoles[0] || config.roleKeywords[0] || 'AI产品经理'
}

export function buildQuestionQueries(
  focus: FocusCompany[],
  profile: JobProfile,
  config: JobBriefingConfig,
): QuestionQuery[] {
  const direction = questionDirection(profile, config)
  return focus.slice(0, 3).map(f => ({
    query: `${f.name} ${direction} 面经 面试题`,
    includeDomains: [...JOB_COMMUNITY_DOMAINS],
  }))
}

export function buildFallbackQuestionQuery(profile: JobProfile, config: JobBriefingConfig): string {
  return `${questionDirection(profile, config)} 面经 高频问题`
}

export function dedupQuestions(questions: InterviewQuestion[]): InterviewQuestion[] {
  const seen = new Set<string>()
  const out: InterviewQuestion[] = []
  for (const q of questions) {
    const key = q.question.replace(/[\s?？!！。]/g, '')
    if (!key || seen.has(key)) continue
    seen.add(key)
    out.push(q)
  }
  return out
}

export async function generateJobBriefingKeywords(
  cfg: AppConfig,
  profile: JobProfile,
  opts: { signal?: AbortSignal } = {}
): Promise<{ eventKeywords: string[]; jobKeywords: string[] }> {
  const prompt = readPrompt('generate-keywords')
    .replace('{{profile}}', formatJobProfile(profile))
  const text = await chatNonStream(cfg, {
    messages: [{ role: 'user', content: prompt } as Message],
    temperature: 0.3,
    thinking: { type: 'enabled' },
    signal: opts.signal,
  })
  const extracted = extractJsonObject(text)
  if (!extracted) throw new Error('KEYWORD_EXTRACTION_ERROR')
  const obj = JSON.parse(extracted)
  return {
    eventKeywords: Array.isArray(obj.eventKeywords)
      ? obj.eventKeywords.filter((k: unknown): k is string => typeof k === 'string' && k.trim().length > 0).slice(0, 5)
      : [],
    jobKeywords: Array.isArray(obj.jobKeywords)
      ? obj.jobKeywords.filter((k: unknown): k is string => typeof k === 'string' && k.trim().length > 0).slice(0, 5)
      : [],
  }
}

export async function generateArticleSearchQuery(
  cfg: AppConfig,
  args: { articleContent: string; selection?: string; lastMessage?: string }
): Promise<string> {
  const prompt = readPrompt('generate-search-query')
    .replace('{{articleContent}}', args.articleContent.slice(0, 3000))
    .replace('{{selection}}', args.selection ?? '')
    .replace('{{lastMessage}}', args.lastMessage ?? '')
  const text = await chatNonStream(cfg, {
    messages: [{ role: 'user', content: prompt } as Message],
    temperature: 0.3,
    thinking: { type: 'enabled' },
  })
  return text.trim()
}

async function runQuestionQuery(
  cfg: AppConfig,
  query: string,
  opts: { apiKey: string; signal?: AbortSignal; includeDomains?: string[] }
): Promise<InterviewQuestion[]> {
  const results = await searchWeb({
    query,
    apiKey: opts.apiKey,
    maxResults: 5,
    days: 90,
    includeDomains: opts.includeDomains,
    signal: opts.signal,
  })
  const content = results.map(r => `标题: ${r.title}\nURL: ${r.url}\n摘要: ${r.content}`).join('\n\n')
  const prompt = readPrompt('aggregate-questions')
    .replace('{{direction}}', query)
    .replace('{{content}}', content.slice(0, 20_000))
  const text = await chatNonStream(cfg, {
    messages: [{ role: 'user', content: prompt } as Message],
    temperature: 0.3,
    thinking: { type: 'enabled' },
    signal: opts.signal,
  })
  const extracted = extractJsonObject(text)
  if (!extracted) return []
  const obj = JSON.parse(extracted)
  if (!Array.isArray(obj.questions)) return []
  const out: InterviewQuestion[] = []
  for (const item of obj.questions) {
    if (!item || typeof item.question !== 'string' || !item.question.trim()) continue
    out.push({
      question: item.question.trim(),
      intent: String(item.intent ?? '').trim(),
      prepTip: String(item.prepTip ?? '').trim(),
      frequency: String(item.frequency ?? '').trim(),
      companies: Array.isArray(item.companies) ? item.companies.filter((c: unknown): c is string => typeof c === 'string') : [],
      url: String(item.url ?? '').trim(),
    })
  }
  return out
}

export async function discoverQuestions(
  cfg: AppConfig,
  profile: JobProfile,
  config: JobBriefingConfig,
  focus: FocusCompany[],
  opts: { apiKey: string; signal?: AbortSignal }
): Promise<InterviewQuestion[]> {
  // Use per-company queries for top focus companies
  const queries = focus.length > 0
    ? buildQuestionQueries(focus, profile, config)
    : []

  if (queries.length > 0) {
    const results = await Promise.all(
      queries.map(q =>
        runQuestionQuery(cfg, q.query, {
          apiKey: opts.apiKey,
          signal: opts.signal,
          includeDomains: q.includeDomains,
        }).catch(err => {
          console.warn(`[job-briefing] question query failed for ${q.query}`, err)
          return [] as InterviewQuestion[]
        })
      )
    )
    const allQuestions = results.flat()
    if (allQuestions.length > 0) return dedupQuestions(allQuestions)
  }

  // Fallback: generic query
  const fallbackQuery = buildFallbackQuestionQuery(profile, config)
  try {
    return await runQuestionQuery(cfg, fallbackQuery, {
      apiKey: opts.apiKey,
      signal: opts.signal,
      includeDomains: [...JOB_COMMUNITY_DOMAINS],
    })
  } catch (err) {
    console.warn(`[job-briefing] fallback question query failed: ${fallbackQuery}`, err)
    return []
  }
}

export async function generateJobBriefing(
  cfg: AppConfig,
  config: JobBriefingConfig,
  profile: JobProfile,
  date: string,
  opts: {
    emitProgress?: (stage: JobBriefingStage, detail?: string) => void
    signal?: AbortSignal
  } = {}
): Promise<JobBriefingResult> {
  const apiKey = process.env.TAVILY_API_KEY || (await getSearchApiKey())
  if (!apiKey) {
    throw Object.assign(new Error('MISSING_SEARCH_KEY'), { code: 'MISSING_SEARCH_KEY' as JobErrorCode })
  }

  const sourceStatus: JobBriefingSourceStatus = { events: 'ok', jobs: 'ok', questions: 'ok', official: {} }
  const enabledCompanies = config.companies
    .filter(c => c.enabled)
    .sort((a, b) => a.priority - b.priority)

  // ── Level 1: 新动态 ──
  opts.emitProgress?.('scanning-events')
  let fallRecruitEvents: JobEvent[] = []
  let internshipEvents: JobEvent[] = []
  try {
    const result = await discoverEvents(cfg, config, { apiKey, signal: opts.signal })
    fallRecruitEvents = result.fallRecruit
    internshipEvents = result.internship
  } catch (err) {
    console.warn('[job-briefing] event discovery failed', err)
    sourceStatus.events = 'failed'
  }

  // ── Level 2: 焦点岗位 ──
  opts.emitProgress?.('digging-jobs')
  const focus = selectFocusCompanies(fallRecruitEvents, internshipEvents, config)
  const allJobs: RawJob[] = []
  for (const f of focus) {
    if (opts.signal?.aborted) break
    const companyCfg = enabledCompanies.find(c => c.name === f.name)
    if (companyCfg?.careerPageUrl) {
      try {
        const html = await fetchPageHtml(companyCfg.careerPageUrl, { signal: opts.signal, useBrowserFallback: true })
        const jobs = await extractJobsFromHtml(cfg, { html, company: f.name, url: companyCfg.careerPageUrl, source: 'official' })
        allJobs.push(...jobs)
        sourceStatus.official[f.name] = 'ok'
      } catch (err) {
        console.warn(`[job-briefing] official page failed for ${f.name}`, err)
        sourceStatus.official[f.name] = 'failed'
      }
    }
  }
  // Job search with parallel Tavily queries
  const jobQueries = buildFocusJobQueries(focus, profile, config)
  const jobSearchResults = await Promise.all(
    jobQueries.map(q =>
      searchWeb({ query: q.query, apiKey, maxResults: 10, days: 30, signal: opts.signal })
        .then(results => results)
        .catch(err => {
          console.warn(`[job-briefing] job search failed for ${q.dimension}`, err)
          return [] as TavilyResult[]
        })
    )
  )
  for (const results of jobSearchResults) {
    if (opts.signal?.aborted) break
    for (const r of results) {
      try {
        const jobs = await extractJobsFromHtml(cfg, { html: r.content, company: '', url: r.url, source: 'tavily' })
        allJobs.push(...jobs)
      } catch (e) {
        console.warn('[job-briefing] extraction failed for result', e)
      }
    }
  }
  const merged = mergeAndDedupJobs(allJobs)
  let matchedJobs: MatchedJob[] = []
  if (merged.length === 0) {
    sourceStatus.jobs = 'failed'
  } else {
    try {
      matchedJobs = await matchJobsToProfile(cfg, merged, profile, focus, { signal: opts.signal })
    } catch (err) {
      console.warn('[job-briefing] match-jobs failed, using unranked fallback', err)
      matchedJobs = merged.slice(0, 10).map(j => ({
        ...j,
        matchLevel: 3 as const,
        matchReason: '',
        sourceEventTitle: focus.find(f => companyNameMatches(f.name, j.company))?.eventTitle,
      }))
    }
  }

  // Diversity: cap same-company jobs at 3 to avoid single-company dominance
  if (matchedJobs.length > 0) {
    const diversified: MatchedJob[] = []
    const companyCount = new Map<string, number>()
    const MAX_PER_COMPANY = 3
    for (const job of matchedJobs) {
      const count = companyCount.get(job.company) ?? 0
      if (count >= MAX_PER_COMPANY) continue
      diversified.push(job)
      companyCount.set(job.company, count + 1)
    }
    matchedJobs = diversified.slice(0, 10)
  }

  // ── Level 3: 面经问题 ──
  opts.emitProgress?.('aggregating-questions')
  let questions: InterviewQuestion[] = []
  try {
    questions = await discoverQuestions(cfg, profile, config, focus, { apiKey, signal: opts.signal })
  } catch (err) {
    console.warn('[job-briefing] question aggregation failed', err)
  }
  if (questions.length === 0) sourceStatus.questions = 'failed'

  const allEvents = [...fallRecruitEvents, ...internshipEvents]
  if (allEvents.length === 0 && matchedJobs.length === 0 && questions.length === 0) {
    throw Object.assign(new Error('EMPTY_RESULTS'), { code: 'EMPTY_RESULTS' as JobErrorCode })
  }

  // ── 综合生成 ──
  opts.emitProgress?.('synthesizing')
  const synthesisPrompt = readPrompt('synthesize')
    .replace('{{profile}}', formatJobProfile(profile))
    .replace('{{eventsFallRecruit}}', JSON.stringify(fallRecruitEvents, null, 2))
    .replace('{{eventsInternship}}', JSON.stringify(internshipEvents, null, 2))
    .replace('{{jobsJson}}', JSON.stringify(matchedJobs, null, 2))
    .replace('{{questionsJson}}', JSON.stringify(questions, null, 2))

  // 独立 300s 计时，不与其他阶段共享总预算：reasoning_effort:'high' 常跑数分钟，
  // 共享预算曾在此阶段误 abort，DOMException code=20 以 "JOB_20" 冒泡给用户。
  const synthesisCtl = new AbortController()
  if (opts.signal?.aborted) throw new Error('ABORTED')
  const onOuterAbort = () => synthesisCtl.abort()
  opts.signal?.addEventListener('abort', onOuterAbort)
  const synthesisTimeout = setTimeout(() => synthesisCtl.abort(), 300_000)
  let content: string
  try {
    content = await chatNonStream(cfg, {
      messages: [{ role: 'user', content: synthesisPrompt } as Message],
      temperature: 0.5,
      thinking: { type: 'enabled', reasoning_effort: 'max' },
      signal: synthesisCtl.signal,
    })
  } catch (err) {
    if (opts.signal?.aborted) throw new Error('ABORTED')
    const code = toJobErrorCode(err)
    throw Object.assign(new Error(code), { code: code as JobErrorCode })
  } finally {
    clearTimeout(synthesisTimeout)
    opts.signal?.removeEventListener('abort', onOuterAbort)
  }

  opts.emitProgress?.('finalizing')

  const generatedAt = new Date().toISOString()
  const filePath = jobBriefingFilePath(cfg, date)
  const officialSources = enabledCompanies
    .filter(c => c.careerPageUrl)
    .map(c => ({ type: 'official' as const, company: c.name, url: c.careerPageUrl! }))
  const focusSources = focus.map(f => ({ type: 'tavily' as const, query: buildFocusJobQuery(f.name, profile, config), url: '' }))
  const jobSources = [...officialSources, ...focusSources]

  const fm = {
    title: '求职简报',
    type: 'job-briefing' as const,
    created: generatedAt,
    tags: ['job-briefing', 'ai-product'],
    date,
    generated_at: generatedAt,
    role_keywords: profile.targetRoles.length ? profile.targetRoles : config.roleKeywords,
    cities: config.cities,
    companies: focus.map(f => f.name),
    job_sources: JSON.stringify(jobSources),
  }

  let cacheWriteFailed = false
  try {
    fs.mkdirSync(jobBriefingDir(cfg), { recursive: true })
    const tmpPath = filePath + '.tmp'
    fs.writeFileSync(tmpPath, serializeFrontmatter('job-briefing', fm, content), 'utf8')
    fs.renameSync(tmpPath, filePath)
  } catch (writeErr) {
    console.error('[job-briefing] cache write failed', writeErr)
    dumpRecovery(path.basename(filePath), content)
    cacheWriteFailed = true
  }

  opts.emitProgress?.('done')

  return {
    title: '求职简报',
    date,
    content,
    filePath,
    cached: false,
    cacheWriteFailed,
    generatedAt,
    sourceStatus,
  }
}
