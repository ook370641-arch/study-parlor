# 夜航简报 & Anthropic 博客阅读器 UI 修复实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修复夜航简报侧边栏主题、入口按钮、折叠图标，并让 Anthropic 博客阅读器与正文图片渲染跟随 `briefingTheme`。

**Architecture:** 采用外科手术式修复：给 `BriefingSourceSidebar` 增加 `theme` prop；在 `Briefing.tsx` 移除 mount 时自动生成并增加「查收日报」空状态；让 Anthropic 博客组件读取 `briefingTheme` 切换深浅两套 Tailwind 类；在 `MarkdownRenderer`/`components.tsx`/`markdown.css` 中补充对 `<img>` 的渲染与占位。

**Tech Stack:** Electron 30, React 18, TypeScript, Tailwind CSS, Zustand, react-markdown, remark-gfm, Vitest, @testing-library/react

---

## File Structure

| 文件 | 职责 |
|------|------|
| `src/components/BriefingSourceSidebar.tsx` | 新增 `theme` prop，按学术/报纸切换配色，折叠状态用 SVG 图标 |
| `src/pages/Briefing.tsx` | 移除 mount 自动生成；新增「查收日报」空状态；把 `theme` 传给 sidebar 和博客组件 |
| `src/components/anthropic/AnthropicBlogPanel.tsx` | 读取 `briefingTheme`，切换面板深浅配色 |
| `src/components/anthropic/AnthropicArticleReader.tsx` | 读取 `briefingTheme`，切换阅读器深浅配色 |
| `src/components/anthropic/AnthropicArticleRow.tsx` | 按主题切换列表项卡片配色 |
| `src/components/md/MarkdownRenderer.tsx` | 保持现有 frontmatter 剥离逻辑；确保 body 中 `![alt](src)` 不被破坏 |
| `src/components/md/components.tsx` | 新增 `img` 组件：最大宽度 100%、加载失败占位、外链/本地路径兼容 |
| `src/components/md/markdown.css` | 为 `.briefing-body-academic img` 与 `.briefing-body-newspaper img` 增加主题化样式 |
| `tests/briefing-sidebar.test.tsx` | 验证 sidebar 主题色与折叠图标 |
| `tests/briefing-empty-state.test.tsx` | 验证「查收日报」按钮触发 loading |
| `tests/md-image.test.tsx` | 验证 MarkdownRenderer 渲染本地/外链图片及加载失败占位 |

---

## Task 1: Theme-aware BriefingSourceSidebar with SVG icons

**Files:**
- Modify: `src/components/BriefingSourceSidebar.tsx`
- Test: `tests/briefing-sidebar.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// tests/briefing-sidebar.test.tsx
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'

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
  manifest: [],
  pickRandom: vi.fn(() => null)
}))

import { useStore } from '@/store'
import { BriefingSourceSidebar } from '@/components/BriefingSourceSidebar'

describe('BriefingSourceSidebar', () => {
  beforeEach(() => {
    cleanup()
    useStore.setState({ briefingSource: 'digest' })
  })

  it('renders newspaper theme colors when theme is newspaper', () => {
    render(<BriefingSourceSidebar theme="newspaper" collapsed={false} onToggle={() => {}} />)
    const aside = screen.getByTestId('briefing-source-sidebar')
    expect(aside).toHaveClass('bg-[#e8e4de]')
    expect(aside).toHaveClass('border-[#c9c3b8]')
  })

  it('renders academic theme colors when theme is academic', () => {
    render(<BriefingSourceSidebar theme="academic" collapsed={false} onToggle={() => {}} />)
    const aside = screen.getByTestId('briefing-source-sidebar')
    expect(aside).toHaveClass('bg-[#3d2f27]')
    expect(aside).toHaveClass('border-r')
  })

  it('shows SVG icons instead of single characters when collapsed', () => {
    render(<BriefingSourceSidebar theme="academic" collapsed={true} onToggle={() => {}} />)
    expect(screen.queryByText('日')).not.toBeInTheDocument()
    expect(screen.queryByText('A')).not.toBeInTheDocument()
    const svgs = screen.getAllByTestId('briefing-source-icon')
    expect(svgs).toHaveLength(2)
  })

  it('switches source on click', () => {
    render(<BriefingSourceSidebar theme="academic" collapsed={false} onToggle={() => {}} />)
    fireEvent.click(screen.getByTestId('briefing-source-anthropic'))
    expect(useStore.getState().briefingSource).toBe('anthropic')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/briefing-sidebar.test.tsx`
Expected: FAIL — `theme` prop does not exist on `BriefingSourceSidebar`, classes missing.

- [ ] **Step 3: Implement theme-aware sidebar**

```tsx
// src/components/BriefingSourceSidebar.tsx
import { useStore } from '@/store'
import type { BriefingTheme } from '@shared/index'

interface Props {
  collapsed: boolean
  onToggle: () => void
  theme: BriefingTheme
}

function DigestIcon({ className }: { className?: string }) {
  return (
    <svg
      data-testid="briefing-source-icon"
      className={className}
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="3" y="5" width="18" height="14" rx="1" />
      <path d="M7 9h10M7 13h10M7 17h6" />
    </svg>
  )
}

function AnthropicIcon({ className }: { className?: string }) {
  return (
    <svg
      data-testid="briefing-source-icon"
      className={className}
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 4 L20 8 L12 12 L4 8 Z" />
      <path d="M4 8v8l8 4 8-4V8" />
      <path d="M12 12v8" />
    </svg>
  )
}

export function BriefingSourceSidebar({ collapsed, onToggle, theme }: Props) {
  const source = useStore((s) => s.briefingSource)
  const setSource = useStore((s) => s.setBriefingSource)

  const isAcademic = theme === 'academic'

  const themeClasses = isAcademic
    ? {
        bg: 'bg-[#3d2f27]',
        border: 'border-r border-[rgba(232,213,183,0.18)]',
        headerText: 'text-parchment',
        toggle: 'text-parchment/60 hover:text-parchment',
        active: 'bg-[rgba(232,213,183,0.1)] text-parchment border-l-[3px] border-l-[#d97757]',
        inactive: 'text-parchment/70 hover:bg-[rgba(232,213,183,0.06)]',
        headerBorder: 'border-b border-[rgba(232,213,183,0.18)]',
      }
    : {
        bg: 'bg-[#e8e4de]',
        border: 'border-r border-[#c9c3b8]',
        headerText: 'text-[#2a1f1a]',
        toggle: 'text-[#2a1f1a]/60 hover:text-[#2a1f1a]',
        active: 'bg-[rgba(0,0,0,0.06)] text-[#2a1f1a] border-l-[3px] border-l-[#1a1a1a]',
        inactive: 'text-[#2a1f1a]/70 hover:bg-[rgba(0,0,0,0.04)]',
        headerBorder: 'border-b border-[#c9c3b8]',
      }

  const base = `w-full text-left px-3 py-2 rounded transition-colors flex items-center gap-3 ${collapsed ? 'justify-center' : ''}`

  const navItems = [
    {
      id: 'digest',
      label: 'AI 日报',
      icon: DigestIcon,
      testId: 'briefing-source-digest',
    },
    {
      id: 'anthropic',
      label: 'Anthropic 博客',
      icon: AnthropicIcon,
      testId: 'briefing-source-anthropic',
    },
  ] as const

  return (
    <aside
      data-testid="briefing-source-sidebar"
      className={`h-full flex flex-col transition-all ${collapsed ? 'w-14' : 'w-48'} ${themeClasses.bg} ${themeClasses.border}`}
    >
      <div className={`flex items-center justify-between px-3 py-4 ${themeClasses.headerBorder}`}>
        {!collapsed && <span className={`text-sm font-serif ${themeClasses.headerText}`}>来源</span>}
        <button
          data-testid="briefing-sidebar-toggle"
          onClick={onToggle}
          className={themeClasses.toggle}
          title={collapsed ? '展开' : '折叠'}
        >
          {collapsed ? '▶' : '◀'}
        </button>
      </div>
      <nav className="flex-1 p-2 space-y-2">
        {navItems.map((item) => {
          const Icon = item.icon
          const isActive = source === item.id
          return (
            <button
              key={item.id}
              data-testid={item.testId}
              onClick={() => {
                setSource(item.id)
                if (collapsed) onToggle()
              }}
              className={`${base} ${isActive ? themeClasses.active : themeClasses.inactive}`}
              title={item.label}
            >
              <Icon className={isActive ? (isAcademic ? 'text-parchment' : 'text-[#2a1f1a]') : ''} />
              {!collapsed && <span>{item.label}</span>}
            </button>
          )
        })}
      </nav>
    </aside>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/briefing-sidebar.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/BriefingSourceSidebar.tsx tests/briefing-sidebar.test.tsx
git commit -m "feat(briefing): theme-aware source sidebar with SVG icons"
```

---

## Task 2: Add 「查收日报」 empty state in Briefing.tsx

**Files:**
- Modify: `src/pages/Briefing.tsx`
- Test: `tests/briefing-empty-state.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// tests/briefing-empty-state.test.tsx
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react'

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
  manifest: [],
  pickRandom: vi.fn(() => null)
}))

import { useStore } from '@/store'
import { Briefing } from '@/pages/Briefing'

describe('Briefing empty state', () => {
  beforeEach(() => {
    cleanup()
    useStore.setState({
      briefing: { result: null, loading: false, error: null },
      briefingSource: 'digest',
      briefingTheme: 'academic',
    })
  })

  it('shows 查收日报 button when digest has no result and is not loading', () => {
    render(<Briefing />)
    expect(screen.getByText('今日夜航简报尚未生成')).toBeInTheDocument()
    expect(screen.getByTestId('briefing-receive-digest-button')).toBeInTheDocument()
    expect(screen.queryByTestId('briefing-skeleton')).not.toBeInTheDocument()
  })

  it('does not auto-generate digest on mount', () => {
    const generate = vi.fn()
    useStore.setState({ generateBriefing: generate })
    render(<Briefing />)
    expect(generate).not.toHaveBeenCalled()
  })

  it('calls generateBriefing when button clicked', async () => {
    const generate = vi.fn().mockResolvedValue(undefined)
    useStore.setState({ generateBriefing: generate })
    render(<Briefing />)
    fireEvent.click(screen.getByTestId('briefing-receive-digest-button'))
    await waitFor(() => expect(generate).toHaveBeenCalledTimes(1))
  })

  it('does not show empty state when result exists', () => {
    useStore.setState({
      briefing: {
        result: {
          title: '夜航简报',
          date: '2026-07-10',
          content: '## X\n\ntext',
          sources: [],
          filePath: '/tmp/briefing.md',
          cached: false,
          generatedAt: new Date().toISOString(),
          sourceStatus: { x: 'ok', blogs: 'ok', podcasts: 'ok' },
        },
        loading: false,
        error: null,
      }
    })
    render(<Briefing />)
    expect(screen.queryByTestId('briefing-receive-digest-button')).not.toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/briefing-empty-state.test.tsx`
Expected: FAIL — button missing, auto-generate still called.

- [ ] **Step 3: Implement empty state and remove auto-generate**

```tsx
// src/pages/Briefing.tsx (modifications)
// 1. Remove the useEffect that auto-generates on mount.
// 2. Add helper constant and render empty state before the loading branch.

// Remove this block entirely:
//   useEffect(() => {
//     if (source !== 'digest') return
//     if (!result && !loading && !error) {
//       generateBriefing(today)
//     }
//   }, [result, loading, error, today, generateBriefing, source])

// Add empty state JSX inside the main flex column, before the existing branches.
// Replace the existing ternary starting at line 130 with:

const emptyState = source === 'digest' && !result && !loading && !error

// In JSX, inside <div className="flex-1 flex flex-col min-w-0"> after <BriefingHeader />:
{source === 'anthropic' ? (
  <AnthropicBlogPanel theme={theme} />
) : emptyState ? (
  <main className="relative z-[5] flex-1 flex items-center justify-center px-6">
    <div className="text-center">
      <p className={`mb-6 ${isAcademic ? 'text-parchment/70' : 'text-[#6b5d52]'}`}>
        今日夜航简报尚未生成
      </p>
      <button
        data-testid="briefing-receive-digest-button"
        onClick={() => generateBriefing(today)}
        className={`px-8 py-3 rounded text-[15px] font-serif transition-colors ${
          isAcademic
            ? 'bg-ember text-white hover:bg-ember/90'
            : 'bg-[#1a1a1a] text-white hover:bg-[#333]'
        }`}
      >
        查收日报
      </button>
    </div>
  </main>
) : isDigestLoading ? (
  <main className="relative z-[5] flex-1 overflow-y-auto px-6 py-6 max-w-3xl mx-auto">
    {stage ? (
      <BriefingProgress stage={stage} />
    ) : (
      <BriefingSkeleton data-testid="briefing-skeleton" />
    )}
  </main>
) : isDigestError ? (
  ...
}

// Also pass theme to BriefingSourceSidebar:
<BriefingSourceSidebar
  collapsed={sidebarCollapsed}
  onToggle={() => setSidebarCollapsed((c) => !c)}
  theme={theme}
/>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/briefing-empty-state.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/pages/Briefing.tsx tests/briefing-empty-state.test.tsx
git commit -m "feat(briefing): add 查收日报 empty state and stop auto-generate on mount"
```

---

## Task 3: Theme-aware AnthropicBlogPanel

**Files:**
- Modify: `src/components/anthropic/AnthropicBlogPanel.tsx`
- Modify: `src/components/anthropic/AnthropicArticleRow.tsx`

- [ ] **Step 1: Implement theme prop and color switching in AnthropicBlogPanel**

```tsx
// src/components/anthropic/AnthropicBlogPanel.tsx
import { useMemo, useState } from 'react'
import { useStore } from '@/store'
import { AnthropicArticleRow } from './AnthropicArticleRow'
import { AnthropicArticleReader } from './AnthropicArticleReader'
import { AnthropicErrorMessage } from './AnthropicErrorMessage'
import type { BriefingTheme } from '@shared/index'

interface Props {
  theme?: BriefingTheme
}

export function AnthropicBlogPanel({ theme = 'academic' }: Props) {
  const isAcademic = theme === 'academic'
  const themeClasses = isAcademic
    ? {
        panelBg: 'bg-ink/60',
        sidebarBg: 'bg-ink/80',
        border: 'border-slate/30',
        text: 'text-parchment',
        muted: 'text-parchment/50',
        inputBg: 'bg-parchment/10',
        inputText: 'text-parchment',
        inputPlaceholder: 'placeholder:text-parchment/40',
        inputBorder: 'border-slate/30 focus:border-ember/50',
        button: 'bg-ember/20 text-parchment hover:bg-ember/30',
        emptyIcon: 'text-parchment/20',
        skeleton: 'bg-parchment/10',
      }
    : {
        panelBg: 'bg-white',
        sidebarBg: 'bg-[#e8e4de]',
        border: 'border-[#c9c3b8]',
        text: 'text-[#1a1a1a]',
        muted: 'text-[#6b5d52]',
        inputBg: 'bg-white',
        inputText: 'text-[#1a1a1a]',
        inputPlaceholder: 'placeholder:text-[#6b5d52]/60',
        inputBorder: 'border-[#c9c3b8] focus:border-[#1a1a1a]/50',
        button: 'bg-[#1a1a1a] text-white hover:bg-[#333]',
        emptyIcon: 'text-[#c9c3b8]',
        skeleton: 'bg-[#e8e4de]',
      }

  // ... rest of existing hooks stay the same until return

  return (
    <div
      data-testid="anthropic-blog-panel"
      className={`relative flex-1 flex min-w-0 overflow-hidden ${themeClasses.panelBg}`}
    >
      <div
        className={`flex flex-col border-r ${themeClasses.border} ${themeClasses.sidebarBg} transition-all duration-200 ${
          listVisible ? 'w-80 min-w-[20rem]' : 'w-0 opacity-0 overflow-hidden'
        }`}
      >
        <div className={`flex items-center justify-between px-4 py-3 border-b ${themeClasses.border} shrink-0`}>
          <div className="min-w-0">
            <h2 className={`text-base font-serif truncate ${themeClasses.text}`}>Anthropic Engineering</h2>
            {lastFetchedAt && (
              <p className={`text-[10px] ${themeClasses.muted}`}>
                更新于 {new Date(lastFetchedAt).toLocaleString('zh-CN')}
              </p>
            )}
          </div>
          <button
            data-testid="anthropic-refresh-button"
            onClick={() => discover()}
            disabled={loading}
            className={`ml-2 px-2.5 py-1 rounded text-xs disabled:opacity-50 shrink-0 ${themeClasses.button}`}
          >
            {loading ? '刷新中' : '刷新'}
          </button>
        </div>

        <div className={`px-4 py-2 border-b ${themeClasses.border} shrink-0`}>
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="搜索标题或摘要…"
            className={`w-full px-3 py-1.5 rounded text-sm outline-none border ${themeClasses.inputBg} ${themeClasses.inputText} ${themeClasses.inputPlaceholder} ${themeClasses.inputBorder}`}
          />
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-3">
          {loading && articles.length === 0 && (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className={`h-24 rounded animate-pulse ${themeClasses.skeleton}`} />
              ))}
            </div>
          )}

          {error && (
            <AnthropicErrorMessage error={error} onRetry={() => discover()} />
          )}

          {!loading && !error && filtered.length === 0 && (
            <div className={`text-center py-12 text-sm ${themeClasses.muted}`}>
              {articles.length === 0 ? (
                <p>暂无文章，点击右上角刷新列表。</p>
              ) : (
                <p>没有匹配“{query}”的文章。</p>
              )}
            </div>
          )}

          <div className="space-y-3">
            {filtered.map((article) => (
              <AnthropicArticleRow key={article.url} article={article} theme={theme} />
            ))}
          </div>
        </div>
      </div>

      <div className="flex-1 min-w-0 flex flex-col">
        {readerFilePath ? (
          <AnthropicArticleReader
            filePath={readerFilePath}
            onClose={closeReader}
            sidebarToggle={readerSidebarToggle}
            theme={theme}
          />
        ) : (
          <div className={`flex-1 flex flex-col items-center justify-center px-6 ${themeClasses.muted}`}>
            <svg
              className={`w-12 h-12 mb-4 ${themeClasses.emptyIcon}`}
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"
              />
            </svg>
            <p className="text-sm">从左侧列表选择一篇文章开始阅读</p>
          </div>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Implement theme-aware AnthropicArticleRow**

```tsx
// src/components/anthropic/AnthropicArticleRow.tsx
import { useState } from 'react'
import { useStore } from '@/store'
import { ipc } from '@/lib/ipc'
import type { AnthropicArticleMeta, BriefingTheme } from '@shared/index'

interface Props {
  article: AnthropicArticleMeta
  theme?: BriefingTheme
}

// keep existing formatDate helper

export function AnthropicArticleRow({ article, theme = 'academic' }: Props) {
  const isAcademic = theme === 'academic'
  const importArticle = useStore((s) => s.importAnthropicArticle)
  const cancelImport = useStore((s) => s.cancelAnthropicImport)
  const openReader = useStore((s) => s.openAnthropicReader)
  const [importing, setImporting] = useState(false)

  // keep handleClick / handleCancel logic

  const cardClasses = isAcademic
    ? 'border-slate/30 bg-ink/60 hover:border-ember/50 text-parchment'
    : 'border-[#c9c3b8] bg-white hover:border-[#1a1a1a]/50 text-[#1a1a1a]'

  const mutedText = isAcademic ? 'text-parchment/50' : 'text-[#6b5d52]'
  const secondaryText = isAcademic ? 'text-parchment/70' : 'text-[#555]'
  const placeholderBg = isAcademic ? 'bg-parchment/10' : 'bg-[#e8e4de]'
  const placeholderText = isAcademic ? 'text-parchment/40' : 'text-[#6b5d52]/60'
  const savedBadge = isAcademic
    ? 'bg-ember/20 text-ember'
    : 'bg-[#1a1a1a] text-white'
  const actionBorder = isAcademic ? 'border-slate/30' : 'border-[#c9c3b8]'
  const actionText = isAcademic ? 'text-parchment/70' : 'text-[#555]'
  const hintText = isAcademic ? 'text-parchment/40' : 'text-[#999]'

  return (
    <button
      data-testid="anthropic-article-row"
      onClick={handleClick}
      disabled={importing}
      className={`w-full text-left rounded border p-4 transition-colors group disabled:opacity-70 ${cardClasses}`}
    >
      <div className="flex items-start gap-4">
        {article.imageUrl ? (
          <img
            src={article.imageUrl}
            alt=""
            className={`shrink-0 w-20 h-20 object-cover rounded ${placeholderBg}`}
            loading="lazy"
          />
        ) : (
          <div className={`shrink-0 w-20 h-20 rounded flex items-center justify-center text-xs ${placeholderBg} ${placeholderText}`}>
            无配图
          </div>
        )}

        <div className="flex-1 min-w-0">
          <h3
            data-testid="anthropic-article-title"
            className={`text-base font-serif group-hover:text-ember transition-colors truncate ${isAcademic ? '' : 'text-[#1a1a1a]'}`}
          >
            {article.title}
          </h3>
          <p className={`text-xs mt-1 ${mutedText}`}>{formatDate(article.publishedAt)}</p>
          {article.summary && (
            <p className={`text-sm mt-2 line-clamp-2 ${secondaryText}`}>{article.summary}</p>
          )}
        </div>

        <div className="shrink-0 flex flex-col items-end gap-2 min-w-[4.5rem]">
          {article.isSaved ? (
            <span data-testid="anthropic-article-saved" className={`text-xs px-2 py-0.5 rounded ${savedBadge}`}>
              已保存
            </span>
          ) : (
            <span className={`text-xs px-2 py-0.5 rounded border ${actionBorder} ${actionText}`}>
              导入阅读
            </span>
          )}

          {importing ? (
            <button
              type="button"
              onClick={handleCancel}
              className="text-xs text-ember underline"
            >
              取消
            </button>
          ) : (
            <span className={`text-xs ${hintText}`}>
              {article.isSaved ? '阅读' : '点击导入'}
            </span>
          )}
        </div>
      </div>
    </button>
  )
}
```

- [ ] **Step 3: Run existing tests and new visual smoke**

Run: `npx vitest run tests/anthropic.test.ts`
Expected: PASS

Run: `npm run build`
Expected: PASS (TypeScript checks the new prop types)

- [ ] **Step 4: Commit**

```bash
git add src/components/anthropic/AnthropicBlogPanel.tsx src/components/anthropic/AnthropicArticleRow.tsx
git commit -m "feat(anthropic): theme-aware blog panel and article row"
```

---

## Task 4: Theme-aware AnthropicArticleReader

**Files:**
- Modify: `src/components/anthropic/AnthropicArticleReader.tsx`

- [ ] **Step 1: Add theme prop and switch reader colors**

```tsx
// src/components/anthropic/AnthropicArticleReader.tsx
import { useEffect, useState } from 'react'
import { ipc } from '@/lib/ipc'
import { MarkdownRenderer } from '@/components/md/MarkdownRenderer'
import { AnthropicErrorMessage } from './AnthropicErrorMessage'
import type { Frontmatter, BriefingTheme } from '@shared/index'

interface Props {
  filePath: string
  onClose?: () => void
  sidebarToggle?: React.ReactNode
  theme?: BriefingTheme
}

// keep toAbsoluteAssetUrl, rewriteLocalImagePaths, formatDate helpers

export function AnthropicArticleReader({ filePath, onClose, sidebarToggle, theme = 'academic' }: Props) {
  const isAcademic = theme === 'academic'
  const [frontmatter, setFrontmatter] = useState<Frontmatter | null>(null)
  const [body, setBody] = useState<string>('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<{ code: string; message: string } | null>(null)

  // keep useEffect that loads file

  const themeClasses = isAcademic
    ? {
        bg: 'bg-[#0d0d0d]',
        text: 'text-[#e6e6e6]',
        headerBg: 'bg-[#0d0d0d]/95',
        headerBorder: 'border-[#333]',
        title: 'text-white',
        meta: 'text-[#999]',
        summaryBox: 'bg-[#1a1a1a] border-[#d97757]',
        summaryText: 'text-[#ccc]',
        link: 'text-[#d97757]',
        skeleton: 'bg-[#1a1a1a]',
      }
    : {
        bg: 'bg-white',
        text: 'text-[#1a1a1a]',
        headerBg: 'bg-white/95',
        headerBorder: 'border-[#c9c3b8]',
        title: 'text-[#1a1a1a]',
        meta: 'text-[#6b5d52]',
        summaryBox: 'bg-[#f5f2ed] border-[#c9c3b8]',
        summaryText: 'text-[#555]',
        link: 'text-[#d97757]',
        skeleton: 'bg-[#e8e4de]',
      }

  return (
    <div
      data-testid="anthropic-article-reader"
      className={`relative flex flex-col h-full overflow-y-auto ${themeClasses.bg} ${themeClasses.text}`}
    >
      {onClose && (
        <div className={`sticky top-0 z-10 flex items-center justify-between px-6 py-3 border-b ${themeClasses.headerBorder} ${themeClasses.headerBg} backdrop-blur`}>
          <button
            data-testid="anthropic-reader-close"
            type="button"
            onClick={onClose}
            className={`text-sm ${themeClasses.link} hover:underline`}
          >
            ← 返回列表
          </button>
          {sidebarToggle}
        </div>
      )}

      <div className="max-w-3xl mx-auto w-full px-6 py-10 pb-24">
        {loading && (
          <div className="space-y-4">
            <div className={`h-8 w-3/4 rounded animate-pulse ${themeClasses.skeleton}`} />
            <div className={`h-4 w-1/2 rounded animate-pulse ${themeClasses.skeleton}`} />
            <div className={`h-32 rounded animate-pulse mt-6 ${themeClasses.skeleton}`} />
          </div>
        )}

        {!loading && error && (
          <AnthropicErrorMessage
            error={{ code: 'unknown', message: error.message }}
            onRetry={() => window.location.reload()}
          />
        )}

        {!loading && frontmatter && (
          <>
            <header className={`mb-8 pb-8 border-b ${themeClasses.headerBorder}`}>
              <h1 data-testid="anthropic-reader-title" className={`text-3xl font-serif leading-tight mb-4 ${themeClasses.title}`}>
                {frontmatter.title}
              </h1>
              <div className={`flex flex-wrap items-center gap-x-4 gap-y-2 text-sm ${themeClasses.meta}`}>
                {frontmatter.source_url && (
                  <span>
                    来源：
                    <button
                      type="button"
                      onClick={() => ipc.openExternal(frontmatter.source_url!)}
                      className={`${themeClasses.link} hover:underline`}
                    >
                      Anthropic Engineering
                    </button>
                  </span>
                )}
                {frontmatter.published_at && (
                  <span>发布：{formatDate(frontmatter.published_at)}</span>
                )}
                {frontmatter.imported_at && (
                  <span>导入：{formatDate(frontmatter.imported_at)}</span>
                )}
                {frontmatter.authors && frontmatter.authors.length > 0 && (
                  <span>作者：{frontmatter.authors.join(', ')}</span>
                )}
              </div>
              {frontmatter.summary && (
                <div className={`mt-6 p-5 rounded-lg border-l-4 italic leading-relaxed ${themeClasses.summaryBox} ${themeClasses.summaryText}`}>
                  {frontmatter.summary}
                </div>
              )}
            </header>

            <article className={`prose max-w-none ${isAcademic ? 'prose-invert' : ''}`}>
              <MarkdownRenderer
                content={body}
                fileName={frontmatter.title ?? 'article.md'}
                hideHeader
                briefingStyle={theme}
              />
            </article>
          </>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Run build to verify types**

Run: `npm run build`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/components/anthropic/AnthropicArticleReader.tsx
git commit -m "feat(anthropic): theme-aware article reader"
```

---

## Task 5: MarkdownRenderer image support

**Files:**
- Modify: `src/components/md/components.tsx`
- Modify: `src/components/md/markdown.css`

- [ ] **Step 1: Write the failing test**

```tsx
// tests/md-image.test.tsx
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'

vi.mock('@/lib/ipc', () => ({
  ipc: { openExternal: vi.fn() }
}))

import { MarkdownRenderer } from '@/components/md/MarkdownRenderer'

afterEach(() => {
  cleanup()
})

describe('MarkdownRenderer images', () => {
  it('renders external image', () => {
    render(<MarkdownRenderer content="![alt](https://example.com/img.png)" fileName="test.md" />)
    const img = screen.getByAltText('alt')
    expect(img).toHaveAttribute('src', 'https://example.com/img.png')
    expect(img).toHaveClass('max-w-full')
  })

  it('renders local file:// image', () => {
    render(<MarkdownRenderer content="![local](file:///tmp/img.png)" fileName="test.md" />)
    const img = screen.getByAltText('local')
    expect(img).toHaveAttribute('src', 'file:///tmp/img.png')
  })

  it('shows placeholder on image error', () => {
    render(<MarkdownRenderer content="![broken](https://example.com/missing.png)" fileName="test.md" />)
    const img = screen.getByAltText('broken')
    fireEvent.error(img)
    expect(screen.getByTestId('md-image-error')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/md-image.test.tsx`
Expected: FAIL — `img` component not defined, classes missing.

- [ ] **Step 3: Add img component to baseComponents**

```tsx
// src/components/md/components.tsx
import { useState } from 'react'
import type { Components } from 'react-markdown'
import { ipc } from '@/lib/ipc'

// ... existing helpers and components

// ===== Image with error placeholder =====
function MdImage({ src, alt }: { src?: string; alt?: string }) {
  const [error, setError] = useState(false)
  if (error) {
    return (
      <span
        data-testid="md-image-error"
        className="inline-block min-w-[120px] min-h-[80px] px-3 py-2 rounded border border-dashed border-current/30 text-current/50 text-sm"
      >
        图片加载失败
      </span>
    )
  }
  return (
    <img
      src={src}
      alt={alt ?? ''}
      className="max-w-full h-auto rounded my-4 block"
      onError={() => setError(true)}
      loading="lazy"
    />
  )
}

const baseComponents: Components = {
  // ... existing components
  img: ({ src, alt }) => <MdImage src={src} alt={alt} />,
}
```

- [ ] **Step 4: Add newspaper/academic image CSS**

```css
/* src/components/md/markdown.css */
/* Add after the existing .briefing-body-newspaper / .briefing-body-academic blocks */

.briefing-body-newspaper .md-body img {
  border: 1px solid rgba(26, 26, 26, 0.12);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
}

.briefing-body-academic .md-body img {
  border: 1px solid rgba(232, 213, 183, 0.15);
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.25);
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run tests/md-image.test.tsx`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/components/md/components.tsx src/components/md/markdown.css tests/md-image.test.tsx
git commit -m "feat(md): render images with error placeholder and theme-aware borders"
```

---

## Task 6: Full test run and TypeScript check

**Files:** All changed files

- [ ] **Step 1: Run unit tests**

Run: `npm run test`
Expected: PASS

- [ ] **Step 2: Run build**

Run: `npm run build`
Expected: PASS

- [ ] **Step 3: Manual smoke in dev**

Run: `npm run dev`
Expected:
1. Open 夜航简报 page.
2. Academic theme: sidebar visible with `#3d2f27` background, icons not characters.
3. Switch to newspaper theme: sidebar becomes light gray `#e8e4de`, main area white.
4. Click 查收日报：shows loading UI.
5. Switch source to Anthropic: panel matches current theme.
6. Import an article: reader matches theme and inline images render.
7. Toggle sidebar collapse: shows two SVG icons, no single characters.

- [ ] **Step 4: Commit any final fixes**

```bash
git add -A
git commit -m "fix(briefing): final visual polish and test green"
```

---

## Spec Coverage Checklist

| Spec Requirement | Task |
|------------------|------|
| 学术主题下左侧来源栏清晰可见 | Task 1 |
| 报纸主题下左侧来源栏为浅灰底黑字 | Task 1 |
| 折叠侧边栏显示 SVG 图标 | Task 1 |
| 未生成时显示「查收日报」按钮 | Task 2 |
| 博客面板与阅读器跟随 briefingTheme | Task 3, Task 4 |
| 博客正文图片正常渲染 | Task 5 |
| 列表左侧抽象图标列保持不变 | Task 3 (未改动该列) |

## Placeholder Scan

- No "TBD", "TODO", "implement later", "fill in details".
- No "add appropriate error handling" without code.
- No "write tests for the above" without test code.
- All file paths exact.

## Type Consistency Check

- `BriefingTheme` from `@shared/index` used in `BriefingSourceSidebar`, `AnthropicBlogPanel`, `AnthropicArticleReader`.
- `briefingStyle` prop in `MarkdownRenderer` already typed as `'academic' | 'newspaper'`.
- `theme` prop defaults to `'academic'` in all new props to avoid breaking existing callers.

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-07-10-briefing-blog-reader-ui-fixes.md`. Two execution options:

**1. Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration.

**2. Inline Execution** — Execute tasks in this session using executing-plans, batch execution with checkpoints.

Which approach?
