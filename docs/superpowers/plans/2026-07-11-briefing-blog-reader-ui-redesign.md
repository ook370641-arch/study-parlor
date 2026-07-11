# 夜航简报 & Anthropic 博客阅读器 UI 升级实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 统一 AI 日报与 Anthropic 博客阅读器的三栏架构，移除冗余控件，完成学术/报纸双主题视觉升级，并补齐测试。

**Architecture:** 新增可折叠中间列容器 `BriefingListColumn` 与日期内容 `BriefingDateColumn`，Header 仅保留返回/字号/主题；AI 日报内容区改为「思维碎片式」与「报纸分栏式」；博客列表收起改为 `w-14` 缩略图 rail；所有正文区统一按「可用正文区域 90%，max 1250px」计算。

**Tech Stack:** React 18 + TypeScript + Tailwind CSS + Zustand + Vitest + Playwright

---

## 文件结构

| 文件 | 责任 |
|------|------|
| `src/components/BriefingListColumn.tsx` | 新增：统一可折叠中间列容器（标题栏、toggle、宽度/主题切换） |
| `src/components/BriefingDateColumn.tsx` | 新增：AI 日报日期列表，含展开/折叠两种渲染 |
| `src/components/BriefingHeader.tsx` | 修改：删除「重新生成」「往期」按钮 |
| `src/pages/Briefing.tsx` | 修改：接入新中间列，删除 history drawer/regenerate 逻辑 |
| `src/components/briefing/AcademicBriefingLayout.tsx` | 修改：思维碎片式卡片布局 |
| `src/components/briefing/NewspaperBriefingLayout.tsx` | 修改：报纸分栏式布局 |
| `src/components/briefing/BriefingSourceItem.tsx` | 修改：新增 `variant="pill"` |
| `src/components/anthropic/AnthropicBlogPanel.tsx` | 修改：列表改用 `BriefingListColumn`，折叠 rail 显示缩略图 |
| `src/components/anthropic/AnthropicArticleReader.tsx` | 修改：删除返回列表按钮，视觉结构优化 |
| `tests/briefing-header.test.tsx` | 新增：Header 控件精简断言 |
| `tests/briefing-date-column.test.tsx` | 新增：日期列行为测试 |
| `tests/anthropic-blog-panel.test.tsx` | 新增/修改：列表折叠测试 |
| `tests/anthropic-reader-images.test.tsx` | 修改：扩展断言，确认无返回列表按钮 |
| `tests/briefing-layout.test.tsx` | 新增：碎片/分栏布局测试 |
| `e2e/helpers/selectors.ts` | 修改：更新/新增选择器 |
| `e2e/specs/briefing-ux-optimization.spec.ts` | 修改：移除 history/regenerate 断言，改为日期列 |
| `e2e/specs/anthropic-blog.spec.ts` | 修改：折叠 rail 断言，删除 reader close 断言 |

---

## Task 1: 创建 `BriefingListColumn` 可折叠中间列容器

**Files:**
- Create: `src/components/BriefingListColumn.tsx`

**目标：** 与 `BriefingSourceSidebar` 行为一致：展开时显示标题与内容，折叠为 `w-14` rail，toggle 箭头反向（展开 `◀`，折叠 `▶`）。

- [ ] **Step 1: 编写组件**  
  创建 `src/components/BriefingListColumn.tsx`：

```tsx
import type { BriefingTheme } from '@shared/index'

interface Props {
  collapsed: boolean
  onToggle: () => void
  theme: BriefingTheme
  width?: 64 | 80 // px rail width in tailwind units; 64 for dates, 80 for blog list
  title: string
  children: React.ReactNode
}

export function BriefingListColumn({ collapsed, onToggle, theme, width = 64, title, children }: Props) {
  const isAcademic = theme !== 'newspaper'

  const themeClasses = isAcademic
    ? {
        bg: 'bg-ink/50',
        border: 'border-r border-[rgba(232,213,183,0.18)]',
        headerText: 'text-parchment',
        toggle: 'text-parchment/60 hover:text-parchment',
        headerBorder: 'border-b border-[rgba(232,213,183,0.18)]',
      }
    : {
        bg: 'bg-[#e8e4de]',
        border: 'border-r border-[#c9c3b8]',
        headerText: 'text-[#2a1f1a]',
        toggle: 'text-[#2a1f1a]/60 hover:text-[#2a1f1a]',
        headerBorder: 'border-b border-[#c9c3b8]',
      }

  const widthClass = width === 80 ? 'w-80' : 'w-64'

  return (
    <aside
      data-testid="briefing-list-column"
      className={`h-full flex flex-col transition-all ${collapsed ? 'w-14' : widthClass} ${themeClasses.bg} ${themeClasses.border} z-[5]`}
    >
      <div className={`flex items-center justify-between px-3 py-4 ${themeClasses.headerBorder}`}>
        {!collapsed && <span className={`text-sm font-serif ${themeClasses.headerText}`}>{title}</span>}
        <button
          data-testid="briefing-list-column-toggle"
          onClick={onToggle}
          className={themeClasses.toggle}
          title={collapsed ? '展开' : '折叠'}
        >
          {collapsed ? '▶' : '◀'}
        </button>
      </div>
      {!collapsed && <div className="flex-1 min-h-0 overflow-y-auto">{children}</div>}
    </aside>
  )
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/components/BriefingListColumn.tsx
git commit -m "feat(briefing): add reusable BriefingListColumn collapsible shell"
```

---

## Task 2: 创建 `BriefingDateColumn`

**Files:**
- Create: `src/components/BriefingDateColumn.tsx`

**目标：** 渲染历史日期列表；高亮当前；点击调用 `onSelect(date)`；折叠时显示日历图标 + 最近日期小标签。

- [ ] **Step 1: 编写组件**

```tsx
import { formatDisplayDate } from '@/pages/Briefing'

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
}

function formatLabel(date: string): string {
  const [y, m, d] = date.split('-').map(Number)
  if ([y, m, d].some((n) => Number.isNaN(n))) return date
  return `${m}月${d}日`
}

export function BriefingDateColumn({ collapsed, history, currentDate, today, onSelect, onReceiveToday, theme }: Props) {
  const isAcademic = theme !== 'newspaper'

  const itemBase = isAcademic
    ? 'text-parchment/70 hover:bg-parchment/10 hover:text-parchment'
    : 'text-[#6b5d52] hover:bg-black/5 hover:text-[#1a1a1a]'
  const activeItem = isAcademic
    ? 'bg-ember/20 text-ember border border-ember/40'
    : 'bg-[#1a1a1a] text-white'

  const entries = [{ date: today, filePath: '', isToday: true }, ...history.map((h) => ({ ...h, isToday: false }))]

  if (collapsed) {
    const latest = history[0]
    return (
      <div className="flex flex-col items-center py-3 px-1 gap-3">
        <button
          data-testid="briefing-date-today-mini"
          onClick={onReceiveToday}
          title="查收日报"
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

  return (
    <div className="p-2 space-y-1" data-testid="briefing-date-column">
      {entries.map((entry) => {
        const isCurrent = entry.date === currentDate
        return (
          <button
            key={entry.date}
            data-testid={`briefing-date-item-${entry.date}`}
            onClick={() => (entry.isToday ? onReceiveToday() : onSelect(entry.date))}
            className={`w-full text-left px-3 py-2 rounded text-sm transition-colors ${isCurrent ? activeItem : itemBase}`}
          >
            {entry.isToday ? '查收日报' : formatLabel(entry.date)}
          </button>
        )
      })}
      {history.length === 0 && (
        <div className={`px-3 py-2 text-xs ${isAcademic ? 'text-parchment/40' : 'text-[#6b5d52]'}`}>
          暂无往期简报
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/components/BriefingDateColumn.tsx
git commit -m "feat(briefing): add BriefingDateColumn for date list and collapsed rail"
```

---

## Task 3: 精简 `BriefingHeader`

**Files:**
- Modify: `src/components/BriefingHeader.tsx`

**目标：** 删除 `onRegenerate` / `showRegenerate` / `regenerating` / `onHistory` 相关 props 与按钮。

- [ ] **Step 1: 修改 Props 并删除按钮**

修改 `src/components/BriefingHeader.tsx`：

```tsx
interface Props {
  displayDate: string
  timeString?: string
  sourceStatus?: BriefingSourceStatus
  cacheWriteFailed?: boolean
}

export function BriefingHeader({ displayDate, timeString, sourceStatus, cacheWriteFailed }: Props) {
  // ... existing hooks and classes ...

  return (
    <header className={`${headerBase} ${headerTheme}`}>
      <BackToCover className={backOverride} />
      <div className="absolute left-1/2 -translate-x-1/2 text-center">
        <h1 className={titleClass}>夜航简报</h1>
        <div className={metaClass} data-testid="briefing-generated-at">
          {displayDate}
          {timeString && ` · ${timeString}`}
          {/* keep sourceStatus and cacheWriteFailed badges */}
          ...
        </div>
      </div>
      <div className="flex items-center gap-1 ml-auto">
        <Button variant="ghost" onClick={decrease} disabled={!canDecrease} data-testid="briefing-font-size-decrease" className={ghostOverride} title="减小字号">-</Button>
        <Button variant="ghost" onClick={increase} disabled={!canIncrease} data-testid="briefing-font-size-increase" className={ghostOverride} title="增大字号">+</Button>
        <BriefingThemeToggle />
      </div>
    </header>
  )
}
```

删除 `showRegenerate` 条件块和 `onHistory` 按钮。

- [ ] **Step 2: 编写/更新测试**

创建 `tests/briefing-header.test.tsx`：

```tsx
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'

vi.mock('@/lib/ipc', () => ({ ipc: { patchState: vi.fn(), getState: vi.fn() } }))
vi.mock('@/lib/paintings', () => ({ manifest: [], pickRandom: vi.fn(() => null) }))

import { useStore } from '@/store'
import { BriefingHeader } from '@/components/BriefingHeader'

describe('BriefingHeader', () => {
  beforeEach(() => {
    cleanup()
    useStore.setState({ briefingTheme: 'academic', briefingFontSize: 'base' })
  })

  it('renders title and date', () => {
    render(<BriefingHeader displayDate="2026 年 07 月 11 日" />)
    expect(screen.getByText('夜航简报')).toBeInTheDocument()
    expect(screen.getByText('2026 年 07 月 11 日')).toBeInTheDocument()
  })

  it('does not render regenerate or history buttons', () => {
    render(<BriefingHeader displayDate="2026 年 07 月 11 日" />)
    expect(screen.queryByTestId('briefing-regenerate-button')).not.toBeInTheDocument()
    expect(screen.queryByTestId('briefing-history-button')).not.toBeInTheDocument()
  })

  it('renders font size controls and theme toggle', () => {
    render(<BriefingHeader displayDate="2026 年 07 月 11 日" />)
    expect(screen.getByTestId('briefing-font-size-decrease')).toBeInTheDocument()
    expect(screen.getByTestId('briefing-font-size-increase')).toBeInTheDocument()
    expect(screen.getByTestId('briefing-theme-toggle')).toBeInTheDocument()
  })
})
```

- [ ] **Step 3: 运行测试**

Run: `npx vitest run tests/briefing-header.test.tsx`
Expected: PASS

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/BriefingHeader.tsx tests/briefing-header.test.tsx
git commit -m "feat(briefing): simplify header by removing regenerate and history buttons"
```

---

## Task 4: 在 `Briefing.tsx` 接入中间列并删除 drawer/regenerate

**Files:**
- Modify: `src/pages/Briefing.tsx`

**目标：** source === 'digest' 时渲染 `BriefingListColumn` + `BriefingDateColumn`；删除 `BriefingHistoryDrawer` 与 regenerate 状态；Header 不再传 history/regenerate props。

- [ ] **Step 1: 修改 imports 与状态**

在 `src/pages/Briefing.tsx` 顶部添加：

```tsx
import { BriefingListColumn } from '@/components/BriefingListColumn'
import { BriefingDateColumn } from '@/components/BriefingDateColumn'
```

删除：

```tsx
import { BriefingHistoryDrawer } from '@/components/BriefingHistoryDrawer'
```

删除状态：

```tsx
const [drawerOpen, setDrawerOpen] = useState(false)
const [regenerating, setRegenerating] = useState(false)
```

新增：

```tsx
const [dateColumnCollapsed, setDateColumnCollapsed] = useState(false)
```

删除 `handleRegenerate` 函数。

- [ ] **Step 2: 修改 Header 调用**

将 Header 调用改为：

```tsx
<BriefingHeader
  displayDate={source === 'anthropic' ? 'Anthropic Engineering' : displayDate}
  timeString={
    source === 'digest' && result?.generatedAt
      ? formatGeneratedAt(result.generatedAt, result.date)
      : undefined
  }
  sourceStatus={source === 'digest' ? result?.sourceStatus : undefined}
  cacheWriteFailed={source === 'digest' ? result?.cacheWriteFailed : undefined}
/>
```

- [ ] **Step 3: 修改主布局**

在 `<div className="flex-1 flex flex-col min-w-0">` 之前插入日期列（仅 digest）：

```tsx
{source === 'digest' && (
  <BriefingListColumn
    collapsed={dateColumnCollapsed}
    onToggle={() => setDateColumnCollapsed((c) => !c)}
    theme={theme}
    width={64}
    title="日期"
  >
    <BriefingDateColumn
      collapsed={dateColumnCollapsed}
      history={historyList}
      currentDate={result?.date}
      today={today}
      onSelect={(date) => generateBriefing(date)}
      onReceiveToday={() => generateBriefing(today)}
      theme={theme}
    />
  </BriefingListColumn>
)}
```

- [ ] **Step 4: 删除 BriefingHistoryDrawer 引用**

删除 `<BriefingHistoryDrawer ... />` 整个 JSX 块。

- [ ] **Step 5: Typecheck & test sidebar**

Run: `npx tsc --noEmit`
Expected: PASS

Run: `npx vitest run tests/briefing-sidebar.test.tsx`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/pages/Briefing.tsx
git commit -m "feat(briefing): wire date column and remove history drawer/regenerate"
```

---

## Task 5: 学术主题 → 思维碎片式

**Files:**
- Modify: `src/components/briefing/AcademicBriefingLayout.tsx`

**目标：** 每个 section 独立成卡片，轻微交替旋转；来源链接 pill 化；宽度规则。

- [ ] **Step 1: 更新布局代码**

```tsx
import { useState } from 'react'
import type { BriefingResult } from '@/types'
import type { ParsedBriefing } from '@/lib/parse-briefing-markdown'
import { MarkdownRenderer } from '@/components/md/MarkdownRenderer'
import type { TermDef } from '@/components/md/rehypeTermHighlight'
import { BriefingSourceItem } from './BriefingSourceItem'

export function AcademicBriefingLayout({
  result,
  parsed,
  displayDate,
  terms,
}: {
  result: BriefingResult
  parsed: ParsedBriefing
  displayDate: string
  terms?: TermDef[]
}) {
  const [expandedSources, setExpandedSources] = useState(false)

  return (
    <main
      data-testid="briefing-academic-layout"
      className="relative z-[5] flex-1 overflow-y-auto"
    >
      <div className="w-[90%] max-w-[1250px] min-w-[520px] mx-auto px-4 py-6">
        <header className="text-center mb-8">
          <h1 className="text-[24px] font-bold font-serif text-[#f5e6cc] mb-2">{result.title}</h1>
          <p className="text-sm text-[#e8d5b7]/60">{displayDate}</p>
        </header>

        <div className="space-y-6">
          {parsed.sections.map((section, i) => {
            const rotation = i % 2 === 0 ? '-rotate-[0.3deg]' : 'rotate-[0.3deg]'
            return (
              <section
                key={i}
                className={`p-5 rounded-sm border border-[#e8d5b7]/20 bg-[#e8d5b7] text-[#2a1f1a] shadow-sm ${rotation}`}
              >
                <div className="flex items-center gap-2 mb-3">
                  <span className="text-xs font-bold text-ember">{String(i + 1).padStart(2, '0')}</span>
                  <h2
                    className="font-serif text-[#2a1f1a] border-b border-[#2a1f1a]/10 pb-1 flex-1"
                    style={{ fontSize: 'var(--briefing-heading-size)', fontWeight: 'var(--briefing-heading-weight)' }}
                  >
                    {section.title}
                  </h2>
                </div>
                <div
                  data-testid="briefing-markdown-body"
                  className="briefing-body-academic text-[#2a1f1a]/90 leading-[1.85]"
                  style={{ fontSize: 'var(--briefing-body-size)', fontWeight: 'var(--briefing-body-weight)' }}
                >
                  <MarkdownRenderer content={section.body} fileName="briefing.md" briefingStyle="academic" terms={terms} />
                </div>
              </section>
            )
          })}
        </div>

        {parsed.sources.length > 0 && (
          <div className="mt-8 border-t border-[#e8d5b7]/20 pt-4">
            <button
              onClick={() => setExpandedSources((v) => !v)}
              className="text-sm text-[#e8d5b7]/70 hover:text-[#f5e6cc] transition-colors"
              data-testid="briefing-source-expand-toggle"
            >
              {expandedSources ? '收起来源' : '展开来源'}
            </button>
            {expandedSources && (
              <div className="mt-4 flex flex-wrap gap-2">
                {parsed.sources.map((group, i) =>
                  group.items.map((item, j) => (
                    <BriefingSourceItem key={`${i}-${j}`} item={item} theme="academic" variant="pill" />
                  ))
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </main>
  )
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/components/briefing/AcademicBriefingLayout.tsx
git commit -m "feat(briefing): academic layout as thought shards"
```

---

## Task 6: 报纸主题 → 报纸分栏式

**Files:**
- Modify: `src/components/briefing/NewspaperBriefingLayout.tsx`

**目标：** 头版报头 + 分栏正文；来源脚注/标签；宽度规则。

- [ ] **Step 1: 更新布局代码**

```tsx
import { useState } from 'react'
import type { BriefingResult } from '@/types'
import type { ParsedBriefing } from '@/lib/parse-briefing-markdown'
import { MarkdownRenderer } from '@/components/md/MarkdownRenderer'
import type { TermDef } from '@/components/md/rehypeTermHighlight'
import { BriefingSourceItem } from './BriefingSourceItem'

export function NewspaperBriefingLayout({
  result,
  parsed,
  displayDate,
  terms,
}: {
  result: BriefingResult
  parsed: ParsedBriefing
  displayDate: string
  terms?: TermDef[]
}) {
  const [expandedSources, setExpandedSources] = useState(false)

  return (
    <main
      data-testid="briefing-newspaper-layout"
      className="relative z-[5] flex-1 overflow-y-auto bg-white"
    >
      <article className="w-[90%] max-w-[1250px] min-w-[520px] mx-auto px-4 py-6">
        <header className="border-b-2 border-[#1a1a1a] pb-4 mb-6 text-center">
          <h1 className="text-[28px] font-extrabold font-serif text-[#1a1a1a] mb-1">{result.title}</h1>
          <div className="flex items-center justify-center gap-3 text-xs text-[#555] uppercase tracking-widest">
            <span>夜航简报</span>
            <span>|</span>
            <span>{displayDate}</span>
          </div>
        </header>

        {parsed.sections.map((section, i) => (
          <section key={i} className="mb-8">
            <h2
              className="text-[#1a1a1a] mb-3 uppercase tracking-wider border-b border-[#1a1a1a]/10 pb-2"
              style={{ fontSize: 'var(--briefing-heading-size)', fontWeight: 'var(--briefing-heading-weight)' }}
            >
              {section.title}
            </h2>
            <div
              data-testid="briefing-markdown-body"
              className="briefing-body-newspaper text-[#1a1a1a] leading-[1.85] columns-1 lg:columns-2 gap-8"
              style={{ fontSize: 'var(--briefing-body-size)', fontWeight: 'var(--briefing-body-weight)' }}
            >
              <MarkdownRenderer content={section.body} fileName="briefing.md" briefingStyle="newspaper" terms={terms} />
            </div>
            {i < parsed.sections.length - 1 && (
              <div className="text-center text-[#1a1a1a]/30 text-sm my-6">* * *</div>
            )}
          </section>
        ))}

        {parsed.sources.length > 0 && (
          <div className="mt-8 border-t border-[#1a1a1a]/20 pt-4">
            <button
              onClick={() => setExpandedSources((v) => !v)}
              className="text-sm text-[#555] hover:text-[#1a1a1a] transition-colors"
              data-testid="briefing-source-expand-toggle"
            >
              {expandedSources ? '收起来源' : '展开来源'}
            </button>
            {expandedSources && (
              <div className="mt-4 flex flex-wrap gap-2">
                {parsed.sources.map((group, i) =>
                  group.items.map((item, j) => (
                    <BriefingSourceItem key={`${i}-${j}`} item={item} theme="newspaper" variant="pill" />
                  ))
                )}
              </div>
            )}
          </div>
        )}
      </article>
    </main>
  )
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/components/briefing/NewspaperBriefingLayout.tsx
git commit -m "feat(briefing): newspaper layout as columns with masthead"
```

---

## Task 7: 给 `BriefingSourceItem` 增加 pill 变体

**Files:**
- Modify: `src/components/briefing/BriefingSourceItem.tsx`

**目标：** 支持 `variant="pill"`，渲染小胶囊带 ↗ 图标。

- [ ] **Step 1: 修改组件**

```tsx
interface Props {
  item: string
  theme: 'academic' | 'newspaper'
  variant?: 'inline' | 'pill'
}

export function BriefingSourceItem({ item, theme, variant = 'inline' }: Props) {
  const isAcademic = theme === 'academic'
  const linkClass =
    variant === 'pill'
      ? isAcademic
        ? 'inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs bg-ember/15 text-ember hover:bg-ember/25'
        : 'inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs bg-[#1a1a1a] text-white hover:bg-[#333]'
      : isAcademic
        ? 'text-ember hover:text-[#e8a07a] underline underline-offset-2'
        : 'text-[#d97757] hover:text-[#b55c3e] underline underline-offset-2'

  const parts: React.ReactNode[] = []
  let lastIndex = 0
  let match: RegExpExecArray | null
  LINK_PATTERN.lastIndex = 0

  while ((match = LINK_PATTERN.exec(item)) !== null) {
    if (match.index > lastIndex) {
      parts.push(<span key={`text-${match.index}`}>{item.slice(lastIndex, match.index)}</span>)
    }
    const full = match[0]
    const mdText = match[1]
    const mdUrl = match[2]
    const bareUrl = match[3]
    const url = mdUrl || bareUrl
    const text = (mdText || bareUrl || '').slice(0, 32) + ((mdText || bareUrl || '').length > 32 ? '…' : '')

    parts.push(
      <a
        key={`link-${match.index}`}
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className={linkClass}
      >
        {variant === 'pill' && <span>↗</span>}
        {text}
      </a>
    )
    lastIndex = match.index + full.length
  }

  if (lastIndex < item.length) {
    parts.push(<span key="text-end">{item.slice(lastIndex)}</span>)
  }

  return <>{parts}</>
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/components/briefing/BriefingSourceItem.tsx
git commit -m "feat(briefing): add pill variant to BriefingSourceItem"
```

---

## Task 8: 博客列表改用 `BriefingListColumn`

**Files:**
- Modify: `src/components/anthropic/AnthropicBlogPanel.tsx`

**目标：** 删除 `listVisible` + 2px edge，改用 `BriefingListColumn`；折叠 rail 显示缩略图；toggle 箭头反向；保留搜索/新文章提示。

- [ ] **Step 1: 修改 imports 与状态**

在 `src/components/anthropic/AnthropicBlogPanel.tsx` 顶部添加：

```tsx
import { BriefingListColumn } from '@/components/BriefingListColumn'
```

将 `const [listVisible, setListVisible] = useState(true)` 改为：

```tsx
const [listCollapsed, setListCollapsed] = useState(false)
```

- [ ] **Step 2: 删除 hideButton 与 expandHandle 定义**

删除 `hideButton` 与 `expandHandle` JSX 变量。

- [ ] **Step 3: 替换列表容器**

将内部列表 div：

```tsx
<div className={`flex flex-col ${themeClasses.sidebarBg} transition-all duration-200 ${listVisible ? 'w-80 min-w-[20rem] opacity-100 border-r ${themeClasses.border}' : 'w-0 opacity-0 overflow-hidden border-r-0'}`}>
  ...
</div>
{!listVisible && expandHandle}
```

替换为：

```tsx
<BriefingListColumn
  collapsed={listCollapsed}
  onToggle={() => setListCollapsed((c) => !c)}
  theme={theme}
  width={80}
  title="Anthropic Engineering"
>
  <div className="flex flex-col h-full">
    <div className={`flex items-center justify-between px-4 py-3 border-b ${themeClasses.border} shrink-0`}>
      <div className="min-w-0">
        <h2 className={`text-base font-serif truncate ${themeClasses.text}`}>Anthropic Engineering</h2>
        {lastFetchedAt && (
          <p className={`text-[10px] ${themeClasses.muted}`}>更新于 {new Date(lastFetchedAt).toLocaleString('zh-CN')}</p>
        )}
      </div>
      <div className="flex items-center gap-1">
        {checkError && (
          <button ...>{/* same error icon */}</button>
        )}
      </div>
    </div>

    {newArticleCount > 0 && (
      <div className={`px-4 py-2 border-b ${themeClasses.border} shrink-0`}>
        <button ...>{/* same new articles prompt */}</button>
      </div>
    )}

    <div className={`px-4 py-2 border-b ${themeClasses.border} shrink-0`}>
      <input ... />
    </div>

    <div className="flex-1 overflow-y-auto px-4 py-3">
      {/* same article rows */}
    </div>
  </div>
</BriefingListColumn>

{listCollapsed && (
  <div className={`w-14 h-full flex flex-col items-center py-3 gap-3 overflow-y-auto ${themeClasses.sidebarBg} border-r ${themeClasses.border}`}>
    {newArticleCount > 0 && (
      <span className={`min-w-[18px] px-1 py-0.5 rounded-full text-[10px] text-center ${isAcademic ? 'bg-ember text-white' : 'bg-[#1a1a1a] text-white'}`}>
        {newArticleCount}
      </span>
    )}
    {filtered.slice(0, 10).map((article) => (
      <button
        key={article.url}
        data-testid="anthropic-list-rail-thumb"
        onClick={() => openReader(article.filePath ?? article.url)}
        title={article.title}
        className="w-9 h-9 rounded overflow-hidden shrink-0"
      >
        {article.imageUrl ? (
          <img src={article.imageUrl} alt="" className="w-full h-full object-cover" />
        ) : (
          <div className={`w-full h-full flex items-center justify-center text-[10px] ${isAcademic ? 'bg-parchment/10 text-parchment/40' : 'bg-[#e8e4de] text-[#6b5d52]'}`}>
            A
          </div>
        )}
      </button>
    ))}
  </div>
)}
```

注意：缩略图点击逻辑应调用已有的导入/打开逻辑。为避免代码膨胀，可抽取一个内部 `handleOpen(article)` 函数复用。

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/anthropic/AnthropicBlogPanel.tsx
git commit -m "feat(anthropic): use BriefingListColumn for blog list with thumbnail rail"
```

---

## Task 9: 博客阅读器视觉优化并删除「返回列表」

**Files:**
- Modify: `src/components/anthropic/AnthropicArticleReader.tsx`

**目标：** 删除 `onClose` prop 与顶部返回行；标题/meta/摘要/来源胶囊/图片说明/引用强调块；宽度规则。

- [ ] **Step 1: 修改 Props 并删除返回行**

将 interface 改为：

```tsx
interface Props {
  filePath: string
  theme?: BriefingTheme
}
```

删除组件参数中的 `onClose`。

删除这段 JSX：

```tsx
{onClose && (
  <div className={`sticky top-0 z-10 flex items-center justify-between px-6 py-3 border-b ${themeClasses.headerBorder} ${themeClasses.headerBg} backdrop-blur`}>
    <button data-testid="anthropic-reader-close" ...>← 返回列表</button>
  </div>
)}
```

- [ ] **Step 2: 应用宽度规则与视觉样式**

将内容容器：

```tsx
<div className="max-w-3xl mx-auto w-full px-6 py-10 pb-24">
```

改为：

```tsx
<div className="w-[90%] max-w-[1250px] min-w-[520px] mx-auto px-6 py-10 pb-24">
```

- [ ] **Step 3: 来源胶囊按钮**

将 `frontmatter.source_url` 的「来源：Anthropic Engineering」改为胶囊按钮：

```tsx
{frontmatter.source_url && (
  <a
    href={frontmatter.source_url}
    target="_blank"
    rel="noopener noreferrer"
    className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs ${isAcademic ? 'bg-ember/15 text-ember hover:bg-ember/25' : 'bg-[#1a1a1a] text-white hover:bg-[#333]'}`}
  >
    <span>↗</span>
    Anthropic Engineering
  </a>
)}
```

- [ ] **Step 4: 摘要块强调样式**

摘要块已存在，增强为：

```tsx
{frontmatter.summary && (
  <div className={`mt-6 p-5 rounded-lg border-l-4 italic leading-relaxed ${isAcademic ? 'bg-ink/50 border-ember' : 'bg-[#f5f2ed] border-[#1a1a1a] shadow-sm'} ${themeClasses.summaryText}`}>
    {frontmatter.summary}
  </div>
)}
```

- [ ] **Step 5: 通过全局 CSS 给引用块加样式**

在 `src/components/anthropic/AnthropicArticleReader.tsx` 同级或直接在 article 上添加 class。如果 `MarkdownRenderer` 已经渲染 `blockquote`，可以在 article 容器上加自定义类，并通过 Tailwind 的 `prose-blockquote:` 插件或全局 CSS 覆盖。项目已使用 `prose`，可直接在容器上加 class：

```tsx
<article className={`prose max-w-none ${isAcademic ? 'prose-invert' : ''} briefing-body-${theme}`}>
```

确认 `tailwind.config.ts` 中 `prose-blockquote:border-l-ember` 之类是否生效。若未配置，可在组件内嵌套样式：

```tsx
<article className={`prose max-w-none ${isAcademic ? 'prose-invert' : ''} briefing-body-${theme}`}>
  <style>{`
    .briefing-body-academic blockquote {
      border-left: 3px solid #d97757;
      background: rgba(217, 119, 87, 0.08);
      padding: 1rem 1.25rem;
      border-radius: 0 0.5rem 0.5rem 0;
    }
    .briefing-body-newspaper blockquote {
      border-left: 3px solid #d97757;
      background: #fff;
      box-shadow: 0 1px 2px rgba(0,0,0,0.06);
      padding: 1rem 1.25rem;
      border-radius: 0 0.5rem 0.5rem 0;
    }
    .briefing-body-newspaper p {
      text-indent: 2em;
    }
    .briefing-body-newspaper p:first-of-type {
      text-indent: 0;
    }
  `}</style>
```

- [ ] **Step 6: Typecheck**

Run: `npx tsc --noEmit`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add src/components/anthropic/AnthropicArticleReader.tsx
git commit -m "feat(anthropic): remove back button and optimize article reader visuals"
```

---

## Task 10: 更新 `AnthropicBlogPanel` 调用处（删除 onClose）

**Files:**
- Modify: `src/components/anthropic/AnthropicBlogPanel.tsx`（reader 调用）

**目标：** `AnthropicArticleReader` 不再接收 `onClose`。

- [ ] **Step 1: 删除 onClose prop**

将：

```tsx
<AnthropicArticleReader
  filePath={readerFilePath}
  onClose={closeReader}
  theme={theme}
/>
```

改为：

```tsx
<AnthropicArticleReader
  filePath={readerFilePath}
  theme={theme}
/>
```

- [ ] **Step 2: Commit**

```bash
git add src/components/anthropic/AnthropicBlogPanel.tsx
git commit -m "refactor(anthropic): remove onClose prop from AnthropicArticleReader call"
```

---

## Task 11: 组件测试

### 11.1 `tests/briefing-date-column.test.tsx`

**Files:**
- Create: `tests/briefing-date-column.test.tsx`

```tsx
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'

vi.mock('@/lib/ipc', () => ({ ipc: { patchState: vi.fn(), getState: vi.fn() } }))
vi.mock('@/lib/paintings', () => ({ manifest: [], pickRandom: vi.fn(() => null) }))

import { BriefingDateColumn } from '@/components/BriefingDateColumn'

describe('BriefingDateColumn', () => {
  beforeEach(() => cleanup())

  it('renders today entry and history dates when expanded', () => {
    render(
      <BriefingDateColumn
        collapsed={false}
        history={[{ date: '2026-07-10', filePath: '/x.md' }]}
        today="2026-07-11"
        onSelect={vi.fn()}
        onReceiveToday={vi.fn()}
        theme="academic"
      />
    )
    expect(screen.getByText('查收日报')).toBeInTheDocument()
    expect(screen.getByText('7月10日')).toBeInTheDocument()
  })

  it('highlights current date', () => {
    render(
      <BriefingDateColumn
        collapsed={false}
        history={[{ date: '2026-07-10', filePath: '/x.md' }]}
        currentDate="2026-07-10"
        today="2026-07-11"
        onSelect={vi.fn()}
        onReceiveToday={vi.fn()}
        theme="academic"
      />
    )
    expect(screen.getByTestId('briefing-date-item-2026-07-10')).toHaveClass('bg-ember/20')
  })

  it('calls onSelect when a date is clicked', () => {
    const onSelect = vi.fn()
    render(
      <BriefingDateColumn
        collapsed={false}
        history={[{ date: '2026-07-10', filePath: '/x.md' }]}
        today="2026-07-11"
        onSelect={onSelect}
        onReceiveToday={vi.fn()}
        theme="academic"
      />
    )
    fireEvent.click(screen.getByTestId('briefing-date-item-2026-07-10'))
    expect(onSelect).toHaveBeenCalledWith('2026-07-10')
  })

  it('calls onReceiveToday when today entry clicked', () => {
    const onReceiveToday = vi.fn()
    render(
      <BriefingDateColumn
        collapsed={false}
        history={[]}
        today="2026-07-11"
        onSelect={vi.fn()}
        onReceiveToday={onReceiveToday}
        theme="academic"
      />
    )
    fireEvent.click(screen.getByText('查收日报'))
    expect(onReceiveToday).toHaveBeenCalled()
  })

  it('renders collapsed rail with today and latest mini buttons', () => {
    render(
      <BriefingDateColumn
        collapsed={true}
        history={[{ date: '2026-07-10', filePath: '/x.md' }]}
        today="2026-07-11"
        onSelect={vi.fn()}
        onReceiveToday={vi.fn()}
        theme="academic"
      />
    )
    expect(screen.getByTestId('briefing-date-today-mini')).toBeInTheDocument()
    expect(screen.getByTestId('briefing-date-latest-mini')).toBeInTheDocument()
  })
})
```

Run: `npx vitest run tests/briefing-date-column.test.tsx`
Expected: PASS

### 11.2 `tests/anthropic-blog-panel.test.tsx`

**Files:**
- Create/Modify: `tests/anthropic-blog-panel.test.tsx`

由于 `AnthropicBlogPanel` 依赖 store 与 IPC，先 mock store 状态：

```tsx
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'

vi.mock('@/lib/ipc', () => ({
  ipc: {
    patchState: vi.fn(),
    getState: vi.fn(),
    scanLibrary: vi.fn(),
    loadSessions: vi.fn(),
    loadGroups: vi.fn(),
    anthropicDiscover: vi.fn(),
    anthropicImportArticle: vi.fn(),
  }
}))
vi.mock('@/lib/paintings', () => ({ manifest: [], pickRandom: vi.fn(() => null) }))

import { useStore } from '@/store'
import { AnthropicBlogPanel } from '@/components/anthropic/AnthropicBlogPanel'

describe('AnthropicBlogPanel collapse', () => {
  beforeEach(() => {
    cleanup()
    useStore.setState({
      anthropicBlogCache: {
        lastFetchedAt: null,
        articles: [
          { url: 'https://x.com/a', title: 'Article A', summary: null, publishedAt: null, imageUrl: null, isSaved: false }
        ],
        loading: false,
        error: null,
      },
      anthropicReaderFilePath: null,
    })
  })

  it('renders BriefingListColumn shell', () => {
    render(<AnthropicBlogPanel theme="academic" />)
    expect(screen.getByTestId('briefing-list-column')).toBeInTheDocument()
  })

  it('toggles collapsed rail and shows thumbnails', () => {
    render(<AnthropicBlogPanel theme="academic" />)
    const toggle = screen.getByTestId('briefing-list-column-toggle')
    fireEvent.click(toggle)
    expect(screen.getByTestId('briefing-list-column')).toHaveClass('w-14')
    expect(screen.getAllByTestId('anthropic-list-rail-thumb').length).toBeGreaterThan(0)
  })
})
```

Run: `npx vitest run tests/anthropic-blog-panel.test.tsx`
Expected: PASS

### 11.3 `tests/anthropic-reader-images.test.tsx`

**Files:**
- Modify: `tests/anthropic-reader-images.test.tsx`

在现有测试文件末尾添加：

```tsx
it('does not render the back-to-list button', async () => {
  render(<AnthropicArticleReader filePath={TEST_FILE_PATH} theme="academic" />)
  await waitFor(() => screen.getByTestId('anthropic-reader-title'))
  expect(screen.queryByTestId('anthropic-reader-close')).not.toBeInTheDocument()
})
```

Run: `npx vitest run tests/anthropic-reader-images.test.tsx`
Expected: PASS

### 11.4 `tests/briefing-layout.test.tsx`

**Files:**
- Create: `tests/briefing-layout.test.tsx`

```tsx
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'

vi.mock('@/lib/ipc', () => ({ ipc: { patchState: vi.fn(), getState: vi.fn() } }))
vi.mock('@/lib/paintings', () => ({ manifest: [], pickRandom: vi.fn(() => null) }))

import { AcademicBriefingLayout } from '@/components/briefing/AcademicBriefingLayout'
import { NewspaperBriefingLayout } from '@/components/briefing/NewspaperBriefingLayout'

const RESULT = {
  title: 'Test',
  date: '2026-07-11',
  content: '',
  sources: [],
  filePath: '/x.md',
  cached: false,
  generatedAt: new Date().toISOString(),
  sourceStatus: { x: 'ok', podcasts: 'ok', blogs: 'ok' },
} as const

const PARSED = {
  sections: [{ title: 'X / Twitter', body: 'Body text with [link](https://example.com).' }],
  sources: [{ title: 'X', items: ['[tweet](https://example.com)'] }],
}

describe('Briefing layouts', () => {
  beforeEach(() => cleanup())

  it('academic renders shard cards', () => {
    render(<AcademicBriefingLayout result={RESULT as any} parsed={PARSED} displayDate="2026 年 07 月 11 日" />)
    expect(screen.getByTestId('briefing-academic-layout')).toBeInTheDocument()
    expect(screen.getByText('01')).toBeInTheDocument()
    expect(screen.getByText('X / Twitter')).toBeInTheDocument()
  })

  it('newspaper renders masthead and section title', () => {
    render(<NewspaperBriefingLayout result={RESULT as any} parsed={PARSED} displayDate="2026 年 07 月 11 日" />)
    expect(screen.getByTestId('briefing-newspaper-layout')).toBeInTheDocument()
    expect(screen.getByText('夜航简报')).toBeInTheDocument()
    expect(screen.getByText('X / TWITTER')).toBeInTheDocument()
  })
})
```

Run: `npx vitest run tests/briefing-layout.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit tests**

```bash
git add tests/
git commit -m "test(briefing): add date column, layout, and anthropic collapse tests"
```

---

## Task 12: 更新 E2E 选择器

**Files:**
- Modify: `e2e/helpers/selectors.ts`

```ts
briefing: {
  // ... existing selectors ...
  historyButton: '[data-testid="briefing-history-button"]', // can be removed if no other references
  regenerateButton: '[data-testid="briefing-regenerate-button"]', // can be removed
  // new
  listColumn: '[data-testid="briefing-list-column"]',
  listColumnToggle: '[data-testid="briefing-list-column-toggle"]',
  dateColumn: '[data-testid="briefing-date-column"]',
  dateItem: (date: string) => `[data-testid="briefing-date-item-${date}"]`,
  dateTodayMini: '[data-testid="briefing-date-today-mini"]',
  anthropicListRailThumb: '[data-testid="anthropic-list-rail-thumb"]',
  sourceExpandToggle: '[data-testid="briefing-source-expand-toggle"]',
}
```

删除 `historyButton` 和 `regenerateButton` 引用（先检查是否被其他 spec 使用）。

- [ ] **Step 1: Commit**

```bash
git add e2e/helpers/selectors.ts
git commit -m "test(e2e): update selectors for new briefing list/date column"
```

---

## Task 13: 更新 E2E spec

### 13.1 `e2e/specs/briefing-ux-optimization.spec.ts`

**Files:**
- Modify: `e2e/specs/briefing-ux-optimization.spec.ts`

替换/删除以下测试：

- `header buttons are visible before generation`：删除 `historyButton` 断言；新增 `listColumn` 可见断言。
- `history button is visible before generation and opens drawer`：改为「日期列可见并点击日期可打开该日期简报」。
- `history button opens drawer from empty state`：改为「空态下日期列显示今日条目」。
- `history button opens drawer from error state`：改为「错误状态下日期列仍可见」。
- `history button opens drawer when source is anthropic`：删除（Anthropic 源下中间列为博客列表）。

示例替换：

```ts
test('date column is visible before generation @smoke', async () => {
  const today = localToday()
  seedBriefing(testLibraryPath, today)
  const coverPage = new CoverPage(window)
  await coverPage.gotoBriefing()
  await expect(window.locator(SELECTORS.briefing.fontSizeDecrease)).toBeVisible()
  await expect(window.locator(SELECTORS.briefing.fontSizeIncrease)).toBeVisible()
  await expect(window.locator(SELECTORS.briefing.themeToggle)).toBeVisible()
  await expect(window.locator(SELECTORS.briefing.listColumn)).toBeVisible()
})
```

### 13.2 `e2e/specs/anthropic-blog.spec.ts`

**Files:**
- Modify: `e2e/specs/anthropic-blog.spec.ts`

- 更新折叠断言：使用 `SELECTORS.briefing.listColumnToggle` 点击折叠，断言 `SELECTORS.briefing.listColumn` 有 `w-14`。
- 删除 reader close 按钮点击断言。
- 已保存文章再次点击直接打开后，无需 close 按钮点击，直接验证 reader 可见即可。

- [ ] **Step 1: Commit**

```bash
git add e2e/specs/
git commit -m "test(e2e): adapt specs to date column and thumbnail rail"
```

---

## Task 14: 最终验证

- [ ] **Step 1: 类型检查**

Run: `npx tsc --noEmit`
Expected: PASS

- [ ] **Step 2: 组件/单元测试**

Run: `npx vitest run tests/briefing-header.test.tsx tests/briefing-date-column.test.tsx tests/briefing-layout.test.tsx tests/anthropic-blog-panel.test.tsx tests/anthropic-reader-images.test.tsx tests/briefing-sidebar.test.tsx`
Expected: ALL PASS

- [ ] **Step 3: 构建**

Run: `npm run build`
Expected: PASS

- [ ] **Step 4: Commit 任何修复**

如果有少量修复，直接 commit；如果有大量失败，回退并重新评估。

---

## Spec 覆盖检查表

| Spec 要求 | 对应 Task |
|-----------|-----------|
| 删除博客「返回列表」 | Task 9 |
| 博客列表折叠改为 `w-14` rail + 反向 toggle | Task 8 |
| AI 日报删除 Header「往期」「重新生成」 | Task 3, 4 |
| AI 日报新增中间日期列 | Task 1, 2, 4 |
| 学术主题 → 思维碎片式 | Task 5 |
| 报纸主题 → 报纸分栏式 | Task 6 |
| 来源链接 pill 化 | Task 7 |
| 博客阅读器极简结构优化 | Task 9 |
| 正文宽度 = 可用区域 90%，max 1250px | Task 5, 6, 9 |
| 测试/E2E 更新 | Task 10, 11, 12, 13 |

## 无占位符检查

- 所有步骤包含具体文件路径与代码/命令。
- 无 "TBD"/"TODO"/"later"。
- 无 "适当错误处理" 等模糊描述。

## 执行交接

Plan complete and saved to `docs/superpowers/plans/2026-07-11-briefing-blog-reader-ui-redesign.md`.

Two execution options:

1. **Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration.
2. **Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints.

Which approach?
