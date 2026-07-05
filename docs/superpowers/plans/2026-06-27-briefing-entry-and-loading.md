# 夜航简报入口与加载体验 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让夜航简报在封面页有与主入口对等的可见按钮，加载过程展示真实阶段，错误状态分类可重试，并显示缓存生成时间戳。

**Architecture:** 在 Electron 侧把 `briefing:generate` 改为“调用 + progress 事件”模型；渲染进程通过 preload 订阅进度，Zustand 存储当前阶段；UI 根据阶段展示垂直步骤条，根据错误码展示分类错误组件。缓存命中与生成结果都携带 `generatedAt` 时间戳，Header 副标题按“当天/往期”两种格式展示。

**Tech Stack:** Electron 30, React 18, TypeScript, Tailwind CSS, Zustand, Vitest, Playwright

---

## File Structure

| 文件 | 职责 |
|------|------|
| `src/types/index.ts` | `BriefingStage` 类型、`BriefingResult.generatedAt` |
| `electron/preload.ts` | `onBriefingProgress` / `offBriefingProgress` |
| `src/lib/ipc.ts` | 渲染进程 IPC facade 暴露进度方法 |
| `electron/ipc/briefing.ts` | 发射 progress 事件、细化错误码、记录 generatedAt |
| `src/store/index.ts` | `briefingStage` 状态与 progress 订阅 |
| `src/pages/Cover.tsx` | 夜航简报按钮 parchment+ember 阴影、新用户禁用逻辑 |
| `src/components/BriefingProgress.tsx` | 垂直步骤条展示生成阶段 |
| `src/components/BriefingError.tsx` | 按错误码分类展示文案和重试按钮 |
| `src/pages/Briefing.tsx` | 整合进度、错误、时间戳显示 |
| `tests/briefing.test.ts` | 更新主进程 handler 测试 |
| `tests/briefing-progress.test.tsx` | 新增 `BriefingProgress` 组件测试 |
| `tests/briefing-error.test.tsx` | 新增 `BriefingError` 组件测试 |
| `e2e/helpers/selectors.ts` | 新增 progress/error/timestamp 选择器 |
| `e2e/pages/CoverPage.ts` | 新用户禁用状态辅助方法 |
| `e2e/specs/cover.spec.ts` | 覆盖新用户禁用、老用户按钮可见 |
| `e2e/specs/briefing.spec.ts` | 覆盖进度、错误分类、时间戳 |
| `e2e/helpers/test-library.ts` | `seedBriefing` 支持自定义 `generatedAt` |

---

## Task 1: 类型与 IPC 契约

**Files:**
- Modify: `src/types/index.ts`
- Modify: `electron/preload.ts`
- Modify: `src/lib/ipc.ts`

- [ ] **Step 1: 添加 `BriefingStage` 与 `BriefingResult.generatedAt`**

```typescript
// src/types/index.ts
export type BriefingStage = 'fetching' | 'extracting' | 'assembling' | 'finalizing' | 'done'

export interface BriefingResult {
  title: string
  date: string
  content: string
  sources: BriefingSource[]
  filePath: string
  cached: boolean
  cacheWriteFailed?: boolean
  generatedAt: string
}
```

- [ ] **Step 2: 在 `IpcApi` 中暴露进度事件**

在 `src/types/index.ts` 的 `IpcApi` 对象里追加：

```typescript
onBriefingProgress: (cb: (stage: BriefingStage, detail?: string) => void) => () => void
```

> 说明：`offBriefingProgress` 通过 `onBriefingProgress` 返回的卸载函数即可实现，不再额外暴露；若 preload 已习惯成对出现，也可同时暴露。本计划采用“单次订阅返回卸载函数”模式，保持与 `onLlmChunk` 一致。

- [ ] **Step 3: preload 实现进度监听**

```typescript
// electron/preload.ts
onBriefingProgress: (cb) => {
  const handler = (_: unknown, stage: BriefingStage, detail?: string) => cb(stage, detail)
  ipcRenderer.on('briefing:progress', handler)
  return () => ipcRenderer.off('briefing:progress', handler)
},
```

- [ ] **Step 4: 渲染进程 facade 暴露该方法**

```typescript
// src/lib/ipc.ts
get onBriefingProgress() { return ensure().onBriefingProgress },
```

- [ ] **Step 5: Commit**

```bash
git add src/types/index.ts electron/preload.ts src/lib/ipc.ts
git commit -m "feat(briefing): add BriefingStage type and IPC progress contract"
```

---

## Task 2: Electron 进度事件与错误码

**Files:**
- Modify: `electron/ipc/briefing.ts`

- [ ] **Step 1: 导入 `BriefingStage` 类型**

```typescript
import type { BriefingResult, BriefingSource, BriefingStage, Message, Profile } from '@shared/index'
```

- [ ] **Step 2: 修改 handler 以访问 `event.sender`**

```typescript
ipcMain.handle('briefing:generate', async (event, args: { date: string; profile: Profile; force?: boolean }): Promise<BriefingResult> => {
```

- [ ] **Step 3: 添加 `emitProgress` 辅助函数**

在 handler 顶部：

```typescript
const sender = event.sender
const emitProgress = (stage: BriefingStage, detail?: string) => {
  if (!sender.isDestroyed()) {
    sender.send('briefing:progress', stage, detail)
  }
}
```

- [ ] **Step 4: 缓存命中时读取 `generatedAt`**

将缓存命中分支改为：

```typescript
if (!args.force && fs.existsSync(filePath)) {
  const raw = fs.readFileSync(filePath, 'utf8')
  const { frontmatter, body } = parseFrontmatter(raw, { filename: path.basename(filePath) })
  const rawSources = matter(raw).data?.briefing_sources ?? matter(raw).data?.sources
  let sources: BriefingSource[] = []
  if (typeof rawSources === 'string' && rawSources) {
    try {
      sources = JSON.parse(rawSources) as BriefingSource[]
    } catch {
      sources = []
    }
  }
  const generatedAt = String(frontmatter.created ?? new Date().toISOString())
  return {
    title: String(frontmatter.title || '夜航简报'),
    date,
    content: body,
    sources,
    filePath,
    cached: true,
    generatedAt,
  }
}
```

- [ ] **Step 5: 在生成管线中发射阶段事件**

```typescript
emitProgress('fetching')
const [feedX, feedPodcasts, feedBlogs] = await Promise.all([
  fetchJson<FeedX>(FEED_X_URL),
  fetchJson<FeedPodcasts>(FEED_PODCASTS_URL),
  fetchJson<FeedBlogs>(FEED_BLOGS_URL),
])

if (!hasAnyContent(feedX, feedPodcasts, feedBlogs)) {
  throw new Error('FEED_EMPTY')
}

emitProgress('extracting')
const prompts = readPrompts()
const extractionPrompt = buildExtractionPrompt({ profile, prompts, feedX, feedPodcasts, feedBlogs })

const llmCtl = new AbortController()
const llmTimeout = setTimeout(() => llmCtl.abort(), 120_000)
let cacheWriteFailed = false

try {
  let structuredRaw: string
  try {
    structuredRaw = await chatNonStream(cfg, {
      messages: [{ role: 'user', content: extractionPrompt } as Message],
      temperature: 0.5,
      thinking: { type: 'enabled', reasoning_effort: 'high' },
      signal: llmCtl.signal,
    })
  } catch (err) {
    throw new Error(`LLM_ERROR: ${err instanceof Error ? err.message : String(err)}`)
  }

  const structured = parseStructuredJson(structuredRaw)

  emitProgress('assembling')
  const assemblyPrompt = buildAssemblyPrompt({
    prompts,
    structured: JSON.stringify(structured, null, 2),
  })

  let content: string
  try {
    content = await chatNonStream(cfg, {
      messages: [{ role: 'user', content: assemblyPrompt } as Message],
      temperature: 0.5,
      thinking: { type: 'enabled', reasoning_effort: 'high' },
      signal: llmCtl.signal,
    })
  } catch (err) {
    throw new Error(`LLM_ERROR: ${err instanceof Error ? err.message : String(err)}`)
  }

  emitProgress('finalizing')
  const sources = buildSources({ feedX, feedPodcasts, feedBlogs })
  const generatedAt = new Date().toISOString()

  const fm = {
    title: '夜航简报',
    type: 'briefing' as const,
    created: generatedAt,
    tags: ['industry-digest', 'ai'],
    briefing_sources: JSON.stringify(sources),
  }

  try {
    fs.mkdirSync(briefingDir(cfg), { recursive: true })
    fs.writeFileSync(filePath, serializeFrontmatter('briefing', fm, content), 'utf8')
  } catch (writeErr) {
    console.error('[briefing] failed to write cached file, dumping recovery', writeErr)
    dumpRecovery(path.basename(filePath), content)
    cacheWriteFailed = true
  }

  return {
    title: '夜航简报',
    date,
    content,
    sources,
    filePath,
    cached: false,
    cacheWriteFailed,
    generatedAt,
  }
} finally {
  clearTimeout(llmTimeout)
}
```

- [ ] **Step 6: 重命名解析错误为 `ASSEMBLY_ERROR`**

```typescript
function parseStructuredJson(raw: string): unknown {
  let text = raw.trim()
  if (text.startsWith('```')) {
    text = text.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim()
  }
  try {
    return JSON.parse(text)
  } catch (err) {
    throw new Error(`ASSEMBLY_ERROR: ${err instanceof Error ? err.message : String(err)}`)
  }
}
```

- [ ] **Step 7: Commit**

```bash
git add electron/ipc/briefing.ts
git commit -m "feat(briefing): emit progress events, classify errors, record generatedAt"
```

---

## Task 3: Store 状态与 Progress 订阅

**Files:**
- Modify: `src/store/index.ts`

- [ ] **Step 1: 扩展 `AppStore` 类型**

```typescript
briefingStage: BriefingStage | null
setBriefingStage: (stage: BriefingStage | null) => void
```

- [ ] **Step 2: 初始化状态并添加 setter**

```typescript
briefingStage: null,
setBriefingStage: (stage) => set({ briefingStage: stage }),
```

- [ ] **Step 3: 重写 `generateBriefing` action**

```typescript
generateBriefing: async (date: string, opts?: { force?: boolean }) => {
  const s = get()
  if (s.briefing.loading) return
  set({
    briefing: { result: null, loading: true, error: null },
    briefingStage: 'fetching',
  })

  const unsubscribe = ipc.onBriefingProgress((stage) => {
    set({ briefingStage: stage })
  })

  try {
    const result = await ipc.briefingGenerate({ date, profile: s.profile, force: opts?.force })
    set({
      briefing: { result, loading: false, error: null },
      briefingStage: null,
    })
  } catch (err: any) {
    const raw = err.message || String(err)
    const error = raw.includes('FEED_EMPTY')
      ? 'FEED_EMPTY'
      : raw.includes('NETWORK_ERROR')
        ? 'NETWORK_ERROR'
        : raw.includes('LLM_ERROR')
          ? 'LLM_ERROR'
          : raw.includes('ASSEMBLY_ERROR')
            ? 'ASSEMBLY_ERROR'
            : raw
    set({
      briefing: { result: null, loading: false, error },
      briefingStage: null,
    })
  } finally {
    unsubscribe()
  }
},
```

- [ ] **Step 4: Commit**

```bash
git add src/store/index.ts
git commit -m "feat(briefing): track generation stage in store and subscribe to progress"
```

---

## Task 4: Cover 页按钮

**Files:**
- Modify: `src/pages/Cover.tsx`

- [ ] **Step 1: 抽取简报按钮样式常量**

在 `Cover` 函数内部、`return` 之前：

```typescript
const briefingButtonClass = `bg-parchment text-ink shadow-[3px_3px_0_0_#d97757]
  hover:translate-x-[1px] hover:translate-y-[1px]
  hover:shadow-[2px_2px_0_0_#d97757]
  active:translate-x-[3px] active:translate-y-[3px]
  active:shadow-none
  transition-[transform,box-shadow] duration-100`
```

- [ ] **Step 2: 替换老用户分支的 briefing 按钮**

```tsx
<Button
  data-testid="cover-briefing-button"
  onClick={() => goto('briefing')}
  className={briefingButtonClass}
>
  夜航简报
</Button>
```

- [ ] **Step 3: 替换新用户分支的 briefing 按钮，并禁用进入夜话**

```tsx
<Button data-testid="cover-enter-button" onClick={onEnter} disabled={!name.trim()}>
  进入夜话
</Button>
<Button
  data-testid="cover-briefing-button"
  onClick={() => goto('briefing')}
  disabled={!name.trim()}
  className={briefingButtonClass}
>
  夜航简报
</Button>
```

> 说明：`onEnter` 内部已做空名拦截，但显式 `disabled` 可避免按钮 hover/active 视觉反馈，更明确。

- [ ] **Step 4: Commit**

```bash
git add src/pages/Cover.tsx
git commit -m "feat(cover): restyle briefing button as parchment primary with ember shadow"
```

---

## Task 5: BriefingProgress 组件

**Files:**
- Create: `src/components/BriefingProgress.tsx`

- [ ] **Step 1: 实现垂直步骤条**

```tsx
import type { BriefingStage } from '@shared/index'

const STAGES: { key: BriefingStage; label: string }[] = [
  { key: 'fetching', label: '正在采集今日信号…' },
  { key: 'extracting', label: '正在提取关键信息…' },
  { key: 'assembling', label: '正在组装夜航简报…' },
  { key: 'finalizing', label: '正在归档…' },
]

interface Props {
  stage: BriefingStage
}

export function BriefingProgress({ stage }: Props) {
  const currentIndex = STAGES.findIndex((s) => s.key === stage)
  return (
    <div data-testid="briefing-progress" className="flex flex-col items-center justify-center h-full">
      <div className="space-y-5">
        {STAGES.map((s, idx) => {
          const done = idx < currentIndex
          const active = idx === currentIndex
          return (
            <div
              key={s.key}
              data-testid={`briefing-progress-step-${s.key}`}
              className="flex items-center gap-3"
            >
              <div
                className={`w-3 h-3 rounded-full border ${
                  done
                    ? 'bg-ember border-ember'
                    : active
                      ? 'bg-parchment border-parchment'
                      : 'border-parchment/30'
                }`}
              />
              <span
                className={`font-sans text-sm ${
                  done
                    ? 'text-parchment/50'
                    : active
                      ? 'text-parchment'
                      : 'text-parchment/30'
                }`}
              >
                {s.label}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/BriefingProgress.tsx
git commit -m "feat(briefing): add BriefingProgress vertical stepper"
```

---

## Task 6: BriefingError 组件

**Files:**
- Create: `src/components/BriefingError.tsx`

- [ ] **Step 1: 实现分类错误组件**

```tsx
import { Button } from './Button'

interface Props {
  code: string
  onRetry: () => void
}

const MESSAGES: Record<string, { text: string; showRetry: boolean }> = {
  FEED_EMPTY: { text: '今日海面平静，暂无新信号。', showRetry: false },
  NETWORK_ERROR: { text: '信号塔暂时失联，请检查网络后重试。', showRetry: true },
  LLM_ERROR: { text: '简报员暂时无法整理思路，请稍后再试。', showRetry: true },
  ASSEMBLY_ERROR: { text: '简报格式异常，请重试或联系开发者。', showRetry: true },
}

export function BriefingError({ code, onRetry }: Props) {
  const { text, showRetry } = MESSAGES[code] ?? { text: `简报生成失败：${code}`, showRetry: true }
  return (
    <div data-testid="briefing-error-display" className="text-center space-y-4">
      <p>{text}</p>
      {showRetry && (
        <Button data-testid="briefing-retry-button" onClick={onRetry}>
          重试
        </Button>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/BriefingError.tsx
git commit -m "feat(briefing): add classified error component with retry"
```

---

## Task 7: Briefing 页整合

**Files:**
- Modify: `src/pages/Briefing.tsx`

- [ ] **Step 1: 导入新组件**

```tsx
import { BriefingProgress } from '@/components/BriefingProgress'
import { BriefingError } from '@/components/BriefingError'
```

- [ ] **Step 2: 读取 `briefingStage` 并添加时间戳格式化函数**

在组件内：

```typescript
const stage = useStore((s) => s.briefingStage)
```

在文件顶部添加辅助函数：

```typescript
function formatGeneratedAt(iso: string, date: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const time = d.toLocaleTimeString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
  const today = new Date().toISOString().slice(0, 10)
  if (date === today) return time
  const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  return `${dateStr} · ${time}`
}
```

- [ ] **Step 3: 修改 loading 渲染分支**

```tsx
if (loading || (!result && !error)) {
  return (
    <div data-testid="briefing-page" className="relative h-full flex flex-col overflow-hidden">
      {isAcademic && <SurfaceBackground surface="briefing" />}
      <header className={`${headerBase} ${headerTheme}`}>
        <BackToCover className={backOverride} />
        <div className="text-center">
          <h1 className={titleClass}>夜航简报</h1>
        </div>
        <div className="flex items-center gap-1">
          <BriefingThemeToggle />
          <SwapPaintingButton surface="briefing" className={swapOverride} />
        </div>
      </header>
      <main className="relative z-[5] flex-1 overflow-y-auto px-6 py-6 max-w-3xl mx-auto">
        {stage ? (
          <BriefingProgress stage={stage} />
        ) : (
          <BriefingSkeleton data-testid="briefing-skeleton" />
        )}
      </main>
    </div>
  )
}
```

- [ ] **Step 4: 修改 error 渲染分支**

```tsx
if (error) {
  return (
    <div data-testid="briefing-page" className="relative h-full flex flex-col overflow-hidden">
      {isAcademic && <SurfaceBackground surface="briefing" />}
      <header className={`${headerBase} ${headerTheme}`}>
        <BackToCover className={backOverride} />
        <div className="flex items-center gap-1">
          <BriefingThemeToggle />
          <SwapPaintingButton surface="briefing" className={swapOverride} />
        </div>
      </header>
      <main className="relative z-[5] flex-1 flex items-center justify-center px-6">
        <div className={isAcademic ? 'text-[#e8d5b7]' : 'text-[#1a1a1a]'}>
          <BriefingError code={error} onRetry={() => generateBriefing(today, { force: true })} />
        </div>
      </main>
    </div>
  )
}
```

- [ ] **Step 5: 在 Header 显示生成时间戳**

```tsx
<div className={metaClass}>
  {displayDate} · AI 行业日报
  {result.generatedAt && (
    <span data-testid="briefing-generated-at">
      {' · 生成于 ' + formatGeneratedAt(result.generatedAt, result.date)}
    </span>
  )}
  {result.cacheWriteFailed && (
    <span data-testid="briefing-cache-write-failed" className="ml-2 text-wine">
      （本次未写入缓存）
    </span>
  )}
</div>
```

- [ ] **Step 6: Commit**

```bash
git add src/pages/Briefing.tsx
git commit -m "feat(briefing): integrate progress, classified errors, and generated timestamp"
```

---

## Task 8: 主进程 Handler 单元测试

**Files:**
- Modify: `tests/briefing.test.ts`

- [ ] **Step 1: 构造 mock sender 并在调用中传入**

在需要触发 handler 的测试里：

```typescript
const mockSender = { send: vi.fn(), isDestroyed: () => false }
const mockEvent = { sender: mockSender }
const result = await ipcHandlers['briefing:generate'](mockEvent, { date: '2026-06-21', profile })
```

- [ ] **Step 2: 断言进度事件顺序**

```typescript
expect(mockSender.send).toHaveBeenCalledWith('briefing:progress', 'fetching')
expect(mockSender.send).toHaveBeenCalledWith('briefing:progress', 'extracting')
expect(mockSender.send).toHaveBeenCalledWith('briefing:progress', 'assembling')
expect(mockSender.send).toHaveBeenCalledWith('briefing:progress', 'finalizing')
```

- [ ] **Step 3: 断言 `generatedAt` 存在**

```typescript
expect(result.generatedAt).toBeDefined()
```

- [ ] **Step 4: 更新错误码断言**

将原 `BRIEFING_PARSE_ERROR` 改为 `ASSEMBLY_ERROR`：

```typescript
await expect(ipcHandlers['briefing:generate'](mockEvent, { date: '2026-06-23', profile }))
  .rejects.toThrow('ASSEMBLY_ERROR')
```

- [ ] **Step 5: Commit**

```bash
git add tests/briefing.test.ts
git commit -m "test(briefing): update handler tests for progress, generatedAt, and error codes"
```

---

## Task 9: 组件单元测试

**Files:**
- Create: `tests/briefing-progress.test.tsx`
- Create: `tests/briefing-error.test.tsx`

- [ ] **Step 1: `BriefingProgress` 测试**

```tsx
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { BriefingProgress } from '@/components/BriefingProgress'

describe('BriefingProgress', () => {
  it('renders all four steps', () => {
    render(<BriefingProgress stage="fetching" />)
    expect(screen.getByTestId('briefing-progress-step-fetching')).toBeInTheDocument()
    expect(screen.getByTestId('briefing-progress-step-extracting')).toBeInTheDocument()
    expect(screen.getByTestId('briefing-progress-step-assembling')).toBeInTheDocument()
    expect(screen.getByTestId('briefing-progress-step-finalizing')).toBeInTheDocument()
  })

  it('highlights the active step', () => {
    render(<BriefingProgress stage="assembling" />)
    expect(screen.getByText('正在组装夜航简报…')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: `BriefingError` 测试**

```tsx
import { render, screen, fireEvent } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { BriefingError } from '@/components/BriefingError'

describe('BriefingError', () => {
  it('shows FEED_EMPTY message without retry', () => {
    render(<BriefingError code="FEED_EMPTY" onRetry={vi.fn()} />)
    expect(screen.getByText('今日海面平静，暂无新信号。')).toBeInTheDocument()
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it('shows NETWORK_ERROR message with retry button', () => {
    const onRetry = vi.fn()
    render(<BriefingError code="NETWORK_ERROR" onRetry={onRetry} />)
    fireEvent.click(screen.getByRole('button', { name: '重试' }))
    expect(onRetry).toHaveBeenCalledOnce()
  })

  it('falls back to raw error code for unknown errors', () => {
    render(<BriefingError code="UNKNOWN_CODE" onRetry={vi.fn()} />)
    expect(screen.getByText('简报生成失败：UNKNOWN_CODE')).toBeInTheDocument()
  })
})
```

- [ ] **Step 3: Commit**

```bash
git add tests/briefing-progress.test.tsx tests/briefing-error.test.tsx
git commit -m "test(briefing): add progress and error component tests"
```

---

## Task 10: E2E 选择器

**Files:**
- Modify: `e2e/helpers/selectors.ts`

- [ ] **Step 1: 添加选择器**

```typescript
briefing: {
  page: '[data-testid="briefing-page"]',
  academicLayout: '[data-testid="briefing-academic-layout"]',
  newspaperLayout: '[data-testid="briefing-newspaper-layout"]',
  themeToggle: '[data-testid="briefing-theme-toggle"]',
  historyButton: '[data-testid="briefing-history-button"]',
  regenerateButton: '[data-testid="briefing-regenerate-button"]',
  skeleton: '[data-testid="briefing-skeleton"]',
  errorDisplay: '[data-testid="briefing-error-display"]',
  retryButton: '[data-testid="briefing-retry-button"]',
  progress: '[data-testid="briefing-progress"]',
  progressStep: (key: string) => `[data-testid="briefing-progress-step-${key}"]`,
  generatedAt: '[data-testid="briefing-generated-at"]',
  cacheWriteFailedBadge: '[data-testid="briefing-cache-write-failed"]',
}
```

- [ ] **Step 2: Commit**

```bash
git add e2e/helpers/selectors.ts
git commit -m "test(e2e): add briefing progress, retry, and timestamp selectors"
```

---

## Task 11: Cover E2E

**Files:**
- Modify: `e2e/pages/CoverPage.ts`
- Modify: `e2e/specs/cover.spec.ts`

- [ ] **Step 1: CoverPage 添加状态断言**

```typescript
async expectBriefingButtonDisabled() {
  await expect(this.briefingButton).toBeDisabled()
}

async expectBriefingButtonEnabled() {
  await expect(this.briefingButton).toBeEnabled()
}
```

- [ ] **Step 2: 添加禁用/启用测试**

```typescript
test('briefing button is disabled before entering name', async ({ window }) => {
  const cover = new CoverPage(window)
  await cover.nameInput.waitFor({ state: 'visible' })
  await cover.expectBriefingButtonDisabled()
})

test('briefing button is enabled after entering name', async ({ window }) => {
  const cover = new CoverPage(window)
  await cover.enterName('夜话旅人')
  await cover.expectBriefingButtonEnabled()
})
```

> 说明：这两个测试只在全新 E2E 配置（无 `profile.name`）下有效。若测试夹具默认写入 name，需在该 `test.describe` 内用 `test.use({})` 确保状态干净。

- [ ] **Step 3: Commit**

```bash
git add e2e/pages/CoverPage.ts e2e/specs/cover.spec.ts
git commit -m "test(e2e): cover briefing button disabled/enabled states"
```

---

## Task 12: Briefing E2E

**Files:**
- Modify: `e2e/specs/briefing.spec.ts`
- Modify: `e2e/helpers/test-library.ts`

- [ ] **Step 1: `seedBriefing` 支持自定义 `generatedAt`**

```typescript
export function seedBriefing(libPath: string, date: string, content?: string, generatedAt?: string): void {
  const dir = path.join(libPath, '夜航简报')
  fs.mkdirSync(dir, { recursive: true })
  const filePath = path.join(dir, `夜航简报-${date}.md`)
  const defaultContent = content ?? `## X / Twitter\n\n### Box CEO Aaron Levie\nAaron Levie 讨论了 LLM 在企业工作流中的落地。\n\n## Official Blogs\n\n### Anthropic Engineering\nClaude 的新功能提升了长上下文可靠性。\n\n## Podcasts\n\n### Latent Space\n最新一期采访了 Anthropic 研究员。\n\n## 原始来源\n### Aaron Levie\n- [tweet](https://x.com/levie/status/1)\n### Anthropic Engineering\n- [post](https://anthropic.com/engineering/1)\n### Latent Space\n- [episode](https://youtube.com/watch?v=1)`
  const fm = `---\ntitle: 夜航简报\ntype: briefing\ncreated: '${generatedAt ?? new Date().toISOString()}'\ntags:\n  - industry-digest\n  - ai\n---\n\n`
  fs.writeFileSync(filePath, fm + defaultContent, 'utf8')
}
```

- [ ] **Step 2: 添加缓存时间戳测试**

```typescript
test('shows generated timestamp for cached briefing @smoke', async ({ window, testLibraryPath }) => {
  const today = new Date().toISOString().slice(0, 10)
  seedBriefing(testLibraryPath, today, undefined, '2026-06-27T08:32:00.000Z')
  const coverPage = new CoverPage(window)
  await coverPage.gotoBriefing()
  await expect(window.locator(SELECTORS.briefing.academicLayout)).toBeVisible()
  await expect(window.locator(SELECTORS.briefing.generatedAt)).toContainText('生成于 08:32')
})
```

- [ ] **Step 3: 更新错误测试断言**

`FEED_EMPTY` 测试确认无重试按钮：

```typescript
await expect(window.locator(SELECTORS.briefing.retryButton)).toHaveCount(0)
```

网络错误测试确认有重试按钮与分类文案：

```typescript
await expect(window.locator(SELECTORS.briefing.retryButton)).toBeVisible()
await expect(window.getByText('信号塔暂时失联')).toBeVisible()
```

- [ ] **Step 4: Commit**

```bash
git add e2e/specs/briefing.spec.ts e2e/helpers/test-library.ts
git commit -m "test(e2e): update briefing specs for timestamp and classified errors"
```

---

## Task 13: 类型检查与最终验证

- [ ] **Step 1: TypeScript 检查**

```bash
npm run build
```

- [ ] **Step 2: 单元测试**

```bash
npm run test
```

- [ ] **Step 3: E2E smoke**

```bash
npm run test:e2e:smoke
```

- [ ] **Step 4: 修复并提交**

```bash
git commit -m "fix(briefing): address typecheck and test issues" -a
```

---

## Self-Review Checklist

1. **Spec coverage:** 封面入口（Task 4）、IPC progress（Tasks 1-3）、加载步骤条（Task 5）、错误分类（Task 6）、缓存时间戳（Tasks 2 & 7）、E2E（Tasks 10-12）均已对应任务。
2. **Placeholder scan:** 无 TBD/TODO/“稍后实现”。
3. **Type consistency:** `BriefingStage`、`generatedAt`、`briefingStage`、`onBriefingProgress` 命名与类型在前后端保持一致。
4. **无未定义引用:** 所有任务中出现的函数/组件/类型均在先前置任务中定义。
