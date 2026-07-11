# Anthropic 博客 UI 优化实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让 Anthropic 博客的文章列表可收起、只在检测到新文章时显示刷新提示、文章标题悬停展开完整显示，并精简列表行内文案。

**Architecture:** 新增纯函数 helper 负责新旧文章对比与合并；给 store 的 `discoverAnthropicArticles` 增加 `commit: false` 预览模式，使自动检测不立即替换列表；在 `AnthropicBlogPanel` 中新增本地状态管理收起/展开、新文章提示与垂直把手；`AnthropicArticleRow` 改用 hover state 切换 `line-clamp`。

**Tech Stack:** React 18 + TypeScript + Tailwind CSS 3.4 + Zustand + Vitest + @testing-library/react。

---

## 文件结构

| 文件 | 操作 | 说明 |
|---|---|---|
| `src/lib/anthropic-articles.ts` | 新建 | 新旧文章对比与合并的纯函数 |
| `tests/anthropic-articles.test.ts` | 新建 | helper 单元测试 |
| `src/store/index.ts` | 修改 | `discoverAnthropicArticles` 支持预览模式；新增 `mergeAnthropicArticles` |
| `src/components/anthropic/AnthropicArticleRow.tsx` | 修改 | 移除多余提示文字；标题悬停展开 |
| `src/components/anthropic/AnthropicArticleReader.tsx` | 修改 | 移除 `sidebarToggle` prop 和渲染 |
| `src/components/anthropic/AnthropicBlogPanel.tsx` | 重写 | 可收起列表、垂直把手、新文章提示、自动检测 |
| `tests/anthropic-article-row.test.tsx` | 新建 | 行内文案与标题展开测试 |
| `tests/anthropic-blog-panel.test.tsx` | 新建 | 收起/展开、新文章提示测试 |
| `e2e/specs/anthropic-blog-ui.spec.ts` | 新建/追加 | E2E 覆盖自动检测与刷新（可选但建议） |

---

## Task 1：新建文章对比/合并 helper

**Files:**
- Create: `src/lib/anthropic-articles.ts`
- Test: `tests/anthropic-articles.test.ts`

> 这个 helper 无 UI，先把逻辑和测试写好，后续组件直接复用。

- [ ] **Step 1: 写 helper**

```ts
import type { AnthropicArticleMeta } from '@shared/index'

export function findNewArticleUrls(
  cached: AnthropicArticleMeta[],
  fetched: AnthropicArticleMeta[]
): string[] {
  const cachedUrls = new Set(cached.map((a) => a.url))
  return fetched.map((a) => a.url).filter((url) => !cachedUrls.has(url))
}

export function mergeNewArticles(
  cached: AnthropicArticleMeta[],
  newArticles: AnthropicArticleMeta[]
): AnthropicArticleMeta[] {
  const existingUrls = new Set(cached.map((a) => a.url))
  const merged = [...newArticles.filter((a) => !existingUrls.has(a.url)), ...cached]
  return merged
}
```

- [ ] **Step 2: 写测试**

```ts
import { describe, expect, it } from 'vitest'
import { findNewArticleUrls, mergeNewArticles } from '@/lib/anthropic-articles'

function article(url: string): AnthropicArticleMeta {
  return {
    url,
    title: url,
    summary: null,
    publishedAt: null,
    imageUrl: null,
  }
}

describe('anthropic article helpers', () => {
  it('finds new urls not in cache', () => {
    const cached = [article('a'), article('b')]
    const fetched = [article('b'), article('c'), article('d')]
    expect(findNewArticleUrls(cached, fetched)).toEqual(['c', 'd'])
  })

  it('returns empty when all urls exist', () => {
    const cached = [article('a'), article('b')]
    const fetched = [article('a'), article('b')]
    expect(findNewArticleUrls(cached, fetched)).toEqual([])
  })

  it('merges new articles at front preserving old order', () => {
    const cached = [article('a'), article('b')]
    const newArticles = [article('c'), article('b')]
    expect(mergeNewArticles(cached, newArticles).map((a) => a.url)).toEqual(['c', 'a', 'b'])
  })

  it('handles empty cache', () => {
    const fetched = [article('a'), article('b')]
    expect(findNewArticleUrls([], fetched)).toEqual(['a', 'b'])
    expect(mergeNewArticles([], fetched)).toEqual(fetched)
  })
})
```

- [ ] **Step 3: 运行测试确认通过**

```bash
npx vitest run tests/anthropic-articles.test.ts
```

Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/lib/anthropic-articles.ts tests/anthropic-articles.test.ts
git commit -m "feat(anthropic): add article diff/merge helpers"
```

---

## Task 2：让 store discover 支持预览模式并新增合并 action

**Files:**
- Modify: `src/store/index.ts`（类型定义 + action 实现）
- Test: 通过后续组件测试覆盖；无需单独 store 单元测试。

> 自动检测时不能立即替换缓存，否则“刷新”按钮就失去意义。`commit: false` 模式只抓取、返回结果，不更新缓存。

- [ ] **Step 1: 更新 store 类型定义**

在 `src/store/index.ts` 中把这两行：

```ts
  discoverAnthropicArticles: () => Promise<void>
```

改为：

```ts
  discoverAnthropicArticles: (
    opts?: { commit?: boolean }
  ) => Promise<
    | { ok: true; lastFetchedAt: string; articles: AnthropicArticleMeta[] }
    | { ok: false; error: AnthropicError }
  >
  mergeAnthropicArticles: (
    newArticles: AnthropicArticleMeta[],
    lastFetchedAt: string
  ) => void
```

- [ ] **Step 2: 替换 discoverAnthropicArticles 实现**

把原来的实现替换为：

```ts
  discoverAnthropicArticles: async (opts) => {
    const commit = opts?.commit !== false
    set((s) => ({
      anthropicBlogCache: { ...s.anthropicBlogCache, loading: true, error: null },
    }))
    try {
      const result = await ipc.anthropicDiscover()
      if (result.ok) {
        const next: AnthropicBlogCache = {
          lastFetchedAt: result.lastFetchedAt,
          articles: result.articles,
          loading: false,
          error: null,
        }
        if (commit) {
          set({ anthropicBlogCache: next })
        }
        return { ok: true as const, lastFetchedAt: result.lastFetchedAt, articles: result.articles }
      }
      set((s) => ({
        anthropicBlogCache: { ...s.anthropicBlogCache, loading: false, error: result },
      }))
      return { ok: false as const, error: result }
    } catch (err: any) {
      const error = { code: 'unknown' as const, message: err.message || String(err) }
      set((s) => ({
        anthropicBlogCache: { ...s.anthropicBlogCache, loading: false, error },
      }))
      return { ok: false as const, error }
    }
  },
```

- [ ] **Step 3: 新增 mergeAnthropicArticles action**

放在 `discoverAnthropicArticles` 后面：

```ts
  mergeAnthropicArticles: (newArticles, lastFetchedAt) => {
    set((s) => ({
      anthropicBlogCache: {
        ...s.anthropicBlogCache,
        lastFetchedAt,
        articles: mergeNewArticles(s.anthropicBlogCache.articles, newArticles),
      },
    }))
  },
```

并在文件顶部 import helper：

```ts
import { findNewArticleUrls, mergeNewArticles } from '@/lib/anthropic-articles'
```

- [ ] **Step 4: 运行类型检查**

```bash
npx tsc --noEmit
```

Expected: 无类型错误。

- [ ] **Step 5: Commit**

```bash
git add src/store/index.ts
git commit -m "feat(store): anthropic discover preview mode and merge action"
```

---

## Task 3：精简 AnthropicArticleRow 并实现标题悬停展开

**Files:**
- Modify: `src/components/anthropic/AnthropicArticleRow.tsx`
- Test: `tests/anthropic-article-row.test.tsx`

> 去掉“点击导入/阅读”提示文字；标题默认截断，悬停时展开。

- [ ] **Step 1: 修改组件**

新增 hover state，删除多余提示 span：

```tsx
export function AnthropicArticleRow({ article, theme = 'academic' }: Props) {
  const isAcademic = theme !== 'newspaper'
  const importArticle = useStore((s) => s.importAnthropicArticle)
  const cancelImport = useStore((s) => s.cancelAnthropicImport)
  const openReader = useStore((s) => s.openAnthropicReader)
  const [importing, setImporting] = useState(false)
  const [hovered, setHovered] = useState(false)

  // ... handleClick / handleCancel 不变 ...

  // 删除这行（后续不再需要）：
  // const hintText = isAcademic ? 'text-parchment/40' : 'text-[#999]'

  return (
    <button
      data-testid="anthropic-article-row"
      onClick={handleClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      disabled={importing}
      className={`w-full text-left rounded border p-4 transition-colors group disabled:opacity-70 ${cardClasses}`}
    >
      <div className="flex items-start gap-4">
        {/* 缩略图逻辑保持不变 */}
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
            className={`text-base font-serif transition-colors ${
              hovered ? '' : 'line-clamp-1'
            } ${isAcademic ? '' : 'text-[#1a1a1a]'} ${titleHover}`}
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
            <button type="button" onClick={handleCancel} className={`text-xs underline ${cancelText}`}>
              取消
            </button>
          ) : null}
        </div>
      </div>
    </button>
  )
}
```

- [ ] **Step 2: 写组件测试**

```tsx
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'

vi.mock('@/lib/ipc', () => ({
  ipc: {
    readMd: vi.fn(),
  },
}))

import { useStore } from '@/store'
import { AnthropicArticleRow } from '@/components/anthropic/AnthropicArticleRow'

function article(overrides = {}) {
  return {
    url: 'https://www.anthropic.com/engineering/test',
    title: 'A Very Long Anthropic Engineering Article Title That Should Be Truncated By Default',
    summary: 'Summary text.',
    publishedAt: '2026-07-01T00:00:00.000Z',
    imageUrl: null,
    isSaved: false,
    ...overrides,
  }
}

describe('AnthropicArticleRow', () => {
  beforeEach(() => {
    cleanup()
    useStore.setState({
      importAnthropicArticle: vi.fn(),
      cancelAnthropicImport: vi.fn(),
      openAnthropicReader: vi.fn(),
    } as any)
  })

  it('does not render the old click-import/read hint', () => {
    render(<AnthropicArticleRow article={article()} theme="academic" />)
    expect(screen.queryByText('点击导入')).not.toBeInTheDocument()
    expect(screen.queryByText('阅读')).not.toBeInTheDocument()
  })

  it('truncates title by default and removes line-clamp on hover', () => {
    render(<AnthropicArticleRow article={article()} theme="academic" />)
    const title = screen.getByTestId('anthropic-article-title')
    expect(title).toHaveClass('line-clamp-1')
    fireEvent.mouseEnter(screen.getByTestId('anthropic-article-row'))
    expect(title).not.toHaveClass('line-clamp-1')
  })

  it('shows saved badge when isSaved is true', () => {
    render(<AnthropicArticleRow article={article({ isSaved: true, filePath: '/tmp/x.md' })} theme="academic" />)
    expect(screen.getByText('已保存')).toBeInTheDocument()
    expect(screen.queryByText('导入阅读')).not.toBeInTheDocument()
  })
})
```

- [ ] **Step 3: 运行测试**

```bash
npx vitest run tests/anthropic-article-row.test.tsx
```

Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/components/anthropic/AnthropicArticleRow.tsx tests/anthropic-article-row.test.tsx
git commit -m "feat(anthropic): hover-expand title and remove redundant hint text"
```

---

## Task 4：移除 AnthropicArticleReader 的 sidebarToggle

**Files:**
- Modify: `src/components/anthropic/AnthropicArticleReader.tsx`

> 列表切换按钮现在统一在列表标题栏，阅读器顶部不再需要这个 slot。

- [ ] **Step 1: 修改 Props 和渲染**

```tsx
interface Props {
  filePath: string
  onClose?: () => void
  theme?: BriefingTheme
}
```

函数签名：

```tsx
export function AnthropicArticleReader({ filePath, onClose, theme = 'academic' }: Props) {
```

删除 sticky header 中的 `{sidebarToggle}` 渲染。

- [ ] **Step 2: 更新 AnthropicBlogPanel 调用处**

这一步会在 Task 5 里一起完成（不再传 `sidebarToggle` prop）。

- [ ] **Step 3: Commit（可与 Task 5 合并）**

如果单独做：

```bash
git add src/components/anthropic/AnthropicArticleReader.tsx
git commit -m "refactor(anthropic): remove sidebarToggle from article reader"
```

---

## Task 5：重写 AnthropicBlogPanel

**Files:**
- Modify: `src/components/anthropic/AnthropicBlogPanel.tsx`
- Test: `tests/anthropic-blog-panel.test.tsx`

> 这是本次改动最大的文件。下面给出完整目标代码，直接替换原文件即可。

- [ ] **Step 1: 替换文件内容**

```tsx
import { useEffect, useMemo, useState } from 'react'
import { useStore } from '@/store'
import { AnthropicArticleRow } from './AnthropicArticleRow'
import { AnthropicArticleReader } from './AnthropicArticleReader'
import { AnthropicErrorMessage } from './AnthropicErrorMessage'
import { findNewArticleUrls } from '@/lib/anthropic-articles'
import type { AnthropicArticleMeta, AnthropicError, BriefingTheme } from '@shared/index'

interface Props {
  theme?: BriefingTheme
}

export function AnthropicBlogPanel({ theme = 'academic' }: Props) {
  const isAcademic = theme !== 'newspaper'
  const themeClasses = isAcademic
    ? {
        panelBg: 'bg-transparent',
        sidebarBg: 'bg-ink/30',
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

  const { articles, loading, error, lastFetchedAt } = useStore((s) => s.anthropicBlogCache)
  const readerFilePath = useStore((s) => s.anthropicReaderFilePath)
  const discover = useStore((s) => s.discoverAnthropicArticles)
  const mergeArticles = useStore((s) => s.mergeAnthropicArticles)
  const closeReader = useStore((s) => s.closeAnthropicReader)

  const [query, setQuery] = useState('')
  const [listVisible, setListVisible] = useState(true)
  const [newArticleCount, setNewArticleCount] = useState(0)
  const [pendingArticles, setPendingArticles] = useState<AnthropicArticleMeta[]>([])
  const [pendingLastFetchedAt, setPendingLastFetchedAt] = useState<string | null>(null)
  const [checkError, setCheckError] = useState<AnthropicError | null>(null)
  const [checkKey, setCheckKey] = useState(0)

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return articles
    return articles.filter(
      (a) =>
        a.title?.toLowerCase().includes(q) ||
        (a.summary ?? '').toLowerCase().includes(q)
    )
  }, [articles, query])

  useEffect(() => {
    let cancelled = false
    const check = async () => {
      if (loading) return
      const result = await discover({ commit: false })
      if (cancelled) return
      if (result.ok) {
        const newUrls = findNewArticleUrls(articles, result.articles)
        if (newUrls.length > 0) {
          setNewArticleCount(newUrls.length)
          setPendingArticles(result.articles.filter((a) => newUrls.includes(a.url)))
          setPendingLastFetchedAt(result.lastFetchedAt)
        }
      } else {
        setCheckError(result.error)
      }
    }
    check()
    return () => {
      cancelled = true
    }
  }, [checkKey])

  const handleRefresh = async () => {
    if (pendingArticles.length > 0 && pendingLastFetchedAt) {
      mergeArticles(pendingArticles, pendingLastFetchedAt)
      setNewArticleCount(0)
      setPendingArticles([])
      setPendingLastFetchedAt(null)
    } else {
      await discover()
      setNewArticleCount(0)
    }
  }

  const handleRetryCheck = () => {
    setCheckError(null)
    setCheckKey((k) => k + 1)
  }

  const hideButton = (
    <button
      type="button"
      data-testid="anthropic-list-hide-button"
      onClick={() => setListVisible(false)}
      title="隐藏列表"
      className={`p-1 rounded transition-colors ${
        isAcademic
          ? 'text-parchment/60 hover:text-parchment hover:bg-parchment/10'
          : 'text-[#6b5d52] hover:text-[#1a1a1a] hover:bg-black/5'
      }`}
    >
      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M11 17l-5-5 5-5M18 17l-5-5 5-5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </button>
  )

  const expandHandle = (
    <button
      type="button"
      data-testid="anthropic-list-expand-handle"
      onClick={() => setListVisible(true)}
      title="展开列表"
      className={`w-2 h-full shrink-0 transition-colors relative ${
        isAcademic
          ? 'bg-ink/30 hover:bg-ember/30 border-r border-slate/30'
          : 'bg-[#e8e4de] hover:bg-[#d9d4cb] border-r border-[#c9c3b8]'
      }`}
    >
      {newArticleCount > 0 && (
        <span
          className={`absolute top-3 left-1/2 -translate-x-1/2 min-w-[18px] px-1 py-0.5 rounded-full text-[10px] text-center ${
            isAcademic ? 'bg-ember text-white' : 'bg-[#1a1a1a] text-white'
          }`}
        >
          {newArticleCount}
        </span>
      )}
    </button>
  )

  return (
    <div
      data-testid="anthropic-blog-panel"
      className={`relative flex-1 flex min-w-0 overflow-hidden z-[5] ${themeClasses.panelBg}`}
    >
      <div
        className={`flex flex-col ${themeClasses.sidebarBg} transition-all duration-200 ${
          listVisible
            ? `w-80 min-w-[20rem] opacity-100 border-r ${themeClasses.border}`
            : 'w-0 opacity-0 overflow-hidden border-r-0'
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
          <div className="flex items-center gap-1">
            {checkError && (
              <button
                type="button"
                data-testid="anthropic-list-check-error"
                onClick={handleRetryCheck}
                title={checkError.message || '检测失败，点击重试'}
                className={`p-1 rounded transition-colors ${
                  isAcademic
                    ? 'text-wine hover:bg-wine/10'
                    : 'text-[#8a3a3a] hover:bg-[#8a3a3a]/10'
                }`}
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              </button>
            )}
            {hideButton}
          </div>
        </div>

        {listVisible && newArticleCount > 0 && (
          <div className={`px-4 py-2 border-b ${themeClasses.border} shrink-0`}>
            <button
              type="button"
              data-testid="anthropic-new-articles-prompt"
              onClick={handleRefresh}
              disabled={loading}
              className={`w-full text-left text-xs px-3 py-2 rounded flex items-center justify-between disabled:opacity-60 ${themeClasses.button}`}
            >
              <span>发现 {newArticleCount} 篇新文章</span>
              <span>刷新 →</span>
            </button>
          </div>
        )}

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
            <AnthropicErrorMessage error={error} onRetry={() => discover()} theme={theme} />
          )}

          {!loading && !error && filtered.length === 0 && (
            <div className={`text-center py-12 text-sm ${themeClasses.muted}`}>
              {articles.length === 0 ? (
                <p>暂无文章，正在自动检测新文章…</p>
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

      {!listVisible && expandHandle}

      <div className="flex-1 min-w-0 flex flex-col">
        {readerFilePath ? (
          <AnthropicArticleReader filePath={readerFilePath} onClose={closeReader} theme={theme} />
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

- [ ] **Step 2: 写 AnthropicBlogPanel 组件测试**

```tsx
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
  },
}))

vi.mock('@/lib/paintings', () => ({
  manifest: [],
  pickRandom: vi.fn(() => null),
}))

import { useStore } from '@/store'
import { AnthropicBlogPanel } from '@/components/anthropic/AnthropicBlogPanel'

function article(url: string, title: string): AnthropicArticleMeta {
  return { url, title, summary: null, publishedAt: null, imageUrl: null }
}

describe('AnthropicBlogPanel', () => {
  beforeEach(() => {
    cleanup()
    useStore.setState({
      anthropicBlogCache: {
        lastFetchedAt: null,
        articles: [article('old-1', 'Old Article')],
        loading: false,
        error: null,
      },
      anthropicReaderFilePath: null,
      discoverAnthropicArticles: vi.fn(),
      mergeAnthropicArticles: vi.fn(),
      closeAnthropicReader: vi.fn(),
    } as any)
  })

  it('hides list and shows expand handle when hide button clicked', () => {
    render(<AnthropicBlogPanel theme="academic" />)
    fireEvent.click(screen.getByTestId('anthropic-list-hide-button'))
    expect(screen.queryByPlaceholderText('搜索标题或摘要…')).not.toBeInTheDocument()
    expect(screen.getByTestId('anthropic-list-expand-handle')).toBeInTheDocument()
  })

  it('expands list when handle clicked', () => {
    render(<AnthropicBlogPanel theme="academic" />)
    fireEvent.click(screen.getByTestId('anthropic-list-hide-button'))
    fireEvent.click(screen.getByTestId('anthropic-list-expand-handle'))
    expect(screen.getByPlaceholderText('搜索标题或摘要…')).toBeInTheDocument()
  })

  it('shows new articles prompt after auto-detect finds new articles', async () => {
    const discover = vi.fn().mockResolvedValue({
      ok: true,
      lastFetchedAt: new Date().toISOString(),
      articles: [
        article('new-1', 'New Article'),
        article('old-1', 'Old Article'),
      ],
    })
    const merge = vi.fn()
    useStore.setState({ discoverAnthropicArticles: discover, mergeAnthropicArticles: merge } as any)

    render(<AnthropicBlogPanel theme="academic" />)

    await waitFor(() => {
      expect(screen.getByTestId('anthropic-new-articles-prompt')).toBeInTheDocument()
    })
    expect(screen.getByText(/发现 1 篇新文章/)).toBeInTheDocument()
  })

  it('clicking refresh prompt merges new articles', async () => {
    const lastFetchedAt = new Date().toISOString()
    const discover = vi.fn().mockResolvedValue({
      ok: true,
      lastFetchedAt,
      articles: [article('new-1', 'New Article'), article('old-1', 'Old Article')],
    })
    const merge = vi.fn()
    useStore.setState({ discoverAnthropicArticles: discover, mergeAnthropicArticles: merge } as any)

    render(<AnthropicBlogPanel theme="academic" />)
    await waitFor(() => screen.getByTestId('anthropic-new-articles-prompt'))
    fireEvent.click(screen.getByTestId('anthropic-new-articles-prompt'))

    expect(merge).toHaveBeenCalledWith([article('new-1', 'New Article')], lastFetchedAt)
  })
})
```

- [ ] **Step 3: 运行测试**

```bash
npx vitest run tests/anthropic-blog-panel.test.tsx
```

Expected: PASS（可能需要根据实际 DOM 微调选择器）。

- [ ] **Step 4: Commit**

```bash
git add src/components/anthropic/AnthropicBlogPanel.tsx src/components/anthropic/AnthropicArticleReader.tsx tests/anthropic-blog-panel.test.tsx
git commit -m "feat(anthropic): collapsible list, new-article prompt, and auto-detect"
```

---

## Task 6：E2E 覆盖（建议）

**Files:**
- Create: `e2e/specs/anthropic-blog-ui.spec.ts`

> 复用现有 E2E fixture 和 mock 能力。由于现有 fixture 的导航/启动方式可能在其他窗口有更新，这里只列出必须覆盖的场景，不硬编码启动代码。

- [ ] **Step 1: 参考现有 briefing E2E 新增 spec**

打开 `e2e/specs/briefing-ux-optimization.spec.ts`（或当前 briefing 相关 spec），复用其 fixture 和进入 briefing 的导航方式，新增 `anthropic-blog-ui.spec.ts`。

必须覆盖两个场景：

1. **自动检测新文章并显示刷新提示**
   - 进入 briefing 页面并切换到 Anthropic 来源。
   - 让 discover 走 mock，返回的结果包含至少一篇缓存里没有的新文章。
   - 断言 `[data-testid="anthropic-new-articles-prompt"]` 可见，且文案包含“篇新文章”。
   - 点击提示条，断言提示条消失。

2. **列表收起与展开**
   - 在 Anthropic 来源下点击 `[data-testid="anthropic-list-hide-button"]`。
   - 断言 `[data-testid="anthropic-list-expand-handle"]` 可见。
   - 点击 handle，断言 `[data-testid="anthropic-list-hide-button"]` 重新可见。

- [ ] **Step 2: 运行并标记风险**

```bash
npx playwright test e2e/specs/anthropic-blog-ui.spec.ts
```

Expected: PASS。若外部 Chromium 抓取导致不稳定，在 `test('...', { tag: '@unstable' }, ...)` 中标记。

- [ ] **Step 3: Commit**

```bash
git add e2e/specs/anthropic-blog-ui.spec.ts
git commit -m "test(e2e): anthropic blog collapsible list and new-article prompt"
```

---

## Task 7：回归验证

- [ ] **Step 1: 类型检查**

```bash
npx tsc --noEmit
```

Expected: 无类型错误。

- [ ] **Step 2: 运行相关测试**

```bash
npx vitest run tests/anthropic-articles.test.ts tests/anthropic-article-row.test.tsx tests/anthropic-blog-panel.test.tsx tests/anthropic-reader-theme.test.tsx tests/briefing-sidebar.test.tsx
```

Expected: 全部 PASS。

- [ ] **Step 3: lint/format（如果项目有配置）**

```bash
npm run lint 2>/dev/null || echo "no lint script"
```

- [ ] **Step 4: 最终 commit（如只改了代码没提交）**

```bash
git status
# 按需 add/commit
```

---

## 依赖与顺序

1. Task 1 必须最先完成（helper + 测试）。
2. Task 2 依赖 Task 1（store 使用 `mergeNewArticles`）。
3. Task 3 和 Task 4 互不依赖，可并行。
4. Task 5 依赖 Task 2、Task 3、Task 4。
5. Task 6（E2E）依赖 Task 5。
6. Task 7 最后做回归验证。

---

## 风险与回退

- **新文章检测误报**：如果 Anthropic 列表页 URL 带参数或重定向，同一篇文章 URL 可能不同。helper 按精确字符串匹配；若出现误报，可再引入 URL normalize。
- **自动 discover 性能**：进入 Anthropic 来源会启动 Chromium。若用户频繁切换来源，可能重复启动。已通过 `loading` 守卫和组件卸载 `cancelled` 标志缓解。
- **垂直把手可发现性**：若测试反馈用户找不到展开入口，再升级为 Task 2 的“把手 + 顶部按钮”方案。
