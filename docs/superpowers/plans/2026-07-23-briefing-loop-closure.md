# 夜航简报功能闭环补全 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 补上夜航简报「读→写」通道与标注回看，修复可靠性缺口（错误误报、无取消、选段两坑、搜索失败静默），清理半截功能，并补齐 E2E 盲区。

**Architecture:** 沿现有三层架构（主进程 IPC → Preload → 渲染进程 Store）。feed 状态聚合抽为纯函数进 `electron/lib/feed-status.ts` 便于单测；伴生文件级联删除抽为 `electron/lib/sibling-files.ts` 供两个 delete handler 复用；取消机制复用各生成链路已有的 AbortController，新增 module 级控制器注册与 `*:abort` IPC。

**Tech Stack:** Electron 30 + React 18 + TypeScript + Zustand + Vitest + Playwright (E2E)

**Spec:** `docs/superpowers/specs/2026-07-23-briefing-loop-closure-design.md`

**关键事实（已核验，勿再猜测）：**
- `WritingResult<T> = { ok: true; value: T } | { ok: false; code: WritingErrorCode; message: string }`——成功字段是 `value` 不是 `data`
- Toast 组件 testid 为 `toast-message`，2 秒自动消失（E2E 不要断言 toast 文案，断言磁盘结果）
- `.anno-wrap` 元素带 `data-anno-id` 属性（`ArticleAnnotations.tsx:97-98`），跳转直接 querySelector
- 选区 chip：`sendAssistantMessage`（store:1188）→ `runAssistantStream`（store:1216）会重新 `get().assistantSession`，因此在发送的 set 里清 `pendingSelection` 必须把选段值显式传给 `runAssistantStream`，否则选段注入会断
- E2E fixture 支持 `test.use({ extraEnv: {...} })` 注入环境变量
- `@real` 只是 describe 标题约定，core 套件用 `--grep "@p0|@p1"` 运行

---

## Phase 1：可靠性地基

### Task 1: feed 状态化 —— FEED_EMPTY 与 NETWORK_ERROR 区分 + sourceStatus 'empty' 态

**Files:**
- Create: `electron/lib/feed-status.ts`
- Create: `tests/feed-status.test.ts`
- Modify: `electron/ipc/briefing.ts:82-97, 388-414`
- Modify: `src/types/index.ts:291`（`BriefingSourceStatus`）
- Modify: `src/components/BriefingHeader.tsx:9, 43-63, 73-81`

**Why:** 三源全网络失败时被误报为「今日海面平静，暂无新信号」（FEED_EMPTY）且无重试按钮；`sourceStatus` 把「抓取成功但为空」谎报为 failed。

- [ ] **Step 1: 新建 `electron/lib/feed-status.ts`**

```typescript
export type FeedStatus = 'ok' | 'empty' | 'failed'

export function classifyFeed<T>(data: T | null, hasContent: (d: T) => boolean): FeedStatus {
  if (data === null) return 'failed'
  return hasContent(data) ? 'ok' : 'empty'
}

export type FeedOutcome = 'proceed' | 'network-error' | 'feed-empty'

export function resolveFeedOutcome(statuses: FeedStatus[]): FeedOutcome {
  if (statuses.every((s) => s === 'failed')) return 'network-error'
  if (statuses.every((s) => s !== 'ok')) return 'feed-empty'
  return 'proceed'
}
```

- [ ] **Step 2: 写失败单测 `tests/feed-status.test.ts`**

```typescript
import { describe, it, expect } from 'vitest'
import { classifyFeed, resolveFeedOutcome } from '../electron/lib/feed-status'

describe('classifyFeed', () => {
  const hasContent = (d: { items?: unknown[] }) => (d.items?.length ?? 0) > 0

  it('null（抓取失败）→ failed', () => {
    expect(classifyFeed(null, hasContent)).toBe('failed')
  })
  it('抓取成功但内容为空 → empty', () => {
    expect(classifyFeed({ items: [] }, hasContent)).toBe('empty')
  })
  it('有内容 → ok', () => {
    expect(classifyFeed({ items: [1] }, hasContent)).toBe('ok')
  })
})

describe('resolveFeedOutcome', () => {
  it('全部 failed → network-error', () => {
    expect(resolveFeedOutcome(['failed', 'failed', 'failed'])).toBe('network-error')
  })
  it('全部 empty → feed-empty', () => {
    expect(resolveFeedOutcome(['empty', 'empty', 'empty'])).toBe('feed-empty')
  })
  it('failed + empty 混合（无 ok）→ feed-empty', () => {
    expect(resolveFeedOutcome(['failed', 'empty', 'empty'])).toBe('feed-empty')
  })
  it('任一 ok → proceed', () => {
    expect(resolveFeedOutcome(['failed', 'ok', 'empty'])).toBe('proceed')
  })
})
```

- [ ] **Step 3: 运行单测确认通过**

```bash
npx vitest run tests/feed-status.test.ts
```
预期：5 条 PASS。

- [ ] **Step 4: 修改 `electron/ipc/briefing.ts` 聚合逻辑**

文件顶部 import 区添加：
```typescript
import { classifyFeed, resolveFeedOutcome, type FeedStatus } from '../lib/feed-status'
```

删除 `hasAnyContent` 函数（`briefing.ts:140-146`，本次改动后成为孤儿）。

把 `briefing.ts:406-414`（`if (!hasAnyContent(...))` 与 `sourceStatus` 构造）替换为：

```typescript
    const feedStatuses: FeedStatus[] = [
      classifyFeed(feedX, (f) => (f.x?.length ?? 0) > 0),
      classifyFeed(feedPodcasts, (f) => (f.podcasts?.length ?? 0) > 0),
      classifyFeed(feedBlogs, (f) => (f.blogs?.length ?? 0) > 0),
    ]
    const outcome = resolveFeedOutcome(feedStatuses)
    if (outcome === 'network-error') {
      throw new Error('NETWORK_ERROR: all feeds unreachable')
    }
    if (outcome === 'feed-empty') {
      throw new Error('FEED_EMPTY')
    }

    const sourceStatus: BriefingSourceStatus = {
      x: feedStatuses[0],
      podcasts: feedStatuses[1],
      blogs: feedStatuses[2],
    }
```

- [ ] **Step 5: 放宽 `BriefingSourceStatus` 类型**

`src/types/index.ts:291`，从：
```typescript
export type BriefingSourceStatus = Record<string, 'ok' | 'failed'>
```
改为：
```typescript
export type BriefingSourceStatus = Record<string, 'ok' | 'failed' | 'empty'>
```

- [ ] **Step 6: BriefingHeader 显示「暂无更新」**

`src/components/BriefingHeader.tsx:9` props 类型从：
```typescript
  sourceStatus?: Record<string, 'ok' | 'failed'>
```
改为：
```typescript
  sourceStatus?: Record<string, 'ok' | 'failed' | 'empty'>
```

`BriefingHeader.tsx:53-63`（`failedSources` 与 `sourceStatusTitle` 计算块）之后添加：

```typescript
  const emptySources = sourceStatus
    ? Object.entries(sourceStatus)
        .filter(([, status]) => status === 'empty')
        .map(([key]) => knownLabels[key] ?? key)
    : []
```

`BriefingHeader.tsx:73-81`（failedSources 渲染块）之后添加：

```tsx
          {sourceStatus && emptySources.length > 0 && (
            <span
              className={`ml-2 ${isAcademic ? 'text-parchment/50' : 'text-[#6b5d52]'}`}
              data-testid="briefing-source-empty"
              title={`来源暂无更新：${emptySources.join('、')}`}
            >
              {emptySources.join('、')} 暂无更新
            </span>
          )}
```

- [ ] **Step 7: 回归验证**

```bash
npx vitest run
npx tsc --noEmit
npx playwright test --config e2e/playwright.config.ts briefing.spec.ts
```
预期：单测全过、typecheck 干净、briefing 旧 E2E 无回归（错误缓存注入路径不受影响）。

- [ ] **Step 8: Commit**

```bash
git add electron/lib/feed-status.ts tests/feed-status.test.ts electron/ipc/briefing.ts src/types/index.ts src/components/BriefingHeader.tsx
git commit -m "fix(briefing): distinguish network failure from empty feeds

fetchJsonWithRetry results are now classified ok/empty/failed. All-failed
throws NETWORK_ERROR (retryable) instead of being misreported as
FEED_EMPTY ('no news today'). sourceStatus gains 'empty' state; Header
shows '暂无更新' instead of lying '获取失败'."
```

---

### Task 2: 旁注选段两个静默坑（chip 发送后清除 + 选区监听收窄）

**Files:**
- Modify: `src/store/index.ts:1188-1263`（`sendAssistantMessage` / `retryAssistantMessage` / `runAssistantStream` 及类型声明）
- Modify: `src/components/article-assistant/ArticleAssistantPanel.tsx:51-63`
- Modify: `e2e/specs/article-assistant-controls.spec.ts`（新增 2 条用例）

**Why:** 发送后 chip 不清除导致下一条消息重复注入同一选段；document 级 mouseup 监听把聊天窗/导读栏里的选字也当成文章选段。

- [ ] **Step 1: store 类型声明改签名**

在 `src/store/index.ts` 类型声明区找到 `runAssistantStream` 声明（搜索 `runAssistantStream:`），从：
```typescript
runAssistantStream: (history: ArticleAssistantMessage[], useSearch: boolean) => Promise<void>
```
改为：
```typescript
runAssistantStream: (history: ArticleAssistantMessage[], useSearch: boolean, selection?: string) => Promise<void>
```

- [ ] **Step 2: `sendAssistantMessage` 发送即消费选段**

`src/store/index.ts:1188-1204`，替换整个 `sendAssistantMessage` 实现为：

```typescript
  sendAssistantMessage: async (text) => {
    // Wait for any in-flight history load to settle so we don't discard loaded
    // messages (the loadAssistantSession guard requires messages.length === 0).
    if (historyLoadPromise) {
      await historyLoadPromise
      historyLoadPromise = null
    }
    const s = get().assistantSession
    if (!s || s.streaming || s.searchLoading) return
    const content = text.trim()
    if (!content && !s.pendingSelection) return
    const useSearch = get().assistantSearchEnabled
    // 发送即消费选段：chip 随之清除，下一条消息不再重复注入同一选段。
    // 选段值必须显式传给 runAssistantStream——它会重新 get()，读不到快照里的值。
    const selection = s.pendingSelection
    const userMessage: ArticleAssistantMessage = { role: 'user', content, selection }
    const history = [...s.messages, userMessage]
    set({ assistantSession: { ...s, messages: history, retryContext: { text, useSearch }, pendingSelection: undefined } })
    await get().runAssistantStream(history, useSearch, selection)
  },
```

- [ ] **Step 3: `retryAssistantMessage` 从最后一条用户消息取选段**

`src/store/index.ts:1206-1214`，替换为：

```typescript
  retryAssistantMessage: async () => {
    const s = get().assistantSession
    if (!s || s.streaming || !s.retryContext) return
    let msgs = s.messages
    const last = msgs.at(-1)
    if (last && last.role === 'assistant' && last.content.trim() === '') msgs = msgs.slice(0, -1)
    const lastUser = [...msgs].reverse().find((m) => m.role === 'user')
    set({ assistantSession: { ...s, messages: msgs, chatError: null } })
    await get().runAssistantStream(msgs, s.retryContext.useSearch, lastUser?.selection)
  },
```

- [ ] **Step 4: `runAssistantStream` 用参数代替 `s.pendingSelection`**

`src/store/index.ts:1216` 签名改为：

```typescript
  runAssistantStream: async (history, useSearch, selection) => {
```

`src/store/index.ts:1248`（`ipc.articleAssistantSendMessage` 调用参数中），从：
```typescript
        selection: s.pendingSelection,
```
改为：
```typescript
        selection,
```

- [ ] **Step 5: 选区监听收窄到文章容器**

`src/components/article-assistant/ArticleAssistantPanel.tsx:51-63`，替换监听 effect 为：

```typescript
  // Listen for text selection — 仅文章容器（.briefing-article-body）内的选区
  // 算「文章选段」；聊天窗/导读栏内的选字不触发 pendingSelection。
  useEffect(() => {
    const onMouseUp = (e: MouseEvent) => {
      if (!(e.target as HTMLElement | null)?.closest?.('.briefing-article-body')) return
      // Small delay to let the selection settle
      setTimeout(() => {
        const sel = window.getSelection()?.toString().trim()
        if (sel && sel.length > 0) {
          setAssistantSelection(sel)
        }
      }, 0)
    }
    document.addEventListener('mouseup', onMouseUp)
    return () => document.removeEventListener('mouseup', onMouseUp)
  }, [setAssistantSelection])
```

- [ ] **Step 6: 运行现有旁注 E2E 确认无回归**

```bash
npx playwright test --config e2e/playwright.config.ts article-assistant
```
预期：全部通过（特别是「取消选段」与请求契约用例）。

- [ ] **Step 7: 新增 E2E 用例**

在 `e2e/specs/article-assistant-controls.spec.ts` 末尾新增 describe：

```typescript
test.describe('@p1 selection lifecycle', () => {
  test('选段 chip 发送后清除，第二条消息不再携带旧选段', async ({ window, testLibraryPath, testConfigDir }) => {
    const assistant = await openDigestArticle(window, testLibraryPath)
    await assistant.openChat()
    // E2E only：store 后门注入选段（真实鼠标选段路径由「取消选段」用例覆盖）
    await window.evaluate(() => {
      ;(window as any).useStore.getState().setAssistantSelection('E2E选段标记-唯一')
    })
    await expect(assistant.pendingSelection).toBeVisible()
    await sendAndWait(assistant, 'Q1')
    await expect(assistant.pendingSelection).toHaveCount(0)
    let req = readLastRequest(testConfigDir)
    expect(req.messages[1].content).toContain('E2E选段标记-唯一')

    await sendAndWait(assistant, 'Q2')
    req = readLastRequest(testConfigDir)
    expect(req.messages[1].content).not.toContain('E2E选段标记-唯一')
  })

  test('聊天窗内选中文字不产生文章选段 chip', async ({ window, testLibraryPath }) => {
    const assistant = await openDigestArticle(window, testLibraryPath)
    await assistant.openChat()
    await sendAndWait(assistant, '先产生一条回复')

    // 在聊天窗消息文本上拖选
    const msg = assistant.chatMessages.first()
    const box = await msg.boundingBox()
    if (!box) throw new Error('no chat message to select')
    await window.mouse.move(box.x + 5, box.y + box.height / 2)
    await window.mouse.down()
    await window.mouse.move(box.x + Math.min(120, box.width - 10), box.y + box.height / 2, { steps: 8 })
    await window.mouse.up()
    await window.waitForTimeout(300)

    await expect(assistant.pendingSelection).toHaveCount(0)
  })
})
```

- [ ] **Step 8: 运行新 E2E 验证通过**

```bash
npx playwright test --config e2e/playwright.config.ts article-assistant-controls.spec.ts -g "selection lifecycle"
```
预期：2 条 PASS。

- [ ] **Step 9: Commit**

```bash
git add src/store/index.ts src/components/article-assistant/ArticleAssistantPanel.tsx e2e/specs/article-assistant-controls.spec.ts
git commit -m "fix(assistant): consume selection on send, scope listener to article body

pendingSelection chip now clears after send (selection passed explicitly
to runAssistantStream; retry reads it from the last user message).
Selection listener ignores mouseup outside .briefing-article-body so
selecting text in the chat window no longer injects bogus selections."
```

---

### Task 3: searchError 可见化

**Files:**
- Modify: `src/components/article-assistant/ChatWindow.tsx`
- Modify: `e2e/helpers/selectors.ts`（articleAssistant 组加 1 条）
- Modify: `e2e/specs/article-assistant-controls.spec.ts`（新增 1 条用例）

**Why:** 搜索失败时 store 已存 `searchError`（`applyAssistantSearchResult` store:1273），但 UI 无任何渲染——用户以为联网搜了实际没有。`runAssistantStream` 每次发送已把 `searchError` 置 null（store:1228），「下次发送清除」语义现成。

- [ ] **Step 1: ChatWindow 渲染提示条**

`src/components/article-assistant/ChatWindow.tsx`：
- import 行从 `import { useRef, useState } from 'react'` 改为 `import { useEffect, useRef, useState } from 'react'`
- 组件内 `const [input, setInput] = useState('')` 之后添加：

```typescript
  const searchError = session?.searchError ?? null
  const [searchErrorDismissed, setSearchErrorDismissed] = useState(false)
  // 新错误到达时重置关闭状态，确保每条错误都能被看到
  useEffect(() => {
    if (searchError) setSearchErrorDismissed(false)
  }, [searchError])
```

注意：现有代码在 `if (!session || !session.isOpen) return null`（line 31）之后才有 hooks 安全问题——上述 useState/useEffect **必须放在该 return 之前**（与现有 `useState('')` 同区）。`session?.searchError` 用可选链因为此时 session 可能为 null。

- 在 `{/* Messages area */}` 的 div 之前（title bar 闭合 `</div>` 之后）插入：

```tsx
      {searchError && !searchErrorDismissed && (
        <div
          data-testid="assistant-search-error"
          className="mx-2 mt-2 flex items-center gap-2 rounded border border-ember/40 bg-ember/10 px-2 py-1 text-xs text-parchment/80 shrink-0"
        >
          <span className="flex-1">网络搜索失败，本次回复未联网</span>
          <button
            data-testid="assistant-search-error-dismiss"
            aria-label="关闭搜索失败提示"
            className="text-parchment/50 hover:text-ember leading-none"
            onClick={() => setSearchErrorDismissed(true)}
          >
            ✕
          </button>
        </div>
      )}
```

- [ ] **Step 2: 加 selector**

`e2e/helpers/selectors.ts` 的 `articleAssistant` 组内（找到 `pendingSelection` 附近）添加：

```typescript
    searchErrorBanner: '[data-testid="assistant-search-error"]',
```

- [ ] **Step 3: 新增 E2E 用例**

在 `e2e/specs/article-assistant-controls.spec.ts` 末尾新增：

```typescript
test.describe('@p1 search error visibility', () => {
  test('搜索失败提示条可见且可关闭', async ({ window, testLibraryPath }) => {
    const assistant = await openDigestArticle(window, testLibraryPath)
    await assistant.openChat()
    await sendAndWait(assistant, 'Q1')

    // E2E only：store 后门注入 searchError（真实路径需要 Tavily 失败，mock 不可达）
    await window.evaluate(() => {
      const store = (window as any).useStore
      const s = store.getState().assistantSession
      store.setState({ assistantSession: { ...s, searchError: 'SEARCH_ERROR' } })
    })

    const banner = window.locator(SELECTORS.articleAssistant.searchErrorBanner)
    await expect(banner).toBeVisible()
    await expect(banner).toContainText('未联网')
    await window.locator('[data-testid="assistant-search-error-dismiss"]').click()
    await expect(banner).toHaveCount(0)
  })
})
```

- [ ] **Step 4: 运行验证**

```bash
npx playwright test --config e2e/playwright.config.ts article-assistant-controls.spec.ts -g "search error"
npx playwright test --config e2e/playwright.config.ts article-assistant
```
预期：新用例 PASS，旧用例无回归。

- [ ] **Step 5: Commit**

```bash
git add src/components/article-assistant/ChatWindow.tsx e2e/helpers/selectors.ts e2e/specs/article-assistant-controls.spec.ts
git commit -m "feat(assistant): surface search failure in chat window

searchError was stored but never rendered — users believed replies were
web-backed when search had silently failed. Banner is dismissible and
clears on next send (existing runAssistantStream behavior)."
```

---

## Phase 2：闭环功能

### Task 4: 转入写作（读→写通道）

**Files:**
- Create: `src/components/briefing/TransferToWritingButton.tsx`
- Modify: `src/store/index.ts`（新增 action + 类型声明）
- Modify: `src/components/briefing/AcademicBriefingLayout.tsx`
- Modify: `src/components/briefing/NewspaperBriefingLayout.tsx`
- Modify: `src/components/anthropic/AnthropicArticleReader.tsx`
- Modify: `e2e/helpers/selectors.ts`（briefing 组加 1 条）
- Create: `e2e/specs/briefing-transfer.spec.ts`

**Why:** 读到有价值的内容想写点什么时，当前只能手动切 tab、新建、复制粘贴。job-briefing 不加（卡片流非文章）。

- [ ] **Step 1: store 新增 `transferArticleToWriting` action**

`src/store/index.ts` 类型声明区（`deleteJobBriefings` 声明附近）添加：

```typescript
transferArticleToWriting: (args: {
  name: string
  content: string
  sourceType: 'digest' | 'anthropic'
  sourcePath: string
}) => Promise<void>
```

实现区（`deleteJobBriefings` 实现之后）添加：

```typescript
  transferArticleToWriting: async (args) => {
    const sanitize = (n: string) =>
      n.replace(/[\\/:*?"<>|]/g, '-').replace(/\s+/g, ' ').trim() || '未命名'
    const base = sanitize(args.name)
    const fm = `---\ntitle: ${base}\nsource_type: ${args.sourceType}\nsource_path: ${args.sourcePath}\n---\n\n`
    const body = fm + args.content

    const tryCreate = async (name: string): Promise<string | null> => {
      const r = await ipc.writingCreateFile({ root: 'writing', dir: '', name })
      if (r.ok) return r.value.path
      if (r.code === 'WRITING_NAME_CONFLICT') return null
      throw new Error(r.message)
    }

    try {
      let filePath = await tryCreate(base)
      if (!filePath) {
        const now = new Date()
        const suffix = `${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}`
        filePath = await tryCreate(`${base}-${suffix}`)
      }
      if (!filePath) {
        get().showToast('转入写作失败：文件名冲突')
        return
      }
      const w = await ipc.writingWrite({ path: filePath, body })
      if (!w.ok) {
        get().showToast('转入写作失败')
        return
      }
      get().showToast('已转入写作')
    } catch {
      get().showToast('转入写作失败')
    }
  },
```

- [ ] **Step 2: 新建按钮组件 `src/components/briefing/TransferToWritingButton.tsx`**

```tsx
import { useState } from 'react'
import { useStore } from '@/store'

interface Props {
  name: string
  content: string
  sourceType: 'digest' | 'anthropic'
  sourcePath: string
  theme?: 'academic' | 'newspaper'
}

export function TransferToWritingButton({ name, content, sourceType, sourcePath, theme = 'academic' }: Props) {
  const transfer = useStore((s) => s.transferArticleToWriting)
  const [busy, setBusy] = useState(false)
  const isAcademic = theme !== 'newspaper'

  return (
    <button
      data-testid="transfer-to-writing"
      disabled={busy}
      onClick={async () => {
        setBusy(true)
        try {
          await transfer({ name, content, sourceType, sourcePath })
        } finally {
          setBusy(false)
        }
      }}
      className={`text-xs px-3 py-1 rounded-full border transition-colors disabled:opacity-40 ${
        isAcademic
          ? 'border-parchment/30 text-parchment/70 hover:text-parchment hover:border-ember/60'
          : 'border-[#1a1a1a]/30 text-[#6b5d52] hover:text-[#1a1a1a] hover:border-[#1a1a1a]/60'
      }`}
    >
      {busy ? '转入中…' : '转入写作'}
    </button>
  )
}
```

- [ ] **Step 3: AcademicBriefingLayout 挂载**

`src/components/briefing/AcademicBriefingLayout.tsx`：
- import 区添加 `import { TransferToWritingButton } from './TransferToWritingButton'`
- 组件体内（`const articleBodyRef` 之后）添加：

```typescript
  const articleName = filePath?.split(/[\\/]/).pop()?.replace(/\.md$/, '') ?? result.title
```

- `<header>` 块内 `<p className="text-sm text-[#e8d5b7]/60">{displayDate}</p>` 之后添加：

```tsx
          {filePath && (
            <div className="mt-3 flex items-center justify-center gap-2">
              <TransferToWritingButton
                name={articleName}
                content={result.content}
                sourceType="digest"
                sourcePath={filePath}
                theme="academic"
              />
            </div>
          )}
```

- [ ] **Step 4: NewspaperBriefingLayout 挂载**

同样改动（import、`articleName` 计算），在 header 的日期 flex 行之后添加：

```tsx
          {filePath && (
            <div className="mt-3 flex items-center justify-center gap-2">
              <TransferToWritingButton
                name={articleName}
                content={result.content}
                sourceType="digest"
                sourcePath={filePath}
                theme="newspaper"
              />
            </div>
          )}
```

- [ ] **Step 5: AnthropicArticleReader 挂载**

`src/components/anthropic/AnthropicArticleReader.tsx`：
- import 区添加 `import { TransferToWritingButton } from '@/components/briefing/TransferToWritingButton'`
- 在 header 的 meta flex 行（`frontmatter.authors` 渲染）闭合 `</div>` 之后、`frontmatter.summary` 块之前添加：

```tsx
                  <div className="mt-4 flex items-center gap-2">
                    <TransferToWritingButton
                      name={frontmatter.title ?? 'article'}
                      content={body}
                      sourceType="anthropic"
                      sourcePath={filePath}
                      theme={theme}
                    />
                  </div>
```

- [ ] **Step 6: 加 selector + 写 E2E**

`e2e/helpers/selectors.ts` 的 `briefing` 组内添加：

```typescript
    transferToWriting: '[data-testid="transfer-to-writing"]',
```

新建 `e2e/specs/briefing-transfer.spec.ts`：

```typescript
import { test, expect } from '../fixtures/electron'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { CoverPage } from '../pages/CoverPage'
import { SELECTORS } from '../helpers/selectors'
import { seedBriefing } from '../helpers/test-library'

function localToday(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

test.describe('@p1 转入写作', () => {
  test('digest 全文转入 writing 根目录，frontmatter 记录来源', async ({ window, testLibraryPath }) => {
    seedBriefing(testLibraryPath, localToday())
    const cover = new CoverPage(window)
    await cover.enterName('E2E 测试员')
    await cover.goToBriefing()
    await window.locator(SELECTORS.briefing.receiveDigestButton).click()
    await expect(window.locator(SELECTORS.briefing.academicLayout)).toBeVisible({ timeout: 15000 })

    await window.locator(SELECTORS.briefing.transferToWriting).click()

    // toast 2 秒自动消失，不断言；直接断言磁盘结果
    await expect.poll(() => {
      const dir = path.join(testLibraryPath, 'writing')
      if (!fs.existsSync(dir)) return 0
      return fs.readdirSync(dir).filter(
        (f) => f.endsWith('.md') && !/\.(assistant|annotations|guide)\.md$/.test(f)
      ).length
    }, { timeout: 10000 }).toBe(1)

    const dir = path.join(testLibraryPath, 'writing')
    const file = fs.readdirSync(dir).find(
      (f) => f.endsWith('.md') && !/\.(assistant|annotations|guide)\.md$/.test(f)
    )!
    const content = fs.readFileSync(path.join(dir, file), 'utf8')
    expect(content).toContain('source_type: digest')
    expect(content).toContain('source_path:')
    expect(content).toContain('X / Twitter')
  })
})
```

- [ ] **Step 7: 运行验证**

```bash
npx tsc --noEmit
npx playwright test --config e2e/playwright.config.ts briefing-transfer.spec.ts
npx playwright test --config e2e/playwright.config.ts briefing.spec.ts anthropic-blog-image.spec.ts
```
预期：新用例 PASS，layout/reader 相关旧用例无回归。

- [ ] **Step 8: Commit**

```bash
git add src/components/briefing/TransferToWritingButton.tsx src/store/index.ts src/components/briefing/AcademicBriefingLayout.tsx src/components/briefing/NewspaperBriefingLayout.tsx src/components/anthropic/AnthropicArticleReader.tsx e2e/helpers/selectors.ts e2e/specs/briefing-transfer.spec.ts
git commit -m "feat(briefing): one-click transfer of articles into writing

Digest layouts and Anthropic reader gain a '转入写作' header button.
The store action creates a file in the writing root (timestamp suffix on
name conflict) with source_type/source_path frontmatter recording
provenance."
```

---

### Task 5: 单篇标注列表

**Files:**
- Create: `src/components/article-assistant/AnnotationListButton.tsx`
- Modify: `src/components/briefing/AcademicBriefingLayout.tsx`（Task 4 的按钮容器内追加）
- Modify: `src/components/briefing/NewspaperBriefingLayout.tsx`（同上）
- Modify: `src/components/anthropic/AnthropicArticleReader.tsx`（同上）
- Modify: `e2e/helpers/selectors.ts`（annotations 组加 2 条）
- Modify: `e2e/specs/article-annotations.spec.ts`（新增 E2E-A5）

**Why:** 标注只活在原文页内笔标记上，划了多处后无法快速回看定位。只做单篇、只在阅读时可见（用户已确认不做跨文章汇总）。

- [ ] **Step 1: 新建 `src/components/article-assistant/AnnotationListButton.tsx`**

```tsx
import { useEffect, useState } from 'react'
import { ipc } from '@/lib/ipc'
import type { ArticleAnnotation } from '@shared/index'

interface Props {
  articlePath: string
  theme?: 'academic' | 'newspaper'
}

export function AnnotationListButton({ articlePath, theme = 'academic' }: Props) {
  const [open, setOpen] = useState(false)
  const [annotations, setAnnotations] = useState<ArticleAnnotation[]>([])
  const isAcademic = theme !== 'newspaper'

  const load = async () => {
    try {
      setAnnotations(await ipc.annotationsRead(articlePath))
    } catch {
      setAnnotations([])
    }
  }

  useEffect(() => {
    setOpen(false)
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [articlePath])

  if (annotations.length === 0) return null

  const jumpTo = (id: string) => {
    const el = document.querySelector(`[data-anno-id="${id}"]`) as HTMLElement | null
    if (!el) return
    el.scrollIntoView({ behavior: 'smooth', block: 'center' })
    el.style.outline = '2px solid #d97757'
    el.style.outlineOffset = '2px'
    setTimeout(() => {
      el.style.outline = ''
    }, 1200)
  }

  return (
    <div className="relative">
      <button
        data-testid="annotation-list-button"
        onClick={() => {
          const next = !open
          setOpen(next)
          if (next) void load()
        }}
        className={`text-xs px-3 py-1 rounded-full border transition-colors ${
          isAcademic
            ? 'border-parchment/30 text-parchment/70 hover:text-parchment hover:border-ember/60'
            : 'border-[#1a1a1a]/30 text-[#6b5d52] hover:text-[#1a1a1a] hover:border-[#1a1a1a]/60'
        }`}
      >
        标注 ({annotations.length})
      </button>
      {open && (
        <div
          data-testid="annotation-list-panel"
          className={`absolute left-1/2 -translate-x-1/2 top-full mt-2 z-30 w-72 max-h-64 overflow-y-auto rounded-lg border p-2 shadow-xl ${
            isAcademic ? 'bg-ink border-parchment/20' : 'bg-white border-[#1a1a1a]/20'
          }`}
        >
          {annotations.map((a) => (
            <button
              key={a.id}
              data-testid="annotation-list-item"
              data-anno-id={a.id}
              onClick={() => jumpTo(a.id)}
              className={`w-full text-left rounded px-2 py-1.5 text-xs transition-colors ${
                isAcademic
                  ? 'text-parchment/80 hover:bg-parchment/10'
                  : 'text-[#1a1a1a] hover:bg-[#f5f2ed]'
              }`}
            >
              <div className="truncate">「{a.selectedText}」</div>
              <div className="flex items-baseline justify-between gap-2 mt-0.5">
                <span className={`truncate ${isAcademic ? 'text-parchment/50' : 'text-[#6b5d52]'}`}>
                  {a.note || '（无备注）'}
                </span>
                <span className="shrink-0 opacity-50">§{a.paragraphIndex}</span>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: 三处挂载**

在 Task 4 创建的按钮容器内（`TransferToWritingButton` 之后）追加：

AcademicBriefingLayout / NewspaperBriefingLayout（容器 `{filePath && (...)}` 内）：
```tsx
              <AnnotationListButton articlePath={filePath} theme="academic" />
```
（Newspaper 用 `theme="newspaper"`；两文件 import 区添加 `import { AnnotationListButton } from '@/components/article-assistant/AnnotationListButton'`）

AnthropicArticleReader（Task 4 的 `<div className="mt-4 flex items-center gap-2">` 内）：
```tsx
                    <AnnotationListButton articlePath={filePath} theme={theme} />
```
（import 同上）

- [ ] **Step 3: 加 selectors**

`e2e/helpers/selectors.ts` 的 `annotations` 组内添加：

```typescript
    listButton: '[data-testid="annotation-list-button"]',
    listItem: '[data-testid="annotation-list-item"]',
```

- [ ] **Step 4: 新增 E2E（E2E-A5）**

在 `e2e/specs/article-annotations.spec.ts` 末尾新增（文件已有 `localToday` / `seedBriefing` / `fs` / `path` / `SELECTORS` import，若缺则补齐）：

```typescript
test('E2E-A5: 标注列表 — 计数、内容、点击跳转', async ({ window, testLibraryPath }) => {
  const today = localToday()
  seedBriefing(testLibraryPath, today)
  // 直接写 .annotations.md（真实创建路径由 A1/A4 覆盖）。
  // §1 = 「Aaron Levie 讨论了…」段，§3 = 「最新一期采访了…」段（seedBriefing 默认正文）。
  const annoPath = path.join(testLibraryPath, '夜航简报', `夜航简报-${today}.annotations.md`)
  fs.writeFileSync(annoPath, `---
title: Article Annotations
type: article-assistant
created_at: '${new Date().toISOString()}'
parent_path: 夜航简报/夜航简报-${today}.md
---

## a1

**选中文字：** Aaron Levie
**备注：** 第一条备注-唯一标识
**段落：** §1
**创建：** 2026-07-23
**更新：** 2026-07-23

---

## a2

**选中文字：** Latent Space
**备注：** 第二条备注
**段落：** §3
**创建：** 2026-07-23
**更新：** 2026-07-23
`, 'utf8')

  const cover = new CoverPage(window)
  await cover.enterName('E2E 测试员')
  await cover.goToBriefing()
  await window.locator(SELECTORS.briefing.receiveDigestButton).click()
  await expect(window.locator(SELECTORS.briefing.academicLayout)).toBeVisible({ timeout: 15000 })

  const btn = window.locator(SELECTORS.annotations.listButton)
  await expect(btn).toContainText('标注 (2)', { timeout: 10000 })
  await btn.click()

  const items = window.locator(SELECTORS.annotations.listItem)
  await expect(items).toHaveCount(2)
  await expect(items.first()).toContainText('第一条备注-唯一标识')

  // 先滚到底部，再点击跳转验证回滚
  await window.locator(SELECTORS.briefing.academicLayout).evaluate((el) => {
    el.scrollTop = el.scrollHeight
  })
  await items.first().click()
  await expect(window.locator('.anno-wrap[data-anno-id="a1"]')).toBeInViewport({ timeout: 5000 })
})
```

- [ ] **Step 5: 运行验证**

```bash
npx playwright test --config e2e/playwright.config.ts article-annotations.spec.ts -g "A5"
npx playwright test --config e2e/playwright.config.ts article-annotations.spec.ts
```
预期：新用例 PASS，A1/A3/A4 无回归。

- [ ] **Step 6: Commit**

```bash
git add src/components/article-assistant/AnnotationListButton.tsx src/components/briefing/AcademicBriefingLayout.tsx src/components/briefing/NewspaperBriefingLayout.tsx src/components/anthropic/AnthropicArticleReader.tsx e2e/helpers/selectors.ts e2e/specs/article-annotations.spec.ts
git commit -m "feat(annotations): per-article annotation list with jump-to-marker

Reading pages show a '标注 (n)' header button listing the article's
annotations (selection, note, paragraph). Clicking scrolls to the
marker and flashes it. Per-article only, no cross-article index."
```

---

### Task 6: 删除文章时级联清理伴生文件

**Files:**
- Create: `electron/lib/sibling-files.ts`
- Modify: `electron/ipc/briefing.ts:521-533`（delete handler）
- Modify: `electron/ipc/job-briefing.ts:186-198`（delete handler）
- Modify: `src/pages/Briefing.tsx:413`（ConfirmDialog 文案）
- Create: `e2e/specs/briefing-delete.spec.ts`

**Why:** 删除简报后 `.assistant.md` / `.annotations.md` / `.guide.md` 残留为孤儿文件。同时补上 digest 删除的 E2E（此前只有 job 源有用例）。

- [ ] **Step 1: 新建 `electron/lib/sibling-files.ts`**

```typescript
import fs from 'node:fs'
import path from 'node:path'

const SIBLING_SUFFIXES = ['.assistant.md', '.annotations.md', '.guide.md']

/**
 * 删除文章的所有伴生文件（旁注会话/标注/导读）。单个失败不阻断其余，
 * 返回实际删除的路径列表（供日志与测试断言）。
 */
export function deleteSiblingFiles(articlePath: string): string[] {
  const parsed = path.parse(articlePath)
  const removed: string[] = []
  for (const suffix of SIBLING_SUFFIXES) {
    const p = path.join(parsed.dir, `${parsed.name}${suffix}`)
    try {
      if (fs.existsSync(p)) {
        fs.rmSync(p)
        removed.push(p)
      }
    } catch (err) {
      console.warn(`[sibling-files] failed to remove ${p}`, err)
    }
  }
  return removed
}
```

- [ ] **Step 2: briefing:delete 级联**

`electron/ipc/briefing.ts` import 区添加：
```typescript
import { deleteSiblingFiles } from '../lib/sibling-files'
```

delete handler（:521-533）中 `fs.rmSync(abs)` 之后添加：
```typescript
      deleteSiblingFiles(abs)
```

- [ ] **Step 3: job-briefing:delete 级联**

`electron/ipc/job-briefing.ts` import 区添加：
```typescript
import { deleteSiblingFiles } from '../lib/sibling-files'
```

delete handler（:186-198）中 `fs.rmSync(abs)` 之后添加：
```typescript
      deleteSiblingFiles(abs)
```

- [ ] **Step 4: ConfirmDialog 文案**

`src/pages/Briefing.tsx:413`（`<p className="mt-2">删除「今天」的简报后…</p>`）之后添加：

```tsx
        <p className="mt-2">将同时删除所选简报的旁注对话、标注与导读。</p>
```

- [ ] **Step 5: 新建 E2E `e2e/specs/briefing-delete.spec.ts`**

```typescript
import { test, expect } from '../fixtures/electron'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { CoverPage } from '../pages/CoverPage'
import { SELECTORS } from '../helpers/selectors'
import { seedBriefing } from '../helpers/test-library'

test.describe('@p1 digest 删除', () => {
  test('删除 digest：文件、列表条目与伴生文件一并消失', async ({ window, testLibraryPath }) => {
    seedBriefing(testLibraryPath, '2026-07-19')
    seedBriefing(testLibraryPath, '2026-07-20')
    const dir = path.join(testLibraryPath, '夜航简报')
    for (const suffix of ['.assistant.md', '.annotations.md', '.guide.md']) {
      fs.writeFileSync(path.join(dir, `夜航简报-2026-07-19${suffix}`), '---\ntype: article-assistant\n---\n', 'utf8')
    }

    const cover = new CoverPage(window)
    await cover.enterName('E2E 测试员')
    await cover.goToBriefing()
    await expect(window.locator(SELECTORS.briefing.dateItem('2026-07-20'))).toBeVisible({ timeout: 10000 })
    await expect(window.locator(SELECTORS.briefing.dateItem('2026-07-19'))).toBeVisible()

    await window.locator(SELECTORS.briefing.deleteModeToggle).click()
    await window.locator(SELECTORS.briefing.deleteCheck('2026-07-19')).click()
    await window.locator(SELECTORS.briefing.deleteConfirm).click()
    await expect(window.locator(SELECTORS.briefing.confirmDialog)).toBeVisible()
    await window.locator(SELECTORS.briefing.confirmDialogConfirm).click()

    await expect(window.locator(SELECTORS.briefing.dateItem('2026-07-19'))).toHaveCount(0, { timeout: 10000 })
    await expect(window.locator(SELECTORS.briefing.dateItem('2026-07-20'))).toBeVisible()
    expect(fs.existsSync(path.join(dir, '夜航简报-2026-07-19.md'))).toBe(false)
    for (const suffix of ['.assistant.md', '.annotations.md', '.guide.md']) {
      expect(fs.existsSync(path.join(dir, `夜航简报-2026-07-19${suffix}`))).toBe(false)
    }
    expect(fs.existsSync(path.join(dir, '夜航简报-2026-07-20.md'))).toBe(true)
  })
})
```

- [ ] **Step 6: 运行验证**

```bash
npx playwright test --config e2e/playwright.config.ts briefing-delete.spec.ts job-briefing-error.spec.ts
```
预期：新用例 PASS，job 删除用例无回归。

- [ ] **Step 7: Commit**

```bash
git add electron/lib/sibling-files.ts electron/ipc/briefing.ts electron/ipc/job-briefing.ts src/pages/Briefing.tsx e2e/specs/briefing-delete.spec.ts
git commit -m "feat(briefing): cascade-delete sibling files on briefing delete

briefing:delete and job-briefing:delete now also remove .assistant.md /
.annotations.md / .guide.md via shared deleteSiblingFiles helper.
ConfirmDialog copy discloses this. E2E covers digest deletion for the
first time plus sibling cleanup."
```

---

## Phase 3：清理 + 取消

### Task 7: salary 渲染进岗位卡

**Files:**
- Modify: `electron/prompts/job-briefing/synthesize.md`
- Modify: `src/components/job-briefing/JobBriefingRenderer.tsx:26-38, 105-127, 277-279`
- Modify: `electron/ipc/job-briefing.ts:86-88`（mock 内容）
- Modify: `e2e/specs/job-briefing-generation.spec.ts`（加 1 条断言）

**Why:** `RawJob.salary` 被抽取并进入 `MatchedJob`，但 synthesize prompt 输出格式与 renderer 都不含薪资——求职者核心决策字段采而不用。

- [ ] **Step 1: synthesize.md 输出格式加薪资行**

`electron/prompts/job-briefing/synthesize.md` 第 4 条格式清单中，`- **城市**: ...` 之后插入一行：

```
   - **薪资**: ...（仅当输入 JSON 中该岗位 salary 字段非空时输出此行；否则省略）
```

- [ ] **Step 2: mock 内容加薪资**

`electron/ipc/job-briefing.ts` mockContent 中 `- **城市**: 深圳` 之后插入一行：

```
- **薪资**: 25-40K·16薪
```

- [ ] **Step 3: renderer 解析与渲染**

`src/components/job-briefing/JobBriefingRenderer.tsx`：
- `JobCardData` 类型（:26-38）`city?: string` 之后添加 `salary?: string`
- `parseJobs` 的字段分支（:109 `if (name.includes('城市'))` 之后）添加：

```typescript
      else if (name.includes('薪资')) current.salary = value.trim()
```

- 渲染处（:277-279）从：

```tsx
                      <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm opacity-80 mb-3">
                        {job.city && <span>城市：{job.city}</span>}
                      </div>
```

改为：

```tsx
                      <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm opacity-80 mb-3">
                        {job.city && <span>城市：{job.city}</span>}
                        {job.salary && <span>薪资：{job.salary}</span>}
                      </div>
```

- [ ] **Step 4: E2E 断言**

`e2e/specs/job-briefing-generation.spec.ts` 的 `generates job briefing via mock and writes cache` 用例末尾添加：

```typescript
  await expect(window.locator(SELECTORS.briefing.jobCard).first()).toContainText('25-40K')
```

- [ ] **Step 5: 运行验证**

```bash
npx playwright test --config e2e/playwright.config.ts job-briefing-generation.spec.ts -g "mock"
```
预期：PASS。

- [ ] **Step 6: Commit**

```bash
git add electron/prompts/job-briefing/synthesize.md src/components/job-briefing/JobBriefingRenderer.tsx electron/ipc/job-briefing.ts e2e/specs/job-briefing-generation.spec.ts
git commit -m "feat(job-briefing): render salary on job cards

salary was extracted into RawJob/MatchedJob but dropped by both the
synthesize prompt format and the renderer. Now emitted (when non-empty)
and shown next to city."
```

---

### Task 8: cities 注入检索查询

**Files:**
- Modify: `electron/lib/job-briefing.ts:51-61, 366-369`
- Create: `tests/job-briefing-queries.test.ts`

**Why:** `config.cities` 只写进 frontmatter，不参与任何查询——用户在设置里填了城市对结果零影响。

- [ ] **Step 1: 写失败单测 `tests/job-briefing-queries.test.ts`**

```typescript
import { describe, it, expect } from 'vitest'
import { buildEventQueries, buildFocusJobQuery } from '../electron/lib/job-briefing'
import { DEFAULT_JOB_BRIEFING_CONFIG, DEFAULT_JOB_PROFILE } from '../src/lib/job-briefing-defaults'

describe('buildEventQueries cities 注入', () => {
  it('公司查询与聚合查询都包含城市关键词', () => {
    const config = { ...DEFAULT_JOB_BRIEFING_CONFIG, cities: ['成都'] }
    const queries = buildEventQueries(config)
    expect(queries.length).toBeGreaterThan(1)
    for (const q of queries) {
      expect(q.query).toContain('成都')
    }
  })

  it('cities 为空时查询无多余空格', () => {
    const config = { ...DEFAULT_JOB_BRIEFING_CONFIG, cities: [] }
    const queries = buildEventQueries(config)
    for (const q of queries) {
      expect(q.query).not.toMatch(/\s{2,}/)
      expect(q.query).not.toMatch(/\s$/)
    }
  })
})

describe('buildFocusJobQuery cities 注入', () => {
  it('焦点岗位查询包含城市关键词', () => {
    const config = { ...DEFAULT_JOB_BRIEFING_CONFIG, cities: ['西安'] }
    const q = buildFocusJobQuery('腾讯', DEFAULT_JOB_PROFILE, config)
    expect(q).toContain('西安')
  })
})
```

- [ ] **Step 2: 运行确认失败**

```bash
npx vitest run tests/job-briefing-queries.test.ts
```
预期：FAIL（查询中不含「成都」「西安」）。

- [ ] **Step 3: 实现**

`electron/lib/job-briefing.ts:51-61` `buildEventQueries` 替换为：

```typescript
export function buildEventQueries(config: JobBriefingConfig): EventQuery[] {
  const cityText = config.cities.join(' ')
  const queries: EventQuery[] = config.companies
    .filter(c => c.enabled)
    .sort((a, b) => a.priority - b.priority)
    .map(c => ({ query: `${c.name} 2026秋招 2027届 校招 宣讲会 AI产品 招聘 ${cityText}`.trim(), company: c.name }))
  queries.push({
    query: `AI产品 2026秋招 2027届 校招 汇总 ${cityText}`.trim(),
    includeDomains: ['nowcoder.com', 'yingjiesheng.com'],
  })
  return queries
}
```

`electron/lib/job-briefing.ts:366-369` `buildFocusJobQuery` 替换为：

```typescript
export function buildFocusJobQuery(company: string, profile: JobProfile, config: JobBriefingConfig): string {
  const roles = profile.targetRoles.length ? profile.targetRoles : config.roleKeywords
  return `${company} ${roles.join(' ')} 招聘 校招 2026 ${config.cities.join(' ')}`.trim()
}
```

- [ ] **Step 4: 运行单测确认通过 + 全量回归**

```bash
npx vitest run tests/job-briefing-queries.test.ts
npx vitest run
```
预期：全过。

- [ ] **Step 5: Commit**

```bash
git add electron/lib/job-briefing.ts tests/job-briefing-queries.test.ts
git commit -m "feat(job-briefing): wire cities config into search queries

cities was persisted to frontmatter but never used in retrieval. Now
appended to event queries and focus job queries (trimmed when empty)."
```

---

### Task 9: Settings 移除「关注技能」死配置

**Files:**
- Modify: `src/pages/Settings.tsx:467-476`

**Why:** 「关注技能（用于雷达）」暗示一个不存在的功能，`skillKeywords` 不参与任何查询或匹配——设置幻觉。`profile.skills`（求职档案技能字段）已覆盖该需求。state 字段与 normalize 保留（旧 state.json 读取兼容），只删 UI。

- [ ] **Step 1: 删除输入块**

`src/pages/Settings.tsx` 删除第 467-476 行整个 `<div>`（含 `settings-job-skills` testid 的「关注技能（逗号分隔，用于雷达）」块）。

已核验：`settings-job-skills` 在 e2e/ 与 tests/ 中零引用，无需同步其他文件。

- [ ] **Step 2: 回归验证**

```bash
npx tsc --noEmit
npx playwright test --config e2e/playwright.config.ts settings.spec.ts job-briefing-generation.spec.ts
```
预期：typecheck 干净（`setJobConfig` 仍被城市/关键词使用，`skillKeywords` 保留在类型中不报错）、E2E 无回归。

- [ ] **Step 3: Commit**

```bash
git add src/pages/Settings.tsx
git commit -m "fix(settings): remove '关注技能' dead config input

skillKeywords fed no query, no matching, and no radar — a settings
illusion. profile.skills already covers the need. State field and
normalize kept for backward compat with existing state.json."
```

---

### Task 10: 删除 4 个死代码组件

**Files:**
- Delete: `src/components/briefing/BriefingAbstract.tsx`
- Delete: `src/components/briefing/BriefingReferences.tsx`
- Delete: `src/components/briefing/BriefingSpark.tsx`
- Delete: `src/components/BriefingHistoryDrawer.tsx`

**Why:** 四个组件在全 src 中仅自身文件出现（已 grep 核验，含 e2e 与 `src/components/briefing/index.ts`），是早期版式残留。

- [ ] **Step 1: 复核零引用后删除**

```bash
grep -rn "BriefingAbstract\|BriefingReferences\|BriefingSpark\|BriefingHistoryDrawer" src/ e2e/ tests/ --include="*.ts" --include="*.tsx" | grep -v "^Binary"
```
预期：仅 4 个自身文件命中。然后：

```bash
git rm src/components/briefing/BriefingAbstract.tsx src/components/briefing/BriefingReferences.tsx src/components/briefing/BriefingSpark.tsx src/components/BriefingHistoryDrawer.tsx
```

- [ ] **Step 2: 回归验证**

```bash
npx tsc --noEmit
npm run test
```
预期：typecheck 干净、单测全过。

- [ ] **Step 3: Commit**

```bash
git commit -m "chore(briefing): delete four dead components

BriefingAbstract/BriefingReferences/BriefingSpark/BriefingHistoryDrawer
had zero references anywhere in src/e2e/tests — remnants of an early
layout iteration."
```

---

### Task 11: 导读↔正文 hover 联动接线

**Files:**
- Modify: `src/components/briefing/AcademicBriefingLayout.tsx`
- Modify: `src/components/briefing/NewspaperBriefingLayout.tsx`
- Modify: `src/components/anthropic/AnthropicArticleReader.tsx`

**Why:** `GuideSidebar` hover 已写 store `activeChunkIndex`，`ArticleBodyChunks` 的 `activeChunkIndex`/`onChunkEnter`/`onChunkLeave` props 与 isActive 样式已存在，但三个调用方都没传——双向 hover 联动是断头的。

- [ ] **Step 1: AcademicBriefingLayout**

- import 区添加 `import { useStore } from '@/store'`
- 组件体内（`const articleBodyRef` 之后）添加：

```typescript
  const activeChunkIndex = useStore((s) => s.assistantSession?.activeChunkIndex ?? null)
  const setAssistantActiveChunk = useStore((s) => s.setAssistantActiveChunk)
```

- `ArticleBodyChunks` 调用处（:47-53）追加 props：

```tsx
            activeChunkIndex={activeChunkIndex}
            onChunkEnter={(i) => setAssistantActiveChunk(i)}
            onChunkLeave={() => setAssistantActiveChunk(null)}
```

- [ ] **Step 2: NewspaperBriefingLayout**

同 Step 1（import、两个 store 订阅、三个 props）。

- [ ] **Step 3: AnthropicArticleReader**

已 import useStore。在 `const terms = ...`（:56）之后添加同样两个订阅，`ArticleBodyChunks` 调用处（:222-228）追加同样三个 props。

- [ ] **Step 4: 回归验证**

```bash
npx tsc --noEmit
npx playwright test --config e2e/playwright.config.ts article-assistant-guide.spec.ts
```
预期：typecheck 干净、导读 E2E 无回归（hover 联动为视觉增强，无独立 E2E——已确认无既断言被影响）。

- [ ] **Step 5: Commit**

```bash
git add src/components/briefing/AcademicBriefingLayout.tsx src/components/briefing/NewspaperBriefingLayout.tsx src/components/anthropic/AnthropicArticleReader.tsx
git commit -m "feat(guide): wire guide-body hover sync

GuideSidebar already wrote activeChunkIndex and ArticleBodyChunks
already had the props and isActive styles — the three call sites just
never passed them. Hovering a guide chunk now highlights the matching
body section and vice versa."
```

---

### Task 12: 生成取消（digest + job）

**Files:**
- Modify: `src/types/index.ts`（IpcApi 加 2 个方法）
- Modify: `electron/ipc/briefing.ts`（abort 注册 + mock 延时）
- Modify: `electron/ipc/job-briefing.ts`（同上）
- Modify: `electron/lib/job-briefing.ts:631-646`（synthesis 联动外层 signal）
- Modify: `electron/preload.ts:95-102`（暴露 2 个方法）
- Modify: `src/lib/ipc.ts:70-77`（facade 加 2 个 getter）
- Modify: `src/store/index.ts`（`cancelBriefing` / `cancelJobBriefing` + 两个 generate catch 守卫 + 类型声明）
- Modify: `src/components/BriefingProgress.tsx`（取消按钮）
- Modify: `src/pages/Briefing.tsx:254-258, 320-324`（传 onCancel）
- Modify: `e2e/helpers/selectors.ts`（briefing 组加 1 条）
- Create: `e2e/specs/briefing-lifecycle.spec.ts`

**Why:** digest 生成最长 300s、job 生成数分钟，用户只能干等或杀应用。违反项目规则 feature-development §10。

- [ ] **Step 1: IpcApi 类型**

`src/types/index.ts` 的 `IpcApi` 中 `briefingDelete` 声明之后添加：

```typescript
  briefingAbort: () => Promise<void>
```

`jobBriefingDelete` 声明之后添加：

```typescript
  jobBriefingAbort: () => Promise<void>
```

- [ ] **Step 2: briefing.ts abort 注册 + mock 延时**

`electron/ipc/briefing.ts` module 级（`registerBriefingIpc` 之前）添加：

```typescript
let activeGenerateAbort: AbortController | null = null
```

`briefing:generate` handler 中，缓存命中分支之后、E2E mock 快路径之前插入：

```typescript
    const genCtl = new AbortController()
    activeGenerateAbort = genCtl
```

并把 mock 快路径与真实路径整体包入 `try { ... } finally { if (activeGenerateAbort === genCtl) activeGenerateAbort = null }`。

mock 快路径内（`emitProgress('fetching', 'MOCK')` 之后、其余 emit 之前）插入：

```typescript
      const delayMs = Number(process.env.E2E_BRIEFING_MOCK_DELAY_MS ?? 0)
      if (delayMs > 0) {
        await new Promise<void>((resolve, reject) => {
          const t = setTimeout(resolve, delayMs)
          genCtl.signal.addEventListener('abort', () => {
            clearTimeout(t)
            reject(new Error('BRIEFING_ABORTED'))
          })
        })
      }
```

真实路径中：
- `Promise.all([...])` 抓取之后（`emitProgress('fetching')` 之前）插入：

```typescript
    if (genCtl.signal.aborted) throw new Error('BRIEFING_ABORTED')
```

- `const llmCtl = new AbortController()`（:426）之后插入：

```typescript
    genCtl.signal.addEventListener('abort', () => llmCtl.abort())
```

- 两处 `catch (err) { throw new Error(\`LLM_ERROR: ...\`) }`（:440-442, :465-467）改为：

```typescript
      } catch (err) {
        if (genCtl.signal.aborted) throw new Error('BRIEFING_ABORTED')
        throw new Error(`LLM_ERROR: ${err instanceof Error ? err.message : String(err)}`)
      }
```

handler 末尾（`briefing:list` 之前）添加：

```typescript
  ipcMain.handle('briefing:abort', async () => {
    activeGenerateAbort?.abort()
  })
```

- [ ] **Step 3: job-briefing.ts abort 注册 + mock 延时**

`electron/ipc/job-briefing.ts` module 级添加：

```typescript
let activeJobAbort: AbortController | null = null
```

`job-briefing:generate` handler 中，缓存命中分支之后、mock 快路径之前插入：

```typescript
    const genCtl = new AbortController()
    activeJobAbort = genCtl
```

mock 与真实路径包入 `try { ... } finally { if (activeJobAbort === genCtl) activeJobAbort = null }`。

mock 快路径内（`emitProgress('scanning-events', 'MOCK')` 之后）插入与 Task 12 Step 2 相同的延时块，env 名改为 `E2E_JOB_BRIEFING_MOCK_DELAY_MS`，reject 错误为 `new Error('JOB_ABORTED')`。

真实路径调用处（:164-170）改为：

```typescript
    try {
      return await generateJobBriefing(cfg, config, profile, date, {
        emitProgress: (stage, detail) => emitProgress(stage, detail),
        signal: genCtl.signal,
      })
    } catch (err: any) {
      if (genCtl.signal.aborted) throw new Error('JOB_ABORTED')
      throw new Error(`JOB_${toJobErrorCode(err)}`)
    }
```

handler 末尾添加：

```typescript
  ipcMain.handle('job-briefing:abort', async () => {
    activeJobAbort?.abort()
  })
```

- [ ] **Step 4: job-briefing lib synthesis 联动**

`electron/lib/job-briefing.ts:631-646`（synthesis 段），在 `const synthesisCtl = new AbortController()` 之后、`try` 之前插入：

```typescript
  if (opts.signal?.aborted) throw new Error('ABORTED')
  const onOuterAbort = () => synthesisCtl.abort()
  opts.signal?.addEventListener('abort', onOuterAbort)
```

catch 块（:641-643）改为：

```typescript
  } catch (err) {
    if (opts.signal?.aborted) throw new Error('ABORTED')
    const code = toJobErrorCode(err)
    throw Object.assign(new Error(code), { code: code as JobErrorCode })
  } finally {
    clearTimeout(synthesisTimeout)
    opts.signal?.removeEventListener('abort', onOuterAbort)
  }
```

- [ ] **Step 5: preload + facade**

`electron/preload.ts`（:97 `briefingDelete` 之后）添加：

```typescript
  briefingAbort: () => ipcRenderer.invoke('briefing:abort'),
```

（:102 `jobBriefingDelete` 之后）添加：

```typescript
  jobBriefingAbort: () => ipcRenderer.invoke('job-briefing:abort'),
```

`src/lib/ipc.ts`（:72 `briefingDelete` getter 之后）添加：

```typescript
  get briefingAbort() { return ensure().briefingAbort },
```

（:76 `jobBriefingDelete` getter 之后）添加：

```typescript
  get jobBriefingAbort() { return ensure().jobBriefingAbort },
```

- [ ] **Step 6: store actions + catch 守卫**

类型声明区（`deleteBriefings` 声明附近）添加：

```typescript
cancelBriefing: () => void
cancelJobBriefing: () => void
```

实现区（`deleteBriefings` 实现之后）添加：

```typescript
  cancelBriefing: () => {
    if (!get().briefing.loading) return
    ipc.briefingAbort()
    set({ briefing: { result: null, loading: false, error: null }, briefingStage: null })
  },

  cancelJobBriefing: () => {
    if (!get().jobBriefing.loading) return
    ipc.jobBriefingAbort()
    set({ jobBriefing: { result: null, loading: false, error: null }, jobBriefingStage: null })
  },
```

`generateBriefing` 的 catch（:591）开头添加：

```typescript
      if (raw.includes('BRIEFING_ABORTED')) return
```

`generateJobBriefing` 的 catch（:640）开头添加：

```typescript
      if (raw.includes('JOB_ABORTED')) return
```

- [ ] **Step 7: BriefingProgress 取消按钮**

`src/components/BriefingProgress.tsx`：
- Props 改为 `interface Props { stage: BriefingStage; onCancel?: () => void }`，函数签名同步
- 最外层 div 的 `{/* stages 列表 */}` 闭合后（`</div>` 收尾前）添加：

```tsx
      {onCancel && (
        <button
          data-testid="briefing-cancel-button"
          onClick={onCancel}
          className={`mt-8 text-sm underline underline-offset-4 ${
            isAcademic ? 'text-parchment/50 hover:text-parchment' : 'text-[#6b5d52] hover:text-[#1a1a1a]'
          }`}
        >
          取消生成
        </button>
      )}
```

- [ ] **Step 8: Briefing.tsx 传入 onCancel**

- store 订阅区（`const deleteJobBriefings = ...` 之后）添加：

```typescript
  const cancelBriefing = useStore((s) => s.cancelBriefing)
  const cancelJobBriefing = useStore((s) => s.cancelJobBriefing)
```

- job 加载分支（:255）`<BriefingProgress stage={jobStage} />` 改为 `<BriefingProgress stage={jobStage} onCancel={cancelJobBriefing} />`
- digest 加载分支（:321）`<BriefingProgress stage={stage} />` 改为 `<BriefingProgress stage={stage} onCancel={cancelBriefing} />`

- [ ] **Step 9: selector + E2E**

`e2e/helpers/selectors.ts` 的 `briefing` 组内添加：

```typescript
    cancelButton: '[data-testid="briefing-cancel-button"]',
```

新建 `e2e/specs/briefing-lifecycle.spec.ts`：

```typescript
import { test, expect } from '../fixtures/electron'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { CoverPage } from '../pages/CoverPage'
import { SELECTORS } from '../helpers/selectors'

function localToday(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

test.describe('@p1 digest 生成取消', () => {
  test.use({ extraEnv: { E2E_BRIEFING_MOCK_DELAY_MS: '8000' } })

  test('生成中点取消 → 回到未生成态且不写缓存', async ({ window, testLibraryPath }) => {
    const today = localToday()
    const cover = new CoverPage(window)
    await cover.enterName('E2E 测试员')
    await cover.goToBriefing()
    await expect(window.locator(SELECTORS.briefing.sourceSidebar)).toBeVisible({ timeout: 10000 })

    await window.locator(SELECTORS.briefing.receiveDigestButton).click()
    await expect(window.locator(SELECTORS.briefing.progress)).toBeVisible({ timeout: 10000 })
    await window.locator(SELECTORS.briefing.cancelButton).click()

    await expect(window.locator(SELECTORS.briefing.progress)).toHaveCount(0, { timeout: 10000 })
    await expect(window.locator(SELECTORS.briefing.receiveDigestButton)).toBeVisible()

    // mock 延时 8s：确认取消后不会迟到写入缓存
    await window.waitForTimeout(9000)
    expect(fs.existsSync(path.join(testLibraryPath, '夜航简报', `夜航简报-${today}.md`))).toBe(false)
  })
})

test.describe('@p1 job 生成取消', () => {
  test.use({ extraEnv: { E2E_JOB_BRIEFING_MOCK_DELAY_MS: '8000' } })

  test('生成中点取消 → 回到未生成态且不写缓存', async ({ window, testLibraryPath }) => {
    const today = localToday()
    const cover = new CoverPage(window)
    await cover.enterName('E2E 测试员')
    await cover.goToBriefing()
    await expect(window.locator(SELECTORS.briefing.sourceSidebar)).toBeVisible({ timeout: 10000 })
    await window.locator(SELECTORS.briefing.sourceJobBriefingButton).click()

    await window.locator(SELECTORS.briefing.receiveJobButton).click()
    await expect(window.locator(SELECTORS.briefing.progress)).toBeVisible({ timeout: 10000 })
    await window.locator(SELECTORS.briefing.cancelButton).click()

    await expect(window.locator(SELECTORS.briefing.progress)).toHaveCount(0, { timeout: 10000 })
    await expect(window.locator(SELECTORS.briefing.receiveJobButton)).toBeVisible()

    await window.waitForTimeout(9000)
    expect(fs.existsSync(path.join(testLibraryPath, '求职简报', `求职简报-${today}.md`))).toBe(false)
  })
})
```

- [ ] **Step 10: 运行验证**

```bash
npx tsc --noEmit
npx playwright test --config e2e/playwright.config.ts briefing-lifecycle.spec.ts
npx playwright test --config e2e/playwright.config.ts briefing-generation.spec.ts job-briefing-generation.spec.ts
```
预期：取消用例 PASS；无延时的普通 mock 生成用例无回归（`E2E_*_MOCK_DELAY_MS` 未设时 delayMs=0 走原路径）。

- [ ] **Step 11: Commit**

```bash
git add src/types/index.ts electron/ipc/briefing.ts electron/ipc/job-briefing.ts electron/lib/job-briefing.ts electron/preload.ts src/lib/ipc.ts src/store/index.ts src/components/BriefingProgress.tsx src/pages/Briefing.tsx e2e/helpers/selectors.ts e2e/specs/briefing-lifecycle.spec.ts
git commit -m "feat(briefing): cancellable generation for digest and job briefing

New briefing:abort / job-briefing:abort IPC wired to per-run
AbortControllers (linked into LLM and synthesis signals). Store exposes
cancelBriefing/cancelJobBriefing; BriefingProgress renders a cancel
button. Abort rejections are classified (BRIEFING_ABORTED/JOB_ABORTED)
and swallowed instead of surfacing as errors. E2E uses
E2E_*_MOCK_DELAY_MS to make the mock path slow enough to cancel."
```

---

## Phase 4：E2E 补盲

### Task 13: mock 计数器 + 缓存命中真验证

**Files:**
- Modify: `electron/ipc/briefing.ts`（mock 快路径）
- Modify: `electron/ipc/job-briefing.ts`（mock 快路径）
- Modify: `e2e/specs/briefing-lifecycle.spec.ts`（新增 digest 缓存用例）
- Modify: `e2e/specs/job-briefing-generation.spec.ts`（修复假绿用例）

**Why:** job「缓存复用」用例断言「文件字节不变」，但 mock 是确定性的——重新生成也得到相同字节，缓存命中路径实际未被验证（假绿）。计数器让「是否走了生成」可观测。

- [ ] **Step 1: 计数器 helper（两个 ipc 文件各自加模块私有函数）**

`electron/ipc/briefing.ts` 与 `electron/ipc/job-briefing.ts` 各添加（模块级）：

```typescript
function bumpMockCounter(dir: string, name: string): void {
  try {
    const p = path.join(dir, name)
    let n = 0
    if (fs.existsSync(p)) {
      n = Number(JSON.parse(fs.readFileSync(p, 'utf8')).count ?? 0) || 0
    }
    fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(p, JSON.stringify({ count: n + 1 }), 'utf8')
  } catch {
    // counter is best-effort for E2E observability
  }
}
```

- [ ] **Step 2: 两个 mock 快路径调用计数器**

`electron/ipc/briefing.ts` mock 快路径中，缓存文件写入（`fs.writeFileSync(filePath, ...)` 的 try 块）之后添加：

```typescript
      if (process.env.E2E_CONFIG_DIR) {
        bumpMockCounter(process.env.E2E_CONFIG_DIR, 'briefing-mock-count.json')
      }
```

`electron/ipc/job-briefing.ts` mock 快路径中同样位置添加：

```typescript
      if (e2eDir) {
        bumpMockCounter(e2eDir, 'job-briefing-mock-count.json')
      }
```

（job 文件已有 `const e2eDir = process.env.E2E_CONFIG_DIR`，复用。）

- [ ] **Step 3: digest 缓存命中用例**

`e2e/specs/briefing-lifecycle.spec.ts` 末尾新增：

```typescript
test.describe('@p1 digest 缓存命中', () => {
  test('第二次进入走缓存，不再触发生成（mock 计数=1）', async ({ window, testLibraryPath, testConfigDir }) => {
    const cover = new CoverPage(window)
    await cover.enterName('E2E 测试员')
    await cover.goToBriefing()
    await expect(window.locator(SELECTORS.briefing.sourceSidebar)).toBeVisible({ timeout: 10000 })
    await window.locator(SELECTORS.briefing.receiveDigestButton).click()
    await expect(window.locator(SELECTORS.briefing.academicLayout)).toBeVisible({ timeout: 15000 })

    // reload 后再次进入——应命中磁盘缓存而非重新生成
    await window.reload()
    const cover2 = new CoverPage(window)
    await cover2.enterIfNeeded('E2E 测试员')
    await cover2.goToBriefing()
    await expect(window.locator(SELECTORS.briefing.sourceSidebar)).toBeVisible({ timeout: 10000 })
    await window.locator(SELECTORS.briefing.receiveDigestButton).click()
    await expect(window.locator(SELECTORS.briefing.academicLayout)).toBeVisible({ timeout: 15000 })

    const counter = JSON.parse(
      fs.readFileSync(path.join(testConfigDir, 'briefing-mock-count.json'), 'utf8')
    )
    expect(counter.count).toBe(1)
  })
})
```

- [ ] **Step 4: 修复 job 假绿用例**

`e2e/specs/job-briefing-generation.spec.ts` 的 `reuses cached briefing on second generation` 用例：
- 函数签名 fixture 参数加 `testConfigDir`
- 末尾「文件字节不变」断言之后添加：

```typescript
  // 计数器是真凭据：mock 确定性意味着重生成也会得到相同字节
  const counter = JSON.parse(
    fs.readFileSync(path.join(testConfigDir, 'job-briefing-mock-count.json'), 'utf8')
  )
  expect(counter.count).toBe(1)
```

- [ ] **Step 5: 运行验证**

```bash
npx playwright test --config e2e/playwright.config.ts briefing-lifecycle.spec.ts job-briefing-generation.spec.ts
```
预期：全部 PASS。

- [ ] **Step 6: Commit**

```bash
git add electron/ipc/briefing.ts electron/ipc/job-briefing.ts e2e/specs/briefing-lifecycle.spec.ts e2e/specs/job-briefing-generation.spec.ts
git commit -m "test(e2e): make cache-hit observable via mock generation counter

Mock fast paths now bump a counter file in E2E_CONFIG_DIR on each actual
generation. New digest test and the fixed job test assert count=1 after
two visits — previously the job test's byte-equality assertion could not
distinguish cache hit from deterministic regeneration (false green)."
```

---

### Task 14: digest 错误重试后成功

**Files:**
- Modify: `e2e/specs/briefing-lifecycle.spec.ts`

**Why:** digest 错误用例只断言重试按钮可见，从未点击验证恢复（job 源有等价用例）。

- [ ] **Step 1: 新增用例**

`e2e/specs/briefing-lifecycle.spec.ts` import 区添加 `import { seedBriefing } from '../helpers/test-library'`，末尾新增：

```typescript
test.describe('@p1 digest 错误重试', () => {
  test('NETWORK_ERROR → 点重试 → mock 生成成功', async ({ window, testLibraryPath }) => {
    seedBriefing(testLibraryPath, localToday(), '## Error\n\nBRIEFING_NETWORK_ERROR')
    const cover = new CoverPage(window)
    await cover.enterName('E2E 测试员')
    await cover.goToBriefing()
    await expect(window.locator(SELECTORS.briefing.sourceSidebar)).toBeVisible({ timeout: 10000 })

    await window.locator(SELECTORS.briefing.receiveDigestButton).click()
    await expect(window.locator(SELECTORS.briefing.errorDisplay)).toBeVisible({ timeout: 15000 })
    await expect(window.locator(SELECTORS.briefing.errorDisplay)).toContainText('信号塔暂时失联')

    await window.locator(SELECTORS.briefing.retryButton).click()
    await expect(window.locator(SELECTORS.briefing.academicLayout)).toBeVisible({ timeout: 15000 })
    await expect(window.locator(SELECTORS.briefing.errorDisplay)).toHaveCount(0)
  })
})
```

- [ ] **Step 2: 运行验证**

```bash
npx playwright test --config e2e/playwright.config.ts briefing-lifecycle.spec.ts
```
预期：全部 PASS。

- [ ] **Step 3: Commit**

```bash
git add e2e/specs/briefing-lifecycle.spec.ts
git commit -m "test(e2e): digest retry-after-error recovers via force regeneration"
```

---

### Task 15: 标注跨重启恢复

**Files:**
- Modify: `e2e/specs/article-annotations.spec.ts`

**Why:** 标注持久化此前只验证同进程内重开（A1），没有 reload 后的恢复用例。

- [ ] **Step 1: 新增用例（E2E-A6）**

`e2e/specs/article-annotations.spec.ts` 末尾新增（复用 A4 的打开 digest 与 ghost pen helper 流程）：

```typescript
test('E2E-A6: 标注跨 renderer reload 恢复', async ({ window, testLibraryPath }) => {
  const today = localToday()
  seedBriefing(testLibraryPath, today)

  const openDigest = async () => {
    const cover = new CoverPage(window)
    await cover.enterIfNeeded('E2E 测试员')
    await cover.goToBriefing()
    await window.locator(SELECTORS.briefing.receiveDigestButton).click()
    await expect(window.locator(SELECTORS.briefing.academicLayout)).toBeVisible({ timeout: 15000 })
    await window.locator(SELECTORS.briefing.markdownBody).waitFor({ state: 'visible', timeout: 15000 })
  }

  await openDigest()
  // 用 E2E helper 创建一条标注（与 A4 相同流程）
  await window.evaluate(() => {
    const body = document.querySelector('[data-testid="briefing-markdown-body"]')
    const p = body?.querySelector('p')
    if (!p || !p.textContent) throw new Error('no paragraph in digest body')
    const helper = (window as any).__e2e_triggerGhostPen as
      | ((paraEl: Element, start: number, end: number) => void)
      | undefined
    if (!helper) throw new Error('__e2e_triggerGhostPen not found')
    helper(p, 0, Math.min(15, p.textContent.length))
  })
  await expect(window.locator(SELECTORS.annotations.ghostPen)).toBeVisible({ timeout: 5000 })
  await window.locator(SELECTORS.annotations.ghostPen).click({ force: true })
  await expect(window.locator(SELECTORS.annotations.noteCard)).toBeVisible({ timeout: 5000 })
  await window.locator(SELECTORS.annotations.noteTextarea).fill('跨重启标注-唯一标识')
  await window.evaluate(() => (window as any).__e2e_saveAnnotation())
  await expect(window.locator(SELECTORS.annotations.markerPen).first()).toBeVisible({ timeout: 5000 })

  // renderer reload：内存状态全清，标注只能从磁盘恢复
  await window.reload()
  await openDigest()
  await expect(window.locator(SELECTORS.annotations.markerPen).first()).toBeVisible({ timeout: 15000 })
})
```

（若该文件尚无 `CoverPage` import 则补齐；`SELECTORS.briefing.markdownBody` 已存在于 selectors。）

- [ ] **Step 2: 运行验证**

```bash
npx playwright test --config e2e/playwright.config.ts article-annotations.spec.ts -g "A6"
```
预期：PASS。

- [ ] **Step 3: Commit**

```bash
git add e2e/specs/article-annotations.spec.ts
git commit -m "test(e2e): verify annotations survive renderer reload"
```

---

### Task 16: 主题跨重启持久化

**Files:**
- Modify: `e2e/specs/briefing-ux-optimization.spec.ts`

**Why:** 字号持久化已测（stopApp/startApp 真重启模式），`briefingTheme` 的重启恢复未测。

- [ ] **Step 1: 新增用例**

`e2e/specs/briefing-ux-optimization.spec.ts` 末尾新增（复用该文件的 beforeEach/afterEach 与 startApp/stopApp 模式）：

```typescript
test('theme toggle persists across restart @smoke', async () => {
  const today = localToday()
  seedBriefing(testLibraryPath, today)
  const coverPage = new CoverPage(window)
  await coverPage.gotoBriefing()
  await window.locator(SELECTORS.briefing.receiveDigestButton).click()
  await expect(window.locator(SELECTORS.briefing.academicLayout)).toBeVisible({ timeout: 15000 })

  await window.locator(SELECTORS.briefing.themeToggle).click()
  await expect(window.locator(SELECTORS.briefing.newspaperLayout)).toBeVisible()

  await stopApp(electronApp)
  const result = await startApp({ testLibraryPath, testConfigDir })
  electronApp = result.electronApp
  window = result.window

  const coverPage2 = new CoverPage(window)
  await coverPage2.gotoBriefing()
  await window.locator(SELECTORS.briefing.receiveDigestButton).click()
  await expect(window.locator(SELECTORS.briefing.newspaperLayout)).toBeVisible({ timeout: 15000 })
})
```

- [ ] **Step 2: 运行验证**

```bash
npx playwright test --config e2e/playwright.config.ts briefing-ux-optimization.spec.ts -g "theme toggle persists"
```
预期：PASS。

- [ ] **Step 3: Commit**

```bash
git add e2e/specs/briefing-ux-optimization.spec.ts
git commit -m "test(e2e): verify briefing theme persists across app restart"
```

---

### Task 17: anthropic 真实网络用例打 @real 标签

**Files:**
- Modify: `e2e/specs/anthropic-blog.spec.ts`
- Modify: `e2e/specs/anthropic-blog-ui.spec.ts`
- Modify: `e2e/README.md`

**Why:** 这两个 spec 打真实 anthropic.com（无 mock、无 @real 标签），网络抖动时假绿假红皆可能。`anthropic-blog-image.spec.ts` 是确定性 seed（1x1 PNG），不打标。

- [ ] **Step 1: 打标**

`e2e/specs/anthropic-blog.spec.ts` 与 `e2e/specs/anthropic-blog-ui.spec.ts`：把所有依赖真实网络的 `test.describe(...)` 标题加上 `@real ` 前缀（例如 `test.describe('E2E anthropic blog', ...)` → `test.describe('@real E2E anthropic blog', ...)`）。逐文件先 grep `test.describe` 确认清单，只改 describe 标题，不动用例体。

- [ ] **Step 2: README 同步**

`e2e/README.md` 的标签说明处（找到 `@real` 现有说明，约 :101 附近）补充一句：

```markdown
> `anthropic-blog.spec.ts` / `anthropic-blog-ui.spec.ts` 打真实 anthropic.com，已标记 `@real`，不在 core 套件（`@p0|@p1`）内；确定性变体见 `anthropic-blog-image.spec.ts`。
```

- [ ] **Step 3: 验证 core 套件不再包含这两个文件**

```bash
npx playwright test --config e2e/playwright.config.ts --grep "@p0|@p1" --list | grep -c anthropic-blog
```
预期：只剩 `anthropic-blog-image.spec.ts` 的用例（若其本身带 @p 标签；若为 0 也符合——确认输出中无 `anthropic-blog.spec.ts` / `anthropic-blog-ui.spec.ts` 用例）。

- [ ] **Step 4: Commit**

```bash
git add e2e/specs/anthropic-blog.spec.ts e2e/specs/anthropic-blog-ui.spec.ts e2e/README.md
git commit -m "test(e2e): tag real-network anthropic specs as @real

These specs hit anthropic.com with no mock and no tag, causing both
false greens (conditional branches silently skipped) and false reds on
network flakiness. anthropic-blog-image.spec.ts stays untagged — it is
deterministic via seeded 1x1 PNG."
```

---

## 自审清单

### 1. Spec 覆盖

| Spec 条目 | 对应 Task |
|---|---|
| §3 转入写作 | Task 4 |
| §4 单篇标注列表 | Task 5 |
| §5 级联删除 | Task 6 |
| §6 salary 渲染 | Task 7 |
| §6 cities 生效 | Task 8 |
| §6 skillKeywords 移除 | Task 9 |
| §6 死代码删除 | Task 10 |
| §6 导读联动接线 | Task 11 |
| §7.1 FEED_EMPTY/NETWORK_ERROR | Task 1 |
| §7.2 生成取消 | Task 12 |
| §7.3 选段两坑 | Task 2 |
| §7.4 searchError | Task 3 |
| §8-1 digest 历史删除 | Task 6（合并进级联删除 E2E） |
| §8-2 缓存命中真验证 | Task 13 |
| §8-3 digest 重试后成功 | Task 14 |
| §8-4 标注跨重启 | Task 15 |
| §8-5 主题跨重启 | Task 16 |
| §8-9 取消生成 | Task 12 |
| §8-10 chip 清除 | Task 2 |
| §8-11 searchError 提示 | Task 3 |
| §8-12 anthropic @real | Task 17 |

✅ 全部覆盖。

### 2. 占位符扫描

无 TBD/TODO/implement later。所有代码步骤有完整实现；E2E 用例有完整代码。

### 3. 类型一致性

- `FeedStatus`/`resolveFeedOutcome` 在 lib、briefing.ts、单测三处一致
- `runAssistantStream(history, useSearch, selection?)` 在类型声明与实现一致
- `WritingResult.value`（非 `.data`）在 transferArticleToWriting 中正确使用
- `briefingAbort`/`jobBriefingAbort` 在 types → preload → facade → store 四层一致
- 新增 testid（`transfer-to-writing`/`annotation-list-*`/`assistant-search-error*`/`briefing-cancel-button`）在组件与 selectors.ts 一致

### 4. 依赖顺序

```
Phase 1: Task 1 → Task 2 → Task 3
Phase 2: Task 4 → Task 5 → Task 6   （Task 5 依赖 Task 4 创建的按钮容器）
Phase 3: Task 7 → Task 8 → Task 9 → Task 10 → Task 11 → Task 12
Phase 4: Task 13 → Task 14 → Task 15 → Task 16 → Task 17
```

Task 12/13 都改两个 ipc 文件的 mock 快路径，顺序执行无冲突；Task 14/15/16/17 相互独立。
