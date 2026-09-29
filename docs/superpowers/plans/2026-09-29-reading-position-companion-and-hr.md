# 阅读位置修复 + 退出时落盘 + 对照持久化 + 对照分隔线按钮 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修复博客阅读位置不恢复的 bug(blocksRoot 选错 DOM 层),把写作/博客/对照三处滚动位置改为「退出时落盘」,博客对照槽跨重启恢复(含对照位置),两个对照编辑器头部加分隔线按钮。

**Architecture:** 新增 `src/lib/use-scroll-memory.ts` Hook 统一三处滚动记忆(滚动只写组件内 ref;切文档/卸载/beforeunload 三个退出点才 flush);store 旧 setter 换为 flush 动作;`lastArticleCompanion` + `articleCompanionScrollPositions` 两个新持久化字段走标准三路同步;`insertHrBelow` 抽到 lib,`WritingEditor` 开 `registerLocalAction` 通道供对照宿主调用。

**Tech Stack:** React 18 + Zustand + Milkdown v7 + Vitest(jsdom)+ Playwright E2E。

**Spec:** `docs/superpowers/specs/2026-09-29-reading-position-companion-and-hr-design.md`

## Global Constraints

- 渲染进程 lib 文件禁止引入 node 内置模块,文件头保留既有注释(ipc-state §5)。
- 组件文件只导出组件;helper 放 `src/lib/`(ui-styling §10)。
- 新持久化字段必须四处同步给默认值:`src/types/index.ts` StateJson、`electron/ipc/state.ts` DEFAULT、`src/store/index.ts` init、`e2e/helpers/test-library.ts` BASE_STATE(ipc-state §3, e2e §6)。
- 恢复 effect 一律读 `useStore.getState()` 快照,不订阅 positions 做依赖(滚动保存改它会反向触发恢复)。
- 验证只跑受影响测试:`npx vitest run <files>` + `node scripts/e2e-changed.js --run --no-retries`,禁止全量(general §9)。
- 工作区有其他会话的未提交改动,**只 git add 本计划涉及的文件**,禁止 `git stash` / `git add -A`。

---

### Task 1: scroll-memory 签名放宽为 ArrayLike\<Element\>

**Files:**
- Modify: `src/lib/scroll-memory.ts`
- Test: `tests/scroll-memory.test.ts`

**Interfaces:**
- Produces: `firstVisibleBlockIndex(container: HTMLElement, blocks: ArrayLike<Element>): number`、`scrollToBlockIndex(container: HTMLElement, blocks: ArrayLike<Element>, index: number): void`。Task 4/5/7 与 Task 2 的 Hook 都按此签名调用。

- [ ] **Step 1: 改测试——既有用例传 `root.children`,新增 NodeList/数组用例**

`tests/scroll-memory.test.ts` 全部 `firstVisibleBlockIndex(container, root)` / `scrollToBlockIndex(container, root, n)` 调用改为传 `root.children`(HTMLCollection)。追加:

```ts
it('接受 NodeList(querySelectorAll 结果)与数组', () => {
  const { container, root, setScroll } = makeDom(5)
  setScroll(75)
  const nodeList = root.querySelectorAll('p') // NodeList,非 HTMLCollection
  expect(firstVisibleBlockIndex(container, nodeList)).toBe(1)
  expect(firstVisibleBlockIndex(container, Array.from(nodeList))).toBe(1)
  scrollToBlockIndex(container, nodeList, 2)
  expect(container.scrollTop).toBe(100)
})

it('空数组 → 0,恢复为空操作', () => {
  const { container } = makeDom(0)
  expect(firstVisibleBlockIndex(container, [])).toBe(0)
  expect(() => scrollToBlockIndex(container, [], 3)).not.toThrow()
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run tests/scroll-memory.test.ts`
Expected: FAIL(TS 类型错误 / `root.children` 上无 getBoundingClientRect 直接调用的旧签名不匹配)

- [ ] **Step 3: 改实现**

`src/lib/scroll-memory.ts` 保留文件头注释,两个函数改为:

```ts
export function firstVisibleBlockIndex(container: HTMLElement, blocks: ArrayLike<Element>): number {
  if (blocks.length === 0) return 0
  const containerTop = container.getBoundingClientRect().top
  for (let i = 0; i < blocks.length; i++) {
    if (blocks[i].getBoundingClientRect().bottom > containerTop + 1) return i
  }
  return blocks.length - 1
}

export function scrollToBlockIndex(container: HTMLElement, blocks: ArrayLike<Element>, index: number): void {
  if (blocks.length === 0) return
  const i = Math.max(0, Math.min(Math.round(index), blocks.length - 1))
  const delta = blocks[i].getBoundingClientRect().top - container.getBoundingClientRect().top
  container.scrollTop += delta
}
```

文件头注释中「blocksRoot 直接子元素」措辞改为「块集合(ArrayLike,调用方决定取哪一层)」。

- [ ] **Step 4: 跑测试确认通过**

Run: `npx vitest run tests/scroll-memory.test.ts`
Expected: PASS(9 个用例)

- [ ] **Step 5: Commit**

```bash
git add src/lib/scroll-memory.ts tests/scroll-memory.test.ts
git commit -m "refactor(scroll-memory): blocksRoot 参数放宽为 ArrayLike<Element>"
```

---

### Task 2: useScrollMemory Hook(退出时落盘核心)

**Files:**
- Create: `src/lib/use-scroll-memory.ts`
- Test: `tests/use-scroll-memory.test.tsx`

**Interfaces:**
- Consumes: Task 1 的两个函数。
- Produces: `useScrollMemory(opts: ScrollMemoryOptions): { onScroll: () => void }`;`ScrollMemoryOptions = { memKey: string | null; containerRef: RefObject<HTMLElement | null>; getBlocks: () => ArrayLike<Element> | null; readSaved: (key: string) => number | undefined; flush: (key: string, blockIndex: number) => void; isCurrent: (key: string) => boolean }`。Task 4/5/7 各自实例化。

- [ ] **Step 1: 写失败测试**

`tests/use-scroll-memory.test.tsx`:

```tsx
// @vitest-environment jsdom
// 退出时落盘语义 —— src/lib/use-scroll-memory.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, act } from '@testing-library/react'
import React, { useRef } from 'react'
import { useScrollMemory } from '@/lib/use-scroll-memory'

const HEIGHT = 50

function makeLayout(container: HTMLDivElement, blocks: HTMLElement[], containerTop = 0) {
  let scrollTop = 0
  const layout = () => {
    blocks.forEach((b, i) => {
      const top = containerTop + i * HEIGHT - scrollTop
      b.getBoundingClientRect = () => ({ top, bottom: top + HEIGHT }) as DOMRect
    })
    container.getBoundingClientRect = () => ({ top: containerTop, bottom: containerTop + 100 }) as DOMRect
  }
  layout()
  Object.defineProperty(container, 'scrollTop', {
    get: () => scrollTop,
    set: (v) => { scrollTop = v; layout() },
    configurable: true,
  })
}

interface HarnessProps {
  memKey: string | null
  saved?: Record<string, number>
  flush: (key: string, index: number) => void
  isCurrent?: (key: string) => boolean
}

function Harness({ memKey, saved = {}, flush, isCurrent = () => true }: HarnessProps) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const blocksRef = useRef<HTMLElement[]>([])
  const { onScroll } = useScrollMemory({
    memKey,
    containerRef,
    getBlocks: () => blocksRef.current,
    readSaved: (k) => saved[k],
    flush,
    isCurrent,
  })
  return (
    <div
      data-testid="scroller"
      ref={(el) => {
        containerRef.current = el
        if (el && blocksRef.current.length === 0) {
          for (let i = 0; i < 6; i++) {
            const b = document.createElement('p')
            el.appendChild(b)
            blocksRef.current.push(b)
          }
          makeLayout(el, blocksRef.current)
        }
      }}
      onScroll={onScroll}
    />
  )
}

describe('use-scroll-memory', () => {
  beforeEach(() => { vi.useFakeTimers() })
  afterEach(() => { vi.useRealTimers() })

  it('滚动只写 ref:400ms 防抖过后 flush 仍不调用', () => {
    const flush = vi.fn()
    const { getByTestId } = render(<Harness memKey="a.md" flush={flush} />)
    const scroller = getByTestId('scroller')
    act(() => {
      scroller.scrollTop = 100
      scroller.dispatchEvent(new Event('scroll'))
      vi.advanceTimersByTime(500)
    })
    expect(flush).not.toHaveBeenCalled()
  })

  it('卸载(退出点)把待存位置 flush 出去', () => {
    const flush = vi.fn()
    const { getByTestId, unmount } = render(<Harness memKey="a.md" flush={flush} />)
    const scroller = getByTestId('scroller')
    act(() => {
      scroller.scrollTop = 100 // 首可见块 = 2
      scroller.dispatchEvent(new Event('scroll'))
      vi.advanceTimersByTime(500)
    })
    unmount()
    expect(flush).toHaveBeenCalledWith('a.md', 2)
  })

  it('切文档 key A→B:flush 用旧 key A', () => {
    const flush = vi.fn()
    const { getByTestId, rerender } = render(<Harness memKey="a.md" flush={flush} />)
    const scroller = getByTestId('scroller')
    act(() => {
      scroller.scrollTop = 100
      scroller.dispatchEvent(new Event('scroll'))
      vi.advanceTimersByTime(500)
    })
    rerender(<Harness memKey="b.md" flush={flush} />)
    expect(flush).toHaveBeenCalledWith('a.md', 2)
  })

  it('防抖窗内 isCurrent=false(文档已切走)则丢弃本次记录', () => {
    const flush = vi.fn()
    const { getByTestId, unmount } = render(
      <Harness memKey="a.md" flush={flush} isCurrent={() => false} />
    )
    const scroller = getByTestId('scroller')
    act(() => {
      scroller.scrollTop = 100
      scroller.dispatchEvent(new Event('scroll'))
      vi.advanceTimersByTime(500)
    })
    unmount()
    expect(flush).not.toHaveBeenCalled()
  })

  it('beforeunload(窗口关闭/刷新)落盘', () => {
    const flush = vi.fn()
    const { getByTestId } = render(<Harness memKey="a.md" flush={flush} />)
    const scroller = getByTestId('scroller')
    act(() => {
      scroller.scrollTop = 100
      scroller.dispatchEvent(new Event('scroll'))
      vi.advanceTimersByTime(500)
    })
    act(() => { window.dispatchEvent(new Event('beforeunload')) })
    expect(flush).toHaveBeenCalledWith('a.md', 2)
  })

  it('恢复:saved=2 时轮询把容器滚到块 2', () => {
    const flush = vi.fn()
    const { getByTestId } = render(<Harness memKey="a.md" saved={{ 'a.md': 2 }} flush={flush} />)
    const scroller = getByTestId('scroller')
    act(() => { vi.advanceTimersByTime(150) })
    expect(scroller.scrollTop).toBe(100)
  })

  it('memKey 为 null:不恢复、滚动不记录', () => {
    const flush = vi.fn()
    const { getByTestId, unmount } = render(
      <Harness memKey={null} saved={{ 'a.md': 2 }} flush={flush} />
    )
    const scroller = getByTestId('scroller')
    act(() => {
      vi.advanceTimersByTime(150)
      scroller.scrollTop = 100
      scroller.dispatchEvent(new Event('scroll'))
      vi.advanceTimersByTime(500)
    })
    expect(scroller.scrollTop).toBe(100) // 未被恢复改写(恢复没跑,scrollTop 保持手动值)
    unmount()
    expect(flush).not.toHaveBeenCalled()
  })
})
```

注意「memKey 为 null」用例:滚动是手动设的 100,断言它不被恢复逻辑改写即可(恢复没跑就没有别的写入源);真正断言点是 flush 未调用。

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run tests/use-scroll-memory.test.tsx`
Expected: FAIL(模块不存在)

- [ ] **Step 3: 写实现**

`src/lib/use-scroll-memory.ts`:

```ts
// 注意:本文件被渲染进程使用,禁止引入 node 内置模块(ipc-state §5)。
// 滚动位置记忆 Hook(2026-09-29 设计:退出时落盘,不全程维护):
// 滚动停 400ms 只把首可见块索引算进 ref;set store + patchState 只发生在
// 切文档(effect cleanup)/组件卸载/窗口关闭(beforeunload)三个退出点。
import { useEffect, useRef, type RefObject } from 'react'
import { firstVisibleBlockIndex, scrollToBlockIndex } from './scroll-memory'

export interface ScrollMemoryOptions {
  /** 当前文档稳定 key(filePath);null = 未就绪,不恢复也不记录 */
  memKey: string | null
  containerRef: RefObject<HTMLElement | null>
  /** 取当前块集合;返回 null 或 length 0 = 块未渲染好(恢复轮询继续等) */
  getBlocks: () => ArrayLike<Element> | null
  /** 读已保存块索引 —— 必须读 getState() 快照,不能订阅(保存改它会反向触发恢复) */
  readSaved: (key: string) => number | undefined
  /** 退出点落盘:set store + 一次 patchState */
  flush: (key: string, blockIndex: number) => void
  /** 防抖窗内校验文档未切走(400ms 内切文档则丢弃本次记录) */
  isCurrent: (key: string) => boolean
}

export function useScrollMemory(opts: ScrollMemoryOptions): { onScroll: () => void } {
  const { memKey, containerRef } = opts
  // 回调经 ref 实时取,避免闭包捕获过期 props
  const optsRef = useRef(opts)
  optsRef.current = opts
  const pendingRef = useRef<{ key: string; index: number } | null>(null)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const flushPending = () => {
    const p = pendingRef.current
    pendingRef.current = null
    if (p) optsRef.current.flush(p.key, p.index)
  }

  // 恢复:等块渲染出来后滚到上次首可见块(最多等 ~2s)
  useEffect(() => {
    if (!memKey) return
    const saved = optsRef.current.readSaved(memKey)
    if (saved === undefined || saved <= 0) return
    let tries = 0
    const timer = setInterval(() => {
      const container = containerRef.current
      const blocks = optsRef.current.getBlocks()
      if (container && blocks && blocks.length > 0) {
        scrollToBlockIndex(container, blocks, saved)
        clearInterval(timer)
      } else if (++tries > 40) clearInterval(timer)
    }, 50)
    return () => clearInterval(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [memKey])

  // 退出点 1+2:切文档(cleanup 先于新 effect 跑)与组件卸载 —— 落盘待存位置
  useEffect(() => {
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current)
      flushPending()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [memKey])

  // 退出点 3:窗口关闭/刷新 —— fire-and-forget(主进程存活,不等回包)
  useEffect(() => {
    const onUnload = () => flushPending()
    window.addEventListener('beforeunload', onUnload)
    return () => window.removeEventListener('beforeunload', onUnload)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const onScroll = () => {
    const key = optsRef.current.memKey
    if (!key) return
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => {
      if (!optsRef.current.isCurrent(key)) return // 防抖窗内文档已切走
      const container = containerRef.current
      const blocks = optsRef.current.getBlocks()
      if (container && blocks && blocks.length > 0) {
        pendingRef.current = { key, index: firstVisibleBlockIndex(container, blocks) }
      }
    }, 400)
  }

  return { onScroll }
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `npx vitest run tests/use-scroll-memory.test.tsx`
Expected: PASS(7 个用例)

- [ ] **Step 5: Commit**

```bash
git add src/lib/use-scroll-memory.ts tests/use-scroll-memory.test.tsx
git commit -m "feat(scroll-memory): useScrollMemory Hook——滚动只写 ref,退出时落盘"
```

---

### Task 3: store——flush 三动作替换旧 setter + 新字段

**Files:**
- Modify: `src/store/index.ts`(interface ~L437-442、initial state ~L671-684、init ~L731-739、setters ~L1527-1536、article companion ~L2894-2952)
- Modify: `src/types/index.ts`(StateJson ~L656-684)
- Modify: `electron/ipc/state.ts`(DEFAULT ~L47-64)
- Modify: `e2e/helpers/test-library.ts`(BASE_STATE ~L498-501)

**Interfaces:**
- Consumes: 无。
- Produces:
  - `flushWritingScrollPosition(filePath: string, blockIndex: number): void`
  - `flushAnthropicScrollPosition(filePath: string, blockIndex: number): void`
  - `flushArticleCompanionScrollPosition(filePath: string, blockIndex: number): void`
  - state 字段 `articleCompanionScrollPositions: Record<string, number>`、`lastArticleCompanion: { mainKey: string; filePath: string } | null`
  - 本任务**新增** flush 动作与字段;旧 `setWritingScrollPosition` / `setAnthropicScrollPosition` **暂留**(两个消费方在 Task 4/5 迁完后由 Task 5 移除,保证每个 commit tsc 全绿)

- [ ] **Step 1: 确认旧 setter 的引用面(供 Task 5 移除时核对)**

Run: `grep -rn "setWritingScrollPosition\|setAnthropicScrollPosition" src tests e2e --include="*.ts" --include="*.tsx"`
Expected: 仅 `src/store/index.ts`、`src/components/writing/WritingBoard.tsx`、`src/components/anthropic/AnthropicArticleReader.tsx`

- [ ] **Step 2: types + DEFAULT + BASE_STATE 加字段**

`src/types/index.ts` StateJson(`articleCompanionMap?` 之后):

```ts
  /** 博客对照槽最后打开的对照文(✕关闭时清 null,重开应用按此恢复) */
  lastArticleCompanion?: { mainKey: string; filePath: string } | null
  /** 博客对照编辑器每文件浏览位置(filePath → 首可见块索引,粗粒度) */
  articleCompanionScrollPositions?: Record<string, number>
```

`electron/ipc/state.ts` DEFAULT(`articleCompanionMap: {},` 之后):

```ts
  lastArticleCompanion: null,
  articleCompanionScrollPositions: {},
```

`e2e/helpers/test-library.ts` BASE_STATE(`anthropicScrollPositions: {},` 之后):

```ts
  lastArticleCompanion: null,
  articleCompanionScrollPositions: {},
```

- [ ] **Step 3: store interface + initial + init**

interface(`anthropicScrollPositions` 声明附近,旧 `setWritingScrollPosition` / `setAnthropicScrollPosition` 声明保留)加:

```ts
  /** 博客对照编辑器每文件浏览位置(filePath → 首可见块索引,粗粒度) */
  articleCompanionScrollPositions: Record<string, number>
  /** 博客对照槽最后打开的对照文(✕关闭时清 null) */
  lastArticleCompanion: { mainKey: string; filePath: string } | null
  /** 退出点落盘:set + 一次 patchState(滚动中不调用,见 use-scroll-memory) */
  flushWritingScrollPosition: (filePath: string, blockIndex: number) => void
  flushAnthropicScrollPosition: (filePath: string, blockIndex: number) => void
  flushArticleCompanionScrollPosition: (filePath: string, blockIndex: number) => void
```

initial state(`anthropicScrollPositions: {},` 后)加 `articleCompanionScrollPositions: {},`;(`articleCompanion: null,` 后)加 `lastArticleCompanion: null,`。

init(`anthropicScrollPositions: state.anthropicScrollPositions ?? {},` 后):

```ts
      articleCompanionScrollPositions: state.articleCompanionScrollPositions ?? {},
      lastArticleCompanion: state.lastArticleCompanion ?? null,
```

- [ ] **Step 4: 新增 flush 实现(旧 setter 实现不动)**

在旧 `setAnthropicScrollPosition` 实现之后追加:

```ts
  flushWritingScrollPosition: (filePath, blockIndex) => {
    const next = { ...get().writingScrollPositions, [filePath]: blockIndex }
    set({ writingScrollPositions: next })
    void ipc.patchState({ writingScrollPositions: next } as Partial<StateJson>)
  },
  flushAnthropicScrollPosition: (filePath, blockIndex) => {
    const next = { ...get().anthropicScrollPositions, [filePath]: blockIndex }
    set({ anthropicScrollPositions: next })
    void ipc.patchState({ anthropicScrollPositions: next } as Partial<StateJson>)
  },
  flushArticleCompanionScrollPosition: (filePath, blockIndex) => {
    const next = { ...get().articleCompanionScrollPositions, [filePath]: blockIndex }
    set({ articleCompanionScrollPositions: next })
    void ipc.patchState({ articleCompanionScrollPositions: next } as Partial<StateJson>)
  },
```

- [ ] **Step 5: lastArticleCompanion 写入/清除**

`selectArticleCompanion` 成功分支(`set({ articleCompanion: {...} })` 处)改为:

```ts
      set({ articleCompanion: { key: mainKey, filePath, kind, body, readonly, dirty: false, saving: 'idle' }, lastArticleCompanion: { mainKey, filePath } })
      void ipc.patchState({ lastArticleCompanion: { mainKey, filePath } } as Partial<StateJson>)
```

失败分支(catch 内清 map 处)改为:

```ts
      const cleanMap = { ...get().articleCompanionMap }
      delete cleanMap[mainKey]
      const clearLac = get().lastArticleCompanion?.mainKey === mainKey
      set({ articleCompanionMap: cleanMap, articleCompanion: null, ...(clearLac ? { lastArticleCompanion: null } : {}) })
      ipc.patchState({ articleCompanionMap: cleanMap, ...(clearLac ? { lastArticleCompanion: null } : {}) } as Partial<StateJson>)
```

`closeArticleCompanion`:

```ts
  closeArticleCompanion: async () => {
    if (get().articleCompanion?.dirty) await get().saveArticleCompanion()
    set({ articleCompanion: null, lastArticleCompanion: null })
    void ipc.patchState({ lastArticleCompanion: null } as Partial<StateJson>)
  },
```

- [ ] **Step 6: 类型检查 + 受影响单测**

Run: `npx tsc --noEmit`
Expected: PASS(纯新增,无报错)
Run: `npx vitest run tests/safe-json.test.ts`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add src/store/index.ts src/types/index.ts electron/ipc/state.ts e2e/helpers/test-library.ts
git commit -m "feat(state): 滚动 flush 三动作(退出时落盘)+ lastArticleCompanion/articleCompanionScrollPositions 字段"
```

---

### Task 4: WritingBoard 接入 useScrollMemory

**Files:**
- Modify: `src/components/writing/WritingBoard.tsx:1-65`

**Interfaces:**
- Consumes: `useScrollMemory`(Task 2)、`flushWritingScrollPosition`(Task 3)。

- [ ] **Step 1: 改造**

- import 删 `firstVisibleBlockIndex, scrollToBlockIndex`,加 `import { useScrollMemory } from '@/lib/use-scroll-memory'`。
- 删 `setWritingScrollPosition` 订阅、`scrollSaveTimer` ref、原恢复 effect(L34-49)、原 `onEditorScroll`(L53-64)及其清理 effect。
- 组件内加:

```tsx
  const { onScroll: onEditorScroll } = useScrollMemory({
    memKey: file?.kind === 'md' ? file.path : null,
    containerRef: editorScrollRef,
    getBlocks: () => (editorScrollRef.current?.querySelector('.ProseMirror') as HTMLElement | null)?.children ?? null,
    readSaved: (k) => useStore.getState().writingScrollPositions[k],
    flush: (k, i) => useStore.getState().flushWritingScrollPosition(k, i),
    isCurrent: (k) => useStore.getState().writingFile?.path === k,
  })
```

滚动容器 div 的 `onScroll={onEditorScroll}` 保持不变。

- [ ] **Step 2: 类型检查 + 受影响单测**

Run: `npx tsc --noEmit`
Expected: PASS(旧 setter 仍在,AnthropicArticleReader 不报错)
Run: `npx vitest run tests/writing-list-enter.test.ts tests/writing-list-backspace.test.ts`
Expected: PASS(编辑器行为回归)

- [ ] **Step 3: Commit**

```bash
git add src/components/writing/WritingBoard.tsx
git commit -m "refactor(writing): WritingBoard 滚动位置接 useScrollMemory(退出时落盘)"
```

---

### Task 5: AnthropicArticleReader 修复 blocksRoot bug + 接入 Hook

**Files:**
- Modify: `src/components/anthropic/AnthropicArticleReader.tsx:1-20,85-160,262`
- Modify: `src/store/index.ts`(Step 2:移除旧 `setWritingScrollPosition` / `setAnthropicScrollPosition`)

**Interfaces:**
- Consumes: `useScrollMemory`、`flushAnthropicScrollPosition`。
- Produces: 滚动容器新增 `data-testid="anthropic-reader-scroll"`(Task 9 E2E 依赖)。

- [ ] **Step 1: 改造**

- import 删 `firstVisibleBlockIndex, scrollToBlockIndex`,加 `import { useScrollMemory } from '@/lib/use-scroll-memory'`。
- 删 `setAnthropicScrollPosition` 订阅、`scrollSaveTimer` ref、原恢复 effect(L131-146)、原 `onReaderScroll`(L149-159)及清理 effect。
- 组件内加:

```tsx
  const { onScroll: onReaderScroll } = useScrollMemory({
    memKey: scrollMemoryKey ?? null,
    containerRef: scrollContainerRef,
    // bug 修复:块集合取 .md-body 直接子元素(跨章节全局索引);原实现用 <article>
    // 直接子元素,只有 1 个包裹 div,首可见块恒为 0 → 存 0 → 恢复跳过 → 回顶部
    getBlocks: () => articleBodyRef.current?.querySelectorAll('.md-body > *') ?? null,
    readSaved: (k) => useStore.getState().anthropicScrollPositions[k],
    flush: (k, i) => useStore.getState().flushAnthropicScrollPosition(k, i),
    isCurrent: (k) => useStore.getState().anthropicReaderFilePath === k,
  })
```

- 滚动容器 div(L262)加 `data-testid="anthropic-reader-scroll"`,`onScroll={onReaderScroll}` 保留。

- [ ] **Step 2: 移除旧 setter(两个消费方均已迁完)**

`src/store/index.ts`:删 interface 中 `setWritingScrollPosition` / `setAnthropicScrollPosition` 声明与对应实现(引用面已在 Task 3 Step 1 核对,无其他使用方)。

- [ ] **Step 3: 类型检查**

Run: `npx tsc --noEmit`
Expected: PASS(无报错)

- [ ] **Step 4: Commit**

```bash
git add src/components/anthropic/AnthropicArticleReader.tsx src/store/index.ts
git commit -m "fix(blog): 阅读位置块容器改 .md-body>* 修复恒存 0 回顶部 + 接 useScrollMemory;旧滚动 setter 移除"
```

---

### Task 6: ArticleCompanionBoard 接入 Hook(对照位置记忆)

**Files:**
- Modify: `src/components/article-assistant/ArticleCompanionBoard.tsx`

**Interfaces:**
- Consumes: `useScrollMemory`、`flushArticleCompanionScrollPosition`。
- Produces: 对照编辑滚动容器 `data-testid="article-companion-editor-scroll"`(Task 9 E2E 依赖)。

- [ ] **Step 1: 改造**

- import 加 `useRef`、`useScrollMemory`。
- 在 autosave effect 旁(必须在 `if (!file)` 早退之前)加:

```tsx
  const companionScrollRef = useRef<HTMLDivElement | null>(null)
  const { onScroll: onCompanionScroll } = useScrollMemory({
    memKey: file && file.kind === 'md' && !file.readonly ? file.filePath : null,
    containerRef: companionScrollRef,
    getBlocks: () => (companionScrollRef.current?.querySelector('.ProseMirror') as HTMLElement | null)?.children ?? null,
    readSaved: (k) => useStore.getState().articleCompanionScrollPositions[k],
    flush: (k, i) => useStore.getState().flushArticleCompanionScrollPosition(k, i),
    isCurrent: (k) => useStore.getState().articleCompanion?.filePath === k,
  })
```

- md 可编辑分支的滚动 div 加 `ref={companionScrollRef} onScroll={onCompanionScroll} data-testid="article-companion-editor-scroll"`。

- [ ] **Step 2: 类型检查**

Run: `npx tsc --noEmit`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/components/article-assistant/ArticleCompanionBoard.tsx
git commit -m "feat(blog): 对照编辑器滚动位置记忆(退出时落盘,仅 md 可编辑态)"
```

---

### Task 7: BlogPanel 重启恢复对照槽

**Files:**
- Modify: `src/components/anthropic/AnthropicBlogPanel.tsx:127-139`

**Interfaces:**
- Consumes: `lastArticleCompanion`、`selectArticleCompanion`(Task 3)。

- [ ] **Step 1: 改造**

恢复 effect 中 `if (stillThere) void openReader(lastAnthropicReaderFile)` 改为:

```ts
    if (stillThere) {
      void openReader(lastAnthropicReaderFile)
      // 对照槽恢复(2026-09-29 spec):只恢复「退出时还开着」的对照——
      // lastArticleCompanion 在 ✕ closeArticleCompanion 时已清 null,关过的不会被重新拉开
      const lac = useStore.getState().lastArticleCompanion
      if (lac && lac.mainKey === lastAnthropicReaderFile) {
        void useStore.getState().selectArticleCompanion('anthropic', lac.mainKey, lac.filePath)
      }
    }
```

- [ ] **Step 2: 类型检查**

Run: `npx tsc --noEmit`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/components/anthropic/AnthropicBlogPanel.tsx
git commit -m "feat(blog): 重启恢复上次打开的对照文(lastArticleCompanion)"
```

---

### Task 8: insertHrBelow 抽 lib + WritingEditor registerLocalAction + 两个对照分隔线按钮

**Files:**
- Create: `src/lib/milkdown-insert-hr.ts`
- Modify: `src/components/writing/WritingToolbar.tsx:1-63`(删本地 insertHrBelow,改 import)
- Modify: `src/components/writing/WritingEditor.tsx:29-112`(新 prop)
- Modify: `src/components/writing/CompanionBoard.tsx`(按钮)
- Modify: `src/components/article-assistant/ArticleCompanionBoard.tsx`(按钮)
- Test: `tests/writing-orbit-hr.test.ts`(现有,回归)

**Interfaces:**
- Consumes: `insertHrCleanCommand`(`@/lib/milkdown-orbit-hr`)、`runCollapsedBlockCommand`(`@/lib/milkdown-collapse-selection`)。
- Produces:
  - `insertHrBelow(ctx: any): boolean`(`@/lib/milkdown-insert-hr`)
  - `WritingEditor` 新可选 prop `registerLocalAction?: (action: ((fn: (ctx: any) => void) => void) | null) => void`
  - 按钮 testid:`companion-insert-hr`、`article-companion-insert-hr`

- [ ] **Step 1: 抽 lib**

`src/lib/milkdown-insert-hr.ts`(从 WritingToolbar.tsx L21-63 原样搬运,补文件头注释与 import):

```ts
// 注意:本文件被渲染进程使用,禁止引入 node 内置模块(ipc-state §5)。
// 分割线插入后光标落到下一行(设计 spec §E / 2026-08-12 §4)。
// 不再用 preset-commonmark 的 insertHrCommand(其 .insert(from, 空段) 会多塞一个
// 空段落,产生「文字 → 空行 → 分隔线」);改用自建 insertHrCleanCommand(只
// replaceSelectionWith(hr))。仍复用 runCollapsedBlockCommand 折叠选区+代码块守卫。
// 光标定位:hr 前若是空段落(插入点在段首的 split 前段)则删掉避免前导空行;
// hr 下方已有内容 → 放其行首,否则补一个空段落并放光标。
// 供 WritingToolbar 与两个对照编辑器宿主(CompanionBoard/ArticleCompanionBoard)共用。
import { editorViewCtx } from '@milkdown/core'
import { Selection, TextSelection } from '@milkdown/prose/state'
import { runCollapsedBlockCommand } from './milkdown-collapse-selection'
import { insertHrCleanCommand } from './milkdown-orbit-hr'

export function insertHrBelow(ctx: any): boolean {
  const view = ctx.get(editorViewCtx)
  const insertAt = view.state.selection.head // 折叠后的插入点(runCollapsedBlockCommand 折叠到 head)
  const ok = runCollapsedBlockCommand(insertHrCleanCommand.key)(ctx)
  if (ok === false) return false
  const doc = view.state.doc
  let hrPos = -1
  doc.descendants((node: any, pos: number) => {
    if (node.type.name === 'hr' && pos >= insertAt && hrPos === -1) hrPos = pos
    return true
  })
  if (hrPos < 0) return true // 没找到新 hr,不动光标
  let tr = view.state.tr
  let hrStart = hrPos
  // hr 前若是空段落(插入点在段首的 split 前段),一并删除避免前导空行
  const prev = doc.nodeAt(hrPos - 1)
  if (prev && prev.type.name === 'paragraph' && prev.textContent.length === 0) {
    tr = tr.delete(hrPos - 1, hrPos)
    hrStart = hrPos - 1
  }
  const after = hrStart + 1 // hr nodeSize === 1 → after = hr 之后的位置
  const next = tr.doc.nodeAt(after) // hr 下方原本的节点
  let targetPos: number
  if (next) {
    targetPos = after + 1 // 下一块内容行首
  } else {
    tr = tr.replaceWith(after, after, view.state.schema.nodes.paragraph.create())
    targetPos = after + 1
  }
  try {
    tr.setSelection(TextSelection.create(tr.doc, targetPos))
  } catch {
    tr.setSelection(Selection.near(tr.doc.resolve(targetPos)))
  }
  view.dispatch(tr.scrollIntoView())
  return true
}
```

`WritingToolbar.tsx`:删本地 `insertHrBelow` 及不再用的 import(`editorViewCtx`、`Selection, TextSelection`、`runCollapsedBlockCommand`、`insertHrCleanCommand`——`insertHrCleanCommand` 只剩 insertHrBelow 用,删),加 `import { insertHrBelow } from '@/lib/milkdown-insert-hr'`。

- [ ] **Step 2: 回归测试**

Run: `npx vitest run tests/writing-orbit-hr.test.ts tests/writing-hr-caret.test.ts tests/writing-hr-navigation.test.ts`
Expected: PASS

- [ ] **Step 3: WritingEditor 加 registerLocalAction**

`EditorInner` props 类型加 `registerLocalAction?: (action: ((fn: (ctx: any) => void) => void) | null) => void`;解构同名。加 ref:

```ts
  const localActionRef = useRef(registerLocalAction)
  localActionRef.current = registerLocalAction
```

注册 effect 改为:

```ts
  useEffect(() => {
    if (!loading) {
      // onChange gate 对两种实例都必须打开（对照实例只跳过注册，不跳过 gate）
      loadedRef.current = true
      // 本地 action 通道(2026-09-29):对照宿主(CompanionBoard 等)拿自己实例的
      // action 调命令(如分隔线按钮),与全局 toolbar 单槽正交
      const action = (fn: any) => { getRef.current()?.action(fn) }
      localActionRef.current?.(action)
      const cleanupLocal = () => localActionRef.current?.(null)
      // 对照编辑器（registerAction=false）：不触碰全局 toolbar 单槽
      if (registerAction === false) return cleanupLocal
      setAction(action)
      return () => { setAction(null); cleanupLocal() }
    }
  }, [loading, setAction, registerAction])
```

`WritingEditor` 外层 props 类型加同名可选 prop 并透传给 `EditorInner`。

- [ ] **Step 4: CompanionBoard 按钮**

import 加 `useState`、`insertHrBelow`、`HrIcon`(`@/lib/writing-toolbar-icons`)。组件内:

```tsx
  const [hrAction, setHrAction] = useState<((fn: (ctx: any) => void) => void) | null>(null)
```

头部文件名 span 之后加(仅 md):

```tsx
        {file.kind === 'md' && (
          <button
            type="button"
            data-testid="companion-insert-hr"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => hrAction?.((ctx: any) => { const ok = insertHrBelow(ctx); if (ok === false) useStore.getState().showToast('当前位置不支持该操作') })}
            className="shrink-0 px-1 text-parchment/60 hover:text-parchment rounded hover:bg-parchment/10"
            title="分割线"
          >
            <HrIcon />
          </button>
        )}
```

`WritingEditor` 加 prop `registerLocalAction={setHrAction}`。

- [ ] **Step 5: ArticleCompanionBoard 按钮**

同样加 `hrAction` state;文件名 span 之后加(仅 md 且非 readonly;配色跟 cls):

```tsx
        {file.kind === 'md' && !file.readonly && (
          <button
            type="button"
            data-testid="article-companion-insert-hr"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => hrAction?.((ctx: any) => { const ok = insertHrBelow(ctx); if (ok === false) useStore.getState().showToast('当前位置不支持该操作') })}
            className={`shrink-0 px-1 rounded ${isAcademic ? 'text-parchment/60 hover:text-parchment hover:bg-parchment/10' : 'text-[#6b5d52] hover:text-[#1a1a1a] hover:bg-[#1a1a1a]/10'}`}
            title="分割线"
          >
            <HrIcon />
          </button>
        )}
```

`WritingEditor` 加 prop `registerLocalAction={setHrAction}`。

- [ ] **Step 6: 类型检查 + 回归**

Run: `npx tsc --noEmit`
Run: `npx vitest run tests/writing-orbit-hr.test.ts`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add src/lib/milkdown-insert-hr.ts src/components/writing/WritingToolbar.tsx src/components/writing/WritingEditor.tsx src/components/writing/CompanionBoard.tsx src/components/article-assistant/ArticleCompanionBoard.tsx
git commit -m "feat(companion): 两个对照编辑器头部加分隔线按钮(insertHrBelow 抽 lib + registerLocalAction 通道)"
```

---

### Task 9: E2E——新 spec anthropic-blog-reading-position + 写作对照 hr 用例

**Files:**
- Create: `e2e/specs/anthropic-blog-reading-position.spec.ts`
- Modify: `e2e/specs/writing-companion-pane.spec.ts`(追加一个 test)

**Interfaces:**
- Consumes: Task 5 的 `anthropic-reader-scroll`、Task 6 的 `article-companion-editor-scroll`、Task 8 的两个按钮 testid、`seedAnthropicArticle` / `seedStateJson` / `seedWritingTree` helpers。
- source-map:`anthropic-blog*.spec.ts` glob 已覆盖新 spec,`writing-*.spec.ts` 覆盖 companion-pane,**无需改 source-map.json**;跑 `node scripts/e2e-changed.js` 确认无孤儿 WARNING。

- [ ] **Step 1: 写新 spec**

`e2e/specs/anthropic-blog-reading-position.spec.ts`:

```ts
import { test, expect } from '../fixtures/electron'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { CoverPage } from '../pages/CoverPage'
import { SELECTORS } from '../helpers/selectors'
import { seedAnthropicArticle, seedStateJson } from '../helpers/test-library'

// 阅读位置记忆(退出时落盘)+ 对照槽重启恢复 —— docs/superpowers/specs/2026-09-29-reading-position-companion-and-hr-design.md
const PROFILE = { name: 'E2E 测试员', profile_text: '', preferred_topics: [] }
const SCROLLER = '[data-testid="anthropic-reader-scroll"]'
const COMPANION_SCROLLER = '[data-testid="article-companion-editor-scroll"]'

const longBody = (label: string) =>
  Array.from({ length: 40 }, (_, i) => `## ${label}节${i}\n\n${label} 第 ${i} 段内容,用于撑高文档。重复文本。重复文本。`).join('\n\n')

function seedBlogArticle(testLibraryPath: string, slug: string, title: string) {
  const url = `https://www.anthropic.com/engineering/${slug}`
  const filePath = seedAnthropicArticle(testLibraryPath, slug, title, longBody(title), {
    source_url: url,
    section: 'engineering',
    published_at: '2026-08-01T00:00:00.000Z',
  })
  return { url, title, summary: null, publishedAt: '2026-08-01T00:00:00.000Z', imageUrl: null, isSaved: true, filePath, section: 'engineering' }
}

function readState(testConfigDir: string) {
  return JSON.parse(fs.readFileSync(path.join(testConfigDir, 'state.json'), 'utf8'))
}

async function gotoBlog(window: any) {
  const cover = new CoverPage(window)
  await cover.goToBriefing()
  await expect(window.locator(SELECTORS.briefing.anthropicPanel)).toBeVisible({ timeout: 10000 })
}

test.describe('@p1 anthropic-blog-reading-position', () => {
  test('seed 恢复 → 滚动不连续写盘 → 切文章退出点落盘 → 切回恢复', async ({ window, testLibraryPath, testConfigDir }) => {
    const a = seedBlogArticle(testLibraryPath, 'e2e-pos-a', 'E2E Pos A')
    const b = seedBlogArticle(testLibraryPath, 'e2e-pos-b', 'E2E Pos B')
    seedStateJson(testConfigDir, {
      profile: PROFILE,
      briefingSource: 'anthropic',
      anthropicBlogCache: { lastFetchedAt: new Date().toISOString(), articles: [a, b], loading: false, error: null, sectionStatus: {} },
      lastAnthropicReaderFile: a.filePath,
      anthropicScrollPositions: { [a.filePath]: 6 },
    })
    await gotoBlog(window)

    // 重启恢复:文章自动打开且滚动位置 > 0(原 bug:恒回顶部)
    await expect(window.locator(SELECTORS.briefing.anthropicReader)).toBeVisible({ timeout: 10000 })
    const scroller = window.locator(SCROLLER)
    await expect.poll(() => scroller.evaluate((el: HTMLElement) => el.scrollTop), { timeout: 8000 }).toBeGreaterThan(0)

    // 滚动到新位置 → 400ms 防抖过后 state.json 仍是旧值(不连续写盘)
    await scroller.evaluate((el: HTMLElement) => { el.scrollTop = el.scrollHeight; el.dispatchEvent(new Event('scroll')) })
    await window.waitForTimeout(700)
    expect(readState(testConfigDir).anthropicScrollPositions?.[a.filePath]).toBe(6)

    // 切到 B(退出点 1:切文档落盘)→ state.json 里 A 的索引更新(>6)
    await window.locator(SELECTORS.briefing.anthropicArticleTitle).filter({ hasText: 'E2E Pos B' }).click()
    await expect(window.locator(SELECTORS.briefing.anthropicReaderTitle)).toHaveText('E2E Pos B', { timeout: 8000 })
    await expect.poll(() => readState(testConfigDir).anthropicScrollPositions?.[a.filePath]).toBeGreaterThan(6)

    // 切回 A → 位置恢复到刚才滚到的底部附近(scrollTop 明显 > 0)
    await window.locator(SELECTORS.briefing.anthropicArticleTitle).filter({ hasText: 'E2E Pos A' }).click()
    await expect(window.locator(SELECTORS.briefing.anthropicReaderTitle)).toHaveText('E2E Pos A', { timeout: 8000 })
    await expect.poll(() => scroller.evaluate((el: HTMLElement) => el.scrollTop), { timeout: 8000 }).toBeGreaterThan(0)
  })

  test('reload(beforeunload)落盘:滚动 → 刷新 → state.json 更新 → 重开后恢复', async ({ window, testLibraryPath, testConfigDir }) => {
    const a = seedBlogArticle(testLibraryPath, 'e2e-pos-c', 'E2E Pos C')
    seedStateJson(testConfigDir, {
      profile: PROFILE,
      briefingSource: 'anthropic',
      anthropicBlogCache: { lastFetchedAt: new Date().toISOString(), articles: [a], loading: false, error: null, sectionStatus: {} },
      lastAnthropicReaderFile: a.filePath,
    })
    await gotoBlog(window)
    await expect(window.locator(SELECTORS.briefing.anthropicReader)).toBeVisible({ timeout: 10000 })
    const scroller = window.locator(SCROLLER)

    await scroller.evaluate((el: HTMLElement) => { el.scrollTop = el.scrollHeight; el.dispatchEvent(new Event('scroll')) })
    await window.waitForTimeout(700) // 防抖窗过,值在 ref
    await window.reload()
    await window.waitForLoadState('domcontentloaded')

    // beforeunload 已把 ref 落盘
    await expect.poll(() => readState(testConfigDir).anthropicScrollPositions?.[a.filePath] ?? 0).toBeGreaterThan(0)

    // 重开后文章自动打开且位置恢复
    await gotoBlog(window)
    await expect(window.locator(SELECTORS.briefing.anthropicReader)).toBeVisible({ timeout: 10000 })
    await expect.poll(() => window.locator(SCROLLER).evaluate((el: HTMLElement) => el.scrollTop), { timeout: 8000 }).toBeGreaterThan(0)
  })

  test('对照槽:重启恢复对照文 + 对照滚动位置 + 对照分隔线按钮', async ({ window, testLibraryPath, testConfigDir }) => {
    const main = seedBlogArticle(testLibraryPath, 'e2e-pos-main', 'E2E Pos Main')
    const comp = seedBlogArticle(testLibraryPath, 'e2e-pos-comp', 'E2E Pos Comp')
    seedStateJson(testConfigDir, {
      profile: PROFILE,
      briefingSource: 'anthropic',
      anthropicBlogCache: { lastFetchedAt: new Date().toISOString(), articles: [main, comp], loading: false, error: null, sectionStatus: {} },
      lastAnthropicReaderFile: main.filePath,
      articlePanelMode: { anthropic: 'companion', scout: 'guide', job: 'guide' },
      lastArticleCompanion: { mainKey: main.filePath, filePath: comp.filePath },
      articleCompanionScrollPositions: { [comp.filePath]: 5 },
    })
    await gotoBlog(window)

    // 主文 + 对照文都自动恢复
    await expect(window.locator(SELECTORS.briefing.anthropicReader)).toBeVisible({ timeout: 10000 })
    await expect(window.locator('[data-testid="article-companion-board"]')).toBeVisible({ timeout: 10000 })
    await expect(window.locator('[data-testid="article-companion-board"]')).toContainText('e2e-pos-comp')

    // 对照滚动位置恢复(ProseMirror 建块后轮询滚动)
    const compScroller = window.locator(COMPANION_SCROLLER)
    await expect(compScroller).toBeVisible({ timeout: 8000 })
    await expect.poll(() => compScroller.evaluate((el: HTMLElement) => el.scrollTop), { timeout: 8000 }).toBeGreaterThan(0)

    // 对照分隔线按钮:点击后对照文档插入 hr(md 序列化为 *** 或 ---)
    await window.locator('[data-testid="article-companion-insert-hr"]').click()
    await window.waitForFunction(() => /(\*\*\*|---)/.test((window as any).useStore.getState().articleCompanion?.body ?? ''))
  })
})
```

- [ ] **Step 2: writing-companion-pane.spec.ts 追加 hr 用例**

文件末尾 describe 内追加:

```ts
  // ── 8. 对照分隔线按钮:只插进对照文档,主文不受影响 ─────────────────
  test('对照头部分隔线按钮 → 对照文档插入 hr,主文未波及', async ({ window, testLibraryPath }) => {
    await gotoWriting(window, testLibraryPath)
    await selectMainFile(window, MAIN_NAME, MAIN_PATH)
    await openCompanionTab(window)
    await selectCompanion(window, COMPANION_NAME, COMPANION_PATH)
    await window.locator('[data-testid="companion-editor"]').locator('.ProseMirror').waitFor({ state: 'visible', timeout: 5000 })
    await window.waitForTimeout(500) // 等 loadedRef gate 打开

    await expect(window.locator('[data-testid="companion-insert-hr"]')).toBeVisible()
    await window.locator('[data-testid="companion-insert-hr"]').click()
    await window.waitForFunction(() => /(\*\*\*|---)/.test((window as any).useStore.getState().companionFile?.body ?? ''))

    const mainBody = await window.evaluate(() => (window as any).useStore.getState().writingFile?.body ?? '')
    expect(mainBody).not.toMatch(/(\*\*\*|---)/)
  })
```

- [ ] **Step 3: 构建 + 定向跑**

Run: `node scripts/e2e-changed.js --run --no-retries`
Expected: 新 spec 与 writing-companion-pane 全绿;无孤儿 spec WARNING(新 spec 命中 `anthropic-blog*` glob)

- [ ] **Step 4: Commit**

```bash
git add e2e/specs/anthropic-blog-reading-position.spec.ts e2e/specs/writing-companion-pane.spec.ts
git commit -m "test(e2e): 博客阅读位置(退出落盘/reload/恢复)+ 对照重启恢复 + 对照分隔线按钮"
```

---

### Task 10: 终验

- [ ] **Step 1: 单测(受影响文件)**

Run: `npx vitest run tests/scroll-memory.test.ts tests/use-scroll-memory.test.tsx tests/writing-orbit-hr.test.ts tests/writing-hr-caret.test.ts tests/writing-hr-navigation.test.ts tests/safe-json.test.ts`
Expected: 全 PASS

- [ ] **Step 2: 类型检查**

Run: `npx tsc --noEmit`
Expected: PASS

- [ ] **Step 3: 定向 E2E**

Run: `node scripts/e2e-changed.js --run --no-retries`
Expected: 全绿

- [ ] **Step 4: 更新记忆文件**

更新 `~/.claude/projects/.../memory/writing-typo-enter-and-scroll-memory.md`:滚动记忆改为退出时落盘(useScrollMemory),博客侧块容器取 `.md-body > *` 的坑已修。
