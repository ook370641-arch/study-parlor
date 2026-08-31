# 博客推荐迭代 v2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 推荐历史独立为右栏推荐页（批次切换/删除/画像+缺口+逐篇导读理由），收藏夹积累机制修正（★ 对推荐条目=转正），每次推荐产出持久化导读摘要，已读改纯手动标记。

**Architecture:** 数据层：`BlogRecommendPick`/`BlogCollectionEntry` 加可选 `guide`，collection 加 `promoteEntry`/`removeBatch`；生成端 pick prompt 升 v2 输出 guide；渲染层新增 `BlogRecommendView` 右栏视图（store `recommendViewBatch` 驱动），左栏移除推荐历史，文章行加批号徽标。

**Tech Stack:** Electron 主进程、React + Zustand、Vitest + @testing-library/react、Playwright E2E。

**Spec:** `docs/superpowers/specs/2026-08-31-blog-recommend-page-design.md`（v1 spec：`2026-08-30-blog-recommend-iteration-design.md` 已落地）

## Global Constraints

- 只跑定向测试，禁止 `npx vitest run` 全量与全量 E2E（general §9）。
- IPC 变更按 types → handler → preload → facade → store → 组件 顺序同步（ipc-state §1）。
- 不新增字号常量；推荐页/收藏夹统一走 `BRIEFING_LIST_STYLES[briefingFontSize]`（ui-styling §6）。
- 组件文件只导出组件；lookup helper 放 `src/lib/`（ui-styling §10）。
- 所有新交互元素带 `data-testid`（e2e §5）。
- 删除本计划自己产生的孤儿（findReadTarget、blog-read-lookup.test.ts）；不碰无关死代码。
- commit 风格：`<type>(<scope>): 中文描述`；工作区 main 上有另一会话未提交文件（CompanionBoard.tsx / milkdown-text-color.ts / text-color-mark.test.ts），任何任务不得触碰，commit 只 add 本任务文件。
- E2E 跑 `out/` 产物，`node scripts/e2e-changed.js --run --no-retries` 自动先构建。

---

### Task 1: 数据层——guide 字段 + promoteEntry + removeBatch

**Files:**
- Modify: `src/types/index.ts`（BlogRecommendPick、BlogCollectionEntry——v1 已加 focus/picks/read）
- Modify: `electron/lib/blog-collection.ts`
- Test: `tests/blog-collection.test.ts`

**Interfaces:**
- Produces:
  - `BlogRecommendPick.guide?: string`、`BlogCollectionEntry.guide?: string`（可选，旧数据兼容）
  - `promoteEntry(c: BlogCollectionFile, sourceUrl: string): BlogCollectionFile`——recommend 条目转正 manual，保留 reason/gap/batch/addedAt；非 recommend 或不存在返回原对象
  - `removeBatch(c: BlogCollectionFile, batch: number): BlogCollectionFile`——只过滤 history，不动 entries/dismissed/read

- [ ] **Step 1: 写失败测试**

`tests/blog-collection.test.ts`：import 补 `promoteEntry, removeBatch`，文件末尾追加：

```ts
describe('promoteEntry', () => {
  it('recommend 条目转正为 manual，保留推荐字段', () => {
    const c: BlogCollectionFile = {
      ...empty(),
      entries: [{ sourceUrl: 'u1', filePath: 'a.md', title: 'A', addedAt: 'x', origin: 'recommend', reason: 'r', gap: 'g', batch: 3 }],
    }
    const c2 = promoteEntry(c, 'u1')
    expect(c2.entries[0]).toMatchObject({ origin: 'manual', reason: 'r', gap: 'g', batch: 3 })
  })
  it('manual 条目或不存在的 URL 返回原对象', () => {
    const c: BlogCollectionFile = {
      ...empty(),
      entries: [{ sourceUrl: 'u1', filePath: 'a.md', title: 'A', addedAt: 'x', origin: 'manual' }],
    }
    expect(promoteEntry(c, 'u1')).toBe(c)
    expect(promoteEntry(c, 'nope')).toBe(c)
  })
  it('转正后的 manual 条目在下一批推荐后仍保留', () => {
    const c: BlogCollectionFile = {
      ...empty(),
      entries: [
        { sourceUrl: 'u1', filePath: 'a.md', title: 'A', addedAt: 'x', origin: 'recommend', batch: 1 },
        { sourceUrl: 'u2', filePath: 'b.md', title: 'B', addedAt: 'x', origin: 'recommend', batch: 1 },
      ],
    }
    const promoted = promoteEntry(c, 'u1')
    const batch: BlogRecommendBatch = { batch: 2, generatedAt: 'g', profile: 'p', gaps: [], queries: [], searchUsed: false }
    const c2 = applyRecommend(promoted, batch, [{ sourceUrl: 'u3', filePath: 'c.md', title: 'C', addedAt: 'y', origin: 'recommend', batch: 2 }])
    expect(c2.entries.map(e => e.sourceUrl).sort()).toEqual(['u1', 'u3'])
  })
})

describe('removeBatch', () => {
  it('只删指定批次的 history，不动 entries/read', () => {
    const c: BlogCollectionFile = {
      ...empty(),
      entries: [{ sourceUrl: 'u1', filePath: 'a.md', title: 'A', addedAt: 'x', origin: 'manual' }],
      read: [{ sourceUrl: 'u1', filePath: 'a.md', title: 'A', readAt: 'x' }],
      history: [
        { batch: 2, generatedAt: 'g', profile: 'p2', gaps: [], queries: [], searchUsed: false },
        { batch: 1, generatedAt: 'g', profile: 'p1', gaps: [], queries: [], searchUsed: false },
      ],
    }
    const c2 = removeBatch(c, 1)
    expect(c2.history.map(b => b.batch)).toEqual([2])
    expect(c2.entries).toHaveLength(1)
    expect(c2.read).toHaveLength(1)
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run tests/blog-collection.test.ts`
Expected: FAIL —— promoteEntry/removeRead 未定义。

- [ ] **Step 3: 实现**

`src/types/index.ts`：`BlogRecommendPick` 加 `guide?: string // 导读摘要（pick v2 prompt 起）；旧批次无此字段`；`BlogCollectionEntry` 加 `guide?: string // 导读摘要（仅 recommend）`。

`electron/lib/blog-collection.ts` 末尾追加：

```ts
/** 推荐条目转正为手动收藏：下批推荐后仍保留。非 recommend 或不存在返回原对象 */
export function promoteEntry(c: BlogCollectionFile, sourceUrl: string): BlogCollectionFile {
  const target = c.entries.find(e => e.sourceUrl === sourceUrl)
  if (!target || target.origin !== 'recommend') return c
  return { ...c, entries: c.entries.map(e => e.sourceUrl === sourceUrl ? { ...e, origin: 'manual' as const } : e) }
}

/** 删除指定推荐批次的历史记录，不动 entries/dismissed/read */
export function removeBatch(c: BlogCollectionFile, batch: number): BlogCollectionFile {
  return { ...c, history: c.history.filter(b => b.batch !== batch) }
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `npx vitest run tests/blog-collection.test.ts`
Expected: PASS（全部用例）。

- [ ] **Step 5: Commit**

```bash
git add src/types/index.ts electron/lib/blog-collection.ts tests/blog-collection.test.ts
git commit -m "feat(blog): collection 加 promoteEntry(★转正)/removeBatch + guide 字段契约"
```

---

### Task 2: 生成端导读——pick prompt v2 + E2E mock 补 guide

**Files:**
- Create: `electron/prompts/blog-recommend-pick-v2.md`
- Modify: `electron/lib/blog-recommend.ts`（PickedArticle 96 行、stagePick 148-178）
- Modify: `electron/ipc/anthropic.ts`（E2E mock 分支，picks/pickEntries 补 guide）
- Test: `tests/blog-recommend.test.ts`

**Interfaces:**
- Consumes: Task 1 的 `guide` 字段。
- Produces: `PickedArticle = { sourceUrl: string; reason: string; gap: string; guide: string }`；stagePick 缺 guide/非字符串 → 该次响应作废重试（沿用既有 2 次重试 → LLM_PARSE_ERROR）；E2E mock 批次 picks 与 pickEntries 含 `guide: 'E2E 导读摘要'`。

- [ ] **Step 1: 写失败测试**

`tests/blog-recommend.test.ts`：
① 所有 stagePick 的 mock 响应数组元素补 `"guide": 'gd'` 字段（「完整链路」「Tavily 可用」「批次携带 focus 与 picks 快照」三处）。
②「批次携带 focus 与 picks 快照」用例补断言 `expect(r.batch.picks![0].guide).toBe('gd')`。
③ 追加：

```ts
it('stagePick 缺 guide 字段时抛 LLM_PARSE_ERROR', async () => {
  seedWriting(); seedPool()
  ;(getSearchApiKey as any).mockResolvedValue(null)
  ;(chatNonStream as any)
    .mockResolvedValueOnce(JSON.stringify({ focus: 'f', profile: 'p', gaps: ['g'], queries: ['q'] }))
    .mockResolvedValue(JSON.stringify([{ source_url: 'https://anthropic.com/a', reason: 'r', gap: 'g' }]))
  await expect(runBlogRecommend(cfg, {})).rejects.toMatchObject({ code: 'LLM_PARSE_ERROR' })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run tests/blog-recommend.test.ts`
Expected: FAIL —— guide 未校验/未落盘。

- [ ] **Step 3: 实现**

新建 `electron/prompts/blog-recommend-pick-v2.md`（完整内容）：

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
{"source_url": "清单中该文的 source_url", "reason": "一句话：为什么这篇至关重要且切合缺口", "gap": "它补上的是哪个认知缺口", "guide": "2-3 句导读：这篇讲什么核心内容、为什么切合用户此刻的缺口"}

要求：
- source_url 必须逐字来自清单，不得杜撰。
- 只选清单里确实存在的文章，最多 5 篇，宁缺毋滥（不足 5 篇就返回实际篇数）。
- 按契合度从高到低排序。
- guide 写给用户看，用「你」称呼；基于标题与摘要，不臆造文章不存在的内容。
```

`electron/lib/blog-recommend.ts`：
① `PickedArticle` 改 `{ sourceUrl: string; reason: string; gap: string; guide: string }`。
② stagePick 读 `blog-recommend-pick-v2.md`；解析 map 处改为校验 guide：

```ts
        const arr = JSON.parse(extracted) as { source_url?: string; reason?: string; gap?: string; guide?: string }[]
        const valid = new Set(args.pool.map(a => a.sourceUrl))
        const picks = arr
          .filter(x => x.source_url && valid.has(x.source_url))
          .slice(0, 5)
          .map(x => ({ sourceUrl: x.source_url!, reason: x.reason ?? '', gap: x.gap ?? '', guide: x.guide ?? '' }))
        if (picks.length === 0 || picks.some(p => !p.guide)) throw new Error('shape')
        return picks
```

（throw 进既有 catch → writeDebug → 重试 → LLM_PARSE_ERROR，链路不变。）
③ batch picks 快照 map 补 `guide: p.guide`。
④ 返回类型不变（`picks: PickedArticle[]` 已含 guide）。

`electron/ipc/anthropic.ts` E2E mock 分支：picks 数组元素与 pickEntries 各补 `guide: 'E2E 导读摘要'`。

- [ ] **Step 4: 跑测试确认通过**

Run: `npx vitest run tests/blog-recommend.test.ts`
Expected: PASS。

- [ ] **Step 5: Commit**

```bash
git add electron/prompts/blog-recommend-pick-v2.md electron/lib/blog-recommend.ts electron/ipc/anthropic.ts tests/blog-recommend.test.ts
git commit -m "feat(blog): pick prompt 升 v2 输出导读摘要并持久化进批次快照"
```

---

### Task 3: IPC——collectionPromote + collectionRemoveBatch 四层同步

**Files:**
- Modify: `src/types/index.ts`（IpcApi anthropicCollection* 区）
- Modify: `electron/ipc/anthropic.ts`
- Modify: `electron/preload.ts`
- Modify: `src/lib/ipc.ts`

**Interfaces:**
- Consumes: Task 1 的 `promoteEntry`/`removeBatch`。
- Produces:
  - `ipc.anthropicCollectionPromote({ sourceUrl }): Promise<{ ok: true; collection: BlogCollectionFile }>`
  - `ipc.anthropicCollectionRemoveBatch({ batch }): Promise<{ ok: true; collection: BlogCollectionFile }>`

- [ ] **Step 1: types（IpcApi）**

`src/types/index.ts` 在 `anthropicCollectionRemoveRead` 声明后插入：

```ts
    anthropicCollectionPromote: (args: { sourceUrl: string }) => Promise<{ ok: true; collection: BlogCollectionFile }>
    anthropicCollectionRemoveBatch: (args: { batch: number }) => Promise<{ ok: true; collection: BlogCollectionFile }>
```

- [ ] **Step 2: 主进程 handler**

`electron/ipc/anthropic.ts`：import 补 `promoteEntry, removeBatch`（来自 `../lib/blog-collection`），在 `anthropic:collectionRemoveRead` handler 后插入：

```ts
  ipcMain.handle('anthropic:collectionPromote', async (_, args: { sourceUrl: string }) => {
    const next = promoteEntry(loadCollection(cfg.libraryPath), args.sourceUrl)
    saveCollection(cfg.libraryPath, next)
    return { ok: true as const, collection: next }
  })

  ipcMain.handle('anthropic:collectionRemoveBatch', async (_, args: { batch: number }) => {
    const next = removeBatch(loadCollection(cfg.libraryPath), args.batch)
    saveCollection(cfg.libraryPath, next)
    return { ok: true as const, collection: next }
  })
```

- [ ] **Step 3: preload + facade**

`electron/preload.ts` 在 `anthropicCollectionRemoveRead` 后插入：

```ts
  anthropicCollectionPromote: (a) => ipcRenderer.invoke('anthropic:collectionPromote', a),
  anthropicCollectionRemoveBatch: (a) => ipcRenderer.invoke('anthropic:collectionRemoveBatch', a),
```

`src/lib/ipc.ts` 在 `anthropicCollectionRemoveRead` getter 后插入：

```ts
  get anthropicCollectionPromote() { return ensure().anthropicCollectionPromote },
  get anthropicCollectionRemoveBatch() { return ensure().anthropicCollectionRemoveBatch },
```

- [ ] **Step 4: 类型检查**

Run: `npx tsc --noEmit -p tsconfig.node.json && npx tsc --noEmit -p tsconfig.json`
Expected: 通过。

- [ ] **Step 5: Commit**

```bash
git add src/types/index.ts electron/ipc/anthropic.ts electron/preload.ts src/lib/ipc.ts
git commit -m "feat(blog): IPC 链路新增 collectionPromote/collectionRemoveBatch"
```

---

### Task 4: store + runtime——三分支收藏、推荐页状态、移除自动已读

**Files:**
- Modify: `src/store/index.ts`（toggleBlogCollection 1498-1504；openAnthropicReader 自动已读段；state 与 Actions）
- Modify: `src/lib/anthropic-runtime.ts`（recommendDone 自动切入推荐页）
- Delete: `src/lib/blog-read-lookup.ts`、`tests/blog-read-lookup.test.ts`（本计划 v1 产生的孤儿）
- Test: `tests/anthropic-blog-panel.test.tsx`（移除 companion 自动已读用例——实现变更后它必红；该文件其余用例归 Task 6）

**Interfaces:**
- Consumes: Task 3 的两个新 IPC。
- Produces:
  - store state `recommendViewBatch: number | null`（初始 null）
  - `openRecommendView(batch: number): void`、`closeRecommendView(): void`
  - `removeBlogBatch(batch: number): Promise<void>`
  - `toggleBlogCollection` 三分支：不存在→add；recommend→promote；manual→remove
  - `openAnthropicReader` 不再自动标已读，且置 `recommendViewBatch: null`
  - `onAnthropicRecommendDone` 成功分支置 `recommendViewBatch = collection.history[0]?.batch ?? null`

- [ ] **Step 1: 改测试**

`tests/anthropic-blog-panel.test.tsx`：删除「对照模式打开也自动已读」用例（v1 终审所加，断言 companion 打开后 `anthropicCollectionMarkRead` 被调用的那个）。追加：

```tsx
  it('recommend 条目点 ★ 走转正而非移除', async () => {
    const { ipc } = await import('@/lib/ipc')
    useStore.setState({
      anthropicBlogCache: {
        lastFetchedAt: null,
        articles: [{ ...article('old-1', 'Old Article'), isSaved: true, filePath: 'lib/old-1.md' }],
        loading: false, error: null,
      },
      blogCollection: {
        version: 1, dismissed: [], history: [], read: [],
        entries: [{ sourceUrl: 'old-1', filePath: 'lib/old-1.md', title: 'Old Article', addedAt: 'x', origin: 'recommend' as const, batch: 1 }],
      },
    } as any)
    render(<AnthropicBlogPanel theme="academic" />)
    fireEvent.click(screen.getByTestId('blog-fav-toggle'))
    await waitFor(() => expect(ipc.anthropicCollectionPromote).toHaveBeenCalledWith({ sourceUrl: 'old-1' }))
    expect(ipc.anthropicCollectionRemove).not.toHaveBeenCalled()
  })
```

同时给该文件 vi.mock('@/lib/ipc') 的 mock 对象补 `anthropicCollectionPromote: vi.fn().mockResolvedValue({ ok: true, collection: { version: 1, entries: [], dismissed: [], history: [], read: [] } })`。

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run tests/anthropic-blog-panel.test.tsx`
Expected: FAIL —— anthropicCollectionPromote 未被调用（旧逻辑走 remove）。

- [ ] **Step 3: 实现**

`src/store/index.ts`：
① State 接口与初始值补 `recommendViewBatch: null`；Actions 接口补：

```ts
  openRecommendView: (batch: number) => void
  closeRecommendView: () => void
  removeBlogBatch: (batch: number) => Promise<void>
```

② `toggleBlogCollection` 改三分支：

```ts
  toggleBlogCollection: async (article) => {
    const existing = get().blogCollection.entries.find(e => e.sourceUrl === article.sourceUrl)
    const r = !existing
      ? await ipc.anthropicCollectionAdd(article)
      : existing.origin === 'recommend'
        ? await ipc.anthropicCollectionPromote({ sourceUrl: article.sourceUrl })
        : await ipc.anthropicCollectionRemove({ sourceUrl: article.sourceUrl })
    if (r.ok) set({ blogCollection: r.collection })
  },
```

③ `openAnthropicReader`：删除自动已读段（含 `findReadTarget` 调用与 import），并置推荐页关闭：

```ts
  openAnthropicReader: async (filePath) => {
    const now = new Date().toISOString()
    set({ anthropicReaderFilePath: filePath, anthropicBlogLastSeenAt: now, constitutionReportOpen: false, recommendViewBatch: null })
    await ipc.patchState({ anthropicBlogLastSeenAt: now } as Partial<StateJson>)
  },
```

④ 新增 actions（放在 removeBlogRead 后）：

```ts
  openRecommendView: (batch) =>
    set({ recommendViewBatch: batch, anthropicReaderFilePath: null, anthropicReaderBody: null, anthropicReaderTitle: null, constitutionReportOpen: false }),
  closeRecommendView: () => set({ recommendViewBatch: null }),
  removeBlogBatch: async (batch) => {
    const r = await ipc.anthropicCollectionRemoveBatch({ batch })
    if (r.ok) set({ blogCollection: r.collection })
  },
```

⑤ 删除 `src/lib/blog-read-lookup.ts` 与 `tests/blog-read-lookup.test.ts`（git rm），并移除 store 顶部 `findReadTarget` import。

`src/lib/anthropic-runtime.ts` recommendDone 成功分支改：

```ts
      useStore.setState({
        blogCollection: p.collection,
        recommendRunning: false,
        recommendStage: null,
        recommendViewBatch: p.collection.history[0]?.batch ?? null,
      })
```

- [ ] **Step 4: 跑测试确认通过**

Run: `npx vitest run tests/anthropic-blog-panel.test.tsx tests/blog-collection.test.ts`
Expected: PASS。另跑 `npx tsc --noEmit -p tsconfig.json` 确认无 findReadTarget 残留引用。

- [ ] **Step 5: Commit**

```bash
git add src/store/index.ts src/lib/anthropic-runtime.ts tests/anthropic-blog-panel.test.tsx
git rm src/lib/blog-read-lookup.ts tests/blog-read-lookup.test.ts
git commit -m "feat(blog): ★对推荐条目改为转正 + 推荐页视图状态 + 已读改纯手动（移除自动标记）"
```

---

### Task 5: 推荐页组件 BlogRecommendView + 右栏接线

**Files:**
- Create: `src/components/anthropic/BlogRecommendView.tsx`
- Create: `src/lib/blog-rec-lookup.ts`
- Modify: `src/components/anthropic/AnthropicBlogPanel.tsx`（右栏渲染优先级 392-401 区）
- Test: `tests/blog-recommend-view.test.tsx`（新建）、`tests/blog-rec-lookup.test.ts`（新建）

**Interfaces:**
- Consumes: Task 4 的 `recommendViewBatch`/`openRecommendView`/`closeRecommendView`/`removeBlogBatch`，Task 1 的 guide 字段，既有 `toggleBlogCollection`/`toggleBlogRead`/`openAnthropicReader`。
- Produces:
  - `<BlogRecommendView theme? />`；testid：`blog-rec-view`、`blog-rec-prev`、`blog-rec-next`、`blog-rec-delete-batch`、`blog-rec-close`、`blog-rec-pick-<sourceUrl>`、`blog-rec-fav-<sourceUrl>`、`blog-rec-read-<sourceUrl>`、`blog-rec-empty`
  - `findBatchForUrl(history: BlogRecommendBatch[], sourceUrl: string): number | null`（history 最新在前，多批命中取最新）

- [ ] **Step 1: 写失败测试**

`tests/blog-rec-lookup.test.ts`：

```ts
import { describe, it, expect } from 'vitest'
import { findBatchForUrl } from '../src/lib/blog-rec-lookup'
import type { BlogRecommendBatch } from '../src/types'

const batch = (n: number, urls: string[]): BlogRecommendBatch => ({
  batch: n, generatedAt: 'g', profile: 'p', gaps: [], queries: [], searchUsed: false,
  picks: urls.map(u => ({ sourceUrl: u, title: u, filePath: 'f', reason: 'r', gap: 'g' })),
})

describe('findBatchForUrl', () => {
  it('命中返回批次号，多批命中取最新（history 最新在前）', () => {
    const h = [batch(3, ['a']), batch(1, ['a', 'b'])]
    expect(findBatchForUrl(h, 'a')).toBe(3)
    expect(findBatchForUrl(h, 'b')).toBe(1)
  })
  it('未命中或无 picks 的旧批次返回 null', () => {
    const old: BlogRecommendBatch = { batch: 0, generatedAt: 'g', profile: 'p', gaps: [], queries: [], searchUsed: false }
    expect(findBatchForUrl([old], 'a')).toBeNull()
    expect(findBatchForUrl([], 'a')).toBeNull()
  })
})
```

`tests/blog-recommend-view.test.tsx`：

```tsx
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react'

const mockIpc = vi.hoisted(() => ({
  readMd: vi.fn().mockResolvedValue({ frontmatter: { title: 'x' }, body: '正文' }),
  anthropicCollectionRemoveBatch: vi.fn(),
  anthropicCollectionPromote: vi.fn().mockResolvedValue({ ok: true }),
  anthropicCollectionMarkRead: vi.fn().mockResolvedValue({ ok: true }),
}))
vi.mock('@/lib/ipc', () => ({ ipc: mockIpc }))

import { useStore } from '@/store'
import { BlogRecommendView } from '@/components/anthropic/BlogRecommendView'
import type { BlogCollectionFile } from '@/types'

const pick = (n: number) => ({
  sourceUrl: `https://anthropic.com/p${n}`, title: `文章${n}`, filePath: `lib/p${n}.md`,
  reason: `理由${n}`, gap: '缺口一', guide: `导读${n}`,
})
const collectionWith = (history: BlogCollectionFile['history']): BlogCollectionFile => ({
  version: 1, entries: [], dismissed: [], history, read: [],
})
const newBatch = {
  batch: 2, generatedAt: '2026-08-30T00:15:50.000Z', focus: '评测集构建',
  profile: '画像全文', gaps: ['缺口一'], queries: ['evaluation'], searchUsed: true,
  picks: [pick(1), pick(2)],
}
const oldBatch = { batch: 1, generatedAt: '2026-08-01T00:00:00.000Z', profile: '旧画像', gaps: ['旧缺口'], queries: ['q'], searchUsed: false }

describe('BlogRecommendView', () => {
  beforeEach(() => {
    cleanup()
    vi.clearAllMocks()
    useStore.setState({
      blogCollection: collectionWith([newBatch, oldBatch]),
      recommendViewBatch: 2,
      briefingFontSize: 'base',
      openRecommendView: vi.fn((b: number) => useStore.setState({ recommendViewBatch: b })),
      closeRecommendView: vi.fn(() => useStore.setState({ recommendViewBatch: null })),
      removeBlogBatch: vi.fn(),
      toggleBlogCollection: vi.fn(),
      toggleBlogRead: vi.fn(),
      openAnthropicReader: vi.fn(),
      showToast: vi.fn(),
    } as any)
  })

  it('渲染核心方向/画像/知识缺口/逐篇导读与理由', () => {
    render(<BlogRecommendView theme="academic" />)
    expect(screen.getByTestId('blog-rec-view')).toBeInTheDocument()
    expect(screen.getByText(/评测集构建/)).toBeInTheDocument()
    expect(screen.getByText('画像全文')).toBeInTheDocument()
    expect(screen.getByText(/缺口一/)).toBeInTheDocument()
    expect(screen.getByText('导读1')).toBeInTheDocument()
    expect(screen.getByText(/理由1/)).toBeInTheDocument()
  })

  it('批次切换：上一批到旧批次并降级渲染，边界置灰', () => {
    render(<BlogRecommendView theme="academic" />)
    expect(screen.getByTestId('blog-rec-next')).toBeDisabled()   // 已是最新
    fireEvent.click(screen.getByTestId('blog-rec-prev'))
    expect(screen.getByText('旧画像')).toBeInTheDocument()
    expect(screen.queryByTestId(/^blog-rec-pick-/)).not.toBeInTheDocument()
    expect(screen.getByTestId('blog-rec-prev')).toBeDisabled()   // 已是最旧
  })

  it('删除本批调用 removeBlogBatch', () => {
    render(<BlogRecommendView theme="academic" />)
    fireEvent.click(screen.getByTestId('blog-rec-delete-batch'))
    expect(useStore.getState().removeBlogBatch).toHaveBeenCalledWith(2)
  })

  it('无历史时渲染空态引导', () => {
    useStore.setState({ blogCollection: collectionWith([]), recommendViewBatch: 1 } as any)
    render(<BlogRecommendView theme="academic" />)
    expect(screen.getByTestId('blog-rec-empty')).toBeInTheDocument()
  })

  it('逐篇卡片点标题打开阅读器', async () => {
    render(<BlogRecommendView theme="academic" />)
    fireEvent.click(screen.getByTestId('blog-rec-pick-https://anthropic.com/p1'))
    await waitFor(() => expect(mockIpc.readMd).toHaveBeenCalledWith('lib/p1.md'))
    expect(useStore.getState().openAnthropicReader).toHaveBeenCalledWith('lib/p1.md')
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run tests/blog-rec-lookup.test.ts tests/blog-recommend-view.test.tsx`
Expected: FAIL —— 模块/组件不存在。

- [ ] **Step 3: 实现**

`src/lib/blog-rec-lookup.ts`：

```ts
import type { BlogRecommendBatch } from '@shared/index'

/** 文章 URL → 所属推荐批次号；history 最新在前，多批命中取最新 */
export function findBatchForUrl(history: BlogRecommendBatch[], sourceUrl: string): number | null {
  for (const b of history) {
    if (b.picks?.some(p => p.sourceUrl === sourceUrl)) return b.batch
  }
  return null
}
```

`src/components/anthropic/BlogRecommendView.tsx`（完整组件；只导出本组件）：

```tsx
// src/components/anthropic/BlogRecommendView.tsx
import { useStore } from '@/store'
import { ipc } from '@/lib/ipc'
import { BRIEFING_LIST_STYLES } from '@/lib/briefing-font-size'
import type { BlogRecommendPick, BriefingTheme } from '@shared/index'

export function BlogRecommendView({ theme = 'academic' }: { theme?: BriefingTheme }) {
  const isAcademic = theme !== 'newspaper'
  const collection = useStore((s) => s.blogCollection)
  const viewBatch = useStore((s) => s.recommendViewBatch)
  const fontSize = useStore((s) => s.briefingFontSize)
  const openRecommendView = useStore((s) => s.openRecommendView)
  const closeRecommendView = useStore((s) => s.closeRecommendView)
  const removeBlogBatch = useStore((s) => s.removeBlogBatch)
  const toggleBlogCollection = useStore((s) => s.toggleBlogCollection)
  const toggleBlogRead = useStore((s) => s.toggleBlogRead)
  const openAnthropicReader = useStore((s) => s.openAnthropicReader)
  const showToast = useStore((s) => s.showToast)

  const listStyles = BRIEFING_LIST_STYLES[fontSize]
  const muted = isAcademic ? 'text-parchment/50' : 'text-[#6b5d52]'
  const text = isAcademic ? 'text-parchment' : 'text-[#1a1a1a]'

  const history = collection.history
  const idx = history.findIndex(b => b.batch === viewBatch)

  if (idx < 0) {
    return (
      <div data-testid="blog-rec-empty" className={`flex-1 flex items-center justify-center ${muted}`} style={{ fontSize: listStyles.title }}>
        没有推荐批次——点左栏「重新推荐」生成第一批
      </div>
    )
  }

  const b = history[idx]
  const hasPrev = idx < history.length - 1  // 更旧
  const hasNext = idx > 0                    // 更新

  const openPick = async (p: BlogRecommendPick) => {
    try {
      await ipc.readMd(p.filePath)
      await openAnthropicReader(p.filePath)
    } catch {
      showToast('该文件已被删除，无法打开')
    }
  }

  const onDelete = () => {
    const neighbor = hasNext ? history[idx - 1].batch : hasPrev ? history[idx + 1].batch : null
    void removeBlogBatch(b.batch)
    if (neighbor != null) openRecommendView(neighbor)
    else closeRecommendView()
  }

  return (
    <div data-testid="blog-rec-view" className="flex-1 overflow-y-auto px-6 py-4">
      <div className="flex items-center gap-2">
        <button type="button" data-testid="blog-rec-prev" disabled={!hasPrev}
          onClick={() => hasPrev && openRecommendView(history[idx + 1].batch)}
          className={`${muted} hover:text-ember disabled:opacity-20 disabled:cursor-not-allowed`} style={{ fontSize: listStyles.meta }}>
          ‹ 上一批
        </button>
        <span className={muted} style={{ fontSize: listStyles.meta }}>
          第 {b.batch} 批 · {new Date(b.generatedAt).toLocaleString('zh-CN')}{b.searchUsed ? '' : ' · 未使用网络搜索'}
        </span>
        <button type="button" data-testid="blog-rec-next" disabled={!hasNext}
          onClick={() => hasNext && openRecommendView(history[idx - 1].batch)}
          className={`${muted} hover:text-ember disabled:opacity-20 disabled:cursor-not-allowed`} style={{ fontSize: listStyles.meta }}>
          下一批 ›
        </button>
        <div className="flex-1" />
        <button type="button" data-testid="blog-rec-delete-batch" onClick={onDelete}
          className={`${muted} hover:text-red-400`} style={{ fontSize: listStyles.meta }} title="删除本批推荐历史">
          🗑 删除本批
        </button>
        <button type="button" data-testid="blog-rec-close" onClick={closeRecommendView}
          className={`${muted} hover:text-ember`} style={{ fontSize: listStyles.meta }} title="关闭推荐页">
          ✕
        </button>
      </div>

      {b.focus ? (
        <>
          <p className={`mt-4 font-serif ${isAcademic ? 'text-ember' : 'text-[#6b5d52]'}`} style={{ fontSize: listStyles.title }}>◆ {b.focus}</p>
          <div className="mt-4">
            <p className={muted} style={{ fontSize: listStyles.meta }}>画像分析</p>
            <p className={`mt-1 leading-relaxed ${text}`} style={{ fontSize: listStyles.meta }}>{b.profile}</p>
          </div>
          <div className="mt-3">
            <p className={muted} style={{ fontSize: listStyles.meta }}>知识缺口</p>
            <p className={`mt-1 ${text}`} style={{ fontSize: listStyles.meta }}>{b.gaps.join('；')}</p>
          </div>
          <div className="mt-4 space-y-2">
            {(b.picks ?? []).map((p) => {
              const inCol = collection.entries.some(e => e.sourceUrl === p.sourceUrl)
              const isRead = collection.read.some(r => r.sourceUrl === p.sourceUrl)
              return (
                <div key={p.sourceUrl} className={`rounded border p-3 ${isAcademic ? 'bg-ink/60 border-parchment/10' : 'bg-white border-[#1a1a1a]/10'}`}>
                  <div className="flex items-center gap-2">
                    <button type="button" data-testid={`blog-rec-pick-${p.sourceUrl}`} onClick={() => void openPick(p)}
                      className={`flex-1 min-w-0 text-left font-serif ${isAcademic ? 'text-parchment hover:text-ember' : 'text-[#1a1a1a] hover:text-ember'}`}
                      style={{ fontSize: listStyles.title }}>
                      {p.title}
                    </button>
                    <button type="button" data-testid={`blog-rec-fav-${p.sourceUrl}`} title={inCol ? '已收藏' : '收藏'}
                      onClick={() => void toggleBlogCollection({ sourceUrl: p.sourceUrl, filePath: p.filePath, title: p.title })}
                      className={inCol ? 'text-ember' : `${muted} hover:text-ember`} style={{ fontSize: listStyles.title }}>
                      {inCol ? '★' : '☆'}
                    </button>
                    <button type="button" data-testid={`blog-rec-read-${p.sourceUrl}`} title={isRead ? '已读（点击取消）' : '标为已读'}
                      onClick={() => void toggleBlogRead({ sourceUrl: p.sourceUrl, filePath: p.filePath, title: p.title })}
                      className={isRead ? 'text-ember' : `${muted} hover:text-ember`} style={{ fontSize: listStyles.title }}>
                      {isRead ? '✓' : '○'}
                    </button>
                  </div>
                  {p.guide && <p className={`mt-1.5 leading-relaxed ${isAcademic ? 'text-parchment/70' : 'text-[#6b5d52]'}`} style={{ fontSize: listStyles.meta }}>{p.guide}</p>}
                  <p className={`mt-1 ${muted}`} style={{ fontSize: listStyles.meta }}>
                    {p.reason}{p.gap ? `（挂上：${p.gap}）` : ''}
                  </p>
                </div>
              )
            })}
          </div>
          <p className={`mt-4 ${muted}`} style={{ fontSize: listStyles.meta }}>检索方向：{b.queries.join('、')}</p>
        </>
      ) : (
        <>
          <p className={`mt-4 leading-relaxed ${text}`} style={{ fontSize: listStyles.meta }}>{b.profile}</p>
          <p className={`mt-2 ${muted}`} style={{ fontSize: listStyles.meta }}>认知缺口：{b.gaps.join('、')}</p>
          <p className={`mt-1 ${muted}`} style={{ fontSize: listStyles.meta }}>检索方向：{b.queries.join('、')}</p>
        </>
      )}
    </div>
  )
}
```

`AnthropicBlogPanel.tsx` 右栏（约 392-401 行）：
① 顶部补 `const recommendViewBatch = useStore((s) => s.recommendViewBatch)` 与 `import { BlogRecommendView } from './BlogRecommendView'`。
② 渲染优先级插入：

```tsx
        {constitutionReportOpen ? (
          <ConstitutionReportView theme={theme} />
        ) : recommendViewBatch != null ? (
          <BlogRecommendView theme={theme} />
        ) : readerFilePath ? (
```

- [ ] **Step 4: 跑测试确认通过**

Run: `npx vitest run tests/blog-rec-lookup.test.ts tests/blog-recommend-view.test.tsx tests/anthropic-blog-panel.test.tsx`
Expected: PASS。

- [ ] **Step 5: Commit**

```bash
git add src/components/anthropic/BlogRecommendView.tsx src/lib/blog-rec-lookup.ts src/components/anthropic/AnthropicBlogPanel.tsx tests/blog-recommend-view.test.tsx tests/blog-rec-lookup.test.ts
git commit -m "feat(blog): 右栏推荐页视图——批次切换/删除/画像+缺口+逐篇导读理由"
```

---

### Task 6: 左栏清理 + 文章行批号徽标 + companion 去自动已读

**Files:**
- Modify: `src/components/anthropic/BlogCollectionSection.tsx`（移除历史块 102-149、改名「重新推荐」、💡区加导读行、空态文案）
- Modify: `src/components/anthropic/AnthropicArticleRow.tsx`（删 companion 分支 markBlogRead 77-78 行；批号徽标）
- Test: `tests/blog-collection-section.test.tsx`、`tests/anthropic-blog-panel.test.tsx`

**Interfaces:**
- Consumes: Task 5 的 `findBatchForUrl` 与 `openRecommendView`。
- Produces: 文章行 testid `blog-rec-badge`；收藏夹区不再出现 `blog-recommend-history`/`blog-history-pick-*`。

- [ ] **Step 1: 改测试**

`tests/blog-collection-section.test.tsx`：
① 删除三个历史相关用例（「新批次历史卡片显示核心方向与逐篇挂钩」「点击逐篇条目打开阅读器」「旧批次降级渲染」——推荐页已覆盖，见 Task 5 测试）。
② 保留的用例中：字号用例的测量元素从 `blog-history-pick-*` 改为 `blog-read-toggle`（meta 档：base=11px，3xl=14px）；「旧批次」用例的 read 为空断言可并入已读夹用例。
③ 追加：

```tsx
  it('推荐按钮文案为「重新推荐」，且不再有往期历史入口', () => {
    render(<BlogCollectionSection theme="academic" />)
    expect(screen.getByTestId('blog-recommend-button')).toHaveTextContent('重新推荐')
    expect(screen.queryByTestId('blog-recommend-history')).not.toBeInTheDocument()
  })
```

`tests/anthropic-blog-panel.test.tsx` 追加：

```tsx
  it('来自推荐批次的文章行显示批号徽标，点击打开推荐页对应批次', async () => {
    const openRecommendView = vi.fn()
    useStore.setState({
      anthropicBlogCache: {
        lastFetchedAt: null,
        articles: [{ ...article('old-1', 'Old Article'), isSaved: true, filePath: 'lib/old-1.md' }],
        loading: false, error: null,
      },
      openRecommendView,
      blogCollection: {
        version: 1, entries: [], dismissed: [], read: [],
        history: [{
          batch: 3, generatedAt: 'g', profile: 'p', gaps: [], queries: [], searchUsed: false,
          picks: [{ sourceUrl: 'old-1', title: 'Old Article', filePath: 'lib/old-1.md', reason: 'r', gap: 'g' }],
        }],
      },
    } as any)
    render(<AnthropicBlogPanel theme="academic" />)
    const badge = screen.getByTestId('blog-rec-badge')
    expect(badge).toHaveTextContent('◆3')
    fireEvent.click(badge)
    expect(openRecommendView).toHaveBeenCalledWith(3)
  })

  it('不在任何批次 picks 里的文章行不显示批号徽标', () => {
    render(<AnthropicBlogPanel theme="academic" />)
    expect(screen.queryByTestId('blog-rec-badge')).not.toBeInTheDocument()
  })
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run tests/blog-collection-section.test.tsx tests/anthropic-blog-panel.test.tsx`
Expected: FAIL —— `blog-rec-badge` 不存在、旧文案断言失败。

- [ ] **Step 3: 实现**

`AnthropicArticleRow.tsx`：
① 删除 companion 分支里的 `markBlogRead` 调用行（含其注释行）。
② Props 不变；组件内补：

```tsx
  const openRecommendView = useStore((s) => s.openRecommendView)
  const recBatch = useStore((s) => findBatchForUrl(s.blogCollection.history, article.url))
```

（import `findBatchForUrl` from `@/lib/blog-rec-lookup`）
③ 栏目色签 span（section tag）后插入徽标：

```tsx
          {recBatch != null && (
            <span
              data-testid="blog-rec-badge"
              role="button"
              title={`来自第 ${recBatch} 批推荐，点击查看推荐页`}
              onClick={(e) => { e.stopPropagation(); e.preventDefault(); openRecommendView(recBatch) }}
              className="inline-block mt-1.5 ml-1.5 px-2 py-0.5 rounded-full border border-ember/40 text-ember cursor-pointer"
              style={{ fontSize: 'var(--briefing-list-meta-size)' }}
            >
              ◆{recBatch}
            </span>
          )}
```

`BlogCollectionSection.tsx`：
① 删除「往期推荐历史」整块（`showHistory` state、`history` 变量、102-149 行两段渲染）；确认 import 清理（若无其他用处）。
② 按钮文案 `'为我推荐'` → `'重新推荐'`；空态文案 `点「为我推荐」生成第一批` → `点「重新推荐」生成第一批`。
③ CollectionRow 💡 展开区加导读行（`entry.guide` 存在时，置于「为什么推荐」之上）：

```tsx
          {entry.guide && <p><span className="text-ember">导读：</span>{entry.guide}</p>}
          <p><span className="text-ember">为什么推荐：</span>{entry.reason}</p>
```

- [ ] **Step 4: 跑测试确认通过**

Run: `npx vitest run tests/blog-collection-section.test.tsx tests/anthropic-blog-panel.test.tsx`
Expected: PASS。

- [ ] **Step 5: Commit**

```bash
git add src/components/anthropic/BlogCollectionSection.tsx src/components/anthropic/AnthropicArticleRow.tsx tests/blog-collection-section.test.tsx tests/anthropic-blog-panel.test.tsx
git commit -m "feat(blog): 左栏移除推荐历史入口+改名重新推荐，文章行加批号徽标，companion 去自动已读"
```

---

### Task 7: E2E 改写 + 定向验证收尾

**Files:**
- Modify: `e2e/specs/blog-collection.spec.ts`
- `e2e/source-map.json` 无需改动（同 spec 文件）

**Interfaces:**
- Consumes: 全部前序任务的 testid 与 mock（E2E mock 批次含 focus/picks/guide，文章真实写盘）。

- [ ] **Step 1: 改写 E2E**

`e2e/specs/blog-collection.spec.ts` 的第二个用例（历史卡片/自动已读那个）整体替换为：

```ts
  test('推荐完成右栏自动出推荐页（核心方向/导读），手动已读入夹，批次可删除', async ({ window }) => {
    const cover = new CoverPage(window)
    await cover.enterName('E2E 测试员')
    await cover.goToBriefing()
    await window.locator(SELECTORS.briefing.sourceAnthropicButton).click()

    // 触发推荐 mock → 右栏自动切到推荐页
    await window.locator('[data-testid="blog-recommend-button"]').click()
    await expect(window.locator('[data-testid="blog-rec-view"]')).toBeVisible({ timeout: 15000 })
    await expect(window.getByText('E2E 核心方向')).toBeVisible()
    await expect(window.getByText('E2E 导读摘要')).toBeVisible()
    await expect(window.getByText(/E2E 推荐理由/)).toBeVisible()

    // 推荐页卡片手动标已读 → 已读夹出现
    await window.locator('[data-testid^="blog-rec-read-"]').first().click()
    await expect(window.locator('[data-testid="blog-read-toggle"]')).toBeVisible({ timeout: 5000 })
    await expect(window.locator('[data-testid="blog-read-toggle"]')).toContainText('已读（1）')

    // 删除本批 → 推荐页回空态，已读夹不受影响
    await window.locator('[data-testid="blog-rec-delete-batch"]').click()
    await expect(window.locator('[data-testid="blog-rec-empty"]')).toBeVisible()
    await expect(window.locator('[data-testid="blog-read-toggle"]')).toContainText('已读（1）')
  })
```

第一个既有用例（收藏夹区渲染/推荐 mock 产出/理由展开/移除）需同步三处：
① 「为我推荐」文案断言若存在改「重新推荐」（该用例未断言文案则不动）；
② 推荐完成后右栏会切到推荐页盖住阅读区，但收藏夹断言在左栏不受影响——`blog-collection-open-*` 仍在左栏，无需改；
③ 推荐完成后若需操作收藏夹条目，推荐页遮挡的是右栏而非左栏，流程不变。

- [ ] **Step 2: 跑定向 E2E**

Run: `node scripts/e2e-changed.js --run --no-retries`
Expected: `blog-collection.spec.ts` 两个用例全过。注意：另一会话未提交改动可能把无关 spec（如 writing-assistant-resize）拉进定向跑并失败——与本计划无关，记录即可，不触碰。

- [ ] **Step 3: 受影响单测回归**

Run: `npx vitest run tests/blog-collection.test.ts tests/blog-recommend.test.ts tests/blog-rec-lookup.test.ts tests/blog-recommend-view.test.tsx tests/blog-collection-section.test.tsx tests/anthropic-blog-panel.test.tsx`
Expected: 全过。

- [ ] **Step 4: Commit**

```bash
git add e2e/specs/blog-collection.spec.ts
git commit -m "test(blog): E2E 改写——右栏推荐页自动切入/导读展示/手动已读/批次删除"
```
