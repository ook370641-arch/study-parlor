# 夜航简报 debug 修复 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修复夜航简报 5 组生产 bug（求职简报档案入口/JOB_20/骨架屏、删除功能缺失、AI日报导读遮罩、旁注窗口 resize 与溢出、写作新建棕屏），并补齐对应 E2E 覆盖。

**Architecture:** 按 spec `docs/superpowers/specs/2026-07-21-briefing-debug-fixes-design.md` 执行。共享文件（store/types/Briefing.tsx）集中在 Task 4-13 顺序修改避免冲突；写作模块（main 上 writing-editor 8/8 已红）优先级最高，先补诊断设施再修。

**Tech Stack:** Electron 30 + React 18 + TypeScript + Zustand + Vitest + Playwright (CDP over Electron)。

**执行环境注意：** E2E 跑的是 `npm run build` 产物（fixture spawn `electron.exe .`），改完代码必须先 `npm run build` 再跑 playwright。Windows 平台，bash shell。

---

## Task 1: E2E 诊断设施 — 渲染进程 console/pageerror 采集

**Files:**
- Modify: `e2e/fixtures/electron.ts:187-201`

- [ ] **Step 1: 修改 window fixture，挂 console/pageerror 监听并写入测试附件**

把 `window` fixture（`e2e/fixtures/electron.ts:187-201`）整体替换为：

```ts
  window: async ({ electronProcess }, use, testInfo) => {
    const portMatch = electronProcess.cdpUrl.match(/ws:\/\/127\.0\.0\.1:(\d+)/)
    const port = portMatch ? parseInt(portMatch[1], 10) : 9222
    const browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`, { timeout: 60000 })
    try {
      const context = browser.contexts()[0]
      if (!context) throw new Error('No browser context available')

      const page = await getAppPage(context, 30000)

      // 渲染进程诊断采集：此前 fixture 只转发主进程 stdout，渲染进程的
      // uncaught error / unhandledrejection 完全不可见（写作棕屏调查因此
      // 拿不到异常栈）。每个测试都会带上这份附件，失败时可直接定位。
      const consoleLines: string[] = []
      page.on('console', (msg) => {
        if (msg.type() === 'error' || msg.type() === 'warning') {
          consoleLines.push(`[console.${msg.type()}] ${msg.text()}`)
        }
      })
      page.on('pageerror', (err) => {
        consoleLines.push(`[pageerror] ${err.stack ?? err.message}`)
      })

      await page.waitForLoadState('domcontentloaded')
      await use(page)

      if (consoleLines.length > 0) {
        await testInfo.attach('renderer-console', {
          body: consoleLines.join('\n'),
          contentType: 'text/plain',
        })
      }
    } finally {
      await browser.close()
    }
  },
```

- [ ] **Step 2: 验证 fixture 语法**

Run: `npx tsc --noEmit`
Expected: 通过（playwright 的 `testInfo.attach` 是既有 API）。

- [ ] **Step 3: Commit**

```bash
git add e2e/fixtures/electron.ts
git commit -m "test(e2e): fixture 采集渲染进程 console/pageerror 附件"
```

---

## Task 2: 复现写作棕屏并钉死异常

**Files:** 无修改（诊断任务）

- [ ] **Step 1: 构建并跑写作编辑器 spec**

Run: `npm run build && npx playwright test --config e2e/playwright.config.ts e2e/specs/writing-editor.spec.ts -g "新建→编辑器输入" --retries=0`
Expected（调查 agent 已实证，此处复核）：FAIL，`writing-editor` 元素 not found，失败截图为纯棕色空屏。

- [ ] **Step 2: 读取 renderer-console 附件，钉死异常**

在 `e2e-results/` 下找到该测试的结果目录，读取 `renderer-console` 附件（playwright 报告或结果目录中的 attachment）。

Run: `npx playwright show-report` 或直接检查 `e2e-results/**/renderer-console*`
Expected: 至少一条 `[pageerror]` 记录。**把异常文本与栈的第一帧记录到执行笔记里**，它就是 Task 3-5 修复后要消除的目标。如果没有任何 pageerror，说明不是渲染异常而是状态问题，转去检查 store 的 `writingFile` 状态（在 spec 里加一行 `window.evaluate(() => (window as any).useStore.getState().writingFile)` 临时打印）。

---

## Task 3: App 级 ErrorBoundary

**Files:**
- Create: `src/components/ErrorBoundary.tsx`
- Modify: `src/App.tsx:214-227`

- [ ] **Step 1: 创建 ErrorBoundary 组件**

```tsx
import { Component, type ReactNode } from 'react'
import { useStore } from '@/store'

interface Props {
  children: ReactNode
}

interface State {
  error: Error | null
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: unknown) {
    console.error('[ErrorBoundary]', error, info)
  }

  render() {
    if (this.state.error) {
      return (
        <ErrorFallback
          error={this.state.error}
          onReset={() => this.setState({ error: null })}
        />
      )
    }
    return this.props.children
  }
}

// 模块私有组件，不导出（ui-styling §10：组件文件只导出组件，私有函数/组件不影响 Fast Refresh）
function ErrorFallback({ error, onReset }: { error: Error; onReset: () => void }) {
  const goto = useStore((s) => s.goto)
  return (
    <div
      data-testid="app-error-fallback"
      className="h-full flex flex-col items-center justify-center gap-4 p-8 text-parchment"
    >
      <p className="text-lg font-serif">页面出现异常</p>
      <p className="text-sm text-parchment/50 max-w-md text-center break-all">{error.message}</p>
      <div className="flex gap-3">
        <button
          data-testid="app-error-retry"
          className="px-4 py-2 rounded bg-ember text-white text-sm hover:bg-ember/90"
          onClick={onReset}
        >
          重试
        </button>
        <button
          data-testid="app-error-home"
          className="px-4 py-2 rounded border border-parchment/30 text-sm text-parchment/80 hover:border-parchment/60"
          onClick={() => {
            onReset()
            goto('home')
          }}
        >
          返回首页
        </button>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: App.tsx 用 ErrorBoundary 包裹页面 Suspense**

`src/App.tsx:217-227`，把：

```tsx
      {!isBooting && (
        <Suspense fallback={null}>
          {page === 'cover' && <Cover />}
          {page === 'home' && <Home />}
          {page === 'study' && <Study />}
          {page === 'profile' && <Profile />}
          {page === 'extension' && <Extension />}
          {page === 'settings' && <Settings />}
          {page === 'briefing' && <Briefing />}
        </Suspense>
      )}
```

改为：

```tsx
      {!isBooting && (
        <ErrorBoundary>
          <Suspense fallback={null}>
            {page === 'cover' && <Cover />}
            {page === 'home' && <Home />}
            {page === 'study' && <Study />}
            {page === 'profile' && <Profile />}
            {page === 'extension' && <Extension />}
            {page === 'settings' && <Settings />}
            {page === 'briefing' && <Briefing />}
          </Suspense>
        </ErrorBoundary>
      )}
```

并在文件顶部 import 区加：

```ts
import { ErrorBoundary } from '@/components/ErrorBoundary'
```

- [ ] **Step 3: 验证编译**

Run: `npx tsc --noEmit`
Expected: 通过。

- [ ] **Step 4: Commit**

```bash
git add src/components/ErrorBoundary.tsx src/App.tsx
git commit -m "feat(app): App 级 ErrorBoundary，渲染异常降级为局部错误页而非棕屏"
```

---

## Task 4: selectWritingFile 竞态 + saveWritingFile 非空断言 + body 兜底

**Files:**
- Modify: `src/store/index.ts:330`（模块级变量区）、`1494-1511`

- [ ] **Step 1: 加模块级序号变量**

`src/store/index.ts:330` 附近（`let wildcardRequestId = 0` 之后）加：

```ts
// selectWritingFile 的单调序号：并发/交错的文件选中后写先赢时，丢弃过期的
// writingRead 结果（rules general §7）。
let writingSelectSeq = 0
```

- [ ] **Step 2: 替换 selectWritingFile 与 saveWritingFile**

`src/store/index.ts:1494-1511`，把：

```ts
  selectWritingFile: async (filePath: string | null) => {
    if (!filePath) return set({ writingFile: null })
    const cur = get().writingFile
    if (cur?.dirty) await get().saveWritingFile()
    const r = await ipc.writingRead({ path: filePath })
    if (r.ok) set({ writingFile: { path: filePath, body: r.value.body, dirty: false, saving: 'idle' }, lastWritingFile: filePath })
    else set({ writingError: r.message })
  },

  updateWritingBody: (body: string) => set(s => s.writingFile ? { writingFile: { ...s.writingFile, body, dirty: true } } : {}),

  saveWritingFile: async () => {
    const f = get().writingFile
    if (!f || !f.dirty) return
    set({ writingFile: { ...f, saving: 'saving' as const } })
    const r = await ipc.writingWrite({ path: f.path, body: f.body })
    set({ writingFile: { ...get().writingFile!, dirty: !r.ok, saving: r.ok ? 'saved' as const : 'error' as const } })
  },
```

替换为：

```ts
  selectWritingFile: async (filePath: string | null) => {
    const seq = ++writingSelectSeq
    if (!filePath) return set({ writingFile: null })
    const cur = get().writingFile
    if (cur?.dirty) await get().saveWritingFile()
    const r = await ipc.writingRead({ path: filePath })
    if (seq !== writingSelectSeq) return // 更新的选中已发出，丢弃过期结果
    if (r.ok) set({ writingFile: { path: filePath, body: r.value.body ?? '', dirty: false, saving: 'idle' }, lastWritingFile: filePath })
    else set({ writingError: r.message })
  },

  updateWritingBody: (body: string) => set(s => s.writingFile ? { writingFile: { ...s.writingFile, body, dirty: true } } : {}),

  saveWritingFile: async () => {
    const f = get().writingFile
    if (!f || !f.dirty) return
    set({ writingFile: { ...f, saving: 'saving' as const } })
    const r = await ipc.writingWrite({ path: f.path, body: f.body })
    const cur = get().writingFile
    if (!cur || cur.path !== f.path) return // 保存期间文件已切换/关闭，丢弃过期结果
    set({ writingFile: { ...cur, dirty: !r.ok, saving: r.ok ? 'saved' as const : 'error' as const } })
  },
```

（`r.value.body ?? ''` 兜底：Milkdown `defaultValueCtx` 拿到 undefined 可能初始化异常。）

- [ ] **Step 3: 验证编译与单测**

Run: `npx tsc --noEmit && npm run test`
Expected: 全部通过。

- [ ] **Step 4: Commit**

```bash
git add src/store/index.ts
git commit -m "fix(writing): selectWritingFile 序号防后发先至 + saveWritingFile 去非空断言 + body 兜底"
```

---

## Task 5: WritingListColumn 自动选中条件化

**Files:**
- Create: `src/lib/writing-tree-utils.ts`
- Modify: `src/components/writing/WritingListColumn.tsx:27-36`

- [ ] **Step 1: 创建 renderer 安全的树工具函数**

`src/lib/writing-tree-utils.ts`：

```ts
import type { WritingTreeNode } from '@shared/index'

/** 判断 path 是否仍存在于写作树（writing 或 repository 任意深度）。 */
export function writingTreeContainsPath(
  tree: { writing: WritingTreeNode[]; repository: WritingTreeNode[] } | null,
  path: string
): boolean {
  if (!tree) return false
  const walk = (nodes?: WritingTreeNode[]): boolean =>
    !!nodes?.some((n) => n.path === path || walk(n.children))
  return walk(tree.writing) || walk(tree.repository)
}
```

- [ ] **Step 2: 修改自动选中 effect**

`src/components/writing/WritingListColumn.tsx:27-36`，把：

```ts
  useEffect(() => {
    if (tree?.writing?.[0]) {
      const first = tree.writing[0]
      if (first.kind === 'file') {
        selectWritingFile(first.path)
      } else if (first.children?.[0]?.kind === 'file') {
        selectWritingFile(first.children[0].path)
      }
    }
  }, [tree, selectWritingFile])
```

替换为：

```ts
  // 只在「没有选中文件」或「当前文件已不在树里」（被外部删除）时自动选中第一篇。
  // 否则新建文章后的 tree 刷新会把编辑器从新文件抢走（时序竞争）。
  useEffect(() => {
    const current = useStore.getState().writingFile
    if (current && writingTreeContainsPath(tree, current.path)) return
    if (tree?.writing?.[0]) {
      const first = tree.writing[0]
      if (first.kind === 'file') {
        selectWritingFile(first.path)
      } else if (first.children?.[0]?.kind === 'file') {
        selectWritingFile(first.children[0].path)
      }
    }
  }, [tree, selectWritingFile])
```

文件顶部 import 区加：

```ts
import { writingTreeContainsPath } from '@/lib/writing-tree-utils'
```

（`useStore` 已在该文件 import。）

- [ ] **Step 3: 验证编译与单测**

Run: `npx tsc --noEmit && npm run test`
Expected: 全部通过。

- [ ] **Step 4: Commit**

```bash
git add src/lib/writing-tree-utils.ts src/components/writing/WritingListColumn.tsx
git commit -m "fix(writing): 自动选中不与新建/显式选中打架（当前文件在树中则不抢）"
```

---

## Task 6: 恢复 merge 77ed09e 误删的 6 个写作持久化字段

**Files:**
- Modify: `src/types/index.ts:471-474`（StateJson 尾部）
- Modify: `electron/ipc/state.ts:26-31`（DEFAULT 尾部）
- Modify: `src/store/index.ts:434-436`（init() hydration）
- Modify: `e2e/helpers/test-library.ts:461-464`（BASE_STATE 尾部）

- [ ] **Step 1: StateJson 补字段**

`src/types/index.ts` 的 `StateJson`（`assistantThinkingEffort?: AssistantThinkingEffort` 之后、`}` 之前）加：

```ts
  writingFontSize?: BriefingFontSize
  writingTone?: WritingTone
  writingListTab?: 'articles' | 'repository'
  writingAssistantWidth?: number
  writingAssistantOpen?: boolean
  lastWritingFile?: string | null
```

- [ ] **Step 2: state.ts DEFAULT 补默认值**

`electron/ipc/state.ts:30`（`jobProfile: DEFAULT_JOB_PROFILE,` 之后）加：

```ts
  writingFontSize: 'base',
  writingTone: 'parchment',
  writingListTab: 'articles',
  writingAssistantWidth: 320,
  writingAssistantOpen: false,
  lastWritingFile: null,
```

- [ ] **Step 3: store init() 补 hydration**

`src/store/index.ts` 的 `init()` 里 `assistantThinkingEffort: state.assistantThinkingEffort ?? 'off',`（第 434 行）之后加：

```ts
      writingFontSize: state.writingFontSize ?? 'base',
      writingTone: state.writingTone ?? 'parchment',
      writingListTab: state.writingListTab ?? 'articles',
      writingAssistantWidth: state.writingAssistantWidth ?? 320,
      writingAssistantOpen: state.writingAssistantOpen ?? false,
      lastWritingFile: state.lastWritingFile ?? null,
```

- [ ] **Step 4: BASE_STATE 补默认值（e2e §6：seed 工厂与 schema 同步）**

`e2e/helpers/test-library.ts` 的 `BASE_STATE`（`assistantThinkingEffort: 'off',` 之后）加：

```ts
  writingFontSize: 'base',
  writingTone: 'parchment',
  writingListTab: 'articles',
  writingAssistantWidth: 320,
  writingAssistantOpen: false,
  lastWritingFile: null,
```

- [ ] **Step 5: 验证编译与单测**

Run: `npx tsc --noEmit && npm run test`
Expected: 全部通过。

- [ ] **Step 6: 重跑 writing-editor spec 确认修复**

Run: `npm run build && npx playwright test --config e2e/playwright.config.ts e2e/specs/writing-editor.spec.ts --retries=0`
Expected: **8/8 PASS**（Task 2 钉死的 pageerror 不再出现；若仍失败，读 renderer-console 附件按异常栈继续修，不要跳过）。

- [ ] **Step 7: Commit**

```bash
git add src/types/index.ts electron/ipc/state.ts src/store/index.ts e2e/helpers/test-library.ts
git commit -m "fix(writing): 恢复 77ed09e 误删的 6 个持久化字段（types/DEFAULT/hydration/BASE_STATE）"
```

---

## Task 7: JOB_20 错误归一化 — job-error-codes 模块 + 单元测试

**Files:**
- Create: `electron/lib/job-error-codes.ts`
- Test: `tests/job-error-codes.test.ts`
- Modify: `src/types/index.ts:341-347`（JobErrorCode 联合类型）

- [ ] **Step 1: JobErrorCode 加 TIMEOUT**

`src/types/index.ts:341-347`：

```ts
export type JobErrorCode =
  | 'MISSING_SEARCH_KEY'
  | 'NETWORK_ERROR'
  | 'OFFICIAL_PAGE_FAILED'
  | 'EXTRACTION_ERROR'
  | 'EMPTY_RESULTS'
  | 'CACHE_WRITE_FAILED'
  | 'TIMEOUT'
```

- [ ] **Step 2: 写失败的单元测试**

`tests/job-error-codes.test.ts`：

```ts
import { describe, it, expect } from 'vitest'
import { toJobErrorCode } from '../electron/lib/job-error-codes'

describe('toJobErrorCode', () => {
  it('maps AbortError (DOMException code 20) to TIMEOUT', () => {
    const err = new DOMException('The operation was aborted', 'AbortError')
    expect(toJobErrorCode(err)).toBe('TIMEOUT')
  })

  it('maps abort-like shapes to TIMEOUT', () => {
    expect(toJobErrorCode({ name: 'AbortError' })).toBe('TIMEOUT')
    expect(toJobErrorCode({ code: 20 })).toBe('TIMEOUT')
    expect(toJobErrorCode({ code: 'TIMEOUT' })).toBe('TIMEOUT')
  })

  it('passes through known domain codes', () => {
    expect(toJobErrorCode(Object.assign(new Error('x'), { code: 'EMPTY_RESULTS' }))).toBe('EMPTY_RESULTS')
    expect(toJobErrorCode(Object.assign(new Error('x'), { code: 'MISSING_SEARCH_KEY' }))).toBe('MISSING_SEARCH_KEY')
    expect(toJobErrorCode(Object.assign(new Error('x'), { code: 'CACHE_WRITE_FAILED' }))).toBe('CACHE_WRITE_FAILED')
  })

  it('falls back to NETWORK_ERROR for unknown shapes', () => {
    expect(toJobErrorCode(new Error('boom'))).toBe('NETWORK_ERROR')
    expect(toJobErrorCode({ code: 500 })).toBe('NETWORK_ERROR')
    expect(toJobErrorCode(null)).toBe('NETWORK_ERROR')
    expect(toJobErrorCode(undefined)).toBe('NETWORK_ERROR')
    expect(toJobErrorCode('plain string')).toBe('NETWORK_ERROR')
  })
})
```

- [ ] **Step 3: 跑测试确认失败**

Run: `npx vitest run tests/job-error-codes.test.ts`
Expected: FAIL（模块不存在）。

- [ ] **Step 4: 实现 job-error-codes.ts**

`electron/lib/job-error-codes.ts`：

```ts
import type { JobErrorCode } from '@shared/index'

const KNOWN_JOB_ERROR_CODES: readonly JobErrorCode[] = [
  'MISSING_SEARCH_KEY',
  'NETWORK_ERROR',
  'OFFICIAL_PAGE_FAILED',
  'EXTRACTION_ERROR',
  'EMPTY_RESULTS',
  'CACHE_WRITE_FAILED',
  'TIMEOUT',
]

/**
 * 把任意上游异常归一化为领域错误码（feature-development §3）。
 * fetch 被 AbortController 中止时 reject DOMException（name='AbortError'，
 * code=20）——它曾以 "JOB_20" 的形式原样冒泡给用户。统一映射为 TIMEOUT，
 * 绝不把原始数字 code 拼进错误消息。
 */
export function toJobErrorCode(err: unknown): JobErrorCode {
  const e = err as { name?: unknown; code?: unknown } | null | undefined
  if (e?.name === 'AbortError' || e?.code === 20 || e?.code === 'TIMEOUT') return 'TIMEOUT'
  if (typeof e?.code === 'string' && (KNOWN_JOB_ERROR_CODES as readonly string[]).includes(e.code)) {
    return e.code as JobErrorCode
  }
  return 'NETWORK_ERROR'
}
```

- [ ] **Step 5: 跑测试确认通过**

Run: `npx vitest run tests/job-error-codes.test.ts`
Expected: 4/4 PASS。

- [ ] **Step 6: Commit**

```bash
git add electron/lib/job-error-codes.ts tests/job-error-codes.test.ts src/types/index.ts
git commit -m "feat(job-briefing): toJobErrorCode 错误归一化（AbortError/code 20 → TIMEOUT）"
```

---

## Task 8: 综合生成独立计时 + IPC 归一化 + UI 文案

**Files:**
- Modify: `electron/lib/job-briefing.ts:620-633`（synthesis 段）
- Modify: `electron/ipc/job-briefing.ts:39`（缓存错误正则）、`131-147`（总超时与 catch）
- Modify: `src/components/BriefingError.tsx:8-27`
- Modify: `src/store/index.ts:607-616`（generateJobBriefing catch 映射）

- [ ] **Step 1: synthesis 独立 300s 计时 + 归一化抛出**

`electron/lib/job-briefing.ts:620-633`，把：

```ts
  // ── 综合生成 ──
  opts.emitProgress?.('synthesizing')
  const synthesisPrompt = readPrompt('synthesize')
    .replace('{{profile}}', formatJobProfile(profile))
    .replace('{{eventsJson}}', JSON.stringify(events, null, 2))
    .replace('{{jobsJson}}', JSON.stringify(matchedJobs, null, 2))
    .replace('{{questionsJson}}', JSON.stringify(questions, null, 2))

  const content = await chatNonStream(cfg, {
    messages: [{ role: 'user', content: synthesisPrompt } as Message],
    temperature: 0.5,
    thinking: { type: 'enabled', reasoning_effort: 'high' },
    signal: opts.signal,
  })
```

替换为：

```ts
  // ── 综合生成 ──
  opts.emitProgress?.('synthesizing')
  const synthesisPrompt = readPrompt('synthesize')
    .replace('{{profile}}', formatJobProfile(profile))
    .replace('{{eventsJson}}', JSON.stringify(events, null, 2))
    .replace('{{jobsJson}}', JSON.stringify(matchedJobs, null, 2))
    .replace('{{questionsJson}}', JSON.stringify(questions, null, 2))

  // 独立 300s 计时，不与其他阶段共享总预算：reasoning_effort:'high' 常跑数分钟，
  // 共享预算曾在此阶段误 abort，DOMException code=20 以 "JOB_20" 冒泡给用户。
  const synthesisCtl = new AbortController()
  const synthesisTimeout = setTimeout(() => synthesisCtl.abort(), 300_000)
  let content: string
  try {
    content = await chatNonStream(cfg, {
      messages: [{ role: 'user', content: synthesisPrompt } as Message],
      temperature: 0.5,
      thinking: { type: 'enabled', reasoning_effort: 'high' },
      signal: synthesisCtl.signal,
    })
  } catch (err) {
    const code = toJobErrorCode(err)
    throw Object.assign(new Error(code), { code: code as JobErrorCode })
  } finally {
    clearTimeout(synthesisTimeout)
  }
```

文件顶部 import 区加：

```ts
import { toJobErrorCode } from './job-error-codes'
```

- [ ] **Step 2: IPC 层去总超时 + 归一化 + 缓存正则补 TIMEOUT**

`electron/ipc/job-briefing.ts:39` 的正则，把：

```ts
      const errorMatch = body.trim().match(/^##\s*Error\s*\n\s*(JOB_(MISSING_SEARCH_KEY|NETWORK_ERROR|OFFICIAL_PAGE_FAILED|EXTRACTION_ERROR|EMPTY_RESULTS|CACHE_WRITE_FAILED))$/)
```

改为：

```ts
      const errorMatch = body.trim().match(/^##\s*Error\s*\n\s*(JOB_(MISSING_SEARCH_KEY|NETWORK_ERROR|OFFICIAL_PAGE_FAILED|EXTRACTION_ERROR|EMPTY_RESULTS|CACHE_WRITE_FAILED|TIMEOUT))$/)
```

`electron/ipc/job-briefing.ts:131-147`，把：

```ts
    const config = getConfig()
    const profile = normalizeJobProfile(getCurrentState().jobProfile)
    const llmCtl = new AbortController()
    const llmTimeout = setTimeout(() => llmCtl.abort(), 300_000)

    try {
      const result = await generateJobBriefing(cfg, config, profile, date, {
        emitProgress: (stage, detail) => emitProgress(stage, detail),
        signal: llmCtl.signal,
      })
      return result
    } catch (err: any) {
      const code = err?.code || 'NETWORK_ERROR'
      throw new Error(`JOB_${code}`)
    } finally {
      clearTimeout(llmTimeout)
    }
```

替换为：

```ts
    const config = getConfig()
    const profile = normalizeJobProfile(getCurrentState().jobProfile)

    // 不再使用 300s 总预算 signal：各阶段自带超时与降级（chatNonStream 300s、
    // Tavily/页面抓取各自超时），综合生成有独立 300s 计时。总预算曾在长综合
    // 阶段误杀请求，冒出 DOMException code=20（即用户看到的 "JOB_20"）。
    try {
      return await generateJobBriefing(cfg, config, profile, date, {
        emitProgress: (stage, detail) => emitProgress(stage, detail),
      })
    } catch (err: any) {
      throw new Error(`JOB_${toJobErrorCode(err)}`)
    }
```

文件顶部 import 区加：

```ts
import { toJobErrorCode } from '../lib/job-error-codes'
```

- [ ] **Step 3: BriefingError 补 TIMEOUT 文案 + 未知 code 不裸显**

`src/components/BriefingError.tsx` 的 `MESSAGES`（`JOB_CACHE_WRITE_FAILED` 行之后）加两条：

```ts
  TIMEOUT: { text: '生成超时，请重试。', showRetry: true },
  JOB_TIMEOUT: { text: '生成超时，请重试。', showRetry: true },
```

第 27 行 fallback 改为不裸显原始 code（含 IPC 包装噪音）：

```ts
  const { text, showRetry } = MESSAGES[code] ?? { text: '简报生成失败，请重试。', showRetry: true }
```

- [ ] **Step 4: store 错误映射补 TIMEOUT**

`src/store/index.ts:609-615`，把：

```ts
      const error = raw.includes('MISSING_SEARCH_KEY') ? 'MISSING_SEARCH_KEY'
        : raw.includes('NETWORK_ERROR') ? 'NETWORK_ERROR'
```

改为（TIMEOUT 必须在 NETWORK_ERROR 之前判断，但二者无子串重叠，顺序安全）：

```ts
      const error = raw.includes('MISSING_SEARCH_KEY') ? 'MISSING_SEARCH_KEY'
        : raw.includes('TIMEOUT') ? 'TIMEOUT'
        : raw.includes('NETWORK_ERROR') ? 'NETWORK_ERROR'
```

- [ ] **Step 5: 验证编译与单测**

Run: `npx tsc --noEmit && npm run test`
Expected: 全部通过。

- [ ] **Step 6: Commit**

```bash
git add electron/lib/job-briefing.ts electron/ipc/job-briefing.ts src/components/BriefingError.tsx src/store/index.ts
git commit -m "fix(job-briefing): 综合生成独立 300s 计时 + JOB_20 归一化为 JOB_TIMEOUT + UI 文案"
```

---

## Task 9: briefingStage 按源拆分 + BriefingProgress fallback

**Files:**
- Modify: `src/store/index.ts:118`（State 字段声明）、`381`（初始值）、`599-619`（generateJobBriefing）
- Modify: `src/pages/Briefing.tsx:50`（stage 读取）、`243-250`（job loading 分支）
- Modify: `src/components/BriefingProgress.tsx:28`

- [ ] **Step 1: store 加 jobBriefingStage 字段**

`src/store/index.ts:118`（`briefingStage: BriefingStage | null` 之后）加：

```ts
  jobBriefingStage: BriefingStage | null
```

`src/store/index.ts:381`（`briefingStage: null,` 之后）加：

```ts
  jobBriefingStage: null,
```

- [ ] **Step 2: generateJobBriefing 改用 jobBriefingStage**

`src/store/index.ts:599-619`，把：

```ts
  generateJobBriefing: async (date, opts) => {
    const s = get()
    if (s.jobBriefing.loading) return
    set({ jobBriefing: { result: null, loading: true, error: null }, briefingStage: 'scanning-events' })
    const unsubscribe = ipc.onBriefingProgress((stage) => set({ briefingStage: stage }))
    try {
      const result = await ipc.jobBriefingGenerate({ date, force: opts?.force })
      set({ jobBriefing: { result, loading: false, error: null }, briefingStage: null })
    } catch (err: any) {
```

和结尾的：

```ts
      set({ jobBriefing: { result: null, loading: false, error }, briefingStage: null })
```

改为（三处 `briefingStage` → `jobBriefingStage`）：

```ts
  generateJobBriefing: async (date, opts) => {
    const s = get()
    if (s.jobBriefing.loading) return
    set({ jobBriefing: { result: null, loading: true, error: null }, jobBriefingStage: 'scanning-events' })
    const unsubscribe = ipc.onBriefingProgress((stage) => set({ jobBriefingStage: stage }))
    try {
      const result = await ipc.jobBriefingGenerate({ date, force: opts?.force })
      set({ jobBriefing: { result, loading: false, error: null }, jobBriefingStage: null })
    } catch (err: any) {
```

```ts
      set({ jobBriefing: { result: null, loading: false, error }, jobBriefingStage: null })
```

（digest 侧 `generateBriefing` 继续独占 `briefingStage`，两源不再互相覆写。）

- [ ] **Step 3: Briefing.tsx job 分支读 jobBriefingStage**

`src/pages/Briefing.tsx:50`（`const stage = useStore((s) => s.briefingStage)` 之后）加：

```ts
  const jobStage = useStore((s) => s.jobBriefingStage)
```

`src/pages/Briefing.tsx:243-250`（job loading 分支），把：

```tsx
                {stage ? (
                  <BriefingProgress stage={stage} />
                ) : (
                  <BriefingSkeleton data-testid="briefing-skeleton" />
                )}
```

改为：

```tsx
                {jobStage ? (
                  <BriefingProgress stage={jobStage} />
                ) : (
                  <BriefingSkeleton data-testid="briefing-skeleton" />
                )}
```

（digest 分支 `src/pages/Briefing.tsx:309-316` 保持用 `stage` 不变。）

- [ ] **Step 4: BriefingProgress 未知 stage 显式 fallback**

`src/components/BriefingProgress.tsx:28`，把：

```ts
  const currentIndex = STAGES.findIndex((s) => s.key === stage)
```

改为：

```ts
  const foundIndex = STAGES.findIndex((s) => s.key === stage)
  // 防御：stage key 不属于当前源（跨源串味等历史遗留状态）时显式回退到
  // 第一阶段激活，不再静默渲染成 5 行全灰（看似「无文字闪烁条」）。
  const currentIndex = foundIndex === -1 ? 0 : foundIndex
```

- [ ] **Step 5: 验证编译与单测**

Run: `npx tsc --noEmit && npm run test`
Expected: 全部通过。

- [ ] **Step 6: 回归 digest/job 生成 E2E**

Run: `npm run build && npx playwright test --config e2e/playwright.config.ts e2e/specs/briefing-generation.spec.ts e2e/specs/job-briefing-generation.spec.ts --retries=0`
Expected: 全部 PASS。

- [ ] **Step 7: Commit**

```bash
git add src/store/index.ts src/pages/Briefing.tsx src/components/BriefingProgress.tsx
git commit -m "fix(briefing): briefingStage 按源拆分，求职/日报进度互不覆写 + 未知 stage 显式回退"
```

---

## Task 10: 常驻求职档案入口 + Settings 返回来源页

**Files:**
- Modify: `src/store/index.ts:190`（goto 声明区）、`478`（goto 实现）
- Modify: `src/components/BriefingHeader.tsx:6-11`（Props）、`85-107`（右侧控制区）
- Modify: `src/pages/Briefing.tsx:137-160`（BriefingHeader 调用）
- Modify: `src/pages/Settings.tsx:220-226`（返回按钮）

- [ ] **Step 1: store 加 settingsReturnTo**

`src/store/index.ts` 的 State 接口（`goto: (p: Page) => void` 声明附近，约 190 行）加字段声明：

```ts
  settingsReturnTo: Page | null
```

初始值区（`currentPage: 'cover',` 约 358 行之后）加：

```ts
  settingsReturnTo: null,
```

`src/store/index.ts:478` 的 goto 实现，把：

```ts
  goto: (p) => set({ currentPage: p }),
```

改为：

```ts
  // 进入 settings 时记录来源页，Settings 返回按钮优先回来源页（缺省 home）。
  goto: (p) => set((s) => ({
    currentPage: p,
    settingsReturnTo: p === 'settings' ? s.currentPage : s.settingsReturnTo,
  })),
```

- [ ] **Step 2: BriefingHeader 加档案入口**

`src/components/BriefingHeader.tsx` 的 Props（第 6-11 行）加：

```ts
interface Props {
  displayDate: string
  timeString?: string
  sourceStatus?: Record<string, 'ok' | 'failed'>
  cacheWriteFailed?: boolean
  /** 求职简报源下在 Header 右侧显示常驻「求职档案」入口 */
  showJobProfileEntry?: boolean
}
```

组件签名与 store hooks（第 13-22 行）加：

```ts
export function BriefingHeader({
  displayDate,
  timeString,
  sourceStatus,
  cacheWriteFailed,
  showJobProfileEntry,
}: Props) {
  const theme = useStore((s) => s.briefingTheme)
  const fontSize = useStore((s) => s.briefingFontSize)
  const increase = useStore((s) => s.increaseBriefingFontSize)
  const decrease = useStore((s) => s.decreaseBriefingFontSize)
  const goto = useStore((s) => s.goto)
```

右侧控制区（第 85-86 行，`<div className="flex items-center gap-1 ml-auto">` 之后、字号 `-` 按钮之前）插入：

```tsx
        {showJobProfileEntry && (
          <Button
            variant="ghost"
            data-testid="job-briefing-profile-entry"
            onClick={() => goto('settings')}
            className={ghostOverride}
            title="编辑求职档案（意向岗位、方向、经历）"
          >
            档案
          </Button>
        )}
```

- [ ] **Step 3: Briefing.tsx 传 showJobProfileEntry**

`src/pages/Briefing.tsx:137` 的 `<BriefingHeader` 调用，在 props 里加一行：

```tsx
        <BriefingHeader
          showJobProfileEntry={isJob}
          displayDate={...（保持不变）}
```

- [ ] **Step 4: Settings 返回按钮回来源页**

`src/pages/Settings.tsx:220-226`，把：

```tsx
              <button
                data-testid="settings-back-button"
                onClick={() => goto('home')}
                className="text-parchment/70 hover:text-parchment text-sm bg-transparent border-none cursor-pointer font-sans"
              >
                返回夜话
              </button>
```

改为：

```tsx
              <button
                data-testid="settings-back-button"
                onClick={() => goto(settingsReturnTo ?? 'home')}
                className="text-parchment/70 hover:text-parchment text-sm bg-transparent border-none cursor-pointer font-sans"
              >
                返回夜话
              </button>
```

并在组件内（Settings 函数体前部，其他 `useStore` 调用附近）加：

```ts
  const settingsReturnTo = useStore((s) => s.settingsReturnTo)
```

- [ ] **Step 5: 验证编译与单测**

Run: `npx tsc --noEmit && npm run test`
Expected: 全部通过。

- [ ] **Step 6: Commit**

```bash
git add src/store/index.ts src/components/BriefingHeader.tsx src/pages/Briefing.tsx src/pages/Settings.tsx
git commit -m "feat(job-briefing): Header 常驻档案入口 + Settings 返回来源页（settingsReturnTo）"
```

---

## Task 11: 删除 IPC（briefing:delete / job-briefing:delete）四层同步

**Files:**
- Modify: `src/types/index.ts:519-520`（IpcApi briefing 区）、`652-653`（IpcApi job 区）
- Modify: `electron/ipc/briefing.ts:507-519`（briefing:list 之后）
- Modify: `electron/ipc/job-briefing.ts:150-161`（job-briefing:list 之后）
- Modify: `electron/preload.ts:95-100`
- Modify: `src/lib/ipc.ts:70-75`
- Modify: `src/store/index.ts`（StoreActions 接口约 163 行区 + 实现约 597/630 行区）

- [ ] **Step 1: IpcApi 类型**

`src/types/index.ts` 的 IpcApi，`briefingList: () => Promise<{ date: string; filePath: string }[]>` 之后加：

```ts
  briefingDelete: (args: { filePath: string }) => Promise<{ ok: true } | { ok: false; message: string }>
```

`jobBriefingList: () => Promise<{ date: string; filePath: string }[]>` 之后加：

```ts
  jobBriefingDelete: (args: { filePath: string }) => Promise<{ ok: true } | { ok: false; message: string }>
```

- [ ] **Step 2: 主进程 handler — briefing:delete**

`electron/ipc/briefing.ts` 的 `briefing:list` handler 之后（第 519 行 `})` 之后、`registerBriefingIpc` 收尾 `}` 之前）加：

```ts
  ipcMain.handle('briefing:delete', async (_, args: { filePath: string }) => {
    try {
      const dir = path.resolve(briefingDir(cfg))
      const abs = path.resolve(args.filePath)
      if (!abs.startsWith(dir + path.sep) || !fs.existsSync(abs)) {
        return { ok: false as const, message: '文件不存在或路径非法' }
      }
      fs.rmSync(abs)
      return { ok: true as const }
    } catch (err: any) {
      return { ok: false as const, message: err.message || String(err) }
    }
  })
```

- [ ] **Step 3: 主进程 handler — job-briefing:delete**

`electron/ipc/job-briefing.ts` 的 `job-briefing:list` handler 之后（第 161 行 `})` 之后）加：

```ts
  ipcMain.handle('job-briefing:delete', async (_, args: { filePath: string }) => {
    try {
      const dir = path.resolve(jobBriefingDir(cfg))
      const abs = path.resolve(args.filePath)
      if (!abs.startsWith(dir + path.sep) || !fs.existsSync(abs)) {
        return { ok: false as const, message: '文件不存在或路径非法' }
      }
      fs.rmSync(abs)
      return { ok: true as const }
    } catch (err: any) {
      return { ok: false as const, message: err.message || String(err) }
    }
  })
```

- [ ] **Step 4: preload 暴露**

`electron/preload.ts:96`（`briefingList` 之后）加：

```ts
  briefingDelete: (args) => ipcRenderer.invoke('briefing:delete', args),
```

`electron/preload.ts:99`（`jobBriefingList` 之后）加：

```ts
  jobBriefingDelete: (args) => ipcRenderer.invoke('job-briefing:delete', args),
```

- [ ] **Step 5: facade 暴露**

`src/lib/ipc.ts:71`（`briefingList` getter 之后）加：

```ts
  get briefingDelete() { return ensure().briefingDelete },
```

`src/lib/ipc.ts:74`（`jobBriefingList` getter 之后）加：

```ts
  get jobBriefingDelete() { return ensure().jobBriefingDelete },
```

- [ ] **Step 6: store actions**

StoreActions 接口（`loadJobBriefingHistory: () => Promise<void>` 声明之后，约 163 行）加：

```ts
  deleteBriefings: (filePaths: string[]) => Promise<void>
  deleteJobBriefings: (filePaths: string[]) => Promise<void>
```

实现（`loadBriefingHistory` 实现之后，约 597 行）加：

```ts
  deleteBriefings: async (filePaths) => {
    const current = get().briefing.result?.filePath
    for (const p of filePaths) {
      await ipc.briefingDelete({ filePath: p })
    }
    if (current && filePaths.includes(current)) {
      set({ briefing: { result: null, loading: false, error: null } })
    }
    await get().loadBriefingHistory()
  },
```

实现（`loadJobBriefingHistory` 实现之后，约 630 行）加：

```ts
  deleteJobBriefings: async (filePaths) => {
    const current = get().jobBriefing.result?.filePath
    for (const p of filePaths) {
      await ipc.jobBriefingDelete({ filePath: p })
    }
    if (current && filePaths.includes(current)) {
      set({ jobBriefing: { result: null, loading: false, error: null } })
    }
    await get().loadJobBriefingHistory()
  },
```

- [ ] **Step 7: 验证编译与单测**

Run: `npx tsc --noEmit && npm run test`
Expected: 全部通过。

- [ ] **Step 8: Commit**

```bash
git add src/types/index.ts electron/ipc/briefing.ts electron/ipc/job-briefing.ts electron/preload.ts src/lib/ipc.ts src/store/index.ts
git commit -m "feat(briefing): 删除 IPC briefing:delete / job-briefing:delete 四层同步 + store actions"
```

---

## Task 12: BriefingDateColumn 选择删除模式

**Files:**
- Modify: `src/components/BriefingDateColumn.tsx`

- [ ] **Step 1: 重写 BriefingDateColumn 支持选择删除**

整体替换 `src/components/BriefingDateColumn.tsx` 为：

```tsx
import { useState } from 'react'

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
  /** 提供时显示 🗑 进入选择删除模式；确认时回传选中的条目 */
  onDelete?: (items: BriefingHistoryItem[]) => void
}

function formatLabel(date: string): string {
  const [y, m, d] = date.split('-').map(Number)
  if ([y, m, d].some((n) => Number.isNaN(n))) return date
  return `${m}月${d}日`
}

export function BriefingDateColumn({ collapsed, history, currentDate, today, onSelect, onReceiveToday, theme, todayLabel = '查收日报', onDelete }: Props) {
  const isAcademic = theme !== 'newspaper'
  const [selectMode, setSelectMode] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())

  const itemBase = isAcademic
    ? 'text-parchment/70 hover:bg-parchment/10 hover:text-parchment'
    : 'text-[#6b5d52] hover:bg-black/5 hover:text-[#1a1a1a]'
  const activeItem = isAcademic
    ? 'bg-ember/20 text-ember border border-ember/40'
    : 'bg-[#1a1a1a] text-white'

  // Today is always rendered as the synthetic top entry, so drop any history
  // record for today. Otherwise a generated-today briefing appears both as the
  // synthetic entry and in `history`, producing a duplicate React key.
  const past = history.filter((h) => h.date !== today)
  const entries = [{ date: today, filePath: '', isToday: true }, ...past.map((h) => ({ ...h, isToday: false }))]

  const exitSelectMode = () => {
    setSelectMode(false)
    setSelected(new Set())
  }

  const toggleSelected = (filePath: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(filePath)) next.delete(filePath)
      else next.add(filePath)
      return next
    })
  }

  if (collapsed) {
    const latest = past[0]
    return (
      <div className="flex flex-col items-center py-3 px-1 gap-3">
        <button
          data-testid="briefing-date-today-mini"
          onClick={onReceiveToday}
          title={todayLabel}
          className={`w-8 h-8 rounded flex items-center justify-center ${isAcademic ? 'bg-ember/20 text-ember' : 'bg-[#1a1a1a] text-white'}`}
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

  // 选择删除模式：列出全部历史（含今天，只要文件存在），勾选后统一删除。
  if (selectMode) {
    const selectedItems = history.filter((h) => selected.has(h.filePath))
    return (
      <div className="p-2 space-y-1" data-testid="briefing-date-column">
        {history.length === 0 && (
          <div className={`px-3 py-2 text-xs ${isAcademic ? 'text-parchment/40' : 'text-[#6b5d52]'}`}>
            暂无可删除的简报
          </div>
        )}
        {history.map((h) => (
          <label
            key={h.date}
            className={`flex items-center gap-2 w-full text-left px-3 py-2 rounded text-sm cursor-pointer ${itemBase}`}
          >
            <input
              type="checkbox"
              data-testid={`briefing-delete-check-${h.date}`}
              checked={selected.has(h.filePath)}
              onChange={() => toggleSelected(h.filePath)}
              className="accent-ember shrink-0"
            />
            <span>{formatLabel(h.date)}{h.date === today ? '（今天）' : ''}</span>
          </label>
        ))}
        <div className="flex gap-2 pt-2">
          <button
            data-testid="briefing-delete-confirm"
            disabled={selectedItems.length === 0}
            onClick={() => {
              onDelete?.(selectedItems)
              exitSelectMode()
            }}
            className="flex-1 px-3 py-1.5 rounded text-xs bg-[#8a3a3a] text-parchment disabled:opacity-40 hover:bg-[#9a4444]"
          >
            删除所选({selectedItems.length})
          </button>
          <button
            data-testid="briefing-delete-cancel"
            onClick={exitSelectMode}
            className={`px-3 py-1.5 rounded text-xs ${isAcademic ? 'text-parchment/60 hover:text-parchment' : 'text-[#6b5d52] hover:text-[#1a1a1a]'}`}
          >
            取消
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="p-2 space-y-1" data-testid="briefing-date-column">
      {onDelete && history.length > 0 && (
        <div className="flex justify-end pb-1">
          <button
            data-testid="briefing-delete-mode-toggle"
            onClick={() => setSelectMode(true)}
            title="选择删除简报"
            aria-label="选择删除简报"
            className={`text-sm ${isAcademic ? 'text-parchment/40 hover:text-parchment/80' : 'text-[#6b5d52]/60 hover:text-[#6b5d52]'}`}
          >
            🗑
          </button>
        </div>
      )}
      {entries.map((entry) => {
        const isCurrent = entry.date === currentDate
        return (
          <button
            key={entry.date}
            data-testid={`briefing-date-item-${entry.date}`}
            onClick={() => (entry.isToday ? onReceiveToday() : onSelect(entry.date))}
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
    </div>
  )
}
```

- [ ] **Step 2: 验证编译**

Run: `npx tsc --noEmit && npm run test`
Expected: 通过（onDelete 为可选 prop，现有调用方不受影响）。

- [ ] **Step 3: Commit**

```bash
git add src/components/BriefingDateColumn.tsx
git commit -m "feat(briefing): 日期列 🗑 选择删除模式（勾选 + 删除所选/取消）"
```

---

## Task 13: Briefing.tsx 接 ConfirmDialog + 接线删除

**Files:**
- Modify: `src/pages/Briefing.tsx`

- [ ] **Step 1: 加 imports 与状态**

`src/pages/Briefing.tsx` 顶部 import 区加：

```ts
import { ConfirmDialog } from '@/components/ConfirmDialog'
import type { BriefingHistoryItem } from '@/components/BriefingDateColumn'
```

组件内（第 66 行 `const [profileHintDismissed, setProfileHintDismissed] = useState(false)` 之后）加：

```ts
  const [pendingDelete, setPendingDelete] = useState<BriefingHistoryItem[] | null>(null)
  const deleteBriefings = useStore((s) => s.deleteBriefings)
  const deleteJobBriefings = useStore((s) => s.deleteJobBriefings)
```

- [ ] **Step 2: 两个 BriefingDateColumn 调用传 onDelete**

digest 侧（第 171-179 行）加一行 prop：

```tsx
              <BriefingDateColumn
                collapsed={dateColumnCollapsed}
                history={historyList}
                currentDate={result?.date}
                today={today}
                onSelect={(date) => generateBriefing(date)}
                onReceiveToday={() => generateBriefing(today)}
                onDelete={(items) => setPendingDelete(items)}
                theme={theme}
              />
```

job 侧（第 191-200 行）同样加：

```tsx
              <BriefingDateColumn
                collapsed={dateColumnCollapsed}
                history={jobHistoryList}
                currentDate={jobResult?.date}
                today={today}
                onSelect={(date) => generateJobBriefing(date)}
                onReceiveToday={() => generateJobBriefing(today)}
                todayLabel="生成简报"
                onDelete={(items) => setPendingDelete(items)}
                theme={theme}
              />
```

- [ ] **Step 3: 渲染 ConfirmDialog**

组件 return 的最外层 div 收尾（第 377 行 `{source === 'writing' && <WritingAssistantPanel />}` 之后）加：

```tsx
      <ConfirmDialog
        open={pendingDelete !== null}
        title="删除简报"
        icon="trash"
        confirmLabel="删除"
        confirmVariant="danger"
        onCancel={() => setPendingDelete(null)}
        onConfirm={() => {
          const items = pendingDelete ?? []
          setPendingDelete(null)
          const paths = items.map((i) => i.filePath)
          if (source === 'job-briefing') {
            void deleteJobBriefings(paths)
          } else {
            void deleteBriefings(paths)
          }
        }}
      >
        <p>即将删除 {pendingDelete?.length ?? 0} 篇简报：</p>
        <ul className="list-disc pl-5 mt-2">
          {(pendingDelete ?? []).map((i) => (
            <li key={i.date}>{i.date}</li>
          ))}
        </ul>
        <p className="mt-2">删除「今天」的简报后，再次点击今天将重新生成。</p>
      </ConfirmDialog>
```

- [ ] **Step 4: 验证编译与单测**

Run: `npx tsc --noEmit && npm run test`
Expected: 全部通过。

- [ ] **Step 5: Commit**

```bash
git add src/pages/Briefing.tsx
git commit -m "feat(briefing): 删除确认对话框接线（ConfirmDialog + store 删除 + 当前展示清理）"
```

---

## Task 14: 导读遮罩 — ArticleAssistantPanel z-index + newspaper 分隔符

**Files:**
- Modify: `src/components/article-assistant/ArticleAssistantPanel.tsx:72`
- Modify: `src/components/article-assistant/GuideSidebar.tsx:57`

- [ ] **Step 1: 根容器补 z-[5] + testid**

`src/components/article-assistant/ArticleAssistantPanel.tsx:72`，把：

```tsx
    <div ref={containerRef} className="relative flex h-full shrink-0">
```

改为：

```tsx
    <div ref={containerRef} data-testid="article-assistant-panel" className="relative z-[5] flex h-full shrink-0">
```

（academic 主题下页面有 `z-[1]` 的 72% 压暗遮罩 `Briefing.tsx:112-117`，正文/侧栏/日期列均有 `z-[5]`，唯独本面板没有 → 导读被罩。补 z-[5] 同时覆盖 digest 与 job-briefing 两个挂载点。）

- [ ] **Step 2: newspaper 主题分隔符去 parchment 色**

`src/components/article-assistant/GuideSidebar.tsx:57`，把：

```tsx
                        <span className="text-parchment/50 mx-1">·</span>
```

改为：

```tsx
                        <span className={`mx-1 ${isAcademic ? 'text-parchment/50' : 'text-[#6b5d52]/60'}`}>·</span>
```

- [ ] **Step 3: 验证编译与单测**

Run: `npx tsc --noEmit && npm run test`
Expected: 全部通过。

- [ ] **Step 4: Commit**

```bash
git add src/components/article-assistant/ArticleAssistantPanel.tsx src/components/article-assistant/GuideSidebar.tsx
git commit -m "fix(guide): 导读面板补 z-[5] 站上压暗遮罩 + newspaper 分隔符去 parchment 色"
```

---

## Task 15: 旁注 ResizeHandles — 锚定统一 + 位置补偿 + 视口 clamp

**Files:**
- Modify: `src/components/article-assistant/ResizeHandles.tsx`
- Modify: `src/components/article-assistant/ChatWindow.tsx:247-251`

- [ ] **Step 1: 重写 ResizeHandles**

整体替换 `src/components/article-assistant/ResizeHandles.tsx` 为：

```tsx
import { useRef } from 'react'

export type ResizeHandle = 'nw' | 'ne' | 'sw' | 'se'

export interface ResizeResult {
  width: number
  height: number
  x: number
  y: number
}

export function ResizeHandles({
  onResize,
  minWidth,
  minHeight,
}: {
  onResize: (next: ResizeResult) => void
  minWidth: number
  minHeight: number
}) {
  const startRef = useRef<{ x: number; y: number; left: number; top: number; width: number; height: number } | null>(null)

  const handlePointerDown = (dir: ResizeHandle) => (e: React.PointerEvent) => {
    e.preventDefault()
    e.stopPropagation()
    const el = (e.target as HTMLElement).parentElement!
    const rect = el.getBoundingClientRect()
    startRef.current = { x: e.clientX, y: e.clientY, left: rect.left, top: rect.top, width: rect.width, height: rect.height }
    ;(e.target as HTMLElement).setPointerCapture(e.pointerId)

    const onMove = (ev: PointerEvent) => {
      const s = startRef.current
      if (!s) return
      const dx = ev.clientX - s.x
      const dy = ev.clientY - s.y
      const fixedRight = s.left + s.width
      const fixedBottom = s.top + s.height

      let width = s.width + dx * (dir.includes('e') ? 1 : -1)
      let height = s.height + dy * (dir.includes('s') ? 1 : -1)

      // 最小尺寸；向左/向上最多扩展到视口边缘（固定边为界）
      width = Math.max(minWidth, width)
      if (dir.includes('w')) width = Math.min(width, fixedRight)
      height = Math.max(minHeight, height)
      if (dir.includes('n')) height = Math.min(height, fixedBottom)

      // handle 对边钉死、被拖边跟随光标：w/n 方向同步补偿 left/top
      const left = dir.includes('w') ? fixedRight - width : s.left
      const top = dir.includes('n') ? fixedBottom - height : s.top

      // 右/下不超出视口
      width = Math.min(width, window.innerWidth - left)
      height = Math.min(height, window.innerHeight - top)

      onResize({ width, height, x: left, y: top })
    }

    const onUp = () => {
      ;(e.target as HTMLElement).releasePointerCapture(e.pointerId)
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      startRef.current = null
    }

    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }

  const base = 'absolute w-3 h-3 z-10'
  return (
    <>
      <div data-testid="resize-handle-nw" className={`${base} top-0 left-0 cursor-nw-resize`} onPointerDown={handlePointerDown('nw')} />
      <div data-testid="resize-handle-ne" className={`${base} top-0 right-0 cursor-ne-resize`} onPointerDown={handlePointerDown('ne')} />
      <div data-testid="resize-handle-sw" className={`${base} bottom-0 left-0 cursor-sw-resize`} onPointerDown={handlePointerDown('sw')} />
      <div data-testid="resize-handle-se" className={`${base} bottom-0 right-0 cursor-se-resize`} onPointerDown={handlePointerDown('se')} />
    </>
  )
}
```

- [ ] **Step 2: ChatWindow 消费位置补偿**

`src/components/article-assistant/ChatWindow.tsx:247-251`，把：

```tsx
      <ResizeHandles
        onResize={(delta) =>
          setSize({ width: Math.max(MIN_W, delta.width), height: Math.max(MIN_H, delta.height) })
        }
      />
```

改为：

```tsx
      <ResizeHandles
        minWidth={MIN_W}
        minHeight={MIN_H}
        onResize={(next) => {
          setSize({ width: next.width, height: next.height })
          // 每次 resize 都把锚点统一为 left/top（消除 right/bottom 与 left/top
          // 二态），position 一旦设置，style 里的 right/bottom 即失效。
          setPosition({ x: next.x, y: next.y })
        }}
      />
```

- [ ] **Step 3: 验证编译与单测**

Run: `npx tsc --noEmit && npm run test`
Expected: 全部通过。

- [ ] **Step 4: Commit**

```bash
git add src/components/article-assistant/ResizeHandles.tsx src/components/article-assistant/ChatWindow.tsx
git commit -m "fix(assistant): resize 对角钉死 + left/top 统一锚定 + 视口 clamp"
```

---

## Task 16: 旁注输入行 — min-w-0 / shrink-0 / 三控件右侧化 + 阈值隐藏

**Files:**
- Modify: `src/components/article-assistant/ChatWindow.tsx:169-244`

- [ ] **Step 1: 三控件包 wrapper 移到 input 之后，input 加 min-w-0，发送加 shrink-0**

`src/components/article-assistant/ChatWindow.tsx:169-244`（Input area 整段），把：

```tsx
      {/* Input area */}
      <div className="p-2 border-t border-parchment/10 flex items-center gap-1.5 shrink-0">
        <button
          data-testid="article-assistant-search-btn"
          ...（三个按钮原样）...
        </button>
        <input
          data-testid="article-assistant-input"
          className="flex-1 bg-[#0c0806] border border-parchment/20 rounded px-2 py-1 text-sm text-parchment/90 placeholder:text-parchment/40 outline-none focus:border-ember/50"
          ...
        />
        {session.streaming ? (
          <button
            data-testid="article-assistant-stop-btn"
            className="text-xs text-ember hover:text-ember/80 whitespace-nowrap px-1"
            ...
          >
            停止
          </button>
        ) : (
          <button
            data-testid="article-assistant-send-btn"
            className="text-xs text-parchment/80 hover:text-ember whitespace-nowrap px-1"
            ...
          >
            发送
          </button>
        )}
      </div>
```

改为（结构：`input` → 三控件 wrapper → 发送/停止）：

```tsx
      {/* Input area：input(min-w-0) 可收缩，发送(shrink-0) 常驻，
          三控件在小窗(<320px)整体隐藏（size.width 是组件内 state，
          Tailwind 视口断点无效，必须用阈值类名）。 */}
      <div className="p-2 border-t border-parchment/10 flex items-center gap-1.5 shrink-0">
        <input
          data-testid="article-assistant-input"
          className="flex-1 min-w-0 bg-[#0c0806] border border-parchment/20 rounded px-2 py-1 text-sm text-parchment/90 placeholder:text-parchment/40 outline-none focus:border-ember/50"
          placeholder="问点什么……"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              handleSend()
            }
          }}
        />
        <div
          data-testid="assistant-extras"
          className={`items-center gap-1.5 ${size.width < 320 ? 'hidden' : 'flex'}`}
        >
          <button
            data-testid="article-assistant-search-btn"
            className={`px-1.5 py-1 rounded text-sm transition-colors duration-200 disabled:opacity-30 disabled:cursor-not-allowed ${
              searchEnabled ? 'text-sky-400' : 'text-parchment/40 hover:text-parchment/70'
            }`}
            onClick={toggleAssistantSearch}
            disabled={session.streaming || session.searchLoading}
            aria-pressed={searchEnabled}
            aria-label={searchEnabled ? '搜索已开启' : '搜索已关闭'}
            title={searchEnabled ? '搜索已开启 — 发送时将联网搜索' : '搜索已关闭 — 点击开启联网搜索'}
          >
            {session.searchLoading ? (
              <span className="inline-block w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin align-middle" />
            ) : (
              '🔍'
            )}
          </button>
          <button
            data-testid="article-assistant-socratic-btn"
            className={`px-1.5 py-1 rounded text-sm transition-colors duration-200 disabled:opacity-30 disabled:cursor-not-allowed ${
              socraticMode ? 'text-sky-400' : 'text-parchment/40 hover:text-parchment/70'
            }`}
            onClick={toggleAssistantSocratic}
            disabled={session.streaming || session.searchLoading}
            aria-pressed={socraticMode}
            aria-label={socraticMode ? '苏格拉底模式已开启' : '苏格拉底模式已关闭'}
            title="苏格拉底学习模式：关闭后只做信息检索，不再质询"
          >
            🎓
          </button>
          <button
            data-testid="article-assistant-thinking-btn"
            className={`relative px-1.5 py-1 rounded text-sm transition-colors duration-200 disabled:opacity-30 disabled:cursor-not-allowed ${
              thinkingEffort !== 'off' ? 'text-sky-400' : 'text-parchment/40 hover:text-parchment/70'
            }`}
            onClick={cycleAssistantThinkingEffort}
            disabled={session.streaming || session.searchLoading}
            aria-label={`深度思考：${thinkingEffort === 'off' ? '关闭' : thinkingEffort === 'high' ? '高' : '最高'}`}
            title={`深度思考：${thinkingEffort === 'off' ? '关闭' : thinkingEffort === 'high' ? '高' : '最高（MAX）'} — 点击切换`}
          >
            🧠
            {thinkingEffort === 'max' && (
              <span className="absolute -top-1 -right-1 text-[8px] leading-none font-bold">MAX</span>
            )}
          </button>
        </div>
        {session.streaming ? (
          <button
            data-testid="article-assistant-stop-btn"
            className="shrink-0 text-xs text-ember hover:text-ember/80 whitespace-nowrap px-1"
            onClick={abortAssistantStream}
          >
            停止
          </button>
        ) : (
          <button
            data-testid="article-assistant-send-btn"
            className="shrink-0 text-xs text-parchment/80 hover:text-ember whitespace-nowrap px-1"
            onClick={() => handleSend()}
          >
            发送
          </button>
        )}
      </div>
```

- [ ] **Step 2: 验证编译与单测**

Run: `npx tsc --noEmit && npm run test`
Expected: 全部通过。

- [ ] **Step 3: Commit**

```bash
git add src/components/article-assistant/ChatWindow.tsx
git commit -m "fix(assistant): input min-w-0 + 发送 shrink-0 常驻 + 三控件右侧化小窗(<320px)隐藏"
```

---

## Task 17: E2E — seedJobBriefing + 求职简报失败/重试/重进/档案/删除

**Files:**
- Modify: `e2e/helpers/test-library.ts:552`（seedBriefing 之后）
- Modify: `e2e/helpers/selectors.ts:141`（briefing 区 receiveJobButton 之后）
- Create: `e2e/specs/job-briefing-error.spec.ts`

- [ ] **Step 1: seedJobBriefing helper**

`e2e/helpers/test-library.ts` 的 `seedBriefing` 函数之后加：

```ts
/**
 * Seed 一份求职简报缓存文件（`<libPath>/求职简报/求职简报-<date>.md`）。
 * body 传 `## Error\nJOB_XXX` 时命中主进程失败注入口
 * （electron/ipc/job-briefing.ts 的缓存错误 rethrow 分支），用于确定性
 * 覆盖失败路径——mock fast path 永远成功，失败分支此前零执行。
 */
export function seedJobBriefing(libPath: string, date: string, content: string): void {
  const dir = path.join(libPath, '求职简报')
  fs.mkdirSync(dir, { recursive: true })
  const filePath = path.join(dir, `求职简报-${date}.md`)
  const fm = `---
title: 求职简报
type: job-briefing
created: '${new Date().toISOString()}'
tags:
  - job-briefing
  - ai-product
date: '${date}'
---

`
  fs.writeFileSync(filePath, fm + content, 'utf8')
}
```

- [ ] **Step 2: selectors 补充**

`e2e/helpers/selectors.ts` 的 `briefing` 区（`receiveJobButton` 行之后）加：

```ts
    jobProfileEntry: '[data-testid="job-briefing-profile-entry"]',
    deleteModeToggle: '[data-testid="briefing-delete-mode-toggle"]',
    deleteCheck: (date: string) => `[data-testid="briefing-delete-check-${date}"]`,
    deleteConfirm: '[data-testid="briefing-delete-confirm"]',
    confirmDialog: '[data-testid="confirm-dialog"]',
    confirmDialogConfirm: '[data-testid="confirm-dialog-confirm"]',
```

- [ ] **Step 3: 写失败/重试/重进 spec**

`e2e/specs/job-briefing-error.spec.ts`：

```ts
import { test, expect } from '../fixtures/electron'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { CoverPage } from '../pages/CoverPage'
import { SELECTORS } from '../helpers/selectors'
import { seedJobBriefing } from '../helpers/test-library'

function localToday(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

async function gotoJobBriefing(window: any) {
  const cover = new CoverPage(window)
  await cover.enterName('E2E 测试员')
  await cover.goToBriefing()
  await expect(window.locator(SELECTORS.briefing.sourceSidebar)).toBeVisible({ timeout: 10000 })
  await window.locator(SELECTORS.briefing.sourceJobBriefingButton).click()
}

test.describe('@p1 job-briefing 失败路径', () => {
  test('缓存错误 → 错误 UI + 重试按钮 + 正确文案', async ({ window, testLibraryPath }) => {
    seedJobBriefing(testLibraryPath, localToday(), `## Error\nJOB_NETWORK_ERROR`)
    await gotoJobBriefing(window)

    await window.locator(SELECTORS.briefing.receiveJobButton).click()
    await expect(window.locator(SELECTORS.briefing.errorDisplay)).toBeVisible({ timeout: 15000 })
    await expect(window.locator(SELECTORS.briefing.errorDisplay)).toContainText('网络异常')
    await expect(window.locator(SELECTORS.briefing.retryButton)).toBeVisible()
  })

  test('MISSING_SEARCH_KEY → 无重试按钮', async ({ window, testLibraryPath }) => {
    seedJobBriefing(testLibraryPath, localToday(), `## Error\nJOB_MISSING_SEARCH_KEY`)
    await gotoJobBriefing(window)

    await window.locator(SELECTORS.briefing.receiveJobButton).click()
    await expect(window.locator(SELECTORS.briefing.errorDisplay)).toBeVisible({ timeout: 15000 })
    await expect(window.locator(SELECTORS.briefing.errorDisplay)).toContainText('Tavily')
    await expect(window.locator(SELECTORS.briefing.retryButton)).toHaveCount(0)
  })

  test('错误态点重试 → force 绕过错误缓存 → mock 成功', async ({ window, testLibraryPath }) => {
    seedJobBriefing(testLibraryPath, localToday(), `## Error\nJOB_NETWORK_ERROR`)
    await gotoJobBriefing(window)

    await window.locator(SELECTORS.briefing.receiveJobButton).click()
    await expect(window.locator(SELECTORS.briefing.errorDisplay)).toBeVisible({ timeout: 15000 })

    await window.locator(SELECTORS.briefing.retryButton).click()
    // E2E mock fast path 生成固定内容
    await expect(window.locator('text=今日新动态')).toBeVisible({ timeout: 30000 })
    await expect(window.locator(SELECTORS.briefing.errorDisplay)).toHaveCount(0)
  })

  test('失败后离开再回来 → 显示错误 UI，不卡骨架屏', async ({ window, testLibraryPath }) => {
    seedJobBriefing(testLibraryPath, localToday(), `## Error\nJOB_NETWORK_ERROR`)
    await gotoJobBriefing(window)

    await window.locator(SELECTORS.briefing.receiveJobButton).click()
    await expect(window.locator(SELECTORS.briefing.errorDisplay)).toBeVisible({ timeout: 15000 })

    // 切到日报源再切回求职源
    await window.locator(SELECTORS.briefing.sourceDigestButton).click()
    await window.locator(SELECTORS.briefing.sourceJobBriefingButton).click()

    await expect(window.locator(SELECTORS.briefing.errorDisplay)).toBeVisible({ timeout: 15000 })
    await expect(window.locator(SELECTORS.briefing.skeleton)).toHaveCount(0)
  })
})

test.describe('@p1 job-briefing 档案入口', () => {
  test('常驻入口可见 → 进入设置 → 返回落到求职简报页', async ({ window }) => {
    await gotoJobBriefing(window)

    const entry = window.locator(SELECTORS.briefing.jobProfileEntry)
    await expect(entry).toBeVisible()
    await entry.click()

    await expect(window.locator('[data-testid="settings-page"]')).toBeVisible({ timeout: 10000 })
    await window.locator('[data-testid="settings-back-button"]').click()

    // returnTo：回到 briefing 页而非 home
    await expect(window.locator(SELECTORS.briefing.page)).toBeVisible({ timeout: 10000 })
    await expect(window.locator(SELECTORS.briefing.jobProfileEntry)).toBeVisible()
  })
})

test.describe('@p1 简报删除', () => {
  test('选择删除模式 → 勾选 → 确认 → 文件与列表条目消失', async ({ window, testLibraryPath }) => {
    const content = `## 今日新动态\n\n- 测试条目`
    seedJobBriefing(testLibraryPath, '2026-07-19', content)
    seedJobBriefing(testLibraryPath, '2026-07-20', content)
    await gotoJobBriefing(window)

    // 等待历史列表加载出两条往期
    await expect(window.locator(SELECTORS.briefing.dateItem('2026-07-20'))).toBeVisible({ timeout: 10000 })
    await expect(window.locator(SELECTORS.briefing.dateItem('2026-07-19'))).toBeVisible()

    await window.locator(SELECTORS.briefing.deleteModeToggle).click()
    await window.locator(SELECTORS.briefing.deleteCheck('2026-07-19')).click()
    await window.locator(SELECTORS.briefing.deleteConfirm).click()

    await expect(window.locator(SELECTORS.briefing.confirmDialog)).toBeVisible()
    await window.locator(SELECTORS.briefing.confirmDialogConfirm).click()

    // 文件从磁盘删除，列表条目消失，另一条保留
    await expect(window.locator(SELECTORS.briefing.dateItem('2026-07-19'))).toHaveCount(0, { timeout: 10000 })
    await expect(window.locator(SELECTORS.briefing.dateItem('2026-07-20'))).toBeVisible()
    expect(fs.existsSync(path.join(testLibraryPath, '求职简报', '求职简报-2026-07-19.md'))).toBe(false)
    expect(fs.existsSync(path.join(testLibraryPath, '求职简报', '求职简报-2026-07-20.md'))).toBe(true)
  })
})
```

- [ ] **Step 4: 构建并跑新 spec**

Run: `npm run build && npx playwright test --config e2e/playwright.config.ts e2e/specs/job-briefing-error.spec.ts --retries=0`
Expected: 6/6 PASS。

- [ ] **Step 5: Commit**

```bash
git add e2e/helpers/test-library.ts e2e/helpers/selectors.ts e2e/specs/job-briefing-error.spec.ts
git commit -m "test(e2e): 求职简报失败/重试/重进不卡骨架/档案入口/删除 全链路覆盖"
```

---

## Task 18: E2E — 写作空库新建 + Chrome 存活探针 + 持久化读回

**Files:**
- Create: `e2e/specs/writing-empty-create.spec.ts`

- [ ] **Step 1: 写空库新建 spec**

`e2e/specs/writing-empty-create.spec.ts`：

```ts
import { test, expect } from '../fixtures/electron'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { CoverPage } from '../pages/CoverPage'
import { WritingPage } from '../pages/WritingPage'
import { SELECTORS } from '../helpers/selectors'

test.describe('@p1 writing 空库新建', () => {
  test('空 writing/ → 新建第一篇 → 编辑器立即可输入且全局 Chrome 存活', async ({ window, testLibraryPath }) => {
    // 不 seed 任何 writing 文件——用户最常见的首次路径
    const cover = new CoverPage(window)
    await cover.enterName('E2E 测试员')
    await cover.goToBriefing()
    await expect(window.locator(SELECTORS.briefing.sourceSidebar)).toBeVisible({ timeout: 10000 })
    await window.locator(SELECTORS.writing.sourceButton).click()
    await expect(window.locator(SELECTORS.writing.listTabArticles)).toBeVisible({ timeout: 15000 })

    const writing = new WritingPage(window)
    await expect(writing.boardEmpty).toBeVisible({ timeout: 10000 })

    await writing.newFileButton.click()
    await window.getByTestId('writing-prompt-input').fill('第一篇')
    await window.getByTestId('writing-prompt-confirm').click()

    // 无固定 sleep：轮询等待编辑器出现
    await expect(writing.editor).toBeVisible({ timeout: 10000 })

    // 全局 Chrome 存活探针：整树卸载时 sidebar 也会消失
    await expect(window.locator(SELECTORS.briefing.sourceSidebar)).toBeVisible()

    await writing.typeInEditor('空库第一篇的内容')
    await expect(writing.saveStatus).toContainText('已保存', { timeout: 8000 })

    expect(fs.existsSync(path.join(testLibraryPath, 'writing', '第一篇.md'))).toBe(true)
    expect(fs.readFileSync(path.join(testLibraryPath, 'writing', '第一篇.md'), 'utf8')).toContain('空库第一篇的内容')
  })

  test('多文件下新建 → 编辑器是新文件而非自动选中的首篇', async ({ window, testLibraryPath }) => {
    const { seedWritingTree } = await import('../helpers/test-library')
    seedWritingTree(testLibraryPath)

    const cover = new CoverPage(window)
    await cover.enterName('E2E 测试员')
    await cover.goToBriefing()
    await expect(window.locator(SELECTORS.briefing.sourceSidebar)).toBeVisible({ timeout: 10000 })
    await window.locator(SELECTORS.writing.sourceButton).click()
    await expect(window.locator(SELECTORS.writing.listTabArticles)).toBeVisible({ timeout: 15000 })

    const writing = new WritingPage(window)
    // 新文件名「zzz-最后」按排序不在首位，专抓自动选中竞争
    await writing.newFileButton.click()
    await window.getByTestId('writing-prompt-input').fill('zzz-最后')
    await window.getByTestId('writing-prompt-confirm').click()

    await expect(writing.editor).toBeVisible({ timeout: 10000 })
    // store 里当前文件必须是新文件
    const currentPath = await window.evaluate(() => (window as any).useStore.getState().writingFile?.path ?? '')
    expect(currentPath).toContain('zzz-最后')
  })

  test('写作字号 reload 后读回（hydration 回归）', async ({ window, testLibraryPath }) => {
    const { seedWritingTree } = await import('../helpers/test-library')
    seedWritingTree(testLibraryPath)

    const cover = new CoverPage(window)
    await cover.enterName('E2E 测试员')
    await cover.goToBriefing()
    await expect(window.locator(SELECTORS.briefing.sourceSidebar)).toBeVisible({ timeout: 10000 })
    await window.locator(SELECTORS.writing.sourceButton).click()
    await expect(window.locator(SELECTORS.writing.listTabArticles)).toBeVisible({ timeout: 15000 })

    await window.evaluate(() => (window as any).useStore.getState().setWritingFontSize('xl'))
    await window.waitForTimeout(500) // patchState IPC 落盘缓冲

    await window.reload()
    await window.waitForLoadState('domcontentloaded')
    const cover2 = new CoverPage(window)
    await cover2.enterIfNeeded('E2E 测试员')
    await cover2.goToBriefing()
    await expect(window.locator(SELECTORS.briefing.sourceSidebar)).toBeVisible({ timeout: 10000 })

    const size = await window.evaluate(() => (window as any).useStore.getState().writingFontSize)
    expect(size).toBe('xl')
  })
})
```

（`cover.enterIfNeeded` 与 `setWritingFontSize('xl')` 的合法档位以 `src/lib/briefing-font-size.ts` 的 `BRIEFING_FONT_SIZES` 为准——若 `'xl'` 不在枚举中，改用枚举里的任一档位。）

- [ ] **Step 2: 构建并跑新 spec**

Run: `npm run build && npx playwright test --config e2e/playwright.config.ts e2e/specs/writing-empty-create.spec.ts --retries=0`
Expected: 3/3 PASS。

- [ ] **Step 3: Commit**

```bash
git add e2e/specs/writing-empty-create.spec.ts
git commit -m "test(e2e): 写作空库新建/自动选中竞争/字号持久化读回"
```

---

## Task 19: E2E — 导读可见性 + 旁注 resize/小窗

**Files:**
- Create: `e2e/specs/guide-visibility.spec.ts`
- Create: `e2e/specs/article-assistant-resize.spec.ts`

- [ ] **Step 1: 导读可见性 spec（z-index 回归 + newspaper 主题色）**

`e2e/specs/guide-visibility.spec.ts`：

```ts
import { test, expect } from '../fixtures/electron'
import { CoverPage } from '../pages/CoverPage'
import { ArticleAssistantPage } from '../pages/ArticleAssistantPage'
import { SELECTORS } from '../helpers/selectors'
import { seedBriefing } from '../helpers/test-library'
import type { Page } from '@playwright/test'

function localToday(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// 与 article-assistant-guide.spec.ts 相同的确定性 mock 路径
const DIGEST_CONTENT = `## AI Safety

### Box CEO Aaron Levie
Aaron Levie 讨论了 AI 安全与对齐在企业工作流中的落地。

## 原始来源
### Aaron Levie
- [tweet](https://x.com/levie/status/1)`

async function openDigestWithGuide(window: Page, libPath: string): Promise<ArticleAssistantPage> {
  seedBriefing(libPath, localToday(), DIGEST_CONTENT)
  const cover = new CoverPage(window)
  await cover.enterName('E2E 测试员')
  await cover.goToBriefing()
  await window.locator(SELECTORS.briefing.receiveDigestButton).click()
  await expect(window.locator(SELECTORS.briefing.academicLayout)).toBeVisible({ timeout: 15000 })
  const assistant = new ArticleAssistantPage(window)
  await assistant.waitForMounted()
  return assistant
}

test.describe('@p2 导读可见性', () => {
  test('academic 主题导读面板 z-index 站上压暗遮罩', async ({ window, testLibraryPath }) => {
    const assistant = await openDigestWithGuide(window, testLibraryPath)
    await assistant.waitForGuideLoaded()

    // z-[1] 全屏压暗遮罩存在时，面板必须 z-[5]（此前缺失 → 导读被罩住看不清）
    const panel = window.locator('[data-testid="article-assistant-panel"]')
    await expect(panel).toHaveCSS('z-index', '5')
  })

  test('newspaper 主题导读卡片为亮色（深色 token 不泄漏）', async ({ window, testLibraryPath }) => {
    const assistant = await openDigestWithGuide(window, testLibraryPath)
    await assistant.waitForGuideLoaded()

    await window.locator(SELECTORS.briefing.themeToggle).click()
    await expect(window.locator(SELECTORS.briefing.newspaperLayout)).toBeVisible({ timeout: 10000 })

    const chunk = window.locator(SELECTORS.articleAssistant.guideChunk).first()
    await expect(chunk).toHaveCSS('background-color', 'rgb(255, 255, 255)')
  })
})
```

- [ ] **Step 2: 旁注 resize/小窗 spec**

`e2e/specs/article-assistant-resize.spec.ts`：

```ts
import { test, expect } from '../fixtures/electron'
import { CoverPage } from '../pages/CoverPage'
import { ArticleAssistantPage } from '../pages/ArticleAssistantPage'
import { SELECTORS } from '../helpers/selectors'
import { seedBriefing } from '../helpers/test-library'
import type { Page } from '@playwright/test'

function localToday(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

const DIGEST_CONTENT = `## AI Safety

### Box CEO Aaron Levie
Aaron Levie 讨论了 AI 安全与对齐在企业工作流中的落地。

## 原始来源
### Aaron Levie
- [tweet](https://x.com/levie/status/1)`

async function openChatWindow(window: Page, libPath: string): Promise<ArticleAssistantPage> {
  seedBriefing(libPath, localToday(), DIGEST_CONTENT)
  const cover = new CoverPage(window)
  await cover.enterName('E2E 测试员')
  await cover.goToBriefing()
  await window.locator(SELECTORS.briefing.receiveDigestButton).click()
  await expect(window.locator(SELECTORS.briefing.academicLayout)).toBeVisible({ timeout: 15000 })
  const assistant = new ArticleAssistantPage(window)
  await assistant.openChat()
  return assistant
}

test.describe('@p1 旁注窗口 resize', () => {
  test('拖 se 角向右下：尺寸增大且左上角钉死', async ({ window, testLibraryPath }) => {
    const assistant = await openChatWindow(window, testLibraryPath)
    const win = assistant.chatWindow
    const before = (await win.boundingBox())!

    const se = window.locator('[data-testid="resize-handle-se"]')
    const h = (await se.boundingBox())!
    await window.mouse.move(h.x + h.width / 2, h.y + h.height / 2)
    await window.mouse.down()
    await window.mouse.move(h.x + 80, h.y + 80, { steps: 10 })
    await window.mouse.up()

    const after = (await win.boundingBox())!
    expect(after.width).toBeGreaterThan(before.width + 40)
    expect(after.height).toBeGreaterThan(before.height + 40)
    // 左上角不移动（对角钉死）
    expect(Math.abs(after.x - before.x)).toBeLessThanOrEqual(2)
    expect(Math.abs(after.y - before.y)).toBeLessThanOrEqual(2)
  })

  test('拖 nw 角向左上：右下边缘钉死', async ({ window, testLibraryPath }) => {
    const assistant = await openChatWindow(window, testLibraryPath)
    const win = assistant.chatWindow
    const before = (await win.boundingBox())!
    const rightBefore = before.x + before.width
    const bottomBefore = before.y + before.height

    const nw = window.locator('[data-testid="resize-handle-nw"]')
    const h = (await nw.boundingBox())!
    await window.mouse.move(h.x + h.width / 2, h.y + h.height / 2)
    await window.mouse.down()
    await window.mouse.move(h.x - 60, h.y - 40, { steps: 10 })
    await window.mouse.up()

    const after = (await win.boundingBox())!
    expect(after.width).toBeGreaterThan(before.width + 30)
    // 右/下边缘不移动
    expect(Math.abs(after.x + after.width - rightBefore)).toBeLessThanOrEqual(2)
    expect(Math.abs(after.y + after.height - bottomBefore)).toBeLessThanOrEqual(2)
  })

  test('缩到小窗(<320px)：三控件隐藏、发送按钮在界内可点', async ({ window, testLibraryPath }) => {
    const assistant = await openChatWindow(window, testLibraryPath)
    const win = assistant.chatWindow
    const before = (await win.boundingBox())!

    // 拖 nw 角向右使宽度 ≈ 280px
    const nw = window.locator('[data-testid="resize-handle-nw"]')
    const h = (await nw.boundingBox())!
    const targetX = before.x + before.width - 280
    await window.mouse.move(h.x + h.width / 2, h.y + h.height / 2)
    await window.mouse.down()
    await window.mouse.move(targetX, h.y + h.height / 2, { steps: 10 })
    await window.mouse.up()

    const after = (await win.boundingBox())!
    expect(after.width).toBeLessThan(320)

    // 三控件隐藏，发送按钮可见且不凸出窗口右缘
    await expect(window.locator('[data-testid="assistant-extras"]')).toBeHidden()
    await expect(assistant.sendBtn).toBeVisible()
    const sendBox = (await assistant.sendBtn.boundingBox())!
    expect(sendBox.x + sendBox.width).toBeLessThanOrEqual(after.x + after.width + 1)

    // 小窗下发送链路可用
    await assistant.typeQuestion('测试')
    await assistant.send()
    await assistant.waitForAssistantReply()
  })
})
```

- [ ] **Step 3: 构建并跑两个新 spec**

Run: `npm run build && npx playwright test --config e2e/playwright.config.ts e2e/specs/guide-visibility.spec.ts e2e/specs/article-assistant-resize.spec.ts --retries=0`
Expected: 5/5 PASS。

- [ ] **Step 4: Commit**

```bash
git add e2e/specs/guide-visibility.spec.ts e2e/specs/article-assistant-resize.spec.ts
git commit -m "test(e2e): 导读 z-index/主题色回归 + 旁注 resize 方向与小窗发送可见"
```

---

## Task 20: e2e/README 同步 + 总验收

**Files:**
- Modify: `e2e/README.md`（mock 策略说明区）

- [ ] **Step 1: README 补充失败注入说明**

`e2e/README.md` 的 mock 策略说明（约 97-105 行，确定性 mock 段落）追加一句：

```markdown
> 求职简报的失败路径通过 `seedJobBriefing(libPath, date, '## Error\nJOB_XXX')`
> 注入——主进程命中缓存错误 rethrow 分支（`electron/ipc/job-briefing.ts`），
> 无需关闭 mock 即可确定性覆盖错误 UI/重试链路（见 `job-briefing-error.spec.ts`）。
```

- [ ] **Step 2: 全量单测 + 类型检查**

Run: `npx tsc --noEmit && npm run test`
Expected: 全部通过。

- [ ] **Step 3: 受影响 E2E 全量回归**

Run: `npm run build && npx playwright test --config e2e/playwright.config.ts e2e/specs/writing-editor.spec.ts e2e/specs/writing-empty-create.spec.ts e2e/specs/writing-tree.spec.ts e2e/specs/writing-navigation.spec.ts e2e/specs/job-briefing-generation.spec.ts e2e/specs/job-briefing-error.spec.ts e2e/specs/briefing.spec.ts e2e/specs/briefing-generation.spec.ts e2e/specs/article-assistant.spec.ts e2e/specs/article-assistant-guide.spec.ts e2e/specs/article-assistant-controls.spec.ts e2e/specs/guide-visibility.spec.ts e2e/specs/article-assistant-resize.spec.ts --retries=0`
Expected: 全部 PASS（重点：writing-editor 8/8 由红转绿）。

- [ ] **Step 4: Commit**

```bash
git add e2e/README.md
git commit -m "docs(e2e): README 补求职简报失败注入策略说明"
```

---

## Self-Review 记录

- **Spec 覆盖**：模块一 1a→Task 10；1b→Task 7/8；1c→Task 9；1d→Task 11/12/13 + Task 17 删除用例；模块二→Task 14 + Task 19 断言；模块三 3a→Task 15；3b→Task 16；模块四→Task 1-6 + Task 18；模块五→Task 17/18/19/20。诊断先行（Task 1-2）符合 spec「先补诊断再修」。
- **任务依赖顺序**：Task 1-6（写作）→ 7-10（求职简报核心）→ 11-13（删除）→ 14（导读）→ 15-16（旁注）→ 17-19（新 E2E）→ 20（总验收）。共享文件按序修改无并行冲突。
- **已知风险**：Task 2 若钉死的异常与 H1 假设不符，Task 3-5 的防御性修复可能不足——此时必须先按异常栈修具体根因再继续（writing-editor 转绿是硬性 gate）。
