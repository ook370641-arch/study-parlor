# 夜航简报 & Anthropic 博客阅读器 UI 修复实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修复夜航简报页面的三个核心 UI 问题：学术主题左侧来源栏被背景覆盖、「往期」抽屉在空态/Anthropic 源下不弹出、Anthropic 博客学术版缺少 AI 日报同款背景插画；并补齐对应单元测试。

**Architecture:** 保持现有组件边界不变，通过调整 `Briefing.tsx` 的页面级元素挂载位置、给 `BriefingSourceSidebar` 增加 z-index、让 Anthropic 相关组件复用 `briefingTheme` 与 `SurfaceBackground` 来修复问题。所有改动为外科手术式，不引入新状态或新依赖。

**Tech Stack:** React 18 + TypeScript + Tailwind CSS + Zustand + Vitest + @testing-library/react

---

## 文件清单

| 文件 | 责任 |
|------|------|
| `src/components/BriefingSourceSidebar.tsx` | 来源侧边栏：主题配色、折叠图标、z-index |
| `src/pages/Briefing.tsx` | 页面骨架：背景层挂载、drawer 挂载位置、换画按钮、空态 |
| `src/components/anthropic/AnthropicBlogPanel.tsx` | 博客列表面板：已支持 `theme`，本次确认半透明透出背景 |
| `src/components/anthropic/AnthropicArticleReader.tsx` | 文章阅读器：学术主题背景改为半透明 |
| `src/components/md/MarkdownRenderer.tsx` | Markdown 渲染：图片已由 `MdImage` 处理，本次只做回归验证 |
| `tests/briefing-sidebar.test.tsx` | 补充 z-index 断言 |
| `tests/briefing-page.test.tsx` | 新增：drawer 全局挂载、背景层、换画按钮覆盖 |
| `tests/anthropic-reader-theme.test.tsx` | 新增：阅读器主题背景与透明度 |

---

## 前置说明：哪些已经实现

以下 spec 项在代码库中**已经存在**，本次计划只验证、不重复实现：

- `BriefingSourceSidebar` 已接受 `theme` prop 并已实现学术/报纸两套配色、SVG 折叠图标。
- `Briefing.tsx` 已有「查收日报」空态按钮，不再 mount 时自动生成。
- `AnthropicBlogPanel` 已接受 `theme` prop 并已实现学术/报纸两套配色，学术主题已是半透明 (`bg-ink/60`)。
- `MarkdownRenderer` / `MdImage` 已支持 `<img>` 渲染与错误占位。

本次需要真正修改的只有：

1. 给 `BriefingSourceSidebar` 加 `z-[5]`。
2. 在 `Briefing.tsx` 中把 `BriefingHistoryDrawer` 移到条件分支外。
3. 在 `Briefing.tsx` 中让学术版背景插画 (`SurfaceBackground`) 和换画按钮对所有 source 生效。
4. 把 `AnthropicArticleReader` 学术背景从 `bg-ink` 改为 `bg-ink/90`。
5. 补充测试。

---

## Task 1: 给来源侧边栏增加 z-index

**Files:**
- Modify: `src/components/BriefingSourceSidebar.tsx:92-95`
- Test: `tests/briefing-sidebar.test.tsx`

- [ ] **Step 1: 写失败测试**

```tsx
it('has z-index above surface background', () => {
  render(<BriefingSourceSidebar theme="academic" collapsed={false} onToggle={() => {}} />)
  const aside = screen.getByTestId('briefing-source-sidebar')
  expect(aside).toHaveClass('z-[5]')
})
```

- [ ] **Step 2: 运行测试确认失败**

```bash
npx vitest run tests/briefing-sidebar.test.tsx --reporter=verbose
```

Expected: FAIL — `Expected element to have class z-[5]`

- [ ] **Step 3: 最小实现**

在 `src/components/BriefingSourceSidebar.tsx` 中，把 `<aside>` 的 className 末尾追加 `z-[5]`：

```tsx
<aside
  data-testid="briefing-source-sidebar"
  className={`h-full flex flex-col transition-all ${collapsed ? 'w-14' : 'w-48'} ${themeClasses.bg} ${themeClasses.border} z-[5]`}
>
```

- [ ] **Step 4: 运行测试确认通过**

```bash
npx vitest run tests/briefing-sidebar.test.tsx --reporter=verbose
```

Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add src/components/BriefingSourceSidebar.tsx tests/briefing-sidebar.test.tsx
git commit -m "fix(briefing): give source sidebar z-index so it floats above background"
```

---

## Task 2: 把「往期」抽屉移到页面级固定位置

**Files:**
- Modify: `src/pages/Briefing.tsx:163-189`
- Test: `tests/briefing-page.test.tsx`（新建）

- [ ] **Step 1: 写失败测试**

创建 `tests/briefing-page.test.tsx`：

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
    briefingList: vi.fn().mockResolvedValue([]),
    searchPrepare: vi.fn(),
  }
}))

vi.mock('@/lib/paintings', () => ({
  manifest: [{ id: 'test', painter: 'Test', title: 'Test', url: '/test.jpg' }],
  pickRandom: vi.fn((manifest: unknown[]) => manifest[0] ?? null)
}))

import { useStore } from '@/store'
import { Briefing } from '@/pages/Briefing'

describe('Briefing history drawer', () => {
  beforeEach(() => {
    cleanup()
    useStore.setState({
      briefing: { result: null, loading: false, error: null },
      briefingSource: 'digest',
      briefingTheme: 'academic',
      briefingHistory: { list: [], loading: false, error: null },
    })
  })

  it('opens drawer from empty state', async () => {
    render(<Briefing />)
    fireEvent.click(screen.getByTestId('briefing-history-button'))
    await waitFor(() => {
      expect(screen.getByTestId('briefing-history-drawer')).toBeInTheDocument()
    })
  })

  it('opens drawer when source is anthropic', async () => {
    useStore.setState({ briefingSource: 'anthropic' })
    render(<Briefing />)
    fireEvent.click(screen.getByTestId('briefing-history-button'))
    await waitFor(() => {
      expect(screen.getByTestId('briefing-history-drawer')).toBeInTheDocument()
    })
  })

  it('opens drawer in error state', async () => {
    useStore.setState({ briefing: { result: null, loading: false, error: 'NETWORK_ERROR' } })
    render(<Briefing />)
    fireEvent.click(screen.getByTestId('briefing-history-button'))
    await waitFor(() => {
      expect(screen.getByTestId('briefing-history-drawer')).toBeInTheDocument()
    })
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

```bash
npx vitest run tests/briefing-page.test.tsx --reporter=verbose
```

Expected: 三个用例均 FAIL — `Unable to find element with test id "briefing-history-drawer"`

- [ ] **Step 3: 最小实现**

在 `src/pages/Briefing.tsx` 中：

1. 把 `BriefingHistoryDrawer` 从 `parsed && result` 分支内移出，放到 `<div className="flex-1 flex flex-col min-w-0">` 的最末尾、 closing `</div>` 之前。
2. `currentDate` 改为 `result?.date ?? today`。

修改后的相关片段如下（只展示变化部分，保持其他行不变）：

```tsx
      <div className="flex-1 flex flex-col min-w-0">
        <BriefingHeader
          displayDate={source === 'anthropic' ? 'Anthropic Engineering' : displayDate}
          timeString={
            source === 'digest' && result?.generatedAt
              ? formatGeneratedAt(result.generatedAt, result.date)
              : undefined
          }
          sourceStatus={source === 'digest' ? result?.sourceStatus : undefined}
          cacheWriteFailed={source === 'digest' ? result?.cacheWriteFailed : undefined}
          onRegenerate={source === 'digest' ? handleRegenerate : undefined}
          regenerating={regenerating}
          {...headerHistoryProps}
          showRegenerate={source === 'digest'}
        />

        {source === 'anthropic' ? (
          <AnthropicBlogPanel theme={theme} />
        ) : emptyState ? (
          <main className="relative z-[5] flex-1 flex items-center justify-center px-6">
            ...
          </main>
        ) : isDigestLoading ? (
          <main className="relative z-[5] flex-1 overflow-y-auto px-6 py-6 max-w-3xl mx-auto">
            ...
          </main>
        ) : isDigestError ? (
          <main className="relative z-[5] flex-1 flex items-center justify-center px-6">
            ...
          </main>
        ) : parsed && result ? (
          <>
            {isAcademic && (
              <div className="absolute top-24 right-4 z-10">
                <SwapPaintingButton
                  surface="briefing"
                  data-testid="briefing-swap-painting-button"
                  className="text-parchment/70 hover:text-parchment"
                />
              </div>
            )}
            {isAcademic ? (
              <AcademicBriefingLayout result={result} parsed={parsed} displayDate={displayDate} />
            ) : (
              <NewspaperBriefingLayout result={result} parsed={parsed} displayDate={displayDate} />
            )}
          </>
        ) : null}

        <BriefingHistoryDrawer
          open={drawerOpen}
          onClose={() => setDrawerOpen(false)}
          currentDate={result?.date ?? today}
          history={historyList}
          loading={historyLoading}
          error={historyError}
          onSelect={(date) => generateBriefing(date)}
        />
      </div>
```

- [ ] **Step 4: 运行测试确认通过**

```bash
npx vitest run tests/briefing-page.test.tsx --reporter=verbose
```

Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add src/pages/Briefing.tsx tests/briefing-page.test.tsx
git commit -m "fix(briefing): mount history drawer globally so it opens in all states"
```

---

## Task 3: 学术主题背景插画与换画按钮覆盖所有 source

**Files:**
- Modify: `src/pages/Briefing.tsx:102, 165-173`
- Test: `tests/briefing-page.test.tsx`

- [ ] **Step 1: 写失败测试**

在 `tests/briefing-page.test.tsx` 中追加：

```tsx
describe('Briefing global chrome', () => {
  beforeEach(() => {
    cleanup()
    useStore.setState({
      briefing: { result: null, loading: false, error: null },
      briefingSource: 'anthropic',
      briefingTheme: 'academic',
      briefingHistory: { list: [], loading: false, error: null },
      currentPaintings: {
        briefing: { id: 'test', painter: 'Test', title: 'Test', url: '/test.jpg' },
        cover: null,
        home: null,
        study: null,
      },
    })
  })

  it('renders surface background for anthropic source in academic theme', () => {
    render(<Briefing />)
    expect(screen.getByTestId('surface-background')).toBeInTheDocument()
  })

  it('does not render surface background for newspaper theme', () => {
    useStore.setState({ briefingTheme: 'newspaper' })
    render(<Briefing />)
    expect(screen.queryByTestId('surface-background')).not.toBeInTheDocument()
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

```bash
npx vitest run tests/briefing-page.test.tsx --reporter=verbose
```

Expected: FAIL — `Unable to find element with test id "surface-background"`

- [ ] **Step 3: 最小实现**

在 `src/pages/Briefing.tsx` 中：

1. 把 `{isAcademic && source === 'digest' && <SurfaceBackground surface="briefing" />}` 改为 `{isAcademic && <SurfaceBackground surface="briefing" />}`。
2. 把 `SwapPaintingButton` 从 `parsed && result` 分支内移到页面级固定位置（例如 `<div className="flex-1 flex flex-col min-w-0">` 内、`<BriefingHeader>` 之后），并只在 `isAcademic` 时渲染。注意：它必须对所有 source 可见。

具体修改：

```tsx
      {isAcademic && <SurfaceBackground surface="briefing" />}
      <BriefingSourceSidebar
        theme={theme}
        collapsed={sidebarCollapsed}
        onToggle={() => setSidebarCollapsed((c) => !c)}
      />

      <div className="flex-1 flex flex-col min-w-0">
        {isAcademic && (
          <div className="absolute top-24 right-4 z-10">
            <SwapPaintingButton
              surface="briefing"
              data-testid="briefing-swap-painting-button"
              className="text-parchment/70 hover:text-parchment"
            />
          </div>
        )}
        <BriefingHeader ... />
        ...
      </div>
```

同时删除原来在 `parsed && result` 分支内的 `SwapPaintingButton`。

- [ ] **Step 4: 运行测试确认通过**

```bash
npx vitest run tests/briefing-page.test.tsx --reporter=verbose
```

Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add src/pages/Briefing.tsx tests/briefing-page.test.tsx
git commit -m "fix(briefing): show background painting and swap button for all academic sources"
```

---

## Task 4: Anthropic 文章阅读器学术主题半透明化

**Files:**
- Modify: `src/components/anthropic/AnthropicArticleReader.tsx:86-98`
- Test: `tests/anthropic-reader-theme.test.tsx`（新建）

- [ ] **Step 1: 写失败测试**

创建 `tests/anthropic-reader-theme.test.tsx`：

```tsx
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'

vi.mock('@/lib/ipc', () => ({
  ipc: {
    readMd: vi.fn().mockResolvedValue({
      frontmatter: {
        title: 'Test Article',
        type: 'anthropic-article',
        source_url: 'https://www.anthropic.com/engineering/test',
        created: new Date().toISOString(),
      },
      body: 'Hello world.',
    }),
    openExternal: vi.fn(),
  }
}))

import { AnthropicArticleReader } from '@/components/anthropic/AnthropicArticleReader'

describe('AnthropicArticleReader theme', () => {
  beforeEach(() => {
    cleanup()
  })

  it('uses translucent ink background in academic theme', () => {
    render(<AnthropicArticleReader filePath="/tmp/test.md" theme="academic" />)
    const reader = screen.getByTestId('anthropic-article-reader')
    expect(reader).toHaveClass('bg-ink/90')
  })

  it('uses opaque white background in newspaper theme', () => {
    render(<AnthropicArticleReader filePath="/tmp/test.md" theme="newspaper" />)
    const reader = screen.getByTestId('anthropic-article-reader')
    expect(reader).toHaveClass('bg-white')
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

```bash
npx vitest run tests/anthropic-reader-theme.test.tsx --reporter=verbose
```

Expected: FAIL — academic 主题下是 `bg-ink` 而非 `bg-ink/90`

- [ ] **Step 3: 最小实现**

在 `src/components/anthropic/AnthropicArticleReader.tsx` 的 `themeClasses` 中，把学术主题的 `bg` 从 `'bg-ink'` 改为 `'bg-ink/90'`：

```tsx
  const themeClasses = isAcademic
    ? {
        bg: 'bg-ink/90',
        text: 'text-parchment',
        headerBg: 'bg-ink/95',
        ...
      }
```

- [ ] **Step 4: 运行测试确认通过**

```bash
npx vitest run tests/anthropic-reader-theme.test.tsx --reporter=verbose
```

Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add src/components/anthropic/AnthropicArticleReader.tsx tests/anthropic-reader-theme.test.tsx
git commit -m "fix(anthropic): make article reader academic background translucent"
```

---

## Task 5: Markdown 图片渲染回归验证

**Files:**
- Test: `tests/md-image.test.tsx`（已存在）

- [ ] **Step 1: 运行现有测试**

```bash
npx vitest run tests/md-image.test.tsx --reporter=verbose
```

Expected: PASS（`MdImage` 已存在并覆盖外部图、`file://`、错误占位、src 切换）

- [ ] **Step 2: 若失败则修复**

如果失败，检查：
1. `MarkdownRenderer` 是否正确调用 `briefingComponents(style)`。
2. `briefingComponents` 是否继承了 `baseComponents` 中的 `img`。
3. `MarkdownContent` 的 `urlTransform` 是否允许 `file://`。

当前代码已经满足以上三点，因此正常情况下应通过。若未来出现回归，按此 checklist 修复。

- [ ] **Step 3: 提交（仅当需要修改时）**

```bash
git add <changed files>
git commit -m "fix(md): ensure article body images render in briefing themes"
```

---

## Task 6: 全量测试与类型检查

- [ ] **Step 1: 运行 briefing 相关测试**

```bash
npx vitest run tests/briefing-sidebar.test.tsx tests/briefing-empty-state.test.tsx tests/briefing-page.test.tsx tests/anthropic-reader-theme.test.tsx tests/md-image.test.tsx --reporter=verbose
```

Expected: 全部 PASS

- [ ] **Step 2: 运行完整单元测试套件**

```bash
npm run test
```

Expected: 全部 PASS

- [ ] **Step 3: TypeScript 类型检查**

```bash
npx tsc --noEmit
```

Expected: 无错误

- [ ] **Step 4: 提交（如测试文件有追加但未提交）**

```bash
git add tests/
git commit -m "test(briefing): cover drawer, background, and reader transparency fixes"
```

---

## Task 7: 手动验证清单

- [ ] 启动 `npm run dev`。
- [ ] 进入夜航简报，确认学术主题左侧来源栏可见、不与背景融合。
- [ ] 切换到报纸主题，确认来源栏为浅灰底黑字。
- [ ] 清空缓存后进入 AI 日报，点击「往期」按钮，确认抽屉弹出。
- [ ] 切换到 Anthropic 博客，确认背景插画出现，且右上角有「换画」按钮。
- [ ] 在 Anthropic 博客打开一篇文章，确认阅读器背景半透明、能透出背景插画。
- [ ] 打开一篇包含本地图片的 Anthropic 文章，确认正文图片正常显示。

---

## Self-Review Checklist

- [ ] **Spec 覆盖**：侧边栏 z-index（§5.1）、drawer 全局挂载（§5.6）、Anthropic 背景对齐（§5.7）、阅读器半透明（§5.7）都有对应任务。
- [ ] **无占位符**：所有步骤包含具体代码、命令、期望输出。
- [ ] **类型一致**：`briefingTheme`、`briefingSource`、`currentDate` 的用法与 store 类型一致。
- [ ] **测试边界**：覆盖空态、Anthropic 源、错误态、主题切换。
- [ ] **最小改动**：不修改未涉及的组件（`BriefingHeader`、`AcademicBriefingLayout`、`NewspaperBriefingLayout` 无需改动）。
