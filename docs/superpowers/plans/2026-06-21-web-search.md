# 网络搜索（外部资料）功能实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为学者夜话的 progress 学习模式增加可选的 Tavily 网络搜索能力，搜索结果经 DeepSeek 整理后注入 system prompt，并在 finalize 时归档为 `sN/外部资料.md`。

**Architecture:** 采用主进程封装方案，新增 `electron/lib/search.ts` 负责 Tavily 调用与 LLM 整理，`electron/lib/credentials.ts` 负责 `safeStorage` 加密存储 Tavily key。搜索流程通过 `search:prepare` IPC 暴露，渲染层在 Study 页面启动时按需触发。整理后的摘要通过 `assemblePrompt` 注入 system prompt，通过 Zustand store 在会话期间持有，finalize 时写入学习库。

**Tech Stack:** Electron 30 + React 18 + TypeScript + Tailwind + Zustand，网络请求使用原生 `fetch`，凭据使用 Electron `safeStorage`。

---

## 文件清单

| 文件 | 职责 |
|-----|------|
| `src/types/index.ts` | 新增 `DocType`、`IpcApi`、store 相关类型 |
| `electron/lib/credentials.ts` | `safeStorage` 封装：读写 Tavily key |
| `electron/lib/search.ts` | Tavily 客户端、查询生成、资料整理 |
| `electron/ipc/search.ts` | `search:prepare` / `search:checkConfig` IPC handler |
| `electron/ipc/register-all.ts` | 注册新的 search IPC（若存在此文件，否则在 `electron/main.ts`） |
| `electron/lib/prompts.ts` | `assemblePrompt` 增加 `externalMaterialsSummary` 参数 |
| `electron/ipc/llm.ts` | `llm:start` 透传 `externalMaterialsSummary` |
| `src/lib/session-runtime.ts` | 透传 `externalMaterialsSummary` 到 `llmStart` |
| `src/store/index.ts` | 新增 `externalMaterials` 状态与 action |
| `src/components/PreStudyModal.tsx` | 增加“联网资料”开关 |
| `src/pages/Study.tsx` | 启动时触发搜索、展示外部资料卡片 |
| `src/pages/Settings.tsx` | 增加 Tavily key / baseUrl 配置 UI |
| `electron/ipc/files.ts` | 新增 `files:writeExternalMaterials` handler |
| `src/lib/finalize.ts` | finalize 时写入 `外部资料.md` |
| `tests/search.test.ts` | 搜索模块单元测试 |
| `tests/credentials.test.ts` | credentials 模块单元测试 |
| `tests/search-ipc.test.ts` | IPC handler 测试（可选） |

---

## Task 1: 扩展类型定义

**Files:**
- Modify: `src/types/index.ts:6`
- Modify: `src/types/index.ts:14-26`
- Modify: `src/types/index.ts:84-95`
- Modify: `src/types/index.ts:14-29`
- Modify: `src/types/index.ts:118-209`

- [ ] **Step 1: 新增 `external-materials` DocType**

```typescript
export type DocType = 'progress' | 'review' | 'fable' | 'transcript' | 'external-materials'
```

- [ ] **Step 2: 在 `Frontmatter` 中新增可选 `topic` 字段**

```typescript
export type Frontmatter = {
  // ... existing fields ...
  topic?: string
}
```

- [ ] **Step 3: 新增搜索相关类型**

在 `src/types/index.ts` 中 `Message` 类型之前插入：

```typescript
export type SearchSource = {
  title: string
  url: string
  snippet?: string
}

export type SearchResult = {
  summary: string
  sources: SearchSource[]
}

export type SearchErrorCode =
  | 'MISSING_API_KEY'
  | 'NETWORK_ERROR'
  | 'LLM_ERROR'
  | 'NO_RESULTS'
```

- [ ] **Step 4: 在 `Session` 与 `UnsavedSession` 中增加搜索标志**

```typescript
// Session
export type Session = {
  // ... existing fields ...
  enableExternalMaterials?: boolean
}

// UnsavedSession
export type UnsavedSession = {
  // ... existing fields ...
  enableExternalMaterials?: boolean
}
```

- [ ] **Step 5: 在 `IpcApi` 中新增 search 与外部资料写入接口**

```typescript
searchPrepare: (args: { topic: string }) => Promise<SearchResult>
searchCheckConfig: () => Promise<{ configured: boolean }>
// ... existing ...
writeExternalMaterials: (args: {
  dirName: string
  sessionNumber: number
  topic: string
  summary: string
  sources: SearchSource[]
}) => Promise<void>
```

- [ ] **Step 6: 运行 TypeScript 检查**

Run: `npx tsc --noEmit`
Expected: PASS（此时只是类型声明，无实现）

- [ ] **Step 7: Commit**

```bash
git add src/types/index.ts
git commit -m "types: add external-materials doc type and search IPC types"
```

---

## Task 2: 实现 safeStorage 凭据封装

**Files:**
- Create: `electron/lib/credentials.ts`
- Create: `tests/credentials.test.ts`

- [ ] **Step 1: 创建 `electron/lib/credentials.ts`**

```typescript
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { safeStorage } from 'electron'

const CRED_DIR = path.join(os.homedir(), '.studyparlor')
const CRED_FILE = path.join(CRED_DIR, 'search-key.enc')

function ensureDir() {
  if (!fs.existsSync(CRED_DIR)) {
    fs.mkdirSync(CRED_DIR, { recursive: true })
  }
}

export async function setSearchApiKey(key: string): Promise<void> {
  ensureDir()
  const encrypted = safeStorage.encryptString(key)
  fs.writeFileSync(CRED_FILE, encrypted)
}

export async function getSearchApiKey(): Promise<string | null> {
  if (!fs.existsSync(CRED_FILE)) return null
  const encrypted = fs.readFileSync(CRED_FILE)
  try {
    return safeStorage.decryptString(encrypted)
  } catch (err) {
    console.error('[credentials] failed to decrypt search key:', err)
    return null
  }
}

export async function hasSearchApiKey(): Promise<boolean> {
  return fs.existsSync(CRED_FILE)
}
```

- [ ] **Step 2: 编写 `tests/credentials.test.ts` 骨架**

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'

const TEST_DIR = path.join(os.tmpdir(), 'study-parlor-credentials-test')

vi.mock('electron', () => ({
  safeStorage: {
    encryptString: (s: string) => Buffer.from(`enc:${s}`),
    decryptString: (b: Buffer) => b.toString().replace(/^enc:/, '')
  }
}))

vi.mock('../electron/lib/credentials', async () => {
  const actual = await vi.importActual<typeof import('../electron/lib/credentials')>('../electron/lib/credentials')
  return actual
})

describe('credentials', () => {
  beforeEach(() => {
    if (fs.existsSync(TEST_DIR)) fs.rmSync(TEST_DIR, { recursive: true })
    fs.mkdirSync(TEST_DIR, { recursive: true })
  })
  afterEach(() => {
    if (fs.existsSync(TEST_DIR)) fs.rmSync(TEST_DIR, { recursive: true })
  })

  it('placeholder', () => {
    expect(true).toBe(true)
  })
})
```

- [ ] **Step 3: 运行测试**

Run: `npx vitest run tests/credentials.test.ts`
Expected: PASS（仅 placeholder）

- [ ] **Step 4: Commit**

```bash
git add electron/lib/credentials.ts tests/credentials.test.ts
git commit -m "feat(search): add safeStorage-based Tavily key storage"
```

---

## Task 3: 实现 Tavily 搜索模块

**Files:**
- Create: `electron/lib/search.ts`
- Create: `tests/search.test.ts`
- Modify: `electron/lib/extract-json.ts`（确认有 `extractJsonArray`，无需修改）

- [ ] **Step 1: 创建 `electron/lib/search.ts`**

```typescript
import { chatNonStream } from './kimi'
import { extractJsonArray } from './extract-json'
import type { AppConfig } from '../env'
import type { SearchSource, SearchResult } from '@shared/index'

const TAVILY_API_URL = 'https://api.tavily.com/search'

export type TavilySearchOptions = {
  query: string
  apiKey: string
  baseUrl?: string
  maxResults?: number
}

export type TavilyResult = {
  title: string
  url: string
  content: string
  score?: number
}

export async function searchWeb(opts: TavilySearchOptions): Promise<TavilyResult[]> {
  const url = opts.baseUrl || TAVILY_API_URL
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      api_key: opts.apiKey,
      query: opts.query,
      search_depth: 'basic',
      max_results: opts.maxResults ?? 5,
      include_answer: false
    })
  })
  if (!res.ok) {
    throw new Error(`Tavily search failed: ${res.status} ${await res.text()}`)
  }
  const data = await res.json() as { results?: TavilyResult[] }
  if (!data.results || data.results.length === 0) {
    throw new Error('NO_RESULTS')
  }
  return data.results
}

export async function generateSearchQueries(
  cfg: AppConfig,
  topic: string
): Promise<string[]> {
  const prompt = `用户将要学习主题为："${topic}"

请生成 3 个搜索查询词，用于帮助一位苏格拉底式导师准备该主题的背景资料。

要求：
- 查询词应覆盖主题的核心概念、常见误解、实际应用
- 每个查询词简短，适合交给搜索引擎
- 只输出 JSON 数组，不要解释

输出格式：
["查询1", "查询2", "查询3"]`

  const text = await chatNonStream(cfg, {
    messages: [{ role: 'user', content: prompt }],
    temperature: 0.3,
    thinking: { type: 'disabled' }
  })
  const extracted = extractJsonArray(text)
  if (!extracted) throw new Error('JSON extraction failed')
  const arr = JSON.parse(extracted) as string[]
  return arr.filter(q => typeof q === 'string').slice(0, 3)
}

export async function generateTutorBrief(
  cfg: AppConfig,
  topic: string,
  results: TavilyResult[]
): Promise<SearchResult> {
  const sourcesText = results.map((r, i) =>
    `[${i + 1}] ${r.title}\nURL: ${r.url}\n摘要：${r.content}`
  ).join('\n\n')

  const prompt = `你是一位苏格拉底式导师的备课助手。以下是从网络搜索得到的关于 "${topic}" 的原始资料。

请整理成一份"导师备课笔记"，用于后续辅导时作为背景知识。

要求：
1. 控制在 3000 中文字以内
2. 包含：核心概念（2-4 个）、关键区分点、常见误解（2-3 个）、应用场景（1-2 个）、前置知识
3. 每个关键观点后附上原始来源编号 [1] [2] ...
4. 不要写成"教学大纲"，而要写成"导师知道但不直接告诉学生"的背景笔记

原始资料：
${sourcesText}`

  const summary = await chatNonStream(cfg, {
    messages: [{ role: 'user', content: prompt }],
    temperature: 0.3,
    thinking: { type: 'disabled' }
  })

  const sources: SearchSource[] = results.map(r => ({
    title: r.title,
    url: r.url,
    snippet: r.content.slice(0, 200)
  }))

  return { summary: summary.trim(), sources }
}
```

- [ ] **Step 2: 创建 `tests/search.test.ts` 骨架**

```typescript
import { describe, it, expect, vi } from 'vitest'
import { searchWeb, generateSearchQueries, generateTutorBrief } from '../electron/lib/search'

vi.stubGlobal('fetch', vi.fn())

describe('searchWeb', () => {
  it('returns results on success', async () => {
    const mockFetch = vi.mocked(fetch)
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        results: [
          { title: 'Test', url: 'https://example.com', content: 'snippet' }
        ]
      })
    } as Response)

    const results = await searchWeb({
      query: 'test',
      apiKey: 'key',
      maxResults: 3
    })

    expect(results).toHaveLength(1)
    expect(results[0].title).toBe('Test')
  })

  it('throws NO_RESULTS when empty', async () => {
    const mockFetch = vi.mocked(fetch)
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ results: [] })
    } as Response)

    await expect(searchWeb({ query: 'test', apiKey: 'key' }))
      .rejects.toThrow('NO_RESULTS')
  })
})

describe('generateSearchQueries', () => {
  it('placeholder', () => {
    expect(true).toBe(true)
  })
})

describe('generateTutorBrief', () => {
  it('placeholder', () => {
    expect(true).toBe(true)
  })
})
```

- [ ] **Step 3: 运行测试**

Run: `npx vitest run tests/search.test.ts`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add electron/lib/search.ts tests/search.test.ts
git commit -m "feat(search): add Tavily client and LLM query/brief generation"
```

---

## Task 4: 实现 Search IPC Handler

**Files:**
- Create: `electron/ipc/search.ts`
- Modify: `electron/main.ts`（注册 search IPC，若不存在集中注册点）
- Create: `tests/search-ipc.test.ts`

- [ ] **Step 1: 创建 `electron/ipc/search.ts`**

```typescript
import { ipcMain } from 'electron'
import type { AppConfig } from '../env'
import { getSearchApiKey } from '../lib/credentials'
import { generateSearchQueries, generateTutorBrief, searchWeb } from '../lib/search'
import type { SearchErrorCode, SearchResult } from '@shared/index'

export function registerSearchIpc(cfg: AppConfig) {
  ipcMain.handle('search:checkConfig', async (): Promise<{ configured: boolean }> => {
    const key = await getSearchApiKey()
    return { configured: !!key }
  })

  ipcMain.handle('search:prepare', async (_, args: { topic: string }): Promise<SearchResult> => {
    const apiKey = await getSearchApiKey()
    if (!apiKey) {
      const err = new Error('Tavily API key not configured')
      ;(err as Error & { code: SearchErrorCode }).code = 'MISSING_API_KEY'
      throw err
    }

    let queries: string[]
    try {
      queries = await generateSearchQueries(cfg, args.topic)
    } catch (e) {
      const err = new Error(`Failed to generate search queries: ${e}`)
      ;(err as Error & { code: SearchErrorCode }).code = 'LLM_ERROR'
      throw err
    }

    let allResults: Awaited<ReturnType<typeof searchWeb>> = []
    let lastError: unknown
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const results = await Promise.all(
          queries.map(q => searchWeb({ query: q, apiKey, maxResults: 5 }))
        )
        allResults = results.flat()
        break
      } catch (e) {
        lastError = e
        if (attempt === 0) continue
      }
    }

    if (allResults.length === 0) {
      const message = lastError instanceof Error ? lastError.message : 'Unknown error'
      const err = new Error(message)
      ;(err as Error & { code: SearchErrorCode }).code = message === 'NO_RESULTS' ? 'NO_RESULTS' : 'NETWORK_ERROR'
      throw err
    }

    try {
      return await generateTutorBrief(cfg, args.topic, allResults)
    } catch (e) {
      const err = new Error(`Failed to generate tutor brief: ${e}`)
      ;(err as Error & { code: SearchErrorCode }).code = 'LLM_ERROR'
      throw err
    }
  })
}
```

- [ ] **Step 2: 在 `electron/main.ts` 中注册 search IPC**

找到 `registerAllIpc()` 或类似函数，添加：

```typescript
import { registerSearchIpc } from './ipc/search'

function registerAllIpc() {
  // ... existing registrations ...
  registerSearchIpc(cfg)
}
```

- [ ] **Step 3: 创建 `tests/search-ipc.test.ts` 骨架**

```typescript
import { describe, it, expect, vi } from 'vitest'

describe('search IPC', () => {
  it('placeholder', () => {
    expect(true).toBe(true)
  })
})
```

- [ ] **Step 4: 运行测试**

Run: `npx vitest run tests/search-ipc.test.ts tests/credentials.test.ts tests/search.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add electron/ipc/search.ts electron/main.ts tests/search-ipc.test.ts
git commit -m "feat(search): add search IPC handlers with retry logic"
```

---

## Task 5: 更新 Prompt 装配链

**Files:**
- Modify: `electron/lib/prompts.ts:21-29`
- Modify: `electron/lib/prompts.ts:31-67`
- Modify: `tests/prompts.test.ts`

- [ ] **Step 1: 扩展 `AssembleArgs` 类型**

```typescript
export type AssembleArgs = {
  mode: Mode
  difficulty: Difficulty
  profile: Profile
  reviewFileBody?: string
  progressSummary?: string
  selectedTopic?: string
  userRequirement?: string
  externalMaterialsSummary?: string
}
```

- [ ] **Step 2: 在 `assemblePrompt` 中注入外部资料摘要**

在 `directionParts` 处理之后、`mode-review.md` / `mode-progress.md` 之前插入：

```typescript
if (args.externalMaterialsSummary) {
  parts.push(`【外部参考资料】\n${args.externalMaterialsSummary}\n\n以上资料仅供你作为背景知识使用。请继续以苏格拉底方式引导用户，不要直接引用资料给出答案。`)
}
```

完整位置：在步骤 2 `【本次学习方向】` 之后、步骤 3 `mode-review.md` 之前。

- [ ] **Step 3: 更新 `tests/prompts.test.ts`（若存在外部资料相关测试）**

添加测试：

```typescript
it('includes external materials summary when provided', () => {
  const prompt = assemblePrompt({
    mode: 'progress',
    difficulty: 'mid',
    profile: { name: 'Test', profile_text: 'test', preferred_topics: [] },
    selectedTopic: '导数',
    externalMaterialsSummary: '导数是变化率。'
  })
  expect(prompt).toContain('【外部参考资料】')
  expect(prompt).toContain('导数是变化率')
})
```

- [ ] **Step 4: 运行测试**

Run: `npx vitest run tests/prompts.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add electron/lib/prompts.ts tests/prompts.test.ts
git commit -m "feat(prompts): inject external materials summary into system prompt"
```

---

## Task 6: 更新 LLM IPC 透传外部资料摘要

**Files:**
- Modify: `electron/ipc/llm.ts:16-58`
- Modify: `src/types/index.ts:125`

- [ ] **Step 1: 扩展 `llm:start` 参数类型**

```typescript
llmStart: (args: {
  sessionId: string
  mode: Mode
  difficulty: Difficulty
  profile: Profile
  reviewFileBody?: string
  progressSummary?: string
  history: Message[]
  temperature: number
  selectedTopic?: string
  userRequirement?: string
  externalMaterialsSummary?: string
}) => Promise<void>
```

- [ ] **Step 2: 在 `electron/ipc/llm.ts` 中透传参数**

```typescript
ipcMain.handle('llm:start', async (_, args: {
  sessionId: string
  mode: Mode
  difficulty: Difficulty
  profile: Profile
  reviewFileBody?: string
  progressSummary?: string
  history: Message[]
  temperature: number
  selectedTopic?: string
  userRequirement?: string
  externalMaterialsSummary?: string
}) => {
  // ... existing setup ...
  const system = assemblePrompt({
    mode: args.mode,
    difficulty: args.difficulty,
    profile: args.profile,
    reviewFileBody: args.reviewFileBody,
    progressSummary: args.progressSummary,
    selectedTopic: args.selectedTopic,
    userRequirement: args.userRequirement,
    externalMaterialsSummary: args.externalMaterialsSummary
  })
  // ... rest unchanged ...
})
```

- [ ] **Step 3: 运行 TypeScript 检查**

Run: `npx tsc --noEmit`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add electron/ipc/llm.ts src/types/index.ts
git commit -m "feat(llm): pass externalMaterialsSummary through llm:start"
```

---

## Task 7: 更新 Session Runtime 透传摘要

**Files:**
- Modify: `src/lib/session-runtime.ts:33-88`
- Modify: `src/lib/session-runtime.ts:112-153`

- [ ] **Step 1: 在 `kickoffSession` 中读取外部资料摘要**

```typescript
export async function kickoffSession() {
  const s = useStore.getState()
  if (!s.session) return

  let history = s.session.history
  let reviewFileBody: string | undefined
  let progressSummary: string | undefined
  let externalMaterialsSummary: string | undefined

  if (s.session.mode === 'progress' && history.length === 0) {
    // ... existing history setup ...

    // 继续学习：读取锚点文件的 progress_summary
    if (s.session.dirName) {
      // ... existing ...
    }

    // 使用本次搜索到的外部资料
    externalMaterialsSummary = s.externalMaterials?.summary
  } else if (s.session.mode === 'review') {
    // ... existing review setup ...
    // review 模式复用历史外部资料
    externalMaterialsSummary = s.externalMaterials?.summary
  }

  try {
    await ipc.llmStart({
      sessionId: s.session.abortId,
      mode: s.session.mode,
      difficulty: s.session.difficulty,
      profile: s.profile,
      reviewFileBody,
      progressSummary,
      externalMaterialsSummary,
      history,
      temperature: s.session.temperature,
      selectedTopic: s.session.selectedTopic,
      userRequirement: s.session.userRequirement
    })
  } catch (err: any) {
    // ... existing error handling ...
  }
}
```

- [ ] **Step 2: 在 `sendOrInterrupt` 中同样透传**

在两次 `ipc.llmStart` 调用处都增加：

```typescript
externalMaterialsSummary: state.session!.externalMaterials?.summary ?? state.externalMaterials?.summary
```

实际上 `Session` 对象不持有 `externalMaterials`，它只存在于 store 顶层。因此统一使用 `useStore.getState().externalMaterials?.summary`。

修改后的 `llmStart` 调用：

```typescript
const externalMaterialsSummary = useStore.getState().externalMaterials?.summary

await ipc.llmStart({
  // ... existing args ...
  externalMaterialsSummary
})
```

- [ ] **Step 3: 运行 TypeScript 检查**

Run: `npx tsc --noEmit`
Expected: PASS（此时 store 上还没有 `externalMaterials`，会报错，下一步添加）

> 注：若此步 TypeScript 报错，属于预期，下一步修复。

- [ ] **Step 4: Commit**

```bash
git add src/lib/session-runtime.ts
git commit -m "feat(session-runtime): wire externalMaterialsSummary to llmStart"
```

---

## Task 8: 在 Store 中新增外部资料状态

**Files:**
- Modify: `src/store/index.ts:30-129`
- Modify: `src/store/index.ts:131-155`
- Modify: `src/store/index.ts:201-218`
- Modify: `src/store/index.ts:284-326`
- Modify: `src/store/index.ts:308-326`

- [ ] **Step 1: 在 `AppStore` 类型中新增状态**

在 `// 临时` 区域添加：

```typescript
externalMaterials: {
  summary: string
  sources: SearchSource[]
} | null
```

在 `// 操作` 区域添加：

```typescript
setExternalMaterials: (m: { summary: string; sources: SearchSource[] } | null) => void
prepareExternalMaterials: (topic: string) => Promise<void>
```

- [ ] **Step 2: 初始化 `externalMaterials: null`**

- [ ] **Step 3: 实现 `setExternalMaterials`**

```typescript
setExternalMaterials: (externalMaterials) => set({ externalMaterials })
```

- [ ] **Step 4: 实现 `prepareExternalMaterials`**

```typescript
prepareExternalMaterials: async (topic) => {
  try {
    const result = await ipc.searchPrepare({ topic })
    set({ externalMaterials: { summary: result.summary, sources: result.sources } })
  } catch (err: any) {
    const code = err?.code || 'NETWORK_ERROR'
    const message = {
      MISSING_API_KEY: '未配置 Tavily API Key',
      NETWORK_ERROR: '外部资料获取失败，本次不使用联网内容',
      LLM_ERROR: '资料整理失败，本次不使用联网内容',
      NO_RESULTS: '未找到相关外部资料'
    }[code as string] || '外部资料获取失败'
    useStore.getState().showToast(message)
    set({ externalMaterials: null })
  }
}
```

- [ ] **Step 5: 在 `startSession` 中接收 `enableExternalMaterials` 并清空旧状态**

```typescript
startSession: (a) => {
  // ...
  set({
    // ...
    externalMaterials: null,
    session: {
      // ...
      enableExternalMaterials: a.enableExternalMaterials
    }
  })
}
```

- [ ] **Step 6: 在 `saveCurrentSession` 中持久化标志**

```typescript
const unsaved: UnsavedSession = {
  // ...
  enableExternalMaterials: s.enableExternalMaterials
}
```

- [ ] **Step 7: 在 `restoreSession` 中恢复标志**

```typescript
set({
  session: {
    // ...
    enableExternalMaterials: unsaved.enableExternalMaterials
  }
})
```

- [ ] **Step 8: 运行 TypeScript 检查**

Run: `npx tsc --noEmit`
Expected: PASS

- [ ] **Step 9: Commit**

```bash
git add src/store/index.ts
git commit -m "feat(store): add externalMaterials state and prepare action"
```

---

## Task 9: 更新 PreStudy 模态增加搜索开关

**Files:**
- Modify: `src/components/PreStudyModal.tsx:98-111`
- Modify: `src/components/PreStudyModal.tsx:119-177`
- Modify: `src/components/PreStudyModal.tsx:207-245`
- Modify: `src/types/index.ts:84-95`
- Modify: `src/store/index.ts:81-88`

- [ ] **Step 1: 在 `PreStudyModal` 状态中添加开关**

```typescript
const [enableExternalMaterials, setEnableExternalMaterials] = useState(false)
const [searchConfigChecked, setSearchConfigChecked] = useState(false)
```

- [ ] **Step 2: 在 modal 打开时重置开关并检查配置**

在 `useEffect`（modal opens）中添加：

```typescript
setEnableExternalMaterials(false)
setSearchConfigChecked(false)
ipc.searchCheckConfig().then(r => setSearchConfigChecked(r.configured))
```

- [ ] **Step 3: 在 UI 中增加开关（仅 progress 模式）**

在“附加要求”之后、难度选择之前插入：

```typescript
{args.mode === 'progress' && (
  <div className="flex items-start gap-3">
    <button
      type="button"
      onClick={() => {
        if (!searchConfigChecked) {
          useStore.getState().showToast('请先在设置中配置 Tavily API Key')
          return
        }
        setEnableExternalMaterials(v => !v)
      }}
      className={`mt-0.5 w-4 h-4 rounded border flex items-center justify-center transition-colors ${
        enableExternalMaterials
          ? 'bg-ember border-ember'
          : 'border-slate/40 hover:border-parchment/60'
      }`}
    >
      {enableExternalMaterials && <span className="text-ink text-xs">✓</span>}
    </button>
    <div className="flex-1">
      <div className="text-sm text-parchment">引入联网资料</div>
      <div className="text-xs text-parchment/50">
        开始时会搜索一次主题资料，作为本次对话的上下文
      </div>
    </div>
  </div>
)}
```

- [ ] **Step 4: 在 `onConfirm` 中传递开关值**

```typescript
startSession({
  // ...
  enableExternalMaterials: args.mode === 'progress' ? enableExternalMaterials : undefined
})
```

- [ ] **Step 5: 更新 `startSession` 类型签名接受该参数**

已在 Task 8 中完成。

- [ ] **Step 6: 运行开发服务器查看 UI**

Run: `npm run dev`
Expected: PreStudy 模态出现“引入联网资料”复选框

- [ ] **Step 7: Commit**

```bash
git add src/components/PreStudyModal.tsx
git commit -m "feat(ui): add external materials toggle in PreStudy modal"
```

---

## Task 10: 更新 Study 页面触发搜索并展示卡片

**Files:**
- Modify: `src/pages/Study.tsx:18-263`
- Create: `src/components/ExternalMaterialsCard.tsx`

- [ ] **Step 1: 创建 `src/components/ExternalMaterialsCard.tsx`**

```typescript
import { useState } from 'react'
import type { SearchSource } from '@shared/index'

type Props = {
  sources: SearchSource[]
  loading?: boolean
}

export function ExternalMaterialsCard({ sources, loading }: Props) {
  const [expanded, setExpanded] = useState(false)

  if (loading) {
    return (
      <div className="bg-ink/60 border border-slate/30 rounded-lg px-4 py-3 mb-4">
        <div className="text-sm text-parchment/60 flex items-center gap-2">
          <span className="inline-block w-4 h-4 border-2 border-parchment/30 border-t-ember rounded-full animate-spin" />
          外部资料收集中…
        </div>
      </div>
    )
  }

  if (sources.length === 0) return null

  return (
    <div className="bg-ink/60 border border-slate/30 rounded-lg px-4 py-3 mb-4">
      <button
        onClick={() => setExpanded(v => !v)}
        className="w-full flex items-center justify-between text-sm text-parchment/80 hover:text-parchment"
      >
        <span>外部资料 · {sources.length} 个来源</span>
        <span>{expanded ? '收起' : '展开'}</span>
      </button>
      {expanded && (
        <ul className="mt-2 space-y-2">
          {sources.map((s, i) => (
            <li key={i} className="text-xs text-parchment/70">
              <a
                href={s.url}
                target="_blank"
                rel="noreferrer"
                className="text-ember/80 hover:text-ember underline"
              >
                {s.title || s.url}
              </a>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
```

- [ ] **Step 2: 修改 `Study.tsx` 启动逻辑**

用以下逻辑替换现有的 `useEffect`（自动 kickoff）：

```typescript
const externalMaterials = useStore(s => s.externalMaterials)
const prepareExternalMaterials = useStore(s => s.prepareExternalMaterials)

useEffect(() => {
  attachSessionListeners()
  if (!session) return

  const needsSearch =
    session.mode === 'progress' &&
    session.enableExternalMaterials &&
    !externalMaterials &&
    session.history.length === 0 &&
    !session.streaming

  if (needsSearch) {
    prepareExternalMaterials(session.topic).finally(() => {
      // 搜索完成后启动对话
      kickoffSession().catch(err => useStore.getState().showToast('启动失败:' + err.message))
    })
  } else if (session.history.length === 0 && !session.streaming) {
    kickoffSession().catch(err => useStore.getState().showToast('启动失败:' + err.message))
  }
}, [session?.abortId])
```

- [ ] **Step 3: 在聊天记录上方渲染卡片**

在 `<div ref={scrollRef} ...>` 内的 `session.history.map` 之前插入：

```typescript
{session.enableExternalMaterials && (
  <ExternalMaterialsCard
    sources={externalMaterials?.sources ?? []}
    loading={!externalMaterials && session.history.length === 0}
  />
)}
```

- [ ] **Step 4: 导入组件**

```typescript
import { ExternalMaterialsCard } from '@/components/ExternalMaterialsCard'
```

- [ ] **Step 5: 运行开发服务器验证**

Run: `npm run dev`
Expected: 勾选“引入联网资料”后进入 Study，顶部显示加载中，随后显示来源卡片

- [ ] **Step 6: Commit**

```bash
git add src/components/ExternalMaterialsCard.tsx src/pages/Study.tsx
git commit -m "feat(ui): trigger search on Study mount and render materials card"
```

---

## Task 11: 更新 Settings 页面配置 Tavily Key

**Files:**
- Modify: `src/pages/Settings.tsx:9-110`
- Modify: `src/types/index.ts:118-209`

- [ ] **Step 1: 在 `IpcApi` 中确认已有凭据 IPC**

需要新增：

```typescript
setSearchApiKey: (key: string) => Promise<void>
```

- [ ] **Step 2: 实现 `electron/ipc/search.ts` 中的 `setSearchApiKey` handler**

```typescript
import { setSearchApiKey } from '../lib/credentials'

ipcMain.handle('search:setApiKey', async (_, key: string) => {
  await setSearchApiKey(key)
})
```

- [ ] **Step 3: 在 `Settings.tsx` 中增加 Tavily key 输入**

在“AI 服务”分组中，Model 输入之后添加：

```typescript
const [searchApiKey, setSearchApiKeyState] = useState('')
const [showSearchKey, setShowSearchKey] = useState(false)

// 在 initialConfig 加载后不需要读取 key（不可回显），保持为空
```

UI 部分：

```typescript
<div>
  <div className="text-[11px] text-parchment/60 font-sans mb-1">Tavily API Key</div>
  <div className="flex gap-2">
    <input
      type={showSearchKey ? 'text' : 'password'}
      value={searchApiKey}
      onChange={e => setSearchApiKeyState(e.target.value)}
      placeholder="tvly-..."
      className="flex-1 bg-ink/50 border border-slate/40 rounded-md px-3 py-2 text-sm text-parchment placeholder:text-parchment/30 focus:outline-none focus:border-ember/60"
    />
    <button
      type="button"
      onClick={() => setShowSearchKey(!showSearchKey)}
      className="px-3 py-2 border border-slate/40 rounded-md text-sm text-parchment/80 hover:text-parchment transition-colors shrink-0"
    >
      {showSearchKey ? '隐藏' : '显示'}
    </button>
  </div>
  <div className="text-xs text-parchment/40 mt-1">
    用于联网搜索功能，key 会加密存储在系统密钥库中，不会写入 .env。
  </div>
</div>
```

- [ ] **Step 4: 在 `handleSave` 中保存 Tavily key**

```typescript
if (searchApiKey.trim()) {
  await ipc.setSearchApiKey(searchApiKey.trim())
}
```

- [ ] **Step 5: 运行开发服务器验证**

Run: `npm run dev`
Expected: Settings 页面出现 Tavily API Key 输入框

- [ ] **Step 6: Commit**

```bash
git add src/pages/Settings.tsx electron/ipc/search.ts src/types/index.ts
git commit -m "feat(settings): add Tavily API key configuration UI"
```

---

## Task 12: 实现外部资料文件写入

**Files:**
- Modify: `electron/ipc/files.ts:310-327` 附近
- Modify: `electron/lib/frontmatter.ts:8-13`

- [ ] **Step 1: 在 `EXT_FIELDS` 中新增 `external-materials` 字段顺序**

```typescript
const EXT_FIELDS: Record<DocType, string[]> = {
  progress: ['session_number', 'difficulty', 'progress_summary', 'last_studied', 'review_count'],
  review: ['review_index', 'last_reviewed', 'source_title'],
  fable: ['source_topic'],
  transcript: ['session_number'],
  'external-materials': ['session_number', 'topic'],
}
```

- [ ] **Step 2: 在 `registerFilesIpc` 中新增 `files:writeExternalMaterials`**

```typescript
ipcMain.handle('files:writeExternalMaterials', async (_, args: {
  dirName: string
  sessionNumber: number
  topic: string
  summary: string
  sources: { title: string; url: string; snippet?: string }[]
}) => {
  validateDirName(args.dirName)
  const now = new Date()
  const topicDir = path.join(cfg.libraryPath, args.dirName)
  const sessionDir = path.join(topicDir, `s${args.sessionNumber}`)
  fs.mkdirSync(sessionDir, { recursive: true })
  const filePath = path.join(sessionDir, '外部资料.md')

  const sourceSection = args.sources.length > 0
    ? '\n\n## 来源\n' + args.sources.map((s, i) =>
        `${i + 1}. [${s.title}](${s.url})` +
        (s.snippet ? ` — ${s.snippet}` : '')
      ).join('\n')
    : ''

  const body = `## 摘要\n\n${args.summary}${sourceSection}`

  const fm = {
    title: '外部资料',
    type: 'external-materials' as const,
    created: now.toISOString(),
    tags: [] as string[],
    session_number: args.sessionNumber,
    topic: args.topic,
  }
  fs.writeFileSync(filePath, serializeFrontmatter('external-materials', fm, body), 'utf8')
})
```

- [ ] **Step 3: 在 `getSessionMeta` 中识别 `外部资料.md`**

```typescript
const externalMaterialsFile = files.find(n => n === '外部资料.md')
```

并在返回对象中增加：

```typescript
hasExternalMaterials: !!externalMaterialsFile,
externalMaterialsFile,
```

- [ ] **Step 4: 更新 `SessionMeta` 类型**

```typescript
export type SessionMeta = {
  // ... existing ...
  hasExternalMaterials: boolean
  externalMaterialsFile?: string
}
```

- [ ] **Step 5: 运行 TypeScript 检查**

Run: `npx tsc --noEmit`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add electron/ipc/files.ts electron/lib/frontmatter.ts src/types/index.ts
git commit -m "feat(files): add writeExternalMaterials handler and session meta"
```

---

## Task 13: 在 Finalize 中归档外部资料

**Files:**
- Modify: `src/lib/finalize.ts:27-90`

- [ ] **Step 1: 在 progress finalize 中写入外部资料**

在 `ipc.writeProgressMd` 之后、生成寓言之前插入：

```typescript
// 写入外部资料
if (s.externalMaterials) {
  try {
    await ipc.writeExternalMaterials({
      dirName,
      sessionNumber,
      topic: title,
      summary: s.externalMaterials.summary,
      sources: s.externalMaterials.sources
    })
  } catch (e) {
    console.warn('[finalize] external materials write failed:', e)
  }
}
```

- [ ] **Step 2: 运行 TypeScript 检查**

Run: `npx tsc --noEmit`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/lib/finalize.ts
git commit -m "feat(finalize): archive external materials during progress finalize"
```

---

## Task 14: Review 模式复用历史外部资料

**Files:**
- Modify: `src/lib/session-runtime.ts:56-66`
- Modify: `src/lib/session-runtime.ts:99-111`

- [ ] **Step 1: 在 review 模式 kickoff 时读取历史外部资料**

```typescript
} else if (s.session.mode === 'review') {
  if (!s.session.dirName) throw new Error('review session needs dirName')
  const { body } = await ipc.readAnchorFile(s.session.dirName)
  reviewFileBody = body
  useStore.setState(state => state.session
    ? { session: { ...state.session, streaming: true, reviewFileBody: body } }
    : state)

  // 读取最近一次 progress 的外部资料
  try {
    const topicMeta = s.library.find(t => t.dirName === s.session!.dirName)
    const latestSession = topicMeta?.sessions[topicMeta.sessions.length - 1]
    if (latestSession?.hasExternalMaterials) {
      const { content } = await ipc.readSessionFile({
        dirName: s.session.dirName,
        sessionNumber: latestSession.sessionNumber,
        fileName: '外部资料.md'
      })
      const summary = content.split('## 来源')[0].replace('## 摘要\n\n', '').trim()
      useStore.getState().setExternalMaterials({ summary, sources: [] })
    }
  } catch (err) {
    console.warn('[kickoff] failed to load historical external materials:', err)
  }
}
```

- [ ] **Step 2: 在 `sendOrInterrupt` 的 review 懒加载中也增加外部资料读取**

若 `externalMaterials` 为空且为 review 模式，尝试读取历史资料。

- [ ] **Step 3: Commit**

```bash
git add src/lib/session-runtime.ts
git commit -m "feat(review): load historical external materials in review mode"
```

---

## Task 15: 测试与验证

**Files:**
- Modify: `tests/search.test.ts`
- Modify: `tests/credentials.test.ts`
- Modify: `tests/prompts.test.ts`
- Modify: `tests/finalize.test.ts`（若存在）

- [ ] **Step 1: 补全 `tests/search.test.ts`**

为 `generateSearchQueries` 和 `generateTutorBrief` 添加 mock 测试。

- [ ] **Step 2: 补全 `tests/credentials.test.ts`**

测试 `setSearchApiKey` / `getSearchApiKey` 的加解密流程。

- [ ] **Step 3: 运行全部测试**

Run: `npm run test`
Expected: PASS（或新测试全部 PASS，旧测试无回归）

- [ ] **Step 4: 手动验证清单**

1. 在 Settings 输入 Tavily key，保存
2. 在 Home 新建 progress 主题，PreStudy 勾选“引入联网资料”
3. 进入 Study，看到“外部资料收集中…”，随后显示来源
4. 与 AI 对话，确认回答引用了外部资料背景
5. 点击“封存”，确认 `s1/外部资料.md` 已生成
6. 重新进入该主题的 review 模式，确认不触发搜索但顶部显示历史来源
7. 在 Settings 删除 key 后，PreStudy 点击开关提示配置 key

- [ ] **Step 5: Commit**

```bash
git add tests/
git commit -m "test(search): add unit tests for search, credentials and prompts"
```

---

## Task 16: 最终检查与清理

- [ ] **Step 1: 运行 TypeScript 全量检查**

Run: `npm run build`
Expected: PASS（执行完整 build）

- [ ] **Step 2: 运行 lint / format（若项目有配置）**

Run: `npm run test`
Expected: PASS

- [ ] **Step 3: 扫描 TODO / TBD / console.log**

Run: `npx grep -r "TODO\|TBD\|console.log" src electron --include="*.ts" --include="*.tsx"`
Expected: 无未清理的 TODO/TBD；console.log 仅在合理的错误日志处

- [ ] **Step 4: Commit 任何清理**

```bash
git add .
git commit -m "chore: final cleanup and type checks for web search feature"
```

---

## Self-Review Checklist

- [ ] **Spec coverage**: 每个设计决策都有对应任务实现
- [ ] **Placeholder scan**: 无 TODO/TBD/"implement later"
- [ ] **Type consistency**: `externalMaterialsSummary` / `enableExternalMaterials` 在所有调用处名称一致
- [ ] **IPC 注册**: `registerSearchIpc` 在 `electron/main.ts` 中被调用
- [ ] **错误处理**: Tavily 失败重试一次，toast 提示后降级
- [ ] **安全**: Tavily key 不写入 `.env`，使用 `safeStorage`

---

## Execution Handoff

**Plan complete and saved to `docs/superpowers/plans/2026-06-21-web-search.md`. Two execution options:**

**1. Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints

**Which approach?**
