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

export function normalizeJobBriefingConfig(raw?: Partial<JobBriefingConfig>): JobBriefingConfig {
  return {
    companies: raw?.companies?.length ? raw.companies : DEFAULT_JOB_BRIEFING_CONFIG.companies,
    roleKeywords: raw?.roleKeywords?.length ? raw.roleKeywords : DEFAULT_JOB_BRIEFING_CONFIG.roleKeywords,
    cities: raw?.cities?.length ? raw.cities : DEFAULT_JOB_BRIEFING_CONFIG.cities,
    skillKeywords: raw?.skillKeywords?.length ? raw.skillKeywords : DEFAULT_JOB_BRIEFING_CONFIG.skillKeywords,
  }
}

export function buildOfficialPageQueries(company: string): string[] {
  return [
    `${company} 官方招聘 AI产品经理`,
    `${company} careers AI product manager`,
  ]
}

export const JOB_COMMUNITY_DOMAINS = ['nowcoder.com', 'yingjiesheng.com', 'zhihu.com', 'xiaohongshu.com']

export type EventQuery = { query: string; company?: string; includeDomains?: string[] }

export function buildEventQueries(config: JobBriefingConfig): EventQuery[] {
  const cities = config.cities.join(' ')
  const queries: EventQuery[] = config.companies
    .filter(c => c.enabled)
    .sort((a, b) => a.priority - b.priority)
    .map(c => ({ query: `${c.name} 2026秋招 2027届 校招 宣讲会 AI产品 招聘 ${cities}`.trim(), company: c.name }))
  queries.push({
    query: `AI产品 2026秋招 2027届 校招 汇总 ${cities}`.trim(),
    includeDomains: ['nowcoder.com', 'yingjiesheng.com'],
  })
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

  // Browser fallback for JS-rendered pages
  return new Promise((resolve, reject) => {
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
  })
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
    thinking: { type: 'disabled' },
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
): Promise<JobEvent[]> {
  const today = new Date().toISOString().slice(0, 10)
  const events: JobEvent[] = []
  for (const q of buildEventQueries(config)) {
    if (opts.signal?.aborted) break
    try {
      const results = await searchWeb({
        query: q.query,
        apiKey: opts.apiKey,
        maxResults: 5,
        days: 7,
        includeDomains: q.includeDomains,
        signal: opts.signal,
      })
      const content = results.map(r => `标题: ${r.title}\nURL: ${r.url}\n摘要: ${r.content}`).join('\n\n')
      const prompt = readPrompt('extract-events')
        .replace('{{today}}', today)
        .replace('{{company}}', q.company ?? '全部关注公司')
        .replace('{{content}}', content.slice(0, 20_000))
      const text = await chatNonStream(cfg, {
        messages: [{ role: 'user', content: prompt } as Message],
        temperature: 0.3,
        thinking: { type: 'disabled' },
        signal: opts.signal,
      })
      const extracted = extractJsonObject(text)
      if (!extracted) continue
      const obj = JSON.parse(extracted)
      if (!Array.isArray(obj.events)) continue
      for (const e of obj.events) {
        if (!e || typeof e.title !== 'string' || !e.title.trim()) continue
        events.push({
          company: String(e.company ?? q.company ?? '').trim(),
          eventType: normalizeEventType(e.eventType),
          title: e.title.trim(),
          date: String(e.date ?? '').trim(),
          summary: String(e.summary ?? '').trim(),
          url: String(e.url ?? '').trim(),
        })
      }
    } catch (err) {
      console.warn(`[job-briefing] event query failed: ${q.query}`, err)
    }
  }
  return filterAndCapEvents(dedupEvents(events), config, today)
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

export function selectFocusCompanies(events: JobEvent[], config: JobBriefingConfig): FocusCompany[] {
  const enabled = config.companies
    .filter(c => c.enabled)
    .sort((a, b) => a.priority - b.priority)
  const withEvents: FocusCompany[] = []
  for (const c of enabled) {
    const ev = events.find(e => companyNameMatches(e.company, c.name))
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
    thinking: { type: 'enabled', reasoning_effort: 'high' },
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
    thinking: { type: 'disabled' },
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
  focus: FocusCompany[],
  profile: JobProfile,
  config: JobBriefingConfig,
  opts: { apiKey: string; signal?: AbortSignal }
): Promise<InterviewQuestion[]> {
  const collected: InterviewQuestion[] = []
  for (const q of buildQuestionQueries(focus, profile, config)) {
    if (opts.signal?.aborted) break
    try {
      collected.push(...await runQuestionQuery(cfg, q.query, { ...opts, includeDomains: q.includeDomains }))
    } catch (err) {
      console.warn(`[job-briefing] question query failed: ${q.query}`, err)
    }
  }
  if (collected.length === 0 && !opts.signal?.aborted) {
    const fallback = buildFallbackQuestionQuery(profile, config)
    try {
      collected.push(...await runQuestionQuery(cfg, fallback, { ...opts, includeDomains: [...JOB_COMMUNITY_DOMAINS] }))
    } catch (err) {
      console.warn(`[job-briefing] fallback question query failed: ${fallback}`, err)
    }
  }
  return dedupQuestions(collected).slice(0, 8)
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
  let events: JobEvent[] = []
  try {
    events = await discoverEvents(cfg, config, { apiKey, signal: opts.signal })
  } catch (err) {
    console.warn('[job-briefing] event discovery failed', err)
    sourceStatus.events = 'failed'
  }

  // ── Level 2: 焦点岗位 ──
  opts.emitProgress?.('digging-jobs')
  const focus = selectFocusCompanies(events, config)
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
    try {
      const query = buildFocusJobQuery(f.name, profile, config)
      const results = await searchWeb({ query, apiKey, maxResults: 5, days: 30, signal: opts.signal })
      for (const r of results) {
        try {
          const jobs = await extractJobsFromHtml(cfg, { html: r.content, company: f.name, url: r.url, source: 'tavily' })
          allJobs.push(...jobs)
        } catch (e) {
          console.warn('[job-briefing] extraction failed for result', e)
        }
      }
    } catch (err) {
      console.warn(`[job-briefing] job search failed for ${f.name}`, err)
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
    questions = await discoverQuestions(cfg, focus, profile, config, { apiKey, signal: opts.signal })
  } catch (err) {
    console.warn('[job-briefing] question aggregation failed', err)
  }
  if (questions.length === 0) sourceStatus.questions = 'failed'

  if (events.length === 0 && matchedJobs.length === 0 && questions.length === 0) {
    throw Object.assign(new Error('EMPTY_RESULTS'), { code: 'EMPTY_RESULTS' as JobErrorCode })
  }

  // ── 综合生成 ──
  opts.emitProgress?.('synthesizing')
  const synthesisPrompt = readPrompt('synthesize')
    .replace('{{profile}}', formatJobProfile(profile))
    .replace('{{eventsJson}}', JSON.stringify(events, null, 2))
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
      thinking: { type: 'enabled', reasoning_effort: 'high' },
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
    fs.writeFileSync(filePath, serializeFrontmatter('job-briefing', fm, content), 'utf8')
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
