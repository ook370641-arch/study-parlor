# 求职简报系统优化 — 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将求职简报生成中的 Tavily 调用从 ~40 降至 3-5 次，LLM 调用从 ~40 降至 5-7 次；求职档案与全局设置解耦；搜索关键词由 LLM 智能生成；文章旁注搜索改用 LLM 生成 query。

**Architecture:** 类型层扩展 → 主进程重构（新函数 + IPC + 搜索策略）→ UI 新建面板 + 集成 → Settings 清理 → 验证。按秋招/实习维度解耦，①②③ 阶段内部并行执行。

**Tech Stack:** Electron 30 + React 18 + TypeScript + Tailwind + Zustand + DeepSeek v4-pro + Tavily Search API

**Spec:** `docs/superpowers/specs/2026-07-25-job-briefing-optimization-design.md`

---

### Task 1: 扩展类型定义

**Files:**
- Modify: `src/types/index.ts` (JobBriefingConfig, JobProfile, IpcApi)
- Modify: `src/lib/job-briefing-defaults.ts` (DEFAULT_JOB_BRIEFING_CONFIG, DEFAULT_JOB_PROFILE, normalizeJobProfile)

- [ ] **Step 1: 扩展 `JobBriefingConfig`**

在 `src/types/index.ts` 的 `JobBriefingConfig` 类型（约第 335 行）中追加 4 个字段：

```typescript
export type JobBriefingConfig = {
  companies: JobCompany[]
  roleKeywords: string[]
  cities: string[]
  skillKeywords: string[]
  // 新增
  eventSearchKeywords: string[]
  jobSearchKeywords: string[]
  searchInternship: boolean
  searchFallRecruit: boolean
}
```

- [ ] **Step 2: 扩展 `JobProfile`**

在 `src/types/index.ts` 的 `JobProfile` 类型（约第 351 行）中追加 `keywordsGeneratedAt`：

```typescript
export type JobProfile = {
  targetRoles: string[]
  direction: string
  skills: string[]
  experience: string
  additionalNotes: string
  updatedAt: string
  // 新增
  keywordsGeneratedAt: string
}
```

- [ ] **Step 3: 新增 IPC 签名**

在 `src/types/index.ts` 的 `IpcApi` 类型（约第 674 行，`jobBriefingDiscoverPages` 附近）追加两个方法签名：

```typescript
jobBriefingGenerateKeywords: (args: {
  profile: JobProfile
}) => Promise<{ ok: true; eventKeywords: string[]; jobKeywords: string[] }
            | { ok: false; code: 'LLM_ERROR' | 'EMPTY_PROFILE'; message: string }>
jobBriefingGenerateArticleSearchQuery: (args: {
  articleContent: string; selection?: string; lastMessage?: string
}) => Promise<{ ok: true; query: string } | { ok: false; code: 'LLM_ERROR'; message: string }>
```

- [ ] **Step 4: 更新默认值**

在 `src/lib/job-briefing-defaults.ts` 的 `DEFAULT_JOB_BRIEFING_CONFIG` 中添加新字段默认值：

```typescript
export const DEFAULT_JOB_BRIEFING_CONFIG: JobBriefingConfig = {
  companies: [ /* 不变 */ ],
  roleKeywords: ['AI产品经理', '大模型产品经理', 'Agent产品经理'],
  cities: ['北京', '上海', '杭州', '深圳'],
  skillKeywords: ['RAG', 'Agent', '提示词工程', '多模态'],
  eventSearchKeywords: [],
  jobSearchKeywords: [],
  searchInternship: false,
  searchFallRecruit: true,
}
```

在 `DEFAULT_JOB_PROFILE` 中追加：

```typescript
export const DEFAULT_JOB_PROFILE: JobProfile = {
  targetRoles: [],
  direction: '',
  skills: [],
  experience: '',
  additionalNotes: '',
  updatedAt: '',
  keywordsGeneratedAt: '',
}
```

在 `normalizeJobProfile()` 中追加：

```typescript
keywordsGeneratedAt: typeof raw?.keywordsGeneratedAt === 'string' ? raw.keywordsGeneratedAt : '',
```

- [ ] **Step 5: TypeScript 编译验证**

```bash
npx tsc --noEmit
```

预期：通过（仅有新增字段的类型检查，无破坏性变更）。

- [ ] **Step 6: Commit**

```bash
git add src/types/index.ts src/lib/job-briefing-defaults.ts
git commit -m "feat(job-briefing): extend types and defaults for optimization"
```

---

### Task 2: 创建 LLM prompt 文件

**Files:**
- Create: `electron/prompts/job-briefing/generate-keywords.md`
- Create: `electron/prompts/job-briefing/generate-search-query.md`

- [ ] **Step 1: 创建关键词生成 prompt**

`electron/prompts/job-briefing/generate-keywords.md`：

```markdown
# 搜索关键词生成

根据以下求职档案，生成两组搜索关键词用于招聘信息搜索。

求职者背景：
{{profile}}

要求：
1. 只输出 JSON（以 { 开头、以 } 结尾）：{"eventKeywords": ["词1", "词2"], "jobKeywords": ["词1", "词2"]}
2. eventKeywords（3-5个）：用于搜索校招/实习动态、宣讲会、招聘事件。简洁（2-8字），覆盖岗位方向+招聘类型
3. jobKeywords（3-5个）：用于搜索具体岗位JD。精确（3-10字），覆盖角色+技能+行业
4. 关键词独立成词，不要连成一句长查询
5. 结合求职者的方向、技能、经历生成针对性关键词；背景为"未提供"时生成通用AI产品关键词
```

- [ ] **Step 2: 创建文章搜索词生成 prompt**

`electron/prompts/job-briefing/generate-search-query.md`：

```markdown
# 搜索查询生成

根据用户的阅读上下文，生成一个简洁有效的网络搜索查询词。

文章内容（截断）：
{{articleContent}}

用户选中的文字：
{{selection}}

用户最后一条消息：
{{lastMessage}}

要求：
1. 只输出搜索查询词（纯文本，不要JSON、不要markdown、不要解释）
2. 查询词不超过15个词
3. 语言跟随文章语言（中文文章输出中文查询，英文文章输出英文查询）
4. 聚焦具体的术语、概念或问题，不要逐字复述选中内容
5. 生成的是搜索引擎查询词，不是对话回复
```

- [ ] **Step 3: Commit**

```bash
git add electron/prompts/job-briefing/generate-keywords.md electron/prompts/job-briefing/generate-search-query.md
git commit -m "feat(job-briefing): add LLM prompts for keyword and search query generation"
```

---

### Task 3: 实现主进程新函数 + 搜索策略重构

**Files:**
- Modify: `electron/lib/job-briefing.ts`

- [ ] **Step 1: 添加 `generateJobBriefingKeywords()` 函数**

在 `electron/lib/job-briefing.ts` 中 `dedupQuestions` 函数之后（约第 442 行之后）添加：

```typescript
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
    thinking: { type: 'disabled' },
    signal: opts.signal,
  })
  const extracted = extractJsonObject(text)
  if (!extracted) throw new Error('KEYWORD_EXTRACTION_ERROR')
  const obj = JSON.parse(extracted)
  return {
    eventKeywords: Array.isArray(obj.eventKeywords) ? obj.eventKeywords.filter((k: unknown): k is string => typeof k === 'string' && k.trim().length > 0).slice(0, 5) : [],
    jobKeywords: Array.isArray(obj.jobKeywords) ? obj.jobKeywords.filter((k: unknown): k is string => typeof k === 'string' && k.trim().length > 0).slice(0, 5) : [],
  }
}
```

- [ ] **Step 2: 添加 `generateArticleSearchQuery()` 函数**

在同一文件中继续添加：

```typescript
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
    thinking: { type: 'disabled' },
  })
  return text.trim()
}
```

- [ ] **Step 3: 重构 `buildEventQueries()` — 按 toggle 生成独立搜索词**

替换原有函数（约第 51-62 行）：

```typescript
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
```

需要同步扩展 `EventQuery` 类型（当前在第 49 行）：

```typescript
export type EventQuery = {
  query: string
  company?: string
  includeDomains?: string[]
  dimension?: 'fallRecruit' | 'internship' | 'general'
}
```

- [ ] **Step 4: 重构 `discoverEvents()` — 并行搜索 + 各自 LLM 提取**

替换原有函数（约第 276-325 行）：

```typescript
export async function discoverEvents(
  cfg: AppConfig,
  config: JobBriefingConfig,
  opts: { apiKey: string; signal?: AbortSignal }
): Promise<{ fallRecruit: JobEvent[]; internship: JobEvent[] }> {
  const today = new Date().toISOString().slice(0, 10)
  const queries = buildEventQueries(config)

  // 并行 Tavily 搜索
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

  // 各自 LLM 提取（thinking=enabled）
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
        thinking: { type: 'enabled' },
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
```

- [ ] **Step 5: 更新 `selectFocusCompanies()` — 合并两个维度的事件**

替换原有函数签名（约第 352 行），改为接收合并后的事件：

```typescript
export function selectFocusCompanies(
  fallRecruitEvents: JobEvent[],
  internshipEvents: JobEvent[],
  config: JobBriefingConfig
): FocusCompany[] {
  const allEvents = [...fallRecruitEvents, ...internshipEvents]
  // ... 其余逻辑不变，用 allEvents 替代原 events 参数
  const enabled = config.companies.filter(c => c.enabled).sort((a, b) => a.priority - b.priority)
  const withEvents: FocusCompany[] = []
  for (const c of enabled) {
    const ev = allEvents.find(e => companyNameMatches(e.company, c.name))
    if (ev) withEvents.push({ name: c.name, eventTitle: ev.title })
  }
  if (withEvents.length > 0) return withEvents
  return enabled.slice(0, 5).map(c => ({ name: c.name }))
}
```

- [ ] **Step 6: 新增 `buildFocusJobQueries()` — 并行岗位搜索**

在同一文件中新增函数：

```typescript
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
```

- [ ] **Step 7: 重构 `discoverQuestions()` — 单次搜索**

简化原有函数（约第 487-512 行）。移除逐公司循环，改为单次搜索：

```typescript
export async function discoverQuestions(
  cfg: AppConfig,
  profile: JobProfile,
  config: JobBriefingConfig,
  opts: { apiKey: string; signal?: AbortSignal }
): Promise<InterviewQuestion[]> {
  const direction = questionDirection(profile, config)
  const query = `${direction} 面经 面试题 高频`

  try {
    return await runQuestionQuery(cfg, query, {
      ...opts,
      includeDomains: [...JOB_COMMUNITY_DOMAINS],
    })
  } catch (err) {
    console.warn(`[job-briefing] question query failed: ${query}`, err)
    return []
  }
}
```

函数签名改为不需要 `focus` 参数。

- [ ] **Step 8: 重构 `generateJobBriefing()` — 主线适配**

更新 `generateJobBriefing()`（约第 514 行开始）。核心变更：

```typescript
export async function generateJobBriefing(
  cfg: AppConfig,
  config: JobBriefingConfig,
  profile: JobProfile,
  date: string,
  opts: { emitProgress?: ...; signal?: ... } = {}
): Promise<JobBriefingResult> {
  const apiKey = process.env.TAVILY_API_KEY || (await getSearchApiKey())
  // ... API key check 不变 ...

  const sourceStatus: JobBriefingSourceStatus = { events: 'ok', jobs: 'ok', questions: 'ok', official: {} }
  const enabledCompanies = config.companies.filter(c => c.enabled).sort((a, b) => a.priority - b.priority)

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

  // 官方页面抓取（仅对有 careerPageUrl 的焦点公司）
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

  // 岗位搜索（并行 Tavily + 各自 LLM 提取）
  const jobQueries = buildFocusJobQueries(focus, profile, config)
  const jobSearchResults = await Promise.all(
    jobQueries.map(q =>
      searchWeb({ query: q.query, apiKey, maxResults: 10, days: 30, signal: opts.signal })
        .then(results => ({ dimension: q.dimension, results }))
        .catch(err => {
          console.warn(`[job-briefing] job search failed for ${q.dimension}`, err)
          return { dimension: q.dimension, results: [] as TavilyResult[] }
        })
    )
  )
  for (const { results } of jobSearchResults) {
    for (const r of results) {
      if (opts.signal?.aborted) break
      try {
        const jobs = await extractJobsFromHtml(cfg, { html: r.content, company: '', url: r.url, source: 'tavily' })
        allJobs.push(...jobs)
      } catch (e) { /* skip failed extraction */ }
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
      matchedJobs = merged.slice(0, 10).map(j => ({
        ...j, matchLevel: 3 as const, matchReason: '',
        sourceEventTitle: focus.find(f => companyNameMatches(f.name, j.company))?.eventTitle,
      }))
    }
  }
  // Diversity cap (不变)
  // ...

  // ── Level 3: 面经问题 ──
  opts.emitProgress?.('aggregating-questions')
  let questions: InterviewQuestion[] = []
  try {
    questions = await discoverQuestions(cfg, profile, config, { apiKey, signal: opts.signal })
  } catch (err) { /* ... */ }
  if (questions.length === 0) sourceStatus.questions = 'failed'

  // ── 综合生成 ──
  opts.emitProgress?.('synthesizing')
  const allEvents = [...fallRecruitEvents, ...internshipEvents]
  const synthesisPrompt = readPrompt('synthesize')
    .replace('{{profile}}', formatJobProfile(profile))
    .replace('{{eventsFallRecruit}}', JSON.stringify(fallRecruitEvents, null, 2))
    .replace('{{eventsInternship}}', JSON.stringify(internshipEvents, null, 2))
    .replace('{{jobsJson}}', JSON.stringify(matchedJobs, null, 2))
    .replace('{{questionsJson}}', JSON.stringify(questions, null, 2))

  // 综合生成（thinking=enabled, high, 独立 300s 计时 - 不变）
  // ...

  // 报告分区逻辑在 synthesize.md prompt 中处理
}
```

**关键变更点**：
- `discoverEvents` 返回 `{ fallRecruit, internship }` 而非单个数组
- 岗位搜索用 `buildFocusJobQueries()` 并行
- `discoverQuestions` 不再需要 `focus` 参数
- 综合 prompt 使用 `{{eventsFallRecruit}}` / `{{eventsInternship}}` 两个变量
- 移除 `discoverCareerPage` 在 generate 流程中的调用

- [ ] **Step 9: 移除 `discoverCareerPage` 导出（可选）**

保留 `discoverCareerPage` 函数（供 `job-briefing:discover-pages` IPC 使用），但不从 `generateJobBriefing` 主线中调用。

- [ ] **Step 10: 更新 `synthesize.md` prompt**

修改 `electron/prompts/job-briefing/synthesize.md`，将 `{{eventsJson}}` 替换为两个独立变量并添加分区指引：

将 prompt 中：
```
今日新动态（JSON）：
```json
{{eventsJson}}
```
```

替换为：
```
今日新动态 — 秋招/校招（JSON）：
```json
{{eventsFallRecruit}}
```

今日新动态 — 实习/提前批（JSON）：
```json
{{eventsInternship}}
```

当两个数组均非空时，「## 今日新动态」下应分子区展示：
### 秋招/校招
### 实习/提前批
仅一个非空时不显示子标题。
```

- [ ] **Step 11: TypeScript 编译验证**

```bash
npx tsc --noEmit
```

预期：通过。修正所有类型错误。

- [ ] **Step 12: Commit**

```bash
git add electron/lib/job-briefing.ts electron/prompts/job-briefing/synthesize.md
git commit -m "feat(job-briefing): refactor search strategy with parallel dimensions"
```

---

### Task 4: 新增 IPC 处理器 + 重构 generate handler

**Files:**
- Modify: `electron/ipc/job-briefing.ts`

- [ ] **Step 1: 添加 `job-briefing:generate-keywords` IPC**

在 `registerJobBriefingIpc()` 函数内（`job-briefing:abort` handler 之前）添加：

```typescript
ipcMain.handle('job-briefing:generate-keywords', async (_, args: { profile: JobProfile }) => {
  const profile = normalizeJobProfile(args.profile)
  if (isJobProfileEmpty(profile)) {
    return { ok: false as const, code: 'EMPTY_PROFILE' as const, message: '求职档案为空，无法生成关键词' }
  }
  try {
    const ctl = new AbortController()
    const timeout = setTimeout(() => ctl.abort(), 60_000)
    try {
      const result = await generateJobBriefingKeywords(cfg, profile, { signal: ctl.signal })
      return { ok: true as const, eventKeywords: result.eventKeywords, jobKeywords: result.jobKeywords }
    } finally {
      clearTimeout(timeout)
    }
  } catch (err: any) {
    return { ok: false as const, code: 'LLM_ERROR' as const, message: err.message || '关键词生成失败' }
  }
})
```

需要新增 import：`import { normalizeJobProfile, isJobProfileEmpty } from '../../src/lib/job-briefing-defaults'`（或复用已有的 import）

- [ ] **Step 2: 添加 `job-briefing:generate-article-search-query` IPC**

同一文件中：

```typescript
ipcMain.handle('job-briefing:generate-article-search-query', async (_, args: {
  articleContent: string; selection?: string; lastMessage?: string
}) => {
  try {
    const query = await generateArticleSearchQuery(cfg, args)
    if (!query) {
      return { ok: false as const, code: 'LLM_ERROR' as const, message: '生成的搜索词为空' }
    }
    return { ok: true as const, query }
  } catch (err: any) {
    return { ok: false as const, code: 'LLM_ERROR' as const, message: err.message || '搜索词生成失败' }
  }
})
```

- [ ] **Step 3: 更新 `job-briefing:generate` handler**

在现有 handler 中（约第 184 行），适配新的 `discoverEvents` 返回值。将：

```typescript
return await generateJobBriefing(cfg, config, profile, date, {
  emitProgress: (stage, detail) => emitProgress(stage, detail),
  signal: genCtl.signal,
})
```

保持不变（`generateJobBriefing` 内部已重构）。

- [ ] **Step 4: TypeScript 编译验证**

```bash
npx tsc --noEmit
```

- [ ] **Step 5: Commit**

```bash
git add electron/ipc/job-briefing.ts
git commit -m "feat(job-briefing): add keyword generation and article search query IPC"
```

---

### Task 5: 更新 preload 暴露新 IPC

**Files:**
- Modify: `electron/preload.ts`

- [ ] **Step 1: 添加 preload 方法**

在 `electron/preload.ts` 的 `api` 对象中（约第 100-104 行，`jobBriefingAbort` 之后）添加：

```typescript
jobBriefingGenerateKeywords: (args: { profile: JobProfile }) =>
  ipcRenderer.invoke('job-briefing:generate-keywords', args),
jobBriefingGenerateArticleSearchQuery: (args: { articleContent: string; selection?: string; lastMessage?: string }) =>
  ipcRenderer.invoke('job-briefing:generate-article-search-query', args),
```

需要确认 `JobProfile` 类型已从 `@shared/index` 导入。

- [ ] **Step 2: 更新 IPC facade**

在 `src/lib/ipc.ts` 中添加对应的 lazy getter（约第 75-79 行，现有 jobBriefing 方法之后）：

```typescript
get jobBriefingGenerateKeywords() {
  return (args: { profile: import('@shared/index').JobProfile }) =>
    this.invoke('job-briefing:generate-keywords', args)
},
get jobBriefingGenerateArticleSearchQuery() {
  return (args: { articleContent: string; selection?: string; lastMessage?: string }) =>
    this.invoke('job-briefing:generate-article-search-query', args)
},
```

- [ ] **Step 3: Commit**

```bash
git add electron/preload.ts src/lib/ipc.ts
git commit -m "feat(job-briefing): expose keyword generation and search query IPC via preload"
```

---

### Task 6: 更新 Store

**Files:**
- Modify: `src/store/index.ts`

- [ ] **Step 1: 添加 `generateJobBriefingKeywords` action**

在 store 类型 `AppStore` 中添加（约第 802 行，`setJobBriefingConfig` 附近）：

```typescript
generateJobBriefingKeywords: () => Promise<void>
```

实现（在 `setJobBriefingConfig` 之后）：

```typescript
generateJobBriefingKeywords: async () => {
  const profile = get().jobProfile
  if (isJobProfileEmpty(profile)) {
    get().showToast('请先完善求职档案')
    return
  }
  try {
    const result = await ipc.jobBriefingGenerateKeywords({ profile })
    if (result.ok) {
      const config = {
        ...get().jobBriefingConfig,
        eventSearchKeywords: result.eventKeywords,
        jobSearchKeywords: result.jobKeywords,
      }
      await get().setJobBriefingConfig(config)
      await get().updateJobProfile({
        ...profile,
        keywordsGeneratedAt: new Date().toISOString(),
      })
      get().showToast('搜索关键词已更新')
    } else {
      get().showToast(result.message)
    }
  } catch (err: any) {
    get().showToast('生成搜索关键词失败: ' + (err.message || '未知错误'))
  }
},
```

- [ ] **Step 2: 更新 `init` 函数中的 state 初始化**

确保 `init` 函数（约第 472 行）合并新字段：

```typescript
jobBriefingConfig: {
  ...DEFAULT_JOB_BRIEFING_CONFIG,
  ...(state.jobBriefingConfig ?? {}),
},
jobProfile: {
  ...DEFAULT_JOB_PROFILE,
  ...(state.jobProfile ?? {}),
},
```

（现有代码已经使用 spread 合并，新字段会自动包含。确认即可。）

- [ ] **Step 3: 确保 `isJobProfileEmpty` import 存在**

检查 store 文件顶部是否已 import `isJobProfileEmpty`。如果没有，从 `@/lib/job-briefing-defaults` 导入。

- [ ] **Step 4: Commit**

```bash
git add src/store/index.ts
git commit -m "feat(job-briefing): add generateJobBriefingKeywords store action"
```

---

### Task 7: 创建 JobProfilePanel 组件

**Files:**
- Create: `src/components/job-briefing/JobProfilePanel.tsx`
- Modify: `src/components/job-briefing/index.ts`

- [ ] **Step 1: 创建 `JobProfilePanel.tsx`**

新建文件 `src/components/job-briefing/JobProfilePanel.tsx`。完整组件代码如下：

```tsx
import { useState, useEffect, useCallback } from 'react'
import { useStore } from '@/store'
import { isJobProfileEmpty, DEFAULT_JOB_BRIEFING_CONFIG } from '@/lib/job-briefing-defaults'
import type { JobProfile, JobBriefingConfig, JobCompany } from '@shared/index'

type Props = {
  open: boolean
  onClose: () => void
}

export function JobProfilePanel({ open, onClose }: Props) {
  const jobProfile = useStore(s => s.jobProfile)
  const jobConfig = useStore(s => s.jobBriefingConfig)
  const updateJobProfile = useStore(s => s.updateJobProfile)
  const setJobBriefingConfig = useStore(s => s.setJobBriefingConfig)
  const generateKeywords = useStore(s => s.generateJobBriefingKeywords)
  const discoverPages = useStore(s => s.discoverJobBriefingPages)
  const showToast = useStore(s => s.showToast)

  // 本地编辑状态
  const [profile, setProfile] = useState<JobProfile>(jobProfile)
  const [config, setConfig] = useState<JobBriefingConfig>(jobConfig)
  const [newEventKeyword, setNewEventKeyword] = useState('')
  const [newJobKeyword, setNewJobKeyword] = useState('')
  const [newCompanyName, setNewCompanyName] = useState('')
  const [saving, setSaving] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [discovering, setDiscovering] = useState(false)

  // 同步外部 state 到本地
  useEffect(() => {
    if (open) {
      setProfile(jobProfile)
      setConfig(jobConfig)
    }
  }, [open, jobProfile, jobConfig])

  // Esc 关闭
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  const handleSave = useCallback(async () => {
    setSaving(true)
    try {
      await updateJobProfile({ ...profile, updatedAt: new Date().toISOString() })
      await setJobBriefingConfig(config)
      showToast('求职档案已保存')
      onClose()
    } catch (err: any) {
      showToast('保存失败: ' + (err.message || '未知错误'))
    } finally {
      setSaving(false)
    }
  }, [profile, config, updateJobProfile, setJobBriefingConfig, showToast, onClose])

  const handleGenerateKeywords = useCallback(async () => {
    setGenerating(true)
    try {
      // 先保存当前档案
      await updateJobProfile({ ...profile, updatedAt: new Date().toISOString() })
      await generateKeywords()
      // 重新读取已更新的 config
      const updatedConfig = useStore.getState().jobBriefingConfig
      setConfig(updatedConfig)
    } finally {
      setGenerating(false)
    }
  }, [profile, updateJobProfile, generateKeywords])

  const handleDiscoverPages = useCallback(async () => {
    setDiscovering(true)
    try {
      await discoverPages()
      const updatedConfig = useStore.getState().jobBriefingConfig
      setConfig(updatedConfig)
      showToast('官方招聘页链接已刷新')
    } catch (err: any) {
      showToast('刷新失败: ' + (err.message || '未知错误'))
    } finally {
      setDiscovering(false)
    }
  }, [discoverPages, showToast])

  const addEventKeyword = () => {
    if (!newEventKeyword.trim()) return
    setConfig(c => ({ ...c, eventSearchKeywords: [...c.eventSearchKeywords, newEventKeyword.trim()] }))
    setNewEventKeyword('')
  }

  const removeEventKeyword = (idx: number) => {
    setConfig(c => ({ ...c, eventSearchKeywords: c.eventSearchKeywords.filter((_, i) => i !== idx) }))
  }

  const addJobKeyword = () => {
    if (!newJobKeyword.trim()) return
    setConfig(c => ({ ...c, jobSearchKeywords: [...c.jobSearchKeywords, newJobKeyword.trim()] }))
    setNewJobKeyword('')
  }

  const removeJobKeyword = (idx: number) => {
    setConfig(c => ({ ...c, jobSearchKeywords: c.jobSearchKeywords.filter((_, i) => i !== idx) }))
  }

  const addCompany = () => {
    if (!newCompanyName.trim()) return
    const maxPriority = config.companies.reduce((m, c) => Math.max(m, c.priority), 0)
    setConfig(c => ({
      ...c,
      companies: [...c.companies, { name: newCompanyName.trim(), priority: maxPriority + 1, enabled: true, careerPageUrl: undefined }],
    }))
    setNewCompanyName('')
  }

  const toggleCompany = (idx: number) => {
    setConfig(c => ({
      ...c,
      companies: c.companies.map((co, i) => i === idx ? { ...co, enabled: !co.enabled } : co),
    }))
  }

  const updateCompanyUrl = (idx: number, url: string) => {
    setConfig(c => ({
      ...c,
      companies: c.companies.map((co, i) => i === idx ? { ...co, careerPageUrl: url || undefined } : co),
    }))
  }

  const removeCompany = (idx: number) => {
    setConfig(c => ({ ...c, companies: c.companies.filter((_, i) => i !== idx) }))
  }

  const undoAll = () => {
    setProfile(jobProfile)
    setConfig(jobConfig)
  }

  if (!open) return null

  return (
    <>
      {/* 覆盖层 */}
      <div
        data-testid="job-profile-panel-overlay"
        className="fixed inset-0 bg-black/50 z-40"
        onClick={onClose}
      />
      {/* 面板 */}
      <div
        data-testid="job-profile-panel"
        className="fixed top-0 right-0 h-full w-[420px] bg-[#2a1f1a] border-l border-[#3a3028] z-50 overflow-y-auto shadow-2xl"
      >
        {/* Header */}
        <div className="sticky top-0 bg-[#2a1f1a] border-b border-[#3a3028] px-5 py-3.5 flex items-center justify-between z-10">
          <h3 className="text-[#e8a84c] font-semibold text-sm">⚙ 求职档案</h3>
          <button
            onClick={onClose}
            className="text-[#a09080] hover:text-[#e0d5c0] text-lg leading-none"
            aria-label="关闭"
          >
            ✕
          </button>
        </div>

        <div className="px-5 py-4 space-y-6">
          {/* 搜索维度 */}
          <section>
            <h4 className="text-[#706050] text-[0.65rem] uppercase tracking-wider mb-3 pb-1.5 border-b border-[#3a3028]">搜索维度</h4>
            <div className="flex gap-6">
              <label className="flex items-center gap-2 cursor-pointer text-sm text-[#a09080]">
                <div
                  className={`w-9 h-5 rounded-full relative transition-colors ${config.searchFallRecruit ? 'bg-[#d97757]' : 'bg-[#3a3028]'}`}
                  onClick={() => setConfig(c => ({ ...c, searchFallRecruit: !c.searchFallRecruit }))}
                >
                  <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${config.searchFallRecruit ? 'translate-x-4' : 'translate-x-0.5'}`} />
                </div>
                秋招/校招
              </label>
              <label className="flex items-center gap-2 cursor-pointer text-sm text-[#a09080]">
                <div
                  className={`w-9 h-5 rounded-full relative transition-colors ${config.searchInternship ? 'bg-[#d97757]' : 'bg-[#3a3028]'}`}
                  onClick={() => setConfig(c => ({ ...c, searchInternship: !c.searchInternship }))}
                >
                  <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${config.searchInternship ? 'translate-x-4' : 'translate-x-0.5'}`} />
                </div>
                实习/提前批
              </label>
            </div>
          </section>

          {/* 个人档案 */}
          <section>
            <h4 className="text-[#706050] text-[0.65rem] uppercase tracking-wider mb-3 pb-1.5 border-b border-[#3a3028]">个人档案</h4>
            <div className="space-y-3">
              <Field label="意向岗位（逗号分隔）">
                <input
                  data-testid="job-profile-target-roles"
                  value={profile.targetRoles.join('，')}
                  onChange={e => setProfile(p => ({ ...p, targetRoles: e.target.value.split(/[，,]/).map(s => s.trim()).filter(Boolean) }))}
                  placeholder="如：AI产品经理, 模型产品经理"
                />
              </Field>
              <Field label="方向描述">
                <input
                  data-testid="job-profile-direction"
                  value={profile.direction}
                  onChange={e => setProfile(p => ({ ...p, direction: e.target.value }))}
                  placeholder="一句话描述你的求职方向"
                />
              </Field>
              <Field label="技能清单（逗号分隔）">
                <input
                  data-testid="job-profile-skills"
                  value={profile.skills.join('，')}
                  onChange={e => setProfile(p => ({ ...p, skills: e.target.value.split(/[，,]/).map(s => s.trim()).filter(Boolean) }))}
                  placeholder="如：RAG, Agent, 多模态"
                />
              </Field>
              <Field label="经历摘要">
                <textarea
                  data-testid="job-profile-experience"
                  value={profile.experience}
                  onChange={e => setProfile(p => ({ ...p, experience: e.target.value }))}
                  placeholder="简要描述相关实习/项目经历"
                  rows={2}
                />
              </Field>
              <Field label="补充说明">
                <textarea
                  data-testid="job-profile-notes"
                  value={profile.additionalNotes}
                  onChange={e => setProfile(p => ({ ...p, additionalNotes: e.target.value }))}
                  placeholder="其他需要说明的信息"
                  rows={2}
                />
              </Field>
            </div>
          </section>

          {/* 搜索关键词 */}
          <section>
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-[#706050] text-[0.65rem] uppercase tracking-wider">搜索关键词</h4>
              <button
                data-testid="job-profile-generate-keywords"
                onClick={handleGenerateKeywords}
                disabled={generating}
                className="text-[0.65rem] px-2 py-0.5 rounded border border-[#3a3028] text-[#a09080] hover:text-[#e0d5c0] hover:border-[#d97757] disabled:opacity-50"
              >
                {generating ? '生成中...' : '🔄 重新生成'}
              </button>
            </div>

            <div className="text-[0.65rem] text-[#706050] mb-1.5">动态搜索</div>
            <div className="flex flex-wrap gap-1.5 mb-2">
              {config.eventSearchKeywords.map((k, i) => (
                <span key={i} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[0.7rem] bg-[#d97757]/10 text-[#d97757] border border-[#d97757]/20">
                  {k}
                  <button onClick={() => removeEventKeyword(i)} className="text-[#d97757] hover:text-[#d95b5b] text-[0.6rem]">×</button>
                </span>
              ))}
            </div>
            <div className="flex gap-1">
              <input
                value={newEventKeyword}
                onChange={e => setNewEventKeyword(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && addEventKeyword()}
                placeholder="添加关键词..."
                className="flex-1 px-2 py-1 text-[0.7rem] rounded border border-[#3a3028] bg-[#1a1410] text-[#e0d5c0] focus:border-[#d97757] outline-none"
              />
              <button onClick={addEventKeyword} className="px-2 py-0.5 text-[0.65rem] rounded border border-[#3a3028] text-[#a09080] hover:text-[#e0d5c0]">+</button>
            </div>

            <div className="text-[0.65rem] text-[#706050] mt-3 mb-1.5">岗位搜索</div>
            <div className="flex flex-wrap gap-1.5 mb-2">
              {config.jobSearchKeywords.map((k, i) => (
                <span key={i} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[0.7rem] bg-[#d97757]/10 text-[#d97757] border border-[#d97757]/20">
                  {k}
                  <button onClick={() => removeJobKeyword(i)} className="text-[#d97757] hover:text-[#d95b5b] text-[0.6rem]">×</button>
                </span>
              ))}
            </div>
            <div className="flex gap-1">
              <input
                value={newJobKeyword}
                onChange={e => setNewJobKeyword(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && addJobKeyword()}
                placeholder="添加关键词..."
                className="flex-1 px-2 py-1 text-[0.7rem] rounded border border-[#3a3028] bg-[#1a1410] text-[#e0d5c0] focus:border-[#d97757] outline-none"
              />
              <button onClick={addJobKeyword} className="px-2 py-0.5 text-[0.65rem] rounded border border-[#3a3028] text-[#a09080] hover:text-[#e0d5c0]">+</button>
            </div>
          </section>

          {/* 关注公司 */}
          <section>
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-[#706050] text-[0.65rem] uppercase tracking-wider">关注公司</h4>
              <button
                data-testid="job-profile-add-company"
                onClick={addCompany}
                className="text-[0.65rem] px-2 py-0.5 rounded border border-[#3a3028] text-[#a09080] hover:text-[#e0d5c0]"
              >
                + 添加
              </button>
            </div>

            {config.companies
              .sort((a, b) => a.priority - b.priority)
              .map((c, i) => {
                const origIdx = config.companies.indexOf(c)
                return (
                  <div key={c.name + i} className="flex items-center gap-2 py-1.5 border-b border-[#3a3028]/50 text-[0.75rem]">
                    <input
                      type="checkbox"
                      checked={c.enabled}
                      onChange={() => toggleCompany(origIdx)}
                      className="accent-[#d97757]"
                    />
                    <span className="w-6 text-center text-[#706050] text-[0.65rem] font-mono">{c.priority}</span>
                    <span className="flex-1 text-[#e0d5c0]">{c.name}</span>
                    {c.careerPageUrl ? (
                      <span className="text-[0.65rem] text-[#7fa8d9] max-w-[140px] truncate" title={c.careerPageUrl}>
                        {c.careerPageUrl.replace(/^https?:\/\//, '')}
                      </span>
                    ) : (
                      <span className="text-[0.65rem] text-[#706050]">未发现招聘页</span>
                    )}
                    <button
                      onClick={() => {
                        const url = prompt('编辑招聘页URL:', c.careerPageUrl ?? '')
                        if (url !== null) updateCompanyUrl(origIdx, url)
                      }}
                      className="text-[0.6rem] px-1 text-[#a09080] hover:text-[#e0d5c0]"
                    >
                      ✏
                    </button>
                    <button
                      onClick={() => removeCompany(origIdx)}
                      className="text-[0.6rem] px-1 text-[#a09080] hover:text-[#d95b5b]"
                    >
                      ×
                    </button>
                  </div>
                )
              })}

            <div className="flex gap-1 mt-2">
              <input
                value={newCompanyName}
                onChange={e => setNewCompanyName(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && addCompany()}
                placeholder="新公司名..."
                className="flex-1 px-2 py-1 text-[0.7rem] rounded border border-[#3a3028] bg-[#1a1410] text-[#e0d5c0] focus:border-[#d97757] outline-none"
              />
            </div>

            <button
              data-testid="job-profile-discover-pages"
              onClick={handleDiscoverPages}
              disabled={discovering}
              className="mt-2 text-[0.65rem] px-2 py-0.5 rounded border border-[#3a3028] text-[#a09080] hover:text-[#e0d5c0] disabled:opacity-50"
            >
              {discovering ? '刷新中...' : '🔄 刷新所有官方招聘页链接'}
            </button>
          </section>

          {/* Actions */}
          <div className="flex gap-2 pt-2">
            <button
              data-testid="job-profile-save"
              onClick={handleSave}
              disabled={saving}
              className="flex-1 px-4 py-2 rounded-md bg-[#d97757] text-white text-sm hover:bg-[#c86845] disabled:opacity-50"
            >
              {saving ? '保存中...' : '保存档案'}
            </button>
            <button
              onClick={undoAll}
              className="px-4 py-2 rounded-md border border-[#3a3028] text-[#a09080] text-sm hover:text-[#e0d5c0]"
            >
              取消
            </button>
          </div>
        </div>
      </div>
    </>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-[0.7rem] text-[#a09080] mb-1">{label}</label>
      {children}
    </div>
  )
}
```

- [ ] **Step 2: 更新 barrel export**

在 `src/components/job-briefing/index.ts` 中添加：

```typescript
export { JobProfilePanel } from './JobProfilePanel'
```

- [ ] **Step 3: Commit**

```bash
git add src/components/job-briefing/JobProfilePanel.tsx src/components/job-briefing/index.ts
git commit -m "feat(job-briefing): create JobProfilePanel slide-out drawer"
```

---

### Task 8: 集成 JobProfilePanel 到 Briefing 页面

**Files:**
- Modify: `src/pages/Briefing.tsx`

- [ ] **Step 1: 添加 import 和状态**

在 `src/pages/Briefing.tsx` 顶部添加：

```typescript
import { JobProfilePanel } from '@/components/job-briefing'
```

在组件内部状态区（约第 71 行，`profileHintDismissed` 附近）添加：

```typescript
const [jobProfilePanelOpen, setJobProfilePanelOpen] = useState(false)
```

- [ ] **Step 2: 替换档案提示条**

将现有 `profileHintDismissed` 条件渲染（约第 322-346 行）替换为指向面板的提示条：

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
      onClick={() => setJobProfilePanelOpen(true)}
      className="shrink-0 px-3 py-1 rounded bg-ember text-white text-xs hover:bg-ember/90"
    >
      填写档案
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
```

- [ ] **Step 3: 添加工具栏入口**

在 job-briefing 内容区的顶部（`JobBriefingRenderer` 渲染之前，约第 358 行），当有 `jobResult` 时添加工具栏：

```tsx
{jobResult && (
  <div className="max-w-3xl mx-auto mb-2 flex items-center justify-between">
    <BriefingMetaLine
      displayDate={jobDisplayDate}
      timeString={jobResult.generatedAt ? formatGeneratedAt(jobResult.generatedAt, jobResult.date) : undefined}
      sourceStatus={{ ...jobResult.sourceStatus.official, events: jobResult.sourceStatus.events, jobs: jobResult.sourceStatus.jobs, questions: jobResult.sourceStatus.questions }}
      cacheWriteFailed={jobResult.cacheWriteFailed}
      theme={theme}
    />
    <button
      data-testid="job-profile-panel-trigger"
      onClick={() => setJobProfilePanelOpen(true)}
      className="shrink-0 ml-3 flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border border-[#3a3028] bg-[#2a1f1a]/60 text-[#a09080] text-xs hover:text-[#e0d5c0] hover:border-[#d97757] transition-colors"
      title="求职档案设置"
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="opacity-70">
        <circle cx="12" cy="12" r="3"/>
        <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/>
      </svg>
      求职档案
    </button>
  </div>
)}
```

**注意**：需要调整现有的 `BriefingMetaLine` 渲染位置。现有代码中 `BriefingMetaLine` 是独立渲染在 `{jobResult && (` 块中（约第 348 行），需要将其包裹在同一个 flex 容器中。

- [ ] **Step 4: 添加面板组件（页面级渲染）**

在 `Briefing.tsx` 的 `return` 语句末尾、`</div>` 关闭标签之前（`CandlelightLayer` 之前，约第 494 行），添加：

```tsx
<JobProfilePanel
  open={jobProfilePanelOpen && isJob}
  onClose={() => setJobProfilePanelOpen(false)}
/>
```

面板作为页面级元素渲染（非条件分支内），通过 `open` prop 控制显隐。仅当 `isJob` 为 true 时 `open` 才可能为 true。

- [ ] **Step 5: Commit**

```bash
git add src/pages/Briefing.tsx
git commit -m "feat(job-briefing): integrate JobProfilePanel into Briefing page"
```

---

### Task 9: 清理 Settings 页面

**Files:**
- Modify: `src/pages/Settings.tsx`

- [ ] **Step 1: 移除求职档案 section**

在 `src/pages/Settings.tsx` 中，移除「求职档案」section（约第 370-438 行）。删除所有包含 `settings-jobprofile-*` testid 的 JSX 元素和相关 state。

删除的 state/handler：
- `const [jobProfile, setJobProfile] = ...` 
- `const [jobProfileSaving, setJobProfileSaving] = ...`
- `handleSaveJobProfile` 函数

删除 `useEffect` 中读取 `state.jobProfile` 的行（约第 59 行）。

- [ ] **Step 2: 移除公司列表子区**

在「求职简报」section 中，移除公司列表相关的 JSX（checkbox + name + priority + URL + 添加/删除按钮）。保留 `roleKeywords`、`cities` 输入框。

将公司编辑的 state/handler 移除：
- `handleAddCompany`、`handleRemoveCompany`、`handleToggleCompany` 等函数

- [ ] **Step 3: 添加跳转提示**

在「求职简报」section 底部（保存按钮之前）添加：

```tsx
<div className="text-xs text-parchment/50 mt-4">
  关注公司、个人档案、搜索关键词请在
  <button
    data-testid="settings-goto-job-profile"
    onClick={() => goto('briefing')}
    className="underline text-ember hover:text-ember/80 mx-1"
  >
    求职简报页面
  </button>
  中编辑
</div>
```

- [ ] **Step 4: 清理 import**

移除不再使用的 import（如 `JobProfile` 类型如果只在移除的 section 中使用）。确认 `goto` 已 import。

- [ ] **Step 5: Commit**

```bash
git add src/pages/Settings.tsx
git commit -m "refactor(settings): remove job profile section, redirect to briefing page panel"
```

---

### Task 10: 文章旁注智能搜索

**Files:**
- Modify: `electron/ipc/article-assistant.ts`

- [ ] **Step 1: 添加 import**

在 `electron/ipc/article-assistant.ts` 顶部添加：

```typescript
import { generateArticleSearchQuery } from '../lib/job-briefing'
```

- [ ] **Step 2: 替换搜索词生成逻辑**

找到现有代码（约第 460-463 行）：

```typescript
const query = [args.selection, args.messages.at(-1)?.content]
  .filter(Boolean)
  .join(' ')
  .trim()
```

替换为：

```typescript
let query: string
try {
  query = await generateArticleSearchQuery(cfg, {
    articleContent: args.articleContent,
    selection: args.selection,
    lastMessage: args.messages.at(-1)?.content,
  })
} catch (err) {
  console.warn('[article-assistant] smart query generation failed, falling back to concatenation', err)
  // Fallback: 保留旧拼接方式
  query = [args.selection, args.messages.at(-1)?.content]
    .filter(Boolean)
    .join(' ')
    .trim()
}
```

- [ ] **Step 3: Commit**

```bash
git add electron/ipc/article-assistant.ts
git commit -m "feat(article-assistant): use LLM-generated search query with fallback"
```

---

### Task 11: 测试适配

**Files:**
- Modify: `tests/job-briefing.test.ts`
- Modify: `tests/job-briefing-real.test.ts`
- Modify: `e2e/helpers/mock-tavily-server.ts`

- [ ] **Step 1: 更新单元测试**

`tests/job-briefing.test.ts` — 更新 `buildEventQueries` 和 `discoverEvents` 相关测试：

```typescript
// 测试 toggle 控制
it('buildEventQueries returns only fallRecruit query when searchInternship is false', () => {
  const config = normalizeJobBriefingConfig({ searchFallRecruit: true, searchInternship: false })
  const queries = buildEventQueries(config)
  expect(queries).toHaveLength(1)
  expect(queries[0].dimension).toBe('fallRecruit')
  expect(queries[0].query).toContain('秋招')
})

it('buildEventQueries returns two queries when both toggles are on', () => {
  const config = normalizeJobBriefingConfig({ searchFallRecruit: true, searchInternship: true })
  const queries = buildEventQueries(config)
  expect(queries).toHaveLength(2)
  expect(queries.map(q => q.dimension).sort()).toEqual(['fallRecruit', 'internship'])
})

it('buildEventQueries uses eventSearchKeywords when available', () => {
  const config = normalizeJobBriefingConfig({
    eventSearchKeywords: ['AI产品', '大模型'],
    searchFallRecruit: true,
  })
  const queries = buildEventQueries(config)
  expect(queries[0].query).toContain('AI产品')
})

it('buildFocusJobQueries generates separate queries per toggle', () => {
  const focus = [{ name: '字节跳动' }, { name: '腾讯' }]
  const config = normalizeJobBriefingConfig({ searchFallRecruit: true, searchInternship: true })
  const profile = normalizeJobProfile({ targetRoles: ['AI产品经理'] })
  const queries = buildFocusJobQueries(focus, profile, config)
  expect(queries).toHaveLength(2)
})
```

- [ ] **Step 2: 更新真实 API 测试**

`tests/job-briefing-real.test.ts` — 适配新的 `generateJobBriefing` 返回格式。由于函数签名不变（输入参数不变），主要确保断言仍通过。`emitProgress` stages 不变（`scanning-events`, `digging-jobs` 等）。

- [ ] **Step 3: 更新 E2E mock**

`e2e/helpers/mock-tavily-server.ts` — 当前 mock 返回空结果 `{ results: [] }`，与新搜索策略兼容（无结果时走降级路径）。不需要修改。

- [ ] **Step 4: 运行测试**

```bash
npm run test
```

预期：所有测试通过。

- [ ] **Step 5: Commit**

```bash
git add tests/job-briefing.test.ts
git commit -m "test(job-briefing): update tests for new search strategy and toggles"
```

---

### Task 12: 端到端验证

- [ ] **Step 1: 构建验证**

```bash
npm run build
```

预期：构建成功。

- [ ] **Step 2: 启动应用**

```bash
npm run dev
```

- [ ] **Step 3: 手动验证清单**

1. 切换到求职简报页面（source sidebar → 💼）
2. 确认齿轮图标「求职档案」按钮可见
3. 点击打开面板 → 面板从右侧滑出
4. 编辑档案字段 → 点击「保存档案」→ 关闭面板 → 重新打开 → 数据持久化
5. 点击「重新生成关键词」→ LLM 生成 → tags 更新
6. 切换实习/秋招 toggle → 保存
7. 点击「生成求职简报」→ 验证流程跑通
8. 打开一篇简报的文章旁注 → 开启搜索 → 发送消息 → 验证搜索使用 LLM 生成的关键词
9. 打开 Settings 页面 → 确认求职档案 section 已移除 → 确认跳转提示存在
10. 关闭应用 → 重新启动 → 确认面板数据仍在

- [ ] **Step 4: Commit（如有修复）**

```bash
git add -A
git commit -m "fix(job-briefing): address issues found during manual verification"
```

---

## Self-Review

**Spec coverage check:**
- ✅ 配额优化：Task 3 重构搜索策略 → 5 Tavily + 7 LLM
- ✅ 文章旁注智能搜索：Task 10
- ✅ 搜索关键词 LLM 生成：Task 2 (prompt) + Task 3 (function) + Task 4 (IPC)
- ✅ 关键词可见可编辑：Task 7 (JobProfilePanel)
- ✅ 求职档案解耦：Task 7 (panel) + Task 8 (Briefing integration) + Task 9 (Settings cleanup)
- ✅ 官方 URL 可视化：Task 7 (company rows with URL display/edit)
- ✅ 实习/秋招 toggle：Task 7 (UI) + Task 3 (search logic)
- ✅ 向后兼容：Task 1 (defaults) + Task 6 (store init spread)
- ✅ E2E mock 适配：Task 11

**Placeholder scan:** No TBD/TODO. All code blocks contain real implementation.

**Type consistency:** `eventSearchKeywords`/`jobSearchKeywords`/`searchInternship`/`searchFallRecruit` used consistently across types, defaults, UI, and search logic. `dimension: 'fallRecruit' | 'internship' | 'general'` propagated through EventQuery → discoverEvents → generateJobBriefing.
