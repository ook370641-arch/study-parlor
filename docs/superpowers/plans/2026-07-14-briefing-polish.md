# 夜航简报五项小升级 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 折叠列箭头居中、彩色边框替代文字标签 + 导入shimmer动画、移除摘要、纯本地文本备注系统。极乐迪斯科风格。

**Architecture:** 修改现有组件 (BriefingListColumn, BriefingSourceSidebar, AnthropicBlogPanel, AnthropicArticleRow, AnthropicArticleReader)，新增 ArticleAnnotations 组件和 annotations IPC 处理器。备注系统使用 DOM 操作注入标记 + React state 管理浮卡，存储在独立 `.annotations.md` 文件。

**Tech Stack:** Electron 30 + React 18 + TypeScript + Tailwind CSS + Vitest

---

### Task 1: Add ArticleAnnotation type and IPC API declarations

**Files:**
- Modify: `src/types/index.ts`

- [ ] **Step 1: Add ArticleAnnotation type and IPC method declarations**

Add the `ArticleAnnotation` interface after the existing `ArticleAssistantErrorCode` type (around line 128):

```ts
export interface ArticleAnnotation {
  id: string
  selectedText: string
  note: string
  paragraphIndex: number
  createdAt: string
  updatedAt: string
}
```

Add these two methods to the `IpcApi` interface, after `anthropicCancelImport` (around line 510):

```ts
// Annotations
annotationsRead: (articlePath: string) => Promise<ArticleAnnotation[]>
annotationsWrite: (articlePath: string, annotations: ArticleAnnotation[]) => Promise<void>
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: PASS (types-only change, should compile cleanly)

- [ ] **Step 3: Commit**

```bash
git add src/types/index.ts
git commit -m "feat(types): add ArticleAnnotation type and annotations IPC declarations"
```

---

### Task 2: Create annotations IPC handler

**Files:**
- Create: `electron/ipc/annotations.ts`

- [ ] **Step 1: Create the IPC handler file**

```ts
import fs from 'node:fs'
import path from 'node:path'
import { ipcMain } from 'electron'
import { parseFrontmatter, serializeFrontmatter } from '../lib/frontmatter'
import type { AppConfig } from '../env'
import type { ArticleAnnotation } from '@shared/index'

function annotationsPathFor(articlePath: string): string {
  const parsed = path.parse(articlePath)
  return path.join(parsed.dir, `${parsed.name}.annotations.md`)
}

function assertInsideLibrary(targetPath: string, libraryPath: string): void {
  const root = path.resolve(libraryPath)
  const resolved = path.resolve(targetPath)
  if (resolved !== root && !resolved.startsWith(root + path.sep)) {
    throw new Error(`Refusing to write outside library: ${resolved}`)
  }
}

function serializeAnnotations(annotations: ArticleAnnotation[]): string {
  const sections = annotations.map((a) => {
    return [
      `## ${a.id}`,
      '',
      `**选中文字：** ${a.selectedText}`,
      `**备注：** ${a.note}`,
      `**段落：** §${a.paragraphIndex}`,
      `**创建：** ${a.createdAt}`,
      `**更新：** ${a.updatedAt}`,
    ].join('\n')
  })
  return sections.join('\n\n---\n\n')
}

function parseAnnotationsBody(body: string): ArticleAnnotation[] {
  const sections = body.split(/^## /m).slice(1)
  return sections.map((section) => {
    const lines = section.split('\n')
    const id = lines[0]?.trim() ?? ''
    let selectedText = ''
    let note = ''
    let paragraphIndex = 1
    let createdAt = ''
    let updatedAt = ''

    for (const line of lines) {
      if (line.startsWith('**选中文字：**')) {
        selectedText = line.replace('**选中文字：**', '').trim()
      } else if (line.startsWith('**备注：**')) {
        note = line.replace('**备注：**', '').trim()
      } else if (line.startsWith('**段落：**')) {
        const raw = line.replace('**段落：**', '').trim().replace('§', '')
        paragraphIndex = parseInt(raw, 10) || 1
      } else if (line.startsWith('**创建：**')) {
        createdAt = line.replace('**创建：**', '').trim()
      } else if (line.startsWith('**更新：**')) {
        updatedAt = line.replace('**更新：**', '').trim()
      }
    }

    return {
      id,
      selectedText,
      note,
      paragraphIndex,
      createdAt,
      updatedAt: updatedAt || createdAt,
    }
  }).filter((a) => a.id && a.selectedText)
}

export function registerAnnotationsIpc(cfg: AppConfig) {
  ipcMain.handle('annotations:read', async (_event, articlePath: string) => {
    const annoPath = annotationsPathFor(articlePath)
    if (!fs.existsSync(annoPath)) return []

    try {
      const raw = fs.readFileSync(annoPath, 'utf8')
      const { body } = parseFrontmatter(raw, { filename: path.basename(annoPath) })
      return parseAnnotationsBody(body)
    } catch (err) {
      console.error('[annotations] read error:', err)
      return []
    }
  })

  ipcMain.handle('annotations:write', async (_event, articlePath: string, annotations: ArticleAnnotation[]) => {
    const annoPath = annotationsPathFor(articlePath)
    assertInsideLibrary(annoPath, cfg.libraryPath)

    const now = new Date().toISOString()
    let createdAt = now
    if (fs.existsSync(annoPath)) {
      try {
        const existing = parseFrontmatter(fs.readFileSync(annoPath, 'utf8'), {
          filename: path.basename(annoPath),
        })
        createdAt = (existing.frontmatter as Record<string, unknown>).created_at as string ?? now
      } catch {
        // use now
      }
    }

    const fm = {
      title: 'Article Annotations',
      type: 'article-assistant' as const,
      created: createdAt,
      created_at: createdAt,
      updated_at: now,
      parent_path: articlePath,
      tags: [] as string[],
    }

    const body = serializeAnnotations(annotations)

    try {
      fs.mkdirSync(path.dirname(annoPath), { recursive: true })
      // Atomic write: temp file then rename
      const tmpPath = annoPath + '.tmp'
      fs.writeFileSync(tmpPath, serializeFrontmatter('article-assistant', fm, body), 'utf8')
      fs.renameSync(tmpPath, annoPath)
    } catch (err) {
      console.error('[annotations] write error:', err)
      throw new Error(err instanceof Error ? err.message : String(err))
    }
  })
}
```

- [ ] **Step 2: Register the IPC handler in electron/ipc/index.ts**

Add import:
```ts
import { registerAnnotationsIpc } from './annotations'
```

Add registration call inside `registerAllIpc`, after `registerArticleAssistantIpc(cfg)`:
```ts
registerAnnotationsIpc(cfg)
```

- [ ] **Step 3: Expose IPC methods in preload and renderer facade**

In `electron/preload.ts`, add to the `api` object after `anthropicCancelImport`:
```ts
annotationsRead: (articlePath) => ipcRenderer.invoke('annotations:read', articlePath),
annotationsWrite: (articlePath, annotations) => ipcRenderer.invoke('annotations:write', articlePath, annotations),
```

In `src/lib/ipc.ts`, add to the `ipc` object after `anthropicCancelImport`:
```ts
get annotationsRead() { return ensure().annotationsRead },
get annotationsWrite() { return ensure().annotationsWrite },
```

- [ ] **Step 4: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add electron/ipc/annotations.ts electron/ipc/index.ts electron/preload.ts src/lib/ipc.ts
git commit -m "feat(annotations): add annotations:read/write IPC handlers"
```

---

### Task 3: Center toggle arrow in BriefingListColumn and BriefingSourceSidebar

**Files:**
- Modify: `src/components/BriefingListColumn.tsx`
- Modify: `src/components/BriefingSourceSidebar.tsx`

- [ ] **Step 1: Center arrow in BriefingListColumn**

Change the header div from fixed `justify-between` to conditional centering when collapsed:

```tsx
// Replace line 38:
// <div className={`flex items-center justify-between px-3 py-4 ${themeClasses.headerBorder}`}>
// With:
<div className={`flex items-center ${collapsed ? 'justify-center' : 'justify-between'} px-3 py-4 ${themeClasses.headerBorder}`}>
```

Also, always render children (remove `!collapsed &&` guard on line 49):

```tsx
// Replace line 49:
// {!collapsed && <div className="flex-1 min-h-0 overflow-y-auto">{children}</div>}
// With:
<div className="flex-1 min-h-0 overflow-y-auto">{children}</div>
```

- [ ] **Step 2: Center arrow in BriefingSourceSidebar**

Same `justify-between` → conditional fix on line 121:

```tsx
// Replace:
// <div className={`flex items-center justify-between px-3 py-4 ${themeClasses.headerBorder}`}>
// With:
<div className={`flex items-center ${collapsed ? 'justify-center' : 'justify-between'} px-3 py-4 ${themeClasses.headerBorder}`}>
```

- [ ] **Step 3: Run existing tests to verify no regressions**

Run: `npx vitest run tests/briefing-sidebar.test.tsx tests/anthropic-blog-panel.test.tsx`
Expected: All passing

Note: the `BriefingListColumn` test expects the toggle button to exist; it will still exist, just centered when collapsed.

- [ ] **Step 4: Commit**

```bash
git add src/components/BriefingListColumn.tsx src/components/BriefingSourceSidebar.tsx
git commit -m "fix(briefing): center toggle arrow horizontally in collapsed sidebar/list columns"
```

---

### Task 4: Move blog thumbnails into collapsed BriefingListColumn

**Files:**
- Modify: `src/components/anthropic/AnthropicBlogPanel.tsx`

- [ ] **Step 1: Remove separate thumbnail rail, conditionally render children**

Replace the entire `BriefingListColumn` block + separate rail (lines 132–263) with a single `BriefingListColumn` that renders different children based on `listCollapsed`:

```tsx
<BriefingListColumn
  collapsed={listCollapsed}
  onToggle={() => setListCollapsed((c) => !c)}
  theme={theme}
  width={80}
  title="Anthropic Engineering"
>
  {listCollapsed ? (
    <div className="flex-1 flex flex-col items-center py-3 gap-3 overflow-y-auto">
      {newArticleCount > 0 && (
        <span
          data-testid="anthropic-collapsed-new-badge"
          className={`min-w-[18px] px-1 py-0.5 rounded-full text-[10px] text-center ${
            isAcademic ? 'bg-ember text-white' : 'bg-[#1a1a1a] text-white'
          }`}
        >
          {newArticleCount}
        </span>
      )}
      {filtered.slice(0, 10).map((article) => (
        <button
          key={article.url}
          type="button"
          data-testid="anthropic-list-rail-thumb"
          onClick={() => openOrImportArticle(article)}
          title={article.title}
          className="shrink-0 rounded overflow-hidden focus:outline-none focus:ring-2 focus:ring-ember/50"
        >
          {article.imageUrl ? (
            <img
              src={article.imageUrl}
              alt=""
              className="w-10 h-10 object-cover"
              loading="lazy"
            />
          ) : (
            <div
              className={`w-10 h-10 flex items-center justify-center text-sm font-serif ${themeClasses.skeleton} ${themeClasses.muted}`}
            >
              A
            </div>
          )}
        </button>
      ))}
    </div>
  ) : (
    <div className="flex flex-col h-full">
      {checkError && (
        <div className={`px-4 py-2 border-b ${themeClasses.border} shrink-0`}>
          <button
            type="button"
            data-testid="anthropic-list-check-error"
            onClick={handleRetryCheck}
            title={checkError.message || '检测失败，点击重试'}
            className={`flex items-center gap-2 text-xs rounded transition-colors ${
              isAcademic
                ? 'text-wine hover:bg-wine/10'
                : 'text-[#8a3a3a] hover:bg-[#8a3a3a]/10'
            }`}
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <span>{checkError.message || '检测失败，点击重试'}</span>
          </button>
        </div>
      )}

      {lastFetchedAt && (
        <p className={`px-4 pt-3 text-[10px] ${themeClasses.muted}`}>
          更新于 {new Date(lastFetchedAt).toLocaleString('zh-CN')}
        </p>
      )}

      {newArticleCount > 0 && (
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

      <div className="flex-1 min-h-0 overflow-y-auto px-4 py-3">
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
              <p>没有匹配"{query}"的文章。</p>
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
  )}
</BriefingListColumn>
```

Delete the separate thumb rail block entirely — the old `{listCollapsed && (...)}` block (lines 224–263).

- [ ] **Step 2: Run existing tests**

Run: `npx vitest run tests/anthropic-blog-panel.test.tsx`
Expected: The test `toggles collapsed rail and shows thumbnails` should still pass — thumbnails now render inside the collapsed `BriefingListColumn` instead of a separate rail.

- [ ] **Step 3: Commit**

```bash
git add src/components/anthropic/AnthropicBlogPanel.tsx
git commit -m "fix(anthropic): move collapsed thumbnails inside BriefingListColumn, remove separate rail"
```

---

### Task 5: Replace text badges with colored left borders + shimmer import animation

**Files:**
- Modify: `src/components/anthropic/AnthropicArticleRow.tsx`
- Modify: `src/components/anthropic/AnthropicBlogPanel.tsx` (add keyframe styles)

- [ ] **Step 1: Add shimmer/borderPulse keyframes in AnthropicBlogPanel**

In `AnthropicBlogPanel`, add a `<style>` tag inside the top-level wrapper div (before the `BriefingListColumn`), with:

```css
@keyframes shimmer {
  0% { left: -60%; }
  100% { left: 100%; }
}
@keyframes borderPulse {
  0%, 100% { border-left-color: #d97757; }
  50% { border-left-color: rgba(217, 119, 87, 0.25); }
}
@keyframes borderPulseNewspaper {
  0%, 100% { border-left-color: #1a1a1a; }
  50% { border-left-color: rgba(26, 26, 26, 0.25); }
}
```

Insert this at the top of the return JSX, inside the outer `<div>`:

```tsx
<style>{`
  @keyframes shimmer { 0% { left: -60%; } 100% { left: 100%; } }
  @keyframes borderPulse { 0%, 100% { border-left-color: #d97757; } 50% { border-left-color: rgba(217, 119, 87, 0.25); } }
  @keyframes borderPulseNewspaper { 0%, 100% { border-left-color: #1a1a1a; } 50% { border-left-color: rgba(26, 26, 26, 0.25); } }
`}</style>
```

- [ ] **Step 2: Rewrite AnthropicArticleRow**

Replace the entire component with:

```tsx
import { useState } from 'react'
import { useStore } from '@/store'
import { ipc } from '@/lib/ipc'
import type { AnthropicArticleMeta, BriefingTheme } from '@shared/index'

interface Props {
  article: AnthropicArticleMeta
  theme?: BriefingTheme
}

function formatDate(iso: string | null | undefined) {
  if (!iso) return '未知日期'
  try {
    return new Date(iso).toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric' })
  } catch {
    return iso
  }
}

export function AnthropicArticleRow({ article, theme = 'academic' }: Props) {
  const isAcademic = theme !== 'newspaper'
  const importArticle = useStore((s) => s.importAnthropicArticle)
  const cancelImport = useStore((s) => s.cancelAnthropicImport)
  const openReader = useStore((s) => s.openAnthropicReader)
  const [importing, setImporting] = useState(false)
  const [hovered, setHovered] = useState(false)

  const handleClick = async () => {
    if (importing) {
      // Clicking during import cancels it
      cancelImport()
      setImporting(false)
      return
    }

    if (article.isSaved && article.filePath) {
      try {
        await ipc.readMd(article.filePath)
        await openReader(article.filePath)
        return
      } catch {
        // fall through to re-import
      }
    }

    setImporting(true)
    try {
      await importArticle(article.url)
    } finally {
      setImporting(false)
    }
  }

  // --- Theme-dependent classes ---
  const bgClass = isAcademic ? 'bg-ink/30' : 'bg-white'
  const hoverBorder = isAcademic ? 'hover:border-ember/50' : 'hover:border-[#1a1a1a]/50'
  const titleColor = isAcademic ? 'text-parchment' : 'text-[#1a1a1a]'
  const mutedText = isAcademic ? 'text-parchment/50' : 'text-[#6b5d52]'
  const placeholderBg = isAcademic ? 'bg-parchment/10' : 'bg-[#e8e4de]'
  const placeholderText = isAcademic ? 'text-parchment/40' : 'text-[#6b5d52]/60'
  const titleHover = isAcademic ? 'group-hover:text-ember' : 'group-hover:text-[#1a1a1a]'

  // Left border by state
  let borderClass: string
  let borderStyle: React.CSSProperties = {}
  if (importing) {
    if (isAcademic) {
      borderStyle = { animation: 'borderPulse 1s ease-in-out infinite' }
      borderClass = 'border-l-[3px] border-l-ember'
    } else {
      borderStyle = { animation: 'borderPulseNewspaper 1s ease-in-out infinite' }
      borderClass = 'border-l-[3px] border-l-[#1a1a1a]'
    }
  } else if (article.isSaved) {
    borderClass = isAcademic ? 'border-l-[3px] border-l-ember' : 'border-l-[3px] border-l-[#1a1a1a]'
  } else {
    borderClass = isAcademic
      ? 'border-l-[3px] border-l-[rgba(232,213,183,0.12)]'
      : 'border-l-[3px] border-l-[#c9c3b8]/30'
  }

  // Spinner SVG for importing state
  const Spinner = () => (
    <svg
      className="inline-flex ml-1.5 animate-spin align-middle"
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      style={{ opacity: 0.8 }}
    >
      <circle cx="12" cy="12" r="10" strokeOpacity="0.25" />
      <path d="M12 2a10 10 0 0 1 10 10" strokeLinecap="round" />
    </svg>
  )

  return (
    <button
      data-testid="anthropic-article-row"
      onClick={handleClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      disabled={false}
      className={`w-full text-left rounded border p-4 transition-colors group relative overflow-hidden ${borderClass} ${bgClass} ${hoverBorder}`}
      style={borderStyle}
    >
      {/* Shimmer sweep line during import */}
      {importing && (
        <div
          className="absolute top-0 h-[2px] pointer-events-none z-10"
          style={{
            background: isAcademic
              ? 'linear-gradient(90deg, transparent, #d97757, transparent)'
              : 'linear-gradient(90deg, transparent, #1a1a1a, transparent)',
            width: '60%',
            animation: 'shimmer 1.2s ease-in-out infinite',
          }}
        />
      )}

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
            className={`text-base font-serif transition-colors ${
              hovered && !importing ? '' : 'line-clamp-1'
            } ${titleColor} ${titleHover}`}
          >
            {article.title}
            {importing && <Spinner />}
          </h3>
          <p className={`text-xs mt-1 ${mutedText}`}>
            {importing ? '导入中…' : formatDate(article.publishedAt)}
          </p>
        </div>
      </div>
    </button>
  )
}
```

- [ ] **Step 3: Update existing test for removed badges**

Update `tests/anthropic-article-row.test.tsx`. The test "shows saved badge when isSaved is true" needs to change to check border class instead of text:

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

  it('does not render saved/unsaved text badges', () => {
    render(<AnthropicArticleRow article={article({ isSaved: true, filePath: '/tmp/x.md' })} theme="academic" />)
    expect(screen.queryByText('已保存')).not.toBeInTheDocument()
    expect(screen.queryByText('导入阅读')).not.toBeInTheDocument()
  })

  it('applies ember left border when article is saved', () => {
    render(<AnthropicArticleRow article={article({ isSaved: true, filePath: '/tmp/x.md' })} theme="academic" />)
    const row = screen.getByTestId('anthropic-article-row')
    expect(row).toHaveClass('border-l-ember')
  })

  it('applies subtle left border when article is unsaved', () => {
    render(<AnthropicArticleRow article={article({ isSaved: false })} theme="academic" />)
    const row = screen.getByTestId('anthropic-article-row')
    expect(row.className).toContain('border-l-[rgba(232,213,183,0.12)]')
  })

  it('does not render article summary', () => {
    render(<AnthropicArticleRow article={article({ summary: 'A great article about AI' })} theme="academic" />)
    expect(screen.queryByText('A great article about AI')).not.toBeInTheDocument()
  })

  it('truncates title by default and removes line-clamp on hover', () => {
    render(<AnthropicArticleRow article={article()} theme="academic" />)
    const title = screen.getByTestId('anthropic-article-title')
    expect(title).toHaveClass('line-clamp-1')
    fireEvent.mouseEnter(screen.getByTestId('anthropic-article-row'))
    expect(title).not.toHaveClass('line-clamp-1')
  })
})
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run tests/anthropic-article-row.test.tsx`
Expected: All 6 tests pass

- [ ] **Step 5: Commit**

```bash
git add src/components/anthropic/AnthropicArticleRow.tsx src/components/anthropic/AnthropicBlogPanel.tsx tests/anthropic-article-row.test.tsx
git commit -m "feat(anthropic): replace text badges with colored left borders, add shimmer import animation, remove summary"
```

---

### Task 6: Create ArticleAnnotations component

**Files:**
- Create: `src/components/article-assistant/ArticleAnnotations.tsx`

- [ ] **Step 1: Create the component**

This is the largest single file. The component handles: loading annotations, scanning DOM to insert markers, text selection → ghost pen, ghost pen click → create annotation + open card, pen click → open card for editing.

```tsx
import { useEffect, useRef, useState, useCallback } from 'react'
import { ipc } from '@/lib/ipc'
import type { ArticleAnnotation, BriefingTheme } from '@shared/index'

interface Props {
  articlePath: string
  articleRef: React.RefObject<HTMLElement | null>
  theme?: BriefingTheme
}

interface GhostData {
  text: string
  paraIndex: number
  left: number
  top: number
}

export function ArticleAnnotations({ articlePath, articleRef, theme = 'academic' }: Props) {
  const isAcademic = theme !== 'newspaper'
  const [annotations, setAnnotations] = useState<ArticleAnnotation[]>([])
  const [openAnnoId, setOpenAnnoId] = useState<string | null>(null)
  const [ghost, setGhost] = useState<GhostData | null>(null)
  const [cardPos, setCardPos] = useState<{ left: number; top: number } | null>(null)
  const [cardAnchorEl, setCardAnchorEl] = useState<HTMLElement | null>(null)
  const ghostRef = useRef<HTMLDivElement | null>(null)
  const markerSpansRef = useRef<Map<string, HTMLElement>>(new Map())
  const nextIdRef = useRef(1)
  // Refs to avoid stale closure issues in event handlers
  const annotationsRef = useRef(annotations)
  annotationsRef.current = annotations
  const openAnnoIdRef = useRef(openAnnoId)
  openAnnoIdRef.current = openAnnoId
  const cardAnchorElRef = useRef(cardAnchorEl)
  cardAnchorElRef.current = cardAnchorEl

  // --- Load annotations ---
  useEffect(() => {
    ipc.annotationsRead(articlePath).then((list) => {
      setAnnotations(list)
      const maxId = list.reduce((max, a) => {
        const num = parseInt(a.id.replace('a', ''), 10)
        return num > max ? num : max
      }, 0)
      nextIdRef.current = maxId + 1
    })
  }, [articlePath])

  // --- Inject markers into DOM ---
  const applyMarkers = useCallback(() => {
    const container = articleRef.current
    if (!container || annotations.length === 0) return

    // Clean up old markers
    markerSpansRef.current.forEach((el) => {
      const parent = el.parentNode
      if (parent) {
        parent.replaceChild(document.createTextNode(el.getAttribute('data-anno-text') ?? ''), el)
      }
    })
    markerSpansRef.current.clear()

    const paragraphs = Array.from(container.querySelectorAll('p'))
    if (paragraphs.length === 0) return

    for (const anno of annotations) {
      const para = paragraphs[anno.paragraphIndex - 1]
      if (!para) continue
      applyMarkerToParagraph(para, anno)
    }
  }, [annotations, articleRef])

  function applyMarkerToParagraph(para: HTMLElement, anno: ArticleAnnotation) {
    // Find text node containing selectedText
    const walker = document.createTreeWalker(para, NodeFilter.SHOW_TEXT, {
      acceptNode: (node) => {
        // Skip text inside existing anno-wrap
        const parent = node.parentElement
        if (parent?.closest('.anno-wrap')) return NodeFilter.FILTER_REJECT
        return NodeFilter.FILTER_ACCEPT
      },
    })

    let node: Text | null
    while ((node = walker.nextNode() as Text | null)) {
      const idx = node.textContent?.indexOf(anno.selectedText) ?? -1
      if (idx === -1) continue

      const before = node.textContent!.slice(0, idx)
      const match = node.textContent!.slice(idx, idx + anno.selectedText.length)
      const after = node.textContent!.slice(idx + anno.selectedText.length)

      const wrap = document.createElement('span')
      wrap.className = 'anno-wrap'
      wrap.setAttribute('data-anno-id', anno.id)
      wrap.setAttribute('data-anno-text', anno.selectedText)
      wrap.style.position = 'relative'
      wrap.style.display = 'inline'

      const textSpan = document.createElement('span')
      textSpan.className = 'anno-text'
      textSpan.style.background = isAcademic ? 'rgba(217,119,87,0.13)' : 'rgba(217,119,87,0.08)'
      textSpan.style.borderRadius = '2px'
      textSpan.style.padding = '1px 3px'
      textSpan.style.borderBottom = '1px dashed rgba(217,119,87,0.3)'
      textSpan.textContent = match

      const pen = document.createElement('span')
      pen.className = `anno-pen${anno.note ? ' has-note' : ''}`
      pen.setAttribute('data-anno-id', anno.id)
      pen.style.position = 'absolute'
      pen.style.top = '-9px'
      pen.style.right = '-7px'
      pen.style.display = 'inline-flex'
      pen.style.alignItems = 'center'
      pen.style.justifyContent = 'center'
      pen.style.width = '18px'
      pen.style.height = '18px'
      pen.style.cursor = 'pointer'
      pen.style.borderRadius = '50%'
      pen.style.border = '1.5px solid #d97757'
      pen.style.zIndex = '3'
      pen.style.transition = 'transform 0.15s, background 0.15s'
      pen.style.fontSize = '11px'
      pen.style.lineHeight = '1'
      if (anno.note) {
        pen.style.background = '#d97757'
        pen.style.color = '#fff'
      } else {
        pen.style.background = isAcademic ? '#2a1f1a' : '#f5f2ed'
        pen.style.color = '#d97757'
      }
      pen.innerHTML = '✎'
      // Use a visible pen character
      pen.textContent = '✎'

      pen.addEventListener('click', (e) => {
        e.stopPropagation()
        handlePenClick(anno.id, pen)
      })

      wrap.appendChild(textSpan)
      wrap.appendChild(pen)

      const parent = node.parentNode!
      if (before) parent.insertBefore(document.createTextNode(before), node)
      parent.insertBefore(wrap, node)
      if (after) parent.insertBefore(document.createTextNode(after), node)
      parent.removeChild(node)

      markerSpansRef.current.set(anno.id, wrap)
      return // only first match
    }
  }

  useEffect(() => {
    // Apply markers after a tick to let the DOM settle
    const timer = setTimeout(applyMarkers, 100)
    return () => clearTimeout(timer)
  }, [applyMarkers])

  // --- Handle pen click ---
  function handlePenClick(annoId: string, penEl: HTMLElement) {
    setOpenAnnoId(annoId)
    setCardAnchorEl(penEl)

    const container = articleRef.current
    if (container) {
      const penRect = penEl.getBoundingClientRect()
      const contRect = container.getBoundingClientRect()
      setCardPos({
        left: penRect.left - contRect.left + container.scrollLeft - 4,
        top: penRect.top - contRect.top + container.scrollTop - 10,
      })
    }
  }

  // --- Handle text selection (ghost pen) ---
  useEffect(() => {
    const container = articleRef.current
    if (!container) return

    const handleMouseUp = () => {
      setTimeout(() => {
        // Clean up old ghost
        setGhost(null)

        const sel = window.getSelection()
        if (!sel || sel.isCollapsed || !sel.rangeCount) return
        const range = sel.getRangeAt(0)
        if (!container.contains(range.commonAncestorContainer)) return
        const text = sel.toString().trim()
        if (text.length < 2) return

        // Close any open card
        setOpenAnnoId(null)
        setCardPos(null)
        setCardAnchorEl(null)

        // Get position at end of selection
        const endRange = range.cloneRange()
        endRange.collapse(false)
        const endRect = endRange.getBoundingClientRect()
        const contRect = container.getBoundingClientRect()

        // Find paragraph index
        let paraIndex = 1
        let node: Node | null = range.commonAncestorContainer
        while (node && node !== container) {
          if (node.nodeName === 'P') {
            const paras = Array.from(container.querySelectorAll('p'))
            paraIndex = paras.indexOf(node as HTMLParagraphElement) + 1
            break
          }
          node = node.parentNode
        }

        setGhost({
          text,
          paraIndex,
          left: endRect.right - contRect.left + container.scrollLeft + 2,
          top: endRect.top - contRect.top + container.scrollTop - 14,
        })
      }, 10)
    }

    const handleMouseDown = (e: MouseEvent) => {
      // Hide ghost if clicking outside it
      if (ghostRef.current && !ghostRef.current.contains(e.target as Node)) {
        setGhost(null)
      }
      // Close card if clicking outside
      const anchorEl = cardAnchorElRef.current
      if (anchorEl && !anchorEl.contains(e.target as Node) && !(e.target as HTMLElement).closest('.anno-note-textarea')) {
        doSaveAndClose()
      }
    }

    container.addEventListener('mouseup', handleMouseUp)
    document.addEventListener('mousedown', handleMouseDown)
    return () => {
      container.removeEventListener('mouseup', handleMouseUp)
      document.removeEventListener('mousedown', handleMouseDown)
    }
  }, [articleRef])

  // --- Create annotation from ghost pen ---
  function handleGhostClick() {
    if (!ghost) return

    const id = `a${nextIdRef.current++}`
    const now = new Date().toISOString().slice(0, 10)
    const newAnno: ArticleAnnotation = {
      id,
      selectedText: ghost.text,
      note: '',
      paragraphIndex: ghost.paraIndex,
      createdAt: now,
      updatedAt: now,
    }

    const updated = [...annotations, newAnno]
    setAnnotations(updated)
    setGhost(null)

    // Apply marker for the new annotation
    setTimeout(() => {
      applyMarkers()
      // Open the card for the new annotation
      const penEl = markerSpansRef.current.get(id)?.querySelector('.anno-pen') as HTMLElement | null
      if (penEl) handlePenClick(id, penEl)
    }, 150)

    // Save immediately (empty note, marker exists)
    ipc.annotationsWrite(articlePath, updated)
  }

  // --- Save and close card ---
  function doSaveAndClose() {
    const annoId = openAnnoIdRef.current
    if (!annoId) return
    // Read textarea value before unmounting
    const ta = document.querySelector('.anno-note-textarea') as HTMLTextAreaElement | null
    const noteText = ta?.value?.trim() ?? ''
    const currentAnno = annotationsRef.current.find((a) => a.id === annoId)
    if (currentAnno && noteText !== currentAnno.note) {
      handleSaveNote(annoId, noteText)
    }
    setOpenAnnoId(null)
    setCardPos(null)
    setCardAnchorEl(null)
  }

  function handleSaveNote(annoId: string, noteText: string) {
    const now = new Date().toISOString().slice(0, 10)
    const updated = annotations.map((a) =>
      a.id === annoId
        ? { ...a, note: noteText, updatedAt: now, createdAt: a.createdAt || now }
        : a
    )
    setAnnotations(updated)
    ipc.annotationsWrite(articlePath, updated)

    // Update pen style
    const pen = markerSpansRef.current.get(annoId)?.querySelector('.anno-pen') as HTMLElement | null
    if (pen && noteText) {
      pen.style.background = '#d97757'
      pen.style.color = '#fff'
    }
  }

  function handleDeleteAnnotation(annoId: string) {
    const wrap = markerSpansRef.current.get(annoId)
    if (wrap) {
      const text = wrap.getAttribute('data-anno-text') ?? ''
      wrap.parentNode?.replaceChild(document.createTextNode(text), wrap)
      markerSpansRef.current.delete(annoId)
    }
    const updated = annotations.filter((a) => a.id !== annoId)
    setAnnotations(updated)
    setOpenAnnoId(null)
    setCardPos(null)
    setCardAnchorEl(null)
    ipc.annotationsWrite(articlePath, updated)
  }

  const openAnno = annotations.find((a) => a.id === openAnnoId)

  // Card colors by theme
  const cardBg = isAcademic ? '#241b16' : '#f5f2ed'
  const cardText = isAcademic ? '#d4c5b0' : '#1a1a1a'
  const cardMuted = isAcademic ? '#8a7a6a' : '#6b5d52'
  const cardBorder = '#d97757'

  return (
    <>
      {/* Ghost pen */}
      {ghost && (
        <div
          ref={ghostRef}
          onClick={handleGhostClick}
          style={{
            position: 'absolute',
            left: ghost.left,
            top: ghost.top,
            width: '18px',
            height: '18px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            zIndex: 20,
            background: isAcademic ? '#2a1f1a' : '#f5f2ed',
            borderRadius: '50%',
            border: '1.5px solid #d97757',
            fontSize: '11px',
            lineHeight: '1',
            color: '#d97757',
            animation: 'ghostPulse 0.7s ease-in-out infinite alternate',
          }}
        >
          ✎
        </div>
      )}

      {/* Note card */}
      {openAnnoId && openAnno && cardPos && (
        <div
          style={{
            position: 'absolute',
            left: cardPos.left,
            top: cardPos.top - 12,
            minWidth: '280px',
            maxWidth: '400px',
            background: cardBg,
            borderLeft: `3px solid ${cardBorder}`,
            borderRadius: '0 6px 6px 0',
            padding: '0.85rem 1rem',
            zIndex: 25,
            boxShadow: '0 4px 20px rgba(0,0,0,0.5)',
            transform: 'translateY(-100%)',
          }}
          onClick={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.stopPropagation()}
        >
          {/* Triangle pointer */}
          <div
            style={{
              position: 'absolute',
              bottom: '-6px',
              left: '12px',
              width: 0,
              height: 0,
              borderLeft: '6px solid transparent',
              borderRight: '6px solid transparent',
              borderTop: `6px solid ${cardBg}`,
            }}
          />

          <div style={{ fontSize: '10px', letterSpacing: '0.15em', color: cardBorder, marginBottom: '6px', textTransform: 'uppercase', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span>🖊️ 备注</span>
          </div>

          <textarea
            autoFocus
            className="anno-note-textarea"
            defaultValue={openAnno.note}
            placeholder="写下你的想法…"
            rows={3}
            style={{
              width: '100%',
              background: 'transparent',
              border: 'none',
              outline: 'none',
              color: cardText,
              fontSize: '13px',
              fontStyle: 'italic',
              lineHeight: '1.6',
              fontFamily: 'Georgia, serif',
              resize: 'none',
              padding: 0,
            }}
            onKeyDown={(e) => {
              if (e.key === 'Escape') doSaveAndClose()
            }}
          />

          <div style={{ marginTop: '8px', fontSize: '10px', color: cardMuted, display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span>{openAnno.createdAt ? `${openAnno.createdAt} · §${openAnno.paragraphIndex}` : '新备注'}</span>
            <button
              onClick={() => {
                doSaveAndClose()
              }}
              style={{
                background: cardBorder,
                border: 'none',
                color: '#fff',
                fontSize: '10px',
                padding: '3px 12px',
                borderRadius: '3px',
                cursor: 'pointer',
                fontFamily: 'Georgia, serif',
                marginLeft: 'auto',
              }}
            >
              保存
            </button>
            {openAnno.note && (
              <button
                onClick={() => handleDeleteAnnotation(openAnnoId)}
                style={{
                  background: 'none',
                  border: '1px solid rgba(180,80,80,0.3)',
                  color: '#a06060',
                  fontSize: '10px',
                  padding: '2px 8px',
                  borderRadius: '3px',
                  cursor: 'pointer',
                  fontFamily: 'Georgia, serif',
                }}
              >
                删除
              </button>
            )}
          </div>
        </div>
      )}

      {/* Ghost pen pulse keyframes */}
      <style>{`
        @keyframes ghostPulse {
          from { box-shadow: 0 0 0 2px rgba(217, 119, 87, 0.2); }
          to   { box-shadow: 0 0 0 6px rgba(217, 119, 87, 0.05); }
        }
      `}</style>
    </>
  )
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/components/article-assistant/ArticleAnnotations.tsx
git commit -m "feat(annotations): add ArticleAnnotations component with ghost pen, markers, and note cards"
```

---

### Task 7: Integrate ArticleAnnotations into AnthropicArticleReader

**Files:**
- Modify: `src/components/anthropic/AnthropicArticleReader.tsx`

- [ ] **Step 1: Add article ref and mount ArticleAnnotations**

Add import at top:
```tsx
import { useRef } from 'react'
import { ArticleAnnotations } from '@/components/article-assistant/ArticleAnnotations'
```

Add a ref inside the component (after `const [error, ...]` line):
```tsx
const articleBodyRef = useRef<HTMLElement | null>(null)
```

Add `ref={articleBodyRef}` to the `<article>` element (line 213):
```tsx
<article
  ref={articleBodyRef}
  className={`prose max-w-none ${isAcademic ? 'prose-invert' : ''} briefing-body-${theme}`}
>
```

After the `</article>` closing tag and before the `</div>` (around line 222), add:
```tsx
{body && (
  <ArticleAnnotations
    articlePath={filePath}
    articleRef={articleBodyRef}
    theme={theme}
  />
)}
```

The full section around the article should look like:

```tsx
<article
  ref={articleBodyRef}
  className={`prose max-w-none ${isAcademic ? 'prose-invert' : ''} briefing-body-${theme}`}
>
  <ArticleBodyChunks
    content={body}
    chunks={guideChunks}
    fileName={frontmatter.title ?? 'article.md'}
    theme={theme}
    terms={terms}
  />
</article>
{body && (
  <ArticleAnnotations
    articlePath={filePath}
    articleRef={articleBodyRef}
    theme={theme}
  />
)}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/components/anthropic/AnthropicArticleReader.tsx
git commit -m "feat(annotations): integrate ArticleAnnotations into AnthropicArticleReader"
```

---

### Task 8: Update BriefingListColumn/BriefingSourceSidebar tests

**Files:**
- Modify: `tests/briefing-sidebar.test.tsx` (if needed)
- Modify: `tests/anthropic-blog-panel.test.tsx` (if needed)

- [ ] **Step 1: Run full test suite to check for regressions**

Run: `npx vitest run`
Expected: All tests pass (may need minor updates for changed component structures)

- [ ] **Step 2: Fix any failing tests**

If `tests/anthropic-blog-panel.test.tsx` has selectors that reference the old separate rail structure, update them. The test `toggles collapsed rail and shows thumbnails` should still find `anthropic-list-rail-thumb` elements inside the collapsed `BriefingListColumn`.

If `tests/briefing-sidebar.test.tsx` checks for specific `justify-between` class, update to accept `justify-center` when collapsed.

- [ ] **Step 3: Add test for arrow centering when collapsed**

Add to `tests/briefing-sidebar.test.tsx`:

```tsx
it('centers toggle arrow when collapsed', () => {
  render(<BriefingSourceSidebar theme="academic" collapsed={true} onToggle={() => {}} />)
  const header = screen.getByTestId('briefing-sidebar-toggle').parentElement
  expect(header).toHaveClass('justify-center')
})

it('uses justify-between when expanded', () => {
  render(<BriefingSourceSidebar theme="academic" collapsed={false} onToggle={() => {}} />)
  const header = screen.getByTestId('briefing-sidebar-toggle').parentElement
  expect(header).toHaveClass('justify-between')
})
```

- [ ] **Step 4: Run tests again**

Run: `npx vitest run`
Expected: All passing

- [ ] **Step 5: Commit**

```bash
git add tests/
git commit -m "test(briefing): add arrow centering tests, update for new component structure"
```

---

### Task 9: Final verification — build and full test run

- [ ] **Step 1: Run complete test suite**

Run: `npx vitest run`
Expected: All tests pass

- [ ] **Step 2: Run TypeScript check**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Verify build**

Run: `npm run build`
Expected: Build succeeds

- [ ] **Step 4: Commit any remaining changes**

```bash
git add -A
git commit -m "chore: final verification - all tests pass, build succeeds"
```
