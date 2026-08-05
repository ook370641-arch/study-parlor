# 前沿来源迭代修复（精选集 + 导读 v2）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修复 2026-08-05 审查发现的 12 项偏差：精选集 6 项（重启按钮状态、unhandled rejection、explanation、chrome 常驻、重生成指纹、electron 版本）+ 导读 v2 6 项（进度 UI 对齐、非 briefing 门控、真取消、管线测试、测试补缺、§互跳 E2E）。

**Architecture:** 全部为小步外科修复，严格对齐 spec `docs/superpowers/specs/2026-08-06-digest-iteration-fixes-design.md`。每项先写失败测试再实现。不改任何既有功能语义。

**Tech Stack:** Electron 30 + React 18 + TypeScript + Zustand + Vitest + Playwright。

**Spec:** `docs/superpowers/specs/2026-08-06-digest-iteration-fixes-design.md`（修复项编号 A1-A6 / B1-B6 / F3 与本文任务一一对应）

## Global Constraints

- 验证只跑受影响测试：`npx vitest run tests/<file>`，禁止全量（rules general §9）。
- 新 IPC 五层同步：types → handler → preload → facade → store（rules ipc-state §1）。
- 组件文件只导出组件（rules ui-styling §10）；渲染进程禁止 import 主进程模块（rules ipc-state §5）。
- 双版式：academic 用 token（parchment/ember/ink），newspaper 用 `#1a1a1a`/`#6b5d52`/`#f5f2ed`，与所在文件既有先例一致。
- Commit 信息中文、格式 `type(scope): 主题——细节`（沿用 git log 风格）。
- 每个任务完成后跑对应测试文件确认通过再 commit。

---

### Task 1: A1 重启后收藏按钮状态——loadCollection 预载 + collectChunk 防御

**Files:**
- Modify: `src/store/index.ts`（`openAssistantSession` 约 1687-1711 行；`collectChunk` 约 1810 行）
- Test: `tests/collection-slice.test.ts`
- Modify（mock 修补）: `tests/store-article-assistant.test.ts`、`tests/anthropic-blog-panel.test.tsx`

**Interfaces:**
- Consumes: 既有 `loadCollection: () => Promise<void>`（`src/store/index.ts:1797`）、`collection.loaded` 布尔。
- Produces: `openAssistantSession` 对 briefing 会话预载精选集；`collectChunk` 在 `!loaded` 时先加载。签名均不变。

**背景**：`openAssistantSession` 被 `tests/store-article-assistant.test.ts` 和 `tests/anthropic-blog-panel.test.tsx` 以**显式 ipc mock** 驱动（无 Proxy 兜底），新增 `ipc.collectionRead` 调用会命中 undefined 报错，必须先补 mock。

- [ ] **Step 1: 补两个显式 mock（否则新代码会让既有测试红）**

`tests/store-article-assistant.test.ts` 顶部 `vi.mock('@/lib/ipc', ...)` 的对象字面量中追加一行（放在 `articleAssistantAbort: vi.fn()` 后）：

```ts
    articleAssistantAbort: vi.fn(),
    collectionRead: vi.fn().mockResolvedValue({ version: 1, entries: [] })
```

`tests/anthropic-blog-panel.test.tsx` 顶部 mock 对象中追加一行（放在 `articleAssistantWriteSession` 后）：

```ts
    articleAssistantWriteSession: vi.fn().mockResolvedValue(undefined),
    collectionRead: vi.fn().mockResolvedValue({ version: 1, entries: [] }),
```

- [ ] **Step 2: 写失败测试（追加到 `tests/collection-slice.test.ts` 末尾 describe 内）**

```ts
  it('打开 briefing 旁注会话时预载精选集', async () => {
    mockIpc.collectionRead.mockResolvedValue({ version: 1, entries: [] })
    useStore.getState().openAssistantSession({
      contextId: FILE,
      contextType: 'briefing',
      articleContent: ARTICLE,
    })
    await vi.waitFor(() => expect(mockIpc.collectionRead).toHaveBeenCalled())
    expect(useStore.getState().collection.loaded).toBe(true)
  })

  it('collectChunk 在精选集未加载时先加载再判重', async () => {
    seedAssistantSession([{ role: 'user', content: 'q', selection: '宪法式 AI' }])
    useStore.setState({ collection: { entries: [], loaded: false } })
    mockIpc.collectionRead.mockResolvedValue({ version: 1, entries: [entryOf()] })
    mockIpc.collectionAddEntry.mockResolvedValue({ ok: false, code: 'DUPLICATE' })
    await useStore.getState().collectChunk(0)
    expect(mockIpc.collectionRead).toHaveBeenCalled()
    // 磁盘已有同块条目 → DUPLICATE → 不写入 store
    expect(useStore.getState().collection.entries).toHaveLength(1)
  })
```

注：`mockIpc` 需加 `collectionRead: vi.fn()`——该文件顶部 `mockIpc` 已有 `collectionRead`（确认存在，无则补）。

- [ ] **Step 3: 跑测试确认失败**

Run: `npx vitest run tests/collection-slice.test.ts`
Expected: 两个新用例 FAIL（collectionRead 未被调用）

- [ ] **Step 4: 实现**

`src/store/index.ts` `openAssistantSession`，在 `get().loadAssistantGuide().then(...)` 之前插入：

```ts
    // A1: briefing 会话预载精选集，保证铭牌「已收藏」判定基于磁盘数据
    if (args.contextType === 'briefing' && !get().collection.loaded) {
      void get().loadCollection()
    }
```

`src/store/index.ts` `collectChunk`，在 `const attributed = ...` 之前插入：

```ts
    // A1: 未加载时先加载，确保 DUPLICATE 判定准确（重启后直接打开文章的场景）
    if (!get().collection.loaded) await get().loadCollection()
```

- [ ] **Step 5: 跑测试确认通过 + 回归两个被补 mock 的测试文件**

Run: `npx vitest run tests/collection-slice.test.ts tests/store-article-assistant.test.ts tests/anthropic-blog-panel.test.tsx`
Expected: 全部 PASS

- [ ] **Step 6: Commit**

```bash
git add src/store/index.ts tests/collection-slice.test.ts tests/store-article-assistant.test.ts tests/anthropic-blog-panel.test.tsx
git commit -m "fix(briefing): 重启后收藏按钮状态丢失——打开 briefing 会话预载精选集 + collectChunk 防御加载"
```

---

### Task 2: A2 syncCollectionQA 静默降级

**Files:**
- Modify: `src/store/index.ts`（`syncCollectionQA` 约 1852-1875 行）
- Test: `tests/collection-slice.test.ts`

**Interfaces:**
- Consumes: Task 1 的 loadCollection 防御逻辑。
- Produces: `syncCollectionQA` 不再抛出（任何内部失败静默，游标未推进下次自愈）。签名不变。

- [ ] **Step 1: 写失败测试（追加到 `tests/collection-slice.test.ts`）**

```ts
  it('syncCollectionQA 写盘失败静默降级（不抛出）', async () => {
    seedAssistantSession([{ role: 'user', content: 'q', selection: '宪法式 AI' }])
    useStore.setState({ collection: { entries: [entryOf({ qaMessageCount: 0 })], loaded: true } })
    mockIpc.collectionAppendQA.mockRejectedValue(new Error('disk full'))
    await expect(useStore.getState().syncCollectionQA()).resolves.toBeUndefined()
  })
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run tests/collection-slice.test.ts -t "静默降级"`
Expected: FAIL（rejects with 'disk full'）

- [ ] **Step 3: 实现——`syncCollectionQA` 整体包 try/catch**

```ts
  syncCollectionQA: async () => {
    const s = get().assistantSession
    if (!s || s.contextType !== 'briefing' || !s.guide) return
    // A2: 写盘失败静默降级——游标未推进，下次 finishAssistantStreaming 幂等自愈
    try {
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
    } catch {
      /* 静默 */
    }
  },
```

- [ ] **Step 4: 跑测试确认通过**

Run: `npx vitest run tests/collection-slice.test.ts`
Expected: PASS（含 Task 1 用例不回归）

- [ ] **Step 5: Commit**

```bash
git add src/store/index.ts tests/collection-slice.test.ts
git commit -m "fix(briefing): syncCollectionQA 写盘失败静默降级——消除 unhandled rejection"
```

---

### Task 3: A5 源重生成指纹——去重键补 chunkHeading

**Files:**
- Modify: `electron/lib/collection-store.ts`（`addCollectionEntry` 约 24-28 行）
- Modify: `src/components/article-assistant/ArticleBodyChunks.tsx`（`isCollected` 约 76-78 行）
- Test: `tests/collection-store.test.ts`、`tests/chunk-collect-button.test.tsx`

**Interfaces:**
- Consumes: `BriefingCollectionEntry.chunkHeading`（schema 已有，旧数据无需迁移）。
- Produces: 去重/`isCollected` 判定键升级为 `(briefingFilePath, chunkIndex, chunkHeading)`。

- [ ] **Step 1: 写失败测试**

`tests/collection-store.test.ts` 在「addEntry 同 (filePath, chunkIndex) 去重返回 duplicate」用例后追加：

```ts
  it('addEntry 同索引但 heading 不同（源重生成）允许收藏', () => {
    addCollectionEntry(dir, makeEntry())
    expect(addCollectionEntry(dir, makeEntry({ id: 'c-2', chunkHeading: '全新标题' }))).toBe('ok')
    expect(readCollection(dir).entries).toHaveLength(2)
  })
```

同时把既有用例标题改为「addEntry 同 (filePath, chunkIndex, chunkHeading) 去重返回 duplicate」（断言语义不变）。

`tests/chunk-collect-button.test.tsx` 末尾追加：

```tsx
  it('已收藏条目 heading 与当前块不匹配（源重生成）时按钮可点', () => {
    seedSession()
    useStore.setState({
      collection: {
        loaded: true,
        entries: [{
          id: 'c-1', briefingFilePath: '/lib/夜航简报/夜航简报-2026-08-04.md', briefingDate: '2026-08-04',
          chunkHeading: '旧内容标题', chunkIndex: 0, chunkBody: 'x',
          guide: { summary: 's0', terms: [] }, qa: [], qaMessageCount: 0,
          collectedAt: 't', updatedAt: 't',
        }],
      },
    })
    render(<ArticleBodyChunks content={ARTICLE} chunks={CHUNKS} fileName="b.md" collectible />)
    expect(screen.getByTestId('chunk-collect-button-0')).toBeEnabled()
  })
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run tests/collection-store.test.ts tests/chunk-collect-button.test.tsx`
Expected: 两个新用例 FAIL

- [ ] **Step 3: 实现**

`electron/lib/collection-store.ts` `addCollectionEntry`：

```ts
  const dup = col.entries.some(
    (e) =>
      e.briefingFilePath === entry.briefingFilePath &&
      e.chunkIndex === entry.chunkIndex &&
      e.chunkHeading === entry.chunkHeading
  )
```

`src/components/article-assistant/ArticleBodyChunks.tsx` `isCollected`：

```ts
                  const isCollected = collectionEntries.some(
                    (e) =>
                      e.briefingFilePath === contextId &&
                      e.chunkIndex === guideIndex &&
                      e.chunkHeading === chunk.heading
                  )
```

- [ ] **Step 4: 跑测试确认通过**

Run: `npx vitest run tests/collection-store.test.ts tests/chunk-collect-button.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add electron/lib/collection-store.ts src/components/article-assistant/ArticleBodyChunks.tsx tests/collection-store.test.ts tests/chunk-collect-button.test.tsx
git commit -m "fix(briefing): 精选集去重键补 chunkHeading——源重生成同索引新内容可收藏，旧条目保留"
```

---

### Task 4: A3 CollectionView 术语 explanation + 分组/双版式组件测试

**Files:**
- Modify: `src/components/briefing/CollectionView.tsx`（术语块约 77-83 行）
- Test: `tests/collection-view.test.tsx`

**Interfaces:**
- Consumes: `entry.guide.terms[i].explanation`（`ArticleAssistantTerm` 已有可选 explanation）；`formatGroupLabel`（文件内私有函数，「8月4日 夜航简报」格式）。
- Produces: 术语行补 explanation 子行（样式对齐 GuideSidebar：academic `text-parchment/50`、newspaper `text-[#999]`）。

- [ ] **Step 1: 写失败测试（追加到 `tests/collection-view.test.tsx` CollectionView describe 内）**

```tsx
  it('术语表渲染 explanation（沿用 GuideSidebar 视觉语言）', () => {
    useStore.setState({
      collection: {
        loaded: true,
        entries: [{
          ...ENTRY,
          guide: { summary: 's', terms: [{ term: 'CAI', translation: '宪法式 AI', explanation: '用书面原则约束模型行为的对齐方法。' }] },
        }],
      },
    })
    render(<CollectionView theme="academic" />)
    expect(screen.getByText('用书面原则约束模型行为的对齐方法。')).toBeInTheDocument()
  })

  it('按简报日期分组渲染组头', () => {
    useStore.setState({
      collection: {
        loaded: true,
        entries: [
          ENTRY,
          { ...ENTRY, id: 'c-2', briefingDate: '2026-08-03', collectedAt: '2026-08-03T10:00:00.000Z' },
        ],
      },
    })
    render(<CollectionView theme="academic" />)
    expect(screen.getByText('8月4日 夜航简报')).toBeInTheDocument()
    expect(screen.getByText('8月3日 夜航简报')).toBeInTheDocument()
  })

  it('newspaper 主题下条目正常渲染', () => {
    useStore.setState({ collection: { entries: [ENTRY], loaded: true } })
    render(<CollectionView theme="newspaper" />)
    expect(screen.getByTestId('collection-entry-c-1')).toBeInTheDocument()
    expect(screen.getByText('本段介绍宪法式 AI。')).toBeInTheDocument()
  })
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run tests/collection-view.test.tsx`
Expected: explanation 用例 FAIL（分组/newspaper 用例可能直接通过——通过则保留作回归防线）

- [ ] **Step 3: 实现——CollectionView 术语块补 explanation**

把 `{entry.guide.terms.map((t, i) => (` 内的渲染改为：

```tsx
                    {entry.guide.terms.map((t, i) => (
                      <div key={i} className={`mt-1 text-sm ${textMuted}`}>
                        <span className="text-ember font-medium">{t.term}</span>
                        <span className="mx-1">·</span>
                        <span>{t.translation}</span>
                        {t.explanation && (
                          <div className={`mt-0.5 ${isAcademic ? 'text-parchment/50' : 'text-[#999]'}`}>{t.explanation}</div>
                        )}
                      </div>
                    ))}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `npx vitest run tests/collection-view.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/briefing/CollectionView.tsx tests/collection-view.test.tsx
git commit -m "fix(briefing): 精选集术语表补 explanation，补分组组头与 newspaper 组件测试"
```

---

### Task 5: A4 精选集视图全局 chrome 常驻

**Files:**
- Modify: `src/pages/Briefing.tsx`（CollectionView 分支约 308-310 行）
- Test: E2E 断言在 Task 12 补（本任务无单测；页面级组装由 E2E 覆盖）

**Interfaces:**
- Consumes: `fontSize`/`decrease`/`increase`/`fontSizeBtnCls`/`isAcademic`/`SwapPaintingButton`（Briefing.tsx 内既有，与其他分支同源）。
- Produces: 精选集视图下 `briefing-font-size-decrease/increase` 与 academic 下 `briefing-swap-painting-button` 可见可用。

**背景**：Briefing.tsx 各内容分支重复同一按钮组（`absolute top-4 right-0/right-4 z-20 flex items-start gap-1`），本任务沿用该模式（surgical，不做跨分支提取重构）。注意 CollectionView 自身是 `<main className="relative z-[5] flex-1 overflow-y-auto">`，外层包 `relative` 容器即可让按钮绝对定位。

- [ ] **Step 1: 实现**

`src/pages/Briefing.tsx` 把：

```tsx
            {source === 'digest' && collectionViewOpen ? (
              <CollectionView theme={theme} />
            ) : source === 'writing' ? (
```

改为：

```tsx
            {source === 'digest' && collectionViewOpen ? (
              <div className="relative flex-1 flex flex-col min-h-0">
                <div className="absolute top-4 right-4 z-20 flex items-start gap-1">
                  <button type="button" data-testid="briefing-font-size-decrease"
                    disabled={fontSize === 'sm'} onClick={decrease}
                    className={`w-9 h-9 rounded-full border flex items-center justify-center text-sm disabled:opacity-20 disabled:cursor-not-allowed ${fontSizeBtnCls}`}
                    title="减小字号">−</button>
                  <button type="button" data-testid="briefing-font-size-increase"
                    disabled={fontSize === '7xl'} onClick={increase}
                    className={`w-9 h-9 rounded-full border flex items-center justify-center text-sm disabled:opacity-20 disabled:cursor-not-allowed ${fontSizeBtnCls}`}
                    title="增大字号">+</button>
                  {isAcademic && <SwapPaintingButton surface="briefing" data-testid="briefing-swap-painting-button" className="text-parchment/70 hover:text-parchment" />}
                </div>
                <CollectionView theme={theme} />
              </div>
            ) : source === 'writing' ? (
```

（按钮 JSX 与 job 分支逐字一致——实现时从同文件 396-404 行附近复制，确保 `decrease`/`increase`/`fontSize`/`fontSizeBtnCls` 变量名与该文件 digest/job 分支所用一致；若该文件 digest 分支用的变量名不同，以该文件既有分支为准。）

- [ ] **Step 2: 类型检查**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: 无新错误（tsconfig.node 的 3 个预存错误属其他会话，忽略）

- [ ] **Step 3: Commit**

```bash
git add src/pages/Briefing.tsx
git commit -m "fix(briefing): 精选集视图补齐字号与换画按钮——全局 chrome 与内容分支解耦（ui-styling §8）"
```

---

### Task 6: A6 electron 版本回退锁定

**Files:**
- Modify: `package.json`、`package-lock.json`

- [ ] **Step 1: 回退**

`package.json`：`"electron": "^30.5.1"` → `"electron": "30.5.1"`

- [ ] **Step 2: 同步 lockfile**

Run: `npm install --package-lock-only`
Expected: package-lock.json 中 electron 解析回 30.5.1 精确版

- [ ] **Step 3: 验证**

Run: `node -e "console.log(require('./node_modules/electron/package.json').version)"`
Expected: `30.5.1`（若 node_modules 已是 30.5.1 且 lockfile 同步，无需重装）

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: electron 回退锁定 30.5.1——宽松匹配属 scope creep，依赖版本须显式（build-dev）"
```

---

### Task 7: B1 进度 UI 对齐 spec（§x/§y、400ms、ember 点睛）

**Files:**
- Modify: `src/lib/guide-progress.ts`
- Modify: `src/components/article-assistant/GuideSidebar.tsx`（进度区 42-57 行）
- Test: `tests/guide-progress.test.ts`、`tests/GuideSidebar.test.tsx`

**Interfaces:**
- Consumes: `GuideProgress` union（不变）。
- Produces: 新增 `guideProgressParts(p: GuideProgress | null): { label: string; detail: string }`；`guideProgressText` 保留且改为基于 parts 组合（E2E 的 textContent 断言不受影响）。

- [ ] **Step 1: 先改失败断言 + 写新失败测试**

`tests/guide-progress.test.ts` 撰写态断言改为（分母补 §）：

```ts
    expect(guideProgressText({ stage: 'writing', chars: 860, entriesDone: 2, entriesTotal: 14 }))
      .toBe('撰写导读中… §2/§14 · 已写 860 字')
```

同文件追加：

```ts
import { guideProgressParts } from '../src/lib/guide-progress' // 并入顶部既有 import

describe('guideProgressParts', () => {
  it('拆分 label 与 detail', () => {
    expect(guideProgressParts(null)).toEqual({ label: '规划检索中…', detail: '' })
    expect(guideProgressParts({ stage: 'searching', done: 3, total: 7 }))
      .toEqual({ label: '检索背景资料中…', detail: '3/7' })
    expect(guideProgressParts({ stage: 'writing', chars: 860, entriesDone: 2, entriesTotal: 14 }))
      .toEqual({ label: '撰写导读中…', detail: '§2/§14 · 已写 860 字' })
  })
})
```

`tests/GuideSidebar.test.tsx` 撰写态断言 `'撰写导读中… §2/14 · 已写 860 字'` 改为 `'撰写导读中… §2/§14 · 已写 860 字'`，并追加：

```tsx
  it('进度阶段关键词用 ember 点睛，detail 保持 muted', () => {
    const s = sessionWithGuide()
    s.guide = null
    s.guideLoading = true
    s.guideProgress = { stage: 'searching', done: 1, total: 2 }
    mockStore(s)
    render(<GuideSidebar />)
    const el = screen.getByTestId('guide-progress')
    const label = el.querySelector('span.text-ember')
    expect(label).not.toBeNull()
    expect(label!).toHaveTextContent('检索背景资料中…')
  })
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run tests/guide-progress.test.ts tests/GuideSidebar.test.tsx`
Expected: 撰写态断言 + parts + ember 用例 FAIL

- [ ] **Step 3: 实现 `src/lib/guide-progress.ts`**

```ts
/** 阶段文案拆分：label 用于 ember 点睛，detail 保持 muted（spec：阶段关键词琥珀点睛） */
export function guideProgressParts(p: GuideProgress | null): { label: string; detail: string } {
  if (!p || p.stage === 'planning') return { label: '规划检索中…', detail: '' }
  if (p.stage === 'searching') return { label: '检索背景资料中…', detail: `${p.done}/${p.total}` }
  return { label: '撰写导读中…', detail: `§${p.entriesDone}/§${p.entriesTotal} · 已写 ${p.chars} 字` }
}

export function guideProgressText(p: GuideProgress | null): string {
  const { label, detail } = guideProgressParts(p)
  return detail ? `${label} ${detail}` : label
}
```

- [ ] **Step 4: 实现 GuideSidebar 进度区**

把 `GuideSidebar.tsx` 进度文案 div（43-49 行）改为：

```tsx
        <div data-testid="guide-progress" className="px-4">
          <div
            style={{ fontSize: GUIDE_TERM_SIZE, fontVariantNumeric: 'tabular-nums' }}
            className={isAcademic ? 'text-parchment/60' : 'text-[#6b5d52]'}
          >
            <span className="text-ember">{guideProgressParts(guideProgress).label}</span>
            {guideProgressParts(guideProgress).detail && (
              <span> {guideProgressParts(guideProgress).detail}</span>
            )}
          </div>
```

import 行补 `guideProgressParts`；进度痕 `duration-500` 改 `duration-400`。

注：组件内调两次 `guideProgressParts` 返回值相同（纯函数、开销可忽略）；若 reviewer 介意可在渲染前 `const parts = guideProgressParts(guideProgress)` 提取——组件函数体内、return 之前。

- [ ] **Step 5: 跑测试确认通过**

Run: `npx vitest run tests/guide-progress.test.ts tests/GuideSidebar.test.tsx`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/lib/guide-progress.ts src/components/article-assistant/GuideSidebar.tsx tests/guide-progress.test.ts tests/GuideSidebar.test.tsx
git commit -m "fix(article-assistant): 进度 UI 对齐 spec——§x/§y 文案、400ms 进度痕、阶段关键词琥珀点睛"
```

---

### Task 8: B2 非 briefing 不置 guideProgress

**Files:**
- Modify: `src/store/index.ts`（`generateAssistantGuide` 约 2042 行）
- Test: `tests/store-article-assistant.test.ts`

**Interfaces:**
- Consumes: `assistantSession.contextType`。
- Produces: 非 briefing 会话 `guideProgress` 恒为 null（主进程本就不发三态事件）。

- [ ] **Step 1: 写失败测试（在 `guide v2 cache versioning and progress` describe 内追加）**

```ts
    it('非 briefing 生成中不置 guideProgress（articleType 门控）', async () => {
      vi.mocked(ipc.articleAssistantGenerateGuide).mockReturnValue(new Promise(() => {}) as Promise<any>)
      useStore.getState().openAssistantSession({
        contextId: '/lib/a.md',
        contextType: 'anthropic-article',
        articleContent: 'body',
        autoGenerateGuide: true,
      })
      await flush(); await flush()
      expect(useStore.getState().assistantSession?.guideLoading).toBe(true)
      expect(useStore.getState().assistantSession?.guideProgress).toBeNull()
    })
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run tests/store-article-assistant.test.ts -t "门控"`
Expected: FAIL（guideProgress 为 `{ stage: 'planning' }`）

- [ ] **Step 3: 实现**

`src/store/index.ts` `generateAssistantGuide` 的 set 行改为：

```ts
    set({
      assistantSession: {
        ...s,
        guideLoading: true,
        guideError: null,
        // B2: 只有 briefing 走 v2 三阶段管线并会收到进度事件；其他类型不显示「规划检索中…」
        guideProgress: s.contextType === 'briefing' ? { stage: 'planning' } : null,
      },
    })
```

- [ ] **Step 4: 跑测试确认通过**

Run: `npx vitest run tests/store-article-assistant.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/store/index.ts tests/store-article-assistant.test.ts
git commit -m "fix(article-assistant): 非 briefing 生成导读不置 guideProgress——Anthropic 不再闪「规划检索中…」"
```

---

### Task 9: B3 导读生成真取消（abortGuide 五层 + 管线 signal + store 切换触发）

**Files:**
- Modify: `src/types/index.ts`（IpcApi）
- Modify: `electron/ipc/article-assistant.ts`（registerArticleAssistantIpc + briefing 真实路径约 310-330 行）
- Modify: `electron/lib/guide-v2-pipeline.ts`（`runDigestGuideV2` 增 signal 参数）
- Modify: `electron/preload.ts`
- Modify: `src/lib/ipc.ts`
- Modify: `src/store/index.ts`（`openAssistantSession` 切换触发 + `generateAssistantGuide` catch 的 GUIDE_ABORT 分支）
- Test: `tests/store-article-assistant.test.ts`；handler 级测试在 Task 11

**Interfaces:**
- Consumes: `chatStream` 的 `signal` 参数（`electron/lib/kimi.ts:189`，内部已监听 abort 中断 fetch）。
- Produces:
  - `IpcApi.articleAssistantAbortGuide: () => Promise<void>`
  - `runDigestGuideV2(cfg, args, onProgress, signal?: AbortSignal): Promise<ArticleAssistantGuide>`（第 4 参新增可选）
  - 主进程模块级 `activeGuideController`（文件私有，不导出）
  - store：GUIDE_ABORT 时仅复位 loading，不设 guideError

- [ ] **Step 1: 写失败测试（`tests/store-article-assistant.test.ts` 追加）**

mock 对象中补 `articleAssistantAbortGuide: vi.fn().mockResolvedValue(undefined)`（Task 1 已补 collectionRead，同理）。追加用例：

```ts
    it('切换文章时触发 abortGuide', async () => {
      openBriefing()
      await flush()
      useStore.getState().openAssistantSession({
        contextId: '/lib/other.md',
        contextType: 'briefing',
        articleContent: 'other',
      })
      expect(ipc.articleAssistantAbortGuide).toHaveBeenCalled()
    })

    it('GUIDE_ABORT 只复位 loading，不显示导读错误', async () => {
      vi.mocked(ipc.articleAssistantGenerateGuide).mockRejectedValue(Object.assign(new Error('aborted'), { code: 'GUIDE_ABORT' }))
      openBriefing()
      await flush(); await flush(); await flush()
      expect(useStore.getState().assistantSession?.guideLoading).toBe(false)
      expect(useStore.getState().assistantSession?.guideError).toBeNull()
    })
```

注意：第一个用例中第二次 `openAssistantSession` 的 contextId 不同才会触发切换分支；`openBriefing` helper 用 `/lib/d.md`，第二次用 `/lib/other.md`。

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run tests/store-article-assistant.test.ts -t "abort"`
Expected: 两例 FAIL

- [ ] **Step 3: 实现——types（`src/types/index.ts` IpcApi，放在 `articleAssistantWriteGuide` 声明附近）**

```ts
  articleAssistantAbortGuide: () => Promise<void>
```

- [ ] **Step 4: 实现——preload（`electron/preload.ts`，放在 `onArticleAssistantGuideProgress` 附近）**

```ts
  articleAssistantAbortGuide: () => ipcRenderer.invoke('articleAssistant:abortGuide'),
```

（参数/返回类型与 IpcApi 一致；参照同文件其他 invoke 包装的写法。）

- [ ] **Step 5: 实现——facade（`src/lib/ipc.ts`，放在 `articleAssistantWriteGuide` getter 后）**

```ts
  get articleAssistantAbortGuide() { return ensure().articleAssistantAbortGuide },
```

- [ ] **Step 6: 实现——主进程（`electron/ipc/article-assistant.ts`）**

`registerArticleAssistantIpc` 函数体外（模块级）加：

```ts
// B3: 当前进行中的导读生成控制器；abortGuide 时中断，切换文章不再白烧 token
let activeGuideController: AbortController | null = null
```

briefing 真实路径（`if (args.articleType === 'briefing')` 分支）改为：

```ts
      if (args.articleType === 'briefing') {
        const v2PromptPath = path.join(promptsDir(), 'digest-guide-v2.md')
        const systemV2 = fs.existsSync(v2PromptPath) ? fs.readFileSync(v2PromptPath, 'utf8') : ''
        const controller = new AbortController()
        activeGuideController = controller
        try {
          return await runDigestGuideV2(
            cfg,
            {
              system: systemV2,
              articleContent: args.articleContent,
              articleTitle: args.articleTitle,
              entriesTotal: args.entriesTotal,
            },
            (p) => send('articleAssistant:guideProgress', p),
            controller.signal
          )
        } catch (err) {
          const code = (err as Error & { code?: string }).code
          if (code === 'GUIDE_JSON_ERROR' || code === 'GUIDE_ABORT') throw err
          if (controller.signal.aborted) throw typedError('GUIDE_ABORT', 'guide generation aborted')
          throw typedError('GUIDE_LLM_ERROR', err instanceof Error ? err.message : String(err))
        } finally {
          if (activeGuideController === controller) activeGuideController = null
        }
      }
```

新 handler（注册在 writeGuide handler 之后即可）：

```ts
  ipcMain.handle('articleAssistant:abortGuide', async () => {
    activeGuideController?.abort()
  })
```

- [ ] **Step 7: 实现——管线 signal（`electron/lib/guide-v2-pipeline.ts`）**

`typed` 的 code 联合扩展为 `'GUIDE_JSON_ERROR' | 'GUIDE_ABORT'`。`runDigestGuideV2` 签名加第 4 参：

```ts
export async function runDigestGuideV2(
  cfg: AppConfig,
  args: { system: string; articleContent: string; articleTitle?: string; entriesTotal?: number },
  onProgress: (p: GuideProgress) => void,
  signal?: AbortSignal
): Promise<ArticleAssistantGuide> {
```

阶段 2 开始前（`debugDump('plan', ...)` 之后）与阶段 3 开始前（`debugDump('search', ...)` 之后）各插入：

```ts
  if (signal?.aborted) throw typed('GUIDE_ABORT', 'guide generation aborted')
```

阶段 3 `chatStream` 调用的 `signal: new AbortController().signal,` 改为：

```ts
      signal: signal ?? new AbortController().signal,
```

- [ ] **Step 8: 实现——store 两处**

`openAssistantSession` 在 `const prev = get().assistantSession` 之后、`set(...)` 之前插入：

```ts
    // B3: 切换文章时中断进行中的导读生成，不再白烧 token
    if (prev && prev.contextId !== args.contextId && prev.guideLoading) {
      void ipc.articleAssistantAbortGuide()
    }
```

`generateAssistantGuide` catch 块改为（GUIDE_ABORT 不设 guideError）：

```ts
    } catch (err) {
      const raw = (err as Error & { code?: string })?.code
      const cur = get().assistantSession
      if (!cur || cur.contextId !== s.contextId) return
      // B3: 用户切换文章导致的主动中断不是错误，静默复位
      if (raw === 'GUIDE_ABORT') {
        set({ assistantSession: { ...cur, guideLoading: false, guideProgress: null } })
        return
      }
      const code: ArticleAssistantErrorCode = raw === 'GUIDE_JSON_ERROR' ? 'GUIDE_JSON_ERROR' : 'GUIDE_LLM_ERROR'
      set({ assistantSession: { ...cur, guideLoading: false, guideError: code, guideProgress: null } })
    }
```

（`ArticleAssistantErrorCode` 联合若含 `'GUIDE_ABORT'` 且不再被赋值，无需改类型；若类型定义要求保留映射，保持类型不动即可。）

- [ ] **Step 9: 跑测试 + 类型检查**

Run: `npx vitest run tests/store-article-assistant.test.ts tests/collection-slice.test.ts tests/anthropic-blog-panel.test.tsx && npx tsc --noEmit -p tsconfig.json`
Expected: PASS + 无新 tsc 错误

注意：`tests/anthropic-blog-panel.test.tsx` 若报 `articleAssistantAbortGuide is not a function`，在其 mock 中补 `articleAssistantAbortGuide: vi.fn().mockResolvedValue(undefined),`（Anthropic 面板重复 openAssistantSession 时可能命中切换分支）。

- [ ] **Step 10: Commit**

```bash
git add src/types/index.ts electron/ipc/article-assistant.ts electron/lib/guide-v2-pipeline.ts electron/preload.ts src/lib/ipc.ts src/store/index.ts tests/store-article-assistant.test.ts
git commit -m "feat(article-assistant): 导读生成真取消——abortGuide IPC 五层 + 管线 signal + 切换文章中断"
```

---

### Task 10: B4 管线编排单测（新建）

**Files:**
- Test: `tests/article-assistant/guide-v2-pipeline.test.ts`（新建）

**Interfaces:**
- Consumes: Task 9 的 `runDigestGuideV2(cfg, args, onProgress, signal?)`；`buildGuideV2UserPrompt` 对无资料条目的「无外部资料」标注（`electron/lib/guide-v2.ts`）。
- Produces: 管线编排的四条防线（重试降级/单查询失败/无 key/abort）。

- [ ] **Step 1: 写测试文件**

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../electron/lib/kimi', () => ({
  chatNonStream: vi.fn(),
  chatStream: vi.fn(),
}))
vi.mock('../../electron/lib/search', () => ({ searchWeb: vi.fn() }))
vi.mock('../../electron/lib/credentials', () => ({ getSearchApiKey: vi.fn() }))

import { chatNonStream, chatStream } from '../../electron/lib/kimi'
import { searchWeb } from '../../electron/lib/search'
import { getSearchApiKey } from '../../electron/lib/credentials'
import { runDigestGuideV2 } from '../../electron/lib/guide-v2-pipeline'
import type { AppConfig } from '../../electron/env'

const CFG = { libraryPath: '/tmp' } as unknown as AppConfig
const ARTICLE = '## 一\nx\n\n## 二\ny'
const VALID_GUIDE = JSON.stringify({
  background: 'bg',
  chunks: [
    { heading: '一', context: 'c1', terms: [] },
    { heading: '二', context: 'c2', terms: [] },
  ],
})
const ARGS = { system: 'sys', articleContent: ARTICLE, entriesTotal: 2 }

/** chatStream mock：把 VALID_GUIDE 一次性喂给 onChunk 后返回 */
function mockStreamOnce() {
  vi.mocked(chatStream).mockImplementation(async (_c, _a, onChunk) => {
    onChunk(VALID_GUIDE)
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(getSearchApiKey).mockResolvedValue('test-key')
  mockStreamOnce()
})

describe('runDigestGuideV2 编排', () => {
  it('规划两次畸形 JSON → 重试 1 次后降级无搜索照常生成', async () => {
    vi.mocked(chatNonStream).mockResolvedValue('not json at all')
    const progress: unknown[] = []
    const guide = await runDigestGuideV2(CFG, ARGS, (p) => progress.push(p))
    expect(vi.mocked(chatNonStream).mock.calls.length).toBe(2)
    expect(searchWeb).not.toHaveBeenCalled()
    expect(guide.chunks).toHaveLength(2)
    // 无搜索时所有条目标注「无外部资料」
    const userContent = vi.mocked(chatStream).mock.calls[0][1].messages[1].content as string
    expect(userContent).toContain('无外部资料')
  })

  it('单查询失败仅置空对应条目的资料夹', async () => {
    vi.mocked(chatNonStream).mockResolvedValue(JSON.stringify({
      queries: [
        { query: 'q1', entries: [1], reason: 'r' },
        { query: 'q2', entries: [2], reason: 'r' },
      ],
    }))
    vi.mocked(searchWeb)
      .mockRejectedValueOnce(new Error('timeout'))
      .mockResolvedValueOnce([{ title: 't', url: 'u', content: 'snippet' }] as never)
    await runDigestGuideV2(CFG, ARGS, () => {})
    expect(searchWeb).toHaveBeenCalledTimes(2)
    const userContent = vi.mocked(chatStream).mock.calls[0][1].messages[1].content as string
    expect(userContent).toContain('无外部资料') // 条目 1 资料夹为空
    expect(userContent).toContain('snippet') // 条目 2 有资料
  })

  it('无 API key 时全部资料夹为空照常产出', async () => {
    vi.mocked(getSearchApiKey).mockResolvedValue(null as never)
    vi.mocked(chatNonStream).mockResolvedValue(JSON.stringify({
      queries: [{ query: 'q1', entries: [1], reason: 'r' }],
    }))
    const guide = await runDigestGuideV2(CFG, ARGS, () => {})
    expect(searchWeb).not.toHaveBeenCalled()
    expect(guide.chunks).toHaveLength(2)
  })

  it('signal 已 aborted 时在阶段边界抛 GUIDE_ABORT，不进入撰写', async () => {
    vi.mocked(chatNonStream).mockResolvedValue(JSON.stringify({ queries: [] }))
    const controller = new AbortController()
    controller.abort()
    await expect(
      runDigestGuideV2(CFG, ARGS, () => {}, controller.signal)
    ).rejects.toMatchObject({ code: 'GUIDE_ABORT' })
    expect(chatStream).not.toHaveBeenCalled()
  })
})
```

注：`assignMaterials` 对空 queries 也产出每条的资料夹（空），「无外部资料」标注来自 `buildGuideV2UserPrompt`——若第 4 例在阶段 1 后即抛（queries 为空跳过搜索，阶段 2 边界检查命中），行为符合断言。若实现中阶段 2 边界检查在 `queries.length === 0` 快路径之后，把该例的 aborted 检查点改为阶段 3 前（断言不变：`chatStream` 不被调用）。`isValidGuideV2` 若要求 chunks 非空以外的字段，按 `guide-v2.ts` 实际校验调整 fixture。

- [ ] **Step 2: 跑测试确认通过（实现已在 Task 9 落地，这里是补测）**

Run: `npx vitest run tests/article-assistant/guide-v2-pipeline.test.ts`
Expected: PASS；若有 FAIL 按实际行为修正 fixture（如 parseGuidePlan 对 `not json` 返回 `[]` 时第 1 例成立；若 chatNonStream 自身抛错路径不同，调整 mock 为 mockRejectedValue）

- [ ] **Step 3: Commit**

```bash
git add tests/article-assistant/guide-v2-pipeline.test.ts
git commit -m "test(article-assistant): 导读 v2 管线编排单测——重试降级/单查询失败/无 key/abort"
```

---

### Task 11: B5 测试补缺打包（writeGuide 版本分支 + abortGuide handler + .bak 恢复 + 字数防回退 + source-map）

**Files:**
- Test: `tests/article-assistant-guide-ipc.test.ts`（扩 handler 级测试）
- Test: `tests/collection-store.test.ts`（补 .bak 恢复断言）
- Test: `tests/briefing-prompts.test.ts`（字数防回退）
- Modify: `e2e/source-map.json`

**Interfaces:**
- Consumes: `registerArticleAssistantIpc(cfg)`、`guidePathFor`（handler 返回 `{ filePath }`，测试直接读该路径）；Task 9 的 abortGuide handler。
- Produces: handler 级测试模式（vi.hoisted 收集 ipcMain 回调），后续 handler 测试可复用。

- [ ] **Step 1: 写 writeGuide + abortGuide handler 测试（追加到 `tests/article-assistant-guide-ipc.test.ts` 末尾）**

文件顶部 import 区改为（新增 hoisted handlers + electron mock；既有纯函数 import 不动）：

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const handlers = vi.hoisted(() => ({}) as Record<string, (event: unknown, args: never) => Promise<unknown>>)
vi.mock('electron', () => ({
  ipcMain: {
    handle: (channel: string, fn: (event: unknown, args: never) => Promise<unknown>) => {
      handlers[channel] = fn
    },
  },
  app: { getPath: () => os.tmpdir() },
}))

import { parseAssistantGuideBody, serializeGuide, registerArticleAssistantIpc } from '../electron/ipc/article-assistant'
import type { AppConfig } from '../electron/env'
```

文件末尾追加：

```ts
describe('guide IPC handlers', () => {
  let dir: string
  const fakeEvent = { sender: { isDestroyed: () => false, send: vi.fn() } }

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'guide-ipc-'))
    registerArticleAssistantIpc({ libraryPath: dir } as unknown as AppConfig)
  })
  afterEach(() => { fs.rmSync(dir, { recursive: true, force: true }) })

  it('writeGuide：guide 含 context 时 frontmatter 写 guide_version: 2', async () => {
    const parent = path.join(dir, '夜航简报', '夜航简报-2026-08-04.md')
    const { filePath } = (await handlers['articleAssistant:writeGuide'](fakeEvent, {
      parentPath: parent,
      parentType: 'briefing',
      guide: { background: 'bg', chunks: [{ heading: 'H', context: '铺陈', terms: [] }] },
    } as never)) as { filePath: string }
    expect(fs.readFileSync(filePath, 'utf8')).toContain('guide_version: 2')
  })

  it('writeGuide：纯 summary（v1 格式）不写 guide_version', async () => {
    const parent = path.join(dir, 'article.md')
    const { filePath } = (await handlers['articleAssistant:writeGuide'](fakeEvent, {
      parentPath: parent,
      parentType: 'anthropic-article',
      guide: { background: 'bg', chunks: [{ heading: 'H', summary: '摘要', terms: [] }] },
    } as never)) as { filePath: string }
    expect(fs.readFileSync(filePath, 'utf8')).not.toContain('guide_version')
  })

  it('abortGuide 中断进行中的 generateGuide（reject GUIDE_ABORT）', async () => {
    const pending = handlers['articleAssistant:generateGuide'](fakeEvent, {
      articleContent: '## 一\nx',
      articleType: 'briefing',
      entriesTotal: 1,
    } as never)
    const assertion = expect(pending).rejects.toMatchObject({ code: 'GUIDE_ABORT' })
    await handlers['articleAssistant:abortGuide'](fakeEvent, undefined as never)
    await assertion
  })
})
```

注：abortGuide 用例走真实管线——规划阶段 `chatNonStream` 会真实请求网络。为避免真实调用，本文件需再 mock 管线：

```ts
vi.mock('../electron/lib/guide-v2-pipeline', () => ({
  runDigestGuideV2: vi.fn(
    (_cfg: unknown, _args: unknown, _onProgress: unknown, signal?: AbortSignal) =>
      new Promise((_, reject) => {
        signal?.addEventListener('abort', () =>
          reject(Object.assign(new Error('aborted'), { code: 'GUIDE_ABORT' })))
      })
  ),
}))
```

该 mock 同时保证 writeGuide 两个用例不触碰 LLM（它们不经过管线）。`isE2EMock()` 在 vitest 下为 false（缺 E2E 隔离标记），真实路径才会用到管线 mock。

- [ ] **Step 2: 跑测试确认通过**

Run: `npx vitest run tests/article-assistant-guide-ipc.test.ts`
Expected: PASS（若 registerArticleAssistantIpc 重复注册导致 handlers 被覆盖无妨——每次 beforeEach 重新赋值同一批 channel）

- [ ] **Step 3: 补 .bak 恢复断言（`tests/collection-store.test.ts`）**

把「损坏 JSON 走 .bak 备份并返回空集合」用例替换为：

```ts
  it('主文件损坏后从 .bak 恢复上次写入的数据', () => {
    addCollectionEntry(dir, makeEntry({ id: 'c-good' })) // 第一次写：无 .bak
    addCollectionEntry(dir, makeEntry({ id: 'c-good-2', chunkIndex: 1 })) // 第二次写：.bak = 含 c-good 的版本
    const p = collectionPathFor(dir)
    fs.writeFileSync(p, '{broken', 'utf8')
    const col = readCollection(dir)
    expect(col.entries.map((e) => e.id)).toEqual(['c-good'])
  })

  it('损坏且无 .bak 时返回空集合', () => {
    const p = collectionPathFor(dir)
    fs.mkdirSync(path.dirname(p), { recursive: true })
    fs.writeFileSync(p, '{broken', 'utf8')
    expect(readCollection(dir)).toEqual({ version: 1, entries: [] })
  })
```

- [ ] **Step 4: 字数防回退断言（`tests/briefing-prompts.test.ts` 追加）**

```ts
  it('summarize prompts 保持加长后的字数档（正文加长防回退）', () => {
    const dir = PROMPT_DIR
    expect(fs.readFileSync(path.join(dir, 'summarize-blogs.md'), 'utf8')).toContain('600-900')
    expect(fs.readFileSync(path.join(dir, 'summarize-podcast.md'), 'utf8')).toContain('800-1200')
    expect(fs.readFileSync(path.join(dir, 'summarize-tweets.md'), 'utf8')).toContain('6-10')
  })
```

- [ ] **Step 5: source-map 补登**

`e2e/source-map.json` 的 `article-assistant` group `sources` 改为：

```json
      "sources": [
        "electron/ipc/article-assistant.ts",
        "electron/lib/guide-v2*.ts",
        "src/components/article-assistant/**",
        "src/lib/assistant-*.ts",
        "src/lib/guide-progress.ts"
      ],
```

验证：`node scripts/e2e-changed.js` 无 WARNING（sources 变更本身不触发执行，只验证解析）。

- [ ] **Step 6: 跑全部受影响测试**

Run: `npx vitest run tests/article-assistant-guide-ipc.test.ts tests/collection-store.test.ts tests/briefing-prompts.test.ts`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add tests/article-assistant-guide-ipc.test.ts tests/collection-store.test.ts tests/briefing-prompts.test.ts e2e/source-map.json
git commit -m "test: 补缺——writeGuide 版本分支/abortGuide handler/.bak 恢复/字数防回退/source-map 补登"
```

---

### Task 12: B6 + F3 E2E（§点击互跳、重启按钮状态、精选集 chrome、注释修正）

**Files:**
- Modify: `e2e/specs/article-assistant-guide.spec.ts`
- Modify: `e2e/specs/briefing-collection.spec.ts`

**Interfaces:**
- Consumes: `article-chunk-plaque` testid（正文铭牌，`ArticleBodyChunks.tsx:59`）；`guide-chunk[data-chunk-index]`；Task 1（重启按钮状态修复）、Task 5（精选集 chrome）。
- Produces: §互跳双向 E2E 防线；精选集生命周期补两条断言。

- [ ] **Step 1: §点击互跳用例（`article-assistant-guide.spec.ts` 在 hover 用例后追加）**

```ts
  test('body-to-guide chunk navigation: clicking plaque scrolls guide chunk into view', async ({ window, testLibraryPath }) => {
    // 用户在正文点击第二条铭牌 ❧2 → 右侧导读栏滚动定位到对应 § 卡片。
    // 依赖 mock guide（两个 chunk）；导读栏容器滚动后第二张卡片进入可视区。
    await window.locator('[data-testid="article-chunk-plaque"]').nth(1).click()
    await expect(
      window.locator('[data-testid="guide-chunk"][data-chunk-index="1"]')
    ).toBeInViewport()
  })
```

注：mock guide 有两 chunk（AI Safety / Training Data）；正文需真的渲染出两个铭牌（mock 简报正文含对应 heading——本 spec 文件既有用例已依赖该结构，沿用同 spec 的 seed 与导航前置步骤；把此用例放进与 hover 用例相同的 describe/beforeEach 作用域）。

- [ ] **Step 2: briefing-collection.spec.ts 三处改动**

① 步骤 10（重启）在 `await cover2.goToBriefing()` 后、点精选集入口前插入：

```ts
    // 10a. 重启后直接打开简报 → 已收藏块的按钮为 ★ 已收藏禁用（A1 防线）
    await window.getByTestId(`briefing-date-item-${localToday()}`).click()
    await expect(window.getByTestId('chunk-collect-button-0')).toContainText('已收藏')
    await expect(window.getByTestId('chunk-collect-button-0')).toBeDisabled()
```

② 步骤 5（打开精选集断言三段处）追加 chrome 断言：

```ts
    await expect(window.getByTestId('briefing-font-size-increase')).toBeVisible()
```

③ 注释修正：把文件中 `injectSelection` 相关注释里的 `article-assistant.spec.ts` 改为 `article-annotations.spec.ts`（ghost pen 真实路径所在 spec）。

- [ ] **Step 3: 跑定向 E2E**

Run: `node scripts/e2e-changed.js --run`
Expected: `article-assistant-guide.spec.ts` 与 `briefing-collection.spec.ts` 在受影响列表中并全部通过（source-map Task 11 已补登，本步同时验证补登生效）

- [ ] **Step 4: Commit**

```bash
git add e2e/specs/article-assistant-guide.spec.ts e2e/specs/briefing-collection.spec.ts
git commit -m "test(e2e): §点击互跳正文→导读方向、重启后收藏按钮状态、精选集 chrome 断言"
```

---

### Task 13: 全量门禁 + 手动验收

- [ ] **Step 1: 全量单元**

Run: `npm run test`
Expected: 全部 PASS（含真实 API 冒烟 `tests/guide-v2-real.test.ts`，需 .env 有效；`REAL_TEST_REPLAY=1` 可回放）

- [ ] **Step 2: 全量 E2E**

Run: `npm run test:e2e`
Expected: 全部 PASS

- [ ] **Step 3: 手动验收（真实生成）**

`npm run dev` 启动，生成/刷新今日前沿简报：
1. 正文长度抽查：博客条目 600-900 词档、播客 800-1200 词档（肉眼估档即可）。
2. 导读 v2 质量：整体背景一段 + 每条 `context` 为背景铺陈（非内容转述）；进度三态可见，`§x/§y` 格式，阶段关键词琥珀色。
3. 收藏一块 → 追问 → 精选集三段完整（正文/导读含 explanation/问答）；重启应用后直接打开简报 → 按钮 ★ 已收藏。
4. 生成导读中切换到其他文章 → 切回后无「未能生成导读」错误提示。

- [ ] **Step 4: 回写原 spec/plan 状态**

在两份原 plan（`2026-08-04-frontier-collection.md`、`2026-08-04-digest-guide-v2.md`）的 Self-Review 记录末尾各追加一行：

```markdown
- `2026-08-06` 审查修复已合入：见 `docs/superpowers/specs/2026-08-06-digest-iteration-fixes-design.md` 与对应 plan。
```

## Self-Review 记录

- **Spec 覆盖**：A1(T1) / A2(T2) / A3+分组+双版式(T4) / A4(T5+F3②/T12) / A5(T3) / A6(T6) / B1(T7) / B2(T8) / B3(T9+handler 测试 T11) / B4(T10) / B5(T11 全五项) / B6(T12①) / F3(T12) / 验收清单(T13)。spec「明确不做」六项无任务，符合豁免记录。
- **类型一致性**：`guideProgressParts` 在 T7 定义、GuideSidebar 消费同名；`articleAssistantAbortGuide` 在 T9 的 types/preload/facade/store/mock 五处同名；`runDigestGuideV2` 第 4 参 `signal?: AbortSignal` 在 T9（定义/调用）与 T10/T11（mock 签名）一致；`GUIDE_ABORT` 在 T9 pipeline typed 联合、handler catch、store catch 三处一致。
- **依赖顺序**：T1→T2（同函数区域）；T9→T10/T11（signal 参数先行）；T1+T5→T12（E2E 断言依赖修复落地）；T11 source-map→T12 定向验证。
- **已知风险点**：T10/T11 的 mock 细节（parseGuidePlan 对非 JSON 返回 `[]`、vi.hoisted 时机）留了「按实际行为修正 fixture」的弹性指示；T5 按钮变量名以 Briefing.tsx 既有分支为准。
