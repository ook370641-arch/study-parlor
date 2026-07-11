# 求职简报（Job Briefing）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a third "Job Briefing" source to the Night Briefing feature, generating a daily AI-product job intelligence report with Tavily search + optional official career-page scraping, reusing the unified briefing page shell, date column, article assistant (without guide), and global Chrome.

**Architecture:** Extend `briefingSource` to `'digest' | 'anthropic' | 'job-briefing'`. Add a main-process IPC handler (`job-briefing:generate/list/discover-pages`) that orchestrates discovery, scraping, search, and LLM synthesis. Persist user config in `state.json`. Cache reports as `type: job-briefing` markdown under `{library}/求职简报/`. Render with a specialized markdown-aware component and mount the existing article assistant in guide-less mode.

**Tech Stack:** Electron 30, React 18, TypeScript, Tailwind CSS, Zustand, Tavily API, Kimi API, gray-matter, Vitest, Playwright.

---

## File Structure Map

| File | Responsibility |
|------|----------------|
| `src/types/index.ts` | `JobBriefingConfig`, `JobCompany`, `JobBriefingResult`, `JobErrorCode`, `JobBriefingSourceStatus`, `JobBriefingStage`, extend `BriefingSourceStatus`/`BriefingStage`/`StateJson`/`IpcApi`/`DocType`/`Frontmatter`/`parent_type` |
| `electron/lib/frontmatter.ts` | Add `job-briefing` to `EXT_FIELDS`, filename inference, optional fields |
| `electron/prompts/job-briefing/extract-jobs.md` | Prompt for LLM extraction of job listings from HTML/Tavily snippets |
| `electron/prompts/job-briefing/synthesize.md` | Prompt for final Markdown synthesis |
| `electron/lib/job-briefing.ts` | Config defaults, Tavily discovery, page fetch, LLM extraction, result merging, synthesis, orchestration |
| `electron/ipc/job-briefing.ts` | IPC handlers: `job-briefing:generate`, `job-briefing:list`, `job-briefing:discover-pages`; progress emission; cache read/write |
| `electron/preload.ts` | Expose new IPC methods and progress event |
| `src/lib/ipc.ts` | Facade getters for new IPC methods |
| `electron/ipc/state.ts` | Default `jobBriefingConfig` |
| `src/store/index.ts` | `jobBriefing`, `jobBriefingHistory`, `jobBriefingConfig`, `generateJobBriefing`, `loadJobBriefingHistory`, `discoverJobBriefingPages`, actions and defaults |
| `src/components/BriefingDateColumn.tsx` | Add optional `todayLabel` prop |
| `src/components/article-assistant/ArticleAssistantPanel.tsx` | Add optional `showGuide` prop |
| `src/components/BriefingSourceSidebar.tsx` | Add `job-briefing` nav item with briefcase icon |
| `src/components/BriefingHeader.tsx` | Make `sourceStatus` flexible for arbitrary keys |
| `src/pages/Briefing.tsx` | Render job-briefing source: date column, empty/loading/error/success states, assistant panel |
| `src/components/job-briefing/JobBriefingRenderer.tsx` | Parse job-briefing markdown and render cards, skill bars, trend blocks |
| `src/components/job-briefing/index.ts` | Re-export renderer |
| `src/pages/Settings.tsx` | Add "求职简报" config panel |
| `src/components/md/fileType.ts` | Map `job-briefing` to a rendering type |
| `src/components/md/ReportHeader.tsx` | Add `job-briefing` badge/label fallback |
| `tests/job-briefing.test.ts` | Unit tests for config defaults, query building, dedup, merging, source status, LLM extraction fallback |
| `tests/job-briefing-layout.test.tsx` | Component tests for empty/loading/error/success, skill bar, external links |
| `e2e/specs/job-briefing-generation.spec.ts` | Mock E2E: switch source, generate, assert file + sections |
| `e2e/helpers/selectors.ts` | Add job-briefing selectors if needed |

---

## Task 1: Shared Types and Frontmatter Schema

**Files:**
- Modify: `src/types/index.ts`
- Modify: `electron/lib/frontmatter.ts`
- Test: `tests/job-briefing.test.ts` (will be created in Task 12, but run after this task)

- [ ] **Step 1: Add job-briefing types to `src/types/index.ts`**

Insert after the `BriefingResult` definition (around line 293):

```ts
export type JobCompany = {
  name: string
  careerPageUrl?: string
  priority: number
  enabled: boolean
}

export type JobBriefingConfig = {
  companies: JobCompany[]
  roleKeywords: string[]
  cities: string[]
  skillKeywords: string[]
}

export type JobErrorCode =
  | 'MISSING_SEARCH_KEY'
  | 'NETWORK_ERROR'
  | 'OFFICIAL_PAGE_FAILED'
  | 'EXTRACTION_ERROR'
  | 'EMPTY_RESULTS'
  | 'CACHE_WRITE_FAILED'

export type JobBriefingSourceStatus = {
  tavily: 'ok' | 'failed'
  official: Record<string, 'ok' | 'failed'>
}

export type JobBriefingResult = {
  title: string
  date: string
  content: string
  filePath: string
  cached: boolean
  cacheWriteFailed?: boolean
  generatedAt: string
  sourceStatus: JobBriefingSourceStatus
}

export type JobBriefingStage =
  | 'discovering'
  | 'scraping'
  | 'searching'
  | 'synthesizing'
  | 'finalizing'
  | 'done'
```

Replace `BriefingSourceStatus` and `BriefingStage` with flexible unions:

```ts
export type BriefingSourceStatus = Record<string, 'ok' | 'failed'>

export type BriefingStage =
  | 'fetching'
  | 'extracting'
  | 'assembling'
  | 'finalizing'
  | 'done'
  | JobBriefingStage
```

Update `DocType`:

```ts
export type DocType = 'progress' | 'review' | 'fable' | 'transcript' | 'briefing' | 'external-materials' | 'anthropic-article' | 'article-assistant' | 'job-briefing'
```

Add optional fields to `Frontmatter`:

```ts
  generated_at?: string
  role_keywords?: string[]
  cities?: string[]
  companies?: string[]
  job_sources?: string
```

Update `parent_type`:

```ts
  parent_type?: 'briefing' | 'anthropic-article' | 'job-briefing'
```

Update `StateJson`:

```ts
  briefingSource?: 'digest' | 'anthropic' | 'job-briefing'
  jobBriefingConfig?: JobBriefingConfig
```

Append to `IpcApi`:

```ts
  jobBriefingGenerate: (args: { date: string; force?: boolean }) => Promise<JobBriefingResult>
  jobBriefingList: () => Promise<{ date: string; filePath: string }[]>
  jobBriefingDiscoverPages: () => Promise<
    | { ok: true; companies: JobCompany[] }
    | { ok: false; code: JobErrorCode; message: string }
  >
```

- [ ] **Step 2: Update `electron/lib/frontmatter.ts`**

Add `'job-briefing'` to `EXT_FIELDS`:

```ts
const EXT_FIELDS: Record<DocType, string[]> = {
  progress: ['session_number', 'difficulty', 'progress_summary', 'last_studied', 'review_count'],
  review: ['review_index', 'last_reviewed', 'source_title'],
  fable: ['source_topic'],
  transcript: ['session_number'],
  briefing: [],
  'external-materials': ['session_number', 'topic', 'summary', 'sources'],
  'anthropic-article': ['source_url', 'published_at', 'imported_at', 'authors'],
  'article-assistant': ['parent_path', 'parent_type', 'created_at', 'updated_at'],
  'job-briefing': ['date', 'generated_at', 'role_keywords', 'cities', 'companies', 'job_sources'],
}
```

Add filename inference in `inferDocTypeFromFilename`:

```ts
  if (lower.includes('求职简报')) return 'job-briefing'
```

Add parsing for the new optional fields in `parseFrontmatter`:

```ts
    generated_at: typeof data.generated_at === 'string' ? data.generated_at : undefined,
    role_keywords: Array.isArray(data.role_keywords) ? data.role_keywords as string[] : undefined,
    cities: Array.isArray(data.cities) ? data.cities as string[] : undefined,
    companies: Array.isArray(data.companies) ? data.companies as string[] : undefined,
    job_sources: typeof data.job_sources === 'string' ? data.job_sources : undefined,
```

- [ ] **Step 3: Type-check**

Run:

```bash
npx tsc --noEmit
```

Expected: PASS (or only pre-existing errors).

- [ ] **Step 4: Commit**

```bash
git add src/types/index.ts electron/lib/frontmatter.ts
git commit -m "types(job-briefing): add config, result, error codes and frontmatter schema"
```

---

## Task 2: Job Briefing Prompts

**Files:**
- Create: `electron/prompts/job-briefing/extract-jobs.md`
- Create: `electron/prompts/job-briefing/synthesize.md`

- [ ] **Step 1: Create extraction prompt**

Create `electron/prompts/job-briefing/extract-jobs.md`:

```markdown
# 岗位信息提取

你正在从招聘页面或搜索结果摘要中提取面向国内 AI 产品岗位的招聘信息。

输入：
- 公司名：{{company}}
- 原始 URL：{{url}}
- 原始内容（HTML 或搜索摘要）：

```
{{content}}
```

要求：
1. 只输出 JSON，不要 markdown 代码块，不要解释。
2. 输出格式必须是如下 JSON 对象：
   {
     "jobs": [
       {
         "title": "岗位名称",
         "city": "城市",
         "salary": "薪资范围或面议",
         "requirements": ["要求1", "要求2"],
         "url": "该岗位原始链接",
         "source": "official 或 tavily"
       }
     ]
   }
3. 如果内容中没有明确岗位信息，返回 {"jobs": []}。
4. 仅保留与 AI 产品、大模型产品、Agent 产品、机器学习产品相关的岗位。
5. 不要编造 URL；如果无法确定岗位 URL，使用传入的原始 URL。
6. 对每条 JD，提炼 3-5 条核心要求，用短语而非整句。
7. 不要输出 "公司简介"、"团队介绍" 等装饰性内容。
```

- [ ] **Step 2: Create synthesis prompt**

Create `electron/prompts/job-briefing/synthesize.md`:

```markdown
# 求职简报综合生成

你正在为一位关注国内 AI 产品岗位的求职者生成每日求职简报。

用户关注：
- 目标岗位：{{roleKeywords}}
- 目标城市：{{cities}}
- 关注公司：{{companies}}
- 技能关键词：{{skillKeywords}}

原始岗位数据（JSON）：

```json
{{jobsJson}}
```

要求：
1. 输出为 Markdown，不要 JSON，不要代码块包裹正文。
2. 正文必须包含以下三个一级标题，顺序固定：
   - `## 优先岗位`
   - `## 技能雷达`
   - `## 趋势解读`
3. `## 优先岗位` 下，对每个岗位使用三级标题：
   `### [OFFICIAL] 公司 · 岗位` 或 `### [TAVILY] 公司 · 岗位`
   然后列出：
   - **城市**: ...
   - **薪资**: ...
   - **难度**: ★★★★☆（根据 JD 要求估算，1-5 星）
   - **JD 要点**: ...
   - **来源**: [原文链接](url)
   - 每个岗位最后单独一段 `> 💭 **默会知识**: ...`（从 JD 要求中提炼隐含能力、准备建议、面试切入点）
4. `## 技能雷达` 下输出一个 Markdown 表格：
   | 技能 | 频次 |
   技能从原始数据中的 requirements 与技能关键词聚合，频次用百分比（出现岗位数 / 总岗位数）。
5. `## 趋势解读` 下用 2-4 个段落总结：
   - 当前市场对 AI 产品经理的核心能力要求变化
   - 大厂 vs 独角兽岗位差异
   - 求职者接下来 1-2 周可准备的资料或技能点
6. 禁止输出装饰性标题如 "Vol.", "档案编号", "Generated by" 等。
7. 所有 URL 使用标准 markdown 链接 `[text](url)`。
```

- [ ] **Step 3: Commit**

```bash
git add electron/prompts/job-briefing
git commit -m "prompts(job-briefing): add extraction and synthesis prompts"
```

---

## Task 3: Core Job Briefing Library

**Files:**
- Create: `electron/lib/job-briefing.ts`
- Modify: `electron-builder.yml` (if prompts dir not already included; verify it is)

- [ ] **Step 1: Create `electron/lib/job-briefing.ts`**

```ts
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

function jobBriefingDir(cfg: AppConfig): string {
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
  let externalListenerAdded = false
  if (opts.signal) {
    if (opts.signal.aborted) ctl.abort()
    else {
      opts.signal.addEventListener('abort', () => ctl.abort(), { once: true })
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
    clearTimeout(timeoutId)
    if (externalListenerAdded) opts.signal?.removeEventListener('abort', () => ctl.abort())
    if (!opts.useBrowserFallback) throw err
  } finally {
    clearTimeout(timeoutId)
    if (externalListenerAdded) opts.signal?.removeEventListener('abort', () => ctl.abort())
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
        const fallback = await searchJobsForCompany(company.name, config, { apiKey, signal: opts.signal })
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
```

- [ ] **Step 2: Verify `electron-builder.yml` includes prompts**

Open `electron-builder.yml` and confirm `files` includes `electron/prompts`. If not, add:

```yml
files:
  - out/**
  - package.json
  - electron/prompts
```

- [ ] **Step 3: Type-check**

Run:

```bash
npx tsc --noEmit
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add electron/lib/job-briefing.ts electron/prompts/job-briefing electron-builder.yml
git commit -m "feat(job-briefing): add discovery, scraping, extraction and synthesis library"
```

---

## Task 4: IPC Handler

**Files:**
- Create: `electron/ipc/job-briefing.ts`
- Modify: `electron/main.ts` (register the handler)

- [ ] **Step 1: Create `electron/ipc/job-briefing.ts`**

```ts
import fs from 'node:fs'
import path from 'node:path'
import { ipcMain } from 'electron'
import type { AppConfig } from '../env'
import type { JobBriefingResult, JobBriefingConfig, JobCompany, JobErrorCode } from '@shared/index'
import {
  generateJobBriefing,
  normalizeJobBriefingConfig,
  discoverCareerPage,
  jobBriefingFilePath,
  jobBriefingDir,
} from '../lib/job-briefing'
import { parseFrontmatter, serializeFrontmatter } from '../lib/frontmatter'
import { getSearchApiKey } from '../lib/credentials'

function validateDate(date: string): void {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new Error('Invalid job briefing date format')
  }
}

export function registerJobBriefingIpc(cfg: AppConfig, getConfig: () => JobBriefingConfig) {
  ipcMain.handle('job-briefing:generate', async (event, args: { date: string; force?: boolean }): Promise<JobBriefingResult> => {
    const sender = event.sender
    const emitProgress = (stage: string, detail?: string) => {
      if (!sender.isDestroyed()) {
        sender.send('briefing:progress', stage, detail)
      }
    }

    const { date } = args
    validateDate(date)
    const filePath = jobBriefingFilePath(cfg, date)

    if (!args.force && fs.existsSync(filePath)) {
      const raw = fs.readFileSync(filePath, 'utf8')
      const { frontmatter, body } = parseFrontmatter(raw, { filename: path.basename(filePath) })
      const errorMatch = body.trim().match(/^##\s*Error\s*\n\s*(JOB_(MISSING_SEARCH_KEY|NETWORK_ERROR|OFFICIAL_PAGE_FAILED|EXTRACTION_ERROR|EMPTY_RESULTS|CACHE_WRITE_FAILED))$/)
      if (errorMatch) {
        throw new Error(errorMatch[1])
      }

      let sourceStatus = { tavily: 'ok' as const, official: {} as Record<string, 'ok' | 'failed'> }
      try {
        const parsed = JSON.parse(frontmatter.job_sources ?? '[]')
        const official: Record<string, 'ok' | 'failed'> = {}
        for (const s of parsed) {
          if (s.type === 'official' && s.company) {
            official[s.company] = fs.existsSync(filePath) ? 'ok' : 'failed'
          }
        }
        sourceStatus = { tavily: 'ok', official }
      } catch { /* ignore */ }

      return {
        title: '求职简报',
        date,
        content: body,
        filePath,
        cached: true,
        generatedAt: String(frontmatter.generated_at ?? frontmatter.created ?? new Date().toISOString()),
        sourceStatus,
      }
    }

    // E2E fast path
    if (
      process.env.NODE_ENV === 'test' &&
      process.env.E2E_CONFIG_DIR &&
      process.env.E2E_JOB_BRIEFING_DISABLE_MOCK !== '1'
    ) {
      emitProgress('discovering', 'MOCK')
      emitProgress('scraping', 'MOCK')
      emitProgress('searching', 'MOCK')
      emitProgress('synthesizing', 'MOCK')
      emitProgress('finalizing', 'MOCK')
      const mockContent = `## 优先岗位\n\n### [OFFICIAL] 腾讯 · AI产品经理培训生\n- **城市**: 深圳\n- **薪资**: 年薪 40W+\n- **难度**: ★★★★☆\n- **JD 要点**: 大模型应用、Agent设计\n- **来源**: [原文链接](https://example.com/job)\n\n> 💭 **默会知识**: 需要理解 LLM 能力边界。\n\n## 技能雷达\n\n| 技能 | 频次 |\n|---|---|\n| 大模型 / LLM | 92% |\n| Agent 设计 | 78% |\n\n## 趋势解读\n\n当前市场对 AI 产品经理的要求集中在 LLM 应用落地能力。`
      const fm = serializeFrontmatter('job-briefing', {
        title: '求职简报',
        type: 'job-briefing',
        created: new Date().toISOString(),
        tags: ['job-briefing', 'ai-product'],
        date,
        generated_at: new Date().toISOString(),
        role_keywords: ['AI产品经理'],
        cities: ['北京'],
        companies: ['腾讯'],
        job_sources: JSON.stringify([{ type: 'official', company: '腾讯', url: 'https://example.com/job' }]),
      }, mockContent)
      fs.mkdirSync(jobBriefingDir(cfg), { recursive: true })
      try {
        fs.writeFileSync(filePath, fm, 'utf8')
      } catch { /* ignore */ }
      emitProgress('done')
      return {
        title: '求职简报',
        date,
        content: mockContent,
        filePath,
        cached: false,
        generatedAt: new Date().toISOString(),
        sourceStatus: { tavily: 'ok', official: { 腾讯: 'ok' } },
      }
    }

    const config = getConfig()
    const llmCtl = new AbortController()
    const llmTimeout = setTimeout(() => llmCtl.abort(), 300_000)

    try {
      const result = await generateJobBriefing(cfg, config, date, {
        emitProgress: (stage, detail) => emitProgress(stage, detail),
        signal: llmCtl.signal,
      })
      return result
    } catch (err: any) {
      const code = err?.code || 'NETWORK_ERROR'
      throw new Error(`JOB_${code}`)
    } finally {
      clearTimeout(llmTimeout)
    }
  })

  ipcMain.handle('job-briefing:list', async (): Promise<{ date: string; filePath: string }[]> => {
    const dir = jobBriefingDir(cfg)
    if (!fs.existsSync(dir)) return []
    const entries = fs.readdirSync(dir)
    const list: { date: string; filePath: string }[] = []
    for (const name of entries) {
      const m = name.match(/^求职简报-(\d{4}-\d{2}-\d{2})\.md$/)
      if (!m) continue
      list.push({ date: m[1], filePath: path.join(dir, name) })
    }
    return list.sort((a, b) => b.date.localeCompare(a.date))
  })

  ipcMain.handle('job-briefing:discover-pages', async (): Promise<
    | { ok: true; companies: JobCompany[] }
    | { ok: false; code: JobErrorCode; message: string }
  > => {
    try {
      const apiKey = process.env.TAVILY_API_KEY || (await getSearchApiKey())
      if (!apiKey) {
        return { ok: false, code: 'MISSING_SEARCH_KEY', message: '未配置 Tavily API Key' }
      }

      const config = getConfig()
      const ctl = new AbortController()
      const timeout = setTimeout(() => ctl.abort(), 120_000)

      try {
        const companies: JobCompany[] = []
        for (const company of config.companies) {
          if (ctl.signal.aborted) break
          try {
            const result = await discoverCareerPage(company.name, { apiKey, signal: ctl.signal })
            companies.push({ ...company, careerPageUrl: result.url || company.careerPageUrl })
          } catch (err) {
            companies.push(company)
          }
        }
        return { ok: true, companies }
      } finally {
        clearTimeout(timeout)
      }
    } catch (err: any) {
      return { ok: false, code: 'NETWORK_ERROR', message: err.message || String(err) }
    }
  })
}
```

- [ ] **Step 2: Register handler in `electron/main.ts`**

Find the call to `registerAllIpc()` or where briefing/anthropic handlers are registered. Add after `registerBriefingIpc(cfg)`:

```ts
import { registerJobBriefingIpc } from './ipc/job-briefing'
import { getCurrentState } from './ipc/state'

// Inside the bootstrap function after config is loaded:
registerJobBriefingIpc(cfg, () => getCurrentState().jobBriefingConfig ?? DEFAULT_JOB_BRIEFING_CONFIG)
```

You must also import `DEFAULT_JOB_BRIEFING_CONFIG` from `electron/lib/job-briefing`:

```ts
import { DEFAULT_JOB_BRIEFING_CONFIG } from './lib/job-briefing'
```

- [ ] **Step 3: Type-check**

Run:

```bash
npx tsc --noEmit
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add electron/ipc/job-briefing.ts electron/main.ts
git commit -m "feat(job-briefing): add main-process IPC handlers"
```

---

## Task 5: Preload and Facade Wiring

**Files:**
- Modify: `electron/preload.ts`
- Modify: `src/lib/ipc.ts`

- [ ] **Step 1: Update `electron/preload.ts`**

Add imports:

```ts
import type { IpcApi, UnsavedSession, BriefingStage, JobBriefingStage } from '@shared/index'
```

Add handlers inside `api` object:

```ts
  jobBriefingGenerate: (args) => ipcRenderer.invoke('job-briefing:generate', args),
  jobBriefingList: () => ipcRenderer.invoke('job-briefing:list'),
  jobBriefingDiscoverPages: () => ipcRenderer.invoke('job-briefing:discover-pages'),
```

- [ ] **Step 2: Update `src/lib/ipc.ts`**

Add getters:

```ts
  get jobBriefingGenerate() { return ensure().jobBriefingGenerate },
  get jobBriefingList() { return ensure().jobBriefingList },
  get jobBriefingDiscoverPages() { return ensure().jobBriefingDiscoverPages },
```

- [ ] **Step 3: Type-check**

Run:

```bash
npx tsc --noEmit
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add electron/preload.ts src/lib/ipc.ts
git commit -m "feat(job-briefing): wire preload and renderer facade"
```

---

## Task 6: State Defaults and Store Actions

**Files:**
- Modify: `electron/ipc/state.ts`
- Modify: `src/store/index.ts`

- [ ] **Step 1: Update `electron/ipc/state.ts`**

Import default config:

```ts
import { DEFAULT_JOB_BRIEFING_CONFIG } from '../lib/job-briefing'
```

Add to `DEFAULT`:

```ts
const DEFAULT: StateJson = {
  version: 1,
  // ... existing fields ...
  jobBriefingConfig: DEFAULT_JOB_BRIEFING_CONFIG,
}
```

- [ ] **Step 2: Update `src/store/index.ts`**

Update imports to include new types:

```ts
import type {
  Difficulty, Message, NewTopic, Profile, StateJson, Mode,
  TopicMeta, UnsavedSession, ArchiveResult, Group, GroupMapping,
  TopicContinueCache, BriefingResult, SearchResult, SearchSource, SearchErrorCode,
  Terminology, BriefingTheme, BriefingStage, BriefingFontSize, AnthropicBlogCache,
  ArticleAssistantGuide, ArticleAssistantMessage, ArticleAssistantErrorCode,
  AnthropicArticleMeta, AnthropicError,
  JobBriefingResult, JobBriefingConfig, JobErrorCode,
} from '@shared/index'
```

Update `briefingSource` type and default:

```ts
  briefingSource: 'digest' | 'anthropic' | 'job-briefing'
```

```ts
  briefingSource: 'digest',
```

Add new store slices after anthropic fields:

```ts
  jobBriefing: {
    result: JobBriefingResult | null
    loading: boolean
    error: JobErrorCode | string | null
  }
  jobBriefingHistory: {
    list: { date: string; filePath: string }[]
    loading: boolean
    error: string | null
  }
  jobBriefingConfig: JobBriefingConfig
```

Add actions:

```ts
  generateJobBriefing: (date: string, opts?: { force?: boolean }) => Promise<void>
  loadJobBriefingHistory: () => Promise<void>
  setJobBriefingConfig: (config: JobBriefingConfig) => Promise<void>
  discoverJobBriefingPages: () => Promise<{ ok: true; companies: JobCompany[] } | { ok: false; error: JobErrorCode | string; message: string }>
```

Add defaults in `create`:

```ts
  jobBriefing: { result: null, loading: false, error: null },
  jobBriefingHistory: { list: [], loading: false, error: null },
  jobBriefingConfig: DEFAULT_JOB_BRIEFING_CONFIG,
```

In `init`, load persisted config:

```ts
      jobBriefingConfig: state.jobBriefingConfig ?? DEFAULT_JOB_BRIEFING_CONFIG,
```

Add action implementations after `loadBriefingHistory`:

```ts
  generateJobBriefing: async (date, opts) => {
    const s = get()
    if (s.jobBriefing.loading) return
    set({ jobBriefing: { result: null, loading: true, error: null }, briefingStage: 'discovering' })
    const unsubscribe = ipc.onBriefingProgress((stage) => set({ briefingStage: stage }))
    try {
      const result = await ipc.jobBriefingGenerate({ date, force: opts?.force })
      set({ jobBriefing: { result, loading: false, error: null }, briefingStage: null })
    } catch (err: any) {
      const raw = err.message || String(err)
      const error = raw.includes('MISSING_SEARCH_KEY') ? 'MISSING_SEARCH_KEY'
        : raw.includes('NETWORK_ERROR') ? 'NETWORK_ERROR'
        : raw.includes('OFFICIAL_PAGE_FAILED') ? 'OFFICIAL_PAGE_FAILED'
        : raw.includes('EXTRACTION_ERROR') ? 'EXTRACTION_ERROR'
        : raw.includes('EMPTY_RESULTS') ? 'EMPTY_RESULTS'
        : raw.includes('CACHE_WRITE_FAILED') ? 'CACHE_WRITE_FAILED'
        : raw
      set({ jobBriefing: { result: null, loading: false, error }, briefingStage: null })
    } finally {
      unsubscribe()
    }
  },

  loadJobBriefingHistory: async () => {
    set({ jobBriefingHistory: { ...get().jobBriefingHistory, loading: true, error: null } })
    try {
      const list = await ipc.jobBriefingList()
      set({ jobBriefingHistory: { list, loading: false, error: null } })
    } catch (err: any) {
      set({ jobBriefingHistory: { ...get().jobBriefingHistory, loading: false, error: err.message || String(err) } })
    }
  },

  setJobBriefingConfig: async (config) => {
    set({ jobBriefingConfig: config })
    await ipc.patchState({ jobBriefingConfig: config } as Partial<StateJson>)
  },

  discoverJobBriefingPages: async () => {
    try {
      const result = await ipc.jobBriefingDiscoverPages()
      if (result.ok) {
        const next = { ...get().jobBriefingConfig, companies: result.companies }
        await get().setJobBriefingConfig(next)
      }
      return result.ok ? { ok: true, companies: result.companies } : { ok: false, error: result.code, message: result.message }
    } catch (err: any) {
      return { ok: false, error: 'NETWORK_ERROR', message: err.message || String(err) }
    }
  },
```

- [ ] **Step 3: Type-check**

Run:

```bash
npx tsc --noEmit
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/store/index.ts electron/ipc/state.ts
git commit -m "feat(job-briefing): add store state, defaults and actions"
```

---

## Task 7: Reusable UI Tweaks

**Files:**
- Modify: `src/components/BriefingDateColumn.tsx`
- Modify: `src/components/article-assistant/ArticleAssistantPanel.tsx`
- Modify: `src/components/BriefingHeader.tsx`

- [ ] **Step 1: Add `todayLabel` prop to `BriefingDateColumn.tsx`**

Update the `Props` interface:

```ts
interface Props {
  collapsed: boolean
  history: BriefingHistoryItem[]
  currentDate?: string
  today: string
  onSelect: (date: string) => void
  onReceiveToday: () => void
  theme: 'academic' | 'newspaper'
  todayLabel?: string
}
```

Update destructuring:

```ts
export function BriefingDateColumn({ collapsed, history, currentDate, today, onSelect, onReceiveToday, theme, todayLabel = '查收日报' }: Props) {
```

Replace the two occurrences of `'查收日报'` with `{todayLabel}`:

- Line 41: `title={todayLabel}`
- Line 71: `{entry.isToday ? todayLabel : formatLabel(entry.date)}`

- [ ] **Step 2: Add `showGuide` prop to `ArticleAssistantPanel.tsx`**

Update interface:

```ts
interface Props {
  articleType: 'briefing' | 'anthropic-article'
  parentPath: string
  articleTitle?: string
  articleContent: string
  showGuide?: boolean
}
```

Update component signature:

```ts
export function ArticleAssistantPanel({ articleType, parentPath, articleTitle, articleContent, showGuide = true }: Props) {
```

Wrap `GuideSidebar` render:

```ts
      {showGuide && <GuideSidebar />}
```

- [ ] **Step 3: Make `BriefingHeader` source status flexible**

Update `Props`:

```ts
interface Props {
  displayDate: string
  timeString?: string
  sourceStatus?: Record<string, 'ok' | 'failed'>
  cacheWriteFailed?: boolean
}
```

Update failed source label mapping:

```ts
  const knownLabels: Record<string, string> = {
    x: 'X',
    blogs: '博客',
    podcasts: '播客',
    tavily: 'Tavily',
  }

  const failedSources = sourceStatus
    ? Object.entries(sourceStatus)
        .filter(([, status]) => status === 'failed')
        .map(([key]) => {
          if (key.startsWith('official:')) return `${key.slice(9)} 官方页`
          return knownLabels[key] ?? key
        })
    : []
```

- [ ] **Step 4: Update `BriefingError` to handle job briefing error codes**

Update `src/components/BriefingError.tsx`:

```ts
const MESSAGES: Record<string, { text: string; showRetry: boolean }> = {
  FEED_EMPTY: { text: '今日海面平静，暂无新信号。', showRetry: false },
  NETWORK_ERROR: { text: '信号塔暂时失联，请检查网络后重试。', showRetry: true },
  LLM_ERROR: { text: '简报员暂时无法整理思路，请稍后再试。', showRetry: true },
  ASSEMBLY_ERROR: { text: '简报格式异常，请重试或联系开发者。', showRetry: true },
  MISSING_SEARCH_KEY: { text: '未配置 Tavily API Key，请先在设置中配置。', showRetry: false },
  OFFICIAL_PAGE_FAILED: { text: '部分官方招聘页获取失败，已尝试用 Tavily 补齐。', showRetry: true },
  EXTRACTION_ERROR: { text: '岗位信息提取失败，请重试。', showRetry: true },
  EMPTY_RESULTS: { text: '今日暂无岗位信息，请稍后重试。', showRetry: true },
  CACHE_WRITE_FAILED: { text: '简报已生成，但缓存写入失败。', showRetry: false },
  JOB_MISSING_SEARCH_KEY: { text: '未配置 Tavily API Key，请先在设置中配置。', showRetry: false },
  JOB_NETWORK_ERROR: { text: '网络异常，请检查网络后重试。', showRetry: true },
  JOB_OFFICIAL_PAGE_FAILED: { text: '部分官方招聘页获取失败，已尝试用 Tavily 补齐。', showRetry: true },
  JOB_EXTRACTION_ERROR: { text: '岗位信息提取失败，请重试。', showRetry: true },
  JOB_EMPTY_RESULTS: { text: '今日暂无岗位信息，请稍后重试。', showRetry: true },
  JOB_CACHE_WRITE_FAILED: { text: '简报已生成，但缓存写入失败。', showRetry: false },
}
```

- [ ] **Step 5: Run component tests that already exist**

Run:

```bash
npx vitest run tests/briefing-sidebar.test.tsx
```

Expected: PASS (may need snapshot updates; update if prompted).

- [ ] **Step 6: Commit**

```bash
git add src/components/BriefingDateColumn.tsx src/components/article-assistant/ArticleAssistantPanel.tsx src/components/BriefingHeader.tsx src/components/BriefingError.tsx
git commit -m "feat(job-briefing): make DateColumn, AssistantPanel, Header and Error reusable"
```

---

## Task 8: Source Sidebar and Briefing Page Integration

**Files:**
- Modify: `src/components/BriefingSourceSidebar.tsx`
- Modify: `src/pages/Briefing.tsx`

- [ ] **Step 1: Add job-briefing nav item to `BriefingSourceSidebar.tsx`**

Add a briefcase icon component after `AnthropicIcon`:

```tsx
function JobBriefingIcon() {
  return (
    <svg
      data-testid="briefing-source-icon-job-briefing"
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="3" y="7" width="18" height="13" rx="2" />
      <path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2" />
      <path d="M12 12v4" />
      <path d="M8 12v4" />
      <path d="M16 12v4" />
    </svg>
  )
}
```

Add to `navItems`:

```ts
    {
      id: 'job-briefing',
      label: '求职简报',
      icon: JobBriefingIcon,
      testId: 'briefing-source-job-briefing',
    },
```

- [ ] **Step 2: Update `src/pages/Briefing.tsx`**

Replace the entire file with the following version that supports all three sources:

```tsx
import { useMemo, useState, useEffect } from 'react'
import { useStore } from '@/store'
import { SurfaceBackground } from '@/components/SurfaceBackground'
import { BriefingListColumn } from '@/components/BriefingListColumn'
import { BriefingDateColumn } from '@/components/BriefingDateColumn'
import { BriefingSkeleton } from '@/components/BriefingSkeleton'
import { BriefingProgress } from '@/components/BriefingProgress'
import { BriefingError } from '@/components/BriefingError'
import { BriefingHeader } from '@/components/BriefingHeader'
import { SwapPaintingButton } from '@/components/SwapPaintingButton'
import { BriefingSourceSidebar } from '@/components/BriefingSourceSidebar'
import { AnthropicBlogPanel } from '@/components/anthropic/AnthropicBlogPanel'
import { ArticleAssistantPanel } from '@/components/article-assistant'
import { AcademicBriefingLayout, NewspaperBriefingLayout } from '@/components/briefing'
import { JobBriefingRenderer } from '@/components/job-briefing'
import { formatBriefingDate } from '@/lib/format-briefing-date'
import { parseBriefingMarkdown } from '@/lib/parse-briefing-markdown'
import {
  ACADEMIC_BODY_STYLES,
  NEWSPAPER_BODY_STYLES,
  ACADEMIC_HEADING_STYLES,
  NEWSPAPER_HEADING_STYLES,
} from '@/lib/briefing-font-size'

export function formatDisplayDate(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number)
  if ([y, m, d].some((n) => Number.isNaN(n))) return dateStr
  return `${y} 年 ${m} 月 ${d} 日`
}

function formatGeneratedAt(iso: string, date: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const time = d.toLocaleTimeString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
  const today = formatBriefingDate(new Date())
  if (date === today) return time
  const dateStr = `${d.getFullYear()} 年 ${String(d.getMonth() + 1).padStart(2, '0')} 月 ${String(d.getDate()).padStart(2, '0')} 日`
  return `${dateStr} · ${time}`
}

function getSourceDisplayTitle(source: string): string {
  if (source === 'anthropic') return 'Anthropic Engineering'
  if (source === 'job-briefing') return '求职简报'
  return ''
}

export function Briefing() {
  const source = useStore((s) => s.briefingSource)
  const theme = useStore((s) => s.briefingTheme)
  const fontSize = useStore((s) => s.briefingFontSize)
  const stage = useStore((s) => s.briefingStage)

  const digest = useStore((s) => s.briefing)
  const digestHistory = useStore((s) => s.briefingHistory)
  const generateDigest = useStore((s) => s.generateBriefing)

  const job = useStore((s) => s.jobBriefing)
  const jobHistory = useStore((s) => s.jobBriefingHistory)
  const generateJob = useStore((s) => s.generateJobBriefing)

  const terms = useStore((s) => s.assistantSession?.guide?.chunks.flatMap((c) => c.terms) ?? [])
  const [dateColumnCollapsed, setDateColumnCollapsed] = useState(false)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)

  const today = formatBriefingDate(new Date())

  const result = source === 'digest' ? digest.result : source === 'job-briefing' ? job.result : null
  const loading = source === 'digest' ? digest.loading : source === 'job-briefing' ? job.loading : false
  const error = source === 'digest' ? digest.error : source === 'job-briefing' ? job.error : null

  useEffect(() => {
    if (source === 'digest' && digestHistory.list.length === 0 && !digestHistory.loading) {
      useStore.getState().loadBriefingHistory()
    }
    if (source === 'job-briefing' && jobHistory.list.length === 0 && !jobHistory.loading) {
      useStore.getState().loadJobBriefingHistory()
    }
  }, [source])

  const parsed = result && source === 'digest' ? parseBriefingMarkdown(result.content) : null
  const displayDate = useMemo(() => (result ? formatDisplayDate(result.date) : ''), [result])

  const isAcademic = theme !== 'newspaper'
  const bodyStyle = isAcademic
    ? ACADEMIC_BODY_STYLES[fontSize]
    : NEWSPAPER_BODY_STYLES[fontSize]
  const headingStyle = isAcademic
    ? ACADEMIC_HEADING_STYLES[fontSize]
    : NEWSPAPER_HEADING_STYLES[fontSize]

  const pageStyle = {
    '--briefing-body-size': bodyStyle.size,
    '--briefing-body-weight': String(bodyStyle.weight),
    '--briefing-heading-size': headingStyle.size,
    '--briefing-heading-weight': String(headingStyle.weight),
  } as React.CSSProperties

  const emptyState = (source === 'digest' || source === 'job-briefing') && !result && !loading && !error
  const isLoading = (source === 'digest' || source === 'job-briefing') && loading
  const isError = (source === 'digest' || source === 'job-briefing') && error

  const generateToday = () => {
    if (source === 'digest') generateDigest(today)
    if (source === 'job-briefing') generateJob(today)
  }

  const historyList = source === 'digest' ? digestHistory.list : source === 'job-briefing' ? jobHistory.list : []
  const todayLabel = source === 'job-briefing' ? '生成简报' : '查收日报'
  const emptyPrompt = source === 'job-briefing' ? '今日求职简报尚未生成' : '今日夜航简报尚未生成'
  const emptyButton = source === 'job-briefing' ? '生成求职简报' : '查收日报'

  return (
    <div
      data-testid="briefing-page"
      className={`relative h-full flex overflow-hidden ${isAcademic ? '' : 'bg-white'}`}
      style={pageStyle}
    >
      {isAcademic && <SurfaceBackground surface="briefing" />}
      {isAcademic && (
        <div
          className="fixed inset-0 z-[1] bg-[#0c0806]/[0.72] pointer-events-none"
          aria-hidden="true"
        />
      )}
      <BriefingSourceSidebar
        theme={theme}
        collapsed={sidebarCollapsed}
        onToggle={() => setSidebarCollapsed((c) => !c)}
      />

      {(source === 'digest' || source === 'job-briefing') && (
        <BriefingListColumn
          collapsed={dateColumnCollapsed}
          onToggle={() => setDateColumnCollapsed((c) => !c)}
          theme={theme}
          width={64}
          title="日期"
        >
          <BriefingDateColumn
            collapsed={dateColumnCollapsed}
            history={historyList}
            currentDate={result?.date}
            today={today}
            onSelect={(date) => {
              if (source === 'digest') generateDigest(date)
              if (source === 'job-briefing') generateJob(date)
            }}
            onReceiveToday={generateToday}
            theme={theme}
            todayLabel={todayLabel}
          />
        </BriefingListColumn>
      )}

      <div className="flex-1 flex flex-col min-w-0">
        {isAcademic && (
          <div className="absolute top-24 right-4 z-10">
            <SwapPaintingButton
              surface="briefing"
              data-testid="briefing-swap-painting-button"
              className="text-parchment/70 hover:text-parchment"
            />
          </div>
        )}
        <BriefingHeader
          displayDate={source === 'anthropic' ? 'Anthropic Engineering' : source === 'job-briefing' ? '求职简报' : displayDate}
          timeString={
            (source === 'digest' || source === 'job-briefing') && result?.generatedAt
              ? formatGeneratedAt(result.generatedAt, result.date)
              : undefined
          }
          sourceStatus={(source === 'digest' || source === 'job-briefing') ? result?.sourceStatus : undefined}
          cacheWriteFailed={(source === 'digest' || source === 'job-briefing') ? result?.cacheWriteFailed : undefined}
        />

        {source === 'anthropic' ? (
          <AnthropicBlogPanel theme={theme} />
        ) : emptyState ? (
          <main className="relative z-[5] flex-1 flex items-center justify-center px-6">
            <div className="text-center">
              <p className={`mb-6 ${isAcademic ? 'text-parchment/70' : 'text-[#6b5d52]'}`}>
                {emptyPrompt}
              </p>
              <button
                data-testid="briefing-receive-digest-button"
                onClick={generateToday}
                className={`px-8 py-3 rounded text-[15px] font-serif transition-colors ${
                  isAcademic
                    ? 'bg-ember text-white hover:bg-ember/90'
                    : 'bg-[#1a1a1a] text-white hover:bg-[#333]'
                }`}
              >
                {emptyButton}
              </button>
            </div>
          </main>
        ) : isLoading ? (
          <main className="relative z-[5] flex-1 overflow-y-auto px-6 py-6 max-w-3xl mx-auto">
            {stage ? (
              <BriefingProgress stage={stage} />
            ) : (
              <BriefingSkeleton data-testid="briefing-skeleton" />
            )}
          </main>
        ) : isError ? (
          <main className="relative z-[5] flex-1 flex items-center justify-center px-6">
            <div className={isAcademic ? 'text-parchment' : 'text-[#1a1a1a]'}>
              <BriefingError
                code={error}
                onRetry={() => {
                  if (source === 'digest') generateDigest(today, { force: true })
                  if (source === 'job-briefing') generateJob(today, { force: true })
                }}
              />
            </div>
          </main>
        ) : source === 'job-briefing' && result ? (
          <main className="relative z-[5] flex-1 overflow-y-auto px-6 py-6">
            <JobBriefingRenderer content={result.content} theme={theme} fontSize={fontSize} />
          </main>
        ) : parsed && result ? (
          <>
            {isAcademic ? (
              <AcademicBriefingLayout result={result} parsed={parsed} displayDate={displayDate} terms={terms} />
            ) : (
              <NewspaperBriefingLayout result={result} parsed={parsed} displayDate={displayDate} terms={terms} />
            )}
          </>
        ) : null}
      </div>

      {source === 'digest' && result?.filePath && (
        <ArticleAssistantPanel
          articleType="briefing"
          parentPath={result.filePath}
          articleTitle={result.title}
          articleContent={result.content ?? ''}
        />
      )}

      {source === 'job-briefing' && result?.filePath && (
        <ArticleAssistantPanel
          articleType="briefing"
          parentPath={result.filePath}
          articleTitle={result.title}
          articleContent={result.content ?? ''}
          showGuide={false}
        />
      )}
    </div>
  )
}
```

- [ ] **Step 3: Update `BriefingProgress` to include job briefing stages**

Update `src/components/BriefingProgress.tsx`:

```ts
const STAGES: { key: BriefingStage; label: string }[] = [
  { key: 'fetching', label: '正在采集今日信号…' },
  { key: 'extracting', label: '正在提取关键信息…' },
  { key: 'assembling', label: '正在组装夜航简报…' },
  { key: 'finalizing', label: '正在归档…' },
  { key: 'discovering', label: '正在发现招聘页…' },
  { key: 'scraping', label: '正在抓取官方招聘页…' },
  { key: 'searching', label: '正在搜索全网岗位…' },
  { key: 'synthesizing', label: '正在综合生成简报…' },
]
```

- [ ] **Step 4: Type-check**

Run:

```bash
npx tsc --noEmit
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/BriefingSourceSidebar.tsx src/components/BriefingProgress.tsx src/pages/Briefing.tsx
git commit -m "feat(job-briefing): integrate source sidebar, progress and briefing page"
```

---

## Task 9: Job Briefing Renderer Component

**Files:**
- Create: `src/components/job-briefing/JobBriefingRenderer.tsx`
- Create: `src/components/job-briefing/index.ts`

- [ ] **Step 1: Create renderer component**

```tsx
import { useMemo } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import type { BriefingTheme, BriefingFontSize } from '@shared/index'
import {
  ACADEMIC_BODY_STYLES,
  NEWSPAPER_BODY_STYLES,
  ACADEMIC_HEADING_STYLES,
  NEWSPAPER_HEADING_STYLES,
} from '@/lib/briefing-font-size'

interface Props {
  content: string
  theme: BriefingTheme
  fontSize: BriefingFontSize
}

type Section =
  | { kind: 'jobs'; title: string; items: JobCardData[] }
  | { kind: 'skills'; title: string; rows: { skill: string; frequency: string }[] }
  | { kind: 'trends'; title: string; lines: string[] }
  | { kind: 'unknown'; lines: string[] }

type JobCardData = {
  source: 'OFFICIAL' | 'TAVILY'
  company: string
  title: string
  city?: string
  salary?: string
  difficulty?: string
  points: string[]
  url?: string
  tacit?: string
}

function parseJobs(lines: string[]): JobCardData[] {
  const jobs: JobCardData[] = []
  let current: JobCardData | null = null

  for (const raw of lines) {
    const line = raw.trim()
    const header = line.match(/^###\s*\[(OFFICIAL|TAVILY)\]\s*(.+?)\s*·\s*(.+)$/)
    if (header) {
      if (current) jobs.push(current)
      current = {
        source: header[1] as 'OFFICIAL' | 'TAVILY',
        company: header[2].trim(),
        title: header[3].trim(),
        points: [],
      }
      continue
    }
    if (!current) continue

    const city = line.match(/^-\s*\*\*城市\*\*:\s*(.+)$/i)
    if (city) { current.city = city[1].trim(); continue }

    const salary = line.match(/^-\s*\*\*薪资\*\*:\s*(.+)$/i)
    if (salary) { current.salary = salary[1].trim(); continue }

    const difficulty = line.match(/^-\s*\*\*难度\*\*:\s*(.+)$/i)
    if (difficulty) { current.difficulty = difficulty[1].trim(); continue }

    const point = line.match(/^-\s*\*\*JD 要点\*\*:\s*(.+)$/i)
    if (point) {
      current.points.push(point[1].trim())
      continue
    }

    const plainPoint = line.match(/^-\s*(.+)$/)
    if (plainPoint && !line.includes('来源')) {
      current.points.push(plainPoint[1].trim())
      continue
    }

    const sourceLink = line.match(/^-\s*\*\*来源\*\*:\s*\[原文链接\]\((.+?)\)$/i)
    if (sourceLink) { current.url = sourceLink[1].trim(); continue }

    const bareLink = line.match(/\[原文链接\]\((https?:\/\/[^\s)]+)\)/i)
    if (bareLink) { current.url = bareLink[1].trim() }

    const tacit = line.match(/^>\s*💭\s*\*\*默会知识\*\*:\s*(.+)$/i)
    if (tacit) { current.tacit = tacit[1].trim() }
  }
  if (current) jobs.push(current)
  return jobs
}

function parseSections(content: string): Section[] {
  const rawSections = content.split(/^## /m).slice(1)
  const sections: Section[] = []

  for (const raw of rawSections) {
    const [titleLine, ...bodyLines] = raw.split('\n')
    const title = titleLine.trim()
    const body = bodyLines.join('\n')

    if (title.includes('优先岗位')) {
      sections.push({ kind: 'jobs', title, items: parseJobs(bodyLines) })
    } else if (title.includes('技能雷达')) {
      const rows: { skill: string; frequency: string }[] = []
      for (const line of bodyLines) {
        const row = line.match(/^\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|$/)
        if (row && !line.includes('---') && !line.includes('技能')) {
          rows.push({ skill: row[1].trim(), frequency: row[2].trim() })
        }
      }
      sections.push({ kind: 'skills', title, rows })
    } else if (title.includes('趋势解读')) {
      sections.push({ kind: 'trends', title, lines: bodyLines })
    } else {
      sections.push({ kind: 'unknown', lines: [titleLine, ...bodyLines] })
    }
  }

  return sections
}

function renderStars(text?: string): React.ReactNode {
  if (!text) return null
  return <span className="tracking-widest text-ember">{text}</span>
}

function ExternalLink({ href }: { href: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="underline decoration-ember/60 hover:text-ember"
      onClick={(e) => e.stopPropagation()}
    >
      原文链接
    </a>
  )
}

export function JobBriefingRenderer({ content, theme, fontSize }: Props) {
  const isAcademic = theme !== 'newspaper'
  const sections = useMemo(() => parseSections(content), [content])

  const bodyStyle = isAcademic ? ACADEMIC_BODY_STYLES[fontSize] : NEWSPAPER_BODY_STYLES[fontSize]
  const headingStyle = isAcademic ? ACADEMIC_HEADING_STYLES[fontSize] : NEWSPAPER_HEADING_STYLES[fontSize]

  const pageClass = isAcademic ? 'text-parchment' : 'text-[#1a1a1a]'
  const cardBg = isAcademic ? 'bg-ink/50 border-slate/30' : 'bg-[#f4f1ec] border-[#d9d3c9]'
  const sectionTitle = isAcademic ? 'text-ember font-serif' : 'text-[#1a1a1a] font-serif'

  return (
    <div
      className={`max-w-3xl mx-auto space-y-8 ${pageClass}`}
      style={{
        fontSize: bodyStyle.size,
        fontWeight: bodyStyle.weight,
      }}
    >
      {sections.map((section, idx) => {
        if (section.kind === 'jobs') {
          return (
            <section key={idx}>
              <h2
                className={`text-2xl mb-6 border-b pb-2 ${sectionTitle}`}
                style={{ fontSize: headingStyle.size, fontWeight: headingStyle.weight }}
              >
                {section.title}
              </h2>
              <div className="space-y-4">
                {section.items.map((job, j) => (
                  <article
                    key={j}
                    className={`rounded-lg border p-4 ${cardBg}`}
                    data-testid="job-briefing-card"
                  >
                    <div className="flex items-center gap-2 mb-2">
                      <span className={`text-xs px-2 py-0.5 rounded ${job.source === 'OFFICIAL' ? 'bg-ember/20 text-ember' : 'bg-slate/20 text-parchment/80'}`}>
                        {job.source === 'OFFICIAL' ? '官方' : 'Tavily'}
                      </span>
                      <h3 className="font-semibold">{job.company} · {job.title}</h3>
                    </div>
                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm opacity-80 mb-3">
                      {job.city && <span>城市：{job.city}</span>}
                      {job.salary && <span>薪资：{job.salary}</span>}
                      {job.difficulty && <span>难度：{renderStars(job.difficulty)}</span>}
                    </div>
                    {job.points.length > 0 && (
                      <ul className="list-disc list-inside text-sm space-y-1 mb-3 opacity-90">
                        {job.points.map((p, i) => <li key={i}>{p}</li>)}
                      </ul>
                    )}
                    {job.url && (
                      <div className="text-sm mb-2">
                        来源：<ExternalLink href={job.url} />
                      </div>
                    )}
                    {job.tacit && (
                      <blockquote className="border-l-2 border-ember pl-3 text-sm italic opacity-80">
                        💭 默会知识：{job.tacit}
                      </blockquote>
                    )}
                  </article>
                ))}
              </div>
            </section>
          )
        }

        if (section.kind === 'skills') {
          return (
            <section key={idx}>
              <h2
                className={`text-2xl mb-6 border-b pb-2 ${sectionTitle}`}
                style={{ fontSize: headingStyle.size, fontWeight: headingStyle.weight }}
              >
                {section.title}
              </h2>
              <div className="space-y-3">
                {section.rows.map((row, i) => {
                  const pct = parseInt(row.frequency.replace('%', ''), 10)
                  const width = Number.isNaN(pct) ? 0 : Math.min(100, Math.max(0, pct))
                  return (
                    <div key={i} data-testid="job-briefing-skill-row">
                      <div className="flex justify-between text-sm mb-1">
                        <span>{row.skill}</span>
                        <span>{row.frequency}</span>
                      </div>
                      <div className={`h-2 rounded-full ${isAcademic ? 'bg-parchment/10' : 'bg-[#d9d3c9]'}`}>
                        <div
                          className="h-full rounded-full bg-ember"
                          style={{ width: `${width}%` }}
                        />
                      </div>
                    </div>
                  )
                })}
              </div>
            </section>
          )
        }

        if (section.kind === 'trends') {
          const text = section.lines.join('\n').trim()
          return (
            <section key={idx}>
              <h2
                className={`text-2xl mb-6 border-b pb-2 ${sectionTitle}`}
                style={{ fontSize: headingStyle.size, fontWeight: headingStyle.weight }}
              >
                {section.title}
              </h2>
              <div className={`pl-4 border-l-4 ${isAcademic ? 'border-ember/60' : 'border-[#d97757]'}`}>
                <ReactMarkdown remarkPlugins={[remarkGfm]} className="prose prose-invert max-w-none">
                  {text}
                </ReactMarkdown>
              </div>
            </section>
          )
        }

        return (
          <section key={idx}>
            <ReactMarkdown remarkPlugins={[remarkGfm]} className="prose prose-invert max-w-none">
              {section.lines.join('\n')}
            </ReactMarkdown>
          </section>
        )
      })}
    </div>
  )
}
```

- [ ] **Step 2: Create re-export barrel**

Create `src/components/job-briefing/index.ts`:

```ts
export { JobBriefingRenderer } from './JobBriefingRenderer'
```

- [ ] **Step 3: Type-check**

Run:

```bash
npx tsc --noEmit
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/components/job-briefing
git commit -m "feat(job-briefing): add specialized markdown renderer"
```

---

## Task 10: Settings Config Panel

**Files:**
- Modify: `src/pages/Settings.tsx`

- [ ] **Step 1: Add job briefing config panel inside `Settings.tsx`**

Add state near existing settings state:

```ts
  const [jobConfig, setJobConfig] = useState<JobBriefingConfig>(DEFAULT_JOB_BRIEFING_CONFIG)
  const [jobConfigSaving, setJobConfigSaving] = useState(false)
```

Import types:

```ts
import type { JobBriefingConfig, JobCompany } from '@shared/index'
import { DEFAULT_JOB_BRIEFING_CONFIG } from '@electron/lib/job-briefing'
```

Note: `@electron/lib/job-briefing` may not resolve from renderer. Instead, duplicate the default in renderer or expose via IPC. **Decision**: expose `jobBriefingGetDefaults` via IPC, but that adds another layer. Simpler: define `DEFAULT_JOB_BRIEFING_CONFIG` in a shared location, e.g. `src/lib/job-briefing-defaults.ts` and import it from both `electron/lib/job-briefing.ts` and `src/pages/Settings.tsx`.

Create `src/lib/job-briefing-defaults.ts`:

```ts
import type { JobBriefingConfig } from '@shared/index'

export const DEFAULT_JOB_BRIEFING_CONFIG: JobBriefingConfig = {
  companies: [
    { name: '字节跳动', priority: 1, enabled: true },
    { name: '阿里巴巴', priority: 2, enabled: true },
    { name: '腾讯', priority: 3, enabled: true },
    { name: '百度', priority: 4, enabled: true },
    { name: '美团', priority: 5, enabled: true },
    { name: 'MiniMax', priority: 6, enabled: true },
    { name: '智谱AI', priority: 7, enabled: true },
    { name: '月之暗面', priority: 8, enabled: true },
    { name: '零一万物', priority: 9, enabled: true },
    { name: '百川智能', priority: 10, enabled: true },
  ],
  roleKeywords: ['AI产品经理', '大模型产品经理', 'Agent产品经理'],
  cities: ['北京', '上海', '杭州', '深圳'],
  skillKeywords: ['RAG', 'Agent', '提示词工程', '多模态'],
}
```

Then update `electron/lib/job-briefing.ts`:

```ts
import { DEFAULT_JOB_BRIEFING_CONFIG } from '../../src/lib/job-briefing-defaults'
```

And remove the inline `DEFAULT_JOB_BRIEFING_CONFIG` definition.

In `Settings.tsx`:

```ts
import { DEFAULT_JOB_BRIEFING_CONFIG } from '@/lib/job-briefing-defaults'
import type { JobBriefingConfig } from '@shared/index'
```

Load persisted config in `useEffect`:

```ts
    ipc.getState().then(state => {
      if (!mounted) return
      setJobConfig(state.jobBriefingConfig ?? DEFAULT_JOB_BRIEFING_CONFIG)
    }).catch(err => { if (mounted) setError(err.message || '读取求职简报配置失败') })
```

Add helper functions before the return statement:

```ts
  const updateCompany = (index: number, patch: Partial<JobCompany>) => {
    const next = { ...jobConfig }
    next.companies = next.companies.map((c, i) => i === index ? { ...c, ...patch } : c)
    setJobConfig(next)
  }

  const addCompany = () => {
    const next = { ...jobConfig }
    next.companies = [...next.companies, { name: '', priority: next.companies.length + 1, enabled: true }]
    setJobConfig(next)
  }

  const removeCompany = (index: number) => {
    const next = { ...jobConfig }
    next.companies = next.companies.filter((_, i) => i !== index)
    setJobConfig(next)
  }

  const handleSaveJobConfig = async () => {
    setJobConfigSaving(true)
    try {
      await useStore.getState().setJobBriefingConfig(jobConfig)
      showToast('求职简报配置已保存')
    } catch (err: any) {
      setError(err.message || '保存失败')
    } finally {
      setJobConfigSaving(false)
    }
  }

  const handleDiscoverPages = async () => {
    setError(null)
    const result = await useStore.getState().discoverJobBriefingPages()
    if (!result.ok) {
      setError(result.message || '刷新招聘页链接失败')
    } else {
      setJobConfig({ ...jobConfig, companies: result.companies })
      showToast('招聘页链接已更新')
    }
  }

  const handleResetJobConfig = () => {
    setJobConfig(DEFAULT_JOB_BRIEFING_CONFIG)
  }
```

Add the panel JSX before the "保存" section:

```tsx
              {/* 求职简报 */}
              <div className="bg-parchment/5 border border-slate/20 rounded-lg p-4 mb-4">
                <h3 className="text-ember font-semibold mb-4">求职简报</h3>

                <div className="space-y-4">
                  <div>
                    <div className="text-[11px] text-parchment/60 font-sans mb-1">目标岗位关键词（逗号分隔）</div>
                    <input
                      data-testid="settings-job-role-keywords"
                      type="text"
                      value={jobConfig.roleKeywords.join('，')}
                      onChange={e => setJobConfig({ ...jobConfig, roleKeywords: e.target.value.split(/[,，]/).map(s => s.trim()).filter(Boolean) })}
                      className="w-full bg-ink/50 border border-slate/40 rounded-md px-3 py-2 text-sm text-parchment placeholder:text-parchment/30 focus:outline-none focus:border-ember/60"
                    />
                  </div>

                  <div>
                    <div className="text-[11px] text-parchment/60 font-sans mb-1">目标城市（逗号分隔）</div>
                    <input
                      data-testid="settings-job-cities"
                      type="text"
                      value={jobConfig.cities.join('，')}
                      onChange={e => setJobConfig({ ...jobConfig, cities: e.target.value.split(/[,，]/).map(s => s.trim()).filter(Boolean) })}
                      className="w-full bg-ink/50 border border-slate/40 rounded-md px-3 py-2 text-sm text-parchment placeholder:text-parchment/30 focus:outline-none focus:border-ember/60"
                    />
                  </div>

                  <div>
                    <div className="text-[11px] text-parchment/60 font-sans mb-1">关注技能（逗号分隔，用于雷达）</div>
                    <input
                      data-testid="settings-job-skills"
                      type="text"
                      value={jobConfig.skillKeywords.join('，')}
                      onChange={e => setJobConfig({ ...jobConfig, skillKeywords: e.target.value.split(/[,，]/).map(s => s.trim()).filter(Boolean) })}
                      className="w-full bg-ink/50 border border-slate/40 rounded-md px-3 py-2 text-sm text-parchment placeholder:text-parchment/30 focus:outline-none focus:border-ember/60"
                    />
                  </div>

                  <div>
                    <div className="text-[11px] text-parchment/60 font-sans mb-1">关注公司</div>
                    <div className="space-y-2">
                      {jobConfig.companies.map((company, idx) => (
                        <div key={idx} className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={company.enabled}
                            onChange={e => updateCompany(idx, { enabled: e.target.checked })}
                            className="shrink-0"
                          />
                          <input
                            type="text"
                            value={company.name}
                            onChange={e => updateCompany(idx, { name: e.target.value })}
                            placeholder="公司名"
                            className="flex-1 min-w-0 bg-ink/50 border border-slate/40 rounded-md px-3 py-1.5 text-sm text-parchment placeholder:text-parchment/30 focus:outline-none focus:border-ember/60"
                          />
                          <input
                            type="number"
                            value={company.priority}
                            onChange={e => updateCompany(idx, { priority: Number(e.target.value) })}
                            className="w-16 bg-ink/50 border border-slate/40 rounded-md px-2 py-1.5 text-sm text-parchment placeholder:text-parchment/30 focus:outline-none focus:border-ember/60"
                          />
                          {company.careerPageUrl && (
                            <span className="text-xs text-parchment/40 truncate max-w-[120px]" title={company.careerPageUrl}>已发现招聘页</span>
                          )}
                          <button
                            type="button"
                            onClick={() => removeCompany(idx)}
                            className="text-parchment/50 hover:text-wine text-sm px-2"
                          >
                            删除
                          </button>
                        </div>
                      ))}
                      <Button data-testid="settings-job-add-company" variant="ghost" onClick={addCompany}>
                        添加公司
                      </Button>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-3">
                    <Button data-testid="settings-job-save" onClick={handleSaveJobConfig} disabled={jobConfigSaving}>
                      保存求职简报配置
                    </Button>
                    <Button data-testid="settings-job-discover" variant="ghost" onClick={handleDiscoverPages}>
                      刷新官方招聘页链接
                    </Button>
                    <Button data-testid="settings-job-reset" variant="ghost" onClick={handleResetJobConfig}>
                      恢复默认
                    </Button>
                  </div>
                </div>
              </div>
```

- [ ] **Step 2: Type-check**

Run:

```bash
npx tsc --noEmit
```

Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/pages/Settings.tsx src/lib/job-briefing-defaults.ts electron/lib/job-briefing.ts
git commit -m "feat(job-briefing): add settings config panel"
```

---

## Task 11: DocType Rendering Fallback

**Files:**
- Modify: `src/components/md/fileType.ts`
- Modify: `src/components/md/ReportHeader.tsx`

- [ ] **Step 1: Update `src/components/md/fileType.ts`**

Add `job-briefing` mapping:

```ts
  if (lower.includes('求职简报') || type === 'job-briefing') return 'job-briefing'
```

Update return type if needed. If the function returns `'progress' | 'review' | 'fable' | 'transcript' | 'briefing' | 'external-materials' | 'anthropic-article'`, add `'job-briefing'`.

- [ ] **Step 2: Update `src/components/md/ReportHeader.tsx`**

Add to `TYPE_LABELS`:

```ts
  'job-briefing': '求职简报',
```

Add to `BADGE_STYLES`:

```ts
  'job-briefing': 'bg-ember/20 text-ember border-ember/40',
```

- [ ] **Step 3: Type-check**

Run:

```bash
npx tsc --noEmit
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/components/md/fileType.ts src/components/md/ReportHeader.tsx
git commit -m "feat(job-briefing): add DocType rendering fallback"
```

---

## Task 12: Unit Tests

**Files:**
- Create: `tests/job-briefing.test.ts`

- [ ] **Step 1: Write unit tests**

```ts
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
  })

  it('preserves provided values', () => {
    const config = normalizeJobBriefingConfig({
      roleKeywords: ['测试'],
      cities: ['成都'],
      skillKeywords: ['AIGC'],
      companies: [{ name: 'Test', priority: 1, enabled: true }],
    })
    expect(config.roleKeywords).toEqual(['测试'])
    expect(config.companies).toHaveLength(1)
  })

  it('builds official page queries', () => {
    const qs = buildOfficialPageQueries('字节跳动')
    expect(qs).toContain('字节跳动 官方招聘 AI产品经理')
    expect(qs).toContain('字节跳动 careers AI product manager')
  })

  it('builds Tavily queries with enabled companies', () => {
    const config = normalizeJobBriefingConfig({
      companies: [
        { name: '字节跳动', priority: 1, enabled: true },
        { name: '禁用公司', priority: 2, enabled: false },
      ],
    })
    const qs = buildTavilyQueries(config)
    expect(qs.some(q => q.includes('字节跳动'))).toBe(true)
    expect(qs.some(q => q.includes('禁用公司'))).toBe(false)
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
})
```

- [ ] **Step 2: Run tests**

```bash
npx vitest run tests/job-briefing.test.ts
```

Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add tests/job-briefing.test.ts
git commit -m "test(job-briefing): add unit tests for config and dedup"
```

---

## Task 13: Component Tests

**Files:**
- Create: `tests/job-briefing-layout.test.tsx`

- [ ] **Step 1: Write component tests**

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { JobBriefingRenderer } from '../src/components/job-briefing/JobBriefingRenderer'

const sampleContent = `## 优先岗位

### [OFFICIAL] 腾讯 · AI产品经理培训生
- **城市**: 深圳
- **薪资**: 年薪 40W+
- **难度**: ★★★★☆
- **JD 要点**: 大模型应用、Agent设计
- **来源**: [原文链接](https://example.com/job)

> 💭 **默会知识**: 需要理解 LLM 能力边界。

## 技能雷达

| 技能 | 频次 |
|---|---|
| 大模型 / LLM | 92% |
| Agent 设计 | 78% |

## 趋势解读

当前市场对 AI 产品经理的要求集中在 LLM 应用落地能力。
`

describe('JobBriefingRenderer', () => {
  it('renders job cards', () => {
    render(<JobBriefingRenderer content={sampleContent} theme="academic" fontSize="base" />)
    expect(screen.getByText('腾讯 · AI产品经理培训生')).toBeInTheDocument()
    expect(screen.getAllByTestId('job-briefing-card')).toHaveLength(1)
  })

  it('renders skill bars', () => {
    render(<JobBriefingRenderer content={sampleContent} theme="academic" fontSize="base" />)
    expect(screen.getAllByTestId('job-briefing-skill-row')).toHaveLength(2)
  })

  it('renders external link with rel', () => {
    render(<JobBriefingRenderer content={sampleContent} theme="academic" fontSize="base" />)
    const link = screen.getByText('原文链接')
    expect(link).toHaveAttribute('href', 'https://example.com/job')
    expect(link).toHaveAttribute('target', '_blank')
    expect(link).toHaveAttribute('rel', 'noopener noreferrer')
  })

  it('renders newspaper theme without crash', () => {
    render(<JobBriefingRenderer content={sampleContent} theme="newspaper" fontSize="base" />)
    expect(screen.getByText('腾讯 · AI产品经理培训生')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run tests**

```bash
npx vitest run tests/job-briefing-layout.test.tsx
```

Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add tests/job-briefing-layout.test.tsx
git commit -m "test(job-briefing): add component tests for renderer"
```

---

## Task 14: E2E Tests

**Files:**
- Create: `e2e/specs/job-briefing-generation.spec.ts`
- Modify: `e2e/helpers/selectors.ts` (if needed)

- [ ] **Step 1: Add selectors to `e2e/helpers/selectors.ts`**

Add:

```ts
  BRIEFING_SOURCE_JOB_BRIEFING: '[data-testid="briefing-source-job-briefing"]',
  JOB_BRIEFING_CARD: '[data-testid="job-briefing-card"]',
  JOB_BRIEFING_SKILL_ROW: '[data-testid="job-briefing-skill-row"]',
```

- [ ] **Step 2: Write E2E spec**

```ts
import { test, expect } from '@playwright/test'
import { createElectronFixture } from '../fixtures/electron'
import { seedStateJson, seedEmptyLibrary } from '../helpers/test-library'
import { SELECTORS } from '../helpers/selectors'

const electron = createElectronFixture({ configDir: 'job-briefing-generation' })

test.beforeEach(async () => {
  await seedEmptyLibrary(electron.configDir)
  await seedStateJson(electron.configDir, {
    briefingSource: 'job-briefing',
  })
})

test.afterEach(async () => {
  await electron.teardown()
})

test('@p1 job briefing generation via mock', async () => {
  const { page } = await electron.launch()

  await page.goto('briefing')
  await page.locator(SELECTORS.BRIEFING_SOURCE_JOB_BRIEFING).waitFor()
  await expect(page.locator(SELECTORS.BRIEFING_SOURCE_JOB_BRIEFING)).toHaveClass(/active/)

  await page.locator(SELECTORS.BRIEFING_RECEIVE_DIGEST_BUTTON).click()
  await page.locator(SELECTORS.JOB_BRIEFING_CARD).waitFor({ timeout: 30_000 })

  await expect(page.locator(SELECTORS.JOB_BRIEFING_CARD)).toHaveCount(1)
  await expect(page.locator(SELECTORS.JOB_BRIEFING_SKILL_ROW)).toHaveCount(2)
  await expect(page.getByText('趋势解读')).toBeVisible()

  // Verify cache file
  const fs = require('node:fs')
  const path = require('node:path')
  const today = new Date().toISOString().slice(0, 10)
  const file = path.join(electron.libraryPath, '求职简报', `求职简报-${today}.md`)
  expect(fs.existsSync(file)).toBe(true)
})
```

- [ ] **Step 3: Run E2E spec**

```bash
npx playwright test e2e/specs/job-briefing-generation.spec.ts
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add e2e/specs/job-briefing-generation.spec.ts e2e/helpers/selectors.ts
git commit -m "test(job-briefing): add mock E2E generation spec"
```

---

## Task 15: Final Verification

- [ ] **Step 1: Run full test suite**

```bash
npm run test
```

Expected: PASS (all existing + new tests).

- [ ] **Step 2: Run type check**

```bash
npx tsc --noEmit
```

Expected: PASS.

- [ ] **Step 3: Run build**

```bash
npm run build
```

Expected: PASS.

- [ ] **Step 4: Commit any final fixes**

```bash
git commit -m "chore(job-briefing): final verification and fixes" -a
```

---

## Self-Review

### 1. Spec coverage

| Spec requirement | Task |
|------------------|------|
| 第三个来源标签 | Task 8 |
| 日期列复用 + todayLabel | Task 7 |
| 空态/加载/错误/成功 | Task 8 |
| 优先岗位/技能雷达/趋势解读 | Task 3, Task 9 |
| 岗位卡片 + 默会知识 + 外链 | Task 9 |
| 官方页抓取 + Tavily | Task 3 |
| 配置持久化 + 默认值 | Task 1, Task 6, Task 10 |
| 错误码 + 降级 | Task 1, Task 3, Task 4, Task 6 |
| 旁注对话小助手（无导读） | Task 7, Task 8 |
| 旧 state.json 兼容 | Task 6 |
| 测试覆盖 | Task 12, Task 13, Task 14 |

### 2. Placeholder scan

- No TBD/TODO.
- All code blocks are complete enough to compile after minor path verification.
- The `DEFAULT_JOB_BRIEFING_CONFIG` was moved to a shared renderer-main file to avoid cross-process import issues.

### 3. Type consistency

- `JobBriefingResult`, `JobBriefingConfig`, `JobCompany`, `JobErrorCode` used consistently across types, handler, store, and tests.
- `briefingSource` union expanded in one place (`src/types/index.ts`) and propagated to store defaults/state.
- `BriefingSourceStatus` changed to `Record<string, 'ok' | 'failed'>` to support arbitrary keys including `official:Company`.

### 4. Known gaps / risks

- `ArticleAssistantPanel` uses `articleType="briefing"` for job briefing sessions; the saved session will have `parent_type='briefing'`. This is acceptable for v1.
- `electron/lib/job-briefing.ts` uses `BrowserWindow` offscreen fallback; verify it works in packaged builds (Rule 6).
- The renderer imports `DEFAULT_JOB_BRIEFING_CONFIG` from `src/lib/job-briefing-defaults.ts`; ensure this file does not import any Node-only modules.

---

## Execution Handoff

**Plan complete and saved to `docs/superpowers/plans/2026-07-11-job-briefing.md`.**

Two execution options:

**1. Subagent-Driven (recommended)** — dispatch a fresh subagent per task, review between tasks, fast iteration.

**2. Inline Execution** — execute tasks in this session using the executing-plans skill, batch execution with checkpoints for review.

Which approach would you like?
