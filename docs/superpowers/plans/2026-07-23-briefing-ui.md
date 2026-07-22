# 夜航简报「学者夜话」UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把学习页的三大诗意资产（引力星图、语录、画作）注入夜航简报全部四个来源，纯渲染层改造。

**Architecture:** 新增 3 个组件（`BriefingVeil` 分层渐变遮罩、`BriefingEmptyState` 空态、`BriefingConstellation` 生成星图）+ `Quote` 组件加 `'briefing'` 变体（四处落位）+ `BriefingProgress` 渲染层替换为星图。零主进程改动；store 仅新增两个 stage detail 字段（`onBriefingProgress` 已有 detail 参数，此前被丢弃）。

**Tech Stack:** React 18 + Tailwind + Zustand + Vitest（jsdom + @testing-library/react）+ Playwright Electron E2E。

**Spec:** `docs/superpowers/specs/2026-07-23-briefing-ui-design.md`

**关键约束（来自 rules，执行时不可违反）：**
- 组件文件只导出组件；helper/常量移到 `src/lib/`（ui-styling §10）
- 全局 Chrome（遮罩、换画按钮）始终挂载，不受内容分支影响（ui-styling §8）
- 保留 `briefing-progress-step-{key}` testid，旧断言不 break
- 求职渲染器的章节标题已被 E2E 用 `getByRole('heading', { name: '今日新动态' })` 断言——装饰 ◆ 必须 `aria-hidden`，不能进入 accessible name
- store schema 变更时同步 `e2e/helpers/test-library.ts` 的 `BASE_STATE`（e2e §6）

---

### Task 1: BriefingVeil 分层渐变遮罩 + Academic 排版精修

**Files:**
- Create: `src/components/briefing/BriefingVeil.tsx`
- Modify: `src/pages/Briefing.tsx:117-123`（平遮罩替换）、`src/components/briefing/index.ts`（barrel 导出）
- Modify: `src/components/md/markdown.css:529-531`（术语高亮改点线）及文件末尾（◆ 菱标、行距）
- Test: `tests/briefing-veil.test.tsx`（新建）、`tests/briefing-typography.test.ts`（新建）

- [ ] **Step 1: 写失败测试 `tests/briefing-veil.test.tsx`**

```tsx
import { render, screen, cleanup } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { BriefingVeil } from '@/components/briefing/BriefingVeil'

describe('BriefingVeil', () => {
  it('renders a fixed pointer-events-none overlay with the layered gradient', () => {
    cleanup()
    render(<BriefingVeil />)
    const veil = screen.getByTestId('briefing-veil')
    expect(veil.className).toContain('pointer-events-none')
    expect(veil.className).toContain('fixed')
    expect(veil.style.background).toContain('linear-gradient')
    expect(veil.style.background).toContain('rgba(12, 8, 6, 0.3)')
  })
})
```

- [ ] **Step 2: 写失败测试 `tests/briefing-typography.test.ts`**

```ts
import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const markdownCss = fs.readFileSync(path.join(process.cwd(), 'src/components/md/markdown.css'), 'utf8')

describe('briefing academic typography', () => {
  it('decorates academic section headings with the amber diamond ornament', () => {
    expect(markdownCss).toContain('.briefing-body-academic .md-body h2::before')
    expect(markdownCss).toContain('◆')
  })

  it('highlights terms with a dotted amber underline', () => {
    expect(markdownCss).toMatch(/\.article-term-highlight\s*\{[^}]*border-bottom:\s*1px dotted #d97757/)
  })

  it('sets academic body line-height to 1.9', () => {
    expect(markdownCss).toMatch(/\.briefing-body-academic \.md-body p\s*\{[^}]*line-height:\s*1\.9/)
  })
})
```

- [ ] **Step 3: 运行测试确认失败**

Run: `npx vitest run tests/briefing-veil.test.tsx tests/briefing-typography.test.ts`
Expected: FAIL（`BriefingVeil` 不存在；CSS 断言不通过）

- [ ] **Step 4: 实现 `src/components/briefing/BriefingVeil.tsx`**

```tsx
// 分层渐变遮罩：报头区透出画作（0.30）→ 正文区压暗至 0.94。
// 全局 Chrome，仅 Academic 主题挂载（调用方控制），自身不读主题（ui-styling §8）。
export function BriefingVeil() {
  return (
    <div
      data-testid="briefing-veil"
      className="fixed inset-0 z-[1] pointer-events-none"
      style={{
        background:
          'linear-gradient(180deg, rgba(12,8,6,0.30) 0%, rgba(12,8,6,0.62) 26%, rgba(12,8,6,0.86) 55%, rgba(12,8,6,0.94) 100%)',
      }}
      aria-hidden="true"
    />
  )
}
```

在 `src/components/briefing/index.ts` 中补一行 barrel 导出（保持既有导出不动）：

```ts
export { BriefingVeil } from './BriefingVeil'
```

- [ ] **Step 5: Briefing.tsx 替换平遮罩**

`src/pages/Briefing.tsx` 顶部 import 区把 `AcademicBriefingLayout, NewspaperBriefingLayout` 那行改为：

```tsx
import { AcademicBriefingLayout, NewspaperBriefingLayout, BriefingVeil } from '@/components/briefing'
```

把 118-123 行：

```tsx
      {isAcademic && (
        <div
          className="fixed inset-0 z-[1] bg-[#0c0806]/[0.72] pointer-events-none"
          aria-hidden="true"
        />
      )}
```

替换为：

```tsx
      {isAcademic && <BriefingVeil />}
```

- [ ] **Step 6: markdown.css 排版精修**

`src/components/md/markdown.css` 529-531 行：

```css
.article-term-highlight {
  border-bottom: 1px dashed #d97757;
  cursor: help;
}
```

改为：

```css
.article-term-highlight {
  border-bottom: 1px dotted #d97757;
  color: #d97757;
  cursor: help;
}
```

文件末尾追加：

```css
/* ===== Academic section heading ornament (学者夜话 ◆ 菱标) ===== */
.briefing-body-academic .md-body h2::before {
  content: '◆ ';
  color: #d97757;
  font-size: 0.62em;
  vertical-align: 2px;
}

/* ===== Academic body rhythm ===== */
.briefing-body-academic .md-body p {
  line-height: 1.9;
}
```

- [ ] **Step 7: 运行测试确认通过**

Run: `npx vitest run tests/briefing-veil.test.tsx tests/briefing-typography.test.ts`
Expected: PASS

- [ ] **Step 8: 回归 + Commit**

Run: `npx vitest run tests/briefing-layout.test.tsx tests/briefing-page.test.tsx`
Expected: PASS（平遮罩无既有断言）

```bash
git add src/components/briefing/BriefingVeil.tsx src/components/briefing/index.ts src/pages/Briefing.tsx src/components/md/markdown.css tests/briefing-veil.test.tsx tests/briefing-typography.test.ts
git commit -m "feat(briefing): layered veil gradient + academic typography polish (◆ ornament, dotted terms)"
```

---

### Task 2: Quote 组件 `briefing` 变体（琥珀双线窄带）

**Files:**
- Modify: `src/components/Quote.tsx`
- Test: `tests/quote-band.test.tsx`（新建）

- [ ] **Step 1: 写失败测试 `tests/quote-band.test.tsx`**

```tsx
import { render, screen, cleanup } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Quote } from '@/components/Quote'

describe('Quote briefing variant', () => {
  it('renders the amber double-line band with text and meta', () => {
    cleanup()
    render(<Quote surface="briefing" />)
    expect(screen.getByTestId('quote-band')).toBeInTheDocument()
    expect(screen.getByTestId('quote-text').textContent).toMatch(/“.+”/)
    expect(screen.getByTestId('quote-meta').textContent).toContain('—')
  })

  it('offers a refresh button', () => {
    cleanup()
    render(<Quote surface="briefing" />)
    expect(screen.getByTestId('quote-refresh-button')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: 运行确认失败**

Run: `npx vitest run tests/quote-band.test.tsx`
Expected: FAIL（无 `quote-band` testid）

- [ ] **Step 3: 实现 briefing 变体**

`src/components/Quote.tsx`：
- Props 类型第 5 行改为 `surface: 'cover' | 'home' | 'study' | 'briefing'`
- 在 `const isCover = surface === 'cover'` 之后、共享 return 之前插入：

```tsx
  if (surface === 'briefing') {
    return (
      <div className="group max-w-[480px] text-center" data-testid="quote-band">
        <div className="border-t border-b border-ember/35 px-4 py-2.5">
          <div
            data-testid="quote-text"
            className="font-serif italic text-[13px] leading-relaxed text-parchment"
            style={{ textShadow: '0 1px 6px rgba(0,0,0,0.6)' }}
          >
            “{quote.text}”
          </div>
          <div className="mt-1 inline-flex items-center gap-2 font-sans text-[10px] text-parchment/50">
            <span data-testid="quote-meta">
              — {quote.author}
              {quote.source && (
                <>
                  <span className="mx-1 text-parchment/30">·</span>
                  {quote.source}
                </>
              )}
            </span>
            <button
              onClick={refresh}
              className="opacity-0 group-hover:opacity-100 focus-visible:opacity-100 text-parchment/40 hover:text-ember transition-opacity"
              data-testid="quote-refresh-button"
              title="换一句"
            >
              ↻
            </button>
          </div>
        </div>
      </div>
    )
  }
```

（该 early return 放在 `if (!quote) return null` 之后。）

- [ ] **Step 4: 运行测试确认通过 + 回归**

Run: `npx vitest run tests/quote-band.test.tsx tests/quotes.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/Quote.tsx tests/quote-band.test.tsx
git commit -m "feat(quote): add briefing surface variant (amber double-line band)"
```

---

### Task 3: 语录带四落位 + 求职章节 ◆ 装饰

落位：digest 阅读页、求职阅读页（渲染器容器顶部）、Anthropic 阅读页、写作页。全部纯 UI 层，不落 md。Newspaper 主题不渲染（写作页无 Newspaper 变体，恒渲染）。

**Files:**
- Modify: `src/components/briefing/AcademicBriefingLayout.tsx:37-40`（header 区）
- Modify: `src/components/job-briefing/JobBriefingRenderer.tsx`（renderSectionTitle 加 ◆；根容器顶部加语录带）
- Modify: `src/components/anthropic/AnthropicArticleReader.tsx`（header 内 summary box 之后）
- Modify: `src/components/writing/WritingBoard.tsx:66-72`（编辑区滚动容器内顶部）
- Modify: `docs/superpowers/specs/2026-07-23-briefing-ui-design.md`（§3 求职落位措辞微调：渲染器容器顶部、profile-hint 之下）
- Test: `tests/briefing-layout.test.tsx`、`tests/job-briefing-layout.test.tsx`（各加断言）

- [ ] **Step 1: 加失败断言 — `tests/briefing-layout.test.tsx` 末尾新 describe**

```tsx
describe('BriefingLayout quote band', () => {
  beforeEach(() => cleanup())

  const quoteResult = {
    title: 'Test',
    date: '2026-07-11',
    content: 'Body text with [link](https://example.com).',
    sources: [],
    filePath: '/x.md',
    cached: false,
    generatedAt: new Date().toISOString(),
    sourceStatus: { x: 'ok', podcasts: 'ok', blogs: 'ok' },
  } as const

  const quoteParsed = {
    sections: [{ title: 'X / Twitter', body: 'Body text with [link](https://example.com).' }],
    sources: [{ title: 'X', items: ['[tweet](https://example.com)'] }],
  }

  it('academic layout shows the quote band; newspaper does not', () => {
    render(<AcademicBriefingLayout result={quoteResult as any} parsed={quoteParsed} displayDate="2026 年 07 月 11 日" />)
    expect(screen.getByTestId('quote-text')).toBeInTheDocument()
    cleanup()
    render(<NewspaperBriefingLayout result={quoteResult as any} parsed={quoteParsed} displayDate="2026 年 07 月 11 日" />)
    expect(screen.queryByTestId('quote-text')).not.toBeInTheDocument()
  })
})
```

- [ ] **Step 2: 加失败断言 — `tests/job-briefing-layout.test.tsx`**

```tsx
describe('JobBriefingRenderer quote band and ornaments', () => {
  afterEach(cleanup)

  it('shows the quote band at top in academic theme', () => {
    renderAcademic()
    expect(screen.getByTestId('quote-text')).toBeInTheDocument()
  })

  it('hides the quote band in newspaper theme', () => {
    render(<JobBriefingRenderer content={CONTENT} theme="newspaper" fontSize="base" />)
    expect(screen.queryByTestId('quote-text')).not.toBeInTheDocument()
  })

  it('decorates academic section titles with an aria-hidden amber diamond', () => {
    renderAcademic()
    const heading = screen.getByRole('heading', { name: '今日新动态' })
    const ornament = heading.querySelector('span[aria-hidden="true"]')
    expect(ornament).not.toBeNull()
    expect(ornament!.textContent).toBe('◆')
  })
})
```

（`name: '今日新动态'` 能匹配即证明 ◆ 没进 accessible name。）

- [ ] **Step 3: 运行确认失败**

Run: `npx vitest run tests/briefing-layout.test.tsx tests/job-briefing-layout.test.tsx`
Expected: 新增用例 FAIL

- [ ] **Step 4: AcademicBriefingLayout 落位**

`src/components/briefing/AcademicBriefingLayout.tsx` 顶部加 `import { Quote } from '@/components/Quote'`，header 区（38-39 行 h1/p 之后）插入：

```tsx
          <div className="mt-5 flex justify-center">
            <Quote surface="briefing" />
          </div>
```

- [ ] **Step 5: JobBriefingRenderer 落位 + ◆**

顶部加 `import { Quote } from '@/components/Quote'`。`renderSectionTitle`（211-218 行）改为：

```tsx
  const renderSectionTitle = (title: string) => (
    <h2
      className={`text-2xl mb-6 border-b pb-2 ${sectionTitle}`}
      style={{ fontSize: headingStyle.size, fontWeight: headingStyle.weight }}
    >
      {isAcademic && (
        <span aria-hidden="true" className="mr-2" style={{ color: '#d97757', fontSize: '0.62em', verticalAlign: '2px' }}>
          ◆
        </span>
      )}
      {title}
    </h2>
  )
```

根容器（221-224 行 `<div className={...space-y-8...}>` 开标签之后）插入第一个子元素：

```tsx
      {isAcademic && (
        <div className="flex justify-center">
          <Quote surface="briefing" />
        </div>
      )}
```

- [ ] **Step 6: AnthropicArticleReader 落位**

顶部加 `import { Quote } from '@/components/Quote'`。在 header 内 summary box（`data-testid="anthropic-reader-summary"` 所在 div）之后、`</header>` 之前插入：

```tsx
                {isAcademic && (
                  <div className="mt-6 flex justify-center">
                    <Quote surface="briefing" />
                  </div>
                )}
```

- [ ] **Step 7: WritingBoard 落位（随编辑区滚动）**

`src/components/writing/WritingBoard.tsx` 顶部加 `import { Quote } from '@/components/Quote'`。编辑区容器（66-72 行）内、`<WritingEditor` 之前插入：

```tsx
        <div className="flex justify-center mb-4">
          <Quote surface="briefing" />
        </div>
```

- [ ] **Step 8: spec 措辞同步**

`docs/superpowers/specs/2026-07-23-briefing-ui-design.md` §3 落位表第 2 行「求职阅读态：`JobBriefingRenderer` 容器顶部（profile-hint 之上）」改为「求职阅读态：`JobBriefingRenderer` 容器顶部（位于 profile-hint 之下；hint 仅在档案为空时出现，不值得为它把语录带拉进页面层）」。

- [ ] **Step 9: 运行测试确认通过 + 回归**

Run: `npx vitest run tests/briefing-layout.test.tsx tests/job-briefing-layout.test.tsx tests/anthropic-reader-theme.test.tsx tests/anthropic-reader-images.test.tsx tests/anthropic-blog-panel.test.tsx tests/writing-store.test.ts`
Expected: PASS

- [ ] **Step 10: Commit**

```bash
git add src/components/briefing/AcademicBriefingLayout.tsx src/components/job-briefing/JobBriefingRenderer.tsx src/components/anthropic/AnthropicArticleReader.tsx src/components/writing/WritingBoard.tsx tests/briefing-layout.test.tsx tests/job-briefing-layout.test.tsx docs/superpowers/specs/2026-07-23-briefing-ui-design.md
git commit -m "feat(briefing): quote band placements across digest/job/anthropic/writing + job section ◆ ornament"
```

---

### Task 4: BriefingEmptyState 空态组件（语录 + 微轨道 + 主按钮）

**Files:**
- Create: `src/components/briefing/BriefingEmptyState.tsx`
- Modify: `src/pages/Briefing.tsx`（digest 与 job 两个空态分支）、`src/components/briefing/index.ts`
- Test: `tests/briefing-empty-state.test.tsx`（加断言）

- [ ] **Step 1: 加失败断言 — `tests/briefing-empty-state.test.tsx` 追加**

```tsx
  it('shows quote band and orbit in digest empty state', () => {
    render(<Briefing />)
    expect(screen.getByTestId('quote-text')).toBeInTheDocument()
    expect(screen.getByTestId('briefing-empty-orbit')).toBeInTheDocument()
  })

  it('shows quote band and orbit in job empty state', () => {
    useStore.setState({
      briefingSource: 'job-briefing',
      jobBriefing: { result: null, loading: false, error: null },
    })
    render(<Briefing />)
    expect(screen.getByTestId('briefing-receive-job-button')).toBeInTheDocument()
    expect(screen.getByTestId('quote-text')).toBeInTheDocument()
    expect(screen.getByTestId('briefing-empty-orbit')).toBeInTheDocument()
  })
```

（digest 用例沿用 beforeEach 的默认状态；job 用例放最后以免污染后续用例——它已是文件末尾则无碍。）

- [ ] **Step 2: 运行确认失败**

Run: `npx vitest run tests/briefing-empty-state.test.tsx`
Expected: 两条新用例 FAIL（无 `briefing-empty-orbit`）

- [ ] **Step 3: 实现 `src/components/briefing/BriefingEmptyState.tsx`**

```tsx
import { Quote } from '@/components/Quote'
import { StarOrbit } from '@/components/StarOrbit'
import { useStore } from '@/store'

interface Props {
  hint: string
  buttonLabel: string
  buttonTestId: string
  onReceive: () => void
}

export function BriefingEmptyState({ hint, buttonLabel, buttonTestId, onReceive }: Props) {
  const theme = useStore((s) => s.briefingTheme)
  const isAcademic = theme !== 'newspaper'
  return (
    <main className="relative z-[5] flex-1 flex items-center justify-center px-6">
      <div className="flex flex-col items-center gap-5 text-center">
        <div data-testid="briefing-empty-orbit">
          <StarOrbit starCount={2} radius={10} period={2400} showLines />
        </div>
        <Quote surface="briefing" />
        <p className={isAcademic ? 'text-parchment/70' : 'text-[#6b5d52]'}>{hint}</p>
        <button
          data-testid={buttonTestId}
          onClick={onReceive}
          className={`px-8 py-3 rounded text-[15px] font-serif transition-colors ${
            isAcademic
              ? 'bg-ember text-white hover:bg-ember/90'
              : 'bg-[#1a1a1a] text-white hover:bg-[#333]'
          }`}
        >
          {buttonLabel}
        </button>
      </div>
    </main>
  )
}
```

barrel（`src/components/briefing/index.ts`）补：`export { BriefingEmptyState } from './BriefingEmptyState'`

- [ ] **Step 4: Briefing.tsx 接入两个空态分支**

digest 空态分支（约 299-317 行 `emptyState ? (` 的整个 `<main>...</main>`）替换为：

```tsx
              <BriefingEmptyState
                hint="今日夜航简报尚未生成"
                buttonLabel="查收日报"
                buttonTestId="briefing-receive-digest-button"
                onReceive={() => generateBriefing(today)}
              />
```

job 空态分支（约 233-251 行 `jobEmptyState ? (` 的整个 `<main>...</main>`）替换为：

```tsx
              <BriefingEmptyState
                hint="今日求职简报尚未生成"
                buttonLabel="生成求职简报"
                buttonTestId="briefing-receive-job-button"
                onReceive={() => generateJobBriefing(today)}
              />
```

import 行改为从 barrel 引入 `BriefingEmptyState`（并入 Task 1 的 import）。清理孤儿：`BriefingSkeleton`/`BriefingProgress` 等仍被 loading 分支使用，不动；确认 digest/job 空态原内联 JSX 删除后无未使用的变量。

- [ ] **Step 5: 运行测试确认通过 + 回归**

Run: `npx vitest run tests/briefing-empty-state.test.tsx tests/briefing-page.test.tsx`
Expected: PASS（含既有 newspaper 按钮 class 断言）

- [ ] **Step 6: Commit**

```bash
git add src/components/briefing/BriefingEmptyState.tsx src/components/briefing/index.ts src/pages/Briefing.tsx tests/briefing-empty-state.test.tsx
git commit -m "feat(briefing): unified empty state with quote band + star orbit (digest & job)"
```

---

### Task 5: BriefingConstellation 星图 + BriefingProgress 改造 + store detail 字段

**Files:**
- Create: `src/components/briefing/BriefingConstellation.tsx`
- Modify: `src/components/BriefingProgress.tsx`（整体替换为委托）、`src/styles/globals.css`（末尾加 keyframes + reduced-motion）、`src/components/briefing/index.ts`
- Modify: `src/store/index.ts:118-119, 392-393, 578-604, 635-652`（detail 字段）
- Modify: `e2e/helpers/test-library.ts:437`（BASE_STATE 同步两个新字段）
- Test: `tests/briefing-constellation.test.tsx`（新建）、`tests/briefing-typography.test.ts`（加 reduced-motion 断言）

- [ ] **Step 1: store 加 detail 字段**

`src/store/index.ts`：
- 119 行后加：`briefingStageDetail: string | null` 与 `jobBriefingStageDetail: string | null`（State 接口，紧邻既有 stage 字段）
- 393 行后加初始值：`briefingStageDetail: null,` `jobBriefingStageDetail: null,`
- digest 订阅（约 582 行）改为：`const unsubscribe = ipc.onBriefingProgress((stage, detail) => set({ briefingStage: stage, briefingStageDetail: detail ?? null }))`
- digest 成功/失败两个 set（约 589、604 行）的 `briefingStage: null` 旁各加 `briefingStageDetail: null,`
- job 订阅（约 636 行）改为：`const unsubscribe = ipc.onBriefingProgress((stage, detail) => set({ jobBriefingStage: stage, jobBriefingStageDetail: detail ?? null }))`
- job 成功/失败（约 639、652 行）的 `jobBriefingStage: null` 旁各加 `jobBriefingStageDetail: null,`

`e2e/helpers/test-library.ts` 的 `BASE_STATE`（437 行）加：`briefingStageDetail: null,` `jobBriefingStageDetail: null,`（e2e §6）

- [ ] **Step 2: 写失败测试 `tests/briefing-constellation.test.tsx`**

```tsx
import { render, screen, cleanup } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { useStore } from '@/store'
import { BriefingConstellation } from '@/components/briefing/BriefingConstellation'

describe('BriefingConstellation', () => {
  beforeEach(() => {
    cleanup()
    useStore.setState({
      briefingTheme: 'academic',
      briefingSource: 'digest',
      briefingStageDetail: null,
      jobBriefingStageDetail: null,
    })
  })

  it('renders a satellite per digest station with legacy step testids', () => {
    render(<BriefingConstellation stage="fetching" />)
    expect(screen.getByTestId('briefing-constellation')).toBeInTheDocument()
    for (const key of ['fetching', 'extracting', 'assembling', 'finalizing']) {
      expect(screen.getByTestId(`briefing-progress-step-${key}`)).toBeInTheDocument()
    }
  })

  it('marks earlier stations done and the current one active with its full label', () => {
    render(<BriefingConstellation stage="assembling" />)
    expect(screen.getByTestId('briefing-progress-step-fetching').dataset.state).toBe('done')
    expect(screen.getByTestId('briefing-progress-step-extracting').dataset.state).toBe('done')
    expect(screen.getByTestId('briefing-progress-step-assembling').dataset.state).toBe('active')
    expect(screen.getByTestId('briefing-progress-step-finalizing').dataset.state).toBe('pending')
    expect(screen.getByTestId('briefing-progress-step-assembling').textContent).toContain('正在组装夜航简报')
  })

  it('falls back to the first station for a foreign stage key', () => {
    render(<BriefingConstellation stage={'digging-jobs' as never} />)
    expect(screen.getByTestId('briefing-progress-step-fetching').dataset.state).toBe('active')
  })

  it('renders five stations with star-blue well for job source', () => {
    useStore.setState({ briefingSource: 'job-briefing' })
    render(<BriefingConstellation stage="digging-jobs" />)
    for (const key of ['scanning-events', 'digging-jobs', 'aggregating-questions', 'synthesizing', 'finalizing']) {
      expect(screen.getByTestId(`briefing-progress-step-${key}`)).toBeInTheDocument()
    }
    expect(screen.getByTestId('briefing-constellation-well').style.borderColor).toBe('rgb(127, 168, 217)')
  })

  it('uses ink accent under newspaper theme', () => {
    useStore.setState({ briefingTheme: 'newspaper' })
    render(<BriefingConstellation stage="fetching" />)
    expect(screen.getByTestId('briefing-constellation-well').style.borderColor).toBe('rgb(26, 26, 26)')
  })

  it('shows the stage detail subtitle when present', () => {
    useStore.setState({ briefingStageDetail: '5 个来源 · 12 篇文章' })
    render(<BriefingConstellation stage="fetching" />)
    expect(screen.getByText('5 个来源 · 12 篇文章')).toBeInTheDocument()
  })

  it('shows the well counter', () => {
    render(<BriefingConstellation stage="assembling" />)
    expect(screen.getByTestId('briefing-constellation-well').textContent).toContain('2 / 4 已归位')
  })
})
```

并在 `tests/briefing-typography.test.ts` 追加：

```ts
describe('constellation motion fallbacks', () => {
  it('globals.css defines wellPulse keyframes and a reduced-motion opt-out', () => {
    const globals = fs.readFileSync(path.join(process.cwd(), 'src/styles/globals.css'), 'utf8')
    expect(globals).toContain('@keyframes wellPulse')
    expect(globals).toContain('prefers-reduced-motion')
    expect(globals).toContain('.constellation-animated')
  })
})
```

- [ ] **Step 3: 运行确认失败**

Run: `npx vitest run tests/briefing-constellation.test.tsx tests/briefing-typography.test.ts`
Expected: FAIL

- [ ] **Step 4: 实现 `src/components/briefing/BriefingConstellation.tsx`**

```tsx
import type { BriefingStage } from '@shared/index'
import { useStore } from '@/store'
import { Quote } from '@/components/Quote'

interface Station {
  key: string
  label: string       // 短名：待机 / 已归位时显示
  activeLabel: string // 进行中完整文案（沿用原进度列表措辞）
}

const DIGEST_STATIONS: Station[] = [
  { key: 'fetching', label: '采集信号', activeLabel: '正在采集今日信号…' },
  { key: 'extracting', label: '提取信息', activeLabel: '正在提取关键信息…' },
  { key: 'assembling', label: '组装简报', activeLabel: '正在组装夜航简报…' },
  { key: 'finalizing', label: '归档', activeLabel: '正在归档…' },
]

const JOB_STATIONS: Station[] = [
  { key: 'scanning-events', label: '扫描新动态', activeLabel: '正在扫描今日新动态…' },
  { key: 'digging-jobs', label: '深挖岗位', activeLabel: '正在深挖焦点岗位…' },
  { key: 'aggregating-questions', label: '聚合面经', activeLabel: '正在聚合面经高频问题…' },
  { key: 'synthesizing', label: '综合生成', activeLabel: '正在综合生成求职简报…' },
  { key: 'finalizing', label: '归档', activeLabel: '正在归档…' },
]

// 卫星驻留位（百分比坐标，井心固定 50%/44%）。纯 CSS 自适应，不读 window.innerWidth。
const POSTS_4 = [
  { x: 10, y: 12 }, { x: 80, y: 10 },
  { x: 8, y: 62 }, { x: 81, y: 61 },
]
const POSTS_5 = [
  { x: 8, y: 10 }, { x: 44, y: 3 }, { x: 80, y: 10 },
  { x: 7, y: 62 }, { x: 81, y: 62 },
]

interface Props {
  stage: BriefingStage
}

export function BriefingConstellation({ stage }: Props) {
  const theme = useStore((s) => s.briefingTheme)
  const source = useStore((s) => s.briefingSource)
  const digestDetail = useStore((s) => s.briefingStageDetail)
  const jobDetail = useStore((s) => s.jobBriefingStageDetail)

  const isAcademic = theme !== 'newspaper'
  const isJob = source === 'job-briefing'
  const stations = isJob ? JOB_STATIONS : DIGEST_STATIONS
  const posts = isJob ? POSTS_5 : POSTS_4
  const detail = isJob ? jobDetail : digestDetail

  // 防御：stage key 不属于当前源（跨源串味等历史遗留状态）时回退第一站激活。
  const foundIndex = stations.findIndex((s) => s.key === stage)
  const currentIndex = foundIndex === -1 ? 0 : foundIndex

  // 主色：Academic digest = 琥珀；Academic job = 星蓝（源标识，spec §4）；Newspaper = 墨色。
  const accent = !isAcademic ? '#1a1a1a' : isJob ? '#7fa8d9' : '#d97757'
  const inkStrong = isAcademic ? '#f5e6cc' : '#1a1a1a'
  const inkSoft = isAcademic ? '#e8d5b7' : '#1a1a1a'
  const dimText = isAcademic ? 'rgba(232,213,183,0.65)' : 'rgba(26,26,26,0.55)'

  return (
    <div
      data-testid="briefing-constellation"
      className="constellation-animated relative h-full w-full overflow-hidden"
    >
      {/* 引力线：卫星驻留位 → 井心 */}
      <svg className="absolute inset-0 w-full h-full" viewBox="0 0 100 100" preserveAspectRatio="none">
        {stations.map((s, i) => (
          <line
            key={s.key}
            x1={posts[i].x}
            y1={posts[i].y}
            x2={50}
            y2={44}
            stroke={accent}
            strokeWidth={1}
            vectorEffect="non-scaling-stroke"
            strokeDasharray="4,4"
            opacity={i === currentIndex ? 0.7 : i < currentIndex ? 0.5 : 0.22}
          />
        ))}
      </svg>

      {/* 轨道环 */}
      <div
        className="absolute rounded-full pointer-events-none"
        style={{ left: '50%', top: '44%', transform: 'translate(-50%,-50%)', width: 220, height: 220, border: `1px dashed ${accent}38` }}
      />
      <div
        className="absolute rounded-full pointer-events-none opacity-60"
        style={{ left: '50%', top: '44%', transform: 'translate(-50%,-50%)', width: 340, height: 340, border: `1px dashed ${accent}38` }}
      />

      {/* 引力井 */}
      <div
        data-testid="briefing-constellation-well"
        className="absolute flex flex-col items-center justify-center rounded-full"
        style={{
          left: '50%', top: '44%', transform: 'translate(-50%,-50%)',
          width: 96, height: 96,
          border: `2px solid ${accent}`,
          background: `${accent}1a`,
          boxShadow: `0 0 24px ${accent}59, 0 0 60px ${accent}26`,
        }}
      >
        <div className="font-serif text-[13px]" style={{ color: inkStrong }}>
          {isJob ? '求职' : '夜航'}
        </div>
        {/* key 随计数变化重挂载，重触发 wellPulse */}
        <div
          key={currentIndex}
          className="font-sans text-[9px] mt-0.5"
          style={{ color: accent, animation: 'wellPulse 600ms ease-out' }}
        >
          {currentIndex} / {stations.length} 已归位
        </div>
      </div>

      {/* 卫星（stage 胶囊）；testid 沿用旧进度条契约 */}
      {stations.map((s, i) => {
        const done = i < currentIndex
        const active = i === currentIndex
        return (
          <div
            key={s.key}
            data-testid={`briefing-progress-step-${s.key}`}
            data-state={done ? 'done' : active ? 'active' : 'pending'}
            className="absolute px-2.5 py-1 rounded font-sans text-[11px] whitespace-nowrap transition-all duration-500"
            style={{
              left: `${posts[i].x}%`,
              top: `${posts[i].y}%`,
              background: isAcademic ? 'rgba(26,21,18,0.92)' : 'rgba(255,255,255,0.92)',
              border: `1px solid ${done || active ? accent : isAcademic ? 'rgba(232,213,183,0.2)' : 'rgba(26,26,26,0.2)'}`,
              color: done ? accent : active ? inkStrong : dimText,
              boxShadow: active ? `0 0 12px ${accent}66` : 'none',
            }}
          >
            {done ? `✓ ${s.label}` : active ? `◉ ${s.activeLabel}` : s.label}
          </div>
        )
      })}

      {/* 井下方：当前站主文案 + detail 副标题 */}
      <div className="absolute left-0 right-0 text-center pointer-events-none" style={{ top: 'calc(44% + 60px)' }}>
        <div className="font-serif text-[14px]" style={{ color: inkSoft }}>
          {stations[currentIndex].activeLabel}
        </div>
        {detail && (
          <div className="font-sans text-[10px] mt-1.5" style={{ color: dimText }}>
            {detail}
          </div>
        )}
      </div>

      {/* 底部常驻语录 */}
      <div className="absolute left-0 right-0 bottom-3 flex justify-center pointer-events-none">
        <div className="pointer-events-auto">
          <Quote surface="briefing" />
        </div>
      </div>
    </div>
  )
}
```

barrel 补：`export { BriefingConstellation } from './BriefingConstellation'`

- [ ] **Step 5: globals.css 追加**

`src/styles/globals.css` 末尾：

```css
/* ===== Briefing constellation ===== */
@keyframes wellPulse {
  0% { transform: scale(1); }
  40% { transform: scale(1.15); }
  100% { transform: scale(1); }
}

@media (prefers-reduced-motion: reduce) {
  .constellation-animated,
  .constellation-animated * {
    animation: none !important;
    transition: none !important;
  }
}
```

- [ ] **Step 6: BriefingProgress 整体替换**

`src/components/BriefingProgress.tsx` 全文替换为：

```tsx
import type { BriefingStage } from '@shared/index'
import { BriefingConstellation } from '@/components/briefing'

interface Props {
  stage: BriefingStage
}

// 渲染层已升级为夜航星图；stage 防御与 testid 契约由 BriefingConstellation 承担。
export function BriefingProgress({ stage }: Props) {
  return <BriefingConstellation stage={stage} />
}
```

- [ ] **Step 7: 运行测试确认通过 + 回归**

Run: `npx vitest run tests/briefing-constellation.test.tsx tests/briefing-typography.test.ts tests/briefing-progress.test.tsx tests/store.test.ts tests/session-persist.test.ts`
Expected: PASS（旧 `briefing-progress.test.tsx` 两条断言应原样通过——卫星带旧 testid、active 含完整文案）

- [ ] **Step 8: 全量单测回归**

Run: `npm run test`
Expected: 全 PASS。若 `StarOrbit` 从 `BriefingProgress` 删除后出现未使用 import 报错，检查并清理（本任务 Step 6 的全文替换已清理）。

- [ ] **Step 9: Commit**

```bash
git add src/components/briefing/BriefingConstellation.tsx src/components/BriefingProgress.tsx src/components/briefing/index.ts src/styles/globals.css src/store/index.ts e2e/helpers/test-library.ts tests/briefing-constellation.test.tsx tests/briefing-typography.test.ts
git commit -m "feat(briefing): constellation loading chart driven by stage, job star-blue accent, stage detail plumbed through store"
```

---

### Task 6: 求职星蓝源标识（侧栏激活态 + 日期列「今天」）

**Files:**
- Modify: `src/components/BriefingSourceSidebar.tsx`（active class 拆分 + job 蓝）
- Modify: `src/components/BriefingDateColumn.tsx`（today 高亮 job 蓝）
- Test: `tests/briefing-sidebar.test.tsx`、`tests/briefing-date-column.test.tsx`（各加断言）

- [ ] **Step 1: 加失败断言 — `tests/briefing-sidebar.test.tsx`**

先读该文件既有渲染方式（props：`theme`、`collapsed`、`onToggle`），追加（store 需设 `briefingSource`）：

```tsx
  it('uses star-blue left border for the active job source under academic theme', () => {
    useStore.setState({ briefingSource: 'job-briefing' })
    render(<BriefingSourceSidebar theme="academic" collapsed={false} onToggle={() => {}} />)
    const jobButton = screen.getByTestId('briefing-source-job-briefing')
    expect(jobButton.className).toContain('border-[#7fa8d9]')
  })

  it('keeps ember left border for the active digest source under academic theme', () => {
    useStore.setState({ briefingSource: 'digest' })
    render(<BriefingSourceSidebar theme="academic" collapsed={false} onToggle={() => {}} />)
    const digestButton = screen.getByTestId('briefing-source-digest')
    expect(digestButton.className).toContain('border-[#d97757]')
  })
```

（props 与该文件既有用例保持一致；若既有用例已 mock store，沿用其 mock。）

- [ ] **Step 2: 加失败断言 — `tests/briefing-date-column.test.tsx`**

```tsx
  it('tints the today entry star-blue when job source is active', () => {
    useStore.setState({ briefingSource: 'job-briefing' })
    render(
      <BriefingDateColumn
        collapsed={false}
        history={[]}
        currentDate={undefined}
        today="2026-07-23"
        onSelect={() => {}}
        onReceiveToday={() => {}}
        onDelete={() => {}}
        theme="academic"
      />
    )
    const todayMini = screen.getByTestId('briefing-date-today-mini')
    expect(todayMini.className).toContain('#7fa8d9')
  })
```

（若该文件既有用例对 store 或子组件有 mock，沿用之；props 签名对照 `src/pages/Briefing.tsx:178-186` 的实际调用。）

- [ ] **Step 3: 运行确认失败**

Run: `npx vitest run tests/briefing-sidebar.test.tsx tests/briefing-date-column.test.tsx`
Expected: 新用例 FAIL

- [ ] **Step 4: BriefingSourceSidebar 实现**

把 `themeClasses` 中 active 的 border 拆出（academic: `border-[#d97757]`；newspaper: `border-[#1a1a1a]`），active 只留 bg/text。按钮 className（约 150 行）改为：

```tsx
              className={`${base} ${
                isActive
                  ? `rounded-none border-l-[3px] ${themeClasses.active} ${
                      item.id === 'job-briefing' && theme === 'academic'
                        ? 'border-[#7fa8d9]'
                        : theme === 'academic'
                          ? 'border-[#d97757]'
                          : 'border-[#1a1a1a]'
                    }`
                  : themeClasses.inactive
              }`}
```

- [ ] **Step 5: BriefingDateColumn 实现**

组件内加 `const source = useStore((s) => s.briefingSource)`（无 import 则补）与 `const jobBlue = isAcademic && source === 'job-briefing'`。两处 today 高亮（约 36 行常态条目、约 66 行 mini 按钮）的 ember class 前插 jobBlue 分支：

```tsx
// 常态条目（原 'bg-ember/20 text-ember border border-ember/40'）
jobBlue ? 'bg-[#7fa8d9]/20 text-[#7fa8d9] border border-[#7fa8d9]/40' : ...
// mini 按钮（原 'bg-ember/20 text-ember'）
jobBlue ? 'bg-[#7fa8d9]/20 text-[#7fa8d9]' : ...
```

- [ ] **Step 6: 运行测试确认通过 + 回归 + Commit**

Run: `npx vitest run tests/briefing-sidebar.test.tsx tests/briefing-date-column.test.tsx tests/briefing-empty-state.test.tsx`
Expected: PASS

```bash
git add src/components/BriefingSourceSidebar.tsx src/components/BriefingDateColumn.tsx tests/briefing-sidebar.test.tsx tests/briefing-date-column.test.tsx
git commit -m "feat(briefing): star-blue source identity for job briefing (sidebar active, today entry)"
```

---

### Task 7: E2E — selectors + briefing-aesthetics spec + README

**Files:**
- Modify: `e2e/helpers/selectors.ts`（briefing 段加 4 个选择器）
- Create: `e2e/specs/briefing-aesthetics.spec.ts`
- Modify: `e2e/README.md`（spec 清单加新文件，e2e §2）

- [ ] **Step 1: selectors.ts briefing 段追加**

```ts
    veil: '[data-testid="briefing-veil"]',
    quoteText: '[data-testid="quote-text"]',
    constellation: '[data-testid="briefing-constellation"]',
    constellationWell: '[data-testid="briefing-constellation-well"]',
```

- [ ] **Step 2: 新建 `e2e/specs/briefing-aesthetics.spec.ts`**

```ts
import { test, expect } from '../fixtures/electron'
import { CoverPage } from '../pages/CoverPage'
import { SELECTORS } from '../helpers/selectors'
import { seedBriefing } from '../helpers/test-library'
import fs from 'node:fs'
import path from 'node:path'

function localToday(): string {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

test.describe('@p1 briefing aesthetics', () => {
  test('academic reading view shows veil and quote band; quote stays out of the md file', async ({ window, testLibraryPath }) => {
    const today = localToday()
    seedBriefing(testLibraryPath, today)
    const cover = new CoverPage(window)
    await cover.enterName('E2E 测试员')
    await cover.goToBriefing()
    await window.locator(SELECTORS.briefing.receiveDigestButton).click()
    await expect(window.locator(SELECTORS.briefing.academicLayout)).toBeVisible({ timeout: 15000 })

    await expect(window.locator(SELECTORS.briefing.veil)).toBeVisible()
    const quote = window.locator(SELECTORS.briefing.quoteText)
    await expect(quote.first()).toBeVisible()
    const quoteText = ((await quote.first().textContent()) ?? '').replace(/[“”]/g, '')
    expect(quoteText.length).toBeGreaterThan(0)

    // 语录是纯 UI 装饰：学习库中任何今日 md 都不应包含它
    const entries = fs.readdirSync(testLibraryPath, { recursive: true }) as string[]
    const todayMds = entries.map(String).filter((f) => f.endsWith('.md') && f.includes(today))
    expect(todayMds.length).toBeGreaterThan(0)
    for (const f of todayMds) {
      const content = fs.readFileSync(path.join(testLibraryPath, f), 'utf8')
      expect(content).not.toContain(quoteText)
    }
  })

  test('constellation appears during generation when not cached', async ({ window }) => {
    const cover = new CoverPage(window)
    await cover.enterName('E2E 测试员')
    await cover.goToBriefing()
    const receiveButton = window.locator(SELECTORS.briefing.receiveDigestButton)
    if (await receiveButton.isVisible().catch(() => false)) {
      await receiveButton.click()
    }
    const constellation = window.locator(SELECTORS.briefing.constellation)
    // mock 管线可能极快完成：星图或成品版面出现其一即可
    await expect(constellation.or(window.locator(SELECTORS.briefing.academicLayout))).toBeVisible({ timeout: 15000 })
    if (await constellation.isVisible().catch(() => false)) {
      await expect(window.locator(SELECTORS.briefing.constellationWell)).toBeVisible()
      await expect(window.locator(SELECTORS.briefing.progressStep('fetching'))).toBeVisible()
    }
  })

  test('newspaper theme hides veil and quote band', async ({ window, testLibraryPath }) => {
    const today = localToday()
    seedBriefing(testLibraryPath, today)
    const cover = new CoverPage(window)
    await cover.enterName('E2E 测试员')
    await cover.goToBriefing()
    await window.locator(SELECTORS.briefing.receiveDigestButton).click()
    await expect(window.locator(SELECTORS.briefing.academicLayout)).toBeVisible({ timeout: 15000 })

    await window.locator('[data-testid="briefing-theme-toggle"]').click()
    await expect(window.locator(SELECTORS.briefing.veil)).toHaveCount(0)
    await expect(window.locator(SELECTORS.briefing.quoteText)).toHaveCount(0)
  })

  test('job briefing: star-blue sidebar accent and quote band in reading view', async ({ window }) => {
    const cover = new CoverPage(window)
    await cover.enterName('E2E 测试员')
    await cover.goToBriefing()
    await window.locator(SELECTORS.briefing.sourceJobBriefingButton).click()
    await expect(window.locator(SELECTORS.briefing.sourceJobBriefingButton)).toHaveCSS(
      'border-left-color',
      'rgb(127, 168, 217)',
    )

    const receiveButton = window.locator(SELECTORS.briefing.receiveJobButton)
    await receiveButton.waitFor({ state: 'visible', timeout: 15000 })
    await receiveButton.click()
    await window.locator(SELECTORS.briefing.jobCard).first().waitFor({ timeout: 30000 })
    await expect(window.locator(SELECTORS.briefing.quoteText).first()).toBeVisible()
  })
})

test.describe('@p1 briefing constellation reduced motion', () => {
  test.use({ reducedMotion: 'reduce' })

  test('generation still completes with reduced motion', async ({ window }) => {
    const cover = new CoverPage(window)
    await cover.enterName('E2E 测试员')
    await cover.goToBriefing()
    const receiveButton = window.locator(SELECTORS.briefing.receiveDigestButton)
    if (await receiveButton.isVisible().catch(() => false)) {
      await receiveButton.click()
    }
    await expect(
      window.locator(SELECTORS.briefing.constellation).or(window.locator(SELECTORS.briefing.academicLayout)),
    ).toBeVisible({ timeout: 15000 })
  })
})
```

（`SELECTORS.briefing.progressStep` 是既有函数选择器，见 selectors.ts:129。）

- [ ] **Step 3: e2e/README.md 同步**

在 spec 清单/目录结构段落为 `briefing-aesthetics.spec.ts` 加一行（来源 spec：`docs/superpowers/specs/2026-07-23-briefing-ui-design.md`，mock 链路，`@p1`）。

- [ ] **Step 4: 运行新 E2E**

Run: `npx playwright test --config e2e/playwright.config.ts briefing-aesthetics`
Expected: 5 条全 PASS。若 Electron fixture 不透传 `reducedMotion`，该 describe 退化为普通 smoke（仍应 PASS）。

- [ ] **Step 5: 既有 briefing E2E 回归**

Run: `npx playwright test --config e2e/playwright.config.ts briefing.spec briefing-generation.spec briefing-ux-optimization.spec job-briefing-generation.spec job-briefing-error.spec`
Expected: PASS（重点验证：旧进度条断言、job 章节 heading name 断言未被 ◆ 破坏）

- [ ] **Step 6: Commit**

```bash
git add e2e/helpers/selectors.ts e2e/specs/briefing-aesthetics.spec.ts e2e/README.md
git commit -m "test(e2e): briefing aesthetics — veil, quote band, constellation, job star-blue, reduced motion"
```

---

### Task 8: ui-styling §11 规则增补

**Files:**
- Modify: `.claude/rules/ui-styling.md`（§11）
- Modify: `.claude/rules/README.md`（Changelog）

- [ ] **Step 1: `ui-styling.md` 追加（§10 之后、Example 之前）**

```markdown
## 11. 学者夜话设计语言

**Why:** 诗意资产的扩散需要统一语汇，否则各页各自发挥会破坏宇宙一致性。

- 夜色底（深褐 `#2a1f1a` / 画作）+ 米色衬线正文 + 琥珀 `#d97757` 只做点睛（术语、引力、激活态）。
- 语录（`quotes.ts`）、引力/轨道（GravityField 语言）、画作（painting-manifest）是仅有的三个诗意资产；新增装饰语言前先在本规则登记。
- 动效必须克制且可退化：位移动画必须有 `prefers-reduced-motion` 静态回退。
- 例外主色（如求职星蓝 `#7fa8d9`）只允许出现在「源标识性」元素上，且需在设计文档中显式声明。
- Source: docs/superpowers/specs/2026-07-23-briefing-ui-design.md
```

- [ ] **Step 2: `.claude/rules/README.md` Changelog 顶部加一行**

```markdown
- `2026-07-23` ui-styling 新增 §11：学者夜话设计语言（夜色底+米色衬线+琥珀点睛；语录/引力/画作三个诗意资产登记制；动效可退化；求职星蓝为例外主色的声明方式）。
```

- [ ] **Step 3: Commit**

```bash
git add .claude/rules/ui-styling.md .claude/rules/README.md
git commit -m "docs(rules): ui-styling §11 study-parlor design language"
```

---

## 完成定义（整体验收）

1. `npm run test` 全绿
2. `npx playwright test --config e2e/playwright.config.ts briefing-aesthetics` 全绿
3. 既有 briefing/job E2E 回归全绿
4. `npm run dev` 手动过一遍：digest 空态 → 生成（星图）→ 阅读（渐变遮罩 + 语录带 + ◆）；切求职源（星蓝）；切 Newspaper（无遮罩/无语录带）；写作页与 Anthropic 页语录带
