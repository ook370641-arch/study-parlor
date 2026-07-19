# 求职简报整体升级 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将求职简报升级为「个人档案 + 三级漏斗串行管道（新动态 → 焦点岗位 → 面经）+ 四板块叙事线输出」。

**Architecture:** 新增持久化 `JobProfile`（state.json，走现有 state 通道，不新增 IPC）；`electron/lib/job-briefing.ts` 重构为三级串行管道，每级独立降级；`searchWeb` 增加 `days`/`includeDomains`；综合 prompt 注入档案与三级 JSON，输出四板块 Markdown；`JobBriefingRenderer` 重写解析与渲染。

**Tech Stack:** Electron 30 / React 18 / TypeScript / Zustand / Vitest / Tavily API / Kimi API

**Spec:** `docs/superpowers/specs/2026-07-19-job-briefing-upgrade-design.md`

**通用约定:**
- 类型检查命令：`npx tsc --noEmit && npx tsc --noEmit -p tsconfig.node.json`
- 单测命令：`npx vitest run tests/<file>`
- 每个 Task 完成后 commit；commit message 用中文前缀（`feat(job-briefing): ...` / `test(job-briefing): ...`）。

---

### Task 1: 共享类型层 — JobProfile / JobEvent / MatchedJob / InterviewQuestion + Stage/SourceStatus 更新

**Files:**
- Modify: `src/types/index.ts:323-367`（JobBriefing 类型区）、`src/types/index.ts:371-392`（StateJson）

- [ ] **Step 1: 替换 JobBriefing 类型区**

在 `src/types/index.ts` 中，用以下内容**完整替换**现有 `JobCompany` 到 `JobBriefingResult` 的区段（第 323-367 行，`JobCompany`/`JobBriefingConfig`/`JobErrorCode` 定义保持不变，只替换 `JobBriefingSourceStatus` 与 `JobBriefingStage`，并新增四个类型）：

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

export type JobProfile = {
  targetRoles: string[]
  direction: string
  skills: string[]
  experience: string
  additionalNotes: string
  updatedAt: string
}

export type JobEventType = '秋招开启' | '新岗位' | '线下活动' | '宣讲会' | '其他'

export type JobEvent = {
  company: string
  eventType: JobEventType
  title: string
  date: string
  summary: string
  url: string
}

export type MatchedJob = {
  title: string
  city: string
  salary: string
  requirements: string[]
  url: string
  source: 'official' | 'tavily'
  company: string
  matchLevel: 1 | 2 | 3 | 4 | 5
  matchReason: string
  sourceEventTitle?: string
}

export type InterviewQuestion = {
  question: string
  intent: string
  prepTip: string
  frequency: string
  companies: string[]
  url: string
}

export type JobBriefingSourceStatus = {
  events: 'ok' | 'failed'
  jobs: 'ok' | 'failed'
  questions: 'ok' | 'failed'
  official: Record<string, 'ok' | 'failed'>
}

export type JobBriefingStage =
  | 'scanning-events'
  | 'digging-jobs'
  | 'aggregating-questions'
  | 'synthesizing'
  | 'finalizing'
  | 'done'

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
```

- [ ] **Step 2: StateJson 增加 jobProfile**

在 `StateJson` 类型中 `jobBriefingConfig?: JobBriefingConfig` 一行之后插入：

```ts
  jobProfile?: JobProfile
```

- [ ] **Step 3: 类型检查（预期失败）**

Run: `npx tsc --noEmit && npx tsc --noEmit -p tsconfig.node.json`
Expected: FAIL —— `electron/lib/job-briefing.ts`、`electron/ipc/job-briefing.ts`、`src/store/index.ts`、`src/components/BriefingProgress.tsx`、`src/pages/Briefing.tsx` 报旧 stage/sourceStatus 相关错误。这些错误在后续 Task 逐个消除，此步只确认类型改动已生效。

- [ ] **Step 4: Commit**

```bash
git add src/types/index.ts
git commit -m "feat(job-briefing): JobProfile/JobEvent/MatchedJob/InterviewQuestion 类型与漏斗式 Stage/SourceStatus"
```

---

### Task 2: 求职档案默认值与判定工具

**Files:**
- Modify: `src/lib/job-briefing-defaults.ts`
- Modify: `electron/ipc/state.ts:12-26`
- Test: `tests/job-briefing.test.ts`

- [ ] **Step 1: 写失败测试**

在 `tests/job-briefing.test.ts` 顶部 import 区追加：

```ts
import { DEFAULT_JOB_PROFILE, isJobProfileEmpty, normalizeJobProfile, formatJobProfile } from '../src/lib/job-briefing-defaults'
```

文件末尾追加：

```ts
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
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npx vitest run tests/job-briefing.test.ts`
Expected: FAIL（`DEFAULT_JOB_PROFILE` 等导出不存在）

- [ ] **Step 3: 实现**

在 `src/lib/job-briefing-defaults.ts` 中，将 import 行改为：

```ts
import type { JobBriefingConfig, JobProfile } from '@shared/index'
```

文件末尾追加：

```ts
export const DEFAULT_JOB_PROFILE: JobProfile = {
  targetRoles: [],
  direction: '',
  skills: [],
  experience: '',
  additionalNotes: '',
  updatedAt: '',
}

export function normalizeJobProfile(raw?: Partial<JobProfile>): JobProfile {
  return {
    targetRoles: Array.isArray(raw?.targetRoles) ? raw.targetRoles.filter((t): t is string => typeof t === 'string' && t.trim().length > 0) : [],
    direction: typeof raw?.direction === 'string' ? raw.direction : '',
    skills: Array.isArray(raw?.skills) ? raw.skills.filter((s): s is string => typeof s === 'string' && s.trim().length > 0) : [],
    experience: typeof raw?.experience === 'string' ? raw.experience : '',
    additionalNotes: typeof raw?.additionalNotes === 'string' ? raw.additionalNotes : '',
    updatedAt: typeof raw?.updatedAt === 'string' ? raw.updatedAt : '',
  }
}

export function isJobProfileEmpty(p: JobProfile): boolean {
  return p.targetRoles.length === 0 && !p.direction.trim() && !p.experience.trim()
}

export function formatJobProfile(profile: JobProfile): string {
  if (isJobProfileEmpty(profile)) return '（用户未提供个人背景，按通用 AI 产品求职者处理）'
  const lines = [
    `意向岗位: ${profile.targetRoles.join('、') || '未填写'}`,
    `方向: ${profile.direction || '未填写'}`,
    `技能: ${profile.skills.join('、') || '未填写'}`,
    `经历: ${profile.experience || '未填写'}`,
  ]
  if (profile.additionalNotes.trim()) lines.push(`补充: ${profile.additionalNotes}`)
  return lines.join('\n')
}
```

- [ ] **Step 4: state.ts DEFAULT 增加 jobProfile**

在 `electron/ipc/state.ts` 的 import 区追加：

```ts
import { DEFAULT_JOB_PROFILE } from '../../src/lib/job-briefing-defaults'
```

在 `DEFAULT` 对象中 `jobBriefingConfig: DEFAULT_JOB_BRIEFING_CONFIG,` 之后插入：

```ts
  jobProfile: DEFAULT_JOB_PROFILE,
```

- [ ] **Step 5: 运行测试确认通过**

Run: `npx vitest run tests/job-briefing.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/lib/job-briefing-defaults.ts electron/ipc/state.ts tests/job-briefing.test.ts
git commit -m "feat(job-briefing): JobProfile 默认值、normalize/empty/format 工具与 state 默认值"
```

---

### Task 3: searchWeb 支持 days / includeDomains

**Files:**
- Modify: `electron/lib/search.ts:9-15`（TavilySearchOptions）、`electron/lib/search.ts:44-50`（请求体）
- Test: `tests/search.test.ts`（新建）

- [ ] **Step 1: 写失败测试**

新建 `tests/search.test.ts`：

```ts
import { describe, it, expect, vi, afterEach } from 'vitest'
import { searchWeb } from '../electron/lib/search'

function mockFetchOk() {
  return vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ results: [{ title: 't', url: 'https://a.com', content: 'c' }] }),
  })
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('searchWeb options', () => {
  it('includes days and include_domains in request body when provided', async () => {
    const fetchMock = mockFetchOk()
    vi.stubGlobal('fetch', fetchMock)
    await searchWeb({ query: 'q', apiKey: 'k', days: 7, includeDomains: ['nowcoder.com'] })
    const body = JSON.parse(fetchMock.mock.calls[0][1].body)
    expect(body.days).toBe(7)
    expect(body.include_domains).toEqual(['nowcoder.com'])
  })

  it('omits days/include_domains when not provided', async () => {
    const fetchMock = mockFetchOk()
    vi.stubGlobal('fetch', fetchMock)
    await searchWeb({ query: 'q', apiKey: 'k' })
    const body = JSON.parse(fetchMock.mock.calls[0][1].body)
    expect('days' in body).toBe(false)
    expect('include_domains' in body).toBe(false)
  })

  it('omits include_domains for empty array', async () => {
    const fetchMock = mockFetchOk()
    vi.stubGlobal('fetch', fetchMock)
    await searchWeb({ query: 'q', apiKey: 'k', includeDomains: [] })
    const body = JSON.parse(fetchMock.mock.calls[0][1].body)
    expect('include_domains' in body).toBe(false)
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npx vitest run tests/search.test.ts`
Expected: FAIL（days/include_domains 不在请求体中）

- [ ] **Step 3: 实现**

在 `electron/lib/search.ts` 中，`TavilySearchOptions` 追加两个可选字段：

```ts
export type TavilySearchOptions = {
  query: string
  apiKey: string
  baseUrl?: string
  maxResults?: number
  signal?: AbortSignal
  days?: number
  includeDomains?: string[]
}
```

请求体改为：

```ts
      body: JSON.stringify({
        api_key: opts.apiKey,
        query: opts.query,
        search_depth: 'basic',
        max_results: opts.maxResults ?? 5,
        include_answer: false,
        ...(opts.days !== undefined ? { days: opts.days } : {}),
        ...(opts.includeDomains?.length ? { include_domains: opts.includeDomains } : {}),
      })
```

- [ ] **Step 4: 运行测试确认通过**

Run: `npx vitest run tests/search.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add electron/lib/search.ts tests/search.test.ts
git commit -m "feat(search): searchWeb 支持 days 时间窗与 includeDomains 域名定向"
```

---

### Task 4: 第 1 级 — 新动态发现（discoverEvents + extract-events prompt）

**Files:**
- Create: `electron/prompts/job-briefing/extract-events.md`
- Modify: `electron/lib/job-briefing.ts`
- Test: `tests/job-briefing.test.ts`

- [ ] **Step 1: 写失败测试**

在 `tests/job-briefing.test.ts` 的 import 中追加（与 Task 2 的 import 分开一行）：

```ts
import {
  JOB_COMMUNITY_DOMAINS,
  buildEventQueries,
  dedupEvents,
  companyNameMatches,
} from '../electron/lib/job-briefing'
```

文件末尾追加：

```ts
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
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npx vitest run tests/job-briefing.test.ts`
Expected: FAIL（导出不存在的编译错误）

- [ ] **Step 3: 实现查询构建与去重**

在 `electron/lib/job-briefing.ts` 的 import 区，将 `@shared/index` 的 type import 改为：

```ts
import type {
  JobBriefingConfig,
  JobCompany,
  JobBriefingResult,
  JobBriefingSourceStatus,
  JobErrorCode,
  JobBriefingStage,
  JobProfile,
  JobEvent,
  JobEventType,
  MatchedJob,
  InterviewQuestion,
  Message,
} from '@shared/index'
```

并把 defaults import 改为：

```ts
import { DEFAULT_JOB_BRIEFING_CONFIG, formatJobProfile } from '../../src/lib/job-briefing-defaults'
```

在 `buildOfficialPageQueries` 之后追加：

```ts
export const JOB_COMMUNITY_DOMAINS = ['nowcoder.com', 'yingjiesheng.com', 'zhihu.com', 'xiaohongshu.com']

export type EventQuery = { query: string; company?: string; includeDomains?: string[] }

export function buildEventQueries(config: JobBriefingConfig): EventQuery[] {
  const queries: EventQuery[] = config.companies
    .filter(c => c.enabled)
    .sort((a, b) => a.priority - b.priority)
    .map(c => ({ query: `${c.name} 秋招 校招 开启 宣讲会 线下活动 招聘`, company: c.name }))
  queries.push({
    query: 'AI产品 秋招开启 校招 汇总',
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
```

- [ ] **Step 4: 创建 extract-events prompt**

新建 `electron/prompts/job-briefing/extract-events.md`：

```markdown
# 求职新动态提取

你正在从搜索结果中提取国内 AI 产品相关的求职新动态（秋招开启、新岗位发布、线下活动、宣讲会）。

目标公司：{{company}}

搜索结果：

```
{{content}}
```

要求：
1. 只输出 JSON，不要 markdown 代码块，不要解释。
2. 输出格式必须是如下 JSON 对象（以 `{` 开头、以 `}` 结尾）：
   {
     "events": [
       {
         "company": "公司名",
         "eventType": "秋招开启 | 新岗位 | 线下活动 | 宣讲会 | 其他",
         "title": "事件标题（一句话）",
         "date": "事件日期，YYYY-MM-DD；推断不出留空字符串",
         "summary": "2-3 句摘要，包含关键信息（批次、岗位方向、活动时间地点）",
         "url": "原始链接"
       }
     ]
   }
3. 只保留与求职/招聘直接相关的事件；公司新闻、融资、产品发布不算。
4. 没有有效事件时返回 {"events": []}。
5. eventType 只能取「秋招开启 / 新岗位 / 线下活动 / 宣讲会 / 其他」五个值之一。
6. 不要编造 URL；使用搜索结果中的原始链接。
7. 空字段用 ""，不要省略字段。
```

- [ ] **Step 5: 实现 discoverEvents**

在 `electron/lib/job-briefing.ts` 中 `searchJobsForCompany` 之后追加：

```ts
function normalizeEventType(raw: unknown): JobEventType {
  const valid: JobEventType[] = ['秋招开启', '新岗位', '线下活动', '宣讲会', '其他']
  return valid.includes(raw as JobEventType) ? (raw as JobEventType) : '其他'
}

export async function discoverEvents(
  cfg: AppConfig,
  config: JobBriefingConfig,
  opts: { apiKey: string; signal?: AbortSignal }
): Promise<JobEvent[]> {
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
  return dedupEvents(events)
}
```

- [ ] **Step 6: 运行测试确认通过**

Run: `npx vitest run tests/job-briefing.test.ts`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add electron/lib/job-briefing.ts electron/prompts/job-briefing/extract-events.md tests/job-briefing.test.ts
git commit -m "feat(job-briefing): 第 1 级新动态发现（逐公司 7 天时间窗 + 社区定向 + LLM 事件提取）"
```

---

### Task 5: 第 2 级 — 焦点公司选择与岗位匹配（selectFocusCompanies + matchJobsToProfile + match-jobs prompt）

**Files:**
- Create: `electron/prompts/job-briefing/match-jobs.md`
- Modify: `electron/lib/job-briefing.ts`
- Test: `tests/job-briefing.test.ts`

- [ ] **Step 1: 写失败测试**

在 `tests/job-briefing.test.ts` 的 job-briefing import 中追加：

```ts
  selectFocusCompanies,
  buildFocusJobQuery,
```

文件末尾追加：

```ts
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
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npx vitest run tests/job-briefing.test.ts`
Expected: FAIL

- [ ] **Step 3: 实现**

在 `electron/lib/job-briefing.ts` 的 `discoverEvents` 之后追加：

```ts
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
  return `${company} ${roles.join(' ')} 招聘 校招 2026`
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
    thinking: { type: 'enabled', reasoning_effort: 'medium' },
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
```

- [ ] **Step 4: 创建 match-jobs prompt**

新建 `electron/prompts/job-briefing/match-jobs.md`：

```markdown
# 岗位-候选人匹配评估

你正在为一位求职者评估岗位匹配度。

候选人背景：
{{profile}}

岗位列表（JSON，index 从 0 开始）：

```json
{{jobsJson}}
```

要求：
1. 只输出 JSON，不要 markdown 代码块，不要解释。
2. 输出格式必须是如下 JSON 对象（以 `{` 开头、以 `}` 结尾）：
   {
     "jobs": [
       {
         "index": 0,
         "matchLevel": 4,
         "matchReason": "2-3 句，说明该岗位与候选人背景的具体对应点"
       }
     ]
   }
3. matchLevel 为 1-5 的整数：5 = 高度匹配（方向、技能、经历多点对应）；1 = 几乎不相关。
4. 若候选人背景标注为「未提供」，按通用 AI 产品求职者评估岗位含金量，matchReason 改写为该岗位的「岗位亮点」。
5. 只评估输入中存在的岗位，index 必须在输入范围内；不要编造新岗位。
6. 覆盖所有输入岗位，不要遗漏。
```

- [ ] **Step 5: 运行测试确认通过**

Run: `npx vitest run tests/job-briefing.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add electron/lib/job-briefing.ts electron/prompts/job-briefing/match-jobs.md tests/job-briefing.test.ts
git commit -m "feat(job-briefing): 第 2 级焦点公司选择与 JobProfile 匹配评估"
```

---

### Task 6: 第 3 级 — 面经高频问题聚合（discoverQuestions + aggregate-questions prompt）

**Files:**
- Create: `electron/prompts/job-briefing/aggregate-questions.md`
- Modify: `electron/lib/job-briefing.ts`
- Test: `tests/job-briefing.test.ts`

- [ ] **Step 1: 写失败测试**

在 `tests/job-briefing.test.ts` 的 job-briefing import 中追加：

```ts
  buildQuestionQueries,
  buildFallbackQuestionQuery,
  dedupQuestions,
```

文件末尾追加：

```ts
describe('question lane', () => {
  const config = normalizeJobBriefingConfig({ roleKeywords: ['AI产品经理'] })

  it('builds at most 3 focus-company queries with community domains', () => {
    const qs = buildQuestionQueries(
      [{ name: '腾讯' }, { name: '字节跳动' }, { name: '百度' }, { name: '美团' }],
      normalizeJobProfile({ direction: '模型产品' }),
      config,
    )
    expect(qs).toHaveLength(3)
    expect(qs[0].query).toBe('腾讯 模型产品 面经 面试题')
    expect(qs.every(q => q.includeDomains.every(d => JOB_COMMUNITY_DOMAINS.includes(d)))).toBe(true)
  })

  it('uses roleKeywords when profile direction and targetRoles empty', () => {
    const qs = buildQuestionQueries([{ name: '腾讯' }], normalizeJobProfile({}), config)
    expect(qs[0].query).toBe('腾讯 AI产品经理 面经 面试题')
  })

  it('builds fallback query from direction', () => {
    expect(buildFallbackQuestionQuery(normalizeJobProfile({ direction: '模型产品' }), config)).toBe('模型产品 面经 高频问题')
    expect(buildFallbackQuestionQuery(normalizeJobProfile({}), config)).toBe('AI产品经理 面经 高频问题')
  })

  it('dedups questions ignoring punctuation/whitespace', () => {
    const out = dedupQuestions([
      { question: '如何为多解问题确定评测指标？', intent: '', prepTip: '', frequency: '', companies: [], url: 'u1' },
      { question: '如何为多解问题确定评测指标', intent: '', prepTip: '', frequency: '', companies: [], url: 'u2' },
    ])
    expect(out).toHaveLength(1)
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npx vitest run tests/job-briefing.test.ts`
Expected: FAIL

- [ ] **Step 3: 实现**

在 `electron/lib/job-briefing.ts` 的 `matchJobsToProfile` 之后追加：

```ts
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
```

- [ ] **Step 4: 创建 aggregate-questions prompt**

新建 `electron/prompts/job-briefing/aggregate-questions.md`：

```markdown
# 面经高频问题聚合

你正在从求职社区面经内容中聚合以下方向的高频面试问题：{{direction}}

面经/搜索结果：

```
{{content}}
```

要求：
1. 只输出 JSON，不要 markdown 代码块，不要解释。
2. 输出格式必须是如下 JSON 对象（以 `{` 开头、以 `}` 结尾）：
   {
     "questions": [
       {
         "question": "面试问题原文（一句话）",
         "intent": "考察意图：面试官想通过这题评估什么能力",
         "prepTip": "准备要点：从哪些角度准备，2-3 句",
         "frequency": "出现频次描述，如 高频 / 出现多次 / 偶见",
         "companies": ["出现该问题的公司"],
         "url": "来源链接"
       }
     ]
   }
3. 只保留真实出现在面经中的问题，不要编造通用面试题。
4. 相似问题合并为一条，companies 取并集。
5. 不要输出参考答案全文；prepTip 只给准备方向。
6. 没有有效问题时返回 {"questions": []}。
7. 不要编造 URL；使用搜索结果中的原始链接。
```

- [ ] **Step 5: 运行测试确认通过**

Run: `npx vitest run tests/job-briefing.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add electron/lib/job-briefing.ts electron/prompts/job-briefing/aggregate-questions.md tests/job-briefing.test.ts
git commit -m "feat(job-briefing): 第 3 级面经高频问题聚合（社区域名定向 + 通用回退）"
```

---

### Task 7: 综合生成 — synthesize prompt 重写 + generateJobBriefing 三级漏斗重构

**Files:**
- Modify: `electron/prompts/job-briefing/synthesize.md`（全文重写）
- Modify: `electron/lib/job-briefing.ts`（`generateJobBriefing` 重写；删除 `buildTavilyQueries`、`searchJobsForCompany`）
- Test: `tests/job-briefing.test.ts`（删除 `buildTavilyQueries` 相关测试）

- [ ] **Step 1: 删除旧测试**

在 `tests/job-briefing.test.ts` 中删除整个 `it('builds Tavily queries with enabled companies only', ...)` 用例，并从顶部 import 中移除 `buildTavilyQueries`。

- [ ] **Step 2: 重写 synthesize.md**

将 `electron/prompts/job-briefing/synthesize.md` 全文替换为：

```markdown
# 求职简报综合生成

你正在为一位关注国内 AI 产品岗位的求职者生成每日求职简报。简报围绕「今日新动态」展开：先讲今天谁有动作，再讲这些动作里什么岗位最适合这位求职者，最后讲针对这些岗位该准备什么面试题。四个板块必须构成一条连贯的叙事线。

求职者背景：
{{profile}}

今日新动态（JSON）：

```json
{{eventsJson}}
```

匹配岗位（JSON，含 matchLevel 1-5 与 matchReason、可选 sourceEventTitle）：

```json
{{jobsJson}}
```

高频面试问题（JSON）：

```json
{{questionsJson}}
```

要求：
1. 输出为 Markdown，不要 JSON，不要代码块包裹正文。
2. 正文必须包含以下四个二级标题，顺序固定；某板块输入为空时保留标题并只写一行「本期暂无」：
   - `## 今日新动态`
   - `## 与你最适配的岗位`
   - `## 高频考察问题`
   - `## 趋势解读`
3. `## 今日新动态` 下按日期倒序列出每条动态（日期未知的排最后），每条格式：
   - `**[事件类型] 公司** · 日期 — 摘要`
   - 下一行缩进两个空格写 `[原文链接](url)`
4. `## 与你最适配的岗位` 下按 matchLevel 降序，每个岗位使用三级标题：
   `### [★★★★☆] 公司 · 岗位`（星数 = matchLevel，★ 实心、☆ 空心）
   然后依次列出：
   - **城市**: ...
   - **源自**: [事件类型] 公司 · 事件标题（今日新动态）—— 仅当岗位数据有 sourceEventTitle 时；否则写 `- **源自**: 关注列表常规检索`
   - **JD 要点**: ...（每个要点单独一行，均以 `- **JD 要点**: ` 开头）
   - **为什么适合你**: 使用岗位数据中的 matchReason，可润色不可编造
   - **来源**: [投递链接](url)
   - 最后单独一段 `> 💭 **准备建议**: ...`（结合 JD 与候选人背景给 1-2 句建议）
   若求职者背景为「未提供」：三级标题改为 `### [推荐] 公司 · 岗位`，字段名 `为什么适合你` 改为 `岗位亮点`。
5. `## 高频考察问题` 下用有序列表，每题格式：
   `1. **问题**（frequency · 公司A/公司B · [原文](url)）`
   下一行缩进三个空格写 `- 考察意图: ...`
   再下一行缩进三个空格写 `- 准备要点: ...`
6. `## 趋势解读` 下用 2-3 个段落，必须引用本期新动态与岗位中的具体信号（公司名、事件名、岗位要求关键词），禁止通用行业套话。
7. 所有 URL 使用标准 markdown 链接 `[text](url)`；禁止输出裸 URL。
8. 禁止输出装饰性标题（"Vol."、"档案编号"、"Generated by" 等）。
9. 输入 JSON 中没有的信息不要编造；公司名、链接必须与输入一致。
```

- [ ] **Step 3: 重构 generateJobBriefing**

在 `electron/lib/job-briefing.ts` 中：
1. 删除 `buildTavilyQueries` 与 `searchJobsForCompany` 两个函数。
2. 将 `generateJobBriefing` 的签名与函数体完整替换为：

```ts
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
```

- [ ] **Step 4: 运行测试 + 类型检查**

Run: `npx vitest run tests/job-briefing.test.ts`
Expected: PASS
Run: `npx tsc --noEmit`
Expected: 剩余错误只在 `electron/ipc/job-briefing.ts`、`src/store/index.ts`、`src/components/BriefingProgress.tsx`、`src/pages/Briefing.tsx`（后续 Task 修复）；`electron/lib/job-briefing.ts` 不应再有错误。

- [ ] **Step 5: Commit**

```bash
git add electron/lib/job-briefing.ts electron/prompts/job-briefing/synthesize.md tests/job-briefing.test.ts
git commit -m "feat(job-briefing): generateJobBriefing 重构为三级漏斗串行管道 + 叙事线 synthesize prompt"
```

---

### Task 8: IPC handler — profile 注入、E2E mock 更新、缓存 sourceStatus 新 shape

**Files:**
- Modify: `electron/ipc/job-briefing.ts`

- [ ] **Step 1: 修改 import 与 generate 调用**

将 `electron/ipc/job-briefing.ts` 的 import 区改为：

```ts
import fs from 'node:fs'
import path from 'node:path'
import { ipcMain } from 'electron'
import type { AppConfig } from '../env'
import type { JobBriefingResult, JobBriefingConfig, JobCompany, JobErrorCode } from '@shared/index'
import {
  generateJobBriefing,
  discoverCareerPage,
  jobBriefingFilePath,
  jobBriefingDir,
} from '../lib/job-briefing'
import { parseFrontmatter, serializeFrontmatter } from '../lib/frontmatter'
import { getSearchApiKey } from '../lib/credentials'
import { getCurrentState } from './state'
import { normalizeJobProfile } from '../../src/lib/job-briefing-defaults'
```

将真实生成分支（`const config = getConfig()` 起）改为：

```ts
    const config = getConfig()
    const profile = normalizeJobProfile(getCurrentState().jobProfile)
    const llmCtl = new AbortController()
    const llmTimeout = setTimeout(() => llmCtl.abort(), 300_000)

    try {
      const result = await generateJobBriefing(cfg, config, profile, date, {
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
```

- [ ] **Step 2: 缓存命中分支的 sourceStatus 新 shape**

将缓存命中分支中的 sourceStatus 构建改为：

```ts
      let sourceStatus: JobBriefingResult['sourceStatus'] = { events: 'ok', jobs: 'ok', questions: 'ok', official: {} }
      try {
        const parsed = JSON.parse(frontmatter.job_sources ?? '[]')
        const official: Record<string, 'ok' | 'failed'> = {}
        for (const s of parsed) {
          if (s.type === 'official' && s.company) {
            official[s.company] = fs.existsSync(filePath) ? 'ok' : 'failed'
          }
        }
        sourceStatus = { events: 'ok', jobs: 'ok', questions: 'ok', official }
      } catch { /* ignore */ }
```

- [ ] **Step 3: E2E mock 更新**

将 E2E fast path 的 emitProgress 段与 mockContent 替换为：

```ts
      emitProgress('scanning-events', 'MOCK')
      emitProgress('digging-jobs', 'MOCK')
      emitProgress('aggregating-questions', 'MOCK')
      emitProgress('synthesizing', 'MOCK')
      emitProgress('finalizing', 'MOCK')
      const mockContent = `## 今日新动态

- **[秋招开启] 腾讯** · 2026-07-19 — 2027 届秋招正式启动，AI 产品线首批放出模型产品经理等岗位。
  [原文链接](https://example.com/event)

## 与你最适配的岗位

### [★★★★★] 腾讯 · 模型产品经理（校招）
- **城市**: 深圳
- **源自**: [秋招开启] 腾讯 · 2027 届秋招正式启动（今日新动态）
- **JD 要点**: 大模型应用、评测体系搭建
- **为什么适合你**: 你的 RAG 项目经历直接对应 JD 要求。
- **来源**: [投递链接](https://example.com/job)

> 💭 **准备建议**: 复习 RAG 链路拆解。

## 高频考察问题

1. **如何为多解问题确定评测指标？**（高频 · 腾讯模型产品面经 · [原文](https://example.com/mianjing)）
   - 考察意图: 评估候选人的评测体系设计能力。
   - 准备要点: 准备多解问题标注与一致性方案。

## 趋势解读

腾讯秋招开启释放信号：模型产品岗强调评测体系能力。`
```

mock 的 frontmatter 中 `companies: ['腾讯']` 保持不变；mock 返回值的 sourceStatus 改为：

```ts
        sourceStatus: { events: 'ok', jobs: 'ok', questions: 'ok', official: { 腾讯: 'ok' } },
```

- [ ] **Step 4: 类型检查**

Run: `npx tsc --noEmit -p tsconfig.node.json`
Expected: `electron/ipc/job-briefing.ts` 无错误（渲染进程侧错误属后续 Task）。

- [ ] **Step 5: Commit**

```bash
git add electron/ipc/job-briefing.ts
git commit -m "feat(job-briefing): IPC 注入 JobProfile，E2E mock 与缓存 sourceStatus 切换四板块契约"
```

---

### Task 9: Store — jobProfile state 与新阶段初始化

**Files:**
- Modify: `src/store/index.ts:12`（import）、`:157` 附近（接口）、`:331` 附近（默认值）、`:356` 附近（state 加载映射）、`:523-544`（generateJobBriefing）、`:556` 附近（新 action）

- [ ] **Step 1: import 与接口**

`src/store/index.ts` 第 12 行的 type import 追加 `JobProfile`；文件顶部追加默认值 import（与现有 `DEFAULT_JOB_BRIEFING_CONFIG` import 同处）：

```ts
import { DEFAULT_JOB_PROFILE } from '@/lib/job-briefing-defaults'
```

在接口中 `jobBriefingConfig: JobBriefingConfig` 一行之后插入：

```ts
  jobProfile: JobProfile
  updateJobProfile: (profile: JobProfile) => Promise<void>
```

- [ ] **Step 2: 初始值与 state 加载**

在初始 state（`jobBriefingConfig: DEFAULT_JOB_BRIEFING_CONFIG,` 附近）插入：

```ts
  jobProfile: DEFAULT_JOB_PROFILE,
```

在 state 加载映射（`jobBriefingConfig: state.jobBriefingConfig ?? DEFAULT_JOB_BRIEFING_CONFIG,` 附近）插入：

```ts
      jobProfile: state.jobProfile ?? DEFAULT_JOB_PROFILE,
```

- [ ] **Step 3: generateJobBriefing 阶段初始化更新**

将 `set({ jobBriefing: { result: null, loading: true, error: null }, briefingStage: 'discovering' })` 改为：

```ts
    set({ jobBriefing: { result: null, loading: true, error: null }, briefingStage: 'scanning-events' })
```

- [ ] **Step 4: updateJobProfile action**

在 `setJobBriefingConfig` action 之后插入：

```ts
  updateJobProfile: async (profile) => {
    const stamped = { ...profile, updatedAt: new Date().toISOString() }
    set({ jobProfile: stamped })
    await ipc.patchState({ jobProfile: stamped } as Partial<StateJson>)
  },
```

- [ ] **Step 5: 运行 store 相关测试**

Run: `npx vitest run tests/briefing.test.ts tests/briefing-page.test.tsx`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/store/index.ts
git commit -m "feat(job-briefing): store 增加 jobProfile/updateJobProfile，生成阶段切换漏斗命名"
```

---

### Task 10: BriefingProgress 漏斗阶段文案

**Files:**
- Modify: `src/components/BriefingProgress.tsx:12-18`
- Test: `tests/briefing-progress.test.tsx`

- [ ] **Step 1: 更新 JOB_STAGES**

将 `JOB_STAGES` 替换为：

```ts
const JOB_STAGES: { key: BriefingStage; label: string }[] = [
  { key: 'scanning-events', label: '正在扫描今日新动态…' },
  { key: 'digging-jobs', label: '正在深挖焦点岗位…' },
  { key: 'aggregating-questions', label: '正在聚合面经高频问题…' },
  { key: 'synthesizing', label: '正在综合生成求职简报…' },
  { key: 'finalizing', label: '正在归档…' },
]
```

- [ ] **Step 2: 检查并更新既有测试**

Run: `npx vitest run tests/briefing-progress.test.tsx`
Expected: 若该测试引用旧 stage key（discovering/scraping/searching）则失败 —— 将测试中的旧 key 替换为 `scanning-events` / `digging-jobs` / `aggregating-questions`（label 断言同步改为新文案）。若不引用旧 key，应直接 PASS。

- [ ] **Step 3: Commit**

```bash
git add src/components/BriefingProgress.tsx tests/briefing-progress.test.tsx
git commit -m "feat(job-briefing): 进度阶段文案切换为三级漏斗"
```

---

### Task 11: JobBriefingRenderer 重写（四板块解析与渲染）

**Files:**
- Modify: `src/components/job-briefing/JobBriefingRenderer.tsx`（全文重写）
- Test: `tests/job-briefing-layout.test.tsx`（全文重写）

- [ ] **Step 1: 写失败测试**

将 `tests/job-briefing-layout.test.tsx` 全文替换为：

```tsx
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { JobBriefingRenderer } from '../src/components/job-briefing/JobBriefingRenderer'

const CONTENT = `## 今日新动态

- **[秋招开启] 腾讯** · 2026-07-19 — 2027 届秋招正式启动，AI 产品线首批放出模型产品经理等岗位。
  [原文链接](https://example.com/event)
- **[线下活动] 字节跳动** · — AI 产品经理闭门分享会，北京。
  [原文链接](https://example.com/event2)

## 与你最适配的岗位

### [★★★★★] 腾讯 · 模型产品经理（校招）
- **城市**: 深圳
- **源自**: [秋招开启] 腾讯 · 2027 届秋招正式启动（今日新动态）
- **JD 要点**: 大模型应用、评测体系搭建
- **为什么适合你**: 你的 RAG 项目经历直接对应 JD 要求。
- **来源**: [投递链接](https://example.com/job)

> 💭 **准备建议**: 复习 RAG 链路拆解。

### [推荐] 百度 · AI产品经理
- **城市**: 北京
- **源自**: 关注列表常规检索
- **JD 要点**: 搜索 AI 化
- **岗位亮点**: 大厂核心搜索业务。
- **来源**: [投递链接](https://example.com/job2)

## 高频考察问题

1. **如何为多解问题确定评测指标？**（高频 · 腾讯模型产品面经 · [原文](https://example.com/mj1)）
   - 考察意图: 评估评测体系设计能力。
   - 准备要点: 准备标注一致性方案。
2. **如何搭建自动化测试链路？**（出现多次 · 字节/百度 · [原文](https://example.com/mj2)）
   - 考察意图: 评估工程化思维。
   - 准备要点: 准备 CI 接入案例。

## 趋势解读

腾讯秋招开启释放信号：模型产品岗强调评测体系能力。`

function renderAcademic(content = CONTENT) {
  return render(<JobBriefingRenderer content={content} theme="academic" fontSize="base" />)
}

describe('JobBriefingRenderer four sections', () => {
  it('renders events timeline with type badge and link', () => {
    renderAcademic()
    const events = screen.getAllByTestId('job-briefing-event')
    expect(events).toHaveLength(2)
    expect(events[0]).toHaveTextContent('秋招开启')
    expect(events[0]).toHaveTextContent('腾讯')
    expect(events[0]).toHaveTextContent('2026-07-19')
    const link = events[0].querySelector('a')
    expect(link).toHaveAttribute('href', 'https://example.com/event')
    expect(link).toHaveAttribute('target', '_blank')
    expect(link).toHaveAttribute('rel', expect.stringContaining('noopener'))
  })

  it('renders job cards with match stars, origin and match reason', () => {
    renderAcademic()
    const cards = screen.getAllByTestId('job-briefing-card')
    expect(cards).toHaveLength(2)
    expect(cards[0]).toHaveTextContent('★★★★★')
    expect(cards[0]).toHaveTextContent('为什么适合你')
    expect(cards[0]).toHaveTextContent('准备建议')
    // 源自今日新动态的卡片有溯源标注
    expect(cards[0].querySelector('[data-testid="job-card-origin"]')).toHaveAttribute('data-today', 'true')
    // 常规检索的卡片不高亮
    expect(cards[1].querySelector('[data-testid="job-card-origin"]')).toHaveAttribute('data-today', 'false')
    expect(cards[1]).toHaveTextContent('岗位亮点')
  })

  it('renders questions as collapsible details', () => {
    renderAcademic()
    const questions = screen.getAllByTestId('job-briefing-question')
    expect(questions).toHaveLength(2)
    expect(questions[0].tagName).toBe('DETAILS')
    expect(questions[0]).toHaveTextContent('如何为多解问题确定评测指标？')
    expect(questions[0]).toHaveTextContent('考察意图')
    expect(questions[0]).toHaveTextContent('准备要点')
  })

  it('renders trends section', () => {
    renderAcademic()
    expect(screen.getByText('趋势解读')).toBeInTheDocument()
    expect(screen.getByText(/模型产品岗强调评测体系能力/)).toBeInTheDocument()
  })

  it('renders 本期暂无 for empty sections without crashing', () => {
    renderAcademic('## 今日新动态\n\n本期暂无\n\n## 与你最适配的岗位\n\n本期暂无\n\n## 高频考察问题\n\n本期暂无\n\n## 趋势解读\n\n本期暂无')
    expect(screen.getAllByText('本期暂无').length).toBeGreaterThan(0)
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npx vitest run tests/job-briefing-layout.test.tsx`
Expected: FAIL（旧渲染器无四板块解析）

- [ ] **Step 3: 全文重写 JobBriefingRenderer**

将 `src/components/job-briefing/JobBriefingRenderer.tsx` 全文替换为：

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

type JobEventItem = {
  eventType: string
  company: string
  date: string
  summary: string
  url?: string
}

type JobCardData = {
  badge: string
  company: string
  title: string
  city?: string
  origin?: string
  originIsToday: boolean
  points: string[]
  matchLabel?: string
  matchReason?: string
  url?: string
  prepTip?: string
}

type QuestionItem = {
  question: string
  meta: string
  url?: string
  intent?: string
  prepTip?: string
}

type Section =
  | { kind: 'events'; title: string; items: JobEventItem[] }
  | { kind: 'jobs'; title: string; items: JobCardData[] }
  | { kind: 'questions'; title: string; items: QuestionItem[] }
  | { kind: 'trends'; title: string; lines: string[] }
  | { kind: 'unknown'; lines: string[] }

function parseEvents(lines: string[]): JobEventItem[] {
  const items: JobEventItem[] = []
  let current: JobEventItem | null = null
  for (const raw of lines) {
    const line = raw.trim()
    const head = line.match(/^-\s*\*\*\[(.+?)\]\s*(.+?)\*\*\s*(.*)$/)
    if (head) {
      if (current) items.push(current)
      const rest = head[3]
      const parts = rest.split(/[·—]/).map(s => s.trim()).filter(Boolean)
      let date = ''
      const summaryParts: string[] = []
      for (const p of parts) {
        if (!date && /\d{4}[-/年]\d{1,2}/.test(p)) date = p
        else summaryParts.push(p)
      }
      current = {
        eventType: head[1].trim(),
        company: head[2].trim(),
        date,
        summary: summaryParts.join(' · '),
      }
      continue
    }
    const link = line.match(/^\[(?:原文链接|原文)\]\((https?:\/\/[^\s)]+)\)$/)
    if (link && current) current.url = link[1]
  }
  if (current) items.push(current)
  return items
}

function parseJobs(lines: string[]): JobCardData[] {
  const jobs: JobCardData[] = []
  let current: JobCardData | null = null
  for (const raw of lines) {
    const line = raw.trim()
    const header = line.match(/^###\s*\[(.+?)\]\s*(.+?)\s*·\s*(.+)$/)
    if (header) {
      if (current) jobs.push(current)
      current = {
        badge: header[1].trim(),
        company: header[2].trim(),
        title: header[3].trim(),
        originIsToday: false,
        points: [],
      }
      continue
    }
    if (!current) continue

    const field = line.match(/^-\s*\*\*(.+?)\*\*:\s*(.+)$/)
    if (field) {
      const name = field[1]
      const value = field[2]
      if (name.includes('城市')) current.city = value.trim()
      else if (name.includes('源自')) {
        current.origin = value.trim()
        current.originIsToday = value.includes('今日新动态')
      } else if (name.includes('JD 要点') || name.includes('JD要点')) {
        current.points.push(value.trim())
      } else if (name.includes('为什么适合你') || name.includes('岗位亮点')) {
        current.matchLabel = name.trim()
        current.matchReason = value.trim()
      } else if (name.includes('来源')) {
        const link = value.match(/\((https?:\/\/[^\s)]+)\)/)
        current.url = link ? link[1] : value.trim()
      }
      continue
    }

    const tacit = line.match(/^>\s*💭\s*\*\*(?:准备建议|默会知识)\*\*:\s*(.+)$/)
    if (tacit) current.prepTip = tacit[1].trim()
  }
  if (current) jobs.push(current)
  return jobs
}

function parseQuestions(lines: string[]): QuestionItem[] {
  const items: QuestionItem[] = []
  let current: QuestionItem | null = null
  for (const raw of lines) {
    const line = raw.trim()
    const head = line.match(/^\d+[.、]\s*\*\*(.+?)\*\*\s*[（(](.+)[)）]\s*$/)
    if (head) {
      if (current) items.push(current)
      const meta = head[2]
      const link = meta.match(/\[原文\]\((https?:\/\/[^\s)]+)\)/)
      current = {
        question: head[1].trim(),
        meta: meta.replace(/·?\s*\[原文\]\(https?:\/\/[^\s)]+\)/, '').trim(),
        url: link?.[1],
      }
      continue
    }
    const intent = line.match(/^-\s*考察意图[:：]\s*(.+)$/)
    if (intent && current) { current.intent = intent[1].trim(); continue }
    const tip = line.match(/^-\s*准备要点[:：]\s*(.+)$/)
    if (tip && current) current.prepTip = tip[1].trim()
  }
  if (current) items.push(current)
  return items
}

function parseSections(content: string): Section[] {
  const rawSections = content.split(/^## /m).slice(1)
  const sections: Section[] = []

  for (const raw of rawSections) {
    const [titleLine, ...bodyLines] = raw.split('\n')
    const title = titleLine.trim()

    if (title.includes('今日新动态')) {
      sections.push({ kind: 'events', title, items: parseEvents(bodyLines) })
    } else if (title.includes('最适配的岗位')) {
      sections.push({ kind: 'jobs', title, items: parseJobs(bodyLines) })
    } else if (title.includes('高频考察问题')) {
      sections.push({ kind: 'questions', title, items: parseQuestions(bodyLines) })
    } else if (title.includes('趋势解读')) {
      sections.push({ kind: 'trends', title, lines: bodyLines })
    } else {
      sections.push({ kind: 'unknown', lines: [titleLine, ...bodyLines] })
    }
  }

  return sections
}

function ExternalLink({ href, label = '原文链接' }: { href: string; label?: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="underline decoration-ember/60 hover:text-ember"
      onClick={(e) => e.stopPropagation()}
    >
      {label}
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

  const renderSectionTitle = (title: string) => (
    <h2
      className={`text-2xl mb-6 border-b pb-2 ${sectionTitle}`}
      style={{ fontSize: headingStyle.size, fontWeight: headingStyle.weight }}
    >
      {title}
    </h2>
  )

  return (
    <div
      className={`max-w-3xl mx-auto space-y-8 ${pageClass}`}
      style={{ fontSize: bodyStyle.size, fontWeight: bodyStyle.weight }}
    >
      {sections.map((section, idx) => {
        if (section.kind === 'events') {
          return (
            <section key={idx}>
              {renderSectionTitle(section.title)}
              {section.items.length === 0 ? (
                <p className="opacity-60">本期暂无</p>
              ) : (
                <div className="space-y-4">
                  {section.items.map((ev, i) => (
                    <div
                      key={i}
                      data-testid="job-briefing-event"
                      className={`pl-4 border-l-2 ${isAcademic ? 'border-ember/50' : 'border-[#d97757]'}`}
                    >
                      <div className="flex flex-wrap items-baseline gap-2 mb-1">
                        <span className="text-xs px-2 py-0.5 rounded bg-ember/20 text-ember">{ev.eventType}</span>
                        <span className="font-semibold">{ev.company}</span>
                        {ev.date && <span className="text-sm opacity-60">{ev.date}</span>}
                      </div>
                      {ev.summary && <p className="text-sm opacity-90 mb-1">{ev.summary}</p>}
                      {ev.url && (
                        <div className="text-sm">
                          <ExternalLink href={ev.url} />
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </section>
          )
        }

        if (section.kind === 'jobs') {
          return (
            <section key={idx}>
              {renderSectionTitle(section.title)}
              {section.items.length === 0 ? (
                <p className="opacity-60">本期暂无</p>
              ) : (
                <div className="space-y-4">
                  {section.items.map((job, j) => (
                    <article key={j} className={`rounded-lg border p-4 ${cardBg}`} data-testid="job-briefing-card">
                      <div className="flex items-center gap-2 mb-2">
                        {job.badge.includes('★') ? (
                          <span className="tracking-widest text-ember">{job.badge}</span>
                        ) : (
                          <span className="text-xs px-2 py-0.5 rounded bg-ember/20 text-ember">{job.badge}</span>
                        )}
                        <h3 className="font-semibold">{job.company} · {job.title}</h3>
                      </div>
                      <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm opacity-80 mb-3">
                        {job.city && <span>城市：{job.city}</span>}
                      </div>
                      {job.origin && (
                        <div
                          data-testid="job-card-origin"
                          data-today={job.originIsToday ? 'true' : 'false'}
                          className={`text-sm mb-3 ${job.originIsToday ? 'text-ember' : 'opacity-60'}`}
                        >
                          源自：{job.origin}
                        </div>
                      )}
                      {job.points.length > 0 && (
                        <ul className="list-disc list-inside text-sm space-y-1 mb-3 opacity-90">
                          {job.points.map((p, i) => <li key={i}>{p}</li>)}
                        </ul>
                      )}
                      {job.matchReason && (
                        <p className="text-sm mb-3">
                          <span className="font-semibold">{job.matchLabel ?? '为什么适合你'}：</span>
                          {job.matchReason}
                        </p>
                      )}
                      {job.url && (
                        <div className="text-sm mb-2">
                          来源：<ExternalLink href={job.url} label="投递链接" />
                        </div>
                      )}
                      {job.prepTip && (
                        <blockquote className="border-l-2 border-ember pl-3 text-sm italic opacity-80">
                          💭 准备建议：{job.prepTip}
                        </blockquote>
                      )}
                    </article>
                  ))}
                </div>
              )}
            </section>
          )
        }

        if (section.kind === 'questions') {
          return (
            <section key={idx}>
              {renderSectionTitle(section.title)}
              {section.items.length === 0 ? (
                <p className="opacity-60">本期暂无</p>
              ) : (
                <div className="space-y-3">
                  {section.items.map((q, i) => (
                    <details key={i} data-testid="job-briefing-question" className={`rounded-lg border p-4 ${cardBg}`}>
                      <summary className="cursor-pointer font-semibold">
                        {i + 1}. {q.question}
                        {q.meta && <span className="ml-2 text-xs opacity-60 font-normal">{q.meta}</span>}
                      </summary>
                      <div className="mt-3 space-y-2 text-sm">
                        {q.intent && <p><span className="font-semibold">考察意图：</span>{q.intent}</p>}
                        {q.prepTip && <p><span className="font-semibold">准备要点：</span>{q.prepTip}</p>}
                        {q.url && <p><ExternalLink href={q.url} label="原文" /></p>}
                      </div>
                    </details>
                  ))}
                </div>
              )}
            </section>
          )
        }

        if (section.kind === 'trends') {
          const text = section.lines.join('\n').trim()
          return (
            <section key={idx}>
              {renderSectionTitle(section.title)}
              <div className={`pl-4 border-l-4 prose prose-invert max-w-none ${isAcademic ? 'border-ember/60' : 'border-[#d97757]'}`}>
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{text}</ReactMarkdown>
              </div>
            </section>
          )
        }

        return (
          <section key={idx}>
            <div className="prose prose-invert max-w-none">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                {section.lines.join('\n')}
              </ReactMarkdown>
            </div>
          </section>
        )
      })}
    </div>
  )
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `npx vitest run tests/job-briefing-layout.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/job-briefing/JobBriefingRenderer.tsx tests/job-briefing-layout.test.tsx
git commit -m "feat(job-briefing): 渲染器重写——新动态时间线/适配岗位溯源卡/可折叠高频问题"
```

---

### Task 12: Briefing 页面 — sourceStatus 新 shape + 空档案提示条 + Header 标签

**Files:**
- Modify: `src/pages/Briefing.tsx:139-145`（sourceStatus 传递）、`:237-241`（jobResult 分支）
- Modify: `src/components/BriefingHeader.tsx:39-44`（knownLabels）
- Test: `tests/briefing-header.test.tsx`、`tests/briefing-page.test.tsx`

- [ ] **Step 1: BriefingHeader knownLabels 增加三级标签**

在 `src/components/BriefingHeader.tsx` 的 `knownLabels` 中追加三个键：

```ts
  const knownLabels: Record<string, string> = {
    x: 'X',
    blogs: '博客',
    podcasts: '播客',
    tavily: 'Tavily',
    events: '新动态',
    jobs: '岗位检索',
    questions: '面经聚合',
  }
```

- [ ] **Step 2: Briefing.tsx sourceStatus 展平**

将 `Briefing.tsx` 中 job 分支的 sourceStatus 传递（`{ ...jobResult.sourceStatus.official, tavily: jobResult.sourceStatus.tavily }`）改为：

```ts
                ? { ...jobResult.sourceStatus.official, events: jobResult.sourceStatus.events, jobs: jobResult.sourceStatus.jobs, questions: jobResult.sourceStatus.questions }
```

- [ ] **Step 3: 空档案提示条**

`Briefing.tsx` 顶部 import 追加：

```ts
import { isJobProfileEmpty } from '@/lib/job-briefing-defaults'
```

组件内新增（与其他 useState 同处）：

```ts
  const jobProfile = useStore((s) => s.jobProfile)
  const goto = useStore((s) => s.goto)
  const [profileHintDismissed, setProfileHintDismissed] = useState(false)
```

在 `jobResult` 分支的 `<main ...>` 内、`<JobBriefingRenderer ... />` 之前插入：

```tsx
                  {isJobProfileEmpty(jobProfile) && !profileHintDismissed && (
                    <div
                      data-testid="job-briefing-profile-hint"
                      className={`max-w-3xl mx-auto mb-6 flex items-center gap-3 rounded-lg border px-4 py-3 text-sm ${
                        isAcademic ? 'border-ember/40 bg-ember/10 text-parchment' : 'border-[#d97757]/40 bg-[#d97757]/10 text-[#1a1a1a]'
                      }`}
                    >
                      <span className="flex-1">完善求职档案（意向岗位、方向、经历）以获得个性化岗位适配与高频问题。</span>
                      <button
                        data-testid="job-briefing-profile-hint-goto"
                        onClick={() => goto('settings')}
                        className="shrink-0 px-3 py-1 rounded bg-ember text-white text-xs hover:bg-ember/90"
                      >
                        去设置
                      </button>
                      <button
                        data-testid="job-briefing-profile-hint-dismiss"
                        onClick={() => setProfileHintDismissed(true)}
                        className="shrink-0 text-xs opacity-60 hover:opacity-100"
                        aria-label="关闭提示"
                      >
                        ✕
                      </button>
                    </div>
                  )}
                  <JobBriefingRenderer content={jobResult.content} theme={theme} fontSize={fontSize} />
```

（注意：删除原分支里单独一行的 `<JobBriefingRenderer ... />`，合并进上述结构。）

- [ ] **Step 4: 运行页面/Header 测试**

Run: `npx vitest run tests/briefing-header.test.tsx tests/briefing-page.test.tsx`
Expected: PASS；若有旧 sourceStatus shape（`tavily` 键）断言失败，按新 shape（`events`/`jobs`/`questions`）更新断言。

- [ ] **Step 5: Commit**

```bash
git add src/pages/Briefing.tsx src/components/BriefingHeader.tsx tests/
git commit -m "feat(job-briefing): Header 暴露三级失败源，空档案时显示完善档案提示条"
```

---

### Task 13: Settings 页 — 求职档案面板

**Files:**
- Modify: `src/pages/Settings.tsx:9`（import）、`:34` 附近（state）、`:52-54`（加载）、`:168` 附近（保存 handler）、`:351` 之前（新面板）

- [ ] **Step 1: import 与 state**

`Settings.tsx` 第 7 行 import 改为：

```ts
import { DEFAULT_JOB_BRIEFING_CONFIG, DEFAULT_JOB_PROFILE } from '@/lib/job-briefing-defaults'
```

第 9 行 type import 追加 `JobProfile`：

```ts
import type { JobBriefingConfig, JobCompany, JobProfile } from '@shared/index'
```

在 `const [jobConfigSaving, setJobConfigSaving] = useState(false)` 之后插入：

```ts
  const [jobProfile, setJobProfile] = useState<JobProfile>(DEFAULT_JOB_PROFILE)
  const [jobProfileSaving, setJobProfileSaving] = useState(false)
```

- [ ] **Step 2: 加载与保存**

将 `useEffect` 中的 `ipc.getState()` 回调改为同时加载档案：

```ts
    ipc.getState()
      .then(state => {
        if (!mounted) return
        setJobConfig(state.jobBriefingConfig ?? DEFAULT_JOB_BRIEFING_CONFIG)
        setJobProfile(state.jobProfile ?? DEFAULT_JOB_PROFILE)
      })
      .catch(err => { if (mounted) setError(err.message || '读取求职简报配置失败') })
```

在 `handleSaveJobConfig` 之后插入：

```ts
  const handleSaveJobProfile = async () => {
    setJobProfileSaving(true)
    try {
      await useStore.getState().updateJobProfile(jobProfile)
      showToast('求职档案已保存')
    } catch (err: any) {
      setError(err.message || '保存求职档案失败')
    } finally {
      setJobProfileSaving(false)
    }
  }
```

- [ ] **Step 3: 新增面板 JSX**

在 `{/* 求职简报 */}` 面板**之前**插入：

```tsx
              {/* 求职档案 */}
              <div className="bg-parchment/5 border border-slate/20 rounded-lg p-4 mb-4">
                <h3 className="text-ember font-semibold mb-4">求职档案</h3>

                <div className="space-y-4">
                  <div>
                    <div className="text-[11px] text-parchment/60 font-sans mb-1">意向岗位（逗号分隔）</div>
                    <input
                      data-testid="settings-jobprofile-target-roles"
                      type="text"
                      value={jobProfile.targetRoles.join('，')}
                      onChange={e => setJobProfile(prev => ({ ...prev, targetRoles: e.target.value.split(/[,，]/).map(s => s.trim()).filter(Boolean) }))}
                      placeholder="模型产品经理，AI产品经理"
                      className="w-full bg-ink/50 border border-slate/40 rounded-md px-3 py-2 text-sm text-parchment placeholder:text-parchment/30 focus:outline-none focus:border-ember/60"
                    />
                  </div>

                  <div>
                    <div className="text-[11px] text-parchment/60 font-sans mb-1">方向描述（如：大模型/Agent 产品，偏评测与平台）</div>
                    <input
                      data-testid="settings-jobprofile-direction"
                      type="text"
                      value={jobProfile.direction}
                      onChange={e => setJobProfile(prev => ({ ...prev, direction: e.target.value }))}
                      className="w-full bg-ink/50 border border-slate/40 rounded-md px-3 py-2 text-sm text-parchment placeholder:text-parchment/30 focus:outline-none focus:border-ember/60"
                    />
                  </div>

                  <div>
                    <div className="text-[11px] text-parchment/60 font-sans mb-1">技能清单（逗号分隔）</div>
                    <input
                      data-testid="settings-jobprofile-skills"
                      type="text"
                      value={jobProfile.skills.join('，')}
                      onChange={e => setJobProfile(prev => ({ ...prev, skills: e.target.value.split(/[,，]/).map(s => s.trim()).filter(Boolean) }))}
                      placeholder="提示词工程，RAG，数据分析"
                      className="w-full bg-ink/50 border border-slate/40 rounded-md px-3 py-2 text-sm text-parchment placeholder:text-parchment/30 focus:outline-none focus:border-ember/60"
                    />
                  </div>

                  <div>
                    <div className="text-[11px] text-parchment/60 font-sans mb-1">经历摘要（项目 / 实习 / 学历）</div>
                    <textarea
                      data-testid="settings-jobprofile-experience"
                      rows={4}
                      value={jobProfile.experience}
                      onChange={e => setJobProfile(prev => ({ ...prev, experience: e.target.value }))}
                      className="w-full bg-ink/50 border border-slate/40 rounded-md px-3 py-2 text-sm text-parchment placeholder:text-parchment/30 focus:outline-none focus:border-ember/60"
                    />
                  </div>

                  <div>
                    <div className="text-[11px] text-parchment/60 font-sans mb-1">补充说明（如：只要北上深）</div>
                    <textarea
                      data-testid="settings-jobprofile-notes"
                      rows={2}
                      value={jobProfile.additionalNotes}
                      onChange={e => setJobProfile(prev => ({ ...prev, additionalNotes: e.target.value }))}
                      className="w-full bg-ink/50 border border-slate/40 rounded-md px-3 py-2 text-sm text-parchment placeholder:text-parchment/30 focus:outline-none focus:border-ember/60"
                    />
                  </div>

                  <div className="flex flex-wrap gap-3">
                    <Button data-testid="settings-jobprofile-save" onClick={handleSaveJobProfile} disabled={jobProfileSaving}>
                      保存求职档案
                    </Button>
                  </div>
                </div>
              </div>

```

- [ ] **Step 4: 类型检查 + 相关测试**

Run: `npx tsc --noEmit`
Expected: PASS（Task 1 遗留的全部类型错误至此应清零；若仍有错误，按报错文件补齐前文 Task 的遗漏步骤）
Run: `npx vitest run tests/briefing-page.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/pages/Settings.tsx
git commit -m "feat(job-briefing): Settings 新增求职档案面板（五字段 + 保存）"
```

---

### Task 14: E2E — mock 链路断言更新

**Files:**
- Modify: `e2e/helpers/selectors.ts:133-136`
- Modify: `e2e/specs/job-briefing-generation.spec.ts`

- [ ] **Step 1: selectors 更新**

将 `e2e/helpers/selectors.ts` 中 briefing 段的 `jobCard`/`jobSkillRow` 两行替换为：

```ts
    jobCard: '[data-testid="job-briefing-card"]',
    jobEvent: '[data-testid="job-briefing-event"]',
    jobQuestion: '[data-testid="job-briefing-question"]',
```

（`jobSkillRow` 删除——新契约无技能雷达，该选择器由本次改动孤儿化。）

- [ ] **Step 2: spec 断言更新**

将 `e2e/specs/job-briefing-generation.spec.ts` 中「Mock pipeline returns...」注释到「趋势解读」断言之间的内容替换为：

```ts
    // Mock pipeline returns one event, one job card, one question, and a trends section.
    await window.locator(SELECTORS.briefing.jobCard).first().waitFor({ timeout: 30000 })
    await expect(window.locator(SELECTORS.briefing.jobEvent)).toHaveCount(1)
    await expect(window.locator(SELECTORS.briefing.jobCard)).toHaveCount(1)
    await expect(window.locator(SELECTORS.briefing.jobQuestion)).toHaveCount(1)
    await expect(window.getByText('今日新动态')).toBeVisible()
    await expect(window.getByText('与你最适配的岗位')).toBeVisible()
    await expect(window.getByText('高频考察问题')).toBeVisible()
    await expect(window.getByText('趋势解读')).toBeVisible()
```

- [ ] **Step 3: 运行 E2E**

Run: `npx playwright test --config e2e/playwright.config.ts job-briefing-generation`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add e2e/helpers/selectors.ts e2e/specs/job-briefing-generation.spec.ts
git commit -m "test(job-briefing): E2E mock 断言切换四板块契约"
```

---

### Task 15: 全量回归 + 真实链路验证迭代（spec 附录 A 存档）

**Files:**
- Modify: `docs/superpowers/specs/2026-07-19-job-briefing-upgrade-design.md`（附录 A）

- [ ] **Step 1: 全量单测 + 类型检查**

Run: `npm run test`
Expected: PASS（全量）
Run: `npx tsc --noEmit && npx tsc --noEmit -p tsconfig.node.json`
Expected: PASS

- [ ] **Step 2: 真实链路生成**

前提：`.env` 有真实 `KIMI_API_KEY`，Tavily key 已配置（Settings 或 `TAVILY_API_KEY`）。

1. 先在 Settings「求职档案」填入用户真实背景并保存（意向岗位：模型产品经理/AI产品经理；方向：大模型/Agent 产品）。
2. `npm run dev` 启动，进入夜航简报 → 求职简报 → 生成求职简报（如已有当天缓存，用「重新生成」/force 路径）。
3. 观察进度阶段依次为：扫描新动态 → 深挖焦点岗位 → 聚合面经 → 综合生成。

- [ ] **Step 3: 按检查表验收渲染结果**

对照 spec §13.4 检查表逐项检查生成的简报（渲染结果 + `{library}/求职简报/求职简报-<today>.md` 源文件）：

1. 新动态含近 7 天事件，事件类型正确，有原文链接。
2. 适配岗位与 JobProfile 相关，溯源标注正确（今日新动态 vs 常规检索）。
3. 高频问题源于求职社区，有考察意图/准备要点/原文链接。
4. 四板块齐全、叙事线连贯（岗位确来自新动态的焦点公司）。
5. 降级路径：人为断掉某级（如临时把某级查询改为必然无结果的词），报告其余板块正常。

- [ ] **Step 4: 迭代并记录**

未通过项 → 调整（查询模板/时间窗/prompt 措辞/解析容错）→ 重新生成验证。每轮在 spec 附录 A 追加记录：

```markdown
### 迭代 N（2026-07-19）
- 输入档案：...
- 发现的问题：...
- 调整：...
- 结果：...
```

- [ ] **Step 5: Commit**

```bash
git add docs/superpowers/specs/2026-07-19-job-briefing-upgrade-design.md
git commit -m "docs(spec): 真实链路验证迭代记录"
```

---

## Self-Review 记录

- **Spec 覆盖**:§5 数据模型 → Task 1/2;§6 搜索层 → Task 3;§7 管道 → Task 4/5/6/7;§8 prompt 契约 → Task 7;§9 渲染 → Task 11;§10 Settings → Task 13;§11 跨层同步 → Task 1/2/8/9/10/12;§12 错误处理 → Task 7(sourceStatus/降级）;§13.1-13.2 测试 → 各 Task TDD + Task 11;§13.3 E2E → Task 14;§13.4 真实链路 → Task 15。官方抓取层衔接（§7 第 2 级 careerPageUrl 并入）→ Task 7 Step 3。`Briefing.tsx` sourceStatus 新 shape(§11 item 8)→ Task 12。
- **类型一致性**:`FocusCompany`/`EventQuery`/`QuestionQuery` 在 Task 4-7 间一致；`normalizeJobProfile`/`formatJobProfile`/`isJobProfileEmpty`/`DEFAULT_JOB_PROFILE` 从 Task 2 统一定义、Task 7/8/9/12/13 引用；stage key `scanning-events`/`digging-jobs`/`aggregating-questions` 在 Task 1/7/8/9/10 一致。
- **已知留白**:Task 10 Step 2 与 Task 12 Step 4 含条件分支（既有测试若引用旧 key 需更新）——这是既有测试内容决定的，执行时按实际断言处理。e2e/README.md 无求职简报 mock 策略描述，无需同步（已核实）。
