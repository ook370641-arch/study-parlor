# 两轮渐进搜索 + 研究报告合成 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 `search:prepare` 管线从单轮盲搜升级为两轮渐进搜索 + 独立节点导师笔记，提升外部资料报告质量

**Architecture:** 在 `electron/lib/search.ts` 新增 5 个函数（含 1 个私有 helper），在 `electron/ipc/search.ts` 更新 `search:prepare` handler 为 6 步管线。返回类型 `SearchResult` 不变，`summary` 字段扩展为 研究报告 + 导师笔记 + 提问方向 三段拼接

**Tech Stack:** TypeScript, Tavily Search API, DeepSeek/Kimi LLM (chatNonStream), extractJsonArray

**参考实现:** `scripts/test-synth-variants.js` (合成策略), `scripts/test-two-round-search.js` (搜索编排)

---

### Task 1: 新增私有 helper `formatResultsForPrompt`

**Files:**
- Modify: `electron/lib/search.ts` (在 `generateTutorBrief` 之前插入)

- [ ] **Step 1: 添加 helper 函数**

在 `search.ts` 的 `generateTutorBrief` 函数之前插入。将 `TavilyResult[]` 格式化为 prompt 可用的文本块：

```typescript
const MAX_SNIPPET_LENGTH = 200

function formatResultsForPrompt(
  results: TavilyResult[],
  label: string
): string {
  if (!results || results.length === 0) return `（${label}: 无结果）`
  return results.map((r, i) =>
    `[${label}-${i + 1}] ${r.title}\nURL: ${r.url}\n摘要: ${(r.content || '').slice(0, 400)}`
  ).join('\n\n')
}
```

- [ ] **Step 2: 验证 TypeScript 编译**

```bash
npx tsc --noEmit electron/lib/search.ts
```

Expected: 无类型错误（若 `search.ts` 无独立 tsconfig，用 `npx tsc --noEmit` 全量检查）

- [ ] **Step 3: Commit**

```bash
git add electron/lib/search.ts
git commit -m "feat: add formatResultsForPrompt helper for search result formatting"
```

---

### Task 2: 新增 `generateExploratoryQueries` (Step 1)

**Files:**
- Modify: `electron/lib/search.ts` (在 `generateSearchQueries` 下方插入)

- [ ] **Step 1: 实现函数**

在 `generateSearchQueries` 函数之后插入：

```typescript
export async function generateExploratoryQueries(
  cfg: AppConfig,
  topic: string
): Promise<string[]> {
  const prompt = `用户想研究：「${topic}」

请生成 2-3 个宽域搜索查询词，用于全面了解这个主题。要求：
- 覆盖不同角度（架构设计、工程实践、对比分析、底层原理）
- 查询词简短、精准，适合英文搜索引擎
- 查询词用英文（此类技术资料英文质量更高）
只输出 JSON 数组：["查询1", "查询2"]`

  const text = await chatNonStream(cfg, {
    messages: [{ role: 'user', content: prompt }],
    temperature: 0.3,
    thinking: { type: 'disabled' }
  })
  const extracted = extractJsonArray(text)
  if (!extracted) throw new Error('JSON extraction failed')
  let arr: unknown
  try {
    arr = JSON.parse(extracted)
  } catch {
    throw new Error('JSON parse failed')
  }
  if (!Array.isArray(arr)) throw new Error('JSON parse failed: not an array')
  const queries = arr.filter((q): q is string => typeof q === 'string')
  if (queries.length === 0) throw new Error('No valid search queries generated')
  return queries.slice(0, 3)
}
```

> **注**：函数体与现有 `generateSearchQueries` 结构相同（`chatNonStream` → `extractJsonArray` → `JSON.parse` → `filter`），仅 prompt 不同。这是有意为之——保持解析逻辑一致，仅搜索策略不同。

- [ ] **Step 2: 确认编译通过**

```bash
npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add electron/lib/search.ts
git commit -m "feat: add generateExploratoryQueries for round-1 wide search"
```

---

### Task 3: 新增 `identifySubDimensions` (Step 3)

**Files:**
- Modify: `electron/lib/search.ts` (在 `generateExploratoryQueries` 之后插入)

- [ ] **Step 1: 实现函数**

```typescript
export async function identifySubDimensions(
  cfg: AppConfig,
  topic: string,
  round1Results: TavilyResult[]
): Promise<string[]> {
  const prompt = `以下是关于「${topic}」的第一轮网络搜索结果。请通读，识别 2-4 个值得深挖的子维度，生成精准搜索查询词。

第一轮结果：
${formatResultsForPrompt(round1Results, 'R1')}

只输出 JSON 数组：["查询1", "查询2"]`

  const text = await chatNonStream(cfg, {
    messages: [{ role: 'user', content: prompt }],
    temperature: 0.3,
    thinking: { type: 'disabled' }
  })
  const extracted = extractJsonArray(text)
  if (!extracted) throw new Error('JSON extraction failed')
  let arr: unknown
  try {
    arr = JSON.parse(extracted)
  } catch {
    throw new Error('JSON parse failed')
  }
  if (!Array.isArray(arr)) throw new Error('JSON parse failed: not an array')
  const queries = arr.filter((q): q is string => typeof q === 'string')
  return queries.slice(0, 4)
}
```

- [ ] **Step 2: 确认编译通过**

```bash
npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add electron/lib/search.ts
git commit -m "feat: add identifySubDimensions for round-2 deep-dive queries"
```

---

### Task 4: 新增 `synthesizeResearchReport` (Step 5)

**Files:**
- Modify: `electron/lib/search.ts` (在 `identifySubDimensions` 之后插入)

- [ ] **Step 1: 实现函数**

```typescript
export async function synthesizeResearchReport(
  cfg: AppConfig,
  topic: string,
  round1Results: TavilyResult[],
  round2Results: TavilyResult[]
): Promise<string> {
  const prompt = `你是一位技术研究助手。以下是从两轮网络搜索得到的关于「${topic}」的资料。

## 第一轮（全景扫描）
${formatResultsForPrompt(round1Results, 'R1')}

## 第二轮（子维度深钻）
${round2Results.length > 0
  ? formatResultsForPrompt(round2Results, 'R2')
  : '（无 — 仅基于第一轮结果合成）'}

请撰写一份结构化的研究报告。要求：

1. 输出纯 markdown 格式，控制在 4000 字以内
2. 结构灵活但不失深度——根据材料自然产生的维度组织章节，而不是套固定模板
3. 优先使用：对比表格、分层分析、关键数据点
4. 每个事实性陈述后附上来源编号 [1] [2] ...
5. 如果材料之间存在矛盾或不同观点，明确指出
6. 结尾附"关键收获"：3-5 条最值得记住的要点
7. 结尾附"来源列表"

写作风格：资深工程师写的内部技术备忘录。`

  const report = await chatNonStream(cfg, {
    messages: [{ role: 'user', content: prompt }],
    temperature: 0.5,
    thinking: { type: 'enabled', reasoning_effort: 'high' }
  })
  return report.trim()
}
```

- [ ] **Step 2: 确认编译通过**

```bash
npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add electron/lib/search.ts
git commit -m "feat: add synthesizeResearchReport for structured research report generation"
```

---

### Task 5: 新增 `generateTutorSupplement` (Step 6)

**Files:**
- Modify: `electron/lib/search.ts` (在 `synthesizeResearchReport` 之后插入)

- [ ] **Step 1: 实现函数**

```typescript
export async function generateTutorSupplement(
  cfg: AppConfig,
  topic: string,
  report: string
): Promise<{ tutorNotes: string; questions: string }> {
  const prompt = `以下是一份关于「${topic}」的研究报告。

---
${report}
---

请基于以上报告，生成以下两部分内容：

### 导师备课笔记
将报告的核心知识转化为苏格拉底式导师的备课参考。包含：核心概念（2-4个）、关键区分点、常见误解（2-3个）、前置知识。风格：导师知道但不直接告诉学生的背景笔记。控制在 800 字以内。

### 提问方向
基于报告内容，给出 3-5 个苏格拉底式提问方向，用于引导学生自己发现这些知识。每个提问方向包含：引导问题 + 期望学生最终自己发现的结论。

请用 markdown 分隔线 --- 隔开两个部分。`

  const text = await chatNonStream(cfg, {
    messages: [{ role: 'user', content: prompt }],
    temperature: 0.5,
    thinking: { type: 'enabled', reasoning_effort: 'high' }
  })

  // 解析两个部分：以第一个 "---" 为界
  const sepIdx = text.indexOf('\n---\n')
  let tutorNotes = ''
  let questions = ''
  if (sepIdx > 0) {
    tutorNotes = text.slice(0, sepIdx).trim()
    questions = text.slice(sepIdx + 5).trim()
  } else {
    // 降级：整段作为导师笔记
    tutorNotes = text.trim()
  }
  return { tutorNotes, questions }
}
```

- [ ] **Step 2: 确认编译通过**

```bash
npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add electron/lib/search.ts
git commit -m "feat: add generateTutorSupplement for tutor notes + Socratic questions"
```

---

### Task 6: 更新 `search:prepare` IPC 管线

**Files:**
- Modify: `electron/ipc/search.ts`

- [ ] **Step 1: 更新 import 语句**

`electron/ipc/search.ts:4` — 更新 import：

```typescript
// 旧：
import { generateSearchQueries, searchWeb, generateTutorBrief } from '../lib/search'
// 新：
import {
  searchWeb,
  generateExploratoryQueries,
  identifySubDimensions,
  synthesizeResearchReport,
  generateTutorSupplement
} from '../lib/search'
```

- [ ] **Step 2: 重写 `search:prepare` handler body**

将 `electron/ipc/search.ts:18-64` 的 `search:prepare` handler 完整替换为：

```typescript
  ipcMain.handle('search:prepare', async (_, args: { topic: string }) => {
    const rawTopic = args?.topic
    if (typeof rawTopic !== 'string' || !rawTopic.trim()) {
      const err = new Error('Topic is required') as Error & { code: SearchErrorCode }
      err.code = 'LLM_ERROR'
      throw err
    }
    const topic = rawTopic.trim()

    const apiKey = await getSearchApiKey()
    if (!apiKey) {
      const err = new Error('Search API key not configured') as Error & { code: SearchErrorCode }
      err.code = 'MISSING_API_KEY'
      throw err
    }

    // Step 1: Generate exploratory queries
    let r1Queries: string[]
    try {
      r1Queries = await generateExploratoryQueries(cfg, topic)
    } catch (err: any) {
      const wrapped = new Error(err?.message ?? 'Failed to generate search queries') as Error & { code: SearchErrorCode }
      wrapped.code = 'LLM_ERROR'
      throw wrapped
    }

    // Step 2: Round 1 search
    let r1Results: TavilyResult[]
    try {
      r1Results = await searchWebWithRetry({ queries: r1Queries, apiKey })
    } catch (err: any) {
      const code: SearchErrorCode = err?.code === 'NO_RESULTS' ? 'NO_RESULTS' : 'NETWORK_ERROR'
      const wrapped = new Error(err?.message ?? 'Search failed') as Error & { code: SearchErrorCode }
      wrapped.code = code
      throw wrapped
    }

    // Step 3: Identify sub-dimensions (degradable)
    let dimQueries: string[] = []
    try {
      dimQueries = await identifySubDimensions(cfg, topic, r1Results)
    } catch (err: any) {
      console.warn('[search:prepare] identifySubDimensions failed, skipping round 2:', err?.message)
    }

    // Step 4: Round 2 search (degradable)
    let r2Results: TavilyResult[] = []
    if (dimQueries.length > 0) {
      try {
        r2Results = await searchWebWithRetry({ queries: dimQueries, apiKey })
      } catch (err: any) {
        console.warn('[search:prepare] round 2 search failed, proceeding with round 1 only:', err?.message)
      }
    }

    // Collect all sources from both rounds
    const allSources: TavilyResult[] = [...r1Results, ...r2Results]

    // Step 5: Synthesize research report
    let report: string
    try {
      report = await synthesizeResearchReport(cfg, topic, r1Results, r2Results)
    } catch (err: any) {
      const wrapped = new Error(err?.message ?? 'Failed to generate research report') as Error & { code: SearchErrorCode }
      wrapped.code = 'LLM_ERROR'
      throw wrapped
    }

    // Step 6: Generate tutor notes + questions (optional enhancement)
    let summary = report
    try {
      const supplement = await generateTutorSupplement(cfg, topic, report)
      const tutorSection = supplement.tutorNotes
        ? `## 导师备课笔记\n\n${supplement.tutorNotes}`
        : ''
      const questionsSection = supplement.questions
        ? `## 苏格拉底提问方向\n\n${supplement.questions}`
        : ''
      const extras = [tutorSection, questionsSection].filter(Boolean).join('\n\n---\n\n')
      if (extras) summary = report + '\n\n---\n\n' + extras
    } catch (err: any) {
      console.warn('[search:prepare] generateTutorSupplement failed, returning report only:', err?.message)
    }

    // Build SearchResult
    const sources: SearchSource[] = allSources.map(r => ({
      title: r.title,
      url: r.url,
      snippet: (r.content || '').slice(0, MAX_SNIPPET_LENGTH)
    }))

    return { summary, sources }
  })
```

需要添加 `TavilyResult` 类型导入（从 `../lib/search` 或内联类型）和 `SearchSource`/`MAX_SNIPPET_LENGTH` 常量。

- [ ] **Step 3: 确认编译通过**

```bash
npx tsc --noEmit
```

- [ ] **Step 4: Commit**

```bash
git add electron/ipc/search.ts
git commit -m "feat: upgrade search:prepare to two-round progressive search pipeline"
```

---

### Task 7: 单元测试 — 新增函数

**Files:**
- Modify: `tests/search.test.ts`

- [ ] **Step 1: 更新 import**

```typescript
// 旧：
import { searchWeb, generateSearchQueries, generateTutorBrief } from '../electron/lib/search'
// 新：
import {
  searchWeb,
  generateSearchQueries,
  generateTutorBrief,
  generateExploratoryQueries,
  identifySubDimensions,
  synthesizeResearchReport,
  generateTutorSupplement
} from '../electron/lib/search'
```

- [ ] **Step 2: `generateExploratoryQueries` 测试**

在 `generateSearchQueries` 测试块之后添加：

```typescript
describe('generateExploratoryQueries', () => {
  it('returns parsed array on success', async () => {
    const mockFetch = vi.mocked(fetch)
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: '```json\n["角度A", "角度B"]\n```' } }]
      })
    } as Response)

    const queries = await generateExploratoryQueries(mockCfg, 'test topic')
    expect(queries).toEqual(['角度A', '角度B'])
  })

  it('throws on non-array output', async () => {
    const mockFetch = vi.mocked(fetch)
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: '```json\n"not an array"\n```' } }]
      })
    } as Response)

    await expect(generateExploratoryQueries(mockCfg, 'test'))
      .rejects.toThrow('not an array')
  })

  it('throws on all non-string items', async () => {
    const mockFetch = vi.mocked(fetch)
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: '```json\n[1, 2, 3]\n```' } }]
      })
    } as Response)

    await expect(generateExploratoryQueries(mockCfg, 'test'))
      .rejects.toThrow('No valid search queries generated')
  })
})
```

- [ ] **Step 3: `identifySubDimensions` 测试**

```typescript
describe('identifySubDimensions', () => {
  const sampleResults = [
    { title: 'T1', url: 'https://a.com', content: 'Content about A' },
    { title: 'T2', url: 'https://b.com', content: 'Content about B' },
  ]

  it('returns parsed array on success', async () => {
    const mockFetch = vi.mocked(fetch)
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: '["维度1搜索词", "维度2搜索词"]' } }]
      })
    } as Response)

    const queries = await identifySubDimensions(mockCfg, 'topic', sampleResults)
    expect(queries).toEqual(['维度1搜索词', '维度2搜索词'])
    // 验证第1轮结果被传入 prompt
    const lastCall = mockFetch.mock.calls[mockFetch.mock.calls.length - 1]
    const body = JSON.parse((lastCall[1] as RequestInit).body as string)
    expect(body.messages[0].content).toContain('[R1-1]')
    expect(body.messages[0].content).toContain('https://a.com')
  })

  it('returns empty array on JSON extraction failure', async () => {
    const mockFetch = vi.mocked(fetch)
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: 'sorry I cannot do that' } }]
      })
    } as Response)

    await expect(identifySubDimensions(mockCfg, 'topic', sampleResults))
      .rejects.toThrow('JSON extraction failed')
  })
})
```

- [ ] **Step 4: `synthesizeResearchReport` 测试**

```typescript
describe('synthesizeResearchReport', () => {
  const sampleResults = [
    { title: 'T1', url: 'https://a.com', content: 'Content' },
  ]

  it('returns markdown report on success', async () => {
    const mockFetch = vi.mocked(fetch)
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: '  # Research Report\n\nContent here.  ' } }]
      })
    } as Response)

    const report = await synthesizeResearchReport(mockCfg, 'topic', sampleResults, [])
    expect(report).toBe('# Research Report\n\nContent here.')
    // 验证 thinking 启用
    const lastCall = mockFetch.mock.calls[mockFetch.mock.calls.length - 1]
    const body = JSON.parse((lastCall[1] as RequestInit).body as string)
    expect(body.thinking.type).toBe('enabled')
  })

  it('handles empty round 2 results', async () => {
    const mockFetch = vi.mocked(fetch)
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: '# Report' } }]
      })
    } as Response)

    const report = await synthesizeResearchReport(mockCfg, 'topic', sampleResults, [])
    expect(report).toBe('# Report')
  })
})
```

- [ ] **Step 5: `generateTutorSupplement` 测试**

```typescript
describe('generateTutorSupplement', () => {
  it('returns tutorNotes and questions when both sections present', async () => {
    const mockFetch = vi.mocked(fetch)
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: '### 导师备课笔记\n\nSome notes here.\n\n---\n\n### 提问方向\n\nQuestions here.' } }]
      })
    } as Response)

    const result = await generateTutorSupplement(mockCfg, 'topic', '# Report content')
    expect(result.tutorNotes).toContain('Some notes here')
    expect(result.questions).toContain('Questions here')
  })

  it('falls back to tutorNotes only when no separator found', async () => {
    const mockFetch = vi.mocked(fetch)
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: 'Just some notes without separator.' } }]
      })
    } as Response)

    const result = await generateTutorSupplement(mockCfg, 'topic', '# Report')
    expect(result.tutorNotes).toBe('Just some notes without separator.')
    expect(result.questions).toBe('')
  })
})
```

- [ ] **Step 6: 运行测试确认全部通过**

```bash
npx vitest run tests/search.test.ts
```

Expected: 新增的 8 个测试 + 已有的 7 个测试 = 全部 PASS

- [ ] **Step 7: Commit**

```bash
git add tests/search.test.ts
git commit -m "test: add unit tests for two-round search pipeline functions"
```

---

### Task 8: 更新 search-ipc 单元测试

**Files:**
- Modify: `tests/search-ipc.test.ts`
- Read: `tests/search-ipc.test.ts`（需确认当前测试结构和 mock 策略）

- [ ] **Step 1: 读取现有测试文件**

先读取 `tests/search-ipc.test.ts` 确认当前 `search:prepare` 的测试方式。现有测试可能 mock 了 `generateSearchQueries` 和 `generateTutorBrief`，需更新为 mock 新函数。

- [ ] **Step 2: 更新 mock 和测试用例**

根据现有测试结构调整（具体代码取决于 Step 1 读到的结构），核心变更：
- Mock `generateExploratoryQueries` 替代 `generateSearchQueries`
- Mock `identifySubDimensions` 和 `synthesizeResearchReport` 和 `generateTutorSupplement`
- 新增降级路径测试：`identifySubDimensions` 失败时跳过第2轮、`generateTutorSupplement` 失败时仅返回报告

- [ ] **Step 3: 运行测试**

```bash
npx vitest run tests/search-ipc.test.ts
```

Expected: 全部 PASS

- [ ] **Step 4: Commit**

```bash
git add tests/search-ipc.test.ts
git commit -m "test: update search-ipc tests for two-round pipeline"
```

---

### Task 9: 更新 E2E mock

**Files:**
- Modify: `e2e/specs/external-materials-real-search.spec.ts`（如有必要）
- Modify: `e2e/helpers/mock-tavily-server.ts`（如有必要）

- [ ] **Step 1: 检查 E2E 是否需要变更**

搜索管线的 E2E 使用 mock Tavily server 和 mock LLM（`NODE_ENV==='test' && E2E_CONFIG_DIR`）。阅读 `e2e/specs/external-materials-real-search.spec.ts` 确认：

- 如果 mock Tavily server 返回固定结果 → 无需变更（新管线只是多搜一轮，相同的 mock 数据仍然工作）
- 如果 mock LLM 返回 `["苏格拉底式教学法", "Bloom 掌握学习", "苏格拉底对话案例"]` → 新管线 `generateExploratoryQueries` 同样返回数组，格式兼容

若无需变更，此 Task 仅确认即可。

- [ ] **Step 2: 如果有变更，更新并验证**

```bash
npx playwright test --config e2e/playwright.config.ts external-materials-real-search
```

- [ ] **Step 3: Commit**（如有变更）

```bash
git add e2e/
git commit -m "test: update E2E mocks for two-round search pipeline"
```

---

### Task 10: 端到端验收

- [ ] **Step 1: 启动应用，手动验证完整链路**

```bash
npm run dev
```

操作路径：
1. Cover → Home → 选择一个学习主题
2. 在 PreStudyModal 中勾选"引入联网资料"
3. 开始学习 → 观察 ExternalMaterialsCard 出现
4. 点击 ExternalSummaryPanel 查看报告质量
5. 完成一次简短对话 → 归档 → 检查 `外部资料.md` 内容

- [ ] **Step 2: 跑实验脚本验证报告质量**

```bash
npx tsx scripts/test-two-round-search.js
```

检查 `.experiment-results/` 输出的报告质量是否符合预期。

- [ ] **Step 3: 跑定向单元测试**

```bash
npx vitest run tests/search.test.ts tests/search-ipc.test.ts
```

- [ ] **Step 4: 跑定向 E2E**

```bash
node scripts/e2e-changed.js --run
```

---

### 不改动的文件确认清单

以下文件本次**零改动**，但需在验收时确认功能正常：

- [ ] `electron/lib/prompts.ts` — externalMaterialsSummary 注入逻辑不变
- [ ] `src/lib/session-runtime.ts` — prepareExternalMaterials 调用链不变
- [ ] `src/lib/finalize.ts` — 外部资料归档不变
- [ ] `src/components/ExternalSummaryPanel.tsx` — markdown 渲染不变
- [ ] `src/types/index.ts` — SearchResult 类型不变
- [ ] `electron/ipc/llm.ts` — 苏格拉底对话不变
