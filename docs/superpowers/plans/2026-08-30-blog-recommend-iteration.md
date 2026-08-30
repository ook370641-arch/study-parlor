# 博客推荐功能迭代 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让推荐历史一眼看懂"为什么是这五篇"（核心方向 focus + 逐篇挂钩 picks 快照），收藏夹区域字号跟随面板 ± 按钮，并新增已读标记 + 收藏夹上方可折叠已读文件夹。

**Architecture:** 数据层在 `.collection.json` 加 `read[]` 字段、批次加 `focus`/`picks` 可选字段（旧数据无损兼容）；生成端阶段一 prompt 升 v2 输出 focus，批次快照 picks；渲染端 `BlogCollectionSection` 重排历史卡片并新增已读折叠区，全部字号改走 `BRIEFING_LIST_STYLES[briefingFontSize]`。

**Tech Stack:** Electron 主进程（blog-collection.ts / blog-recommend.ts / ipc/anthropic.ts）、React + Zustand、Vitest + @testing-library/react、Playwright E2E。

**Spec:** `docs/superpowers/specs/2026-08-30-blog-recommend-iteration-design.md`

## Global Constraints

- 只跑定向测试，禁止 `npx vitest run` 全量与全量 E2E（general §9）。
- IPC 变更按 types → handler → preload → facade → store → 组件 顺序同步（ipc-state §1）。
- 不新增字号常量、不新增设置项；复用 `BriefingFontSize` 与 `BRIEFING_LIST_STYLES`（ui-styling §6）。
- 组件文件只导出组件；helper 保持模块私有或放 `src/lib/`（ui-styling §10）。
- 所有新交互元素带 `data-testid`（e2e §5）。
- LLM JSON 输出走 extract → 校验链，禁止直接 `JSON.parse` 裸用（llm.md §4）。
- commit 信息风格：`<type>(<scope>): 中文描述`（参考 git log）。
- E2E 跑 `out/` 构建产物；`node scripts/e2e-changed.js --run` 会自动先构建（e2e §11）。

---

### Task 1: 类型契约 + collection 已读 CRUD（主进程数据层）

**Files:**
- Modify: `src/types/index.ts`（BlogCollectionEntry/BlogRecommendBatch/BlogCollectionFile 定义在 92-120 行；IpcApi 的 anthropicCollection* 在 780-784 行）
- Modify: `electron/lib/blog-collection.ts`
- Test: `tests/blog-collection.test.ts`

**Interfaces:**
- Produces（后续任务依赖）:
  - `BlogRecommendPick = { sourceUrl: string; title: string; filePath: string; reason: string; gap: string }`
  - `BlogReadEntry = { sourceUrl: string; title: string; filePath: string; readAt: string }`
  - `BlogRecommendBatch` 新增可选字段 `focus?: string`、`picks?: BlogRecommendPick[]`
  - `BlogCollectionFile` 新增必需字段 `read: BlogReadEntry[]`
  - `markRead(c: BlogCollectionFile, args: { sourceUrl: string; filePath: string; title: string }): BlogCollectionFile`（幂等，最新在前）
  - `removeRead(c: BlogCollectionFile, sourceUrl: string): BlogCollectionFile`
  - IpcApi 新增 `anthropicCollectionMarkRead` / `anthropicCollectionRemoveRead`

- [ ] **Step 1: 写失败测试**

在 `tests/blog-collection.test.ts` 顶部 import 处补 `markRead, removeRead`，并把 `empty()` 工厂改为含 `read`：

```ts
import {
  collectionPath, loadCollection, saveCollection,
  addManualEntry, removeEntry, applyRecommend, markRead, removeRead,
} from '../electron/lib/blog-collection'

const empty = (): BlogCollectionFile => ({ version: 1, entries: [], dismissed: [], history: [], read: [] })
```

文件末尾追加：

```ts
describe('loadCollection 兼容旧格式', () => {
  it('旧文件无 read 字段时缺省为空数组', () => {
    fs.mkdirSync(path.join(dir, 'Anthropic博客'), { recursive: true })
    fs.writeFileSync(collectionPath(dir), JSON.stringify({ version: 1, entries: [], dismissed: [], history: [] }))
    expect(loadCollection(dir).read).toEqual([])
  })
})

describe('markRead', () => {
  it('追加已读条目，最新在前', () => {
    const c = empty()
    const c2 = markRead(c, { sourceUrl: 'u1', filePath: 'a.md', title: 'A' })
    const c3 = markRead(c2, { sourceUrl: 'u2', filePath: 'b.md', title: 'B' })
    expect(c3.read.map(r => r.sourceUrl)).toEqual(['u2', 'u1'])
    expect(c3.read[0].readAt).toBeTruthy()
  })
  it('幂等：重复标记同 sourceUrl 返回原对象', () => {
    const c = markRead(empty(), { sourceUrl: 'u1', filePath: 'a.md', title: 'A' })
    expect(markRead(c, { sourceUrl: 'u1', filePath: 'a.md', title: 'A' })).toBe(c)
  })
})

describe('removeRead', () => {
  it('从已读列表移除，不影响 entries/dismissed', () => {
    const c: BlogCollectionFile = {
      ...empty(),
      entries: [{ sourceUrl: 'u1', filePath: 'a.md', title: 'A', addedAt: 'x', origin: 'manual' }],
      read: [{ sourceUrl: 'u1', filePath: 'a.md', title: 'A', readAt: 'x' }],
    }
    const c2 = removeRead(c, 'u1')
    expect(c2.read).toEqual([])
    expect(c2.entries).toHaveLength(1)
  })
  it('removeEntry 不动 read 列表', () => {
    const c: BlogCollectionFile = {
      ...empty(),
      entries: [{ sourceUrl: 'u1', filePath: 'a.md', title: 'A', addedAt: 'x', origin: 'manual' }],
      read: [{ sourceUrl: 'u1', filePath: 'a.md', title: 'A', readAt: 'x' }],
    }
    expect(removeEntry(c, 'u1').read).toHaveLength(1)
  })
})
```

注意：文件中其余构造 `BlogCollectionFile` 字面量的地方（`empty()` 以外的 `...empty()` 展开不受影响；第 79、86 行的 batch 字面量类型不变）无需改动。

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run tests/blog-collection.test.ts`
Expected: FAIL —— `markRead is not a function` / 类型报错（`empty()` 缺 `read` 字段）。

- [ ] **Step 3: 实现类型与 CRUD**

`src/types/index.ts` 在 `BlogCollectionOrigin`（92-93 行）后插入：

```ts
/** 推荐批次内单篇挑选快照（历史卡片逐篇挂钩用） */
export type BlogRecommendPick = {
  sourceUrl: string
  title: string
  filePath: string   // 与收藏夹条目同格式（推荐流程存 absPath）
  reason: string
  gap: string
}

/** 已读文章条目（所有已读文章，不限收藏夹内） */
export type BlogReadEntry = {
  sourceUrl: string   // 主键
  title: string
  filePath: string
  readAt: string      // ISO，首次标记时间
}
```

`BlogRecommendBatch`（106-113 行）改为：

```ts
export type BlogRecommendBatch = {
  batch: number
  generatedAt: string
  profile: string      // 用户画像（阶段一 LLM 输出）
  gaps: string[]       // 认知缺口
  queries: string[]    // 本次检索词
  searchUsed: boolean  // Tavily 是否可用（false = 降级纯本地匹配）
  focus?: string              // 核心需求方向一句话（v2 prompt 起）；旧批次无此字段
  picks?: BlogRecommendPick[] // 本批挑选快照；旧批次无此字段
}
```

`BlogCollectionFile`（115-120 行）改为：

```ts
export type BlogCollectionFile = {
  version: 1
  entries: BlogCollectionEntry[]
  dismissed: string[]      // 用户移除过的推荐 sourceUrl，后续批次不再推荐
  history: BlogRecommendBatch[]  // 往期推荐历史（含用户画像），最新在前
  read: BlogReadEntry[]    // 已读文章，最新在前；后续批次不再推荐
}
```

IpcApi（780-784 行）在 `anthropicCollectionRemove` 后插入：

```ts
    anthropicCollectionMarkRead: (args: { sourceUrl: string; filePath: string; title: string }) => Promise<{ ok: true; collection: BlogCollectionFile }>
    anthropicCollectionRemoveRead: (args: { sourceUrl: string }) => Promise<{ ok: true; collection: BlogCollectionFile }>
```

`electron/lib/blog-collection.ts`：import 行补 `BlogReadEntry`；`EMPTY` 与 `loadCollection` 补 read；文件末尾追加两个函数：

```ts
import type { BlogCollectionFile, BlogCollectionEntry, BlogRecommendBatch, BlogReadEntry } from '@shared/index'

const EMPTY: BlogCollectionFile = { version: 1, entries: [], dismissed: [], history: [], read: [] }

export function loadCollection(lib: string): BlogCollectionFile {
  const raw = safeReadJson<Partial<BlogCollectionFile>>(collectionPath(lib), { fallback: {} })
  if (raw.version !== 1) return { ...EMPTY }
  return {
    version: 1,
    entries: Array.isArray(raw.entries) ? raw.entries : [],
    dismissed: Array.isArray(raw.dismissed) ? raw.dismissed : [],
    history: Array.isArray(raw.history) ? raw.history : [],
    read: Array.isArray(raw.read) ? raw.read : [],
  }
}

/** 标记已读：幂等（已存在直接返回原对象），新条目插到最前 */
export function markRead(
  c: BlogCollectionFile,
  args: { sourceUrl: string; filePath: string; title: string }
): BlogCollectionFile {
  if (c.read.some(r => r.sourceUrl === args.sourceUrl)) return c
  const entry: BlogReadEntry = {
    sourceUrl: args.sourceUrl,
    filePath: args.filePath,
    title: args.title,
    readAt: new Date().toISOString(),
  }
  return { ...c, read: [entry, ...c.read] }
}

export function removeRead(c: BlogCollectionFile, sourceUrl: string): BlogCollectionFile {
  return { ...c, read: c.read.filter(r => r.sourceUrl !== sourceUrl) }
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `npx vitest run tests/blog-collection.test.ts`
Expected: PASS（全部用例）。

- [ ] **Step 5: Commit**

```bash
git add src/types/index.ts electron/lib/blog-collection.ts tests/blog-collection.test.ts
git commit -m "feat(blog): collection 数据层加已读 CRUD + 批次 focus/picks 类型契约"
```

---

### Task 2: 推荐生成端——prompt v2 + focus/picks 快照 + 已读排除

**Files:**
- Create: `electron/prompts/blog-profile-queries-v2.md`
- Modify: `electron/lib/blog-recommend.ts`（stageProfile 141-146、extractObjectWithRetry 128-139、runBlogRecommend 213-230）
- Modify: `electron/ipc/anthropic.ts:190-218`（E2E mock 分支）
- Test: `tests/blog-recommend.test.ts`

**Interfaces:**
- Consumes: Task 1 的 `BlogRecommendPick`、collection `read[]`。
- Produces:
  - `stageProfile` 返回 `{ focus: string; profile: string; gaps: string[]; queries: string[] }`（focus 缺失/非字符串 → `LLM_PARSE_ERROR`，走既有重试 2 次链）
  - `runBlogRecommend` 返回的 `batch` 必含 `focus` 与 `picks`（picks 元素含 filePath=pool 中的 absPath）
  - 候选池排除规则：`!col.dismissed.includes(url) && !col.read.some(r => r.sourceUrl === url)`

- [ ] **Step 1: 写失败测试**

`tests/blog-recommend.test.ts`：把所有 stageProfile 的 mock 响应补上 `focus` 字段（4 处：103、112、125、136 行附近的 `JSON.stringify({ profile: 'p', ... })` → `JSON.stringify({ focus: 'f', profile: 'p', ... })`），并追加：

```ts
it('批次携带 focus 与 picks 快照（含 title/filePath）', async () => {
  seedWriting(); seedPool()
  ;(getSearchApiKey as any).mockResolvedValue(null)
  ;(chatNonStream as any)
    .mockResolvedValueOnce(JSON.stringify({ focus: '评测集构建', profile: 'p', gaps: ['g'], queries: ['q'] }))
    .mockResolvedValueOnce(JSON.stringify([{ source_url: 'https://anthropic.com/a', reason: 'r', gap: 'g' }]))
  const r = await runBlogRecommend(cfg, {})
  expect(r.batch.focus).toBe('评测集构建')
  expect(r.batch.picks).toHaveLength(1)
  expect(r.batch.picks![0]).toMatchObject({
    sourceUrl: 'https://anthropic.com/a',
    reason: 'r',
    gap: 'g',
  })
  expect(r.batch.picks![0].filePath).toContain('x.md')
})

it('stageProfile 缺 focus 字段时抛 LLM_PARSE_ERROR', async () => {
  seedWriting(); seedPool()
  ;(getSearchApiKey as any).mockResolvedValue(null)
  ;(chatNonStream as any).mockResolvedValue(JSON.stringify({ profile: 'p', gaps: ['g'], queries: ['q'] }))
  await expect(runBlogRecommend(cfg, {})).rejects.toMatchObject({ code: 'LLM_PARSE_ERROR' })
})

it('已读的 URL 不出现在候选池', async () => {
  seedWriting(); seedPool()
  write(path.join(dir, 'Anthropic博客', '.collection.json'), JSON.stringify({
    version: 1, entries: [], dismissed: [], history: [],
    read: [{ sourceUrl: 'https://anthropic.com/a', title: 'A', filePath: 'x.md', readAt: 'x' }],
  }))
  ;(getSearchApiKey as any).mockResolvedValue(null)
  ;(chatNonStream as any)
    .mockResolvedValueOnce(JSON.stringify({ focus: 'f', profile: 'p', gaps: ['g'], queries: ['q'] }))
  await expect(runBlogRecommend(cfg, {})).rejects.toMatchObject({ code: 'NO_LOCAL_ARTICLES' })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run tests/blog-recommend.test.ts`
Expected: FAIL —— `batch.focus` 为 undefined、缺 focus 时不报错、read 不排除。

- [ ] **Step 3: 实现**

新建 `electron/prompts/blog-profile-queries-v2.md`（完整内容）：

```markdown
你是「学者夜话」的阅读画像师。用户在本地学习库的 writing/ 目录里持续写作，下面是其近期写作的摘要与部分原文。

写作摘要（按最近修改排序）：
{{summaries}}

近期原文节选：
{{recentBodies}}

请基于以上材料，输出一个 JSON 对象（不要用 markdown 代码块包裹），字段如下：
{
  "focus": "一句话（20-40字）点明用户当前的核心需求方向，具体可命名，不做抽象延伸",
  "profile": "一段 80-120 字的用户画像，描述其当前在思考什么、在学什么、认知状态如何",
  "gaps": ["认知缺口 1", "认知缺口 2", "认知缺口 3"],
  "queries": ["english search query 1", "english search query 2"]
}

要求：
- focus 是对整份材料的归结：用户此刻最需要解决的那一个问题方向。反面示例：「提升认知」「学习 AI」这类空泛表述禁止出现。
- profile 只依据给定材料，不臆造外部事实。
- gaps 为 2-3 条「作者尚未掌握、但对其当前主题至关重要」的具体知识点，可命名、不抽象延伸。
- queries 为 2 条英文检索词，面向 Anthropic 官方博客（anthropic.com / transformer-circuits.pub / claude.com），用其惯用术语（如 alignment、interpretability、RLHF、scaling、agents、tool use 等）。
```

`electron/lib/blog-recommend.ts`：

① `extractObjectWithRetry`（128-139 行）加可选形状校验参数：

```ts
async function extractObjectWithRetry<T>(
  cfg: AppConfig, prompt: string, tag: string, signal?: AbortSignal,
  validate?: (o: T) => boolean
): Promise<T> {
  for (let attempt = 0; attempt < 2; attempt++) {
    const text = await callJson(cfg, prompt, signal)
    const extracted = extractJsonObject(text)
    if (extracted) {
      try {
        const obj = JSON.parse(extracted) as T
        if (!validate || validate(obj)) return obj
        writeDebug(tag, prompt, text, extracted)
      } catch { writeDebug(tag, prompt, text, extracted) }
    } else {
      writeDebug(tag, prompt, text)
    }
  }
  throw codeError('LLM_PARSE_ERROR')
}
```

② `stageProfile`（141-146 行）改读 v2 并校验 focus：

```ts
async function stageProfile(cfg: AppConfig, ctx: ReturnType<typeof collectWritingContext>, signal?: AbortSignal) {
  const prompt = read('blog-profile-queries-v2.md')
    .replace('{{summaries}}', ctx.summaries.map((s, i) => `第${i + 1}篇《${s.title}》：${s.summary}`).join('\n'))
    .replace('{{recentBodies}}', ctx.recentBodies.map((b, i) => `[近期原文${i + 1}]\n${b}`).join('\n\n'))
  return extractObjectWithRetry<{ focus: string; profile: string; gaps: string[]; queries: string[] }>(
    cfg, prompt, 'blog-profile', signal,
    o => typeof o.focus === 'string' && o.focus.length > 0
      && typeof o.profile === 'string'
      && Array.isArray(o.gaps) && Array.isArray(o.queries)
  )
}
```

③ `runBlogRecommend` 候选池（214-217 行）加已读排除：

```ts
  const pool = collectLocalArticles(lib)
    .filter(a => !col.dismissed.includes(a.sourceUrl))
    .filter(a => !col.read.some(r => r.sourceUrl === a.sourceUrl))
    .sort((a, b) => (b.importedAt ?? '').localeCompare(a.importedAt ?? ''))
    .slice(0, 80)
```

④ batch 构造（222-229 行）补 focus/picks：

```ts
  const batch: BlogRecommendBatch = {
    batch: (col.history[0]?.batch ?? 0) + 1,
    generatedAt: new Date().toISOString(),
    focus: profile.focus,
    profile: profile.profile,
    gaps: profile.gaps ?? [],
    queries: profile.queries ?? [],
    searchUsed,
    picks: picks.map(p => {
      const a = pool.find(x => x.sourceUrl === p.sourceUrl)
      return { sourceUrl: p.sourceUrl, title: a?.title ?? p.sourceUrl, filePath: a?.absPath ?? '', reason: p.reason, gap: p.gap }
    }),
  }
```

⑤ `electron/ipc/anthropic.ts` E2E mock 分支（190-218 行）：mock 批次补 `focus`/`picks`，并把 mock 文章真实写盘（让 E2E 能打开阅读器验证自动已读）。文件顶部若无 `fs` import 则补 `import fs from 'fs'`：

```ts
        if (process.env.NODE_ENV === 'test' && process.env.E2E_CONFIG_DIR && process.env.E2E_ANTHROPIC_RECOMMEND === '1') {
          const col = loadCollection(cfg.libraryPath)
          const mockFilePath = path.join(cfg.libraryPath, 'Anthropic博客', '2026-08', 'e2e-recommend.md')
          fs.mkdirSync(path.dirname(mockFilePath), { recursive: true })
          fs.writeFileSync(mockFilePath, '---\ntype: anthropic-article\nsource_url: https://alignment.anthropic.com/e2e-recommend/\ntitle: E2E 推荐文章\n---\nE2E 正文', 'utf8')
          const batch: BlogRecommendBatch = {
            batch: (col.history[0]?.batch ?? 0) + 1,
            generatedAt: new Date().toISOString(),
            focus: 'E2E 核心方向',
            profile: 'E2E 画像：正在研究 AI 对齐',
            gaps: ['E2E 缺口'],
            queries: ['alignment'],
            searchUsed: false,
            picks: [{ sourceUrl: 'https://alignment.anthropic.com/e2e-recommend/', title: 'E2E 推荐文章', filePath: mockFilePath, reason: 'E2E 推荐理由', gap: 'E2E 缺口' }],
          }
          const pickEntries: BlogCollectionEntry[] = [{
            sourceUrl: 'https://alignment.anthropic.com/e2e-recommend/',
            filePath: mockFilePath,
            title: 'E2E 推荐文章',
            addedAt: new Date().toISOString(),
            origin: 'recommend' as const,
            reason: 'E2E 推荐理由',
            gap: 'E2E 缺口',
            batch: batch.batch,
          }]
          const next = applyRecommend(col, batch, pickEntries)
          saveCollection(cfg.libraryPath, next)
          send('anthropic:recommendStage', { stage: 'context' })
          setTimeout(() => {
            send('anthropic:recommendStage', { stage: 'pick' })
            send('anthropic:recommendDone', { ok: true, collection: next })
          }, 100)
          return
        }
```

同时确认该文件已 import `BlogRecommendBatch` 类型（没有则从 `@shared/index` 补入）。

- [ ] **Step 4: 跑测试确认通过**

Run: `npx vitest run tests/blog-recommend.test.ts`
Expected: PASS（全部用例）。

- [ ] **Step 5: Commit**

```bash
git add electron/prompts/blog-profile-queries-v2.md electron/lib/blog-recommend.ts electron/ipc/anthropic.ts tests/blog-recommend.test.ts
git commit -m "feat(blog): 推荐批次带 focus 核心方向 + picks 逐篇快照，已读文章不再入选"
```

---

### Task 3: IPC 链路——handler + preload + facade

**Files:**
- Modify: `electron/ipc/anthropic.ts`（在 174-178 的 collectionRemove handler 后插入）
- Modify: `electron/preload.ts`（在 128 行后插入）
- Modify: `src/lib/ipc.ts`（在 92 行后插入）
- Test: 运行时暴露由 Task 7 的 E2E 断言覆盖（ipc-state §1）

**Interfaces:**
- Consumes: Task 1 的 `markRead`/`removeRead` 与 IpcApi 类型。
- Produces: `ipc.anthropicCollectionMarkRead({ sourceUrl, filePath, title })` / `ipc.anthropicCollectionRemoveRead({ sourceUrl })`，均返回 `{ ok: true; collection: BlogCollectionFile }`。

- [ ] **Step 1: 主进程 handler**

`electron/ipc/anthropic.ts`：确认 import 行从 `../lib/blog-collection` 补 `markRead, removeRead`，在 `anthropic:collectionRemove` handler 后插入：

```ts
  ipcMain.handle('anthropic:collectionMarkRead', async (_, args: { sourceUrl: string; filePath: string; title: string }) => {
    const next = markRead(loadCollection(cfg.libraryPath), args)
    saveCollection(cfg.libraryPath, next)
    return { ok: true as const, collection: next }
  })

  ipcMain.handle('anthropic:collectionRemoveRead', async (_, args: { sourceUrl: string }) => {
    const next = removeRead(loadCollection(cfg.libraryPath), args.sourceUrl)
    saveCollection(cfg.libraryPath, next)
    return { ok: true as const, collection: next }
  })
```

- [ ] **Step 2: preload 暴露**

`electron/preload.ts` 在 `anthropicCollectionRemove`（128 行）后插入：

```ts
  anthropicCollectionMarkRead: (a) => ipcRenderer.invoke('anthropic:collectionMarkRead', a),
  anthropicCollectionRemoveRead: (a) => ipcRenderer.invoke('anthropic:collectionRemoveRead', a),
```

- [ ] **Step 3: facade getter**

`src/lib/ipc.ts` 在 `anthropicCollectionRemove`（92 行）后插入：

```ts
  get anthropicCollectionMarkRead() { return ensure().anthropicCollectionMarkRead },
  get anthropicCollectionRemoveRead() { return ensure().anthropicCollectionRemoveRead },
```

- [ ] **Step 4: 类型检查**

Run: `npx tsc --noEmit -p tsconfig.json`（若项目无根 tsc 脚本则用 `npx electron-vite build` 验证编译）
Expected: 通过，无 `anthropicCollectionMarkRead` 相关类型错误。

- [ ] **Step 5: Commit**

```bash
git add electron/ipc/anthropic.ts electron/preload.ts src/lib/ipc.ts
git commit -m "feat(blog): IPC 链路新增 collectionMarkRead/collectionRemoveRead"
```

---

### Task 4: store actions + 打开阅读器自动已读

**Files:**
- Create: `src/lib/blog-read-lookup.ts`
- Modify: `src/store/index.ts`（openAnthropicReader 1447-1451；collection actions 1484-1498；blogCollection 初始值 595 行附近；Actions 接口声明区）
- Test: `tests/blog-read-lookup.test.ts`

**Interfaces:**
- Consumes: Task 3 的 `ipc.anthropicCollectionMarkRead/RemoveRead`。
- Produces:
  - `findReadTarget(filePath: string, sources: { entries: BlogCollectionEntry[]; articles: AnthropicArticleMeta[] }): { sourceUrl: string; title: string; filePath: string } | null`
  - store actions：`markBlogRead(args: { sourceUrl: string; filePath: string; title: string }): Promise<void>`、`removeBlogRead(sourceUrl: string): Promise<void>`、`toggleBlogRead(args: { sourceUrl: string; filePath: string; title: string }): Promise<void>`
  - `openAnthropicReader` 自动已读副作用

- [ ] **Step 1: 写失败测试**

新建 `tests/blog-read-lookup.test.ts`：

```ts
import { describe, it, expect } from 'vitest'
import { findReadTarget } from '../src/lib/blog-read-lookup'
import type { BlogCollectionEntry, AnthropicArticleMeta } from '../src/types'

const entry = (over: Partial<BlogCollectionEntry> = {}): BlogCollectionEntry => ({
  sourceUrl: 'https://anthropic.com/a', filePath: 'lib/a.md', title: 'A', addedAt: 'x', origin: 'manual', ...over,
})
const article = (over: Partial<AnthropicArticleMeta> = {}): AnthropicArticleMeta => ({
  url: 'https://anthropic.com/b', title: 'B', summary: null, publishedAt: null, imageUrl: null,
  isSaved: true, filePath: 'lib/b.md', ...over,
} as AnthropicArticleMeta)

describe('findReadTarget', () => {
  it('收藏夹条目命中优先', () => {
    const t = findReadTarget('lib/a.md', { entries: [entry()], articles: [article({ filePath: 'lib/a.md' })] })
    expect(t).toEqual({ sourceUrl: 'https://anthropic.com/a', title: 'A', filePath: 'lib/a.md' })
  })
  it('收藏夹未命中时回退文章缓存', () => {
    const t = findReadTarget('lib/b.md', { entries: [], articles: [article()] })
    expect(t).toEqual({ sourceUrl: 'https://anthropic.com/b', title: 'B', filePath: 'lib/b.md' })
  })
  it('两处都查不到返回 null', () => {
    expect(findReadTarget('lib/z.md', { entries: [], articles: [] })).toBeNull()
  })
  it('缓存中未保存（无 filePath）的文章不命中', () => {
    const t = findReadTarget('lib/b.md', { entries: [], articles: [article({ isSaved: false, filePath: undefined })] })
    expect(t).toBeNull()
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run tests/blog-read-lookup.test.ts`
Expected: FAIL —— 模块不存在。

- [ ] **Step 3: 实现 lookup + store actions**

新建 `src/lib/blog-read-lookup.ts`：

```ts
import type { BlogCollectionEntry, AnthropicArticleMeta } from '@shared/index'

/** 由 filePath 反查已读标记所需的 sourceUrl/title：收藏夹优先，回退文章缓存。
 *  两处都查不到（文章不在缓存也不在收藏夹）返回 null，调用方跳过自动标记。 */
export function findReadTarget(
  filePath: string,
  sources: { entries: BlogCollectionEntry[]; articles: AnthropicArticleMeta[] }
): { sourceUrl: string; title: string; filePath: string } | null {
  const e = sources.entries.find(x => x.filePath === filePath)
  if (e) return { sourceUrl: e.sourceUrl, title: e.title, filePath }
  const a = sources.articles.find(x => x.isSaved && x.filePath === filePath)
  if (a) return { sourceUrl: a.url, title: a.title, filePath }
  return null
}
```

`src/store/index.ts`：

① `blogCollection` 初始值（595 行附近）补 `read: []`：

```ts
  blogCollection: { version: 1, entries: [], dismissed: [], history: [], read: [] },
```

② Actions 接口声明区（找到 `removeBlogCollection` 的声明处）补三个签名：

```ts
  markBlogRead: (args: { sourceUrl: string; filePath: string; title: string }) => Promise<void>
  removeBlogRead: (sourceUrl: string) => Promise<void>
  toggleBlogRead: (args: { sourceUrl: string; filePath: string; title: string }) => Promise<void>
```

③ `openAnthropicReader`（1447-1451 行）改为：

```ts
  openAnthropicReader: async (filePath) => {
    const now = new Date().toISOString()
    set({ anthropicReaderFilePath: filePath, anthropicBlogLastSeenAt: now, constitutionReportOpen: false })
    await ipc.patchState({ anthropicBlogLastSeenAt: now } as Partial<StateJson>)
    // 自动已读：能反查到 sourceUrl 且尚未标记时才调用
    const s = get()
    if (!s.blogCollection.read.some(r => r.filePath === filePath)) {
      const target = findReadTarget(filePath, { entries: s.blogCollection.entries, articles: s.anthropicBlogCache.articles })
      if (target) await s.markBlogRead(target)
    }
  },
```

④ 在 `removeBlogCollection`（1495-1498 行）后插入：

```ts
  markBlogRead: async (args) => {
    if (get().blogCollection.read.some(r => r.sourceUrl === args.sourceUrl)) return
    const r = await ipc.anthropicCollectionMarkRead(args)
    if (r.ok) set({ blogCollection: r.collection })
  },
  removeBlogRead: async (sourceUrl) => {
    const r = await ipc.anthropicCollectionRemoveRead({ sourceUrl })
    if (r.ok) set({ blogCollection: r.collection })
  },
  toggleBlogRead: async (args) => {
    if (get().blogCollection.read.some(r => r.sourceUrl === args.sourceUrl)) {
      await get().removeBlogRead(args.sourceUrl)
    } else {
      await get().markBlogRead(args)
    }
  },
```

⑤ 文件顶部 import 补 `findReadTarget`：

```ts
import { findReadTarget } from '@/lib/blog-read-lookup'
```

- [ ] **Step 4: 跑测试确认通过**

Run: `npx vitest run tests/blog-read-lookup.test.ts`
Expected: PASS。

- [ ] **Step 5: Commit**

```bash
git add src/lib/blog-read-lookup.ts src/store/index.ts tests/blog-read-lookup.test.ts
git commit -m "feat(blog): store 已读 actions + 打开阅读器自动标记已读"
```

---

### Task 5: BlogCollectionSection UI——已读文件夹 + 历史卡片重排 + 字号跟随

**Files:**
- Modify: `src/components/anthropic/BlogCollectionSection.tsx`（整体重写渲染层，约 140 行）
- Test: `tests/blog-collection-section.test.tsx`（新建）

**Interfaces:**
- Consumes: Task 4 的 `removeBlogRead`、`openAnthropicReader`（含自动已读副作用）、`blogCollection.read`；Task 2 的 `batch.focus`/`batch.picks`。
- Produces（E2E/组件测试依赖的 testid）：
  - `blog-read-section`、`blog-read-toggle`、`blog-read-open-<sourceUrl>`、`blog-read-remove-<sourceUrl>`
  - `blog-history-pick-<sourceUrl>`
  - 既有 testid 全部保留：`blog-collection-section`、`blog-collection-collapse`、`blog-recommend-button`、`blog-recommend-history`、`blog-collection-empty`、`blog-collection-open-*`、`blog-collection-reason-*`、`blog-collection-remove-*`

- [ ] **Step 1: 写失败测试**

新建 `tests/blog-collection-section.test.tsx`：

```tsx
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react'

const mockIpc = {
  readMd: vi.fn().mockResolvedValue({ frontmatter: { title: 'x' }, body: '正文' }),
  anthropicCollectionRemoveRead: vi.fn().mockResolvedValue({ ok: true, collection: { version: 1, entries: [], dismissed: [], history: [], read: [] } }),
}
vi.mock('@/lib/ipc', () => ({ ipc: mockIpc }))

import { useStore } from '@/store'
import { BlogCollectionSection } from '@/components/anthropic/BlogCollectionSection'
import type { BlogCollectionFile } from '@/types'

const newBatchCollection: BlogCollectionFile = {
  version: 1,
  entries: [],
  dismissed: [],
  history: [{
    batch: 2,
    generatedAt: '2026-08-30T00:15:50.000Z',
    focus: '构建 coding agent 评测集的原则',
    profile: '画像散文',
    gaps: ['缺口一'],
    queries: ['evaluation'],
    searchUsed: true,
    picks: [{ sourceUrl: 'https://anthropic.com/a', title: '文章甲', filePath: 'lib/a.md', reason: '理由甲', gap: '缺口一' }],
  }],
  read: [{ sourceUrl: 'https://anthropic.com/r', title: '已读文', filePath: 'lib/r.md', readAt: '2026-08-30T00:00:00.000Z' }],
}

const oldBatchCollection: BlogCollectionFile = {
  version: 1, entries: [], dismissed: [],
  history: [{ batch: 1, generatedAt: '2026-08-01T00:00:00.000Z', profile: '旧画像', gaps: ['旧缺口'], queries: ['q'], searchUsed: false }],
  read: [],
}

describe('BlogCollectionSection', () => {
  beforeEach(() => {
    cleanup()
    vi.clearAllMocks()
    useStore.setState({
      blogCollection: newBatchCollection,
      recommendRunning: false,
      recommendStage: null,
      briefingFontSize: 'base',
      openAnthropicReader: vi.fn(),
      showToast: vi.fn(),
    } as any)
  })

  it('新批次历史卡片显示核心方向与逐篇挂钩', () => {
    render(<BlogCollectionSection theme="academic" />)
    fireEvent.click(screen.getByTestId('blog-recommend-history'))
    expect(screen.getByText(/构建 coding agent 评测集的原则/)).toBeInTheDocument()
    expect(screen.getByTestId('blog-history-pick-https://anthropic.com/a')).toHaveTextContent('文章甲')
    expect(screen.getByText(/理由甲/)).toBeInTheDocument()
  })

  it('点击逐篇条目打开阅读器', async () => {
    const openReader = vi.fn()
    useStore.setState({ openAnthropicReader: openReader } as any)
    render(<BlogCollectionSection theme="academic" />)
    fireEvent.click(screen.getByTestId('blog-recommend-history'))
    fireEvent.click(screen.getByTestId('blog-history-pick-https://anthropic.com/a'))
    await waitFor(() => expect(mockIpc.readMd).toHaveBeenCalledWith('lib/a.md'))
    expect(openReader).toHaveBeenCalledWith('lib/a.md')
  })

  it('旧批次（无 focus/picks）按原样式降级渲染', () => {
    useStore.setState({ blogCollection: oldBatchCollection } as any)
    render(<BlogCollectionSection theme="academic" />)
    fireEvent.click(screen.getByTestId('blog-recommend-history'))
    expect(screen.getByText('旧画像')).toBeInTheDocument()
    expect(screen.queryByTestId(/^blog-history-pick-/)).not.toBeInTheDocument()
    // 已读为空时不渲染已读区
    expect(screen.queryByTestId('blog-read-section')).not.toBeInTheDocument()
  })

  it('已读文件夹默认折叠，展开后可打开/移出', async () => {
    render(<BlogCollectionSection theme="academic" />)
    const toggle = screen.getByTestId('blog-read-toggle')
    expect(toggle).toHaveTextContent('已读（1）')
    expect(screen.queryByTestId('blog-read-open-https://anthropic.com/r')).not.toBeInTheDocument()
    fireEvent.click(toggle)
    expect(screen.getByTestId('blog-read-open-https://anthropic.com/r')).toBeInTheDocument()
    fireEvent.click(screen.getByTestId('blog-read-remove-https://anthropic.com/r'))
    await waitFor(() => expect(mockIpc.anthropicCollectionRemoveRead).toHaveBeenCalledWith({ sourceUrl: 'https://anthropic.com/r' }))
  })

  it('字号跟随 briefingFontSize（base → 3xl 后标题字号变大）', () => {
    const { unmount } = render(<BlogCollectionSection theme="academic" />)
    fireEvent.click(screen.getByTestId('blog-recommend-history'))
    const baseSize = screen.getByTestId('blog-history-pick-https://anthropic.com/a').style.fontSize
    unmount()
    cleanup()
    useStore.setState({ briefingFontSize: '3xl' } as any)
    render(<BlogCollectionSection theme="academic" />)
    fireEvent.click(screen.getByTestId('blog-recommend-history'))
    const bigSize = screen.getByTestId('blog-history-pick-https://anthropic.com/a').style.fontSize
    expect(parseInt(bigSize)).toBeGreaterThan(parseInt(baseSize))
  })
})
```

注意：store 真实 actions 中 `removeBlogRead` 会调 `ipc.anthropicCollectionRemoveRead`（已 mock）。若 `useStore.setState` 种子缺少组件用到的其他字段导致运行时报错，按报错补齐种子字段（保持最小原则）。

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run tests/blog-collection-section.test.tsx`
Expected: FAIL —— `blog-read-toggle` / `blog-history-pick-*` 不存在。

- [ ] **Step 3: 实现**

`src/components/anthropic/BlogCollectionSection.tsx` 完整重写为：

```tsx
// src/components/anthropic/BlogCollectionSection.tsx
import { useState } from 'react'
import { useStore } from '@/store'
import { ipc } from '@/lib/ipc'
import { BRIEFING_LIST_STYLES } from '@/lib/briefing-font-size'
import type { BlogCollectionEntry, BlogReadEntry, BlogRecommendPick, BriefingTheme } from '@shared/index'

const STAGE_TEXT: Record<string, string> = {
  context: '分析写作上下文…',
  profile: '构建你的画像…',
  search: '搜索前沿博客…',
  pick: '精选本地文章…',
}

export function BlogCollectionSection({ theme = 'academic' }: { theme?: BriefingTheme }) {
  const isAcademic = theme !== 'newspaper'
  const collection = useStore((s) => s.blogCollection)
  const recommendRunning = useStore((s) => s.recommendRunning)
  const recommendStage = useStore((s) => s.recommendStage)
  const fontSize = useStore((s) => s.briefingFontSize)
  const startBlogRecommend = useStore((s) => s.startBlogRecommend)
  const cancelBlogRecommend = useStore((s) => s.cancelBlogRecommend)
  const removeBlogCollection = useStore((s) => s.removeBlogCollection)
  const removeBlogRead = useStore((s) => s.removeBlogRead)
  const openAnthropicReader = useStore((s) => s.openAnthropicReader)
  const showToast = useStore((s) => s.showToast)

  const [collapsed, setCollapsed] = useState(false)
  const [showHistory, setShowHistory] = useState(false)
  const [showRead, setShowRead] = useState(false)
  const [expandedReason, setExpandedReason] = useState<string | null>(null)

  const entries = collection.entries
  const history = collection.history
  const readList = collection.read
  const listStyles = BRIEFING_LIST_STYLES[fontSize]
  const border = isAcademic ? 'border-slate/30' : 'border-[#c9c3b8]'
  const muted = isAcademic ? 'text-parchment/50' : 'text-[#6b5d52]'
  const text = isAcademic ? 'text-parchment' : 'text-[#1a1a1a]'

  const openFile = async (filePath: string, onGone: () => Promise<void>, goneMsg: string) => {
    try {
      await ipc.readMd(filePath)
      await openAnthropicReader(filePath)
    } catch {
      showToast(goneMsg)
      await onGone()
    }
  }

  return (
    <div data-testid="blog-collection-section" className={`px-4 py-2 border-b ${border} shrink-0`}>
      {readList.length > 0 && (
        <div data-testid="blog-read-section" className="mb-1.5">
          <button
            type="button"
            data-testid="blog-read-toggle"
            onClick={() => setShowRead(s => !s)}
            className={`block ${muted} hover:text-ember`}
            style={{ fontSize: listStyles.meta }}
          >
            ✓ 已读（{readList.length}） {showRead ? '▴' : '▾'}
          </button>
          {showRead && (
            <div className="mt-1.5 space-y-1.5 max-h-40 overflow-y-auto">
              {readList.map((r) => (
                <ReadRow
                  key={r.sourceUrl}
                  entry={r}
                  isAcademic={isAcademic}
                  titleSize={listStyles.title}
                  onOpen={() => void openFile(r.filePath, () => removeBlogRead(r.sourceUrl), '该文件已被删除，已从已读移除')}
                  onRemove={() => void removeBlogRead(r.sourceUrl)}
                />
              ))}
            </div>
          )}
        </div>
      )}

      <div className="flex items-center gap-2">
        <button type="button" data-testid="blog-collection-collapse" onClick={() => setCollapsed(c => !c)} className={`${muted} hover:text-ember`} style={{ fontSize: listStyles.meta }}>
          {collapsed ? '▸' : '▾'}
        </button>
        <span className={`font-serif ${isAcademic ? 'text-ember' : 'text-[#6b5d52]'}`} style={{ fontSize: listStyles.title }}>★ 收藏夹 ({entries.length})</span>
        <div className="flex-1" />
        <button
          type="button"
          data-testid="blog-recommend-button"
          onClick={() => (recommendRunning ? cancelBlogRecommend() : startBlogRecommend())}
          style={{ fontSize: listStyles.meta }}
          className={`px-2 py-1 rounded border transition-colors ${
            recommendRunning
              ? (isAcademic ? 'border-ember text-ember' : 'border-[#6b5d52] text-[#6b5d52]')
              : (isAcademic ? 'border-ember/40 text-ember hover:bg-ember/10' : 'border-[#6b5d52]/40 text-[#6b5d52] hover:bg-[#6b5d52]/10')
          }`}
        >
          {recommendRunning ? `${STAGE_TEXT[recommendStage ?? 'context']} ✕` : '为我推荐'}
        </button>
      </div>

      {history.length > 0 && (
        <button
          type="button"
          data-testid="blog-recommend-history"
          onClick={() => setShowHistory(s => !s)}
          className={`mt-1.5 block ${muted} hover:text-ember`}
          style={{ fontSize: listStyles.meta }}
        >
          往期推荐历史（{history.length} 批） {showHistory ? '▴' : '▾'}
        </button>
      )}
      {showHistory && history.length > 0 && (
        <div className="mt-1.5 space-y-1.5 leading-relaxed">
          {history.map((b) => (
            <div key={b.batch} className={`rounded p-2 ${isAcademic ? 'bg-ink/60 border border-parchment/10' : 'bg-[#f5f2ed] border border-[#1a1a1a]/10'}`}>
              <p className={muted} style={{ fontSize: listStyles.meta }}>第 {b.batch} 批 · {new Date(b.generatedAt).toLocaleString('zh-CN')}{b.searchUsed ? '' : ' · 未使用网络搜索'}</p>
              {b.focus ? (
                <>
                  <p className={`mt-1 font-serif ${isAcademic ? 'text-ember' : 'text-[#6b5d52]'}`} style={{ fontSize: listStyles.title }}>◆ {b.focus}</p>
                  {(b.picks ?? []).map((p) => (
                    <div key={p.sourceUrl} className="mt-1.5">
                      <button
                        type="button"
                        data-testid={`blog-history-pick-${p.sourceUrl}`}
                        onClick={() => void openFile(p.filePath, async () => {}, '该文件已被删除，无法打开')}
                        className={`block text-left truncate max-w-full ${isAcademic ? 'text-parchment/90 hover:text-ember' : 'text-[#1a1a1a] hover:text-ember'}`}
                        style={{ fontSize: listStyles.title }}
                      >
                        {p.title}
                      </button>
                      <p className={muted} style={{ fontSize: listStyles.meta }}>
                        {p.reason}{p.gap ? `（挂上：${p.gap}）` : ''}
                      </p>
                    </div>
                  ))}
                  <p className={`mt-1.5 ${muted}`} style={{ fontSize: listStyles.meta }}>认知缺口：{b.gaps.join('、')} · 检索方向：{b.queries.join('、')}</p>
                </>
              ) : (
                <>
                  <p className={text} style={{ fontSize: listStyles.meta }}>{b.profile}</p>
                  <p className={`mt-1 ${muted}`} style={{ fontSize: listStyles.meta }}>认知缺口：{b.gaps.join('、')}</p>
                  <p className={`mt-1 ${muted}`} style={{ fontSize: listStyles.meta }}>检索方向：{b.queries.join('、')}</p>
                </>
              )}
            </div>
          ))}
        </div>
      )}

      {!collapsed && (
        <div className="mt-2 space-y-1.5 max-h-64 overflow-y-auto">
          {entries.length === 0 && !recommendRunning && (
            <p data-testid="blog-collection-empty" className={muted} style={{ fontSize: listStyles.meta }}>
              尚无收藏——点「为我推荐」生成第一批，或点文章行的 ☆ 手动收藏
            </p>
          )}
          {entries.map((e) => (
            <CollectionRow
              key={e.sourceUrl}
              entry={e}
              isAcademic={isAcademic}
              titleSize={listStyles.title}
              metaSize={listStyles.meta}
              expanded={expandedReason === e.sourceUrl}
              onToggleReason={() => setExpandedReason(expandedReason === e.sourceUrl ? null : e.sourceUrl)}
              onOpen={() => void openFile(e.filePath, () => removeBlogCollection(e.sourceUrl), '该文件已被删除，已从收藏夹移除')}
              onRemove={() => void removeBlogCollection(e.sourceUrl)}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function ReadRow({ entry, isAcademic, titleSize, onOpen, onRemove }: {
  entry: BlogReadEntry
  isAcademic: boolean
  titleSize: string
  onOpen: () => void
  onRemove: () => void
}) {
  return (
    <div className={`rounded border p-2 flex items-center gap-2 ${isAcademic ? 'bg-ink/60 border-parchment/10' : 'bg-white border-[#1a1a1a]/10'}`}>
      <button type="button" data-testid={`blog-read-open-${entry.sourceUrl}`} onClick={onOpen}
        className={`flex-1 min-w-0 text-left truncate ${isAcademic ? 'text-parchment/70 hover:text-ember' : 'text-[#1a1a1a]/70 hover:text-ember'}`}
        style={{ fontSize: titleSize }}>
        {entry.title}
      </button>
      <button type="button" data-testid={`blog-read-remove-${entry.sourceUrl}`} onClick={onRemove}
        className={`shrink-0 ${isAcademic ? 'text-parchment/40 hover:text-ember' : 'text-[#6b5d52]/50 hover:text-ember'}`}
        style={{ fontSize: titleSize }}>
        ×
      </button>
    </div>
  )
}

function CollectionRow({ entry, isAcademic, titleSize, metaSize, expanded, onToggleReason, onOpen, onRemove }: {
  entry: BlogCollectionEntry
  isAcademic: boolean
  titleSize: string
  metaSize: string
  expanded: boolean
  onToggleReason: () => void
  onOpen: () => void
  onRemove: () => void
}) {
  return (
    <div className={`rounded border p-2 ${isAcademic ? 'bg-ink/60 border-parchment/10' : 'bg-white border-[#1a1a1a]/10'}`}>
      <div className="flex items-center gap-2">
        {entry.origin === 'recommend' && (
          <button type="button" data-testid={`blog-collection-reason-${entry.sourceUrl}`} onClick={onToggleReason} className="shrink-0" style={{ fontSize: titleSize }} title="查看推荐理由">💡</button>
        )}
        <button type="button" data-testid={`blog-collection-open-${entry.sourceUrl}`} onClick={onOpen}
          className={`flex-1 min-w-0 text-left truncate ${isAcademic ? 'text-parchment/90 hover:text-ember' : 'text-[#1a1a1a] hover:text-ember'}`}
          style={{ fontSize: titleSize }}>
          {entry.title}
        </button>
        <button type="button" data-testid={`blog-collection-remove-${entry.sourceUrl}`} onClick={onRemove}
          className={`shrink-0 ${isAcademic ? 'text-parchment/40 hover:text-ember' : 'text-[#6b5d52]/50 hover:text-ember'}`}
          style={{ fontSize: titleSize }}>
          ×
        </button>
      </div>
      {expanded && entry.origin === 'recommend' && (
        <div className={`mt-1.5 leading-relaxed ${isAcademic ? 'text-parchment/60' : 'text-[#6b5d52]'}`} style={{ fontSize: metaSize }}>
          <p><span className="text-ember">为什么推荐：</span>{entry.reason}</p>
          {entry.gap && <p className="mt-0.5"><span className="text-ember">补上缺口：</span>{entry.gap}</p>}
        </div>
      )}
    </div>
  )
}
```

注意 `openFile` 的收藏夹分支行为与旧代码完全一致（toast + removeBlogCollection）；已读分支改为 removeBlogRead。组件文件只导出 `BlogCollectionSection` 一个组件（`ReadRow`/`CollectionRow` 模块私有，ui-styling §10）。

- [ ] **Step 4: 跑测试确认通过**

Run: `npx vitest run tests/blog-collection-section.test.tsx`
Expected: PASS（5 个用例）。同时回归既有面板测试：

Run: `npx vitest run tests/anthropic-blog-panel.test.tsx`
Expected: PASS。

- [ ] **Step 5: Commit**

```bash
git add src/components/anthropic/BlogCollectionSection.tsx tests/blog-collection-section.test.tsx
git commit -m "feat(blog): 收藏夹区重排——已读文件夹/历史卡片核心方向+逐篇挂钩/字号跟随briefingFontSize"
```

---

### Task 6: AnthropicArticleRow 已读按钮 + Panel 接线

**Files:**
- Modify: `src/components/anthropic/AnthropicArticleRow.tsx`（Props 8-14 行；☆ 按钮 169-183 行旁）
- Modify: `src/components/anthropic/AnthropicBlogPanel.tsx`（368-386 行的 map 渲染处）
- Test: `tests/anthropic-blog-panel.test.tsx`（增补）

**Interfaces:**
- Consumes: Task 4 的 `toggleBlogRead`、`blogCollection.read`。
- Produces: `AnthropicArticleRow` 新 props `isRead?: boolean; onToggleRead?: () => void`；testid `blog-read-mark`（每行一个，与 `blog-fav-toggle` 同模式）。

- [ ] **Step 1: 写失败测试**

`tests/anthropic-blog-panel.test.tsx`：vi.mock('@/lib/ipc') 的 mock 对象中补两个方法（23 行附近）：

```ts
    anthropicCollectionMarkRead: vi.fn().mockResolvedValue({ ok: true, collection: { version: 1, entries: [], dismissed: [], history: [], read: [{ sourceUrl: 'old-1', title: 'Old Article', filePath: 'lib/old-1.md', readAt: 'x' }] } }),
    anthropicCollectionRemoveRead: vi.fn().mockResolvedValue({ ok: true, collection: { version: 1, entries: [], dismissed: [], history: [], read: [] } }),
```

describe 内追加用例：

```tsx
  it('已保存文章行显示已读按钮，点击调用 markRead', async () => {
    useStore.setState({
      anthropicBlogCache: {
        lastFetchedAt: null,
        articles: [{ ...article('old-1', 'Old Article'), isSaved: true, filePath: 'lib/old-1.md' }],
        loading: false,
        error: null,
      },
      blogCollection: { version: 1, entries: [], dismissed: [], history: [], read: [] },
    } as any)
    render(<AnthropicBlogPanel theme="academic" />)
    const btn = screen.getByTestId('blog-read-mark')
    expect(btn).toHaveTextContent('○')
    fireEvent.click(btn)
    const { ipc } = await import('@/lib/ipc')
    await waitFor(() => expect(ipc.anthropicCollectionMarkRead).toHaveBeenCalledWith({ sourceUrl: 'old-1', filePath: 'lib/old-1.md', title: 'Old Article' }))
  })

  it('未保存文章行不显示已读按钮', () => {
    render(<AnthropicBlogPanel theme="academic" />)
    expect(screen.queryByTestId('blog-read-mark')).not.toBeInTheDocument()
  })
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run tests/anthropic-blog-panel.test.tsx`
Expected: FAIL —— `blog-read-mark` 找不到。

- [ ] **Step 3: 实现**

`AnthropicArticleRow.tsx`：

① Props（8-14 行）补两个可选字段：

```ts
interface Props {
  article: AnthropicArticleMeta
  theme?: BriefingTheme
  onRequestDelete?: (article: AnthropicArticleMeta) => void
  inCollection?: boolean
  onToggleCollection?: () => void
  isRead?: boolean
  onToggleRead?: () => void
}
```

② 组件签名（44 行）解构补 `isRead, onToggleRead`。

③ ☆ 按钮块（169-183 行）后插入已读按钮（right-7 与 ☆ 错开）：

```tsx
        {onToggleRead && (
          <span
            data-testid="blog-read-mark"
            role="button"
            aria-pressed={isRead}
            title={isRead ? '已读（点击取消）' : '标为已读'}
            onClick={(e) => { e.stopPropagation(); e.preventDefault(); onToggleRead() }}
            className={`absolute top-2 right-7 z-10 text-sm leading-none transition-colors ${
              isRead
                ? 'text-ember'
                : isAcademic ? 'text-parchment/30 hover:text-ember' : 'text-[#6b5d52]/40 hover:text-ember'
            }`}
          >
            {isRead ? '✓' : '○'}
          </span>
        )}
```

`AnthropicBlogPanel.tsx` map 渲染处（368-386 行）改为：

```tsx
                {filtered.map((article) => {
                  const inCol = blogCollection.entries.some(e => e.sourceUrl === article.url)
                  const isRead = blogCollection.read.some(r => r.sourceUrl === article.url)
                  return (
                    <AnthropicArticleRow
                      key={article.url}
                      article={article}
                      theme={theme}
                      onRequestDelete={setPendingDelete}
                      inCollection={inCol}
                      onToggleCollection={
                        article.isSaved && article.filePath
                          ? () => void toggleBlogCollection({ sourceUrl: article.url, filePath: article.filePath!, title: article.title })
                          : undefined
                      }
                      isRead={isRead}
                      onToggleRead={
                        article.isSaved && article.filePath
                          ? () => void toggleBlogRead({ sourceUrl: article.url, filePath: article.filePath!, title: article.title })
                          : undefined
                      }
                    />
                  )
                })}
```

确认 panel 中 `toggleBlogRead` 已从 useStore 取出（在 `toggleBlogCollection` 取值处旁边补 `const toggleBlogRead = useStore((s) => s.toggleBlogRead)`）。

- [ ] **Step 4: 跑测试确认通过**

Run: `npx vitest run tests/anthropic-blog-panel.test.tsx`
Expected: PASS（含新旧用例）。

- [ ] **Step 5: Commit**

```bash
git add src/components/anthropic/AnthropicArticleRow.tsx src/components/anthropic/AnthropicBlogPanel.tsx tests/anthropic-blog-panel.test.tsx
git commit -m "feat(blog): 文章行加已读按钮（○/✓），与收藏并列"
```

---

### Task 7: E2E 增补 + 定向验证收尾

**Files:**
- Modify: `e2e/specs/blog-collection.spec.ts`
- Check: `e2e/README.md`（若其中有 recommend mock 策略描述，同步补一句"mock 批次含 focus/picks 且 mock 文章真实写盘"；没有则不动）
- `e2e/source-map.json` 无需改动（同一 spec 文件已在 `anthropic-blog` group 内）

**Interfaces:**
- Consumes: Task 2 的 E2E mock（批次含 focus/picks、文章写盘）、Task 5/6 的 testid。

- [ ] **Step 1: 追加 E2E 用例**

`e2e/specs/blog-collection.spec.ts` 在现有 test 后追加：

```ts
  test('历史卡片展示核心方向与逐篇挂钩，打开后自动进已读夹', async ({ window }) => {
    const cover = new CoverPage(window)
    await cover.enterName('E2E 测试员')
    await cover.goToBriefing()
    await window.locator(SELECTORS.briefing.sourceAnthropicButton).click()

    // 触发推荐 mock
    await window.locator('[data-testid="blog-recommend-button"]').click()
    await expect(window.locator('[data-testid^="blog-collection-open-"]').first()).toBeVisible({ timeout: 15000 })

    // 历史卡片：核心方向 + 逐篇条目
    await window.locator('[data-testid="blog-recommend-history"]').click()
    await expect(window.getByText('E2E 核心方向')).toBeVisible()
    const pick = window.locator('[data-testid^="blog-history-pick-"]').first()
    await expect(pick).toBeVisible()
    await expect(window.getByText(/E2E 推荐理由/)).toBeVisible()

    // 打开逐篇条目 → 自动已读
    await pick.click()
    await expect(window.locator('[data-testid="blog-read-toggle"]')).toBeVisible({ timeout: 5000 })
    await expect(window.locator('[data-testid="blog-read-toggle"]')).toContainText('已读（1）')

    // 展开已读夹 → 移出
    await window.locator('[data-testid="blog-read-toggle"]').click()
    await expect(window.locator('[data-testid^="blog-read-open-"]').first()).toBeVisible()
    await window.locator('[data-testid^="blog-read-remove-"]').first().click()
    await expect(window.locator('[data-testid="blog-read-toggle"]')).toHaveCount(0)
  })
```

注意：打开逐篇条目后右侧出现阅读器，收藏夹区在左列保持挂载；`readMd` 走 mock 写盘的真实文件。若 `blog-read-toggle` 文案括号是全角，断言用 `已读（1）`（与组件渲染一致）。

- [ ] **Step 2: 跑定向 E2E**

Run: `node scripts/e2e-changed.js --run --no-retries`
Expected: `blog-collection.spec.ts` 两个用例全过；`startup-health` 等受影响 spec 全过。

- [ ] **Step 3: 全量单元回归（仅受影响文件）**

Run: `npx vitest run tests/blog-collection.test.ts tests/blog-recommend.test.ts tests/blog-read-lookup.test.ts tests/blog-collection-section.test.tsx tests/anthropic-blog-panel.test.tsx`
Expected: 全过。

- [ ] **Step 4: Commit**

```bash
git add e2e/specs/blog-collection.spec.ts
git commit -m "test(blog): E2E 覆盖历史卡片核心方向/逐篇挂钩/自动已读/移出已读"
```
