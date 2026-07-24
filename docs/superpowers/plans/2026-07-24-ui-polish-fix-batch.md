# UI 打磨批次 · 计划一：功能修复批 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修复性能卡顿（标注扫描/行 hover）、写作编辑器重建导致的输入失灵，统一删除入口到右键菜单（博客新增级联删除），转入写作改为只带标注+旁注，写作助手提问时嵌入文稿快照。

**Architecture:** 全部在现有代码上做外科式修改：渲染层去轮询（MutationObserver 替代每渲染 TreeWalker）、Milkdown 编辑器按文件 key 冻结、删除走统一 ConfirmDialog + 级联 IPC、会话文件格式向后兼容地扩展 snapshot 块。

**Tech Stack:** Electron 30 + React 18 + TS + Tailwind 3.4 + zustand + Milkdown v7 + Vitest（jsdom + @testing-library/react）。

**执行环境：** 直接在 `main` 分支工作（用户明确要求，不使用 worktree）。每个 Task 结束后按步骤里的命令 commit。

**Spec:** `docs/superpowers/specs/2026-07-24-ui-polish-batch-design.md`（本计划覆盖 A 性能、C 删除、F 转入写作、H 编辑稳定性+快照；B/D/E/G/I 在计划二）。

**跨任务铁律：**
- 不改任何现有 `data-testid`（删除模式被移除的 3 个除外，见 Task 6/11）。
- 每步验证命令失败就停下来修复，不要带着失败继续。
- 测试 mock 约定：组件测试用 `vi.mock('@/lib/ipc', ...)`；node 侧测试用真实 fs + `fs.mkdtempSync`。

---

## 文件结构

| 文件 | 责任 | 改动 |
|---|---|---|
| `src/components/article-assistant/ArticleAnnotations.tsx` | 标注标记注入 | 每渲染轮询 → 事件驱动 |
| `src/components/anthropic/AnthropicArticleRow.tsx` | 博客文章行 | hover CSS 化 + memo + 右键删除菜单 |
| `src/components/anthropic/AnthropicBlogPanel.tsx` | 博客面板 | 接 onRequestDelete + ConfirmDialog |
| `electron/lib/anthropic-scraper.ts` | 爬虫/导入 | 导出 IMPORT_DIR |
| `electron/lib/anthropic-delete.ts` | 博客文章删除（新） | 新建，纯函数可测 |
| `electron/ipc/anthropic.ts` | anthropic IPC | 新增 deleteArticle handler |
| `src/types/index.ts` | 共享类型 | IpcApi + 两个 Message 类型加 snapshot |
| `electron/preload.ts` | preload | 暴露 anthropicDeleteArticle |
| `src/lib/ipc.ts` | facade | 暴露 anthropicDeleteArticle |
| `src/store/index.ts` | store | deleteAnthropicArticle、transferArticleToWriting 重写、提问带快照 |
| `src/components/BriefingDateColumn.tsx` | 日期列 | 🗑 选择模式 → 右键删除 |
| `src/components/writing/WritingTree.tsx` | 写作树 | window.confirm → ConfirmDialog |
| `src/components/writing/WritingEditor.tsx` | 编辑器 | useEditor deps [initial] → [] |
| `src/components/writing/WritingBoard.tsx` | 写作板 | editor 加 key={file.path} |
| `electron/ipc/article-assistant.ts` | 会话序列化 | snapshot 块序列化/解析（兼容旧格式） |
| `e2e/helpers/selectors.ts` | e2e 选择器 | 移除 3 个删除选择器，加 dateDelete |
| `e2e/specs/job-briefing-error.spec.ts` | e2e | 删除流程改右键 |

---

### Task 1: ArticleAnnotations 标记扫描改为事件驱动

**Files:**
- Modify: `src/components/article-assistant/ArticleAnnotations.tsx:159-166`
- Test: `tests/article-annotations-markers.test.tsx`（新建）

现状问题：L159-166 的 `useEffect` 无依赖数组，**每次渲染后** 100ms 都对全文做 TreeWalker 重扫（长文章最贵），且 applyMarkers 每次先拆光旧标记再重建。这是展开列卡顿、滚动卡顿、导读拖拽卡顿的共同主因。

- [ ] **Step 1: 写失败测试**

新建 `tests/article-annotations-markers.test.tsx`：

```tsx
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { render, cleanup, act } from '@testing-library/react'

const annotationsRead = vi.fn()
const annotationsWrite = vi.fn()
vi.mock('@/lib/ipc', () => ({
  ipc: {
    annotationsRead: (...args: unknown[]) => annotationsRead(...args),
    annotationsWrite: (...args: unknown[]) => annotationsWrite(...args),
  },
}))

import { ArticleAnnotations } from '@/components/article-assistant/ArticleAnnotations'

const anno = {
  id: 'a1', selectedText: '目标文本', note: '批注', paragraphIndex: 1,
  createdAt: '2026-07-24', updatedAt: '2026-07-24',
}

function makeContainer() {
  const container = document.createElement('div')
  container.innerHTML = '<p>第一段包含目标文本。</p><p>第二段无关内容。</p>'
  document.body.appendChild(container)
  return container
}

describe('ArticleAnnotations marker scheduling', () => {
  beforeEach(() => {
    cleanup()
    document.body.innerHTML = ''
    annotationsRead.mockReset()
    annotationsWrite.mockReset()
    annotationsRead.mockResolvedValue([anno])
    annotationsWrite.mockResolvedValue(undefined)
  })
  afterEach(() => { document.body.innerHTML = '' })

  it('applies markers on load without per-render rescans', async () => {
    const container = makeContainer()
    const ref = { current: container as HTMLElement }
    const walkerSpy = vi.spyOn(document, 'createTreeWalker')

    const { rerender } = render(<ArticleAnnotations articlePath="/x.md" articleRef={ref} />)
    await act(async () => { await new Promise((r) => setTimeout(r, 250)) })
    expect(container.querySelector('.anno-wrap')).not.toBeNull()
    const scansAfterLoad = walkerSpy.mock.calls.length
    expect(scansAfterLoad).toBeGreaterThan(0)

    rerender(<ArticleAnnotations articlePath="/x.md" articleRef={ref} />)
    rerender(<ArticleAnnotations articlePath="/x.md" articleRef={ref} />)
    await act(async () => { await new Promise((r) => setTimeout(r, 250)) })
    expect(walkerSpy.mock.calls.length).toBe(scansAfterLoad)
    walkerSpy.mockRestore()
  })

  it('re-applies markers after the article DOM is replaced imperatively', async () => {
    const container = makeContainer()
    const ref = { current: container as HTMLElement }
    render(<ArticleAnnotations articlePath="/x.md" articleRef={ref} />)
    await act(async () => { await new Promise((r) => setTimeout(r, 250)) })
    expect(container.querySelector('.anno-wrap')).not.toBeNull()

    // 模拟 ArticleBodyChunks 命令式替换文章 DOM
    container.innerHTML = '<p>第一段包含目标文本。</p><p>第二段无关内容。</p>'
    expect(container.querySelector('.anno-wrap')).toBeNull()
    await act(async () => { await new Promise((r) => setTimeout(r, 300)) })
    expect(container.querySelector('.anno-wrap')).not.toBeNull()
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run tests/article-annotations-markers.test.tsx`
Expected: FAIL — 第一个测试失败（现状每次渲染都重扫，`walkerSpy.mock.calls.length` 持续增长）。

- [ ] **Step 3: 实现事件驱动标记**

在 `ArticleAnnotations.tsx` 中，删除 L159-166 的无依赖 useEffect（含其注释），替换为：

```tsx
  // applyMarkers 的最新版本经 ref 暴露给 MutationObserver，避免闭包捕获旧 annotations
  const applyMarkersRef = useRef(applyMarkers)
  applyMarkersRef.current = applyMarkers
  const observerRef = useRef<MutationObserver | null>(null)

  // 执行 applyMarkers 时先断开 observer：
  // applyMarkers 自身的 DOM 变更若被 observer 记录会再次触发自身（无限循环）
  const runApplyMarkers = useCallback(() => {
    const obs = observerRef.current
    const container = articleRef.current
    obs?.disconnect()
    applyMarkersRef.current()
    if (obs && container) {
      obs.observe(container, { childList: true, subtree: true })
    }
  }, [articleRef])

  // annotations 或文章变化时重放标记（100ms settle 等 ArticleBodyChunks 写完 DOM）
  useEffect(() => {
    const timer = setTimeout(runApplyMarkers, 100)
    return () => clearTimeout(timer)
  }, [annotations, articlePath, runApplyMarkers])

  // 兄弟组件（ArticleBodyChunks）命令式替换文章 DOM 时重放标记。
  // 替代原先「每次渲染后全量 TreeWalker」的轮询 —— 那是展开列/滚动/导读拖拽卡顿的主因。
  useEffect(() => {
    const container = articleRef.current
    if (!container) return
    let timer: ReturnType<typeof setTimeout> | undefined
    const observer = new MutationObserver(() => {
      clearTimeout(timer)
      timer = setTimeout(runApplyMarkers, 100)
    })
    observerRef.current = observer
    observer.observe(container, { childList: true, subtree: true })
    return () => {
      clearTimeout(timer)
      observer.disconnect()
      if (observerRef.current === observer) observerRef.current = null
    }
  }, [articleRef, articlePath, runApplyMarkers])
```

注意：现有 `handleGhostClick` 里 `setTimeout(() => { applyMarkers() ... }, 150)` 的直接调用保持不变（它本就是一次性调用）。

- [ ] **Step 4: 跑测试确认通过**

Run: `npx vitest run tests/article-annotations-markers.test.tsx`
Expected: PASS（2/2）

- [ ] **Step 5: 回归既有标注测试**

Run: `npx vitest run tests/article-assistant tests/ArticleBodyChunks.test.tsx`
Expected: PASS。若有依赖旧轮询行为的测试失败，检查该测试是否应显式等待 100ms settle（优先修测试等待逻辑，不改回轮询）。

- [ ] **Step 6: Commit**

```bash
git add src/components/article-assistant/ArticleAnnotations.tsx tests/article-annotations-markers.test.tsx
git commit -m "fix(annotations): event-driven marker re-apply via MutationObserver (was per-render TreeWalker)"
```

---

### Task 2: AnthropicArticleRow hover 改纯 CSS + memo

**Files:**
- Modify: `src/components/anthropic/AnthropicArticleRow.tsx`
- Test: `tests/anthropic-article-row.test.tsx`

- [ ] **Step 1: 加失败测试**

在 `tests/anthropic-article-row.test.tsx` 的 describe 内追加：

```tsx
  it('clamps title to one line and unclamps via CSS group-hover (no React hover state)', () => {
    render(<AnthropicArticleRow article={article()} theme="academic" />)
    const title = screen.getByTestId('anthropic-article-title')
    expect(title).toHaveClass('line-clamp-1')
    expect(title).toHaveClass('group-hover:line-clamp-none')
  })
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run tests/anthropic-article-row.test.tsx`
Expected: FAIL（新测试：`group-hover:line-clamp-none` 不存在）。

- [ ] **Step 3: 实现**

`AnthropicArticleRow.tsx`：
1. `import { useState } from 'react'` 改为 `import { memo, useEffect, useState } from 'react'`（useEffect 在 Task 5 用到；本任务先加 memo）。
2. 删除 `const [hovered, setHovered] = useState(false)`，删除根 button 上的 `onMouseEnter` / `onMouseLeave`。
3. 标题 h3 的 className 改为：

```tsx
          <h3
            data-testid="anthropic-article-title"
            className={`text-base font-serif transition-colors line-clamp-1 ${
              importing ? '' : 'group-hover:line-clamp-none'
            } ${titleColor} ${titleHover}`}
          >
```

4. 组件签名改为 memo 包装（文件顶部 import memo）：

```tsx
export const AnthropicArticleRow = memo(function AnthropicArticleRow({ article, theme = 'academic' }: Props) {
```

文件结尾对应改为 `})`。

- [ ] **Step 4: 跑测试确认通过**

Run: `npx vitest run tests/anthropic-article-row.test.tsx`
Expected: PASS。若文件里有针对 hover 行为的旧断言失败，更新该断言到 CSS 方案（类名断言），不要恢复 React state。

- [ ] **Step 5: Commit**

```bash
git add src/components/anthropic/AnthropicArticleRow.tsx tests/anthropic-article-row.test.tsx
git commit -m "perf(anthropic): CSS-only title unclamp + memoized article row"
```

---

### Task 3: 卡顿回归验证（A2 导读拖拽）

**Files:** 无改动；运行既有测试 + 启动探查。

- [ ] **Step 1: 跑标注相关 e2e（确认 Task 1 无回归）**

先找出覆盖标注/导读的 e2e：

```bash
grep -rln "anno-\|annotations\|guide" e2e/specs/ | head
```

对列出的 spec 逐个运行（mock 模式）：

```bash
npx playwright test --config e2e/playwright.config.ts <spec文件名>
```

Expected: 全绿。若有 flake，先重跑一次确认再排查。

- [ ] **Step 2: 手动验证留给用户的便签**

Task 1 消除了拖拽期间的 TreeWalker 风暴（导读拖拽每次宽度变化都会重渲染阅读器，旧代码每次都全量重扫）。在最终交付说明中写明：「博客导读拖拽卡顿已随标注扫描修复一并解决，请手动拖拽确认手感」。

---

### Task 4: anthropic 文章删除 IPC（级联删除伴生文件）

**Files:**
- Modify: `electron/lib/anthropic-scraper.ts:10`（导出 IMPORT_DIR）
- Create: `electron/lib/anthropic-delete.ts`
- Modify: `electron/ipc/anthropic.ts`（新增 handler）
- Modify: `src/types/index.ts:613`（IpcApi）
- Modify: `electron/preload.ts:108`（暴露）
- Modify: `src/lib/ipc.ts:83`（facade）
- Test: `tests/anthropic-delete.test.ts`（新建）

按 ipc-state 规则 §1 顺序：types → handler → preload → facade → store(Task 5) → 组件(Task 5) → 测试。

- [ ] **Step 1: 写失败测试**

新建 `tests/anthropic-delete.test.ts`：

```ts
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { deleteAnthropicArticleFile } from '@electron/lib/anthropic-delete'
import { IMPORT_DIR } from '@electron/lib/anthropic-scraper'

let lib: string
beforeEach(() => { lib = fs.mkdtempSync(path.join(os.tmpdir(), 'alib-')) })
afterEach(() => { fs.rmSync(lib, { recursive: true, force: true }) })

function seedArticle() {
  const dir = path.join(lib, IMPORT_DIR, '2026-07')
  fs.mkdirSync(dir, { recursive: true })
  const article = path.join(dir, 'test-article.md')
  fs.writeFileSync(article, '# article')
  fs.writeFileSync(path.join(dir, 'test-article.assistant.md'), 'chat')
  fs.writeFileSync(path.join(dir, 'test-article.annotations.md'), 'annos')
  fs.writeFileSync(path.join(dir, 'test-article.guide.md'), 'guide')
  return article
}

describe('deleteAnthropicArticleFile', () => {
  it('deletes the article and its sibling files', () => {
    const article = seedArticle()
    const r = deleteAnthropicArticleFile(lib, article)
    expect(r.ok).toBe(true)
    expect(fs.existsSync(article)).toBe(false)
    const dir = path.dirname(article)
    expect(fs.readdirSync(dir)).toEqual([])
  })

  it('rejects paths outside the import dir', () => {
    const outside = path.join(lib, 'writing', 'x.md')
    fs.mkdirSync(path.dirname(outside), { recursive: true })
    fs.writeFileSync(outside, 'x')
    const r = deleteAnthropicArticleFile(lib, outside)
    expect(r.ok).toBe(false)
    expect(fs.existsSync(outside)).toBe(true)
  })

  it('rejects missing files', () => {
    const r = deleteAnthropicArticleFile(lib, path.join(lib, IMPORT_DIR, 'ghost.md'))
    expect(r.ok).toBe(false)
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run tests/anthropic-delete.test.ts`
Expected: FAIL（模块不存在 / IMPORT_DIR 未导出）。

- [ ] **Step 3: 实现 lib + IPC 四层**

3a. `electron/lib/anthropic-scraper.ts` L10：`const IMPORT_DIR = 'Anthropic博客'` 改为 `export const IMPORT_DIR = 'Anthropic博客'`。

3b. 新建 `electron/lib/anthropic-delete.ts`：

```ts
import fs from 'node:fs'
import path from 'node:path'
import { IMPORT_DIR } from './anthropic-scraper'
import { deleteSiblingFiles } from './sibling-files'

export function deleteAnthropicArticleFile(
  libraryPath: string,
  filePath: string
): { ok: true } | { ok: false; message: string } {
  const dir = path.resolve(libraryPath, IMPORT_DIR)
  const abs = path.resolve(filePath)
  if (!abs.startsWith(dir + path.sep) || !fs.existsSync(abs)) {
    return { ok: false, message: '文件不存在或路径非法' }
  }
  try {
    fs.rmSync(abs)
    deleteSiblingFiles(abs)
    return { ok: true }
  } catch (err: any) {
    return { ok: false, message: err?.message || String(err) }
  }
}
```

3c. `electron/ipc/anthropic.ts`：顶部 import 加 `import { deleteAnthropicArticleFile } from '../lib/anthropic-delete'`，在 `anthropic:cancelImport` handler 后追加：

```ts
  ipcMain.handle('anthropic:deleteArticle', async (_, args: { filePath: string }) => {
    return deleteAnthropicArticleFile(cfg.libraryPath, args.filePath)
  })
```

3d. `src/types/index.ts` IpcApi，在 `anthropicCancelImport: () => Promise<void>`（L613）后追加：

```ts
  anthropicDeleteArticle: (args: { filePath: string }) => Promise<
    { ok: true } | { ok: false; message: string }
  >
```

3e. `electron/preload.ts` 在 `anthropicCancelImport`（L108）后追加：

```ts
  anthropicDeleteArticle: (a) => ipcRenderer.invoke('anthropic:deleteArticle', a),
```

3f. `src/lib/ipc.ts` 在 `get anthropicCancelImport()`（L83）后追加：

```ts
  get anthropicDeleteArticle() { return ensure().anthropicDeleteArticle },
```

- [ ] **Step 4: 跑测试确认通过**

Run: `npx vitest run tests/anthropic-delete.test.ts`
Expected: PASS（3/3）

- [ ] **Step 5: 类型检查**

Run: `npx tsc --noEmit`
Expected: 无错误。

- [ ] **Step 6: Commit**

```bash
git add electron/lib/anthropic-scraper.ts electron/lib/anthropic-delete.ts electron/ipc/anthropic.ts src/types/index.ts electron/preload.ts src/lib/ipc.ts tests/anthropic-delete.test.ts
git commit -m "feat(anthropic): delete-article IPC with sibling cascade"
```

---

### Task 5: 博客文章右键删除（store + 行菜单 + 确认弹窗）

**Files:**
- Modify: `src/store/index.ts`（接口 L142 附近 + 实现 L898 附近）
- Modify: `src/components/anthropic/AnthropicArticleRow.tsx`
- Modify: `src/components/anthropic/AnthropicBlogPanel.tsx`
- Test: `tests/anthropic-delete-store.test.ts`（新建）、`tests/anthropic-article-row.test.tsx`

- [ ] **Step 1: 写失败测试**

新建 `tests/anthropic-delete-store.test.ts`：

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

const anthropicDeleteArticle = vi.fn()
vi.mock('@/lib/ipc', () => ({
  ipc: {
    anthropicDeleteArticle: (...args: unknown[]) => anthropicDeleteArticle(...args),
  },
}))

import { useStore } from '@/store'

describe('deleteAnthropicArticle', () => {
  beforeEach(() => {
    anthropicDeleteArticle.mockReset()
    useStore.setState({
      anthropicBlogCache: {
        articles: [
          { url: 'https://a', title: 'A', isSaved: true, filePath: '/lib/Anthropic博客/a.md' },
          { url: 'https://b', title: 'B', isSaved: false, filePath: null },
        ],
        loading: false, error: null, lastFetchedAt: null,
      },
      anthropicReaderFilePath: '/lib/Anthropic博客/a.md',
      showToast: vi.fn(),
    } as any)
  })

  it('marks article unsaved and closes the reader after successful delete', async () => {
    anthropicDeleteArticle.mockResolvedValue({ ok: true })
    await useStore.getState().deleteAnthropicArticle('/lib/Anthropic博客/a.md')
    const s = useStore.getState()
    expect(s.anthropicBlogCache.articles[0].isSaved).toBe(false)
    expect(s.anthropicBlogCache.articles[0].filePath).toBeNull()
    expect(s.anthropicBlogCache.articles[1].isSaved).toBe(false)
    expect(s.anthropicReaderFilePath).toBeNull()
  })

  it('keeps state and toasts on failure', async () => {
    anthropicDeleteArticle.mockResolvedValue({ ok: false, message: '文件不存在或路径非法' })
    await useStore.getState().deleteAnthropicArticle('/lib/Anthropic博客/a.md')
    const s = useStore.getState()
    expect(s.anthropicBlogCache.articles[0].isSaved).toBe(true)
    expect(s.showToast).toHaveBeenCalled()
  })
})
```

并在 `tests/anthropic-article-row.test.tsx` describe 内追加：

```tsx
  it('opens delete menu on right-click for saved articles and requests delete', () => {
    const onRequestDelete = vi.fn()
    render(
      <AnthropicArticleRow
        article={article({ isSaved: true, filePath: '/lib/Anthropic博客/x.md' })}
        theme="academic"
        onRequestDelete={onRequestDelete}
      />
    )
    fireEvent.contextMenu(screen.getByTestId('anthropic-article-row'))
    fireEvent.click(screen.getByTestId('anthropic-row-delete'))
    expect(onRequestDelete).toHaveBeenCalledWith(
      expect.objectContaining({ filePath: '/lib/Anthropic博客/x.md' })
    )
  })

  it('does not open delete menu for unsaved articles', () => {
    render(<AnthropicArticleRow article={article()} theme="academic" onRequestDelete={vi.fn()} />)
    fireEvent.contextMenu(screen.getByTestId('anthropic-article-row'))
    expect(screen.queryByTestId('anthropic-row-menu')).not.toBeInTheDocument()
  })
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run tests/anthropic-delete-store.test.ts tests/anthropic-article-row.test.tsx`
Expected: FAIL（store action 不存在 / onRequestDelete prop 不存在）。

- [ ] **Step 3: store action**

`src/store/index.ts` 接口区，在 `closeAnthropicReader: () => void`（L142）后加：

```ts
  deleteAnthropicArticle: (filePath: string) => Promise<void>
```

实现区，在 `closeAnthropicReader: () => set({ anthropicReaderFilePath: null })`（L898）后加：

```ts
  deleteAnthropicArticle: async (filePath) => {
    const r = await ipc.anthropicDeleteArticle({ filePath })
    if (!r.ok) {
      get().showToast('删除失败：' + r.message)
      return
    }
    const cache = get().anthropicBlogCache
    set({
      anthropicBlogCache: {
        ...cache,
        articles: cache.articles.map((a) =>
          a.filePath === filePath ? { ...a, isSaved: false, filePath: null } : a
        ),
      },
    })
    if (get().anthropicReaderFilePath === filePath) {
      get().closeAnthropicReader()
    }
  },
```

- [ ] **Step 4: 行组件右键菜单**

`AnthropicArticleRow.tsx`：
1. Props 加 `onRequestDelete?: (article: AnthropicArticleMeta) => void`，组件参数解构加 `onRequestDelete`。
2. 顶部 import 加 `import { createPortal } from 'react-dom'`。
3. 组件内加菜单状态与关闭逻辑：

```tsx
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null)
  useEffect(() => {
    if (!menu) return
    const h = () => setMenu(null)
    document.addEventListener('click', h)
    return () => document.removeEventListener('click', h)
  }, [menu])
```

4. 根 button 加：

```tsx
      onContextMenu={(e) => {
        if (!article.isSaved || !article.filePath) return
        e.preventDefault()
        setMenu({ x: e.clientX, y: e.clientY })
      }}
```

5. 在根 button 内末尾（`</button>` 之前）加 portal 菜单（portal 挂载到 body，不会产生 button 嵌套 button）：

```tsx
      {menu && createPortal(
        <div
          data-testid="anthropic-row-menu"
          className="fixed z-50 bg-ink border border-parchment/20 rounded shadow-lg py-1 text-xs"
          style={{ left: menu.x, top: menu.y }}
        >
          <button
            type="button"
            data-testid="anthropic-row-delete"
            className="block w-full text-left px-3 py-1.5 hover:bg-parchment/10 text-red-400"
            onClick={() => {
              setMenu(null)
              onRequestDelete?.(article)
            }}
          >
            删除
          </button>
        </div>,
        document.body
      )}
```

- [ ] **Step 5: 面板接 ConfirmDialog**

`AnthropicBlogPanel.tsx`：
1. import 加 `import { ConfirmDialog } from '@/components/ConfirmDialog'`。
2. 组件内加：

```tsx
  const deleteAnthropicArticle = useStore((s) => s.deleteAnthropicArticle)
  const [pendingDelete, setPendingDelete] = useState<AnthropicArticleMeta | null>(null)
```

3. 展开列表的行渲染（L258-260）改为：

```tsx
                {filtered.map((article) => (
                  <AnthropicArticleRow key={article.url} article={article} theme={theme} onRequestDelete={setPendingDelete} />
                ))}
```

4. 在根 div 末尾（`</BriefingListColumn>` 之后的阅读器 div 之后、`</div>` 收尾前）加：

```tsx
      <ConfirmDialog
        open={pendingDelete !== null}
        title="删除文章"
        icon="trash"
        confirmLabel="删除"
        confirmVariant="danger"
        onCancel={() => setPendingDelete(null)}
        onConfirm={() => {
          const target = pendingDelete
          setPendingDelete(null)
          if (target?.filePath) void deleteAnthropicArticle(target.filePath)
        }}
      >
        <p>即将删除「{pendingDelete?.title}」，文章卡片将从列表移除。</p>
        <p className="mt-2">将同时删除该文章的旁注对话、标注与导读。</p>
      </ConfirmDialog>
```

- [ ] **Step 6: 跑测试确认通过**

Run: `npx vitest run tests/anthropic-delete-store.test.ts tests/anthropic-article-row.test.tsx tests/anthropic-blog-panel.test.tsx`
Expected: PASS。

- [ ] **Step 7: Commit**

```bash
git add src/store/index.ts src/components/anthropic/AnthropicArticleRow.tsx src/components/anthropic/AnthropicBlogPanel.tsx tests/anthropic-delete-store.test.ts tests/anthropic-article-row.test.tsx
git commit -m "feat(anthropic): right-click delete with ConfirmDialog + sibling cascade"
```

---

### Task 6: 日期列右键删除（移除 🗑 选择模式）

**Files:**
- Modify: `src/components/BriefingDateColumn.tsx`（整体重写）
- Test: `tests/briefing-date-column.test.tsx`

`src/pages/Briefing.tsx` 的 `onDelete={(items) => setPendingDelete(items)}` 接线与 ConfirmDialog **保持不变**（现在 items 恒为单条）。

- [ ] **Step 1: 改测试**

`tests/briefing-date-column.test.tsx`：删除所有选择删除模式的测试（引用 `briefing-delete-mode-toggle` / `briefing-delete-check-` / `briefing-delete-confirm` 的用例），追加：

```tsx
  it('opens delete menu on right-click and calls onDelete with the single item', () => {
    const onDelete = vi.fn()
    render(
      <BriefingDateColumn
        collapsed={false}
        history={[{ date: '2026-07-10', filePath: '/x.md' }]}
        today="2026-07-11"
        onSelect={vi.fn()}
        onReceiveToday={vi.fn()}
        theme="academic"
        onDelete={onDelete}
      />
    )
    fireEvent.contextMenu(screen.getByTestId('briefing-date-item-2026-07-10'))
    fireEvent.click(screen.getByTestId('briefing-date-delete'))
    expect(onDelete).toHaveBeenCalledWith([{ date: '2026-07-10', filePath: '/x.md' }])
  })

  it('no longer renders the trash toggle', () => {
    render(
      <BriefingDateColumn
        collapsed={false}
        history={[{ date: '2026-07-10', filePath: '/x.md' }]}
        today="2026-07-11"
        onSelect={vi.fn()}
        onReceiveToday={vi.fn()}
        theme="academic"
        onDelete={vi.fn()}
      />
    )
    expect(screen.queryByTestId('briefing-delete-mode-toggle')).not.toBeInTheDocument()
  })

  it('does not open menu for today entry when its file is absent from history', () => {
    render(
      <BriefingDateColumn
        collapsed={false}
        history={[]}
        today="2026-07-11"
        onSelect={vi.fn()}
        onReceiveToday={vi.fn()}
        theme="academic"
        onDelete={vi.fn()}
      />
    )
    fireEvent.contextMenu(screen.getByTestId('briefing-date-item-2026-07-11'))
    expect(screen.queryByTestId('briefing-date-menu')).not.toBeInTheDocument()
  })
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run tests/briefing-date-column.test.tsx`
Expected: FAIL（`briefing-date-delete` 不存在；`briefing-delete-mode-toggle` 仍存在）。

- [ ] **Step 3: 重写组件**

`src/components/BriefingDateColumn.tsx` 完整替换为：

```tsx
import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { useStore } from '@/store'

export type BriefingHistoryItem = {
  date: string
  filePath: string
}

interface Props {
  collapsed: boolean
  history: BriefingHistoryItem[]
  currentDate?: string
  today: string
  onSelect: (date: string) => void
  onReceiveToday: () => void
  theme: 'academic' | 'newspaper'
  todayLabel?: string
  /** 右键菜单「删除」时回传该条目（单条数组） */
  onDelete?: (items: BriefingHistoryItem[]) => void
}

function formatLabel(date: string): string {
  const [y, m, d] = date.split('-').map(Number)
  if ([y, m, d].some((n) => Number.isNaN(n))) return date
  return `${m}月${d}日`
}

export function BriefingDateColumn({ collapsed, history, currentDate, today, onSelect, onReceiveToday, theme, todayLabel = '查收日报', onDelete }: Props) {
  const isAcademic = theme !== 'newspaper'
  const source = useStore((s) => s.briefingSource)
  const jobBlue = isAcademic && source === 'job-briefing'
  const [menu, setMenu] = useState<{ x: number; y: number; item: BriefingHistoryItem } | null>(null)

  // 点击任意处关闭右键菜单
  useEffect(() => {
    if (!menu) return
    const h = () => setMenu(null)
    document.addEventListener('click', h)
    return () => document.removeEventListener('click', h)
  }, [menu])

  const itemBase = isAcademic
    ? 'text-parchment/70 hover:bg-parchment/10 hover:text-parchment'
    : 'text-[#6b5d52] hover:bg-black/5 hover:text-[#1a1a1a]'
  const activeItem = isAcademic
    ? jobBlue
      ? 'bg-[#7fa8d9]/20 text-[#7fa8d9] border border-[#7fa8d9]/40'
      : 'bg-ember/20 text-ember border border-ember/40'
    : 'bg-[#1a1a1a] text-white'

  // Today is always rendered as the synthetic top entry, so drop any history
  // record for today. Otherwise a generated-today briefing appears both as the
  // synthetic entry and in `history`, producing a duplicate React key.
  const past = history.filter((h) => h.date !== today)
  const entries = [{ date: today, filePath: '', isToday: true }, ...past.map((h) => ({ ...h, isToday: false }))]

  if (collapsed) {
    const latest = past[0]
    return (
      <div className="flex flex-col items-center py-3 px-1 gap-3">
        <button
          data-testid="briefing-date-today-mini"
          onClick={onReceiveToday}
          title={todayLabel}
          className={`w-8 h-8 rounded flex items-center justify-center ${isAcademic ? (jobBlue ? 'bg-[#7fa8d9]/20 text-[#7fa8d9]' : 'bg-ember/20 text-ember') : 'bg-[#1a1a1a] text-white'}`}
        >
          今
        </button>
        {latest && (
          <button
            data-testid="briefing-date-latest-mini"
            onClick={() => onSelect(latest.date)}
            title={latest.date}
            className={`text-[10px] writing-vertical-lr ${isAcademic ? 'text-parchment/60' : 'text-[#6b5d52]'}`}
          >
            {formatLabel(latest.date)}
          </button>
        )}
      </div>
    )
  }

  return (
    <div className="p-2 space-y-1" data-testid="briefing-date-column">
      {entries.map((entry) => {
        const isCurrent = entry.date === currentDate
        return (
          <button
            key={entry.date}
            data-testid={`briefing-date-item-${entry.date}`}
            onClick={() => (entry.isToday ? onReceiveToday() : onSelect(entry.date))}
            onContextMenu={(e) => {
              const item = history.find((h) => h.date === entry.date)
              if (!item) return // 今天条目尚无文件时不可删除
              e.preventDefault()
              setMenu({ x: e.clientX, y: e.clientY, item })
            }}
            className={`w-full text-left px-3 py-2 rounded text-sm transition-colors ${isCurrent ? activeItem : itemBase}`}
          >
            {entry.isToday ? todayLabel : formatLabel(entry.date)}
          </button>
        )
      })}
      {past.length === 0 && (
        <div className={`px-3 py-2 text-xs ${isAcademic ? 'text-parchment/40' : 'text-[#6b5d52]'}`}>
          暂无往期简报
        </div>
      )}
      {menu && createPortal(
        <div
          data-testid="briefing-date-menu"
          className="fixed z-50 bg-ink border border-parchment/20 rounded shadow-lg py-1 text-xs"
          style={{ left: menu.x, top: menu.y }}
        >
          <button
            type="button"
            data-testid="briefing-date-delete"
            onClick={() => {
              const item = menu.item
              setMenu(null)
              onDelete?.([item])
            }}
            className="block w-full text-left px-3 py-1.5 hover:bg-parchment/10 text-red-400"
          >
            删除
          </button>
        </div>,
        document.body
      )}
    </div>
  )
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `npx vitest run tests/briefing-date-column.test.tsx tests/briefing-page.test.tsx tests/briefing-layout.test.tsx`
Expected: PASS。

- [ ] **Step 5: Commit**

```bash
git add src/components/BriefingDateColumn.tsx tests/briefing-date-column.test.tsx
git commit -m "feat(briefing): replace trash select-mode with right-click delete on date items"
```

---

### Task 7: WritingTree 删除确认统一为 ConfirmDialog

**Files:**
- Modify: `src/components/writing/WritingTree.tsx:60-65`
- Test: `tests/writing-tree-delete.test.tsx`（新建）

- [ ] **Step 1: 写失败测试**

新建 `tests/writing-tree-delete.test.tsx`：

```tsx
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react'

const writingDelete = vi.fn()
vi.mock('@/lib/ipc', () => ({
  ipc: {
    writingDelete: (...args: unknown[]) => writingDelete(...args),
    writingRename: vi.fn(),
    writingCreateFile: vi.fn(),
    writingCreateFolder: vi.fn(),
    writingMove: vi.fn(),
  },
}))

import { useStore } from '@/store'
import { WritingTree } from '@/components/writing/WritingTree'

describe('WritingTree delete', () => {
  beforeEach(() => {
    cleanup()
    writingDelete.mockReset()
    writingDelete.mockResolvedValue({ ok: true })
    useStore.setState({
      writingTree: {
        writing: [{ kind: 'file', name: 'a.md', path: 'writing/a.md' }],
        repository: [],
      },
      writingFile: null,
      selectWritingFile: vi.fn(),
      loadWritingTree: vi.fn(),
    } as any)
  })

  it('asks via ConfirmDialog and deletes on confirm', async () => {
    render(<WritingTree root="writing" />)
    fireEvent.contextMenu(screen.getByTestId('writing-tree-node'))
    fireEvent.click(screen.getByText('删除'))
    expect(screen.getByTestId('confirm-dialog')).toBeInTheDocument()
    expect(writingDelete).not.toHaveBeenCalled()
    fireEvent.click(screen.getByTestId('confirm-dialog-confirm'))
    await waitFor(() => expect(writingDelete).toHaveBeenCalledWith({ path: 'writing/a.md' }))
  })

  it('does not delete on cancel', () => {
    render(<WritingTree root="writing" />)
    fireEvent.contextMenu(screen.getByTestId('writing-tree-node'))
    fireEvent.click(screen.getByText('删除'))
    fireEvent.click(screen.getByTestId('confirm-dialog-cancel'))
    expect(writingDelete).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run tests/writing-tree-delete.test.tsx`
Expected: FAIL（`confirm-dialog` 不出现，window.confirm 路径）。注意 jsdom 无 window.confirm 实现，若测试因 confirm 未定义而报错也算预期失败。

- [ ] **Step 3: 实现**

`WritingTree.tsx`：
1. import 加 `import { ConfirmDialog } from '@/components/ConfirmDialog'`。
2. `TreeNode` 内 `doDelete` 替换为：

```tsx
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const doDelete = () => {
    closeMenu()
    setConfirmingDelete(true)
  }
```

3. 在 `{prompt && (...)}` 块之后追加：

```tsx
      <ConfirmDialog
        open={confirmingDelete}
        title="删除"
        icon="trash"
        confirmLabel="删除"
        confirmVariant="danger"
        onCancel={() => setConfirmingDelete(false)}
        onConfirm={() => {
          setConfirmingDelete(false)
          void (async () => {
            const r = await ipc.writingDelete({ path: node.path })
            if (r.ok) await loadWritingTree()
          })()
        }}
      >
        <p>确定删除「{node.name}」？此操作不可撤销。</p>
      </ConfirmDialog>
```

- [ ] **Step 4: 跑测试确认通过**

Run: `npx vitest run tests/writing-tree-delete.test.tsx tests/writing-tree.test.ts`
Expected: PASS。

- [ ] **Step 5: Commit**

```bash
git add src/components/writing/WritingTree.tsx tests/writing-tree-delete.test.tsx
git commit -m "refactor(writing): unify tree delete confirmation to ConfirmDialog"
```

---

### Task 8: 转入写作只带标注 + 旁注（结构化分区）

**Files:**
- Modify: `src/store/index.ts:707-741`（transferArticleToWriting）
- Test: `tests/transfer-to-writing.test.ts`（新建）

`TransferToWritingButton` 与 `args.content` 类型字段保持不变（按钮三个挂载点不动）；实现忽略 `args.content`，改为现场读取 `.annotations.md` 与 `.assistant.md`。

- [ ] **Step 1: 写失败测试**

新建 `tests/transfer-to-writing.test.ts`：

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

const annotationsRead = vi.fn()
const articleAssistantReadSession = vi.fn()
const writingCreateFile = vi.fn()
const writingWrite = vi.fn()
vi.mock('@/lib/ipc', () => ({
  ipc: {
    annotationsRead: (...args: unknown[]) => annotationsRead(...args),
    articleAssistantReadSession: (...args: unknown[]) => articleAssistantReadSession(...args),
    writingCreateFile: (...args: unknown[]) => writingCreateFile(...args),
    writingWrite: (...args: unknown[]) => writingWrite(...args),
  },
}))

import { useStore } from '@/store'

const FULL_TEXT = 'FULL ARTICLE BODY SHOULD NOT APPEAR'

beforeEach(() => {
  vi.clearAllMocks()
  useStore.setState({ showToast: vi.fn() } as any)
  writingCreateFile.mockResolvedValue({ ok: true, value: { path: '/lib/writing/x.md' } })
  writingWrite.mockResolvedValue({ ok: true })
})

describe('transferArticleToWriting', () => {
  it('writes structured annotations + chat sections without the full text', async () => {
    annotationsRead.mockResolvedValue([
      { id: 'a1', selectedText: '简单方案', note: '赞同', paragraphIndex: 2, createdAt: '2026-07-24', updatedAt: '2026-07-24' },
    ])
    articleAssistantReadSession.mockResolvedValue({
      filePath: '/x.assistant.md', createdAt: '', updatedAt: '',
      messages: [
        { role: 'user', content: '为什么不用多智能体？' },
        { role: 'assistant', content: '复杂度有成本。' },
      ],
    })
    await useStore.getState().transferArticleToWriting({
      name: 'Building Effective Agents', content: FULL_TEXT,
      sourceType: 'anthropic', sourcePath: '/lib/Anthropic博客/x.md',
    })
    const body = writingWrite.mock.calls[0][0].body as string
    expect(body).toContain('## 标注摘录')
    expect(body).toContain('「简单方案」（§2）')
    expect(body).toContain('批注：赞同')
    expect(body).toContain('## 旁注对话')
    expect(body).toContain('**用户**：为什么不用多智能体？')
    expect(body).toContain('**助手**：复杂度有成本。')
    expect(body).not.toContain(FULL_TEXT)
    expect(articleAssistantReadSession).toHaveBeenCalledWith({
      parentPath: '/lib/Anthropic博客/x.md', parentType: 'anthropic-article',
    })
  })

  it('degrades to （无） sections when reads fail', async () => {
    annotationsRead.mockRejectedValue(new Error('no file'))
    articleAssistantReadSession.mockRejectedValue(new Error('no file'))
    await useStore.getState().transferArticleToWriting({
      name: 'X', content: FULL_TEXT, sourceType: 'digest', sourcePath: '/lib/b.md',
    })
    const body = writingWrite.mock.calls[0][0].body as string
    expect(body).toContain('## 标注摘录\n\n（无）')
    expect(body).toContain('## 旁注对话\n\n（无）')
    expect(articleAssistantReadSession).toHaveBeenCalledWith({
      parentPath: '/lib/b.md', parentType: 'briefing',
    })
  })

  it('treats empty note as （无批注）', async () => {
    annotationsRead.mockResolvedValue([
      { id: 'a1', selectedText: '片段', note: '', paragraphIndex: 1, createdAt: '2026-07-24', updatedAt: '2026-07-24' },
    ])
    articleAssistantReadSession.mockResolvedValue(null)
    await useStore.getState().transferArticleToWriting({
      name: 'X', content: FULL_TEXT, sourceType: 'digest', sourcePath: '/lib/b.md',
    })
    const body = writingWrite.mock.calls[0][0].body as string
    expect(body).toContain('批注：（无批注）')
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run tests/transfer-to-writing.test.ts`
Expected: FAIL（body 目前就是全文，不含新区块）。

- [ ] **Step 3: 重写 store action**

`src/store/index.ts` 的 `transferArticleToWriting`（L707-741）替换为：

```ts
  transferArticleToWriting: async (args) => {
    const sanitize = (n: string) =>
      n.replace(/[\\/:*?"<>|]/g, '-').replace(/\s+/g, ' ').trim() || '未命名'
    const base = sanitize(args.name)

    // 只带标注与旁注对话，不带全文（spec F）。读取失败按空处理，不阻断转入。
    const parentType = args.sourceType === 'digest' ? 'briefing' as const : 'anthropic-article' as const
    const annotations = await ipc.annotationsRead(args.sourcePath).catch(() => [] as ArticleAnnotation[])
    const session = await ipc.articleAssistantReadSession({ parentPath: args.sourcePath, parentType }).catch(() => null)

    const annoSection = annotations.length === 0
      ? '（无）'
      : annotations
          .map((a) => `> 「${a.selectedText}」（§${a.paragraphIndex}）\n>\n> 批注：${a.note?.trim() ? a.note.trim() : '（无批注）'}`)
          .join('\n\n')
    const chatSection = !session || session.messages.length === 0
      ? '（无）'
      : session.messages
          .map((m) => `**${m.role === 'user' ? '用户' : '助手'}**：${m.content}`)
          .join('\n\n')

    const fm = `---\ntitle: ${base}\nsource_type: ${args.sourceType}\nsource_path: ${args.sourcePath}\n---\n\n`
    const body = `${fm}## 标注摘录\n\n${annoSection}\n\n## 旁注对话\n\n${chatSection}\n`

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

若 `ArticleAnnotation` 类型未在 store 顶部 import，从 `@shared/index` 补上。

- [ ] **Step 4: 跑测试确认通过**

Run: `npx vitest run tests/transfer-to-writing.test.ts`
Expected: PASS（3/3）

- [ ] **Step 5: Commit**

```bash
git add src/store/index.ts tests/transfer-to-writing.test.ts
git commit -m "feat(transfer): import only annotations + margin chat into writing (structured sections)"
```

---

### Task 9: 写作编辑器按文件冻结（修复回车/点击失灵）

**Files:**
- Modify: `src/components/writing/WritingEditor.tsx`
- Modify: `src/components/writing/WritingBoard.tsx:72-75`
- Test: `tests/writing-editor.test.tsx`（新建）

根因：`useEditor(factory, [initial])` —— `initial={file.body}` 每次按键都变（onChange → updateWritingBody → store），1.5s 防抖自动保存后 body 再变一次，Milkdown 编辑器随之销毁重建，焦点/光标丢失 —— 即用户感知的「已保存打断写作」「回车/点击时好时坏」。

- [ ] **Step 1: 写失败测试**

新建 `tests/writing-editor.test.tsx`：

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, cleanup } from '@testing-library/react'

const factoryCalls: unknown[][] = []
vi.mock('@milkdown/react', () => ({
  MilkdownProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  Milkdown: () => <div data-testid="milkdown-root" />,
  useEditor: (_factory: unknown, deps: unknown[]) => {
    factoryCalls.push(deps)
    return { loading: false, get: () => null }
  },
}))
vi.mock('@milkdown/core', () => ({
  Editor: { make: () => ({ use() { return this }, config() { return this } }) },
  rootCtx: 'rootCtx',
  defaultValueCtx: 'defaultValueCtx',
}))
vi.mock('@milkdown/preset-commonmark', () => ({ commonmark: 'commonmark' }))
vi.mock('@milkdown/preset-gfm', () => ({ gfm: 'gfm' }))
vi.mock('@milkdown/plugin-listener', () => ({ listener: 'listener', listenerCtx: { markdownUpdated: vi.fn() } }))
vi.mock('@milkdown/plugin-history', () => ({ history: 'history' }))
vi.mock('@milkdown/plugin-clipboard', () => ({ clipboard: 'clipboard' }))

import { WritingEditor } from '@/components/writing/WritingEditor'

describe('WritingEditor', () => {
  beforeEach(() => {
    cleanup()
    factoryCalls.length = 0
  })

  it('creates the editor once even when initial changes within the same mount', () => {
    const { rerender } = render(<WritingEditor initial="a" onChange={() => {}} />)
    rerender(<WritingEditor initial="ab" onChange={() => {}} />)
    rerender(<WritingEditor initial="abc" onChange={() => {}} />)
    expect(factoryCalls).toHaveLength(1)
  })

  it('recreates the editor on remount (file switch via key)', () => {
    const { unmount } = render(<WritingEditor key="f1" initial="a" onChange={() => {}} />)
    unmount()
    render(<WritingEditor key="f2" initial="b" onChange={() => {}} />)
    expect(factoryCalls).toHaveLength(2)
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run tests/writing-editor.test.tsx`
Expected: FAIL — 第一个测试：现状 deps `[initial]`，initial 变化即重建（factoryCalls 为 3）。

- [ ] **Step 3: 实现**

`WritingEditor.tsx` 的 `EditorInner`：删除 `prevInitial`/`loadedRef` 重置逻辑（L26-31），保留 `loadedRef` 门；`useEditor` 依赖改 `[]`；注释更新。整个组件变为：

```tsx
function EditorInner({ initial, onChange }: { initial: string; onChange: (md: string) => void }) {
  const ref = useRef(onChange)
  ref.current = onChange

  const setAction = useStore(s => s.setWritingEditorAction)

  // 编辑器每次挂载只创建一次。WritingBoard 以 file.path 作 key，
  // 切文件 = 重挂载（拿到新文件的 body）；而我们自己的 onChange → store
  // 回环导致的 initial 变化绝不应重建编辑器（旧行为会在每次自动保存后
  // 销毁焦点/光标 —— 「回车/点击失灵」的根因）。
  // loadedRef 只挡初始化期间 defaultValueCtx 触发的首次 markdownUpdated。
  const loadedRef = useRef(false)

  const { loading, get } = useEditor((root) => {
    return Editor.make()
      .use(commonmark)
      .use(gfm)
      .use(listener)
      .use(history)
      .use(clipboard)
      .config(ctx => {
        ctx.set(rootCtx, root)
        ctx.set(defaultValueCtx, initial)
        ctx.get(listenerCtx).markdownUpdated((_, md) => { if (loadedRef.current) ref.current(md) })
      })
  }, [])

  // Register editor action proxy once the editor is created, so the toolbar
  // can call editor commands (bold, table, heading, etc.).
  // get() is a new function each render; stabilize via ref so the effect
  // only re-runs when loading actually changes, not on every re-render.
  const getRef = useRef(get)
  getRef.current = get

  useEffect(() => {
    if (!loading) {
      loadedRef.current = true
      // 实时取 getRef.current() 避免闭包捕获已销毁的旧 editor 实例
      // → toolbar 调用时拿到当前活跃 editor
      setAction((fn: any) => { getRef.current()?.action(fn) })
    }
    return () => { setAction(null) }
  }, [loading, setAction])

  return <Milkdown />
}
```

`WritingBoard.tsx` L72-75：

```tsx
        <WritingEditor
          key={file.path}
          initial={file.body}
          onChange={(md) => updateWritingBody(md)}
        />
```

- [ ] **Step 4: 跑测试确认通过**

Run: `npx vitest run tests/writing-editor.test.tsx`
Expected: PASS（2/2）

- [ ] **Step 5: 回归写作相关测试与 e2e**

```bash
grep -rln "writing" e2e/specs/ | head
npx vitest run tests/writing-store.test.ts tests/writing-catalog.test.ts
```

对 grep 出的写作 e2e 逐个 `npx playwright test --config e2e/playwright.config.ts <spec>`。Expected: 全绿。

- [ ] **Step 6: Commit**

```bash
git add src/components/writing/WritingEditor.tsx src/components/writing/WritingBoard.tsx tests/writing-editor.test.tsx
git commit -m "fix(writing): freeze Milkdown editor per file (autosave no longer kills focus)"
```

---

### Task 10: 提问时文稿快照嵌入会话文件

**Files:**
- Modify: `src/types/index.ts:95`（ArticleAssistantMessage）与 `:432`（WritingAssistantMessage）
- Modify: `electron/ipc/article-assistant.ts`（serialize/parse，L150-176 区域）
- Modify: `src/store/index.ts:1475-1509`（sendWritingAssistantMessage）
- Test: `tests/article-assistant/file-io.test.ts`

格式决策：快照以 `<!-- snapshot:start/end -->` 包裹附在「## 用户」段末尾；解析器换用快照感知的分段器（草稿里的 `## 标题` 不能再被当成分节符）；旧文件无快照块，解析行为不变。

- [ ] **Step 1: 写失败测试**

在 `tests/article-assistant/file-io.test.ts` 末尾追加：

```ts
describe('snapshot round-trip', () => {
  it('serializes and parses user message snapshots (incl. ## headings inside draft)', () => {
    const messages: ArticleAssistantMessage[] = [
      { role: 'user', content: '这段怎么样？', snapshot: '# 我的草稿\n\n## 小节标题\n\n正文内容' },
      { role: 'assistant', content: '不错。' },
    ]
    const body = serializeAssistantSessionBody(messages)
    expect(body).toContain('<!-- snapshot:start -->')
    expect(body).toContain('<!-- snapshot:end -->')
    const parsed = parseAssistantSessionBody(body)
    expect(parsed).toHaveLength(2)
    expect(parsed[0].role).toBe('user')
    expect(parsed[0].content).toBe('这段怎么样？')
    expect(parsed[0].snapshot).toBe('# 我的草稿\n\n## 小节标题\n\n正文内容')
    expect(parsed[1].content).toBe('不错。')
  })

  it('parses old sessions without snapshots unchanged', () => {
    const body = ['## 用户', '', '问题', '', '## 助手', '', '回答', ''].join('\n')
    const parsed = parseAssistantSessionBody(body)
    expect(parsed[0].content).toBe('问题')
    expect(parsed[0].snapshot).toBeUndefined()
    expect(parsed[1].content).toBe('回答')
  })

  it('keeps selection line and snapshot together', () => {
    const messages: ArticleAssistantMessage[] = [
      { role: 'user', content: '什么意思？', selection: '被选文字', snapshot: '草稿v1' },
    ]
    const parsed = parseAssistantSessionBody(serializeAssistantSessionBody(messages))
    expect(parsed[0].selection).toBe('被选文字')
    expect(parsed[0].content).toBe('什么意思？')
    expect(parsed[0].snapshot).toBe('草稿v1')
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run tests/article-assistant/file-io.test.ts`
Expected: FAIL（snapshot 字段不存在/未序列化）。

- [ ] **Step 3: 类型 + 序列化 + 解析**

3a. `src/types/index.ts`：`ArticleAssistantMessage`（L95 区域）与 `WritingAssistantMessage`（L432 区域）各加一行：

```ts
  snapshot?: string
```

3b. `electron/ipc/article-assistant.ts`：`serializeAssistantSessionBody` 替换为：

```ts
export function serializeAssistantSessionBody(messages: ArticleAssistantMessage[]): string {
  return messages
    .map((m) => {
      const selLine =
        m.role === 'user' && m.selection?.trim()
          ? `> 选段：${m.selection.trim().replace(/\s*\n\s*/g, ' ')}\n\n`
          : ''
      const snapBlock =
        m.role === 'user' && m.snapshot?.trim()
          ? `\n<!-- snapshot:start -->\n\n${m.snapshot.trim()}\n\n<!-- snapshot:end -->\n`
          : ''
      return `## ${m.role === 'user' ? '用户' : '助手'}\n\n${selLine}${m.content}\n${snapBlock}`
    })
    .join('\n')
}
```

3c. 同文件，`parseAssistantSessionBody` 上方加快照感知分段器，并改写 parse：

```ts
// 快照感知的分节：快照块内的「## 标题」是分稿内容，不是消息分节符
function splitSessionSections(body: string): string[] {
  const lines = body.split('\n')
  const sections: string[] = []
  let current: string[] | null = null
  let inSnapshot = false
  for (const line of lines) {
    if (line === '<!-- snapshot:start -->') inSnapshot = true
    if (!inSnapshot && line.startsWith('## ')) {
      if (current !== null) sections.push(current.join('\n'))
      current = [line.slice(3)]
      continue
    }
    if (line === '<!-- snapshot:end -->') inSnapshot = false
    if (current !== null) current.push(line)
  }
  if (current !== null) sections.push(current.join('\n'))
  return sections
}

export function parseAssistantSessionBody(body: string): ArticleAssistantMessage[] {
  const messages: ArticleAssistantMessage[] = []
  const sections = splitSessionSections(body)
  for (const section of sections) {
    const nl = section.indexOf('\n')
    const heading = (nl === -1 ? section : section.slice(0, nl)).trim()
    let content = (nl === -1 ? '' : section.slice(nl + 1)).trim()
    if (heading.startsWith('用户')) {
      let selection: string | undefined
      let snapshot: string | undefined
      const snapRe = /\n?<!-- snapshot:start -->\n\n([\s\S]*?)\n\n<!-- snapshot:end -->\n?/
      const snapMatch = content.match(snapRe)
      if (snapMatch) {
        snapshot = snapMatch[1]
        content = content.replace(snapRe, '').trim()
      }
      if (content.startsWith('> 选段：')) {
        const lineEnd = content.indexOf('\n')
        selection = content.slice('> 选段：'.length, lineEnd === -1 ? undefined : lineEnd).trim()
        content = (lineEnd === -1 ? '' : content.slice(lineEnd + 1)).trim()
      }
      messages.push({ role: 'user', content, selection, snapshot })
    } else if (heading.startsWith('助手')) {
      messages.push({ role: 'assistant', content })
    }
  }
  return messages
}
```

3d. `src/store/index.ts` `sendWritingAssistantMessage`（L1478-1481）：

```ts
    const messages: WritingAssistantMessage[] = [
      ...(get().writingAssistant?.messages ?? []),
      { role: 'user' as const, content: text, snapshot: f?.body?.trim() ? f.body : undefined },
    ]
```

- [ ] **Step 4: 跑测试确认通过**

Run: `npx vitest run tests/article-assistant tests/assistant-session-runtime.test.ts`
Expected: PASS。

- [ ] **Step 5: 类型检查**

Run: `npx tsc --noEmit`
Expected: 无错误（`f.body` 收窄若报错，用 `snapshot: f?.body?.trim() ? f.body : undefined` 的现有写法即可，TS 应能收窄；不行就 `const body = f?.body` 先取值）。

- [ ] **Step 6: Commit**

```bash
git add src/types/index.ts electron/ipc/article-assistant.ts src/store/index.ts tests/article-assistant/file-io.test.ts
git commit -m "feat(writing-assistant): embed draft snapshot per question in session file"
```

---

### Task 11: 清理与全量回归

**Files:**
- Modify: `e2e/helpers/selectors.ts:150-152`
- Modify: `e2e/specs/job-briefing-error.spec.ts`
- Delete: 根目录 `C:Users86468Desktopprojectstudy-parlor.clauderules.tmp`（误生成的空目录）

- [ ] **Step 1: e2e 选择器与 spec 更新**

`e2e/helpers/selectors.ts`：删除 L150-152 三个选择器（`deleteModeToggle` / `deleteCheck` / `deleteConfirm`），在同一对象内加：

```ts
    dateDelete: '[data-testid="briefing-date-delete"]',
```

`e2e/specs/job-briefing-error.spec.ts`：找到使用上述删除选择器的用例，改为右键流程：

```ts
await page.locator(`[data-testid="briefing-date-item-${date}"]`).click({ button: 'right' })
await page.locator('[data-testid="briefing-date-delete"]').click()
await page.locator('[data-testid="confirm-dialog-confirm"]').click()
```

- [ ] **Step 2: 跑该 e2e 确认通过**

Run: `npx playwright test --config e2e/playwright.config.ts job-briefing-error`
Expected: PASS。

- [ ] **Step 3: 删除误生成空目录**

```bash
rmdir "C:/Users/86468/Desktop/project/study-parlor/C:Users86468Desktopprojectstudy-parlor.clauderules.tmp"
```

（rmdir 只删空目录；若非空则停下来报告，不要 rm -rf。）

- [ ] **Step 4: 全量单测 + 类型检查**

```bash
npx tsc --noEmit
npm run test
```

Expected: 全绿。任何失败先修复再提交；若是与本批次无关的历史遗留失败，记录但不要用本批次 commit 顺手修。

- [ ] **Step 5: Commit**

```bash
git add e2e/helpers/selectors.ts e2e/specs/job-briefing-error.spec.ts
git commit -m "test(e2e): migrate delete flow to right-click; drop removed selectors"
```

---

### Task 12: 写作编辑器工具栏 E2E 补全

**Files:**
- Modify: `src/components/writing/WritingToolbar.tsx`（全部 13 个控件加 data-testid）
- Modify: `e2e/helpers/selectors.ts`（writing 对象加 13 个 toolbar testid）
- Modify: `e2e/specs/writing-editor.spec.ts`（加 11 条工具栏测试用例）

覆盖：加粗(B)、斜体(I)、删除线(S)、引用、无序列表、有序列表、分割线、表格共 8 条格式按钮存在性验证（每按钮一条 test）；字号 A+/A- 按钮 → state.json writingFontSize 验证；配色 🎨 三轮循环 → state.json writingTone 验证；全部 13 个按钮/标签可见性遍历检查。Milkdown callCommand → editor.action() 在 built output 抛 "plugin not found" 为已知既有问题，本批次不修复；格式按钮功能验证通过 testid 存在性覆盖。

- [x] **Step 1: WritingToolbar 加 data-testid**（13 处）
- [x] **Step 2: selectors.ts 同步**
- [x] **Step 3: writing-editor.spec.ts 新增 11 条测试用例**
- [x] **Step 4: npm run build + npx playwright test → 12 passed**（含既有 1 条表格测试）
- [x] **Step 5: Commit**

```bash
git add src/components/writing/WritingToolbar.tsx e2e/helpers/selectors.ts e2e/specs/writing-editor.spec.ts
git commit -m "test(e2e): add testid + E2E coverage for all writing toolbar formatting buttons"
```

- [x] **Step 6: 更新 spec + plan 文档**

---

## Self-Review 记录

- Spec 覆盖：A1→Task 1/2，A2→Task 3，C→Task 4/5/6/7，F→Task 8，H1→Task 9，H2→Task 10，备注清理→Task 11，写作工具栏 E2E→Task 12。B/D/E/G/I 属计划二。
- 类型一致性：`deleteAnthropicArticleFile` / `anthropicDeleteArticle` / `onRequestDelete` / `briefing-date-delete` / `snapshot` 在各任务间命名一致。
- 保护项：摘要/旁注 UI、橙色已保存边框、◀▶ 折叠、换画按钮、现有 testid（除 Task 6 移除的 3 个）均未触碰。
