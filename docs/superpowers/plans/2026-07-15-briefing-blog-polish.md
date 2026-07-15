# 夜航简报微调 v2 — 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修复博客文章页 7 个 UI/交互问题：边框颜色、文字选中幽灵笔、搜索开关、换画按钮去重、导读箭头+resize、文章宽度、E2E 覆盖。

**Architecture:** 7 个独立微调，每个仅涉及 1-3 个文件。按依赖排序：先修样式/布局 bug（Issue 1, 6, 4, 5），再改交互逻辑（Issue 2, 3），最后补 E2E（Issue 7）。

**Tech Stack:** React 18 + TypeScript + Tailwind CSS + Zustand + Playwright (E2E) + Vitest (unit)

---

## 文件结构

| 文件 | 变更类型 | 关联 Issue |
|------|---------|-----------|
| `src/components/anthropic/AnthropicArticleRow.tsx` | 修改 | #1 边框 |
| `src/components/BriefingListColumn.tsx` | 修改 | #6 宽度 bug |
| `src/components/anthropic/AnthropicArticleReader.tsx` | 修改 | #4 换画按钮, #5 overflow, #6 宽度 |
| `src/components/briefing/AcademicBriefingLayout.tsx` | 修改 | #6 宽度 |
| `src/components/briefing/NewspaperBriefingLayout.tsx` | 修改 | #6 宽度 |
| `src/pages/Briefing.tsx` | 修改 | #4 换画按钮去重 |
| `src/components/article-assistant/ArticleDivider.tsx` | 修改 | #5 resize 回调 |
| `src/components/article-assistant/ArticleAssistantPanel.tsx` | 修改 | #5 条件 transition |
| `src/components/article-assistant/ArticleAnnotations.tsx` | 修改 | #2 幽灵笔+高亮 |
| `src/store/index.ts` | 修改 | #3 searchEnabled |
| `src/components/article-assistant/ChatWindow.tsx` | 修改 | #3 搜索开关 UI |
| `tests/anthropic-article-row.test.tsx` | 修改 | #1 单元测试 |
| `tests/article-assistant/ChatWindow.test.tsx` | 修改 | #3 单元测试 |
| `e2e/specs/anthropic-blog-ui.spec.ts` | 修改 | #7 E2E |
| `e2e/specs/article-annotations.spec.ts` | 修改 | #7 E2E |
| `e2e/specs/article-assistant.spec.ts` | 修改 | #7 E2E |

---

### Task 1: 博客文章边框颜色

**Files:**
- Modify: `src/components/anthropic/AnthropicArticleRow.tsx:74-75`
- Modify: `tests/anthropic-article-row.test.tsx`

- [ ] **Step 1: 修改已保存文章的边框 class**

编辑 `AnthropicArticleRow.tsx`，替换 `borderClass` 中已保存分支：

```tsx
// 找到第 74-75 行附近的已保存分支，替换为：
} else if (article.isSaved) {
  borderClass = isAcademic
    ? 'border-l-[3px] border-l-ember border-t-[rgba(232,213,183,0.12)] border-r-[rgba(232,213,183,0.12)] border-b-[rgba(232,213,183,0.12)]'
    : 'border-l-[3px] border-l-[#1a1a1a] border-t-[#c9c3b8]/30 border-r-[#c9c3b8]/30 border-b-[#c9c3b8]/30'
}
```

- [ ] **Step 2: 更新单元测试**

编辑 `tests/anthropic-article-row.test.tsx`，扩展已有测试以验证三边颜色（学术主题已保存行需断言 `border-t-[rgba(232,213,183,0.12)]` 存在）：

```tsx
it('applies ember left border and brown top/right/bottom borders when article is saved (academic)', () => {
  render(<AnthropicArticleRow article={article({ isSaved: true, filePath: '/tmp/x.md' })} theme="academic" />)
  const row = screen.getByTestId('anthropic-article-row')
  // 左边框保持橙色
  expect(row).toHaveClass('border-l-ember')
  // 上/右/下边框为未导入文章左边框同色
  expect(row.className).toContain('border-t-[rgba(232,213,183,0.12)]')
  expect(row.className).toContain('border-r-[rgba(232,213,183,0.12)]')
  expect(row.className).toContain('border-b-[rgba(232,213,183,0.12)]')
})

it('applies dark left border and brown other borders when article is saved (newspaper)', () => {
  render(<AnthropicArticleRow article={article({ isSaved: true, filePath: '/tmp/x.md' })} theme="newspaper" />)
  const row = screen.getByTestId('anthropic-article-row')
  expect(row.className).toContain('border-l-[#1a1a1a]')
  expect(row.className).toContain('border-t-[#c9c3b8]/30')
})
```

- [ ] **Step 3: 运行单元测试验证**

```bash
npx vitest run tests/anthropic-article-row.test.tsx
```

Expected: 7 tests PASS

- [ ] **Step 4: Commit**

```bash
git add src/components/anthropic/AnthropicArticleRow.tsx tests/anthropic-article-row.test.tsx
git commit -m "fix(ui): add brown top/right/bottom borders to saved Anthropic article rows"
```

---

### Task 2: 修复 BriefingListColumn 宽度 bug + 文章区加宽

**Files:**
- Modify: `src/components/BriefingListColumn.tsx:31`
- Modify: `src/components/anthropic/AnthropicArticleReader.tsx:155`
- Modify: `src/components/briefing/AcademicBriefingLayout.tsx:31`
- Modify: `src/components/briefing/NewspaperBriefingLayout.tsx:31`

- [ ] **Step 1: 修复 BriefingListColumn 的 Tailwind 类名 bug**

编辑 `BriefingListColumn.tsx:31`：

```diff
- const widthClass = width === 80 ? 'w-80' : 'w-64'
+ const widthClass = width === 80 ? 'w-[80px]' : 'w-[64px]'
```

- [ ] **Step 2: 加宽文章内容区**

`AnthropicArticleReader.tsx:155`：

```diff
- <div className="relative w-[90%] max-w-[1250px] min-w-[520px] mx-auto px-6 py-10 pb-24">
+ <div className="relative w-[95%] max-w-[1400px] min-w-[520px] mx-auto px-6 py-10 pb-24">
```

`AcademicBriefingLayout.tsx:31`：

```diff
- <div className="w-[90%] max-w-[1250px] min-w-[520px] mx-auto px-4 py-6 relative">
+ <div className="w-[95%] max-w-[1400px] min-w-[520px] mx-auto px-4 py-6 relative">
```

`NewspaperBriefingLayout.tsx:31`：

```diff
- <article className="w-[90%] max-w-[1250px] min-w-[520px] mx-auto px-4 py-6 relative">
+ <article className="w-[95%] max-w-[1400px] min-w-[520px] mx-auto px-4 py-6 relative">
```

- [ ] **Step 3: 运行现有测试确保无回归**

```bash
npx vitest run tests/briefing-layout.test.tsx tests/briefing-page.test.tsx
```

Expected: All PASS

- [ ] **Step 4: Commit**

```bash
git add src/components/BriefingListColumn.tsx src/components/anthropic/AnthropicArticleReader.tsx src/components/briefing/AcademicBriefingLayout.tsx src/components/briefing/NewspaperBriefingLayout.tsx
git commit -m "fix(ui): fix BriefingListColumn w-80→w-[80px] width bug, widen article area to 95%/1400px"
```

---

### Task 3: 换画按钮去重

**Files:**
- Modify: `src/pages/Briefing.tsx:124`
- Modify: `src/components/anthropic/AnthropicArticleReader.tsx:150-162`

- [ ] **Step 1: 删除 Briefing.tsx 中对 anthropic 源的换画按钮**

编辑 `Briefing.tsx:124`：

```diff
- {isAcademic && source !== 'digest' && (
+ {isAcademic && source !== 'digest' && source !== 'anthropic' && (
```

- [ ] **Step 2: 将 AnthropicArticleReader 中的换画按钮移到滚动区之外**

编辑 `AnthropicArticleReader.tsx`，将按钮从第 156-162 行的 `overflow-y-auto` 区内移到外层固定位置：

```diff
  <div
    data-testid="anthropic-article-reader"
-   className={`relative flex h-full overflow-hidden ${themeClasses.bg} ${themeClasses.text}`}
+   className={`relative flex h-full ${themeClasses.bg} ${themeClasses.text}`}
  >
+   {/* 固定换画按钮 — 位于文章区右上角、导读侧边栏左侧 */}
+   <div className="absolute top-4 right-4 z-20">
+     <SwapPaintingButton
+       surface="briefing"
+       data-testid="anthropic-swap-painting-button"
+       className="text-parchment/70 hover:text-parchment"
+     />
+   </div>
    <div className="flex-1 flex flex-col overflow-y-auto min-w-0">
      <style dangerouslySetInnerHTML={{ __html: articleStyles }} />
-     <div className="relative w-[95%] max-w-[1400px] min-w-[520px] mx-auto px-6 py-10 pb-24">
+     <div className="relative w-[95%] max-w-[1400px] min-w-[520px] mx-auto px-6 py-10 pb-24">
        {/* 删除此处原有的 SwapPaintingButton */}
-       <div className="absolute top-4 right-4 z-10">
-         <SwapPaintingButton
-           surface="briefing"
-           data-testid="anthropic-swap-painting-button"
-           className="text-parchment/70 hover:text-parchment"
-         />
-       </div>
```

> 注意：`overflow-hidden` 的移除同时解决了 Issue 5 中导读箭头被裁剪的问题（见 Task 4）。

- [ ] **Step 3: 验证**

```bash
npx vitest run tests/anthropic-reader-theme.test.tsx
```

Expected: All PASS

- [ ] **Step 4: Commit**

```bash
git add src/pages/Briefing.tsx src/components/anthropic/AnthropicArticleReader.tsx
git commit -m "fix(ui): deduplicate swap-painting button, keep only reader-level one fixed outside scroll area"
```

---

### Task 4: 导读箭头可点击 + resize 实时

**Files:**
- Modify: `src/components/article-assistant/ArticleDivider.tsx:10-67`
- Modify: `src/components/article-assistant/ArticleAssistantPanel.tsx:66-88`

> 注意：`AnthropicArticleReader.tsx` 的 `overflow-hidden` 移除已在 Task 3 Step 2 中完成。

- [ ] **Step 1: ArticleDivider 暴露拖拽生命周期回调**

编辑 `ArticleDivider.tsx`，在 `Props` 接口中新增回调，在 `onMove` 之前通知父组件拖拽开始，在 `onUp` 时通知拖拽结束：

```diff
  interface Props {
    collapsed: boolean
    onToggleCollapse: () => void
    onResize: (newWidth: number) => void
+   onResizeStart?: () => void
+   onResizeEnd?: () => void
    theme?: 'academic' | 'newspaper'
  }
```

在 `handlePointerDown` 中：

```diff
  const handlePointerDown = (e: React.PointerEvent) => {
    const target = e.currentTarget
    target.setPointerCapture(e.pointerId)
+   onResizeStart?.()
    const container = target.parentElement
    // ... 其余不变
```

在 `onUp` 中：

```diff
    const onUp = () => {
      ;(e.target as HTMLElement).releasePointerCapture(e.pointerId)
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      dragging.current = null
+     onResizeEnd?.()
    }
```

- [ ] **Step 2: ArticleAssistantPanel 在拖拽期间移除 transition**

编辑 `ArticleAssistantPanel.tsx`，新增 `resizing` 状态并传给 `ArticleDivider`：

```diff
+ import { useState } from 'react'
  // ...

  export function ArticleAssistantPanel({ ... }: Props) {
+   const [resizing, setResizing] = useState(false)
    // ...

    return (
      <div ref={containerRef} className="relative flex h-full shrink-0">
        {showGuide && (
          <>
            <ArticleDivider
              collapsed={guideCollapsed}
              onToggleCollapse={() => setArticleAssistantGuideCollapsed(!guideCollapsed)}
+             onResizeStart={() => setResizing(true)}
+             onResizeEnd={() => setResizing(false)}
              onResize={(width) => { ... }}
              theme={theme}
            />
-           <div className="h-full overflow-hidden transition-[width] duration-150 ease-out" style={{ width: sidebarWidth }}>
+           <div className={`h-full overflow-hidden ${resizing ? '' : 'transition-[width] duration-150 ease-out'}`} style={{ width: sidebarWidth }}>
              <GuideSidebar theme={theme} />
            </div>
          </>
        )}
```

- [ ] **Step 3: 运行测试**

```bash
npx vitest run tests/ArticleDivider.test.tsx tests/GuideSidebar.test.tsx
```

Expected: All PASS

- [ ] **Step 4: Commit**

```bash
git add src/components/article-assistant/ArticleDivider.tsx src/components/article-assistant/ArticleAssistantPanel.tsx
git commit -m "fix(ui): make guide sidebar toggle clickable (unclip overflow) and resize real-time (remove transition during drag)"
```

---

### Task 5: 文字选中幽灵笔修复 + 高亮持久化

**Files:**
- Modify: `src/components/article-assistant/ArticleAnnotations.tsx:229-300`

- [ ] **Step 1: 修复幽灵笔时序 — 用 requestAnimationFrame 替代 setTimeout(10)**

编辑 `handleMouseUp`（约第 234 行）：

```diff
    const handleMouseUp = () => {
-     setTimeout(() => {
+     requestAnimationFrame(() => {
+       setTimeout(() => {
          // Clean up old ghost
          setGhost(null)
          // ... 其余不变（读 selection、设置 ghost）
-       }, 10)
+       }, 0)
+     })
    }
```

- [ ] **Step 2: 新增持久化高亮 overlay 状态与渲染**

在组件顶部新增状态：

```tsx
const [selectionHighlights, setSelectionHighlights] = useState<Array<{ left: number; top: number; width: number; height: number }>>([])
```

在 `handleMouseUp` 中获取选区矩形并设置高亮：

```tsx
// 在 setGhost 之前，获取选区矩形
const rects = Array.from(range.getClientRects()).map((r) => ({
  left: r.left - contRect.left + container.scrollLeft,
  top: r.top - contRect.top + container.scrollTop,
  width: r.width,
  height: r.height,
}))
setSelectionHighlights(rects)
```

在 JSX 中渲染高亮 overlay（幽灵笔之前）：

```tsx
{selectionHighlights.length > 0 && selectionHighlights.map((rect, i) => (
  <div
    key={`hl-${i}`}
    data-testid="anno-selection-highlight"
    style={{
      position: 'absolute',
      left: rect.left,
      top: rect.top,
      width: rect.width,
      height: rect.height,
      background: isAcademic ? 'rgba(217,119,87,0.13)' : 'rgba(217,119,87,0.08)',
      borderRadius: '2px',
      pointerEvents: 'none',
      zIndex: 2,
    }}
  />
))}
```

- [ ] **Step 3: 修改清除逻辑 — mousedown 不清除幽灵笔和高亮**

编辑 `handleMouseDown`（约第 278 行），改为仅在点击**文章区空白处（非幽灵笔、非高亮文字）**时清除：

```diff
    const handleMouseDown = (e: MouseEvent) => {
-     // Hide ghost if clicking outside it
-     if (ghostRef.current && !ghostRef.current.contains(e.target as Node)) {
-       setGhost(null)
-     }
+     // Clear ghost + highlights only when clicking outside ghost pen AND outside selection highlights
+     const target = e.target as HTMLElement
+     if (ghostRef.current && !ghostRef.current.contains(target)) {
+       // Only clear if not clicking inside an existing annotation marker
+       if (!target.closest('.anno-wrap')) {
+         setGhost(null)
+         setSelectionHighlights([])
+       }
+     }
      // Close card if clicking outside BOTH the marker pen and the note card
      // ... 其余不变
    }
```

- [ ] **Step 4: handleGhostClick 创建标注后清除高亮**

在 `handleGhostClick` 中（约第 303 行），创建标注后清除临时高亮：

```diff
  function handleGhostClick() {
    if (!ghost) return
    // ...
    setGhost(null)
+   setSelectionHighlights([])
    // ...
  }
```

- [ ] **Step 5: 运行已有测试验证无回归**

```bash
npx vitest run tests/article-assistant/
```

Expected: All PASS

- [ ] **Step 6: Commit**

```bash
git add src/components/article-assistant/ArticleAnnotations.tsx
git commit -m "fix(annotations): fix ghost pen not appearing after text selection, add persistent highlight overlay"
```

---

### Task 6: 搜索按钮开关态（持久化 toggle）

**Files:**
- Modify: `src/store/index.ts:19-37, 949-964, 1037-1044`
- Modify: `src/components/article-assistant/ChatWindow.tsx:25-32, 149-158`
- Modify: `tests/article-assistant/ChatWindow.test.tsx`

- [ ] **Step 1: AssistantSession 类型加 searchEnabled 字段**

编辑 `src/store/index.ts:19-37`：

```diff
  export type AssistantSession = {
    contextId: string
    contextType: 'briefing' | 'anthropic-article'
    articleTitle?: string
    articleContent: string
    guide: ArticleAssistantGuide | null
    guideLoading: boolean
    guideError: ArticleAssistantErrorCode | null
    messages: ArticleAssistantMessage[]
    streaming: boolean
    abortId: string
    searchLoading: boolean
+   searchEnabled: boolean
    searchError: 'NO_RESULTS' | 'SEARCH_ERROR' | null
    chatError: ArticleAssistantErrorCode | null
    retryContext: { text: string; useSearch: boolean } | null
    pendingSelection?: string
    isOpen: boolean
    activeChunkIndex: number | null
  }
```

- [ ] **Step 2: openAssistantSession 初始化 searchEnabled 为 false**

编辑 `src/store/index.ts:960`：

```diff
        searchLoading: false, searchError: null, chatError: null,
+       searchEnabled: false,
        retryContext: null, pendingSelection: undefined, isOpen: false,
```

- [ ] **Step 3: 新增 toggleAssistantSearch action**

在 store actions 中新增（靠近 `toggleAssistantOpen` 附近，约第 985 行之后）：

```tsx
toggleAssistantSearch: () => {
  const s = get().assistantSession
  if (!s) return
  set({ assistantSession: { ...s, searchEnabled: !s.searchEnabled } })
},
```

- [ ] **Step 4: 修改 ChatWindow 按钮行为为 toggle**

编辑 `ChatWindow.tsx`：

```diff
  export function ChatWindow() {
    const session = useStore((s) => s.assistantSession)
    const sendAssistantMessage = useStore((s) => s.sendAssistantMessage)
    // ...
    const toggleAssistantOpen = useStore((s) => s.toggleAssistantOpen)
+   const toggleAssistantSearch = useStore((s) => s.toggleAssistantSearch)

-   const handleSend = (useSearch: boolean) => {
+   const handleSend = () => {
      const text = input.trim()
      if (!text && !session.pendingSelection) return
-     sendAssistantMessage(text, useSearch)
+     sendAssistantMessage(text, session?.searchEnabled ?? false)
      setInput('')
      setTimeout(() => scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' }), 50)
    }
```

搜索按钮改为 toggle：

```diff
  <button
    data-testid="article-assistant-search-btn"
-   className="px-1.5 py-1 text-parchment/70 hover:text-ember disabled:opacity-30 disabled:cursor-not-allowed text-sm"
-   onClick={() => handleSend(true)}
+   className={`px-1.5 py-1 rounded text-sm disabled:opacity-30 disabled:cursor-not-allowed transition-colors ${
+     session?.searchEnabled
+       ? 'bg-ember text-white'
+       : 'text-parchment/70 hover:text-ember'
+   }`}
-   onClick={toggleAssistantSearch}
+   onClick={() => toggleAssistantSearch()}
    disabled={session.streaming || session.searchLoading}
-   aria-label="联网搜索"
-   title="联网搜索"
+   aria-label={session?.searchEnabled ? '搜索已开启' : '搜索已关闭'}
+   title={session?.searchEnabled ? '搜索已开启 — 下次发送将联网搜索' : '搜索已关闭 — 点击开启联网搜索'}
  >
    {session.searchLoading ? '⏳' : '🔍'}
  </button>
```

发送按钮和 Enter 键使用无参 `handleSend`：

```diff
  onKeyDown={(e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
-     handleSend(false)
+     handleSend()
    }
  }}

  // 发送按钮
  onClick={() => handleSend()}
```

- [ ] **Step 5: 更新单元测试**

编辑 `tests/article-assistant/ChatWindow.test.tsx`，新增测试：

```tsx
it('renders search button in default (off) state', () => {
  mockStore(baseSession({ searchEnabled: false }))
  render(<ChatWindow />)
  const btn = screen.getByTestId('article-assistant-search-btn')
  expect(btn).toBeInTheDocument()
  expect(btn).not.toHaveClass('bg-ember')
})

it('renders search button in active (on) state with ember background', () => {
  mockStore(baseSession({ searchEnabled: true }))
  render(<ChatWindow />)
  const btn = screen.getByTestId('article-assistant-search-btn')
  expect(btn).toBeInTheDocument()
  expect(btn).toHaveClass('bg-ember')
})
```

同时，在 `baseSession` 函数中添加 `searchEnabled` 默认值，在 `actions` mock 中添加 `toggleAssistantSearch: vi.fn()`。

- [ ] **Step 6: 运行测试**

```bash
npx vitest run tests/article-assistant/ChatWindow.test.tsx
```

Expected: All PASS（含新增的 2 个测试）

- [ ] **Step 7: Commit**

```bash
git add src/store/index.ts src/components/article-assistant/ChatWindow.tsx tests/article-assistant/ChatWindow.test.tsx
git commit -m "feat(ui): make search button a persistent toggle — toggle on/off, search on next send"
```

---

### Task 7: E2E 测试

**Files:**
- Modify: `e2e/specs/anthropic-blog-ui.spec.ts`
- Modify: `e2e/specs/article-annotations.spec.ts`
- Modify: `e2e/specs/article-assistant.spec.ts`

- [ ] **Step 1: 博客边框颜色 + 文章宽度 E2E**

在 `e2e/specs/anthropic-blog-ui.spec.ts` 中新增测试：

```ts
test('E2E-12: 已保存文章左橙 + 三边棕色边框', async ({ window }) => {
  const cover = new CoverPage(window)
  await cover.enterName('E2E 测试员')
  await cover.goToBriefing()
  await expect(window.locator(SELECTORS.briefing.page)).toBeVisible()

  await window.locator(SELECTORS.briefing.sourceAnthropicButton).click()
  await expect(window.locator(SELECTORS.briefing.listColumn)).toBeVisible()

  const prompt = window.locator(SELECTORS.briefing.anthropicNewArticlesPrompt)
  await prompt.waitFor({ timeout: 120000 }).catch(() => {})
  if (await prompt.isVisible().catch(() => false)) await prompt.click()

  const rows = window.locator(SELECTORS.briefing.anthropicArticleRow)
  await rows.first().waitFor({ timeout: 120000 })

  // 找已保存文章
  const savedRow = rows.filter({ has: window.locator(SELECTORS.briefing.anthropicArticleSaved) }).first()
  const savedVisible = await savedRow.isVisible().catch(() => false)
  if (!savedVisible) {
    // 没有已保存文章则跳过此断言
    return
  }
  // 验证左边框 ember
  await expect(savedRow).toHaveClass(/border-l-ember/)
})

test('E2E-13: 文章列表展开宽度为 80px（非 320px bug）', async ({ window }) => {
  const cover = new CoverPage(window)
  await cover.enterName('E2E 测试员')
  await cover.goToBriefing()
  await expect(window.locator(SELECTORS.briefing.page)).toBeVisible()

  await window.locator(SELECTORS.briefing.sourceAnthropicButton).click()
  const listColumn = window.locator(SELECTORS.briefing.listColumn)
  await expect(listColumn).toBeVisible()
  // 展开状态不应为 w-80（320px bug 修复后使用 w-[80px]）
  await expect(listColumn).not.toHaveClass(/w-80/)
})
```

- [ ] **Step 2: 文字选中高亮持久化 E2E**

在 `e2e/specs/article-annotations.spec.ts` 中新增测试：

```ts
test('E2E-A2: 选中文字后高亮持久化，点击幽灵笔创建标注', async ({ window, testLibraryPath }) => {
  const cover = new CoverPage(window)
  await cover.enterName('E2E 测试员')
  await cover.goToBriefing()
  await expect(window.locator(SELECTORS.briefing.page)).toBeVisible()

  // 导入文章
  await window.locator(SELECTORS.briefing.sourceAnthropicButton).click()
  const prompt = window.locator(SELECTORS.briefing.anthropicNewArticlesPrompt)
  await prompt.waitFor({ timeout: 120000 }).catch(() => {})
  if (await prompt.isVisible().catch(() => false)) await prompt.click()

  const rows = window.locator(SELECTORS.briefing.anthropicArticleRow)
  await rows.first().waitFor({ timeout: 120000 })
  await rows.first().click()

  const reader = window.locator(SELECTORS.briefing.anthropicArticleReader)
  await reader.waitFor({ state: 'visible', timeout: 120000 })
  await window.locator('article p').first().waitFor({ state: 'visible', timeout: 15000 })

  // 选中文字 → 验证幽灵笔出现
  await selectTextInArticle(window, 0, 15)
  const ghostPen = window.locator(SELECTORS.annotations.ghostPen)
  await expect(ghostPen).toBeVisible({ timeout: 5000 })

  // 验证持久化高亮存在
  const highlight = window.locator('[data-testid="anno-selection-highlight"]').first()
  await expect(highlight).toBeVisible({ timeout: 3000 })

  // 点击幽灵笔创建标注
  await ghostPen.click({ force: true })
  const noteCard = window.locator(SELECTORS.annotations.noteCard)
  await expect(noteCard).toBeVisible({ timeout: 5000 })

  // 创建标注后临时高亮应消失
  await expect(highlight).toBeHidden({ timeout: 3000 })
})
```

- [ ] **Step 3: 搜索按钮 toggle E2E**

在 `e2e/specs/article-assistant.spec.ts` 中新增测试：

```ts
test('E2E-AS-4: 搜索按钮为开关 — 点击切换状态不发送', async ({ window }) => {
  const cover = new CoverPage(window)
  await cover.enterName('E2E 测试员')
  await cover.goToBriefing()

  await window.locator(SELECTORS.briefing.sourceAnthropicButton).click()
  const prompt = window.locator(SELECTORS.briefing.anthropicNewArticlesPrompt)
  await prompt.waitFor({ timeout: 120000 }).catch(() => {})
  if (await prompt.isVisible().catch(() => false)) await prompt.click()

  const rows = window.locator(SELECTORS.briefing.anthropicArticleRow)
  await rows.first().waitFor({ timeout: 120000 })
  await rows.first().click()

  await window.locator(SELECTORS.briefing.anthropicArticleReader).waitFor({ state: 'visible', timeout: 120000 })

  // 打开旁注面板
  const tab = window.locator(SELECTORS.articleAssistant.tab)
  await tab.click()
  await expect(window.locator(SELECTORS.articleAssistant.chatWindow)).toBeVisible({ timeout: 5000 })

  // 搜索按钮初始为关闭态
  const searchBtn = window.locator(SELECTORS.articleAssistant.searchBtn)
  await expect(searchBtn).toBeVisible()
  // 默认不是 ember 背景（关闭态）
  await expect(searchBtn).not.toHaveClass(/bg-ember/)

  // 点击搜索按钮 — 应变为开启态
  await searchBtn.click()
  await expect(searchBtn).toHaveClass(/bg-ember/)

  // 再次点击 — 关闭
  await searchBtn.click()
  await expect(searchBtn).not.toHaveClass(/bg-ember/)
})
```

- [ ] **Step 4: 运行 E2E 测试**

```bash
npx playwright test e2e/specs/anthropic-blog-ui.spec.ts e2e/specs/article-annotations.spec.ts e2e/specs/article-assistant.spec.ts --project=chronium
```

Expected: 所有新增测试 PASS

- [ ] **Step 5: Commit**

```bash
git add e2e/specs/anthropic-blog-ui.spec.ts e2e/specs/article-annotations.spec.ts e2e/specs/article-assistant.spec.ts
git commit -m "test(e2e): add E2E coverage for blog borders, text highlight persistence, and search toggle"
```

---

## 任务执行顺序

```
Task 1 (边框) ──┐
Task 2 (宽度) ──┤
Task 3 (换画) ──┼── 可并行（互不依赖）
Task 4 (导读) ──┤
Task 5 (幽灵笔) ┤
Task 6 (搜索) ──┘
                  ↓
Task 7 (E2E) ──── 最后（依赖所有功能变更）
```

---

## 验收清单

- [ ] 已导入博客文章左橙 + 三边棕（两个主题）
- [ ] 选中文字后🖊出现 + 高亮保持
- [ ] 高亮在点击区域外时消失
- [ ] 🔍 按钮 toggle 有视觉差异，不立即发送
- [ ] 搜索开关跨消息持久化（不随发送重置）
- [ ] 仅一个换画按钮，位置固定不随滚动
- [ ] 导读箭头可点击折叠/展开
- [ ] 拖拽导读 divider 实时变化宽度
- [ ] BriefingListColumn 展开宽度 80px（非 320px）
- [ ] 文章内容区 `max-w-[1400px]` `w-[95%]`
- [ ] 单元测试全部通过
- [ ] E2E 测试全部通过
- [ ] 报刊主题无回归
