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
  JobBriefingConfig,
  JobCompany,
  JobBriefingResult,
  JobBriefingSourceStatus,
  JobErrorCode,
  JobBriefingStage,
  Message,
} from '@shared/index'

import { DEFAULT_JOB_BRIEFING_CONFIG } from '../../src/lib/job-briefing-defaults'

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

export function buildTavilyQueries(config: JobBriefingConfig): string[] {
  const rolePart = config.roleKeywords.join(' / ')
  const companyPart = config.companies.filter(c => c.enabled).map(c => c.name).join(' / ')
  const cityPart = config.cities.join(' ')
  const queries: string[] = [
    `${rolePart} 招聘 ${cityPart} 2026`,
    `${companyPart} 产品经理 招聘 最新`,
    `2026 AI产品 技能要求 招聘趋势`,
    `AI产品经理 薪资 2026`,
  ]
  return queries
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

export async function searchJobsForCompany(
  cfg: AppConfig,
  company: string,
  config: JobBriefingConfig,
  opts: { apiKey: string; signal?: AbortSignal }
): Promise<RawJob[]> {
  const query = `${company} ${config.roleKeywords.join(' ')} 招聘 ${config.cities.join(' ')}`
  const results = await searchWeb({ query, apiKey: opts.apiKey, maxResults: 5, signal: opts.signal })
  const jobs: RawJob[] = []
  for (const r of results) {
    try {
      const extracted = await extractJobsFromHtml(cfg, { html: r.content, company, url: r.url, source: 'tavily' })
      jobs.push(...extracted)
    } catch (err) {
      console.warn(`[job-briefing] extraction failed for Tavily result ${r.url}`, err)
    }
  }
  return jobs
}

export async function generateJobBriefing(
  cfg: AppConfig,
  config: JobBriefingConfig,
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

  const sourceStatus: JobBriefingSourceStatus = { tavily: 'ok', official: {} }
  const allJobs: RawJob[] = []

  opts.emitProgress?.('discovering')

  const enabledCompanies = config.companies
    .filter(c => c.enabled)
    .sort((a, b) => a.priority - b.priority)

  // Official pages scrape
  for (const company of enabledCompanies) {
    if (opts.signal?.aborted) break
    opts.emitProgress?.('scraping', company.name)

    if (!company.careerPageUrl) {
      sourceStatus.official[company.name] = 'failed'
      continue
    }

    try {
      const html = await fetchPageHtml(company.careerPageUrl, { signal: opts.signal, useBrowserFallback: true })
      const jobs = await extractJobsFromHtml(cfg, { html, company: company.name, url: company.careerPageUrl, source: 'official' })
      allJobs.push(...jobs)
      sourceStatus.official[company.name] = 'ok'
    } catch (err) {
      console.warn(`[job-briefing] official page failed for ${company.name}`, err)
      sourceStatus.official[company.name] = 'failed'
      // Fallback to Tavily for this company
      try {
        const fallback = await searchJobsForCompany(cfg, company.name, config, { apiKey, signal: opts.signal })
        allJobs.push(...fallback)
      } catch (fallbackErr) {
        console.warn(`[job-briefing] Tavily fallback failed for ${company.name}`, fallbackErr)
      }
    }
  }

  // Tavily broad search
  opts.emitProgress?.('searching')
  const queries = buildTavilyQueries(config)
  for (const query of queries) {
    if (opts.signal?.aborted) break
    try {
      const results = await searchWeb({ query, apiKey, maxResults: 5, signal: opts.signal })
      for (const r of results) {
        try {
          const jobs = await extractJobsFromHtml(cfg, { html: r.content, company: '其他', url: r.url, source: 'tavily' })
          allJobs.push(...jobs)
        } catch (e) {
          console.warn('[job-briefing] Tavily extraction failed for result', e)
        }
      }
    } catch (err) {
      console.warn(`[job-briefing] Tavily query failed: ${query}`, err)
      sourceStatus.tavily = 'failed'
    }
  }

  const merged = mergeAndDedupJobs(allJobs)

  if (merged.length === 0) {
    throw Object.assign(new Error('EMPTY_RESULTS'), { code: 'EMPTY_RESULTS' as JobErrorCode })
  }

  opts.emitProgress?.('synthesizing')

  const synthesisPrompt = readPrompt('synthesize')
    .replace('{{roleKeywords}}', config.roleKeywords.join('、'))
    .replace('{{cities}}', config.cities.join('、'))
    .replace('{{companies}}', config.companies.filter(c => c.enabled).map(c => c.name).join('、'))
    .replace('{{skillKeywords}}', config.skillKeywords.join('、'))
    .replace('{{jobsJson}}', JSON.stringify(merged.slice(0, 30), null, 2))

  const content = await chatNonStream(cfg, {
    messages: [{ role: 'user', content: synthesisPrompt } as Message],
    temperature: 0.5,
    thinking: { type: 'enabled', reasoning_effort: 'high' },
    signal: opts.signal,
  })

  opts.emitProgress?.('finalizing')

  const generatedAt = new Date().toISOString()
  const filePath = jobBriefingFilePath(cfg, date)
  const officialSources = enabledCompanies
    .filter(c => c.careerPageUrl)
    .map(c => ({ type: 'official' as const, company: c.name, url: c.careerPageUrl! }))
  const tavilySources = queries.map(q => ({ type: 'tavily' as const, query: q, url: '' }))
  const jobSources = [...officialSources, ...tavilySources]

  const fm = {
    title: '求职简报',
    type: 'job-briefing' as const,
    created: generatedAt,
    tags: ['job-briefing', 'ai-product'],
    date,
    generated_at: generatedAt,
    role_keywords: config.roleKeywords,
    cities: config.cities,
    companies: config.companies.map(c => c.name),
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
