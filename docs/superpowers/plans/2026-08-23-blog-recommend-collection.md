# 博客智能推荐 + 收藏夹 + 右栏统一 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为 Anthropic 博客加「基于写作上下文的三段式智能推荐 + 本地收藏夹」，并把博客/前沿/求职右栏统一为「导读 | 助手 | 对照」三 tab、对照文可编辑。

**Architecture:** 分两个独立阶段。阶段 1（模块 1）：主进程新增 `blog-collection.ts`（`.collection.json` 读写）与 `blog-recommend.ts`（画像→Tavily 搜索→本地精排），IPC 落在现有 `electron/ipc/anthropic.ts`，渲染侧在 `AnthropicBlogPanel` 顶部挂收藏夹区。阶段 2（模块 2）：新增通用右栏 tab 面板，把博客/前沿/求职右栏统一，对照文复刻写作的 CompanionBoard（md 可编辑 / html 只读），求职对照只读。

**Tech Stack:** Electron 30 + React 18 + TypeScript + Zustand + Tailwind；Vitest（单测）+ Playwright（E2E）。

**Spec:** `docs/superpowers/specs/2026-08-23-blog-recommend-collection-design.md`

## Global Constraints

- 单测命令：`npx vitest run tests/<file>.test.ts`（只跑对应文件，禁止全量）。
- E2E 命令：`node scripts/e2e-changed.js --run --no-retries`（定向，自动先 `npx electron-vite build`）。
- 类型门槛：`npx tsc --noEmit`（渲染层）+ `npx tsc --noEmit -p tsconfig.node.json`（主进程）。
- 提交只 `git add` 本任务改动文件，禁止 `git add -A`（工作树有与本需求无关的未提交改动：`e2e/specs/writing-non-md.spec.ts`、`src/components/writing/HtmlPreview.tsx`、`.dsh/`，一律不碰）。
- IPC 新增必须四层同步：`src/types/index.ts` → `electron/ipc/*.ts` handler → `electron/preload.ts` → `src/lib/ipc.ts` facade → `src/store/index.ts` → 组件/测试。
- 落盘 JSON 用 `electron/lib/safe-json.ts` 的 `safeReadJson`/`safeWriteJson`（原子写 + `.bak` 容错），不用 `fs.writeFileSync` 裸写。
- LLM 输出解析走 `electron/lib/extract-json.ts` 的 `extractJsonObject`/`extractJsonArray`，失败写 `~/.studyparlor/debug/`。
- 错误码类型化，不用 `String.prototype.includes` 匹配错误消息。
- 组件文件只导出组件（Fast Refresh 约束）；helper 放 `src/lib/`。
- 收藏夹 UI 语义对齐精选集 ☆/★；新 UI 出口必须有 `data-testid` 且有 E2E 断言。

---

# 阶段 1：博客推荐 + 收藏夹

## Task 1: 类型定义

**Files:**
- Modify: `src/types/index.ts`（新增收藏夹/推荐/错误码类型 + IpcApi 方法签名）

**Interfaces:**
- Produces: `BlogCollectionFile`, `BlogCollectionEntry`, `BlogRecommendBatch`, `BlogRecommendErrorCode`, `RecommendStage`, `RecommendStartResult`, `RecommendDonePayload`；IpcApi 方法 `anthropicCollectionRead`/`anthropicCollectionAdd`/`anthropicCollectionRemove`/`anthropicRecommendStart`/`anthropicRecommendCancel`/`onAnthropicRecommendStage`/`onAnthropicRecommendDone`。

- [ ] **Step 1: 在 `src/types/index.ts` 添加类型**

在 `AnthropicBlogCache` 定义（约 L90）之后插入：

```ts
/** 收藏夹条目来源：recommend=推荐自动入夹，manual=手动 ☆ */
export type BlogCollectionOrigin = 'recommend' | 'manual'

export type BlogCollectionEntry = {
  sourceUrl: string   // 主键（去重依据）
  filePath: string    // 相对学习库路径
  title: string
  addedAt: string     // ISO
  origin: BlogCollectionOrigin
  reason?: string     // 推荐理由（仅 recommend）
  gap?: string        // 补上的认知缺口（仅 recommend）
  batch?: number      // 批次号（仅 recommend）
}

export type BlogRecommendBatch = {
  batch: number
  generatedAt: string
  profile: string      // 用户画像（阶段一 LLM 输出）
  gaps: string[]       // 认知缺口
  queries: string[]    // 本次检索词
  searchUsed: boolean  // Tavily 是否可用（false = 降级纯本地匹配）
}

export type BlogCollectionFile = {
  version: 1
  entries: BlogCollectionEntry[]
  dismissed: string[]      // 用户移除过的推荐 sourceUrl，后续批次不再推荐
  lastBatch: BlogRecommendBatch | null
}

export type BlogRecommendErrorCode =
  | 'NO_WRITING_CONTEXT'
  | 'NO_LOCAL_ARTICLES'
  | 'LLM_ERROR'
  | 'LLM_PARSE_ERROR'
  | 'ABORTED'

export type RecommendStage = 'context' | 'profile' | 'search' | 'pick'

export type RecommendDonePayload =
  | { ok: true; collection: BlogCollectionFile }
  | { ok: false; code: BlogRecommendErrorCode }
```

- [ ] **Step 2: 在 `IpcApi` 接口（约 L731 `onAnthropicBackfill` 之后）添加方法签名**

```ts
    anthropicCollectionRead: () => Promise<{ ok: true; collection: BlogCollectionFile }>
    anthropicCollectionAdd: (args: { sourceUrl: string; filePath: string; title: string }) => Promise<{ ok: true; collection: BlogCollectionFile }>
    anthropicCollectionRemove: (args: { sourceUrl: string }) => Promise<{ ok: true; collection: BlogCollectionFile }>
    anthropicRecommendStart: () => Promise<{ ok: true } | { ok: false; code: 'ALREADY_RUNNING' }>
    anthropicRecommendCancel: () => Promise<void>
    onAnthropicRecommendStage: (cb: (p: { stage: RecommendStage }) => void) => () => void
    onAnthropicRecommendDone: (cb: (p: RecommendDonePayload) => void) => () => void
```

- [ ] **Step 3: typecheck**

Run: `npx tsc --noEmit`
Expected: 此时 preload/facade 尚未实现，会报「`window.api` 缺这些方法」——这是预期的中间态；确认没有本文件自身的类型错误即可，进入 Task 2 后逐层补平。

- [ ] **Step 4: Commit**

```bash
git add src/types/index.ts
git commit -m "feat(blog): 收藏夹与推荐类型定义——BlogCollectionFile/Entry、推荐批次、错误码、IpcApi 签名"
```

---

## Task 2: 收藏夹落盘模块 + 单测

**Files:**
- Create: `electron/lib/blog-collection.ts`
- Test: `tests/blog-collection.test.ts`

**Interfaces:**
- Consumes: `BlogCollectionFile`/`BlogCollectionEntry`/`BlogRecommendBatch`（Task 1）；`safeReadJson`/`safeWriteJson`（`electron/lib/safe-json.ts`）。
- Produces: `collectionPath(lib)`, `loadCollection(lib)`, `saveCollection(lib, c)`, `addManualEntry(c, {sourceUrl,filePath,title})`, `removeEntry(c, sourceUrl)`, `applyRecommend(c, batch, pickEntries)`.

- [ ] **Step 1: 写失败测试**

```ts
// tests/blog-collection.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'
import {
  collectionPath, loadCollection, saveCollection,
  addManualEntry, removeEntry, applyRecommend,
} from '../electron/lib/blog-collection'
import type { BlogCollectionFile, BlogRecommendBatch } from '../src/types'

let dir: string
beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'blog-col-')) })
afterEach(() => { fs.rmSync(dir, { recursive: true, force: true }) })

const empty = (): BlogCollectionFile => ({ version: 1, entries: [], dismissed: [], lastBatch: null })

describe('loadCollection', () => {
  it('缺文件返回空集合', () => {
    expect(loadCollection(dir)).toEqual(empty())
  })
  it('version 不符时重置为空', () => {
    fs.mkdirSync(path.join(dir, 'Anthropic博客'), { recursive: true })
    fs.writeFileSync(collectionPath(dir), JSON.stringify({ version: 99, entries: [], dismissed: [], lastBatch: null }))
    expect(loadCollection(dir)).toEqual(empty())
  })
  it('损坏 JSON 回退 .bak', () => {
    fs.mkdirSync(path.join(dir, 'Anthropic博客'), { recursive: true })
    const p = collectionPath(dir)
    const good = { version: 1, entries: [{ sourceUrl: 'u1', filePath: 'a.md', title: 't', addedAt: 'x', origin: 'manual' }], dismissed: [], lastBatch: null }
    saveCollection(dir, good as BlogCollectionFile)
    fs.copyFileSync(p, p + '.bak')
    fs.writeFileSync(p, '{"broken')
    expect(loadCollection(dir).entries).toHaveLength(1)
  })
})

describe('addManualEntry', () => {
  it('添加手动条目并去重', () => {
    const c = empty()
    const c2 = addManualEntry(c, { sourceUrl: 'u1', filePath: 'a.md', title: 't' })
    expect(c2.entries).toHaveLength(1)
    expect(c2.entries[0].origin).toBe('manual')
    const c3 = addManualEntry(c2, { sourceUrl: 'u1', filePath: 'a.md', title: 't' })
    expect(c3.entries).toHaveLength(1)
  })
  it('手动收藏 dismissed URL 会将其剔除', () => {
    const c: BlogCollectionFile = { ...empty(), dismissed: ['u1'] }
    const c2 = addManualEntry(c, { sourceUrl: 'u1', filePath: 'a.md', title: 't' })
    expect(c2.dismissed).toEqual([])
  })
})

describe('removeEntry', () => {
  it('移除推荐条目记 dismissed；移除手动不记', () => {
    const c: BlogCollectionFile = {
      ...empty(),
      entries: [
        { sourceUrl: 'u1', filePath: 'a.md', title: 't', addedAt: 'x', origin: 'recommend', reason: 'r' },
        { sourceUrl: 'u2', filePath: 'b.md', title: 't', addedAt: 'x', origin: 'manual' },
      ],
    }
    const c2 = removeEntry(c, 'u1')
    expect(c2.dismissed).toEqual(['u1'])
    const c3 = removeEntry(c, 'u2')
    expect(c3.dismissed).toEqual([])
    expect(c3.entries).toHaveLength(1)
  })
})

describe('applyRecommend', () => {
  it('推荐批次替换 recommend 条目，保留 manual', () => {
    const c: BlogCollectionFile = {
      ...empty(),
      entries: [
        { sourceUrl: 'u1', filePath: 'a.md', title: 't', addedAt: 'x', origin: 'manual' },
        { sourceUrl: 'u2', filePath: 'b.md', title: 't', addedAt: 'x', origin: 'recommend', reason: 'old' },
      ],
    }
    const batch: BlogRecommendBatch = { batch: 1, generatedAt: 'g', profile: 'p', gaps: ['g1'], queries: ['q'], searchUsed: true }
    const picks = [{ sourceUrl: 'u3', filePath: 'c.md', title: 't', addedAt: 'x', origin: 'recommend' as const, reason: 'new', gap: 'g1', batch: 1 }]
    const c2 = applyRecommend(c, batch, picks)
    expect(c2.entries.map(e => e.sourceUrl).sort()).toEqual(['u1', 'u3'])
    expect(c2.lastBatch).toEqual(batch)
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npx vitest run tests/blog-collection.test.ts`
Expected: FAIL——`Cannot find module '../electron/lib/blog-collection'`。

- [ ] **Step 3: 实现模块**

```ts
// electron/lib/blog-collection.ts
import path from 'path'
import { safeReadJson, safeWriteJson } from './safe-json'
import type { BlogCollectionFile, BlogCollectionEntry, BlogRecommendBatch } from '@shared/index'

export function collectionPath(lib: string): string {
  return path.join(lib, 'Anthropic博客', '.collection.json')
}

const EMPTY: BlogCollectionFile = { version: 1, entries: [], dismissed: [], lastBatch: null }

export function loadCollection(lib: string): BlogCollectionFile {
  const raw = safeReadJson<Partial<BlogCollectionFile>>(collectionPath(lib), { fallback: {} })
  if (raw.version !== 1) return { ...EMPTY }
  return {
    version: 1,
    entries: Array.isArray(raw.entries) ? raw.entries : [],
    dismissed: Array.isArray(raw.dismissed) ? raw.dismissed : [],
    lastBatch: raw.lastBatch ?? null,
  }
}

export function saveCollection(lib: string, c: BlogCollectionFile): void {
  safeWriteJson(collectionPath(lib), c)
}

export function addManualEntry(
  c: BlogCollectionFile,
  args: { sourceUrl: string; filePath: string; title: string }
): BlogCollectionFile {
  if (c.entries.some(e => e.sourceUrl === args.sourceUrl)) return c
  const entry: BlogCollectionEntry = {
    sourceUrl: args.sourceUrl,
    filePath: args.filePath,
    title: args.title,
    addedAt: new Date().toISOString(),
    origin: 'manual',
  }
  return { ...c, entries: [...c.entries, entry], dismissed: c.dismissed.filter(d => d !== args.sourceUrl) }
}

export function removeEntry(c: BlogCollectionFile, sourceUrl: string): BlogCollectionFile {
  const target = c.entries.find(e => e.sourceUrl === sourceUrl)
  if (!target) return c
  const dismissed = target.origin === 'recommend'
    ? Array.from(new Set([...c.dismissed, sourceUrl]))
    : c.dismissed
  return { ...c, entries: c.entries.filter(e => e.sourceUrl !== sourceUrl), dismissed }
}

export function applyRecommend(
  c: BlogCollectionFile,
  batch: BlogRecommendBatch,
  pickEntries: BlogCollectionEntry[]
): BlogCollectionFile {
  const manual = c.entries.filter(e => e.origin === 'manual')
  return { version: 1, entries: [...manual, ...pickEntries], dismissed: c.dismissed, lastBatch: batch }
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `npx vitest run tests/blog-collection.test.ts`
Expected: PASS（全部 7 用例）。

- [ ] **Step 5: Commit**

```bash
git add electron/lib/blog-collection.ts tests/blog-collection.test.ts
git commit -m "feat(blog): 收藏夹落盘模块——.collection.json 读写(atomic+.bak)、手动/移除/推荐替换语义"
```

---

## Task 3: 推荐管线的纯函数段（上下文收集 + 本地池）+ 单测

**Files:**
- Create: `electron/lib/blog-recommend.ts`（本任务只写纯函数段 `collectWritingContext`/`collectLocalArticles`，LLM 编排在 Task 5）
- Test: `tests/blog-recommend.test.ts`

**Interfaces:**
- Consumes: `loadCatalog`（`electron/lib/writing-catalog.ts`）、`parseFrontmatter`（`electron/lib/frontmatter.ts`）、`BlogCollectionFile`。
- Produces: `collectWritingContext(lib): { count: number; summaries: { title: string; summary: string }[]; recentBodies: string[] }`；`collectLocalArticles(lib): LocalBlogArticle[]`，其中 `LocalBlogArticle = { sourceUrl; filePath; absPath; title; summary; section; importedAt }`。

- [ ] **Step 1: 写失败测试（用临时目录真实 fs 造 fixture）**

```ts
// tests/blog-recommend.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { collectWritingContext, collectLocalArticles } from '../electron/lib/blog-recommend'

let dir: string
beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'blog-rec-')) })
afterEach(() => { fs.rmSync(dir, { recursive: true, force: true }) })

function write(p: string, content: string) {
  fs.mkdirSync(path.dirname(p), { recursive: true })
  fs.writeFileSync(p, content, 'utf8')
}

describe('collectWritingContext', () => {
  it('catalog 为空返回 count=0', () => {
    expect(collectWritingContext(dir).count).toBe(0)
  })
  it('读 writing 根 catalog 条目并读近期原文', () => {
    const cat = {
      version: 2,
      entries: {
        'a.md': { title: 'A', summary: '摘要A', mtimeMs: 300 },
        'b.md': { title: 'B', summary: '摘要B', mtimeMs: 200 },
      },
      groups: {},
    }
    write(path.join(dir, 'writing', '.catalog.json'), JSON.stringify(cat))
    write(path.join(dir, 'writing', 'a.md'), '---\ntitle: A\n---\n正文A 内容')
    const ctx = collectWritingContext(dir)
    expect(ctx.count).toBe(2)
    expect(ctx.summaries.map(s => s.title)).toEqual(['A', 'B'])
    expect(ctx.recentBodies.some(b => b.includes('正文A'))).toBe(true)
  })
})

describe('collectLocalArticles', () => {
  it('过滤非 anthropic-article / 无 source_url，跳过损坏文件', () => {
    write(path.join(dir, 'Anthropic博客', '2026-08', 'x.md'),
      '---\ntype: anthropic-article\nsource_url: https://anthropic.com/a\nsummary: s\nsection: research\nimported_at: 2026-08-01\n---\nbody')
    write(path.join(dir, 'Anthropic博客', '2026-08', 'y.md'),
      '---\ntype: note\nsource_url: https://anthropic.com/b\n---\nbody')  // type 不符，跳过
    write(path.join(dir, 'Anthropic博客', '2026-08', 'z.md'),
      '---\ntype: anthropic-article\n---\nbody')  // 无 source_url，跳过
    write(path.join(dir, 'Anthropic博客', '2026-08', 'broken.md'), '{broken')
    const list = collectLocalArticles(dir)
    expect(list).toHaveLength(1)
    expect(list[0].sourceUrl).toBe('https://anthropic.com/a')
    expect(list[0].section).toBe('research')
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npx vitest run tests/blog-recommend.test.ts`
Expected: FAIL——module 不存在。

- [ ] **Step 3: 实现纯函数段**

```ts
// electron/lib/blog-recommend.ts（本任务先只放下面两函数 + 类型，imports 齐全）
import fs from 'fs'
import path from 'path'
import { loadCatalog } from './writing-catalog'
import { parseFrontmatter } from './frontmatter'

export type LocalBlogArticle = {
  sourceUrl: string
  filePath: string   // 相对学习库
  absPath: string
  title: string
  summary: string | null
  section: string | null
  importedAt: string | null
}

export function collectWritingContext(lib: string): {
  count: number
  summaries: { title: string; summary: string }[]
  recentBodies: string[]
} {
  const cat = loadCatalog(lib, 'writing')
  const items = Object.entries(cat.entries)
    .map(([relPath, e]) => ({ relPath, ...e }))
    .sort((a, b) => (b.mtimeMs ?? b.updatedAt ? Date.parse(b.updatedAt ?? '') : 0) - (a.mtimeMs ?? a.updatedAt ? Date.parse(a.updatedAt ?? '') : 0))

  let total = 0
  const summaries: { title: string; summary: string }[] = []
  for (const it of items) {
    const text = `${it.title}\n${it.summary}`
    if (total + text.length > 8000) break
    summaries.push({ title: it.title, summary: it.summary })
    total += text.length
  }

  const recentBodies: string[] = []
  for (const it of items.slice(0, 5)) {
    const p = path.join(lib, 'writing', it.relPath)
    if (!fs.existsSync(p)) continue
    try {
      const raw = fs.readFileSync(p, 'utf8')
      const { body } = parseFrontmatter(raw, { filename: path.basename(p) })
      recentBodies.push(body.slice(0, 2000))
    } catch { /* skip */ }
  }

  return { count: items.length, summaries, recentBodies }
}

export function collectLocalArticles(lib: string): LocalBlogArticle[] {
  const dir = path.join(lib, 'Anthropic博客')
  const out: LocalBlogArticle[] = []
  const walk = (d: string) => {
    if (!fs.existsSync(d)) return
    for (const ent of fs.readdirSync(d, { withFileTypes: true })) {
      const full = path.join(d, ent.name)
      if (ent.isDirectory()) walk(full)
      else if (ent.isFile() && ent.name.endsWith('.md')) {
        try {
          const raw = fs.readFileSync(full, 'utf8')
          const { frontmatter } = parseFrontmatter(raw, { filename: ent.name })
          if (frontmatter.type !== 'anthropic-article') continue
          if (!frontmatter.source_url) continue
          out.push({
            sourceUrl: frontmatter.source_url,
            filePath: path.relative(lib, full),
            absPath: full,
            title: frontmatter.title ?? ent.name,
            summary: frontmatter.summary ?? null,
            section: frontmatter.section ?? null,
            importedAt: frontmatter.imported_at ?? null,
          })
        } catch { /* skip corrupted */ }
      }
    }
  }
  walk(dir)
  return out
}
```

> 注意：`frontmatter.title/section/imported_at/source_url/summary/type` 字段名以 `src/types/index.ts` 的 `Frontmatter` 类型为准（导入时由 `serializeFrontmatter('anthropic-article', ...)` 写入，`electron/lib/frontmatter.ts` EXT_FIELDS 已注册）。若 `type` 字段名实际为 `doc_type` 或 `parent_type` 等，按类型定义修正；扫描语义以「frontmatter 里 type === 'anthropic-article'」为唯一判定（ipc-state §8）。

- [ ] **Step 4: 运行测试确认通过**

Run: `npx vitest run tests/blog-recommend.test.ts`
Expected: PASS。

- [ ] **Step 5: Commit**

```bash
git add electron/lib/blog-recommend.ts tests/blog-recommend.test.ts
git commit -m "feat(blog): 推荐管线纯函数段——writing 上下文收集(摘要+近期原文)、本地 Anthropic 文章池扫描"
```

---

## Task 4: 推荐 prompt 模板

**Files:**
- Create: `electron/prompts/blog-profile-queries-v1.md`
- Create: `electron/prompts/blog-recommend-pick-v1.md`

**Interfaces:**
- Produces: 两个模板文件，占位符 `{{summaries}}`/`{{recentBodies}}`（阶段一）与 `{{profile}}`/`{{gaps}}`/`{{searchHits}}`/`{{pool}}`（阶段三）。Task 5 的 `read()` 按名字读取。

- [ ] **Step 1: 写阶段一模板**

`electron/prompts/blog-profile-queries-v1.md`：

```markdown
你是「学者夜话」的阅读画像师。用户在本地学习库的 writing/ 目录里持续写作，下面是其近期写作的摘要与部分原文。

写作摘要（按最近修改排序）：
{{summaries}}

近期原文节选：
{{recentBodies}}

请基于以上材料，输出一个 JSON 对象（不要用 markdown 代码块包裹），字段如下：
{
  "profile": "一段 80-120 字的用户画像，描述其当前在思考什么、在学什么、认知状态如何",
  "gaps": ["认知缺口 1", "认知缺口 2", "认知缺口 3"],
  "queries": ["english search query 1", "english search query 2"]
}

要求：
- profile 只依据给定材料，不臆造外部事实。
- gaps 为 2-3 条「作者尚未掌握、但对其当前主题至关重要」的具体知识点，可命名、不抽象延伸。
- queries 为 2 条英文检索词，面向 Anthropic 官方博客（anthropic.com / transformer-circuits.pub / claude.com），用其惯用术语（如 alignment、interpretability、RLHF、scaling、agents、tool use 等）。
```

- [ ] **Step 2: 写阶段三模板**

`electron/prompts/blog-recommend-pick-v1.md`：

```markdown
你是「学者夜话」的荐书人。已有用户画像与认知缺口，以及本地已导入的 Anthropic 博客文章清单。请从清单中挑选最多 5 篇「既至关重要、又切合当前认知缺口」的文章。

用户画像：
{{profile}}

认知缺口：
{{gaps}}

网络检索到的「至关重要」文章线索（仅供参考方向，本地不一定有这些篇）：
{{searchHits}}

本地文章清单（source_url | 标题 | 摘要）：
{{pool}}

请输出一个 JSON 数组（不要用 markdown 代码块包裹），每个元素形如：
{"source_url": "清单中该文的 source_url", "reason": "一句话：为什么这篇至关重要且切合缺口", "gap": "它补上的是哪个认知缺口"}

要求：
- source_url 必须逐字来自清单，不得杜撰。
- 只选清单里确实存在的文章，最多 5 篇，宁缺毋滥（不足 5 篇就返回实际篇数）。
- 按契合度从高到低排序。
```

- [ ] **Step 3: Commit**

```bash
git add electron/prompts/blog-profile-queries-v1.md electron/prompts/blog-recommend-pick-v1.md
git commit -m "feat(blog): 推荐 prompt 模板——画像/检索词 + 本地精排"
```

---

## Task 5: 推荐管线 LLM 编排 + 单测

**Files:**
- Modify: `electron/lib/blog-recommend.ts`（补 `runBlogRecommend`、`stageProfile`、`stagePick`、`extractObjectWithRetry`、`recommendError` helper）
- Test: `tests/blog-recommend.test.ts`（追加编排段用例，用 vi.mock 隔离 LLM 与搜索）

**Interfaces:**
- Consumes: `chatNonStream`（`electron/lib/kimi.ts`）、`extractJsonObject`/`extractJsonArray`（`electron/lib/extract-json.ts`）、`searchWeb`（`electron/lib/search.ts`）、`getSearchApiKey`（`electron/lib/credentials.ts`）、Task 3 纯函数、Task 4 prompt、`loadCollection`（`electron/lib/blog-collection.ts`）、`AppConfig`（`electron/env.ts`）。
- Produces: `runBlogRecommend(cfg, opts): Promise<{ batch: BlogRecommendBatch; picks: PickedArticle[] }>`，`PickedArticle = { sourceUrl; reason; gap }`。

- [ ] **Step 1: 追加失败测试（mock chatNonStream/searchWeb/getSearchApiKey）**

```ts
// tests/blog-recommend.test.ts 追加
import { vi, afterEach as ae } from 'vitest'

vi.mock('../electron/lib/kimi', () => ({ chatNonStream: vi.fn() }))
vi.mock('../electron/lib/search', () => ({ searchWeb: vi.fn() }))
vi.mock('../electron/lib/credentials', () => ({ getSearchApiKey: vi.fn() }))

import { chatNonStream } from '../electron/lib/kimi'
import { searchWeb } from '../electron/lib/search'
import { getSearchApiKey } from '../electron/lib/credentials'
import { runBlogRecommend } from '../electron/lib/blog-recommend'
import type { AppConfig } from '../electron/env'

const cfg = { libraryPath: dir, apiKey: 'k', baseUrl: 'u', model: 'm' } as AppConfig

function seedWriting() {
  write(path.join(dir, 'writing', '.catalog.json'), JSON.stringify({
    version: 2,
    entries: { 'a.md': { title: 'A', summary: '摘要A', mtimeMs: 300 } },
    groups: {},
  }))
  write(path.join(dir, 'writing', 'a.md'), '---\ntitle: A\n---\n正文')
}
function seedPool() {
  write(path.join(dir, 'Anthropic博客', '2026-08', 'x.md'),
    '---\ntype: anthropic-article\nsource_url: https://anthropic.com/a\nsummary: s\nimported_at: 2026-08-01\n---\nbody')
}

ae(() => { vi.clearAllMocks() })

describe('runBlogRecommend', () => {
  it('无写作上下文抛 NO_WRITING_CONTEXT', async () => {
    await expect(runBlogRecommend(cfg, {})).rejects.toMatchObject({ code: 'NO_WRITING_CONTEXT' })
  })
  it('有上下文但无本地文章抛 NO_LOCAL_ARTICLES', async () => {
    seedWriting()
    ;(chatNonStream as any).mockResolvedValue(JSON.stringify({ profile: 'p', gaps: ['g'], queries: ['q'] }))
    ;(getSearchApiKey as any).mockResolvedValue(null)
    await expect(runBlogRecommend(cfg, {})).rejects.toMatchObject({ code: 'NO_LOCAL_ARTICLES' })
  })
  it('完整链路返回 batch 与 picks，且校验非法 source_url', async () => {
    seedWriting()
    seedPool()
    ;(getSearchApiKey as any).mockResolvedValue(null)  // 降级 searchUsed=false
    ;(chatNonStream as any)
      .mockResolvedValueOnce(JSON.stringify({ profile: 'p', gaps: ['g'], queries: ['q'] }))
      .mockResolvedValueOnce(JSON.stringify([{ source_url: 'https://anthropic.com/a', reason: 'r', gap: 'g' }, { source_url: 'https://nope.com', reason: 'x', gap: 'g' }]))
    const r = await runBlogRecommend(cfg, {})
    expect(r.batch.profile).toBe('p')
    expect(r.batch.searchUsed).toBe(false)
    expect(r.picks).toHaveLength(1)
    expect(r.picks[0].sourceUrl).toBe('https://anthropic.com/a')
  })
  it('Tavily 可用时聚合搜索命中且 searchUsed=true', async () => {
    seedWriting(); seedPool()
    ;(getSearchApiKey as any).mockResolvedValue('key')
    ;(searchWeb as any).mockResolvedValue([{ title: 'T', url: 'https://anthropic.com/t', content: 'c'.repeat(10) }])
    ;(chatNonStream as any)
      .mockResolvedValueOnce(JSON.stringify({ profile: 'p', gaps: ['g'], queries: ['q1'] }))
      .mockResolvedValueOnce(JSON.stringify([{ source_url: 'https://anthropic.com/a', reason: 'r', gap: 'g' }]))
    const r = await runBlogRecommend(cfg, {})
    expect(r.batch.searchUsed).toBe(true)
    expect(searchWeb).toHaveBeenCalled()
  })
  it('dismissed 的 URL 不出现在候选池', async () => {
    seedWriting(); seedPool()
    write(path.join(dir, 'Anthropic博客', '.collection.json'), JSON.stringify({ version: 1, entries: [], dismissed: ['https://anthropic.com/a'], lastBatch: null }))
    ;(getSearchApiKey as any).mockResolvedValue(null)
    ;(chatNonStream as any)
      .mockResolvedValueOnce(JSON.stringify({ profile: 'p', gaps: ['g'], queries: ['q'] }))
    await expect(runBlogRecommend(cfg, {})).rejects.toMatchObject({ code: 'NO_LOCAL_ARTICLES' })
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npx vitest run tests/blog-recommend.test.ts`
Expected: FAIL——`runBlogRecommend` 未定义。

- [ ] **Step 3: 实现编排段**

在 `electron/lib/blog-recommend.ts` 追加（顶部补 imports）：

```ts
import { chatNonStream } from './kimi'
import { extractJsonObject, extractJsonArray } from './extract-json'
import { searchWeb } from './search'
import { getSearchApiKey } from './credentials'
import { loadCollection } from './blog-collection'
import os from 'os'
import type { AppConfig } from '../env'
import type { BlogRecommendBatch } from '@shared/index'

export type PickedArticle = { sourceUrl: string; reason: string; gap: string }

const PROMPTS_DIR = (() => {
  const candidates = [
    path.resolve(__dirname, '..', 'prompts'),
    path.resolve(__dirname, '..', '..', 'electron', 'prompts'),
  ]
  for (const c of candidates) if (fs.existsSync(c)) return c
  throw new Error('prompts directory not found')
})()
const read = (n: string) => fs.readFileSync(path.join(PROMPTS_DIR, n), 'utf8')

function codeError(code: string): Error {
  return Object.assign(new Error(code), { code })
}

function writeDebug(tag: string, prompt: string, text?: string, extracted?: string): void {
  const debugDir = path.join(os.homedir(), '.studyparlor', 'debug')
  fs.mkdirSync(debugDir, { recursive: true })
  const file = path.join(debugDir, `${tag}-fail-${Date.now()}.txt`)
  fs.writeFileSync(file, `=== Prompt ===\n${prompt}\n\n=== Extracted ===\n${extracted ?? ''}\n\n=== LLM Response ===\n${text ?? ''}`, 'utf8')
}

async function callJson(cfg: AppConfig, prompt: string, signal?: AbortSignal): Promise<string> {
  return chatNonStream(cfg, {
    messages: [{ role: 'user', content: prompt }],
    temperature: 0.7,
    thinking: { type: 'enabled', reasoning_effort: 'high' },
    signal,
  })
}

async function extractObjectWithRetry<T>(cfg: AppConfig, prompt: string, tag: string, signal?: AbortSignal): Promise<T> {
  for (let attempt = 0; attempt < 2; attempt++) {
    const text = await callJson(cfg, prompt, signal)
    const extracted = extractJsonObject(text)
    if (extracted) {
      try { return JSON.parse(extracted) as T } catch { writeDebug(tag, prompt, text, extracted) }
    } else {
      writeDebug(tag, prompt, text)
    }
  }
  throw codeError('LLM_PARSE_ERROR')
}

async function stageProfile(cfg: AppConfig, ctx: ReturnType<typeof collectWritingContext>, signal?: AbortSignal) {
  const prompt = read('blog-profile-queries-v1.md')
    .replace('{{summaries}}', ctx.summaries.map((s, i) => `第${i + 1}篇《${s.title}》：${s.summary}`).join('\n'))
    .replace('{{recentBodies}}', ctx.recentBodies.map((b, i) => `[近期原文${i + 1}]\n${b}`).join('\n\n'))
  return extractObjectWithRetry<{ profile: string; gaps: string[]; queries: string[] }>(cfg, prompt, 'blog-profile', signal)
}

async function stagePick(
  cfg: AppConfig,
  args: {
    profile: string; gaps: string[]; searchHits: string; pool: LocalBlogArticle[];
  },
  signal?: AbortSignal
): Promise<PickedArticle[]> {
  const poolText = args.pool.map((a, i) => `${i + 1}. ${a.sourceUrl} | ${a.title} | ${a.summary ?? ''}`).join('\n')
  const prompt = read('blog-recommend-pick-v1.md')
    .replace('{{profile}}', args.profile)
    .replace('{{gaps}}', args.gaps.join('\n'))
    .replace('{{searchHits}}', args.searchHits || '(无)')
    .replace('{{pool}}', poolText)
  for (let attempt = 0; attempt < 2; attempt++) {
    const text = await callJson(cfg, prompt, signal)
    const extracted = extractJsonArray(text)
    if (extracted) {
      try {
        const arr = JSON.parse(extracted) as { source_url?: string; reason?: string; gap?: string }[]
        const valid = new Set(args.pool.map(a => a.sourceUrl))
        return arr
          .filter(x => x.source_url && valid.has(x.source_url))
          .slice(0, 5)
          .map(x => ({ sourceUrl: x.source_url!, reason: x.reason ?? '', gap: x.gap ?? '' }))
      } catch { writeDebug('blog-pick', prompt, text, extracted) }
    } else {
      writeDebug('blog-pick', prompt, text)
    }
  }
  throw codeError('LLM_PARSE_ERROR')
}

export async function runBlogRecommend(
  cfg: AppConfig,
  opts: { signal?: AbortSignal; onStage?: (s: 'context' | 'profile' | 'search' | 'pick') => void }
): Promise<{ batch: BlogRecommendBatch; picks: PickedArticle[] }> {
  const lib = cfg.libraryPath
  const col = loadCollection(lib)

  opts.onStage?.('context')
  const ctx = collectWritingContext(lib)
  if (ctx.count === 0) throw codeError('NO_WRITING_CONTEXT')

  opts.onStage?.('profile')
  const profile = await stageProfile(cfg, ctx, opts.signal)

  opts.onStage?.('search')
  let searchHits = ''
  let searchUsed = false
  try {
    const key = await getSearchApiKey()
    if (key) {
      const lines: string[] = []
      for (const q of profile.queries ?? []) {
        const res = await searchWeb({
          query: q, apiKey: key, maxResults: 5, signal: opts.signal,
          includeDomains: ['anthropic.com', 'transformer-circuits.pub', 'claude.com'],
        })
        for (const r of res) lines.push(`${r.title}\n${r.url}\n${r.content.slice(0, 400)}`)
      }
      searchHits = lines.join('\n\n')
      searchUsed = lines.length > 0
    }
  } catch { searchUsed = false }

  opts.onStage?.('pick')
  const pool = collectLocalArticles(lib)
    .filter(a => !col.dismissed.includes(a.sourceUrl))
    .sort((a, b) => (b.importedAt ?? '').localeCompare(a.importedAt ?? ''))
    .slice(0, 80)
  if (pool.length === 0) throw codeError('NO_LOCAL_ARTICLES')

  const picks = await stagePick(cfg, { profile: profile.profile, gaps: profile.gaps ?? [], searchHits, pool }, opts.signal)

  const batch: BlogRecommendBatch = {
    batch: (col.lastBatch?.batch ?? 0) + 1,
    generatedAt: new Date().toISOString(),
    profile: profile.profile,
    gaps: profile.gaps ?? [],
    queries: profile.queries ?? [],
    searchUsed,
  }
  return { batch, picks }
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `npx vitest run tests/blog-recommend.test.ts`
Expected: PASS。

- [ ] **Step 5: 主进程 typecheck**

Run: `npx tsc --noEmit -p tsconfig.node.json`
Expected: PASS（若 `frontmatter.type` 等字段名不符，按 Frontmatter 类型修正后再跑）。

- [ ] **Step 6: Commit**

```bash
git add electron/lib/blog-recommend.ts tests/blog-recommend.test.ts
git commit -m "feat(blog): 推荐管线 LLM 编排——画像→Tavily 搜索→本地精排，dismissed 过滤、降级、debug 落盘、URL 校验"
```

---

## Task 6: IPC + preload + facade

**Files:**
- Modify: `electron/ipc/anthropic.ts`（新增 5 个 handler + 事件发送 + running guard + E2E mock 分支）
- Modify: `electron/preload.ts`（新增 7 个暴露）
- Modify: `src/lib/ipc.ts`（新增 7 个 facade getter）

**Interfaces:**
- Consumes: `loadCollection`/`saveCollection`/`addManualEntry`/`removeEntry`/`applyRecommend`（Task 2）、`runBlogRecommend`（Task 5）。
- Produces: 完整的 `anthropic:collectionRead/Add/Remove`、`anthropic:recommendStart/Cancel` handler 与 `anthropic:recommendStage`/`anthropic:recommendDone` 事件；preload + facade 同步。

- [ ] **Step 1: 在 `electron/ipc/anthropic.ts` 顶部补 import 与模块级状态**

在现有 import 块后追加：

```ts
import { loadCollection, saveCollection, addManualEntry, removeEntry, applyRecommend } from '../lib/blog-collection'
import { runBlogRecommend } from '../lib/blog-recommend'
import type { BlogRecommendErrorCode, BlogCollectionEntry } from '@shared/index'
```

在 `export function registerAnthropicIpc` 之前加模块级：

```ts
let recommendAbort: AbortController | null = null

function recommendErrorCode(err: unknown): BlogRecommendErrorCode {
  const c = (err as { code?: string })?.code
  if (c === 'NO_WRITING_CONTEXT' || c === 'NO_LOCAL_ARTICLES' || c === 'LLM_PARSE_ERROR' || c === 'ABORTED') return c
  return 'LLM_ERROR'
}
```

- [ ] **Step 2: 在 `registerAnthropicIpc` 函数体末尾（`anthropic:deleteArticle` 之后、函数右花括号之前）加 handler**

```ts
  ipcMain.handle('anthropic:collectionRead', async () => {
    return { ok: true as const, collection: loadCollection(cfg.libraryPath) }
  })

  ipcMain.handle('anthropic:collectionAdd', async (_, args: { sourceUrl: string; filePath: string; title: string }) => {
    const next = addManualEntry(loadCollection(cfg.libraryPath), args)
    saveCollection(cfg.libraryPath, next)
    return { ok: true as const, collection: next }
  })

  ipcMain.handle('anthropic:collectionRemove', async (_, args: { sourceUrl: string }) => {
    const next = removeEntry(loadCollection(cfg.libraryPath), args.sourceUrl)
    saveCollection(cfg.libraryPath, next)
    return { ok: true as const, collection: next }
  })

  ipcMain.handle('anthropic:recommendStart', async (event) => {
    if (recommendAbort) return { ok: false as const, code: 'ALREADY_RUNNING' as const }
    const ac = new AbortController()
    recommendAbort = ac
    const send = (channel: string, ...payload: unknown[]) => {
      if (!event.sender.isDestroyed()) event.sender.send(channel, ...payload)
    }
    void (async () => {
      try {
        // E2E mock：确定性推荐，不触网、不依赖真实本地文件。gate 同 E2E_ANTHROPIC_OFFLINE。
        if (process.env.NODE_ENV === 'test' && process.env.E2E_CONFIG_DIR && process.env.E2E_ANTHROPIC_RECOMMEND === '1') {
          const col = loadCollection(cfg.libraryPath)
          const batch = {
            batch: (col.lastBatch?.batch ?? 0) + 1,
            generatedAt: new Date().toISOString(),
            profile: 'E2E 画像：正在研究 AI 对齐',
            gaps: ['E2E 缺口'],
            queries: ['alignment'],
            searchUsed: false,
          }
          const pickEntries: BlogCollectionEntry[] = [{
            sourceUrl: 'https://alignment.anthropic.com/e2e-recommend/',
            filePath: 'Anthropic博客/2026-08/e2e-recommend.md',
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
        const { batch, picks } = await runBlogRecommend(cfg, { signal: ac.signal, onStage: (s) => send('anthropic:recommendStage', { stage: s }) })
        const pool = collectLocalArticles(cfg.libraryPath)
        const now = new Date().toISOString()
        const pickEntries: BlogCollectionEntry[] = picks.map(p => {
          const a = pool.find(x => x.sourceUrl === p.sourceUrl)
          return { sourceUrl: p.sourceUrl, filePath: a?.filePath ?? '', title: a?.title ?? p.sourceUrl, addedAt: now, origin: 'recommend' as const, reason: p.reason, gap: p.gap, batch: batch.batch }
        })
        const next = applyRecommend(loadCollection(cfg.libraryPath), batch, pickEntries)
        saveCollection(cfg.libraryPath, next)
        send('anthropic:recommendDone', { ok: true, collection: next })
      } catch (err) {
        if (ac.signal.aborted) send('anthropic:recommendDone', { ok: false, code: 'ABORTED' })
        else send('anthropic:recommendDone', { ok: false, code: recommendErrorCode(err) })
      } finally {
        recommendAbort = null
      }
    })()
    return { ok: true as const }
  })

  ipcMain.handle('anthropic:recommendCancel', async () => {
    recommendAbort?.abort()
  })
```

> 说明：`collectLocalArticles` 从 `electron/lib/blog-recommend.ts` 导入（Task 3 已导出）。import 行加：`import { runBlogRecommend, collectLocalArticles } from '../lib/blog-recommend'`。

- [ ] **Step 3: preload 暴露（`electron/preload.ts` 在 `onAnthropicBackfill` 之后加）**

```ts
    anthropicCollectionRead: () => ipcRenderer.invoke('anthropic:collectionRead'),
    anthropicCollectionAdd: (a) => ipcRenderer.invoke('anthropic:collectionAdd', a),
    anthropicCollectionRemove: (a) => ipcRenderer.invoke('anthropic:collectionRemove', a),
    anthropicRecommendStart: () => ipcRenderer.invoke('anthropic:recommendStart'),
    anthropicRecommendCancel: () => ipcRenderer.invoke('anthropic:recommendCancel'),
    onAnthropicRecommendStage: (cb) => {
      const handler = (_: unknown, p: { stage: import('@shared/index').RecommendStage }) => cb(p)
      ipcRenderer.on('anthropic:recommendStage', handler)
      return () => ipcRenderer.removeListener('anthropic:recommendStage', handler)
    },
    onAnthropicRecommendDone: (cb) => {
      const handler = (_: unknown, p: import('@shared/index').RecommendDonePayload) => cb(p)
      ipcRenderer.on('anthropic:recommendDone', handler)
      return () => ipcRenderer.removeListener('anthropic:recommendDone', handler)
    },
```

- [ ] **Step 4: facade（`src/lib/ipc.ts` 在 `get onAnthropicBackfill` 之后加）**

```ts
    get anthropicCollectionRead() { return ensure().anthropicCollectionRead },
    get anthropicCollectionAdd() { return ensure().anthropicCollectionAdd },
    get anthropicCollectionRemove() { return ensure().anthropicCollectionRemove },
    get anthropicRecommendStart() { return ensure().anthropicRecommendStart },
    get anthropicRecommendCancel() { return ensure().anthropicRecommendCancel },
    get onAnthropicRecommendStage() { return ensure().onAnthropicRecommendStage },
    get onAnthropicRecommendDone() { return ensure().onAnthropicRecommendDone },
```

- [ ] **Step 5: typecheck 两端**

Run: `npx tsc --noEmit && npx tsc --noEmit -p tsconfig.node.json`
Expected: PASS（此时 store/组件尚未使用新 API，类型层已闭合）。

- [ ] **Step 6: Commit**

```bash
git add electron/ipc/anthropic.ts electron/preload.ts src/lib/ipc.ts
git commit -m "feat(blog): 收藏夹与推荐 IPC——collection read/add/remove、recommend start/cancel、stage/done 事件、E2E mock 分支"
```

---

## Task 7: store 状态与 actions

**Files:**
- Modify: `src/store/index.ts`（新增 `blogCollection`/`recommendRunning`/`recommendStage` 字段 + 5 个 action）
- Modify: `src/lib/anthropic-runtime.ts`（注册推荐事件监听）

**Interfaces:**
- Consumes: Task 6 的 IPC facade；`BlogCollectionFile`/`RecommendStage`。
- Produces: store 字段 `blogCollection: BlogCollectionFile`、`recommendRunning: boolean`、`recommendStage: RecommendStage | null`；actions `loadBlogCollection`/`toggleBlogCollection`/`removeBlogCollection`/`startBlogRecommend`/`cancelBlogRecommend`。

- [ ] **Step 1: 在 store 接口类型段（约 L177 `deleteAnthropicArticle` 之后）加字段与 action 签名**

```ts
    blogCollection: BlogCollectionFile
    recommendRunning: boolean
    recommendStage: RecommendStage | null
    loadBlogCollection: () => Promise<void>
    toggleBlogCollection: (article: { sourceUrl: string; filePath: string; title: string }) => Promise<void>
    removeBlogCollection: (sourceUrl: string) => Promise<void>
    startBlogRecommend: () => Promise<void>
    cancelBlogRecommend: () => Promise<void>
```

（在文件顶部 import 段补 `BlogCollectionFile`、`RecommendStage`、`RecommendDonePayload` 到 `@shared/index` 的 type import 列表。）

- [ ] **Step 2: 初始值（约 L561 `constitutionReportOpen: false` 之后）**

```ts
    blogCollection: { version: 1, entries: [], dismissed: [], lastBatch: null },
    recommendRunning: false,
    recommendStage: null,
```

- [ ] **Step 3: actions 实现（约 L1420 `deleteAnthropicArticle` 之后）**

```ts
    loadBlogCollection: async () => {
      const r = await ipc.anthropicCollectionRead()
      if (r.ok) set({ blogCollection: r.collection })
    },
    toggleBlogCollection: async (article) => {
      const existing = get().blogCollection.entries.find(e => e.sourceUrl === article.sourceUrl)
      const r = existing
        ? await ipc.anthropicCollectionRemove({ sourceUrl: article.sourceUrl })
        : await ipc.anthropicCollectionAdd(article)
      if (r.ok) set({ blogCollection: r.collection })
    },
    removeBlogCollection: async (sourceUrl) => {
      const r = await ipc.anthropicCollectionRemove({ sourceUrl })
      if (r.ok) set({ blogCollection: r.collection })
    },
    startBlogRecommend: async () => {
      if (get().recommendRunning) return
      set({ recommendRunning: true, recommendStage: 'context' })
      const r = await ipc.anthropicRecommendStart()
      if (!r.ok) set({ recommendRunning: false, recommendStage: null })
    },
    cancelBlogRecommend: async () => {
      await ipc.anthropicRecommendCancel()
      set({ recommendRunning: false, recommendStage: null })
    },
```

- [ ] **Step 4: 事件监听（`src/lib/anthropic-runtime.ts`）**

在 `initAnthropicRuntime` 内追加（模块私有 helper 放文件底部）：

```ts
  ipc.onAnthropicRecommendStage(({ stage }) => {
    useStore.setState({ recommendStage: stage })
  })
  ipc.onAnthropicRecommendDone((p) => {
    if (p.ok) {
      useStore.setState({ blogCollection: p.collection, recommendRunning: false, recommendStage: null })
    } else {
      useStore.setState({ recommendRunning: false, recommendStage: null })
      const msg = recommendErrorText(p.code)
      if (msg) useStore.getState().showToast(msg)
    }
  })
```

文件底部加：

```ts
function recommendErrorText(code: string): string {
  switch (code) {
    case 'NO_WRITING_CONTEXT': return '先在写作里写几篇文章，推荐才有依据'
    case 'NO_LOCAL_ARTICLES': return '先从博客列表导入几篇文章'
    case 'LLM_ERROR': return '推荐失败，请稍后重试'
    case 'LLM_PARSE_ERROR': return '推荐结果解析失败，请重试'
    case 'ABORTED': return ''
    default: return '推荐失败'
  }
}
```

- [ ] **Step 5: 渲染层 typecheck**

Run: `npx tsc --noEmit`
Expected: PASS。

- [ ] **Step 6: Commit**

```bash
git add src/store/index.ts src/lib/anthropic-runtime.ts
git commit -m "feat(blog): 收藏夹与推荐 store 状态/actions + 推荐事件监听(进度/完成/错误码映射)"
```

---

## Task 8: 收藏夹 UI（面板区 + 推荐按钮 + 手动 ☆/★）

**Files:**
- Create: `src/components/anthropic/BlogCollectionSection.tsx`
- Modify: `src/components/anthropic/AnthropicBlogPanel.tsx`（挂载收藏夹区、加载 collection、传 fav 状态给行）
- Modify: `src/components/anthropic/AnthropicArticleRow.tsx`（加 ☆/★ 切换 + `inCollection`/`onToggleCollection` props）

**Interfaces:**
- Consumes: store 字段/actions（Task 7）。
- Produces: 收藏夹 UI 出口（`data-testid="blog-collection-section"`、`blog-recommend-button`、`blog-recommend-basis`、`blog-fav-toggle`）。

- [ ] **Step 1: 写 `BlogCollectionSection.tsx`**

```tsx
// src/components/anthropic/BlogCollectionSection.tsx
import { useState } from 'react'
import { useStore } from '@/store'
import type { BlogCollectionEntry, BriefingTheme } from '@shared/index'

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
  const startBlogRecommend = useStore((s) => s.startBlogRecommend)
  const cancelBlogRecommend = useStore((s) => s.cancelBlogRecommend)
  const removeBlogCollection = useStore((s) => s.removeBlogCollection)
  const openAnthropicReader = useStore((s) => s.openAnthropicReader)

  const [collapsed, setCollapsed] = useState(false)
  const [showBasis, setShowBasis] = useState(false)
  const [expandedReason, setExpandedReason] = useState<string | null>(null)

  const entries = collection.entries
  const batch = collection.lastBatch
  const border = isAcademic ? 'border-slate/30' : 'border-[#c9c3b8]'
  const muted = isAcademic ? 'text-parchment/50' : 'text-[#6b5d52]'
  const text = isAcademic ? 'text-parchment' : 'text-[#1a1a1a]'

  return (
    <div data-testid="blog-collection-section" className={`px-4 py-2 border-b ${border} shrink-0`}>
      <div className="flex items-center gap-2">
        <button type="button" data-testid="blog-collection-collapse" onClick={() => setCollapsed(c => !c)} className={`text-[10px] ${muted} hover:text-ember`}>
          {collapsed ? '▸' : '▾'}
        </button>
        <span className={`text-sm font-serif ${isAcademic ? 'text-ember' : 'text-[#6b5d52]'}`}>★ 收藏夹 ({entries.length})</span>
        <div className="flex-1" />
        <button
          type="button"
          data-testid="blog-recommend-button"
          onClick={() => (recommendRunning ? cancelBlogRecommend() : startBlogRecommend())}
          className={`text-xs px-2 py-1 rounded border transition-colors ${
            recommendRunning
              ? (isAcademic ? 'border-ember text-ember' : 'border-[#6b5d52] text-[#6b5d52]')
              : (isAcademic ? 'border-ember/40 text-ember hover:bg-ember/10' : 'border-[#6b5d52]/40 text-[#6b5d52] hover:bg-[#6b5d52]/10')
          }`}
        >
          {recommendRunning ? `${STAGE_TEXT[recommendStage ?? 'context']} ✕` : '为我推荐'}
        </button>
      </div>

      {batch && (
        <button
          type="button"
          data-testid="blog-recommend-basis"
          onClick={() => setShowBasis(s => !s)}
          className={`mt-1.5 block text-[10px] ${muted} hover:text-ember`}
        >
          基于你的写作画像 · {batch.gaps.length} 个缺口 · {batch.queries.length} 个检索方向
          {batch.searchUsed ? '' : ' · 未使用网络搜索'} {showBasis ? '▴' : '▾'}
        </button>
      )}
      {showBasis && batch && (
        <div className={`mt-1.5 rounded p-2 text-[11px] leading-relaxed ${isAcademic ? 'bg-ink/60 border border-parchment/10' : 'bg-[#f5f2ed] border border-[#1a1a1a]/10'}`}>
          <p className={text}>{batch.profile}</p>
          <p className={`mt-1 ${muted}`}>认知缺口：{batch.gaps.join('、')}</p>
          <p className={`mt-1 ${muted}`}>检索方向：{batch.queries.join('、')}</p>
        </div>
      )}

      {!collapsed && (
        <div className="mt-2 space-y-1.5 max-h-64 overflow-y-auto">
          {entries.length === 0 && !recommendRunning && (
            <p data-testid="blog-collection-empty" className={`text-xs ${muted}`}>
              尚无收藏——点「为我推荐」生成第一批，或点文章行的 ☆ 手动收藏
            </p>
          )}
          {entries.map((e) => (
            <CollectionRow
              key={e.sourceUrl}
              entry={e}
              isAcademic={isAcademic}
              expanded={expandedReason === e.sourceUrl}
              onToggleReason={() => setExpandedReason(expandedReason === e.sourceUrl ? null : e.sourceUrl)}
              onOpen={() => void openAnthropicReader(e.filePath)}
              onRemove={() => void removeBlogCollection(e.sourceUrl)}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function CollectionRow({ entry, isAcademic, expanded, onToggleReason, onOpen, onRemove }: {
  entry: BlogCollectionEntry
  isAcademic: boolean
  expanded: boolean
  onToggleReason: () => void
  onOpen: () => void
  onRemove: () => void
}) {
  return (
    <div className={`rounded border p-2 ${isAcademic ? 'bg-ink/60 border-parchment/10' : 'bg-white border-[#1a1a1a]/10'}`}>
      <div className="flex items-center gap-2">
        {entry.origin === 'recommend' && (
          <button type="button" data-testid={`blog-collection-reason-${entry.sourceUrl}`} onClick={onToggleReason} className="shrink-0 text-xs" title="查看推荐理由">💡</button>
        )}
        <button type="button" data-testid={`blog-collection-open-${entry.sourceUrl}`} onClick={onOpen} className={`flex-1 min-w-0 text-left text-xs truncate ${isAcademic ? 'text-parchment/90 hover:text-ember' : 'text-[#1a1a1a] hover:text-ember'}`}>
          {entry.title}
        </button>
        <button type="button" data-testid={`blog-collection-remove-${entry.sourceUrl}`} onClick={onRemove} className={`shrink-0 text-xs ${isAcademic ? 'text-parchment/40 hover:text-ember' : 'text-[#6b5d52]/50 hover:text-ember'}`}>
          ×
        </button>
      </div>
      {expanded && entry.origin === 'recommend' && (
        <div className={`mt-1.5 text-[11px] leading-relaxed ${isAcademic ? 'text-parchment/60' : 'text-[#6b5d52]'}`}>
          <p><span className="text-ember">为什么推荐：</span>{entry.reason}</p>
          {entry.gap && <p className="mt-0.5"><span className="text-ember">补上缺口：</span>{entry.gap}</p>}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: 挂载到 `AnthropicBlogPanel`**

在 `AnthropicBlogPanel.tsx`：
1. import `BlogCollectionSection`。
2. 从 store 取 `blogCollection`、`loadBlogCollection`、`toggleBlogCollection`。
3. 加一个挂载 effect：`useEffect(() => { void loadBlogCollection() }, [])`（或复用现有 effect 区）。
4. 在列表栏内、搜索框（`<div className="px-4 py-2 border-b ...">` 搜索输入）**之上**插入 `<BlogCollectionSection theme={theme} />`。
5. 在 `filtered.map` 里计算 fav 状态并传参：

```tsx
{filtered.map((article) => {
  const inCol = blogCollection.entries.some(e => e.sourceUrl === article.url)
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
    />
  )
})}
```

- [ ] **Step 3: `AnthropicArticleRow` 加 ☆/★**

在 `Props` 加两个可选字段：

```ts
  inCollection?: boolean
  onToggleCollection?: () => void
```

在根 `<button>` 内、`<div className="flex items-start gap-4">` 之前（或图块右上）插入：

```tsx
        {onToggleCollection && (
          <span
            data-testid="blog-fav-toggle"
            role="button"
            aria-pressed={inCollection}
            onClick={(e) => { e.stopPropagation(); e.preventDefault(); onToggleCollection() }}
            className={`absolute top-2 right-2 z-10 text-sm leading-none transition-colors ${
              inCollection
                ? 'text-ember'
                : isAcademic ? 'text-parchment/30 hover:text-ember' : 'text-[#6b5d52]/40 hover:text-ember'
            }`}
          >
            {inCollection ? '★' : '☆'}
          </span>
        )}
```

- [ ] **Step 4: 渲染层 typecheck**

Run: `npx tsc --noEmit`
Expected: PASS。

- [ ] **Step 5: Commit**

```bash
git add src/components/anthropic/BlogCollectionSection.tsx src/components/anthropic/AnthropicBlogPanel.tsx src/components/anthropic/AnthropicArticleRow.tsx
git commit -m "feat(blog): 收藏夹 UI——面板区(折叠/推荐按钮/画像理由/条目)、文章行 ☆/★ 手动收藏"
```

---

## Task 9: E2E + source-map

**Files:**
- Create: `e2e/specs/blog-collection.spec.ts`
- Modify: `e2e/source-map.json`（anthropic-blog group 的 sources 加 `electron/lib/blog-collection.ts`、`electron/lib/blog-recommend.ts`；specs 加 `blog-collection.spec.ts`）

**Interfaces:**
- Consumes: 现有 `fixtures/electron`、`CoverPage`、`SELECTORS`；`E2E_ANTHROPIC_RECOMMEND` mock 分支（Task 6）。

- [ ] **Step 1: 写 spec**

```ts
// e2e/specs/blog-collection.spec.ts
import { test, expect } from '../fixtures/electron'
import { CoverPage } from '../pages/CoverPage'
import { SELECTORS } from '../helpers/selectors'

test.describe('博客收藏夹与推荐', () => {
  test('收藏夹区渲染、手动收藏往返、跨重启持久化', async ({ window, testLibraryPath }) => {
    const cover = new CoverPage(window)
    await cover.enterName('E2E 测试员')
    await cover.goToBriefing()
    await window.locator(SELECTORS.briefing.sourceAnthropicButton).click()

    // UI 出口：收藏夹区与推荐按钮
    await expect(window.locator('[data-testid="blog-collection-section"]')).toBeVisible()
    await expect(window.locator('[data-testid="blog-recommend-button"]')).toBeVisible()
    await expect(window.locator('[data-testid="blog-collection-empty"]')).toBeVisible()

    // 触发推荐（E2E mock 分支：不触网，确定性产出 1 条）
    await window.locator('[data-testid="blog-recommend-button"]').click()
    await expect(window.locator('[data-testid^="blog-collection-open-"]').first()).toBeVisible({ timeout: 15000 })

    // 查看推荐理由
    await window.locator('[data-testid^="blog-collection-reason-"]').first().click()
    await expect(window.getByText('E2E 推荐理由')).toBeVisible()

    // 移除推荐条目 → 空态
    await window.locator('[data-testid^="blog-collection-remove-"]').first().click()
    await expect(window.locator('[data-testid="blog-collection-empty"]')).toBeVisible()
  })
})
```

> 说明：`SELECTORS.briefing.sourceAnthropicButton` 若不存在，参考现有 `e2e/specs/anthropic-blog.spec.ts` 的进入方式（`window.locator(SELECTORS.briefing.sourceAnthropicButton)` 已是既有选择器）。若手动收藏（☆）需真实本地文章，可复用 `@real` seed 库（`helpers/test-library` 的 `reachableArticleRow`）或仅覆盖 mock 推荐路径（推荐→移除→持久化），手动 ☆ 往返在下一任务 E2E 中一起补。

- [ ] **Step 2: 更新 source-map**

`e2e/source-map.json` 的 `anthropic-blog` group：
- `sources` 追加 `"electron/lib/blog-collection.ts"`、`"electron/lib/blog-recommend.ts"`。
- `specs` 追加 `"blog-collection.spec.ts"`。

- [ ] **Step 3: 运行定向 E2E**

Run: `node scripts/e2e-changed.js --run --no-retries`
Expected: `blog-collection.spec.ts` 通过（其余受影响 spec 也应绿）。

- [ ] **Step 4: Commit**

```bash
git add e2e/specs/blog-collection.spec.ts e2e/source-map.json
git commit -m "test(blog): 收藏夹 E2E——区渲染/推荐 mock/理由/移除/持久化 + source-map 登记"
```

---

### 阶段 1 检查点

到此模块 1 完整可交付：收藏夹落盘、推荐管线、IPC/store/UI 全链路、单测 + E2E 齐备。建议先跑一次 `node scripts/e2e-changed.js --run --no-retries` 全绿后，再进入阶段 2。

---

# 阶段 2：右栏统一 + 对照推广

> 本阶段较复杂，先说明共享约定：新增一个通用右栏 tab 面板 `ArticleSidePanel`（导读 | 助手 | 对照），博客/前沿/求职三个栏目都挂它。对照槽复用 `CompanionBoard`（md 可编辑/ html 只读）与 `MarkdownRenderer`（求职只读）。右槽开关/宽度统一持久化到 `articleSidePanelOpen`/`articleSidePanelWidth`。

## Task 10: 文章正文写回 IPC + 单测

**Files:**
- Create: `electron/lib/article-io.ts`（`writeArticleBody(lib, absPath, body)` + 路径白名单校验）
- Modify: `electron/ipc/anthropic.ts`（加 `anthropic:writeArticleBody` handler）
- Modify: `electron/preload.ts` + `src/lib/ipc.ts` + `src/types/index.ts`（暴露 + facade + 类型）
- Test: `tests/article-io.test.ts`

**Interfaces:**
- Consumes: `gray-matter`（主进程）、`Frontmatter`。
- Produces: `writeArticleBody(lib, absPath, body): void`（抛 `code: 'ARTICLE_PATH_FORBIDDEN'` 或 `'ARTICLE_WRITE_ERROR'`）；IpcApi `anthropicWriteArticleBody`。

- [ ] **Step 1: 写失败测试**

```ts
// tests/article-io.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { writeArticleBody } from '../electron/lib/article-io'

let dir: string
beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'art-io-')) })
afterEach(() => { fs.rmSync(dir, { recursive: true, force: true }) })

function write(p: string, c: string) { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, c) }

describe('writeArticleBody', () => {
  it('越界路径抛 ARTICLE_PATH_FORBIDDEN', () => {
    expect(() => writeArticleBody(dir, path.join(os.tmpdir(), 'x.md'), 'b')).toThrowError(/ARTICLE_PATH_FORBIDDEN/)
  })
  it('保留 frontmatter 只替换正文', () => {
    const p = path.join(dir, 'Anthropic博客', 'x.md')
    write(p, '---\ntitle: T\nsource_url: https://a\n---\n旧正文')
    writeArticleBody(dir, p, '新正文')
    const raw = fs.readFileSync(p, 'utf8')
    expect(raw).toContain('title: T')
    expect(raw).toContain('新正文')
    expect(raw).not.toContain('旧正文')
  })
  it('拾贝目录同样可写', () => {
    const p = path.join(dir, '拾贝', '文章', 'x.md')
    write(p, '---\ntitle: T\n---\n旧')
    writeArticleBody(dir, p, '新')
    expect(fs.readFileSync(p, 'utf8')).toContain('新')
  })
})
```

- [ ] **Step 2: 运行确认失败**

Run: `npx vitest run tests/article-io.test.ts`
Expected: FAIL——module 不存在。

- [ ] **Step 3: 实现 `electron/lib/article-io.ts`**

```ts
// electron/lib/article-io.ts
import fs from 'fs'
import path from 'path'
import matter from 'gray-matter'

const ALLOWED_DIRS = ['Anthropic博客', '拾贝']

function code(code: string): Error {
  return Object.assign(new Error(code), { code })
}

export function writeArticleBody(lib: string, absPath: string, body: string): void {
  const normLib = path.resolve(lib)
  const resolved = path.resolve(absPath)
  if (!resolved.startsWith(normLib + path.sep) && resolved !== normLib) {
    throw code('ARTICLE_PATH_FORBIDDEN')
  }
  const rel = path.relative(normLib, resolved)
  const top = rel.split(path.sep)[0]
  if (!ALLOWED_DIRS.includes(top)) throw code('ARTICLE_PATH_FORBIDDEN')
  if (path.extname(resolved).toLowerCase() !== '.md') throw code('ARTICLE_PATH_FORBIDDEN')

  try {
    let fm: Record<string, unknown> = {}
    if (fs.existsSync(resolved)) {
      fm = (matter(fs.readFileSync(resolved, 'utf8')).data as Record<string, unknown>) ?? {}
    }
    const content = matter.stringify(body.replace(/^\n/, ''), fm)
    fs.writeFileSync(resolved, content, 'utf8')
  } catch (err) {
    if ((err as { code?: string })?.code) throw err
    throw code('ARTICLE_WRITE_ERROR')
  }
}
```

- [ ] **Step 4: handler + preload + facade + 类型**

handler（`electron/ipc/anthropic.ts`，import `writeArticleBody`）：

```ts
  ipcMain.handle('anthropic:writeArticleBody', async (_, args: { filePath: string; body: string }) => {
    try {
      writeArticleBody(cfg.libraryPath, args.filePath, args.body)
      return { ok: true as const }
    } catch (err) {
      const c = (err as { code?: string })?.code
      return { ok: false as const, code: c === 'ARTICLE_PATH_FORBIDDEN' ? 'ARTICLE_PATH_FORBIDDEN' as const : 'ARTICLE_WRITE_ERROR' as const }
    }
  })
```

类型（`src/types/index.ts` IpcApi）：

```ts
    anthropicWriteArticleBody: (args: { filePath: string; body: string }) => Promise<{ ok: true } | { ok: false; code: 'ARTICLE_PATH_FORBIDDEN' | 'ARTICLE_WRITE_ERROR' }>
```

preload：

```ts
    anthropicWriteArticleBody: (a) => ipcRenderer.invoke('anthropic:writeArticleBody', a),
```

facade（`src/lib/ipc.ts`）：

```ts
    get anthropicWriteArticleBody() { return ensure().anthropicWriteArticleBody },
```

- [ ] **Step 5: 测试 + typecheck**

Run: `npx vitest run tests/article-io.test.ts && npx tsc --noEmit && npx tsc --noEmit -p tsconfig.node.json`
Expected: 全 PASS。

- [ ] **Step 6: Commit**

```bash
git add electron/lib/article-io.ts electron/ipc/anthropic.ts electron/preload.ts src/lib/ipc.ts src/types/index.ts tests/article-io.test.ts
git commit -m "feat(article): 文章正文写回 IPC——白名单目录校验、frontmatter 保留、越界拒绝"
```

---

## Task 11: 右栏统一 store 状态 + actions + 单测

**Files:**
- Modify: `src/types/index.ts`（`StateJson` 加 `articlePanelMode`/`articleCompanionMap`/`articleSidePanelOpen`/`articleSidePanelWidth`）
- Modify: `src/store/index.ts`（字段 + actions）
- Modify: `electron/ipc/state.ts`（`DEFAULT` 补默认值）
- Test: `tests/article-companion.test.ts`（纯 store 逻辑的辅助函数，见下）

**Interfaces:**
- Consumes: `anthropicWriteArticleBody`（Task 10）、`writingRead`（读对照文正文）、`writingReadPreview`。
- Produces: store 字段 `articlePanelMode: Record<'anthropic'|'scout'|'job', 'guide'|'assistant'|'companion'>`、`articleCompanionMap: Record<string,string>`、`articleSidePanelOpen: boolean`、`articleSidePanelWidth: number`、`articleCompanion: { key; filePath; kind; body; readonly; dirty; saving } | null`；actions `setArticlePanelMode`、`selectArticleCompanion`、`updateArticleCompanionBody`、`saveArticleCompanion`、`closeArticleCompanion`。

- [ ] **Step 1: StateJson 类型 + DEFAULT**

`src/types/index.ts` StateJson 加：

```ts
    articlePanelMode?: Record<'anthropic' | 'scout' | 'job', 'guide' | 'assistant' | 'companion'>
    articleCompanionMap?: Record<string, string>
    articleSidePanelOpen?: boolean
    articleSidePanelWidth?: number
```

`electron/ipc/state.ts` 的 `DEFAULT` 加：

```ts
    articlePanelMode: { anthropic: 'guide', scout: 'guide', job: 'assistant' },
    articleCompanionMap: {},
    articleSidePanelOpen: true,
    articleSidePanelWidth: 320,
```

- [ ] **Step 2: store 字段 + actions**

在 store 接口类型段加：

```ts
    articlePanelMode: Record<'anthropic' | 'scout' | 'job', 'guide' | 'assistant' | 'companion'>
    articleCompanionMap: Record<string, string>
    articleSidePanelOpen: boolean
    articleSidePanelWidth: number
    articleCompanion: { key: string; filePath: string; kind: 'md' | 'html' | 'other'; body: string; readonly: boolean; dirty: boolean; saving: 'idle' | 'saving' | 'saved' | 'error' } | null
    setArticlePanelMode: (source: 'anthropic' | 'scout' | 'job', mode: 'guide' | 'assistant' | 'companion') => void
    setArticleSidePanelOpen: (open: boolean) => void
    setArticleSidePanelWidth: (width: number) => void
    selectArticleCompanion: (source: 'anthropic' | 'scout' | 'job', mainKey: string, filePath: string, opts?: { readonly?: boolean }) => Promise<void>
    updateArticleCompanionBody: (body: string) => void
    saveArticleCompanion: () => Promise<void>
    closeArticleCompanion: () => Promise<void>
```

初始值（复用 init 合并 `state.articlePanelMode ?? {...}`、`state.articleCompanionMap ?? {}`、`state.articleSidePanelOpen ?? true`、`state.articleSidePanelWidth ?? 320`）：

```ts
    articlePanelMode: { anthropic: 'guide', scout: 'guide', job: 'assistant' },
    articleCompanionMap: {},
    articleSidePanelOpen: true,
    articleSidePanelWidth: 320,
    articleCompanion: null,
```

init 合并段（照抄 `writingPanelMode` 现有合并，约 L643 附近）：

```ts
        articlePanelMode: state.articlePanelMode ?? { anthropic: 'guide', scout: 'guide', job: 'assistant' },
        articleCompanionMap: state.articleCompanionMap ?? {},
        articleSidePanelOpen: state.articleSidePanelOpen ?? true,
        articleSidePanelWidth: state.articleSidePanelWidth ?? 320,
```

actions 实现（照抄 companion-pane 既有 `selectCompanionFile` 模式，改用绝对路径 + `writingRead` 读正文）：

```ts
    setArticlePanelMode: (source, mode) => {
      const next = { ...get().articlePanelMode, [source]: mode }
      set({ articlePanelMode: next })
      ipc.patchState({ articlePanelMode: next } as Partial<StateJson>)
    },
    setArticleSidePanelOpen: (open) => {
      set({ articleSidePanelOpen: open })
      ipc.patchState({ articleSidePanelOpen: open } as Partial<StateJson>)
    },
    setArticleSidePanelWidth: (width) => {
      set({ articleSidePanelWidth: width })
      ipc.patchState({ articleSidePanelWidth: width } as Partial<StateJson>)
    },
    selectArticleCompanion: async (source, mainKey, filePath, opts) => {
      if (get().articleCompanion?.dirty) await get().saveArticleCompanion()
      const map = { ...get().articleCompanionMap, [mainKey]: filePath }
      set({ articleCompanionMap: map })
      ipc.patchState({ articleCompanionMap: map } as Partial<StateJson>)
      const ext = filePath.toLowerCase()
      const kind: 'md' | 'html' | 'other' = ext.endsWith('.md') ? 'md' : ext.endsWith('.html') ? 'html' : 'other'
      const readonly = opts?.readonly === true || kind === 'html'
      if (kind !== 'md') {
        const r = await ipc.writingReadPreview({ path: filePath })
        if (r.ok) set({ articleCompanion: { key: mainKey, filePath, kind, body: r.value.content ?? '', readonly, dirty: false, saving: 'idle' } })
        else set({ articleCompanion: null })
        return
      }
      const r = await ipc.writingRead({ path: filePath })
      if (r.ok) set({ articleCompanion: { key: mainKey, filePath, kind: 'md', body: r.value.body ?? '', readonly, dirty: false, saving: 'idle' } })
      else set({ articleCompanion: null })
    },
    updateArticleCompanionBody: (body) => set(s => s.articleCompanion ? { articleCompanion: { ...s.articleCompanion, body, dirty: true } } : {}),
    saveArticleCompanion: async () => {
      const f = get().articleCompanion
      if (!f || !f.dirty || f.readonly) return
      set({ articleCompanion: { ...f, saving: 'saving' as const } })
      const r = await ipc.anthropicWriteArticleBody({ filePath: f.filePath, body: f.body })
      const cur = get().articleCompanion
      if (!cur || cur.filePath !== f.filePath) return
      set({ articleCompanion: { ...cur, dirty: !r.ok, saving: r.ok ? 'saved' as const : 'error' as const } })
    },
    closeArticleCompanion: async () => {
      if (get().articleCompanion?.dirty) await get().saveArticleCompanion()
      set({ articleCompanion: null })
    },
```

> 注意：`ipc.writingRead`/`ipc.writingReadPreview` 是相对路径 + `assertInsideRoots(lib, rel)` 校验——它们接受相对学习库路径。博客/前沿的 `filePath` 是**绝对路径**（`files:read` 校验过）。因此 `selectArticleCompanion` 传入的 `filePath` 必须先转成相对库路径。提供一个模块私有 helper：`const rel = filePath.replace(path.resolve(lib) + path.sep, '')`——但渲染层拿不到 `lib` 绝对路径。**改用现有 `files:read` 读正文**（绝对路径 + 库内校验，`electron/ipc/files.ts` L334）更省事：新增一个 `files:readBody` 或用 `ipc.readMd(filePath)`（已存在的 facade，返回 `{frontmatter, body}`）。**本计划采用 `ipc.readMd(filePath)`** 读对照文 md 正文（渲染层已有该 facade，`src/lib/ipc.ts` L11）。非 md 的对照文（博客/前沿几乎都是 md）走 `ipc.readMd` 也返回 body 即可，不区分 kind。据此简化：`articleCompanion.kind` 仅按扩展名标注用于「html 只读」分支，读取一律 `ipc.readMd(filePath)`。

据此重写 `selectArticleCompanion` 的读取段：

```ts
      const kind: 'md' | 'html' | 'other' = filePath.toLowerCase().endsWith('.md') ? 'md' : filePath.toLowerCase().endsWith('.html') ? 'html' : 'other'
      const readonly = opts?.readonly === true || kind === 'html'
      try {
        const r = await ipc.readMd(filePath)   // { frontmatter, body }
        set({ articleCompanion: { key: mainKey, filePath, kind, body: r.body ?? '', readonly, dirty: false, saving: 'idle' } })
      } catch {
        set({ articleCompanion: null })
      }
```

- [ ] **Step 3: typecheck + 提交**

Run: `npx tsc --noEmit && npx tsc --noEmit -p tsconfig.node.json`
Expected: PASS。

> 本任务无独立单测文件（store actions 依赖大量 mock，E2E 覆盖运行时行为）；若欲加纯逻辑单测，可对「`articleCompanionMap` 恢复映射」写一个纯函数 `resolveArticleCompanionMap(map, mainKey)` 放 `src/lib/`，本计划不强制。

```bash
git add src/types/index.ts src/store/index.ts electron/ipc/state.ts
git commit -m "feat(article): 右栏统一 store——panelMode(导读|助手|对照)/companionMap/开关宽度/对照槽, 读正文复 readMd"
```

---

## Task 12: 通用右栏 tab 面板 + 对照槽组件

**Files:**
- Create: `src/components/article-assistant/ArticleSidePanel.tsx`（tab 壳：导读 | 助手 | 对照）
- Create: `src/components/article-assistant/ArticleCompanionBoard.tsx`（对照槽内容，md 可编辑/ html 只读/ 求职只读 MarkdownRenderer）
- Modify: `src/components/article-assistant/GuideSidebar.tsx`（如需：确认可被 tab 壳复用，无需改则跳过）

**Interfaces:**
- Consumes: store `articlePanelMode`/`articleSidePanelOpen`/`articleSidePanelWidth`/`articleCompanion` 及 actions（Task 11）；`GuideSidebar`、`ChatWindow`（现有 `ArticleAssistantPanel` 内部件）；`WritingEditor`、`HtmlPreview`、`MarkdownRenderer`。
- Produces: `<ArticleSidePanel source articleType parentPath articleTitle articleContent autoGenerateGuide theme />`；内部 tab 切换 + 对照槽渲染。

- [ ] **Step 1: 写 `ArticleSidePanel.tsx`（tab 壳）**

```tsx
// src/components/article-assistant/ArticleSidePanel.tsx
import { useEffect, useRef, useState } from 'react'
import { useStore } from '@/store'
import { ArticleDivider } from './ArticleDivider'
import { GuideSidebar } from './GuideSidebar'
import { ChatWindow } from './ChatWindow'
import { ArticleCompanionBoard } from './ArticleCompanionBoard'
import type { BriefingTheme } from '@shared/index'

export type ArticleSideSource = 'anthropic' | 'scout' | 'job'
export type ArticlePanelMode = 'guide' | 'assistant' | 'companion'

interface Props {
  source: ArticleSideSource
  articleType: string
  parentPath: string
  articleTitle?: string
  articleContent: string
  autoGenerateGuide?: boolean
  theme?: BriefingTheme
}

export function ArticleSidePanel({ source, articleType, parentPath, articleTitle, articleContent, autoGenerateGuide, theme = 'academic' }: Props) {
  const mode = useStore((s) => s.articlePanelMode[source])
  const open = useStore((s) => s.articleSidePanelOpen)
  const width = useStore((s) => s.articleSidePanelWidth)
  const setMode = useStore((s) => s.setArticlePanelMode)
  const setOpen = useStore((s) => s.setArticleSidePanelOpen)
  const setWidth = useStore((s) => s.setArticleSidePanelWidth)
  const [closing, setClosing] = useState(false)
  const closeTimer = useRef<number | null>(null)

  useEffect(() => () => { if (closeTimer.current) clearTimeout(closeTimer.current) }, [])
  useEffect(() => { if (open) setClosing(false) }, [open])

  const requestClose = () => { if (closing) return; setClosing(true); closeTimer.current = window.setTimeout(() => setOpen(false), 200) }

  const tabCls = (m: ArticlePanelMode) =>
    `text-[11px] tracking-[0.2em] font-serif px-2 py-1 rounded transition-colors ${mode === m ? 'text-ember bg-ember/10' : 'text-parchment/60 hover:text-parchment/90'}`

  return (
    <div data-testid="article-side-panel" className={`relative z-[5] flex h-full shrink-0 ${!open ? '' : (closing ? 'panel-depart' : 'panel-arise')}`}>
      <ArticleDivider
        collapsed={!open}
        onToggleCollapse={() => (open ? requestClose() : setOpen(true))}
        onResize={(w) => {
          const max = window.innerWidth * 0.45
          if (w < 40) { if (open) requestClose() } else { if (!open) setOpen(true); setWidth(Math.max(200, Math.min(w, max))) }
        }}
        theme="academic"
      />
      {open && (
        <div className="h-full overflow-hidden" style={{ width }}>
          <div className="h-full flex flex-col min-w-0 border-l border-parchment/20 bg-[#1a1512]">
            <div className="h-9 flex items-center justify-between px-3 border-b border-parchment/10 shrink-0">
              <div className="flex items-center gap-1">
                <button data-testid={`article-panel-tab-guide-${source}`} className={tabCls('guide')} onClick={() => setMode(source, 'guide')}>导读</button>
                <button data-testid={`article-panel-tab-assistant-${source}`} className={tabCls('assistant')} onClick={() => setMode(source, 'assistant')}>助手</button>
                <button data-testid={`article-panel-tab-companion-${source}`} className={tabCls('companion')} onClick={() => setMode(source, 'companion')}>对照</button>
              </div>
              <button data-testid={`article-side-panel-close-${source}`} className="text-parchment/60 hover:text-ember text-sm leading-none px-1" onClick={requestClose} aria-label="关闭">✕</button>
            </div>
            {mode === 'guide' ? (
              <div className="flex-1 min-h-0 overflow-hidden"><GuideSidebar theme={theme} /></div>
            ) : mode === 'assistant' ? (
              <div className="flex-1 min-h-0 overflow-hidden"><ChatWindow /></div>
            ) : (
              <ArticleCompanionBoard source={source} />
            )}
          </div>
        </div>
      )}
    </div>
  )
}
```

> 注意：`ChatWindow`/`GuideSidebar` 的 session 初始化目前在 `ArticleAssistantPanel` 的 effect 里完成（`openAssistantSession`）。`ArticleSidePanel` 需要把这段初始化逻辑搬进来（或保留在面板外、由父组件调）。**实施时**：把 `ArticleAssistantPanel.tsx` L34-48 的 `useEffect`（openAssistantSession on parentPath change）与 L52-65 选区监听**原样搬入** `ArticleSidePanel`，用 `articleType`/`parentPath`/`articleTitle`/`articleContent`/`autoGenerateGuide` 调用 `openAssistantSession`。`ChatWindow` 依赖这些 session 状态，保持不动。

- [ ] **Step 2: 写 `ArticleCompanionBoard.tsx`**

```tsx
// src/components/article-assistant/ArticleCompanionBoard.tsx
import { useEffect } from 'react'
import { useStore } from '@/store'
import { WritingEditor } from '@/components/writing/WritingEditor'
import { HtmlPreview } from '@/components/writing/HtmlPreview'
import { MarkdownRenderer } from '@/components/MarkdownRenderer'
import type { ArticleSideSource } from './ArticleSidePanel'

export function ArticleCompanionBoard({ source }: { source: ArticleSideSource }) {
  const file = useStore((s) => s.articleCompanion)
  const updateBody = useStore((s) => s.updateArticleCompanionBody)
  const save = useStore((s) => s.saveArticleCompanion)
  const close = useStore((s) => s.closeArticleCompanion)

  useEffect(() => {
    if (!file?.dirty) return
    const t = setTimeout(() => save(), 1500)
    return () => clearTimeout(t)
  }, [file?.body, file?.dirty])

  if (!file) {
    return (
      <div className="flex h-full items-center justify-center px-6">
        <p data-testid="article-companion-empty" className="text-center text-parchment/40 text-xs leading-relaxed">
          在对照模式下点击左侧文章，在此展开对照
        </p>
      </div>
    )
  }

  const base = file.filePath.split(/[\\/]/).pop() || file.filePath

  return (
    <div data-testid="article-companion-board" className="flex flex-col h-full min-h-0">
      <div className="flex items-center gap-2 px-3 h-9 border-b border-parchment/10 shrink-0">
        <span className="truncate text-[11px] min-w-0 font-serif text-parchment/80">{base}</span>
        <span data-testid="article-companion-save-status" className="shrink-0 text-[10px]">
          {file.saving === 'saving' ? <span className="text-parchment/50">保存中…</span>
           : file.saving === 'saved' ? <span className="text-emerald-400/70">已保存 ✓</span>
           : file.saving === 'error' ? <span className="text-red-400/70">保存失败</span> : null}
        </span>
        <div className="flex-1" />
        <button data-testid="article-companion-close" className="text-parchment/60 hover:text-ember text-sm leading-none px-1" onClick={() => void close()} aria-label="关闭对照">✕</button>
      </div>
      {file.kind === 'md' && !file.readonly ? (
        <div className="flex-1 min-h-0 overflow-y-auto px-4 py-4 text-parchment/90">
          <WritingEditor key={file.filePath} initial={file.body} onChange={(md) => updateBody(md)} registerToolbarAction={false} />
        </div>
      ) : file.kind === 'html' ? (
        <div className="flex-1 min-h-0"><HtmlPreview file={{ path: file.filePath, body: file.body }} /></div>
      ) : (
        <div className="flex-1 min-h-0 overflow-y-auto px-4 py-4">
          <MarkdownRenderer content={file.body} fileName={base} hideHeader briefingStyle="academic" />
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 3: typecheck**

Run: `npx tsc --noEmit`
Expected: PASS（若 `MarkdownRenderer`/`HtmlPreview`/`ChatWindow` 的 props 名有出入，按实际签名修正；`WritingEditor` 的 `initial`/`onChange`/`registerToolbarAction` 已由写作侧确认）。

- [ ] **Step 4: Commit**

```bash
git add src/components/article-assistant/ArticleSidePanel.tsx src/components/article-assistant/ArticleCompanionBoard.tsx
git commit -m "feat(article): 通用右栏 tab 面板(导读|助手|对照) + 对照槽(可编辑/只读/求职只读)"
```

---

## Task 13: 接线三个栏目面板

**Files:**
- Modify: `src/components/anthropic/AnthropicBlogPanel.tsx`（把 `ArticleAssistantPanel` 换成 `ArticleSidePanel source="anthropic"`，列表行点击在对照模式下切换对照文）
- Modify: `src/components/scout/ScoutPanel.tsx` + `src/components/scout/ScoutListColumn.tsx`（同上 `source="scout"`）
- Modify: `src/pages/Briefing.tsx`（job 右栏换 `ArticleSidePanel source="job"`，日期列点击在对照模式下切对照文）

**Interfaces:**
- Consumes: `ArticleSidePanel`（Task 12）、store `articlePanelMode`/`selectArticleCompanion`（Task 11）。
- Produces: 三栏目右栏统一；对照模式下左键情境化切换对照文。

- [ ] **Step 1: 博客接线**

`AnthropicBlogPanel.tsx`：
1. import 换 `ArticleSidePanel`。
2. 右栏挂载段（L406-415）替换为：

```tsx
      {readerFilePath && readerBody && (
        <ArticleSidePanel
          source="anthropic"
          articleType="anthropic-article"
          parentPath={readerFilePath}
          articleTitle={readerTitle ?? undefined}
          articleContent={readerBody}
          autoGenerateGuide
          theme={theme}
        />
      )}
```

3. 列表行点击分流：在 `openOrImportArticle`（L144）开头加对照模式分流（需要读 `articlePanelMode.anthropic` 与 `articleSidePanelOpen`）：

```ts
    const panelMode = useStore.getState().articlePanelMode.anthropic
    const sideOpen = useStore.getState().articleSidePanelOpen
    if (sideOpen && panelMode === 'companion' && article.isSaved && article.filePath) {
      const main = useStore.getState().anthropicReaderFilePath
      if (main === article.filePath) { useStore.getState().showToast('该文章已在主区打开'); return }
      await useStore.getState().selectArticleCompanion('anthropic', main ?? 'anthropic-main', article.filePath)
      return
    }
```

> 同样在 `AnthropicArticleRow.handleClick`（L58）里做同等分流（因行组件自身处理点击）。为收敛，把「对照模式判断 + selectArticleCompanion」封装成一个 store action `maybeOpenArticleCompanion(source, filePath)` 供两处调用，避免重复。本计划给出该 action 逻辑，实施时并入 Task 11 的 store（或就地两处重复亦可，二选一，推荐封装）。

- [ ] **Step 2: 前沿接线**

`ScoutPanel.tsx` L108-117 的 `ArticleAssistantPanel` 换成：

```tsx
      {scoutTab === 'articles' && readerFilePath && readerBody && (
        <ArticleSidePanel
          source="scout"
          articleType="web-article"
          parentPath={readerFilePath}
          articleTitle={readerTitle ?? undefined}
          articleContent={readerBody}
          autoGenerateGuide
          theme={theme}
        />
      )}
```

`ScoutListColumn.tsx` 的 `onOpen={() => openScoutReader(a.filePath)}` 换成带对照分流的回调（对照模式 + 右栏展开 → `selectArticleCompanion('scout', readerFilePath, a.filePath)`，否则 `openScoutReader`）。

- [ ] **Step 3: 求职接线**

`Briefing.tsx` L573-579 的 `JobAssistantPanel` 换成：

```tsx
      {isJob && jobResult?.filePath && (
        <ArticleSidePanel
          source="job"
          articleType="briefing"
          parentPath={jobResult.filePath}
          articleTitle={jobResult.title}
          articleContent={jobResult.content ?? ''}
          theme={theme}
        />
      )}
```

求职日期列点击（`BriefingDateColumn` 的 `onSelect`）在对照模式下 → `selectArticleCompanion('job', jobViewDate, jobResult.filePath, { readonly: true })`（求职对照只读）。

> 求职导读：本任务先用 `ArticleSidePanel` 的「导读」tab 挂 `GuideSidebar`，`autoGenerateGuide` 传 `true`（`openAssistantSession` 时带上）。若 guide-v2 管线对 job briefing 正文需要额外 keying，在 Task 15 单独处理。

- [ ] **Step 4: typecheck + 提交**

Run: `npx tsc --noEmit`
Expected: PASS。

```bash
git add src/components/anthropic/AnthropicBlogPanel.tsx src/components/scout/ScoutPanel.tsx src/components/scout/ScoutListColumn.tsx src/pages/Briefing.tsx
git commit -m "feat(article): 三栏目右栏统一接线——博客/前沿/求职挂 ArticleSidePanel, 对照模式左键情境化切换"
```

---

## Task 14: 求职导读 + 收尾清理

**Files:**
- Modify: `src/components/article-assistant/ArticleSidePanel.tsx`（确认导读 tab 对 job 可用；job 打开 session 传 `autoGenerateGuide`）
- Modify: 删除/停用旧 `JobAssistantPanel`、`ArticleAssistantPanel` 的挂载残留（若仍有引用）

**Interfaces:**
- Consumes: guide-v2 管线（导读生成），`openAssistantSession`。
- Produces: 求职栏目获得导读。

- [ ] **Step 1: 求职导读接线验证**

确认 `ArticleSidePanel` 的 session 初始化 effect 对 `source="job"` 传入 `autoGenerateGuide: true`。`openAssistantSession` 的 `articleType` 对 job 用 `'briefing'`（与现有 `JobAssistantPanel` 一致，L49）。若 guide-v2 依赖 `parentPath` 做文件 keying，用 `jobResult.filePath`（已是 `求职简报/求职简报-<date>.md`）即可，无需额外改动。若导读对 job 正文生成失败，降级为现有行为（GuideSidebar 显示生成中/重试），不阻断。

- [ ] **Step 2: 清理旧面板引用**

`grep` 确认 `JobAssistantPanel`、`ArticleAssistantPanel` 已无任何 `import`/挂载残留（digest 源仍用 `ArticleAssistantPanel`？——**不**，digest 源 `Briefing.tsx` L563 也换成 `ArticleSidePanel source 用一个新源或复用**）。确认后删除死引用。

> 决策：digest 源（每日简报）本需求**不在范围内**（spec 非目标写明「digest 源不动」）。故 `Briefing.tsx` L563 的 digest `ArticleAssistantPanel` **保持原样**；只有 `isJob` 分支换 `ArticleSidePanel`。`ArticleAssistantPanel` 组件保留（digest 仍用），**不删**。`JobAssistantPanel` 在换掉唯一挂载后删除其文件与 import。

- [ ] **Step 3: typecheck + 提交**

Run: `npx tsc --noEmit`
Expected: PASS（删除 JobAssistantPanel 后无残留 import）。

```bash
git add src/components/article-assistant/ArticleSidePanel.tsx src/components/job-briefing/JobAssistantPanel.tsx src/pages/Briefing.tsx
git commit -m "feat(article): 求职导读接线 + 移除旧 JobAssistantPanel 死引用"
```

---

## Task 15: E2E + source-map

**Files:**
- Create: `e2e/specs/article-side-panel.spec.ts`
- Modify: `e2e/source-map.json`（新增/复用 group，覆盖 `src/components/article-assistant/**`）

**Interfaces:**
- Consumes: 现有 fixtures；`ArticleSidePanel` 的 data-testid。

- [ ] **Step 1: 写 spec**

```ts
// e2e/specs/article-side-panel.spec.ts
import { test, expect } from '../fixtures/electron'
import { CoverPage } from '../pages/CoverPage'
import { SELECTORS } from '../helpers/selectors'
import { reachableArticleRow } from '../helpers/test-library'

test.describe('右栏统一（导读|助手|对照）', () => {
  test('博客右栏三 tab 渲染 + 切对照 tab', async ({ window, testLibraryPath }) => {
    const cover = new CoverPage(window)
    await cover.enterName('E2E 测试员')
    await cover.goToBriefing()
    await window.locator(SELECTORS.briefing.sourceAnthropicButton).click()
    // 打开一篇文章：先切来源、等列表出现、点第一个已保存文章行（复用 e2e/specs/anthropic-blog.spec.ts 的
    // reachableArticleRow(helpers/test-library.ts) 定位已保存行，或走 importArticle mock）。
    const row = await reachableArticleRow(window)
    await row.click()
    // 打开后断言三 tab 存在（右栏在 readerBody 回填后挂载）
    await expect(window.locator('[data-testid="article-panel-tab-guide-anthropic"]')).toBeVisible()
    await expect(window.locator('[data-testid="article-panel-tab-assistant-anthropic"]')).toBeVisible()
    await expect(window.locator('[data-testid="article-panel-tab-companion-anthropic"]')).toBeVisible()
    await window.locator('[data-testid="article-panel-tab-companion-anthropic"]').click()
    await expect(window.locator('[data-testid="article-companion-empty"]')).toBeVisible()
  })
})
```

> 打开文章的种子复用现有 `anthropic-blog.spec.ts` 的 @real 链路或 mock 导入；若当前 seed 库无现成已保存文章，可在 spec 里用 `reachableArticleRow` helper（`e2e/helpers/test-library.ts`）定位已保存行点击打开。具体选择以现有 spec 写法为准。

- [ ] **Step 2: source-map 登记**

`e2e/source-map.json`：新增 group `article-side-panel`，sources 含 `src/components/article-assistant/**`、`src/components/writing/WritingEditor.tsx`、`src/components/writing/HtmlPreview.tsx`、`electron/lib/article-io.ts`；specs 含 `article-side-panel.spec.ts`。

- [ ] **Step 3: 运行定向 E2E**

Run: `node scripts/e2e-changed.js --run --no-retries`
Expected: `article-side-panel.spec.ts` 通过。

- [ ] **Step 4: Commit**

```bash
git add e2e/specs/article-side-panel.spec.ts e2e/source-map.json
git commit -m "test(article): 右栏统一 E2E——三 tab 渲染/切对照 + source-map 登记"
```

---

## 完成前验证清单（合并前门禁）

- [ ] `npx vitest run tests/blog-collection.test.ts tests/blog-recommend.test.ts tests/article-io.test.ts` 全绿
- [ ] `npx tsc --noEmit && npx tsc --noEmit -p tsconfig.node.json` 全绿
- [ ] `node scripts/e2e-changed.js --run --no-retries` 全绿
- [ ] `npm run build` 成功（打包门禁，仅合并前）
