# 前沿精选集 + 正文加长 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 夜航简报-前沿新增永久置顶「精选集」（按导读块收藏正文快照+导读+旁注问答，后续问答自动追加），并把前沿摘要 prompt 显著加长。

**Architecture:** 副本式存储：`<学习库>/夜航简报/精选集.json` 由主进程 4 个薄 IPC 读写；归属算法（selection 向前填充）在渲染进程纯函数中；收藏/追加逻辑在 store slice，追加只挂在 `finishAssistantStreaming`（完整回答后）。UI 三处：日期列置顶入口、正文铭牌收藏按钮、CollectionView 阅读页。

**Tech Stack:** Electron IPC + React 18 + Zustand + Vitest + Playwright。

**Spec:** `docs/superpowers/specs/2026-08-04-frontier-collection-design.md`

## Global Constraints

- 验证只跑受影响测试，禁止全量（`.claude/rules/general.md` §9）：单测用 `npx vitest run tests/<file>`，E2E 单独跑受影响的 spec。
- 新增 IPC 必须四层同步（types → handler → preload → facade → store），返回结构化 `{ ok: true } | { ok: false, code }`（ipc-state §1）。
- 组件文件只导出组件；helper/常量放 `src/lib/`（ui-styling §10）。
- 新 UI 入口必须有 `data-testid` 且出现在 e2e 断言中（feature-development §12）。
- 暗色主题沿用琥珀 `#d97757` 点睛，双版式（academic/newspaper）都要正确（ui-styling §11）。
- commit 信息用中文 conventional 格式（参照 `git log` 现状，如 `feat(briefing): ...`）。

---

### Task 1: 类型定义 + 主进程精选集存取逻辑

**Files:**
- Modify: `src/types/index.ts`（在 `ArticleAnnotation` 类型定义后插入新类型；在 `IpcApi` 接口的 `annotationsWrite` 声明后插入 4 个方法签名）
- Create: `electron/lib/collection-store.ts`
- Test: `tests/collection-store.test.ts`

**Interfaces:**
- Produces（后续所有任务依赖）:
  - `BriefingCollectionQA = { role: 'user' | 'assistant'; content: string; selection?: string }`
  - `BriefingCollectionEntry = { id: string; briefingFilePath: string; briefingDate: string; chunkHeading: string; chunkIndex: number; chunkBody: string; guide: { summary: string; terms: ArticleAssistantTerm[] }; qa: BriefingCollectionQA[]; qaMessageCount: number; collectedAt: string; updatedAt: string }`
  - `BriefingCollection = { version: 1; entries: BriefingCollectionEntry[] }`
  - `collectionPathFor(libraryPath: string): string`
  - `readCollection(libraryPath: string): BriefingCollection`
  - `addCollectionEntry(libraryPath: string, entry: BriefingCollectionEntry): 'ok' | 'duplicate'`
  - `removeCollectionEntry(libraryPath: string, id: string): void`
  - `appendCollectionQA(libraryPath: string, id: string, qa: BriefingCollectionQA[], qaMessageCount: number): void`
- Consumes: `safeReadJson`/`safeWriteJson`（`electron/lib/safe-json.ts`，已存在）；`ArticleAssistantTerm`（`src/types/index.ts:86-90` 区域已存在）。

- [ ] **Step 1: 写失败测试**

创建 `tests/collection-store.test.ts`：

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {
  collectionPathFor,
  readCollection,
  addCollectionEntry,
  removeCollectionEntry,
  appendCollectionQA,
} from '@electron/lib/collection-store'
import type { BriefingCollectionEntry } from '@shared/index'

let dir: string
beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'collection-')) })
afterEach(() => { fs.rmSync(dir, { recursive: true, force: true }) })

function makeEntry(overrides: Partial<BriefingCollectionEntry> = {}): BriefingCollectionEntry {
  return {
    id: 'c-1',
    briefingFilePath: path.join(dir, '夜航简报', '夜航简报-2026-08-04.md'),
    briefingDate: '2026-08-04',
    chunkHeading: 'AI Safety',
    chunkIndex: 0,
    chunkBody: '正文快照',
    guide: { summary: '导读摘要', terms: [] },
    qa: [],
    qaMessageCount: 2,
    collectedAt: '2026-08-04T10:00:00.000Z',
    updatedAt: '2026-08-04T10:00:00.000Z',
    ...overrides,
  }
}

describe('collection-store', () => {
  it('文件缺失时返回空集合', () => {
    expect(readCollection(dir)).toEqual({ version: 1, entries: [] })
  })

  it('addEntry 新条目插入到最前', () => {
    addCollectionEntry(dir, makeEntry({ id: 'c-old' }))
    addCollectionEntry(dir, makeEntry({ id: 'c-new' }))
    const col = readCollection(dir)
    expect(col.entries.map((e) => e.id)).toEqual(['c-new', 'c-old'])
  })

  it('addEntry 同 (filePath, chunkIndex) 去重返回 duplicate', () => {
    addCollectionEntry(dir, makeEntry())
    expect(addCollectionEntry(dir, makeEntry({ id: 'c-2' }))).toBe('duplicate')
    expect(readCollection(dir).entries).toHaveLength(1)
  })

  it('removeEntry 按 id 删除', () => {
    addCollectionEntry(dir, makeEntry({ id: 'c-1' }))
    addCollectionEntry(dir, makeEntry({ id: 'c-2', chunkIndex: 1 }))
    removeCollectionEntry(dir, 'c-1')
    expect(readCollection(dir).entries.map((e) => e.id)).toEqual(['c-2'])
  })

  it('appendQA 追加问答并推进游标', () => {
    addCollectionEntry(dir, makeEntry({ id: 'c-1', qaMessageCount: 2 }))
    appendCollectionQA(dir, 'c-1', [{ role: 'user', content: '追问' }, { role: 'assistant', content: '回答' }], 4)
    const entry = readCollection(dir).entries[0]
    expect(entry.qa).toHaveLength(2)
    expect(entry.qaMessageCount).toBe(4)
    expect(Date.parse(entry.updatedAt)).toBeGreaterThan(Date.parse('2026-08-04T10:00:00.000Z'))
  })

  it('appendQA 游标不前进时幂等跳过', () => {
    addCollectionEntry(dir, makeEntry({ id: 'c-1', qaMessageCount: 4 }))
    appendCollectionQA(dir, 'c-1', [{ role: 'user', content: 'x' }], 4)
    expect(readCollection(dir).entries[0].qa).toHaveLength(0)
  })

  it('appendQA 对不存在的 id 静默跳过', () => {
    addCollectionEntry(dir, makeEntry())
    expect(() => appendCollectionQA(dir, 'nope', [{ role: 'user', content: 'x' }], 9)).not.toThrow()
  })

  it('损坏 JSON 走 .bak 备份并返回空集合', () => {
    const p = collectionPathFor(dir)
    fs.mkdirSync(path.dirname(p), { recursive: true })
    fs.writeFileSync(p, '{broken', 'utf8')
    expect(readCollection(dir)).toEqual({ version: 1, entries: [] })
  })

  it('version 不匹配视为空集合', () => {
    const p = collectionPathFor(dir)
    fs.mkdirSync(path.dirname(p), { recursive: true })
    fs.writeFileSync(p, JSON.stringify({ version: 999, entries: [makeEntry()] }), 'utf8')
    expect(readCollection(dir).entries).toEqual([])
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run tests/collection-store.test.ts`
Expected: FAIL（`@electron/lib/collection-store` 不存在）

- [ ] **Step 3: 写类型与实现**

`src/types/index.ts`：在 `ArticleAnnotation` 类型后插入：

```ts
export type BriefingCollectionQA = {
  role: 'user' | 'assistant'
  content: string
  selection?: string
}

export type BriefingCollectionEntry = {
  id: string
  briefingFilePath: string
  briefingDate: string
  chunkHeading: string
  /** guide.chunks 下标（preamble 不计） */
  chunkIndex: number
  chunkBody: string
  guide: { summary: string; terms: ArticleAssistantTerm[] }
  qa: BriefingCollectionQA[]
  /** 已处理的源旁注会话消息数（增量追加游标） */
  qaMessageCount: number
  collectedAt: string
  updatedAt: string
}

export type BriefingCollection = {
  version: 1
  entries: BriefingCollectionEntry[]
}
```

在 `IpcApi` 接口的 `annotationsWrite` 声明后插入：

```ts
  collectionRead: () => Promise<BriefingCollection>
  collectionAddEntry: (entry: BriefingCollectionEntry) => Promise<{ ok: true } | { ok: false; code: 'DUPLICATE' | 'WRITE_ERROR' }>
  collectionRemoveEntry: (id: string) => Promise<void>
  collectionAppendQA: (args: { id: string; qa: BriefingCollectionQA[]; qaMessageCount: number }) => Promise<void>
```

创建 `electron/lib/collection-store.ts`：

```ts
import path from 'node:path'
import { safeReadJson, safeWriteJson } from './safe-json'
import type { BriefingCollection, BriefingCollectionEntry, BriefingCollectionQA } from '@shared/index'

const COLLECTION_VERSION = 1

export function collectionPathFor(libraryPath: string): string {
  return path.join(libraryPath, '夜航简报', '精选集.json')
}

export function readCollection(libraryPath: string): BriefingCollection {
  const data = safeReadJson<unknown>(collectionPathFor(libraryPath), { fallback: null })
  if (
    !data ||
    typeof data !== 'object' ||
    (data as { version?: unknown }).version !== COLLECTION_VERSION ||
    !Array.isArray((data as { entries?: unknown }).entries)
  ) {
    return { version: COLLECTION_VERSION, entries: [] }
  }
  return data as BriefingCollection
}

export function addCollectionEntry(libraryPath: string, entry: BriefingCollectionEntry): 'ok' | 'duplicate' {
  const col = readCollection(libraryPath)
  const dup = col.entries.some(
    (e) => e.briefingFilePath === entry.briefingFilePath && e.chunkIndex === entry.chunkIndex
  )
  if (dup) return 'duplicate'
  col.entries.unshift(entry)
  safeWriteJson(collectionPathFor(libraryPath), col)
  return 'ok'
}

export function removeCollectionEntry(libraryPath: string, id: string): void {
  const col = readCollection(libraryPath)
  col.entries = col.entries.filter((e) => e.id !== id)
  safeWriteJson(collectionPathFor(libraryPath), col)
}

export function appendCollectionQA(
  libraryPath: string,
  id: string,
  qa: BriefingCollectionQA[],
  qaMessageCount: number
): void {
  const col = readCollection(libraryPath)
  const entry = col.entries.find((e) => e.id === id)
  if (!entry) return
  if (qaMessageCount <= entry.qaMessageCount) return // 幂等：游标不前进则不追加
  entry.qa.push(...qa)
  entry.qaMessageCount = qaMessageCount
  entry.updatedAt = new Date().toISOString()
  safeWriteJson(collectionPathFor(libraryPath), col)
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `npx vitest run tests/collection-store.test.ts`
Expected: 9 passed

- [ ] **Step 5: Commit**

```bash
git add src/types/index.ts electron/lib/collection-store.ts tests/collection-store.test.ts
git commit -m "feat(briefing): 精选集数据类型与主进程存取逻辑"
```

---

### Task 2: IPC 四层同步（handler / preload / facade / register）

**Files:**
- Create: `electron/ipc/collection.ts`
- Modify: `electron/ipc/index.ts`（注册）
- Modify: `electron/preload.ts`（在 `annotationsWrite` 后插入）
- Modify: `src/lib/ipc.ts`（facade）
- Test: `tests/collection-ipc-wiring.test.ts`（启动探测式断言 preload 形状，见下）

**Interfaces:**
- Consumes: Task 1 的类型与 `collection-store` 函数；`IpcApi` 签名。
- Produces: 渲染进程可调用的 `ipc.collectionRead / collectionAddEntry / collectionRemoveEntry / collectionAppendQA`。

- [ ] **Step 1: 写失败测试（facade 形状断言）**

项目单测不启动 Electron，无法直接测 ipcMain handler；用「facade 键存在性」探测替代（ipc-state §1 要求至少一个测试断言验证暴露）。创建 `tests/collection-ipc-wiring.test.ts`：

```ts
import { describe, it, expect, vi } from 'vitest'

const mockApi = {
  collectionRead: vi.fn(),
  collectionAddEntry: vi.fn(),
  collectionRemoveEntry: vi.fn(),
  collectionAppendQA: vi.fn(),
}
;(globalThis as { window?: unknown }).window = { api: mockApi }

import { ipc } from '@/lib/ipc'

describe('collection IPC wiring', () => {
  it('facade 暴露 4 个精选集方法', () => {
    expect(ipc.collectionRead).toBe(mockApi.collectionRead)
    expect(ipc.collectionAddEntry).toBe(mockApi.collectionAddEntry)
    expect(ipc.collectionRemoveEntry).toBe(mockApi.collectionRemoveEntry)
    expect(ipc.collectionAppendQA).toBe(mockApi.collectionAppendQA)
  })
})
```

（真实 handler 行为由 Task 1 的 store 单测 + Task 8 的 E2E 覆盖。）

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run tests/collection-ipc-wiring.test.ts`
Expected: FAIL（facade 无 collectionRead getter，返回 undefined）

- [ ] **Step 3: 写实现**

创建 `electron/ipc/collection.ts`：

```ts
import { ipcMain } from 'electron'
import type { AppConfig } from '../env'
import {
  addCollectionEntry,
  appendCollectionQA,
  readCollection,
  removeCollectionEntry,
} from '../lib/collection-store'
import type { BriefingCollectionEntry, BriefingCollectionQA } from '@shared/index'

export function registerCollectionIpc(cfg: AppConfig) {
  ipcMain.handle('collection:read', async () => readCollection(cfg.libraryPath))

  ipcMain.handle('collection:addEntry', async (_, entry: BriefingCollectionEntry) => {
    try {
      const result = addCollectionEntry(cfg.libraryPath, entry)
      if (result === 'duplicate') return { ok: false as const, code: 'DUPLICATE' as const }
      return { ok: true as const }
    } catch {
      return { ok: false as const, code: 'WRITE_ERROR' as const }
    }
  })

  ipcMain.handle('collection:removeEntry', async (_, id: string) => {
    removeCollectionEntry(cfg.libraryPath, id)
  })

  ipcMain.handle(
    'collection:appendQA',
    async (_, args: { id: string; qa: BriefingCollectionQA[]; qaMessageCount: number }) => {
      appendCollectionQA(cfg.libraryPath, args.id, args.qa, args.qaMessageCount)
    }
  )
}
```

`electron/ipc/index.ts`：import 并在 `registerAllIpc` 中 `registerScoutIpc(cfg)` 后加一行：

```ts
import { registerCollectionIpc } from './collection'
// ...
  registerScoutIpc(cfg)
  registerCollectionIpc(cfg)
```

`electron/preload.ts`：在 `annotationsWrite` 行后插入：

```ts
  collectionRead: () => ipcRenderer.invoke('collection:read'),
  collectionAddEntry: (entry) => ipcRenderer.invoke('collection:addEntry', entry),
  collectionRemoveEntry: (id) => ipcRenderer.invoke('collection:removeEntry', id),
  collectionAppendQA: (args) => ipcRenderer.invoke('collection:appendQA', args),
```

`src/lib/ipc.ts`：在 `annotationsWrite` getter 后插入：

```ts
  get collectionRead() { return ensure().collectionRead },
  get collectionAddEntry() { return ensure().collectionAddEntry },
  get collectionRemoveEntry() { return ensure().collectionRemoveEntry },
  get collectionAppendQA() { return ensure().collectionAppendQA },
```

- [ ] **Step 4: 验证**

Run: `npx vitest run tests/collection-ipc-wiring.test.ts` → PASS
Run: `npx tsc --noEmit` → clean（验证四层类型同步）

- [ ] **Step 5: Commit**

```bash
git add electron/ipc/collection.ts electron/ipc/index.ts electron/preload.ts src/lib/ipc.ts tests/collection-ipc-wiring.test.ts
git commit -m "feat(briefing): 精选集 IPC 四层同步"
```

---

### Task 3: 归属算法（selection 向前填充）

**Files:**
- Create: `src/lib/collection-attribution.ts`
- Test: `tests/collection-attribution.test.ts`

**Interfaces:**
- Consumes: `splitArticleIntoChunks`（`src/lib/article-chunks.ts`）；`ArticleAssistantMessage` / `ArticleAssistantChunk`（`@shared/index`）。
- Produces:
  - `AttributedMessage = { index: number; message: ArticleAssistantMessage }`
  - `attributeMessages(messages: ArticleAssistantMessage[], articleContent: string, guideChunks: ArticleAssistantChunk[]): Map<number, AttributedMessage[]>` — key 为 guide chunk 下标。

- [ ] **Step 1: 写失败测试**

创建 `tests/collection-attribution.test.ts`：

```ts
import { describe, it, expect } from 'vitest'
import { attributeMessages } from '@/lib/collection-attribution'
import type { ArticleAssistantChunk, ArticleAssistantMessage } from '@shared/index'

const GUIDE: ArticleAssistantChunk[] = [
  { heading: 'AI Safety', summary: '', terms: [] },
  { heading: 'Training Data', summary: '', terms: [] },
]

const ARTICLE = [
  '前言段落，无标题。',
  '',
  '## AI Safety',
  '宪法式 AI 用书面原则约束模型行为。',
  '',
  '## Training Data',
  '训练数据的去重与过滤决定模型质量。',
].join('\n')

const user = (content: string, selection?: string): ArticleAssistantMessage =>
  ({ role: 'user', content, ...(selection ? { selection } : {}) })
const asst = (content: string): ArticleAssistantMessage => ({ role: 'assistant', content })

describe('attributeMessages', () => {
  it('带 selection 的消息及其后续问答归属对应块（向前填充）', () => {
    const msgs = [
      user('这是什么', '宪法式 AI'),   // 落在 chunk 0
      asst('回答一'),
      user('追问不带选段'),
      asst('回答二'),
    ]
    const map = attributeMessages(msgs, ARTICLE, GUIDE)
    expect(map.get(0)).toHaveLength(4)
    expect(map.get(1)).toBeUndefined()
  })

  it('新 selection 切换归属', () => {
    const msgs = [
      user('问 A', '宪法式 AI'),
      asst('答 A'),
      user('问 B', '去重与过滤'),       // 落在 chunk 1
      asst('答 B'),
    ]
    const map = attributeMessages(msgs, ARTICLE, GUIDE)
    expect(map.get(0)?.map((m) => m.index)).toEqual([0, 1])
    expect(map.get(1)?.map((m) => m.index)).toEqual([2, 3])
  })

  it('从未带 selection 的消息不归属任何块', () => {
    const map = attributeMessages([user('hi'), asst('hello')], ARTICLE, GUIDE)
    expect(map.size).toBe(0)
  })

  it('selection 匹配不到任何块时丢弃该段', () => {
    const msgs = [user('问', '不存在的内容'), asst('答')]
    expect(attributeMessages(msgs, ARTICLE, GUIDE).size).toBe(0)
  })

  it('selection 跨 markdown 格式时按去格式文本匹配', () => {
    const article = '## AI Safety\n这是 **宪法式** AI 的介绍。'
    const msgs = [user('问', '这是 宪法式 AI 的介绍')] // DOM 选段不含 **
    const map = attributeMessages(msgs, article, [GUIDE[0]])
    expect(map.get(0)).toHaveLength(1)
  })

  it('空消息流返回空 Map', () => {
    expect(attributeMessages([], ARTICLE, GUIDE).size).toBe(0)
  })

  it('guideChunks 为空时返回空 Map', () => {
    expect(attributeMessages([user('a', '宪法式 AI')], ARTICLE, []).size).toBe(0)
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run tests/collection-attribution.test.ts`
Expected: FAIL（模块不存在）

- [ ] **Step 3: 写实现**

创建 `src/lib/collection-attribution.ts`：

```ts
import { splitArticleIntoChunks } from './article-chunks'
import type { ArticleAssistantChunk, ArticleAssistantMessage } from '@shared/index'

export type AttributedMessage = { index: number; message: ArticleAssistantMessage }

/** DOM 选段是渲染后的纯文本，raw markdown 里的 **、` 等语法会阻碍 includes 匹配 */
function stripMarkdown(md: string): string {
  return md
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1') // [text](url) → text
    .replace(/[*_`#>]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * 归属规则（spec：向前填充）：
 * 带 selection 的 user 消息更新当前归属块；其后的消息沿用该归属，直到下一个匹配成功的 selection。
 * selection 匹配不到任何块 → 当前归属置空，该段消息全部丢弃。
 */
export function attributeMessages(
  messages: ArticleAssistantMessage[],
  articleContent: string,
  guideChunks: ArticleAssistantChunk[],
): Map<number, AttributedMessage[]> {
  const result = new Map<number, AttributedMessage[]>()
  if (guideChunks.length === 0 || messages.length === 0) return result

  // splitArticleIntoChunks 返回的带标题块与 guide.chunks 顺序一一对应（preamble 无标题被过滤）
  const headed = splitArticleIntoChunks(articleContent, guideChunks.map((c) => c.heading))
    .filter((c) => c.heading)
  const bodies = guideChunks.map((_, gi) => {
    const raw = headed[gi]?.body ?? ''
    return { raw, plain: stripMarkdown(raw) }
  })

  let current: number | null = null
  messages.forEach((message, index) => {
    if (message.role === 'user' && message.selection) {
      const sel = message.selection
      const plain = stripMarkdown(sel)
      const found = bodies.findIndex(
        (b) => b.raw.includes(sel) || (plain.length >= 2 && b.plain.includes(plain))
      )
      current = found === -1 ? null : found
    }
    if (current !== null) {
      const list = result.get(current) ?? []
      list.push({ index, message })
      result.set(current, list)
    }
  })
  return result
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `npx vitest run tests/collection-attribution.test.ts`
Expected: 7 passed

- [ ] **Step 5: Commit**

```bash
git add src/lib/collection-attribution.ts tests/collection-attribution.test.ts
git commit -m "feat(briefing): 旁注问答按 selection 向前填充归属导读块"
```

---

### Task 4: store slice（收藏 / 移除 / 追加同步 / 视图开关）

**Files:**
- Modify: `src/store/index.ts`（state 接口、初始值、actions；`finishAssistantStreaming` 挂追加；`generateBriefing` 开头关视图）
- Test: `tests/collection-slice.test.ts`

**Interfaces:**
- Consumes: Task 1 类型、Task 2 facade、Task 3 `attributeMessages`。
- Produces（Task 5/6 的组件依赖）:
  - state: `collection: { entries: BriefingCollectionEntry[]; loaded: boolean }`、`collectionViewOpen: boolean`
  - actions: `loadCollection(): Promise<void>`、`openCollectionView(): Promise<void>`、`closeCollectionView(): void`、`collectChunk(chunkIndex: number): Promise<void>`、`removeCollectionEntry(id: string): Promise<void>`、`syncCollectionQA(): Promise<void>`

- [ ] **Step 1: 写失败测试**

创建 `tests/collection-slice.test.ts`（mock 模式照抄 `tests/scout-store.test.ts` 的 Proxy 法）：

```ts
import { describe, it, expect, beforeEach, vi } from 'vitest'

const mockIpc = {
  collectionRead: vi.fn(),
  collectionAddEntry: vi.fn(),
  collectionRemoveEntry: vi.fn(),
  collectionAppendQA: vi.fn(),
}
vi.mock('@/lib/ipc', () => ({ ipc: new Proxy({}, { get: (_, k) => mockIpc[k as keyof typeof mockIpc] ?? (() => Promise.resolve()) }) }))

import { useStore } from '@/store'
import type { BriefingCollectionEntry } from '@shared/index'

const ARTICLE = '## AI Safety\n宪法式 AI 用书面原则约束模型。\n\n## Training Data\n训练数据的去重与过滤。'
const GUIDE = {
  background: 'bg',
  chunks: [
    { heading: 'AI Safety', summary: 's0', terms: [] },
    { heading: 'Training Data', summary: 's1', terms: [] },
  ],
}
const FILE = '/lib/夜航简报/夜航简报-2026-08-04.md'

function seedAssistantSession(messages: Array<{ role: 'user' | 'assistant'; content: string; selection?: string }>) {
  useStore.setState({
    assistantSession: {
      contextId: FILE,
      contextType: 'briefing',
      articleContent: ARTICLE,
      guide: GUIDE,
      guideLoading: false,
      guideError: null,
      messages,
      streaming: false,
      abortId: '',
      searchLoading: false,
      searchError: null,
      chatError: null,
      retryContext: null,
      isOpen: true,
      activeChunkIndex: null,
    } as never,
  })
}

function entryOf(overrides: Partial<BriefingCollectionEntry> = {}): BriefingCollectionEntry {
  return {
    id: 'c-1', briefingFilePath: FILE, briefingDate: '2026-08-04',
    chunkHeading: 'AI Safety', chunkIndex: 0, chunkBody: '宪法式 AI 用书面原则约束模型。',
    guide: { summary: 's0', terms: [] }, qa: [], qaMessageCount: 2,
    collectedAt: '2026-08-04T10:00:00.000Z', updatedAt: '2026-08-04T10:00:00.000Z',
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  useStore.setState({ collection: { entries: [], loaded: false }, collectionViewOpen: false, assistantSession: null })
})

describe('collection slice', () => {
  it('openCollectionView 置开视图并加载条目', async () => {
    mockIpc.collectionRead.mockResolvedValue({ version: 1, entries: [entryOf()] })
    await useStore.getState().openCollectionView()
    expect(useStore.getState().collectionViewOpen).toBe(true)
    expect(useStore.getState().collection.entries).toHaveLength(1)
  })

  it('collectChunk 快照正文+导读+归属问答并写入', async () => {
    seedAssistantSession([
      { role: 'user', content: '这是什么', selection: '宪法式 AI' },
      { role: 'assistant', content: '回答一' },
    ])
    mockIpc.collectionAddEntry.mockResolvedValue({ ok: true })
    await useStore.getState().collectChunk(0)
    const arg = mockIpc.collectionAddEntry.mock.calls[0][0] as BriefingCollectionEntry
    expect(arg.briefingFilePath).toBe(FILE)
    expect(arg.briefingDate).toBe('2026-08-04')
    expect(arg.chunkBody).toContain('宪法式 AI')
    expect(arg.guide.summary).toBe('s0')
    expect(arg.qa).toHaveLength(2)
    expect(arg.qaMessageCount).toBe(2)
    expect(useStore.getState().collection.entries[0].id).toBe(arg.id)
  })

  it('collectChunk 非 briefing 上下文直接返回', async () => {
    seedAssistantSession([])
    useStore.setState({ assistantSession: { ...useStore.getState().assistantSession!, contextType: 'web-article' } })
    await useStore.getState().collectChunk(0)
    expect(mockIpc.collectionAddEntry).not.toHaveBeenCalled()
  })

  it('collectChunk 重复收藏（DUPLICATE）不写入 store', async () => {
    seedAssistantSession([])
    mockIpc.collectionAddEntry.mockResolvedValue({ ok: false, code: 'DUPLICATE' })
    await useStore.getState().collectChunk(0)
    expect(useStore.getState().collection.entries).toHaveLength(0)
  })

  it('removeCollectionEntry 移除条目', async () => {
    useStore.setState({ collection: { entries: [entryOf()], loaded: true } })
    await useStore.getState().removeCollectionEntry('c-1')
    expect(mockIpc.collectionRemoveEntry).toHaveBeenCalledWith('c-1')
    expect(useStore.getState().collection.entries).toHaveLength(0)
  })

  it('syncCollectionQA 只追加游标后的归属消息并推进游标', async () => {
    useStore.setState({ collection: { entries: [entryOf({ qaMessageCount: 2 })], loaded: true } })
    seedAssistantSession([
      { role: 'user', content: '这是什么', selection: '宪法式 AI' },  // index 0（已同步）
      { role: 'assistant', content: '回答一' },                       // index 1（已同步）
      { role: 'user', content: '追问不带选段' },                      // index 2 → 向前填充归 chunk 0
      { role: 'assistant', content: '回答二' },                       // index 3
    ])
    await useStore.getState().syncCollectionQA()
    expect(mockIpc.collectionAppendQA).toHaveBeenCalledWith({
      id: 'c-1',
      qa: [
        { role: 'user', content: '追问不带选段' },
        { role: 'assistant', content: '回答二' },
      ],
      qaMessageCount: 4,
    })
  })

  it('syncCollectionQA 无新增消息时不调用 IPC', async () => {
    useStore.setState({ collection: { entries: [entryOf({ qaMessageCount: 2 })], loaded: true } })
    seedAssistantSession([
      { role: 'user', content: 'a', selection: '宪法式 AI' },
      { role: 'assistant', content: 'b' },
    ])
    await useStore.getState().syncCollectionQA()
    expect(mockIpc.collectionAppendQA).not.toHaveBeenCalled()
  })

  it('finishAssistantStreaming 触发追加同步', async () => {
    useStore.setState({ collection: { entries: [entryOf({ qaMessageCount: 0 })], loaded: true } })
    seedAssistantSession([
      { role: 'user', content: '这是什么', selection: '宪法式 AI' },
      { role: 'assistant', content: '完整回答' },
    ])
    useStore.setState({ assistantSession: { ...useStore.getState().assistantSession!, streaming: true } as never })
    useStore.getState().finishAssistantStreaming()
    await vi.waitFor(() => expect(mockIpc.collectionAppendQA).toHaveBeenCalled())
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run tests/collection-slice.test.ts`
Expected: FAIL（state/action 不存在）

- [ ] **Step 3: 写实现**

`src/store/index.ts`：

① 顶部 import 区追加：

```ts
import { attributeMessages } from '@/lib/collection-attribution'
import { splitArticleIntoChunks } from '@/lib/article-chunks'
import type { BriefingCollectionEntry } from '@shared/index'
```

② state 接口（在 `assistantSession: AssistantSession | null` 声明附近）追加：

```ts
  // 精选集（仅前沿 digest）
  collection: { entries: BriefingCollectionEntry[]; loaded: boolean }
  collectionViewOpen: boolean
  loadCollection: () => Promise<void>
  openCollectionView: () => Promise<void>
  closeCollectionView: () => void
  collectChunk: (chunkIndex: number) => Promise<void>
  removeCollectionEntry: (id: string) => Promise<void>
  syncCollectionQA: () => Promise<void>
```

③ 初始值（在 `assistantSession: null,` 附近）追加：

```ts
  collection: { entries: [], loaded: false },
  collectionViewOpen: false,
```

④ actions（放在 `saveAssistantSession` 之后）：

```ts
  loadCollection: async () => {
    const col = await ipc.collectionRead()
    set({ collection: { entries: col.entries, loaded: true } })
  },

  openCollectionView: async () => {
    set({ collectionViewOpen: true })
    await get().loadCollection()
  },

  closeCollectionView: () => set({ collectionViewOpen: false }),

  collectChunk: async (chunkIndex) => {
    const s = get().assistantSession
    if (!s || s.contextType !== 'briefing' || !s.guide) return
    const guideChunk = s.guide.chunks[chunkIndex]
    if (!guideChunk) return
    const headed = splitArticleIntoChunks(s.articleContent, s.guide.chunks.map((c) => c.heading))
      .filter((c) => c.heading)
    const articleChunk = headed[chunkIndex]
    if (!articleChunk) return

    const attributed = attributeMessages(s.messages, s.articleContent, s.guide.chunks)
    const qa = (attributed.get(chunkIndex) ?? []).map(({ message }) => ({
      role: message.role,
      content: message.content,
      ...(message.selection ? { selection: message.selection } : {}),
    }))

    const now = new Date().toISOString()
    const dateMatch = s.contextId.match(/夜航简报-(\d{4}-\d{2}-\d{2})\.md$/)
    const entry: BriefingCollectionEntry = {
      id: `c-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      briefingFilePath: s.contextId,
      briefingDate: dateMatch?.[1] ?? '',
      chunkHeading: guideChunk.heading,
      chunkIndex,
      chunkBody: articleChunk.body,
      guide: { summary: guideChunk.summary, terms: guideChunk.terms },
      qa,
      qaMessageCount: s.messages.length,
      collectedAt: now,
      updatedAt: now,
    }
    const res = await ipc.collectionAddEntry(entry)
    if (!res.ok) return // DUPLICATE：按钮本已禁用；WRITE_ERROR：保持未收藏态可重试
    set({ collection: { entries: [entry, ...get().collection.entries], loaded: true } })
  },

  removeCollectionEntry: async (id) => {
    await ipc.collectionRemoveEntry(id)
    set({ collection: { entries: get().collection.entries.filter((e) => e.id !== id), loaded: true } })
  },

  syncCollectionQA: async () => {
    const s = get().assistantSession
    if (!s || s.contextType !== 'briefing' || !s.guide) return
    if (!get().collection.loaded) await get().loadCollection()
    const mine = get().collection.entries.filter(
      (e) => e.briefingFilePath === s.contextId && e.qaMessageCount < s.messages.length
    )
    if (mine.length === 0) return
    const attributed = attributeMessages(s.messages, s.articleContent, s.guide.chunks)
    for (const entry of mine) {
      const tail = (attributed.get(entry.chunkIndex) ?? [])
        .filter(({ index }) => index >= entry.qaMessageCount)
        .map(({ message }) => ({
          role: message.role,
          content: message.content,
          ...(message.selection ? { selection: message.selection } : {}),
        }))
      // 即使 tail 为空也推进游标（新消息不归属该块），避免下次重扫
      await ipc.collectionAppendQA({ id: entry.id, qa: tail, qaMessageCount: s.messages.length })
    }
    await get().loadCollection()
  },
```

⑤ `finishAssistantStreaming`（当前在 `src/store/index.ts:1888` 附近）改为：

```ts
  finishAssistantStreaming: () => {
    const s = get().assistantSession
    if (!s) return
    set({ assistantSession: { ...s, streaming: false, searchLoading: false } })
    get().saveAssistantSession()
    void get().syncCollectionQA()
  },
```

注意：**不要**在 `abortAssistantStream` / `persistAssistantState` 里挂 `syncCollectionQA`（半截回答不立即进精选集；若消息留在会话中，下次正常完成时由游标补算）。

⑥ `generateBriefing`  action 开头（`src/store/index.ts:721` 附近，第一次 `set({ briefingViewingDate...` 之前）加：

```ts
      set({ collectionViewOpen: false })
```

（点「今日」或任何日期都回到简报视图。）

- [ ] **Step 4: 验证**

Run: `npx vitest run tests/collection-slice.test.ts` → 8 passed
Run: `npx tsc --noEmit` → clean

- [ ] **Step 5: Commit**

```bash
git add src/store/index.ts tests/collection-slice.test.ts
git commit -m "feat(briefing): 精选集 store slice——收藏/移除/完整回答后追加"
```

---

### Task 5: 正文铭牌收藏按钮

**Files:**
- Modify: `src/components/article-assistant/ArticleBodyChunks.tsx`
- Modify: `src/components/briefing/AcademicBriefingLayout.tsx:124-134`（ArticleBodyChunks 调用处）
- Modify: `src/components/briefing/NewspaperBriefingLayout.tsx:98-104`（同上）
- Test: `tests/chunk-collect-button.test.tsx`

**Interfaces:**
- Consumes: Task 4 的 `collectChunk` 与 `collection.entries`；`assistantSession.contextId`。
- Produces: `ArticleBodyChunks` 新 prop `collectible?: boolean`（默认 false → Anthropic/拾贝零改动）。

- [ ] **Step 1: 写失败测试**

创建 `tests/chunk-collect-button.test.tsx`：

```tsx
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'

const mockIpc = { collectionAddEntry: vi.fn() }
vi.mock('@/lib/ipc', () => ({ ipc: new Proxy({}, { get: (_, k) => mockIpc[k as keyof typeof mockIpc] ?? (() => Promise.resolve()) }) }))

import { useStore } from '@/store'
import { ArticleBodyChunks } from '@/components/article-assistant/ArticleBodyChunks'

const ARTICLE = '## AI Safety\n宪法式 AI 用书面原则约束模型。\n\n## Training Data\n训练数据的去重与过滤。'
const CHUNKS = [
  { heading: 'AI Safety', summary: 's0', terms: [] },
  { heading: 'Training Data', summary: 's1', terms: [] },
]

function seedSession() {
  useStore.setState({
    assistantSession: {
      contextId: '/lib/夜航简报/夜航简报-2026-08-04.md',
      contextType: 'briefing',
      articleContent: ARTICLE,
      guide: { background: 'bg', chunks: CHUNKS },
      guideLoading: false, guideError: null, messages: [], streaming: false,
      abortId: '', searchLoading: false, searchError: null, chatError: null,
      retryContext: null, isOpen: true, activeChunkIndex: null,
    } as never,
    collection: { entries: [], loaded: true },
  })
}

beforeEach(() => {
  cleanup()
  vi.clearAllMocks()
  useStore.setState({ assistantSession: null, collection: { entries: [], loaded: false } })
})

describe('chunk collect button', () => {
  it('collectible 时每块铭牌行渲染未收藏按钮', () => {
    seedSession()
    render(<ArticleBodyChunks content={ARTICLE} chunks={CHUNKS} fileName="b.md" collectible />)
    expect(screen.getByTestId('chunk-collect-button-0')).toHaveTextContent('收入精选集')
    expect(screen.getByTestId('chunk-collect-button-1')).toHaveTextContent('收入精选集')
  })

  it('点击后调用 collectChunk 并变已收藏禁用', async () => {
    seedSession()
    mockIpc.collectionAddEntry.mockResolvedValue({ ok: true })
    render(<ArticleBodyChunks content={ARTICLE} chunks={CHUNKS} fileName="b.md" collectible />)
    fireEvent.click(screen.getByTestId('chunk-collect-button-0'))
    await vi.waitFor(() =>
      expect(screen.getByTestId('chunk-collect-button-0')).toHaveTextContent('已收藏')
    )
    expect(screen.getByTestId('chunk-collect-button-0')).toBeDisabled()
    expect(mockIpc.collectionAddEntry).toHaveBeenCalled()
  })

  it('已收藏条目（来自持久化）渲染已收藏禁用态', () => {
    seedSession()
    useStore.setState({
      collection: {
        loaded: true,
        entries: [{
          id: 'c-1', briefingFilePath: '/lib/夜航简报/夜航简报-2026-08-04.md', briefingDate: '2026-08-04',
          chunkHeading: 'AI Safety', chunkIndex: 0, chunkBody: 'x',
          guide: { summary: 's0', terms: [] }, qa: [], qaMessageCount: 0,
          collectedAt: 't', updatedAt: 't',
        }],
      },
    })
    render(<ArticleBodyChunks content={ARTICLE} chunks={CHUNKS} fileName="b.md" collectible />)
    expect(screen.getByTestId('chunk-collect-button-0')).toBeDisabled()
    expect(screen.getByTestId('chunk-collect-button-1')).toBeEnabled()
  })

  it('collectible 缺省/false 时不渲染按钮（Anthropic/拾贝路径）', () => {
    seedSession()
    render(<ArticleBodyChunks content={ARTICLE} chunks={CHUNKS} fileName="b.md" />)
    expect(screen.queryByTestId('chunk-collect-button-0')).toBeNull()
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run tests/chunk-collect-button.test.tsx`
Expected: FAIL（无 collectible prop / 无按钮）

- [ ] **Step 3: 写实现**

`src/components/article-assistant/ArticleBodyChunks.tsx`：

① Props 接口加 `collectible?: boolean`，组件参数解构加 `collectible = false`。
② 组件内（memo 组件函数顶部）加 store 订阅：

```tsx
  const contextId = useStore((s) => s.assistantSession?.contextId ?? null)
  const collectedIndexes = useStore((s) =>
    collectible && contextId
      ? s.collection.entries.filter((e) => e.briefingFilePath === contextId).map((e) => e.chunkIndex)
      : EMPTY_INDEXES
  )
  const collectChunk = useStore((s) => s.collectChunk)
```

文件顶部加 `import { useStore } from '@/store'` 和模块级常量 `const EMPTY_INDEXES: number[] = []`。

注意：`collectedIndexes`  selector 返回新数组会导致每次渲染重算——用 `useStore` 时配合 `useShallow`（zustand/react/shallow）或改为逐块查询函数。采用更简单方案：selector 直接订阅 entries 引用，在渲染循环里 `entries.some(...)`：

```tsx
  const collectionEntries = useStore((s) => s.collection.entries)
  const contextId = useStore((s) => s.assistantSession?.contextId ?? null)
  const collectChunk = useStore((s) => s.collectChunk)
```

③ 铭牌行内（`❧N` span、heading span、`<span className="flex-1 border-t border-ember/40" />` 之后）加按钮：

```tsx
                {collectible && (
                  <button
                    type="button"
                    data-testid={`chunk-collect-button-${guideIndex}`}
                    disabled={collectionEntries.some(
                      (e) => e.briefingFilePath === contextId && e.chunkIndex === guideIndex
                    )}
                    onClick={(e) => {
                      e.stopPropagation()
                      void collectChunk(guideIndex)
                    }}
                    className={`text-xs tracking-wider transition-colors ${
                      collectionEntries.some(
                        (e) => e.briefingFilePath === contextId && e.chunkIndex === guideIndex
                      )
                        ? 'text-ember cursor-default'
                        : isAcademic
                          ? 'text-parchment/40 hover:text-ember'
                          : 'text-[#6b5d52]/60 hover:text-ember'
                    }`}
                  >
                    {collectionEntries.some(
                      (e) => e.briefingFilePath === contextId && e.chunkIndex === guideIndex
                    )
                      ? '★ 已收藏'
                      : '☆ 收入精选集'}
                  </button>
                )}
```

（把 `collectionEntries.some(...)` 提为循环内局部变量 `isCollected` 以保持可读。）

④ memo 比较函数加 `prev.collectible === next.collectible &&`（collectionEntries/contextId 经 useStore 订阅，不在 props 比较内）。

⑤ 两个 layout 的 `ArticleBodyChunks` 调用处加 `collectible` prop：
- `AcademicBriefingLayout.tsx:124`：`<ArticleBodyChunks ... onChunkClick={handleChunkClick} collectible />`
- `NewspaperBriefingLayout.tsx:98`：同样加 `collectible />`

Anthropic/拾贝的 reader 不传该 prop（默认 false），零行为变化。

- [ ] **Step 4: 验证**

Run: `npx vitest run tests/chunk-collect-button.test.tsx` → 4 passed
Run: `npx vitest run tests/web-article-reader.test.tsx tests/anthropic-blog-panel.test.tsx` → 不回归（共用组件未传 collectible）

- [ ] **Step 5: Commit**

```bash
git add src/components/article-assistant/ArticleBodyChunks.tsx src/components/briefing/AcademicBriefingLayout.tsx src/components/briefing/NewspaperBriefingLayout.tsx tests/chunk-collect-button.test.tsx
git commit -m "feat(briefing): 正文铭牌行新增收入精选集按钮（仅前沿）"
```

---

### Task 6: 日期列精选集入口 + CollectionView 阅读页 + Briefing.tsx 接线

**Files:**
- Modify: `src/components/BriefingDateColumn.tsx`（新增可选 prop，展开态+收起态两种形态）
- Create: `src/components/briefing/CollectionView.tsx`
- Modify: `src/pages/Briefing.tsx`（digest 列传 collection prop；主区加 CollectionView 分支）
- Test: `tests/collection-view.test.tsx`

**Interfaces:**
- Consumes: Task 4 全部；`MarkdownRenderer`（`src/components/md/MarkdownRenderer`）；`ConfirmDialog`（`src/components/ConfirmDialog.tsx`，props: `open/title/icon/children/confirmLabel/confirmVariant/onConfirm/onCancel`）；`createAssistantMdComponents(fontSize)`（`src/lib/assistant-md-components.tsx`）。
- Produces: `BriefingDateColumn` 新 prop `collection?: { active: boolean; onOpen: () => void }`；`<CollectionView theme />`。

- [ ] **Step 1: 写失败测试**

创建 `tests/collection-view.test.tsx`：

```tsx
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'

const mockIpc = { collectionRemoveEntry: vi.fn(), collectionRead: vi.fn() }
vi.mock('@/lib/ipc', () => ({ ipc: new Proxy({}, { get: (_, k) => mockIpc[k as keyof typeof mockIpc] ?? (() => Promise.resolve()) }) }))

import { useStore } from '@/store'
import { BriefingDateColumn } from '@/components/BriefingDateColumn'
import { CollectionView } from '@/components/briefing/CollectionView'
import type { BriefingCollectionEntry } from '@shared/index'

const ENTRY: BriefingCollectionEntry = {
  id: 'c-1', briefingFilePath: '/lib/夜航简报/夜航简报-2026-08-04.md', briefingDate: '2026-08-04',
  chunkHeading: 'AI Safety', chunkIndex: 0, chunkBody: '宪法式 AI 用书面原则约束模型行为。',
  guide: { summary: '本段介绍宪法式 AI。', terms: [{ term: 'Constitutional AI', translation: '宪法式 AI' }] },
  qa: [
    { role: 'user', content: '这是什么', selection: '宪法式 AI' },
    { role: 'assistant', content: '回答一' },
  ],
  qaMessageCount: 2, collectedAt: '2026-08-04T10:00:00.000Z', updatedAt: '2026-08-04T10:00:00.000Z',
}

const COLUMN_PROPS = {
  collapsed: false, history: [], today: '2026-08-04',
  onSelect: () => {}, onReceiveToday: () => {}, theme: 'academic' as const,
}

beforeEach(() => {
  cleanup()
  vi.clearAllMocks()
  useStore.setState({
    briefingSource: 'digest',
    briefingFontSize: 'lg',
    collection: { entries: [], loaded: true },
  })
})

describe('BriefingDateColumn 精选集入口', () => {
  it('传 collection prop 时今日上方渲染置顶入口', () => {
    render(<BriefingDateColumn {...COLUMN_PROPS} collection={{ active: false, onOpen: () => {} }} />)
    const entry = screen.getByTestId('briefing-collection-entry')
    expect(entry).toHaveTextContent('精选集')
    const today = screen.getByTestId('briefing-date-item-2026-08-04')
    expect(entry.compareDocumentPosition(today) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('不传 collection prop 时不渲染（求职源）', () => {
    render(<BriefingDateColumn {...COLUMN_PROPS} />)
    expect(screen.queryByTestId('briefing-collection-entry')).toBeNull()
  })

  it('收起态渲染 ✦ 小按钮并触发 onOpen', () => {
    const onOpen = vi.fn()
    render(<BriefingDateColumn {...COLUMN_PROPS} collapsed collection={{ active: false, onOpen }} />)
    fireEvent.click(screen.getByTestId('briefing-collection-mini'))
    expect(onOpen).toHaveBeenCalled()
  })
})

describe('CollectionView', () => {
  it('空态提示', () => {
    render(<CollectionView theme="academic" />)
    expect(screen.getByTestId('collection-empty')).toBeInTheDocument()
  })

  it('渲染条目三段：正文快照 / 导读 / 旁注问答', () => {
    useStore.setState({ collection: { entries: [ENTRY], loaded: true } })
    render(<CollectionView theme="academic" />)
    expect(screen.getByTestId('collection-entry-c-1')).toBeInTheDocument()
    expect(screen.getByText('宪法式 AI 用书面原则约束模型行为。')).toBeInTheDocument()
    expect(screen.getByText('本段介绍宪法式 AI。')).toBeInTheDocument()
    expect(screen.getByText('Constitutional AI')).toBeInTheDocument()
    expect(screen.getByText('这是什么')).toBeInTheDocument()
    expect(screen.getByText('回答一')).toBeInTheDocument()
  })

  it('移出精选集经 ConfirmDialog 后调用 removeCollectionEntry', async () => {
    useStore.setState({ collection: { entries: [ENTRY], loaded: true } })
    render(<CollectionView theme="academic" />)
    fireEvent.click(screen.getByTestId('collection-remove-c-1'))
    fireEvent.click(await screen.findByTestId('confirm-dialog-confirm'))
    expect(mockIpc.collectionRemoveEntry).toHaveBeenCalledWith('c-1')
  })
})
```

（`confirm-dialog-confirm` / `confirm-dialog-cancel` testid 已存在于 `src/components/ConfirmDialog.tsx:65,85`，直接使用。）

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run tests/collection-view.test.tsx`
Expected: FAIL（collection prop / CollectionView 不存在）

- [ ] **Step 3: 写实现**

① `src/components/BriefingDateColumn.tsx`：Props 接口加：

```ts
  /** 仅 digest 源传入：精选集置顶入口 */
  collection?: { active: boolean; onOpen: () => void }
```

展开态：`entries.map(...)` 之前渲染：

```tsx
      {collection && (
        <button
          data-testid="briefing-collection-entry"
          onClick={collection.onOpen}
          className={`w-full text-left px-2 py-2 rounded transition-all duration-300 flex items-center gap-2 ${
            collection.active ? activeItem : itemBase
          }`}
          style={{ fontSize: 'var(--briefing-list-title-size)' }}
        >
          <span className="inline-block w-[7px] h-[7px] shrink-0" />
          ✦ 精选集
        </button>
      )}
```

收起态：「今」按钮上方加：

```tsx
        {collection && (
          <button data-testid="briefing-collection-mini" onClick={collection.onOpen} title="精选集"
            className={`w-8 h-8 rounded flex items-center justify-center ${isAcademic ? (collection.active ? 'bg-ember/20 text-ember' : 'text-parchment/60 hover:text-ember') : (collection.active ? 'bg-[#1a1a1a] text-white' : 'text-[#6b5d52] hover:text-[#1a1a1a]')}`}>
            ✦
          </button>
        )}
```

② 创建 `src/components/briefing/CollectionView.tsx`：

```tsx
import { useMemo, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import { useStore } from '@/store'
import { MarkdownRenderer } from '@/components/md/MarkdownRenderer'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { createAssistantMdComponents } from '@/lib/assistant-md-components'
import type { BriefingCollectionEntry, BriefingTheme } from '@shared/index'

function formatGroupLabel(date: string): string {
  const [, m, d] = date.split('-')
  return m && d ? `${Number(m)}月${Number(d)}日 夜航简报` : date
}

export function CollectionView({ theme = 'academic' }: { theme?: BriefingTheme }) {
  const isAcademic = theme !== 'newspaper'
  const entries = useStore((s) => s.collection.entries)
  const removeCollectionEntry = useStore((s) => s.removeCollectionEntry)
  const briefingFontSize = useStore((s) => s.briefingFontSize)
  const [pendingRemove, setPendingRemove] = useState<string | null>(null)
  const qaComponents = useMemo(() => createAssistantMdComponents(briefingFontSize), [briefingFontSize])

  const groups = useMemo(() => {
    const map = new Map<string, BriefingCollectionEntry[]>()
    for (const e of entries) {
      const list = map.get(e.briefingDate) ?? []
      list.push(e)
      map.set(e.briefingDate, list)
    }
    return [...map.entries()].sort((a, b) => b[0].localeCompare(a[0]))
  }, [entries])

  const cardCls = isAcademic
    ? 'bg-ink/60 border border-parchment/10'
    : 'bg-white border border-[#1a1a1a]/10'
  const textMain = isAcademic ? 'text-parchment/90' : 'text-[#1a1a1a]'
  const textMuted = isAcademic ? 'text-parchment/60' : 'text-[#6b5d52]'

  return (
    <main data-testid="collection-view" className="relative z-[5] flex-1 overflow-y-auto px-6 py-6">
      <div className="w-[95%] max-w-[900px] min-w-[520px] mx-auto">
        <h1 className={`text-[24px] font-bold font-serif mb-6 ${isAcademic ? 'text-[#f5e6cc]' : 'text-[#1a1a1a]'}`}>
          ✦ 精选集
        </h1>
        {entries.length === 0 && (
          <div data-testid="collection-empty" className={`text-sm ${textMuted}`}>
            尚无收藏。阅读今日简报时，点块标题旁的 ☆ 收入精选集。
          </div>
        )}
        {groups.map(([date, list]) => (
          <section key={date} className="mb-8">
            <div className="flex items-center gap-2 mb-3">
              <span className="text-ember text-sm tracking-[0.2em]" style={{ fontVariant: 'small-caps' }}>
                {formatGroupLabel(date)}
              </span>
              <span className="flex-1 border-t border-ember/40" />
            </div>
            <div className="space-y-4">
              {list.map((entry) => (
                <article key={entry.id} data-testid={`collection-entry-${entry.id}`} className={`rounded p-4 ${cardCls}`}>
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <h2 className={`font-serif font-bold ${textMain}`}>{entry.chunkHeading}</h2>
                    <button
                      type="button"
                      data-testid={`collection-remove-${entry.id}`}
                      onClick={() => setPendingRemove(entry.id)}
                      className={`shrink-0 text-xs ${textMuted} hover:text-ember`}
                    >
                      移出精选集
                    </button>
                  </div>
                  <div className={textMain} style={{ fontSize: 'var(--briefing-body-size)' }}>
                    <MarkdownRenderer content={entry.chunkBody} fileName="collection.md" hideHeader briefingStyle={theme} />
                  </div>
                  <div className={`mt-3 rounded p-3 ${isAcademic ? 'bg-ink/80 border border-parchment/10' : 'bg-[#f5f2ed] border border-[#1a1a1a]/10'}`}>
                    <div className={`leading-relaxed ${textMuted}`}>{entry.guide.summary}</div>
                    {entry.guide.terms.map((t, i) => (
                      <div key={i} className={`mt-1 text-sm ${textMuted}`}>
                        <span className="text-ember font-medium">{t.term}</span>
                        <span className="mx-1">·</span>
                        <span>{t.translation}</span>
                      </div>
                    ))}
                  </div>
                  {entry.qa.length > 0 && (
                    <div className="mt-3 space-y-2 border-t border-parchment/10 pt-3">
                      {entry.qa.map((m, i) => (
                        <div key={i} className={m.role === 'user' ? 'text-ember' : textMain}>
                          {m.role === 'user' && m.selection && (
                            <div className={`text-xs italic border-l-2 border-ember/40 pl-2 mb-1 ${textMuted}`}>
                              「{m.selection}」
                            </div>
                          )}
                          <ReactMarkdown components={qaComponents}>{m.content}</ReactMarkdown>
                        </div>
                      ))}
                    </div>
                  )}
                </article>
              ))}
            </div>
          </section>
        ))}
      </div>
      <ConfirmDialog
        open={pendingRemove !== null}
        title="移出精选集"
        icon="trash"
        confirmLabel="移出"
        confirmVariant="danger"
        onConfirm={() => {
          if (pendingRemove) void removeCollectionEntry(pendingRemove)
          setPendingRemove(null)
        }}
        onCancel={() => setPendingRemove(null)}
      >
        移出后该块的收藏按钮将恢复可点，可重新收藏。
      </ConfirmDialog>
    </main>
  )
}
```

③ `src/pages/Briefing.tsx`：

a) store 订阅区加：

```ts
  const collectionViewOpen = useStore((s) => s.collectionViewOpen)
  const openCollectionView = useStore((s) => s.openCollectionView)
```

b) digest 的 `BriefingDateColumn`（约 :245）加 prop：

```tsx
                collection={{ active: collectionViewOpen, onOpen: () => void openCollectionView() }}
```

（job-briefing 的那一列不传。）

c) 主区 digest 分支（约 :454 起的条件链）最前面插一个分支：

```tsx
            {source === 'digest' && collectionViewOpen ? (
              <CollectionView theme={theme} />
            ) : source === 'writing' ? (
```

即把现有 `source === 'writing' ? ... : isJob ? ... : emptyState ? ...` 链的最外层包上 digest+collectionViewOpen 判断。注意保持 job/writing 分支不受影响，并 import `CollectionView`。

d) 检查全局 chrome（背景/换画/字号）在 CollectionView 下仍挂载（ui-styling §8）：背景插画层在页面根部，不受影响；CollectionView 自身不渲染字号按钮（沿用日期列上方现有 controls 区域——若 digest 有 result 时 controls 在 reading-pane 内，则 CollectionView 打开期间无字号按钮是可接受的降级，字号仍作用于 `--briefing-body-size`）。

- [ ] **Step 4: 验证**

Run: `npx vitest run tests/collection-view.test.tsx` → 6 passed
Run: `npx vitest run tests/briefing-sidebar.test.tsx tests/briefing-page.test.tsx` → 不回归（注意 briefing-page 历史抽屉 3 个失败是既有基线遗留，见 memory，不必修）

- [ ] **Step 5: Commit**

```bash
git add src/components/BriefingDateColumn.tsx src/components/briefing/CollectionView.tsx src/pages/Briefing.tsx tests/collection-view.test.tsx
git commit -m "feat(briefing): 日期列置顶精选集入口与阅读页"
```

---

### Task 7: 正文加长（prompt-only）

**Files:**
- Modify: `electron/prompts/briefing/summarize-blogs.md`
- Modify: `electron/prompts/briefing/summarize-podcast.md`
- Modify: `electron/prompts/briefing/summarize-tweets.md`

**Interfaces:** 无代码接口变化。`tests/prompts.test.ts` 不含 briefing prompt 断言（已核实），无需改测试。

- [ ] **Step 1: 改三个 prompt 文件**

`summarize-blogs.md` 第 9 行：
- 旧：`- Write a summary of 200-400 words depending on article length and substance`
- 新：`- Write a summary of 600-900 words depending on article length and substance. The reader has zero AI background: when a technical term first appears, explain it in one plain sentence before moving on`

`summarize-podcast.md` 第 7 行：
- 旧：`- Write a remix of 300-500 words`
- 新：`- Write a remix of 800-1200 words. The reader has zero AI background: when a technical term first appears, explain it in one plain sentence before moving on`

`summarize-tweets.md` 第 21 行：
- 旧：`- Write 3-5 sentences per builder, covering the context and why it matters.`
- 新：`- Write 6-10 sentences per builder. Assume zero AI background: first give the context this person is responding to (what happened, why people are discussing it), then their take and why it matters.`

- [ ] **Step 2: 验证**

Run: `grep -n "600-900\|800-1200\|6-10" electron/prompts/briefing/*.md` → 三处命中
Run: `npx vitest run tests/prompts.test.ts` → 不回归

- [ ] **Step 3: Commit**

```bash
git add electron/prompts/briefing/summarize-blogs.md electron/prompts/briefing/summarize-podcast.md electron/prompts/briefing/summarize-tweets.md
git commit -m "feat(briefing): 前沿摘要显著加长并面向零基础解释术语"
```

---

### Task 8: E2E 完整生命周期 + source-map

**Files:**
- Modify: `electron/ipc/article-assistant.ts:247-263`（mock guide 加第二个 chunk）
- Create: `e2e/specs/briefing-collection.spec.ts`
- Modify: `e2e/source-map.json`（briefing-core group 加 spec 匹配）
- Modify（如需要）: `e2e/helpers/selectors.ts`（集中管理新 testid 选择器，e2e §5）

**Interfaces:**
- Consumes: 全部前序任务；`seedBriefing(libPath, date, content)`（`e2e/helpers/test-library.ts:577`，接受自定义 content）；`(window as any).useStore` 后门（`src/store/index.ts:2254`，e2e §8 允许的最小切片：`setAssistantSelection`）；`ArticleAssistantPage` POM（`e2e/pages/ArticleAssistantPage.ts`：`openChat/typeQuestion/send/waitForAssistantReply`）；mock 回复含「E2E 测试的」。

- [ ] **Step 1: mock guide 加第二个 chunk**

`electron/ipc/article-assistant.ts` 的 mock 分支，`chunks` 数组追加：

```ts
            {
              heading: 'Training Data',
              summary: '本段介绍训练数据的去重与过滤。',
              terms: [
                {
                  term: 'Deduplication',
                  translation: '去重',
                  explanation: '移除训练语料中重复或近重复样本的过程。',
                },
              ],
            },
```

验证既有 spec 不回归（它们断言的是第一 chunk 的内容，加第二 chunk 不影响）：

Run: `npx playwright test --config e2e/playwright.config.ts article-assistant guide-visibility`
若有断言 guide chunk 数量的用例失败，按其断言意图调整为 ≥ 或更新期望值（先读失败用例再改，不许盲目改生产代码）。

- [ ] **Step 2: 写 E2E spec**

创建 `e2e/specs/briefing-collection.spec.ts`：

```ts
import { test, expect } from '../fixtures/electron'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { CoverPage } from '../pages/CoverPage'
import { ArticleAssistantPage } from '../pages/ArticleAssistantPage'
import { SELECTORS } from '../helpers/selectors'
import { seedBriefing } from '../helpers/test-library'
import type { Page } from '@playwright/test'

function localToday(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// 自定义 seed：两个 heading 与 E2E mock guide 的两个 chunk 对齐
const SEED_CONTENT = `## AI Safety
宪法式 AI 用书面原则约束模型行为，减少人工标注。

## Training Data
训练数据的去重与过滤决定模型质量。

## 原始来源
### Anthropic
- [post](https://anthropic.com/engineering/1)`

async function openDigest(window: Page, libPath: string): Promise<ArticleAssistantPage> {
  seedBriefing(libPath, localToday(), SEED_CONTENT)
  const cover = new CoverPage(window)
  await cover.enterName('E2E 测试员')
  await cover.goToBriefing()
  await window.locator(SELECTORS.briefing.receiveDigestButton).click()
  await expect(window.locator(SELECTORS.briefing.academicLayout)).toBeVisible({ timeout: 15000 })
  const assistant = new ArticleAssistantPage(window)
  await assistant.waitForMounted()
  return assistant
}

/** E2E only（e2e §8）：store 后门注入选段。真实路径由 article-assistant.spec.ts 的 UI 选字用例覆盖。 */
async function injectSelection(window: Page, text: string): Promise<void> {
  await window.evaluate((t) => {
    ;(window as unknown as { useStore: { getState: () => { setAssistantSelection: (s: string) => void } } })
      .useStore.getState().setAssistantSelection(t)
  }, text)
}

async function askAndWait(assistant: ArticleAssistantPage, question: string): Promise<void> {
  await assistant.typeQuestion(question)
  await assistant.send()
  await assistant.waitForAssistantReply()
}

test.describe('@p1 briefing collection', () => {
  test('完整生命周期：收藏 → 追加 → 归属切换 → abort 不追加 → 移除 → 重启持久化 → 源删除保留', async ({ window, testLibraryPath }) => {
    const assistant = await openDigest(window, testLibraryPath)

    // 1. 日期列有精选集置顶入口（UI 出口断言，feature-development §12）
    await expect(window.getByTestId('briefing-collection-entry')).toBeVisible()

    // 2. 导读生成后铭牌按钮出现（等 mock guide 到达）
    await expect(window.getByTestId('chunk-collect-button-0')).toBeVisible({ timeout: 15000 })

    // 3. 拖拽选段提问（chunk 0）
    await assistant.openChat()
    await injectSelection(window, '宪法式 AI')
    await askAndWait(assistant, '这是什么')

    // 4. 收藏 chunk 0 → 按钮变已收藏禁用
    await window.getByTestId('chunk-collect-button-0').click()
    await expect(window.getByTestId('chunk-collect-button-0')).toHaveText('★ 已收藏')
    await expect(window.getByTestId('chunk-collect-button-0')).toBeDisabled()

    // 5. 打开精选集 → 条目三段齐全
    await window.getByTestId('briefing-collection-entry').click()
    await expect(window.getByTestId('collection-view')).toBeVisible()
    const entryCard = window.locator('[data-testid^="collection-entry-"]').first()
    await expect(entryCard).toContainText('宪法式 AI 用书面原则约束模型行为')
    await expect(entryCard).toContainText('本段介绍 Constitutional AI')
    await expect(entryCard).toContainText('这是什么')

    // 6. 回简报追问（无新选段）→ 完整回答后追加进原条目（向前填充）
    await window.getByTestId(`briefing-date-item-${localToday()}`).click()
    await expect(window.locator(SELECTORS.briefing.academicLayout)).toBeVisible()
    await assistant.openChat()
    await askAndWait(assistant, '追问不带选段')
    await window.getByTestId('briefing-collection-entry').click()
    await expect(entryCard).toContainText('追问不带选段')

    // 7. 带新选段聊 chunk 1 → 收藏 chunk 1 → 归属切换
    await window.getByTestId(`briefing-date-item-${localToday()}`).click()
    await assistant.openChat()
    await injectSelection(window, '去重与过滤')
    await askAndWait(assistant, '这句什么意思')
    await window.getByTestId('chunk-collect-button-1').click()
    await window.getByTestId('briefing-collection-entry').click()
    const cards = window.locator('[data-testid^="collection-entry-"]')
    await expect(cards).toHaveCount(2)
    await expect(cards.nth(0)).toContainText('Training Data') // 新收藏在前
    await expect(cards.nth(0)).toContainText('这句什么意思')
    await expect(cards.nth(1)).not.toContainText('这句什么意思')

    // 8. abort 半截回答 → 不追加
    await window.getByTestId(`briefing-date-item-${localToday()}`).click()
    await assistant.openChat()
    await assistant.typeQuestion('会被打断的问题')
    await assistant.send()
    await assistant.abort() // POM 新增方法：点击 ChatWindow 已有的 `article-assistant-stop-btn`（ChatWindow.tsx:253，streaming 时替换发送按钮）
    await window.getByTestId('briefing-collection-entry').click()
    await expect(cards.nth(0)).not.toContainText('会被打断的问题')

    // 9. 移除条目 → 回简报按钮恢复可点
    const secondId = await cards.nth(1).getAttribute('data-testid') // collection-entry-<id>
    const entryId = secondId!.replace('collection-entry-', '')
    await window.getByTestId(`collection-remove-${entryId}`).click()
    await window.getByTestId('confirm-dialog-confirm').click()
    await expect(window.locator('[data-testid^="collection-entry-"]')).toHaveCount(1)
    await window.getByTestId(`briefing-date-item-${localToday()}`).click()
    await expect(window.getByTestId('chunk-collect-button-0')).toBeEnabled()

    // 10. 重启 → 精选集仍在
    await window.reload()
    const cover2 = new CoverPage(window)
    await cover2.goToBriefing()
    await window.getByTestId('briefing-collection-entry').click()
    await expect(window.locator('[data-testid^="collection-entry-"]')).toHaveCount(1)

    // 11. 删除该日简报 → 条目仍完整可读
    fs.rmSync(path.join(testLibraryPath, '夜航简报', `夜航简报-${localToday()}.md`))
    await expect(window.locator('[data-testid^="collection-entry-"]')).toHaveCount(1)
    await expect(window.locator('[data-testid^="collection-entry-"]').first()).toContainText('训练数据的去重与过滤')
  })
})
```

注意：步骤 8 的 abort 使用 ChatWindow 已有的 `article-assistant-stop-btn`（streaming 时渲染在发送按钮位置）。`ArticleAssistantPage` 需补 `abort()` 方法（点击该 testid 并等 streaming 结束，POM 封装等待，e2e §7）。

步骤 10 的 reload 后若 CoverPage 不需重新输入名字（state 持久化），按实际行为调整（参照 `briefing-persistence` 类既有 spec 的重启模式）。

- [ ] **Step 3: source-map 登记**

`e2e/source-map.json` 的 `briefing-core` group：`specs` 数组加 `"briefing-collection.spec.ts"`；`sources` 数组加 `"src/components/briefing/CollectionView.tsx"` 与 `"src/lib/collection-attribution.ts"`、`"electron/lib/collection-store.ts"`、`"electron/ipc/collection.ts"`。

- [ ] **Step 4: 跑 E2E**

```bash
npx playwright test --config e2e/playwright.config.ts briefing-collection
```
Expected: 1 passed。跑前确认无其他窗口在编辑 src/（dev server 重建会打断测试，见 memory）。

- [ ] **Step 5: Commit**

```bash
git add electron/ipc/article-assistant.ts e2e/specs/briefing-collection.spec.ts e2e/source-map.json e2e/helpers/selectors.ts
git commit -m "test(briefing): 精选集完整生命周期 E2E"
```

---

## Self-Review 记录

- Spec 覆盖：数据模型(T1) / IPC(T2) / 归属算法(T3) / 同步时机(T4⑤⑥) / 三处 UI(T5/T6) / prompt 加长(T7) / 错误处理与兼容(T1 损坏+version 用例、T4 DUPLICATE/幂等、T8 源删除) / 测试策略(T1/T3/T4/T5/T6 单测组件 + T8 E2E) / 验收清单逐条有落点。
- 类型一致性：`qaMessageCount`、`BriefingCollectionEntry` 字段、4 个 IPC 方法名在 T1/T2/T4/T5/T6 间一致；`setAssistantSelection`（非 setAssistantPendingSelection）已按 `src/store/index.ts:1727` 实际命名。
- 已核实无占位符；ConfirmDialog testid（`confirm-dialog-confirm`）与中断控件（`article-assistant-stop-btn`）均已核实存在，直接使用。
