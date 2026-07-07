# 夜航简报 UX 优化实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 统一夜航简报顶部栏、增加全局持久化字号调节、提升 feed 稳定性并展示源状态、让 LLM 摘要更详细且面向零基础读者。

**Architecture:** 在现有主进程两次 LLM 调用架构上，补充一层 feed 重试与源状态；渲染进程新增 `BriefingHeader` 组件统一三种状态的顶部栏，并用 Tailwind 任意值/CSS 变量实现字号档位；prompt 通过新增 `explain_like_beginner` 字段和禁止装饰性刊头规则来提升内容质量。

**Tech Stack:** Electron 30 + React 18 + TypeScript + Tailwind CSS + Zustand + Vitest + Playwright

---

## 文件结构总览

| 文件 | 变更 | 职责 |
|------|------|------|
| `src/types/index.ts` | 修改 | 新增 `BriefingFontSize`、`BriefingSourceStatus`、扩展 `BriefingResult` 和 `StateJson` |
| `src/store/index.ts` | 修改 | 新增 `briefingFontSize` 状态、`increaseBriefingFontSize`、`decreaseBriefingFontSize`、持久化 |
| `src/lib/briefing-font-size.ts` | 新建 | 字号档位到 CSS 变量的映射常量 |
| `electron/ipc/briefing.ts` | 修改 | `fetchJsonWithRetry`、提取 schema 增加 `explain_like_beginner`、返回 `sourceStatus`、缓存读写 sourceStatus |
| `electron/prompts/briefing/summarize-tweets.md` | 修改 | 增加 `explain_like_beginner`，扩展长度 |
| `electron/prompts/briefing/summarize-blogs.md` | 修改 | 增加 `explain_like_beginner`，扩展长度 |
| `electron/prompts/briefing/summarize-podcast.md` | 修改 | 增加 `explain_like_beginner`，扩展长度 |
| `electron/prompts/briefing/digest-intro.md` | 修改 | 禁止装饰性刊头、禁止正文大标题、去掉底部版权行 |
| `src/components/BriefingHeader.tsx` | 新建 | 统一顶部栏组件 |
| `src/pages/Briefing.tsx` | 修改 | 使用 `BriefingHeader`、注入字号变量、简化时间格式 |
| `src/components/briefing/AcademicBriefingLayout.tsx` | 修改 | 排版字号、换画按钮移到内容区 |
| `src/components/briefing/NewspaperBriefingLayout.tsx` | 修改 | 排版字号、颜色 |
| `tests/briefing.test.ts` | 修改 | feed 重试、sourceStatus、部分生成 |
| `tests/store.test.ts` | 修改 | 字号持久化与边界 |
| `tests/briefing-header.test.tsx` | 新建 | Header 渲染与字号按钮 |
| `e2e/helpers/selectors.ts` | 修改 | 新增 A-/A+/源状态选择器 |
| `e2e/specs/briefing-ux-optimization.spec.ts` | 新建 | 本次优化 E2E 覆盖 |
| `e2e/specs/briefing.spec.ts` | 修改 | 更新生成时间断言 |

---

## Task 1: 类型扩展

**Files:**
- Modify: `src/types/index.ts:168-214`

- [ ] **Step 1: 添加字号与源状态类型**

```typescript
export type BriefingFontSize = 'sm' | 'base' | 'lg' | 'xl'

export type BriefingSourceStatus = {
  x: 'ok' | 'failed'
  podcasts: 'ok' | 'failed'
  blogs: 'ok' | 'failed'
}
```

- [ ] **Step 2: 扩展 BriefingResult**

在 `BriefingResult` 中新增：

```typescript
export type BriefingResult = {
  title: string
  date: string
  content: string
  sources: BriefingSource[]
  filePath: string
  cached: boolean
  cacheWriteFailed?: boolean
  generatedAt: string
  sourceStatus: BriefingSourceStatus
}
```

- [ ] **Step 3: 扩展 StateJson**

```typescript
export type StateJson = {
  version: 1
  profile: Profile
  lastUsed: { difficulty: Difficulty; temperature: Temperature }
  groupInspirations: Record<string, NewTopic>
  wildcardInspiration?: NewTopic
  ui: { session_count: number }
  inspirationStrategy: 'v1' | 'v2' | 'v3'
  fableStyleTags: string[]
  lastFableTags: string[]
  topicContinueSuggestions: Record<string, TopicContinueCache>
  terminology?: Terminology
  briefingTheme?: BriefingTheme
  briefingFontSize?: BriefingFontSize
}
```

- [ ] **Step 4: 运行类型检查**

Run: `npx tsc --noEmit`
Expected: 仅出现本次计划要改的下游错误，没有新类型错误。

- [ ] **Step 5: Commit**

```bash
git add src/types/index.ts
git commit -m "types: add BriefingFontSize and sourceStatus"
```

---

## Task 2: 字号映射常量

**Files:**
- Create: `src/lib/briefing-font-size.ts`

- [ ] **Step 1: 新建常量文件**

```typescript
import type { BriefingFontSize } from '@shared/index'

export const BRIEFING_FONT_SIZES = ['sm', 'base', 'lg', 'xl'] as const satisfies readonly BriefingFontSize[]

export const ACADEMIC_BODY_STYLES: Record<BriefingFontSize, { size: string; weight: number }> = {
  sm: { size: '14px', weight: 400 },
  base: { size: '15px', weight: 500 },
  lg: { size: '16px', weight: 600 },
  xl: { size: '17px', weight: 600 },
}

export const NEWSPAPER_BODY_STYLES: Record<BriefingFontSize, { size: string; weight: number }> = {
  sm: { size: '14px', weight: 500 },
  base: { size: '15px', weight: 600 },
  lg: { size: '16px', weight: 600 },
  xl: { size: '17px', weight: 700 },
}

export function nextFontSize(current: BriefingFontSize): BriefingFontSize {
  const idx = BRIEFING_FONT_SIZES.indexOf(current)
  return BRIEFING_FONT_SIZES[Math.min(idx + 1, BRIEFING_FONT_SIZES.length - 1)]
}

export function prevFontSize(current: BriefingFontSize): BriefingFontSize {
  const idx = BRIEFING_FONT_SIZES.indexOf(current)
  return BRIEFING_FONT_SIZES[Math.max(idx - 1, 0)]
}
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/briefing-font-size.ts
git commit -m "feat(briefing): add font size constants"
```

---

## Task 3: Store 状态与持久化

**Files:**
- Modify: `src/store/index.ts:7,86-91,218-219,233,396-399`

- [ ] **Step 1: 导入类型与常量**

在顶部 import 中加入：

```typescript
import type { BriefingFontSize } from '@shared/index'
```

> 注意：若后续想在 UI 与常量共用，可改为从 `@shared/index` 导出并在 `src/lib/briefing-font-size.ts` 复用；本计划保持 `src/lib/briefing-font-size.ts` 作为运行时映射，`@shared/index` 作为类型来源。

- [ ] **Step 2: 在 AppStore 类型中新增字段**

在 `briefingTheme` 同一区域加入：

```typescript
briefingFontSize: BriefingFontSize
increaseBriefingFontSize: () => Promise<void>
decreaseBriefingFontSize: () => Promise<void>
```

- [ ] **Step 3: 初始化状态**

在 store 初始对象中加入：

```typescript
briefingFontSize: 'base',
```

- [ ] **Step 4: init 加载持久化字号**

在 `init` 的 `set({ ... })` 中加入：

```typescript
briefingFontSize: state.briefingFontSize ?? 'base',
```

- [ ] **Step 5: 实现字号 action**

在 `setBriefingTheme` 之后新增：

```typescript
increaseBriefingFontSize: async () => {
  const { BRIEFING_FONT_SIZES } = await import('@/lib/briefing-font-size')
  const current = get().briefingFontSize
  const idx = BRIEFING_FONT_SIZES.indexOf(current)
  const next = BRIEFING_FONT_SIZES[Math.min(idx + 1, BRIEFING_FONT_SIZES.length - 1)]
  set({ briefingFontSize: next })
  await ipc.patchState({ briefingFontSize: next } as Partial<StateJson>)
},

decreaseBriefingFontSize: async () => {
  const { BRIEFING_FONT_SIZES } = await import('@/lib/briefing-font-size')
  const current = get().briefingFontSize
  const idx = BRIEFING_FONT_SIZES.indexOf(current)
  const prev = BRIEFING_FONT_SIZES[Math.max(idx - 1, 0)]
  set({ briefingFontSize: prev })
  await ipc.patchState({ briefingFontSize: prev } as Partial<StateJson>)
},
```

- [ ] **Step 6: 运行 store 测试**

Run: `npx vitest run tests/store.test.ts`
Expected: PASS（此时字号测试尚未添加）。

- [ ] **Step 7: Commit**

```bash
git add src/store/index.ts
git commit -m "feat(store): persistent briefing font size"
```

---

## Task 4: Feed 重试与源状态

**Files:**
- Modify: `electron/ipc/briefing.ts`

- [ ] **Step 1: 添加重试函数**

在 `fetchJson` 之后新增：

```typescript
async function fetchJsonWithRetry<T>(url: string, retries = 1, delay = 2000): Promise<T | null> {
  let lastErr: Error | undefined
  for (let i = 0; i <= retries; i++) {
    try {
      return await fetchJson<T>(url)
    } catch (err) {
      lastErr = err instanceof Error ? err : new Error(String(err))
      if (i < retries) {
        console.warn(`[briefing] fetch retry ${i + 1}/${retries} for ${url}`)
        await new Promise(r => setTimeout(r, delay))
      }
    }
  }
  console.error(`[briefing] fetch failed after retries: ${url}`, lastErr)
  return null
}
```

- [ ] **Step 2: 修改 Promise.all 调用**

把原来的 `fetchJson` 调用替换为 `fetchJsonWithRetry`：

```typescript
const [feedX, feedPodcasts, feedBlogs] = await Promise.all([
  fetchJsonWithRetry<FeedX>(urls.x).catch((err) => {
    console.warn(`[briefing] feed X unavailable, continuing: ${err.message}`)
    return null
  }),
  fetchJsonWithRetry<FeedPodcasts>(urls.podcasts).catch((err) => {
    console.warn(`[briefing] feed podcasts unavailable, continuing: ${err.message}`)
    return null
  }),
  fetchJsonWithRetry<FeedBlogs>(urls.blogs).catch((err) => {
    console.warn(`[briefing] feed blogs unavailable, continuing: ${err.message}`)
    return null
  }),
])
```

- [ ] **Step 3: 计算 sourceStatus**

在 `hasAnyContent` 之后、返回之前加入：

```typescript
const sourceStatus = {
  x: feedX?.x?.length ? 'ok' : 'failed',
  podcasts: feedPodcasts?.podcasts?.length ? 'ok' : 'failed',
  blogs: feedBlogs?.blogs?.length ? 'ok' : 'failed',
}
```

> 注意：`ok` 的判断标准是拉取成功且该源有内容。若拉取成功但数组为空，视为 `failed`（对应当前无内容，与用户体验一致）。

- [ ] **Step 4: 扩展 extraction schema**

在 `buildExtractionPrompt` 的 schema 中给每个对象增加 `explain_like_beginner`：

```typescript
builders: [
  {
    name: '...',
    role: '...',
    handle: '...',
    summary: '...',
    key_url: '...',
    explain_like_beginner: '...',
  },
],
podcasts: [
  {
    show: '...',
    episode: '...',
    url: '...',
    takeaway: '...',
    summary: '...',
    quote: '...',
    explain_like_beginner: '...',
  },
],
blogs: [
  {
    blog: '...',
    title: '...',
    url: '...',
    summary: '...',
    quote: '...',
    explain_like_beginner: '...',
  },
],
```

- [ ] **Step 5: 返回 sourceStatus**

把 `return { ... }` 块中的生成成功返回改为：

```typescript
return {
  title: '夜航简报',
  date,
  content,
  sources,
  filePath,
  cached: false,
  cacheWriteFailed,
  generatedAt,
  sourceStatus,
}
```

- [ ] **Step 6: 缓存命中时读取 sourceStatus**

在缓存命中分支中，解析 frontmatter 后：

```typescript
const rawSourceStatus = matter(raw).data?.briefing_source_status
let sourceStatus: BriefingSourceStatus = { x: 'ok', podcasts: 'ok', blogs: 'ok' }
if (rawSourceStatus && typeof rawSourceStatus === 'string') {
  try {
    sourceStatus = JSON.parse(rawSourceStatus) as BriefingSourceStatus
  } catch {
    sourceStatus = { x: 'ok', podcasts: 'ok', blogs: 'ok' }
  }
}
```

并在返回中加入 `sourceStatus`。

- [ ] **Step 7: 缓存写入时保存 sourceStatus**

在 `fm` 对象中加入：

```typescript
briefing_source_status: JSON.stringify(sourceStatus),
```

- [ ] **Step 8: 运行 briefing 单元测试**

Run: `npx vitest run tests/briefing.test.ts`
Expected: 现有测试通过，新增测试将在 Task 10 添加。

- [ ] **Step 9: Commit**

```bash
git add electron/ipc/briefing.ts
git commit -m "feat(briefing): feed retry and source status"
```

---

## Task 5: Prompt 更新

**Files:**
- Modify: `electron/prompts/briefing/summarize-tweets.md`
- Modify: `electron/prompts/briefing/summarize-blogs.md`
- Modify: `electron/prompts/briefing/summarize-podcast.md`
- Modify: `electron/prompts/briefing/digest-intro.md`

- [ ] **Step 1: 修改 summarize-tweets.md**

在 Instructions 末尾追加：

```markdown
- Write 3-5 sentences per builder (up from 2-4), covering the context and why it matters.
- Add a field `explain_like_beginner`: one sentence that explains this update to someone with zero AI background, using a simple analogy or concrete scenario.
```

- [ ] **Step 2: 修改 summarize-blogs.md**

把 "Write a summary of 100-300 words" 改为 "Write a summary of 200-400 words"，并在末尾追加：

```markdown
- Add a field `explain_like_beginner`: one sentence that explains the core announcement to a complete beginner, as if talking to a curious friend who has never built software.
```

- [ ] **Step 3: 修改 summarize-podcast.md**

把 "Write a remix of 200-400 words" 改为 "Write a remix of 300-500 words"，并在末尾追加：

```markdown
- Add a field `explain_like_beginner`: one sentence that explains the key insight to someone with no AI background, using an everyday analogy.
```

- [ ] **Step 4: 修改 digest-intro.md**

在 `## Rules` 中新增一条规则：

```markdown
### No decorative headers

- Do NOT include a main title like `AI Builders Digest — [Date]`, `Vol.`, `档案编号`, `Briefing`, `学习卷宗`, or any other decorative masthead text in the body.
- The UI will render the title as "夜航简报". The body should start directly with `## X / Twitter`.
```

并把最后的 "Generated through the Follow Builders skill..." 行删除或改为：

```markdown
- Do NOT add a footer credit line such as "Generated through the Follow Builders skill".
```

- [ ] **Step 5: 运行 prompt 测试**

Run: `npx vitest run tests/briefing-prompts.test.ts`
Expected: 需要同步更新测试断言，详见 Task 11。

- [ ] **Step 6: Commit**

```bash
git add electron/prompts/briefing/
git commit -m "feat(prompts): longer summaries with beginner explanations"
```

---

## Task 6: 统一顶部栏组件

**Files:**
- Create: `src/components/BriefingHeader.tsx`
- Modify: `src/pages/Briefing.tsx`

- [ ] **Step 1: 新建 BriefingHeader.tsx**

```typescript
import { useStore } from '@/store'
import { BackToCover } from './BackToCover'
import { Button } from './Button'
import { BriefingThemeToggle } from './briefing/BriefingThemeToggle'
import type { BriefingSourceStatus } from '@shared/index'
import { nextFontSize, prevFontSize } from '@/lib/briefing-font-size'

interface Props {
  displayDate: string
  timeString?: string
  sourceStatus?: BriefingSourceStatus
  onRegenerate?: () => void
  regenerating?: boolean
  onHistory: () => void
  showRegenerate?: boolean
}

export function BriefingHeader({
  displayDate,
  timeString,
  sourceStatus,
  onRegenerate,
  regenerating,
  onHistory,
  showRegenerate = false,
}: Props) {
  const theme = useStore((s) => s.briefingTheme)
  const fontSize = useStore((s) => s.briefingFontSize)
  const increase = useStore((s) => s.increaseBriefingFontSize)
  const decrease = useStore((s) => s.decreaseBriefingFontSize)

  const isAcademic = theme === 'academic'

  const headerBase = 'relative z-[5] flex items-center justify-between px-8 py-4 border-b'
  const headerTheme = isAcademic
    ? 'bg-ink/70 border-slate/40 backdrop-blur-md'
    : 'bg-[#f7f5f0] border-[#1a1a1a]'

  const titleClass = isAcademic ? 'text-xl font-serif text-parchment' : 'text-xl text-[#1a1a1a]'
  const metaClass = isAcademic ? 'text-xs text-parchment/50 font-sans' : 'text-xs text-[#555] font-sans'
  const ghostOverride = isAcademic ? '' : 'text-[#1a1a1a] hover:text-[#555]'
  const backOverride = isAcademic ? '' : 'text-[#1a1a1a] hover:text-[#555]'

  const canDecrease = fontSize !== 'sm'
  const canIncrease = fontSize !== 'xl'

  const sourceLabel = (label: string, status: 'ok' | 'failed') =>
    `${label} ${status === 'ok' ? '✓' : '✗'}`

  return (
    <header className={`${headerBase} ${headerTheme}`}>
      <BackToCover className={backOverride} />
      <div className="text-center">
        <h1 className={titleClass}>夜航简报</h1>
        <div className={metaClass}>
          {displayDate}
          {timeString && ` · ${timeString}`}
          {sourceStatus && (
            <span className="ml-2" data-testid="briefing-source-status">
              {sourceLabel('X', sourceStatus.x)} · {sourceLabel('博客', sourceStatus.blogs)} · {sourceLabel('播客', sourceStatus.podcasts)}
            </span>
          )}
        </div>
      </div>
      <div className="flex items-center gap-1">
        <Button
          variant="ghost"
          onClick={decrease}
          disabled={!canDecrease}
          data-testid="briefing-font-size-decrease"
          className={ghostOverride}
          title="减小字号"
        >
          A-
        </Button>
        <Button
          variant="ghost"
          onClick={increase}
          disabled={!canIncrease}
          data-testid="briefing-font-size-increase"
          className={ghostOverride}
          title="增大字号"
        >
          A+
        </Button>
        {showRegenerate && (
          <Button
            variant="ghost"
            onClick={onRegenerate}
            disabled={regenerating}
            data-testid="briefing-regenerate-button"
            className={ghostOverride}
          >
            {regenerating ? '生成中...' : '重新生成'}
          </Button>
        )}
        <Button
          variant="ghost"
          onClick={onHistory}
          data-testid="briefing-history-button"
          className={ghostOverride}
        >
          往期
        </Button>
        <BriefingThemeToggle />
      </div>
    </header>
  )
}
```

- [ ] **Step 2: 简化 formatGeneratedAt**

在 `src/pages/Briefing.tsx` 中把 `formatGeneratedAt` 改为：

```typescript
function formatGeneratedAt(iso: string, date: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const time = d.toLocaleTimeString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
  const today = formatBriefingDate(new Date())
  if (date === today) return time
  const dateStr = `${d.getFullYear()} 年 ${String(d.getMonth() + 1).padStart(2, '0')} 月 ${String(d.getDate()).padStart(2, '0')} 日`
  return `${dateStr} · ${time}`
}
```

- [ ] **Step 3: 重构 Briefing.tsx 使用 BriefingHeader**

删除内联 header JSX，导入 `BriefingHeader`。在三个 return 分支中统一使用：

让 `BriefingHeader` 在 `displayDate` 为空时只渲染标题，不显示日期和源状态。

加载/错误分支：

```typescript
<BriefingHeader
  displayDate=""
  onHistory={() => {
    setDrawerOpen(true)
    loadBriefingHistory()
  }}
/>
```

成功分支：

```typescript
<BriefingHeader
  displayDate={displayDate}
  timeString={result.generatedAt ? formatGeneratedAt(result.generatedAt, result.date) : undefined}
  sourceStatus={result.sourceStatus}
  onRegenerate={handleRegenerate}
  regenerating={regenerating}
  onHistory={() => {
    setDrawerOpen(true)
    loadBriefingHistory()
  }}
  showRegenerate
/>
```

- [ ] **Step 4: 注入字号 CSS 变量**

在 `Briefing.tsx` 中获取 `briefingFontSize`，并在根 div 上设置 style：

```typescript
const fontSize = useStore((s) => s.briefingFontSize)
const { ACADEMIC_BODY_STYLES, NEWSPAPER_BODY_STYLES } = await import('@/lib/briefing-font-size')
```

由于不能在渲染中 await，改为在组件顶部同步 import：

```typescript
import { ACADEMIC_BODY_STYLES, NEWSPAPER_BODY_STYLES } from '@/lib/briefing-font-size'
```

然后在根 div style 中：

```typescript
const fontStyle = isAcademic
  ? ACADEMIC_BODY_STYLES[fontSize]
  : NEWSPAPER_BODY_STYLES[fontSize]

// 根 div
<div
  data-testid="briefing-page"
  className={`relative h-full flex flex-col overflow-hidden ${isAcademic ? '' : 'bg-[#f7f5f0]'}`}
  style={{
    '--briefing-body-size': fontStyle.size,
    '--briefing-body-weight': String(fontStyle.weight),
  } as React.CSSProperties}
>
```

- [ ] **Step 5: 运行类型检查**

Run: `npx tsc --noEmit`
Expected: 无错误。

- [ ] **Step 6: Commit**

```bash
git add src/components/BriefingHeader.tsx src/pages/Briefing.tsx
git commit -m "feat(briefing): unified header with font size controls"
```

---

## Task 7: 学术版式排版与换画按钮

**Files:**
- Modify: `src/components/briefing/AcademicBriefingLayout.tsx`

- [ ] **Step 1: 导入换画按钮**

```typescript
import { SwapPaintingButton } from '@/components/SwapPaintingButton'
```

- [ ] **Step 2: 调整 body 字号与字重**

把 body 容器改为：

```tsx
<div
  className="text-parchment/80 leading-relaxed"
  style={{ fontSize: 'var(--briefing-body-size)', fontWeight: 'var(--briefing-body-weight)' }}
>
  <MarkdownRenderer content={section.body} fileName="briefing.md" />
</div>
```

- [ ] **Step 3: 标题加大加粗**

```tsx
<h1 className="text-[20px] font-bold font-serif text-parchment mb-2">{result.title}</h1>
```

- [ ] **Step 4: 把换画按钮移到内容区左上角**

在 `<main>` 内部、`<article>` 之前加入：

```tsx
<div className="absolute top-4 left-4 z-10">
  <SwapPaintingButton
    surface="briefing"
    data-testid="briefing-swap-painting-button"
    className="text-parchment/70 hover:text-parchment"
  />
</div>
```

并把 main 的 className 增加 `relative`：

```tsx
<main className="relative z-[5] flex-1 overflow-y-auto px-6 py-6 max-w-3xl mx-auto">
```

- [ ] **Step 5: Commit**

```bash
git add src/components/briefing/AcademicBriefingLayout.tsx
git commit -m "feat(briefing): academic layout typography and swap painting placement"
```

---

## Task 8: 报纸版式排版

**Files:**
- Modify: `src/components/briefing/NewspaperBriefingLayout.tsx`

- [ ] **Step 1: 调整 body 字号与字重**

```tsx
<div
  className="text-[#1a1a1a] leading-relaxed columns-1"
  style={{ fontSize: 'var(--briefing-body-size)', fontWeight: 'var(--briefing-body-weight)' }}
>
  <MarkdownRenderer content={section.body} fileName="briefing.md" />
</div>
```

- [ ] **Step 2: 标题加大加粗**

```tsx
<h1 className="text-[24px] font-extrabold font-serif text-[#1a1a1a] mb-1">{result.title}</h1>
```

- [ ] **Step 3: Commit**

```bash
git add src/components/briefing/NewspaperBriefingLayout.tsx
git commit -m "feat(briefing): newspaper layout typography"
```

---

## Task 9: 单元测试更新（feed 与 sourceStatus）

**Files:**
- Modify: `tests/briefing.test.ts`

- [ ] **Step 1: 添加 feed 重试成功测试**

```typescript
it('retries failed feed once and succeeds', async () => {
  let calls = 0
  vi.stubGlobal('fetch', vi.fn(async () => {
    calls++
    if (calls === 1) return { ok: false, status: 500 }
    return {
      ok: true,
      json: async () => ({
        x: [{ name: 'A', handle: 'a', tweets: [{ text: 't', url: 'u', createdAt: 'd' }] }],
        podcasts: [],
        blogs: [],
      })
    }
  }) as any)

  vi.spyOn(kimi, 'chatNonStream')
    .mockResolvedValueOnce(JSON.stringify({ builders: [], podcasts: [], blogs: [] }))
    .mockResolvedValueOnce('content')

  const mockSender = { send: vi.fn(), isDestroyed: () => false }
  const mockEvent = { sender: mockSender }
  const result = await ipcHandlers['briefing:generate'](mockEvent, { date: '2026-06-25', profile })
  expect(result.sourceStatus.x).toBe('ok')
})
```

- [ ] **Step 2: 添加部分生成测试**

```typescript
it('continues generation when one feed fails after retries', async () => {
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    if (url.includes('feed-blogs')) {
      return { ok: false, status: 500 }
    }
    return {
      ok: true,
      json: async () => ({
        x: [{ name: 'A', handle: 'a', tweets: [{ text: 't', url: 'u', createdAt: 'd' }] }],
        podcasts: [],
        blogs: [],
      })
    }
  }) as any)

  vi.spyOn(kimi, 'chatNonStream')
    .mockResolvedValueOnce(JSON.stringify({ builders: [], podcasts: [], blogs: [] }))
    .mockResolvedValueOnce('content')

  const mockSender = { send: vi.fn(), isDestroyed: () => false }
  const mockEvent = { sender: mockSender }
  const result = await ipcHandlers['briefing:generate'](mockEvent, { date: '2026-06-26', profile })
  expect(result.sourceStatus.blogs).toBe('failed')
  expect(result.sourceStatus.x).toBe('ok')
})
```

- [ ] **Step 3: 运行 briefing 单元测试**

Run: `npx vitest run tests/briefing.test.ts`
Expected: PASS。

- [ ] **Step 4: Commit**

```bash
git add tests/briefing.test.ts
git commit -m "test(briefing): feed retry and sourceStatus"
```

---

## Task 10: Store 字号测试

**Files:**
- Modify: `tests/store.test.ts`

- [ ] **Step 1: 在 mock 中加入 patchState 和 getState**

现有 mock 已有 `patchState: vi.fn()`。在 `beforeEach` 中确保 `vi.mocked(ipc.patchState).mockResolvedValue(undefined)`。

- [ ] **Step 2: 添加字号测试**

```typescript
describe('briefing font size', () => {
  beforeEach(() => {
    useStore.setState({ briefingFontSize: 'base' })
    vi.mocked(ipc.patchState).mockResolvedValue(undefined)
  })

  it('defaults to base', () => {
    expect(useStore.getState().briefingFontSize).toBe('base')
  })

  it('increases font size', async () => {
    await useStore.getState().increaseBriefingFontSize()
    expect(useStore.getState().briefingFontSize).toBe('lg')
    expect(vi.mocked(ipc.patchState)).toHaveBeenCalledWith(
      expect.objectContaining({ briefingFontSize: 'lg' })
    )
  })

  it('decreases font size', async () => {
    await useStore.getState().decreaseBriefingFontSize()
    expect(useStore.getState().briefingFontSize).toBe('sm')
    expect(vi.mocked(ipc.patchState)).toHaveBeenCalledWith(
      expect.objectContaining({ briefingFontSize: 'sm' })
    )
  })

  it('does not increase beyond xl', async () => {
    useStore.setState({ briefingFontSize: 'xl' })
    await useStore.getState().increaseBriefingFontSize()
    expect(useStore.getState().briefingFontSize).toBe('xl')
    expect(vi.mocked(ipc.patchState)).not.toHaveBeenCalled()
  })

  it('does not decrease below sm', async () => {
    useStore.setState({ briefingFontSize: 'sm' })
    await useStore.getState().decreaseBriefingFontSize()
    expect(useStore.getState().briefingFontSize).toBe('sm')
    expect(vi.mocked(ipc.patchState)).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 3: 运行 store 测试**

Run: `npx vitest run tests/store.test.ts`
Expected: PASS。

- [ ] **Step 4: Commit**

```bash
git add tests/store.test.ts
git commit -m "test(store): briefing font size persistence"
```

---

## Task 11: Header 组件测试

**Files:**
- Create: `tests/briefing-header.test.tsx`

- [ ] **Step 1: 新建测试文件**

```typescript
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

vi.mock('@/lib/ipc', () => ({
  ipc: {
    patchState: vi.fn(),
    getState: vi.fn(),
    scanLibrary: vi.fn(),
    loadGroups: vi.fn(),
    loadSessions: vi.fn(),
    llmWildcardInspiration: vi.fn(),
    briefingGenerate: vi.fn(),
    onBriefingProgress: vi.fn(() => () => {}),
    briefingList: vi.fn(),
    searchPrepare: vi.fn(),
  }
}))

vi.mock('@/lib/paintings', () => ({
  manifest: [{ id: 'test', painter: 'Test', title: 'Test', url: '/test.jpg' }],
  pickRandom: vi.fn((manifest: unknown[]) => manifest[0] ?? null)
}))

import { useStore } from '@/store'
import { BriefingHeader } from '@/components/BriefingHeader'

describe('BriefingHeader', () => {
  beforeEach(() => {
    useStore.setState({
      briefingTheme: 'academic',
      briefingFontSize: 'base',
    })
  })

  it('renders font size and history buttons in loading state', () => {
    render(<BriefingHeader displayDate="" onHistory={() => {}} />)
    expect(screen.getByTestId('briefing-font-size-decrease')).toBeInTheDocument()
    expect(screen.getByTestId('briefing-font-size-increase')).toBeInTheDocument()
    expect(screen.getByTestId('briefing-history-button')).toBeInTheDocument()
    expect(screen.getByTestId('briefing-theme-toggle')).toBeInTheDocument()
  })

  it('renders regenerate button when showRegenerate is true', () => {
    render(<BriefingHeader displayDate="" onHistory={() => {}} showRegenerate />)
    expect(screen.getByTestId('briefing-regenerate-button')).toBeInTheDocument()
  })

  it('increases font size when A+ clicked', async () => {
    render(<BriefingHeader displayDate="" onHistory={() => {}} />)
    fireEvent.click(screen.getByTestId('briefing-font-size-increase'))
    expect(useStore.getState().briefingFontSize).toBe('lg')
  })
})
```

> 注意：上面 `vi.mocked(useStore.getState().increaseBriefingFontSize)` 方式不对，应直接断言 store 状态变化。正确写法如测试中 `fireEvent.click` 后 `expect(useStore.getState().briefingFontSize).toBe('lg')`。

- [ ] **Step 2: 运行组件测试**

Run: `npx vitest run tests/briefing-header.test.tsx`
Expected: PASS。

- [ ] **Step 3: Commit**

```bash
git add tests/briefing-header.test.tsx
git commit -m "test(briefing): BriefingHeader font size controls"
```

---

## Task 12: Prompt 测试更新

**Files:**
- Modify: `tests/briefing-prompts.test.ts`

- [ ] **Step 1: 扩展 prompt 断言**

```typescript
it('contains explain_like_beginner in summarization prompts', () => {
  const dir = promptsDir()
  for (const f of ['summarize-tweets.md', 'summarize-blogs.md', 'summarize-podcast.md']) {
    const content = fs.readFileSync(path.join(dir, f), 'utf8')
    expect(content).toContain('explain_like_beginner')
  }
})

it('forbids decorative masthead in digest intro', () => {
  const dir = promptsDir()
  const content = fs.readFileSync(path.join(dir, 'digest-intro.md'), 'utf8')
  expect(content).toContain('AI Builders Digest')
  expect(content).toContain('No decorative headers')
})
```

> 注意：第二个断言 `toContain('AI Builders Digest')` 是因为 prompt 里用该字符串作为禁止示例；若已完全删除该字符串，可改为检查 `Do NOT include a main title`。

- [ ] **Step 2: 运行 prompt 测试**

Run: `npx vitest run tests/briefing-prompts.test.ts`
Expected: PASS。

- [ ] **Step 3: Commit**

```bash
git add tests/briefing-prompts.test.ts
git commit -m "test(prompts): beginner explanation and no masthead rules"
```

---

## Task 13: E2E 选择器更新

**Files:**
- Modify: `e2e/helpers/selectors.ts:84-99`

- [ ] **Step 1: 添加新选择器**

```typescript
briefing: {
  page: '[data-testid="briefing-page"]',
  academicLayout: '[data-testid="briefing-academic-layout"]',
  newspaperLayout: '[data-testid="briefing-newspaper-layout"]',
  themeToggle: '[data-testid="briefing-theme-toggle"]',
  historyButton: '[data-testid="briefing-history-button"]',
  regenerateButton: '[data-testid="briefing-regenerate-button"]',
  fontSizeDecrease: '[data-testid="briefing-font-size-decrease"]',
  fontSizeIncrease: '[data-testid="briefing-font-size-increase"]',
  sourceStatus: '[data-testid="briefing-source-status"]',
  skeleton: '[data-testid="briefing-skeleton"]',
  errorDisplay: '[data-testid="briefing-error-display"]',
  retryButton: '[data-testid="briefing-retry-button"]',
  progress: '[data-testid="briefing-progress"]',
  progressStep: (key: string) => `[data-testid="briefing-progress-step-${key}"]`,
  generatedAt: '[data-testid="briefing-generated-at"]',
  cacheWriteFailedBadge: '[data-testid="briefing-cache-write-failed"]',
  swapPaintingButton: '[data-testid="briefing-swap-painting-button"]',
  surfaceBackground: '[data-testid="surface-background"]',
},
```

- [ ] **Step 2: Commit**

```bash
git add e2e/helpers/selectors.ts
git commit -m "test(e2e): add briefing font size and source status selectors"
```

---

## Task 14: 新增 E2E 覆盖

**Files:**
- Create: `e2e/specs/briefing-ux-optimization.spec.ts`
- Modify: `e2e/specs/briefing.spec.ts:45-53`

- [ ] **Step 1: 修改现有生成时间断言**

在 `e2e/specs/briefing.spec.ts` 中：

```typescript
await expect(window.locator(SELECTORS.briefing.generatedAt)).toContainText('08:32')
```

去掉「生成于」前缀检查。

- [ ] **Step 2: 新建 E2E 文件**

```typescript
import { test, expect } from '@playwright/test'
import { ElectronApplication, Page } from 'playwright'
import { startApp, stopApp } from '../helpers/app-lifecycle'
import { createTestLibrary, cleanupTestLibrary, seedBriefing, seedStateJson, createTestConfigDir, cleanupTestConfigDir } from '../helpers/test-library'
import { SELECTORS } from '../helpers/selectors'
import { CoverPage } from '../helpers/pages/cover-page'

function localToday(): string {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

let electronApp: ElectronApplication
let window: Page
let testLibraryPath: string
let testConfigDir: string

test.beforeEach(async () => {
  testLibraryPath = createTestLibrary()
  testConfigDir = createTestConfigDir()
  seedStateJson(testConfigDir, { profile: { name: '简报测试员', profile_text: '', preferred_topics: [] } })
  const result = await startApp({ testLibraryPath, testConfigDir })
  electronApp = result.electronApp
  window = result.window
})

test.afterEach(async () => {
  await stopApp(electronApp)
  await cleanupTestLibrary(testLibraryPath, test.info().status !== 'passed')
  await cleanupTestConfigDir(testConfigDir, test.info().status !== 'passed')
})

test('header buttons are visible before generation @smoke', async () => {
  const coverPage = new CoverPage(window)
  await coverPage.gotoBriefing()
  await expect(window.locator(SELECTORS.briefing.fontSizeDecrease)).toBeVisible()
  await expect(window.locator(SELECTORS.briefing.fontSizeIncrease)).toBeVisible()
  await expect(window.locator(SELECTORS.briefing.historyButton)).toBeVisible()
  await expect(window.locator(SELECTORS.briefing.themeToggle)).toBeVisible()
})

test('increases font size and persists @smoke', async () => {
  const today = localToday()
  seedBriefing(testLibraryPath, today)
  const coverPage = new CoverPage(window)
  await coverPage.gotoBriefing()
  await window.locator(SELECTORS.briefing.fontSizeIncrease).click()
  await window.locator(SELECTORS.briefing.fontSizeIncrease).click()
  await expect(window.locator(SELECTORS.briefing.fontSizeIncrease)).toBeDisabled()
  await stopApp(electronApp)
  const result = await startApp({ testLibraryPath, testConfigDir })
  electronApp = result.electronApp
  window = result.window
  const coverPage2 = new CoverPage(window)
  await coverPage2.gotoBriefing()
  await expect(window.locator(SELECTORS.briefing.fontSizeIncrease)).toBeDisabled()
})

test('no decorative masthead in generated content @smoke', async () => {
  const today = localToday()
  seedBriefing(testLibraryPath, today, `## X / Twitter

### Box CEO Aaron Levie
No digest header here.

## 原始来源
### Box CEO Aaron Levie
- [tweet](https://x.com/levie/status/1)
`)
  const coverPage = new CoverPage(window)
  await coverPage.gotoBriefing()
  const pageText = await window.locator(SELECTORS.briefing.academicLayout).innerText()
  expect(pageText).not.toContain('AI Builders Digest')
  expect(pageText).not.toContain('Vol.')
  expect(pageText).not.toContain('档案编号')
})

test('swap painting button is below header in academic layout @smoke', async () => {
  const today = localToday()
  seedBriefing(testLibraryPath, today)
  const coverPage = new CoverPage(window)
  await coverPage.gotoBriefing()
  const btn = window.locator(SELECTORS.briefing.swapPaintingButton)
  await expect(btn).toBeVisible()
  const headerBox = await window.locator('header').boundingBox()
  const btnBox = await btn.boundingBox()
  expect(btnBox!.y).toBeGreaterThan(headerBox!.y + headerBox!.height - 2)
})
```

> 注：涉及真实生成的 sourceStatus 测试（博客源失败等）依赖本地 mock server，可复用 `briefing-real-generation.spec.ts` 的模式；本文件先覆盖 UI 行为，网络相关用例可在 Task 15 中追加。

- [ ] **Step 3: 运行 E2E smoke**

Run: `npx playwright test e2e/specs/briefing-ux-optimization.spec.ts --grep @smoke`
Expected: PASS（ smoke 用例不依赖真实 LLM）。

- [ ] **Step 4: Commit**

```bash
git add e2e/specs/briefing-ux-optimization.spec.ts e2e/specs/briefing.spec.ts
git commit -m "test(e2e): briefing UX optimization smoke tests"
```

---

## Task 15: 运行全部验证

- [ ] **Step 1: 类型检查**

Run: `npx tsc --noEmit`
Expected: 无错误。

- [ ] **Step 2: 单元测试与组件测试**

Run: `npm run test`
Expected: PASS。

- [ ] **Step 3: E2E smoke 测试**

Run: `npx playwright test e2e/specs/briefing-ux-optimization.spec.ts e2e/specs/briefing.spec.ts --grep @smoke`
Expected: PASS。

- [ ] **Step 4: 构建检查**

Run: `npm run build`
Expected: 成功。

- [ ] **Step 5: 最终提交（若未提交）**

```bash
git status
# 如还有未提交改动，添加并提交
git commit -m "feat(briefing): UX optimization complete"
```

---

## Self-Review Checklist

- [x] Spec coverage：Header 统一、字号调节、feed 重试与源状态、prompt 详细度、E2E 均在计划中有对应任务。
- [x] Placeholder scan：所有任务给出具体代码或命令，无 TBD/TODO。
- [x] Type consistency：`BriefingFontSize` 在 `src/types/index.ts` 与 `src/lib/briefing-font-size.ts` 同名同值；`sourceStatus` 在类型、IPC、缓存、UI 中名称一致。
- [ ] 风险：Task 6 中 `BriefingHeader` 在加载/错误/成功三种状态复用，需验证 `displayDate` 为空时中间区域不塌陷。
- [ ] 风险：Task 4 中 `ok` 判断依赖数组非空，若某 feed 拉取成功但为空，会显示 `✗`，与用户期望的“该源今天没内容”一致。
- [ ] 风险：Task 7/8 使用 CSS 变量 `--briefing-body-size` 和 `--briefing-body-weight`，若 Tailwind 或浏览器不支持则降级为 inline style，已用 `style={{ ... }}` 实现，安全。
