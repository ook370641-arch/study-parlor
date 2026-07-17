# 夜航简报微调 v2 — 实现计划（修正版）

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修正上次实现中遗漏的三个问题：未导入文章白/灰边框、文章正文实际宽度过窄、幽灵笔/高亮在真实运行时不可靠。

**Architecture:** 三个独立修复：
1. `AnthropicArticleRow` 边框 class 全状态覆盖
2. `markdown.css` + 内容容器 class 解除 `.md-body` 的 720px 限制
3. `ArticleAnnotations` 事件监听范围和清除条件修正

**Tech Stack:** React 18 + TypeScript + Tailwind CSS + Playwright (E2E) + Vitest (unit)

---

## 文件结构

| 文件 | 变更类型 | 关联问题 |
|------|---------|----------|
| `src/components/anthropic/AnthropicArticleRow.tsx` | 修改 | Issue 1 未导入文章边框 |
| `tests/anthropic-article-row.test.tsx` | 修改 | Issue 1 单元测试补全 |
| `src/components/md/markdown.css` | 修改 | Issue 6 正文宽度 |
| `src/components/anthropic/AnthropicArticleReader.tsx` | 修改 | Issue 6 添加 wrapper class |
| `src/components/briefing/AcademicBriefingLayout.tsx` | 修改 | Issue 6 添加 wrapper class |
| `src/components/briefing/NewspaperBriefingLayout.tsx` | 修改 | Issue 6 添加 wrapper class |
| `src/components/article-assistant/ArticleAnnotations.tsx` | 修改 | Issue 2 幽灵笔/高亮 |
| `e2e/specs/anthropic-blog-ui.spec.ts` | 修改 | E2E 补全 |
| `e2e/specs/article-annotations.spec.ts` | 修改 | E2E 补全 |

---

## Task 1: 修复未导入文章的白/灰边框

**Files:**
- Modify: `src/components/anthropic/AnthropicArticleRow.tsx`
- Modify: `tests/anthropic-article-row.test.tsx`

### Step 1: 修改 borderClass，为所有状态覆盖四边

编辑 `AnthropicArticleRow.tsx`：

```tsx
// Left border by state
let borderClass: string
let borderStyle: React.CSSProperties = {}
if (importing) {
  borderClass = isAcademic
    ? 'border-l-[3px] border-l-ember border-t-[rgba(232,213,183,0.12)] border-r-[rgba(232,213,183,0.12)] border-b-[rgba(232,213,183,0.12)]'
    : 'border-l-[3px] border-l-[#1a1a1a] border-t-[#c9c3b8]/30 border-r-[#c9c3b8]/30 border-b-[#c9c3b8]/30'
} else if (article.isSaved) {
  borderClass = isAcademic
    ? 'border-l-[3px] border-l-ember border-t-[rgba(232,213,183,0.12)] border-r-[rgba(232,213,183,0.12)] border-b-[rgba(232,213,183,0.12)]'
    : 'border-l-[3px] border-l-[#1a1a1a] border-t-[#c9c3b8]/30 border-r-[#c9c3b8]/30 border-b-[#c9c3b8]/30'
} else {
  borderClass = isAcademic
    ? 'border-l-[3px] border-l-[rgba(232,213,183,0.12)] border-t-[rgba(232,213,183,0.12)] border-r-[rgba(232,213,183,0.12)] border-b-[rgba(232,213,183,0.12)]'
    : 'border-l-[3px] border-l-[#c9c3b8]/30 border-t-[#c9c3b8]/30 border-r-[#c9c3b8]/30 border-b-[#c9c3b8]/30'
}
```

### Step 2: 更新单元测试，断言未导入文章四边覆盖

编辑 `tests/anthropic-article-row.test.tsx`，替换已有的 "subtle left border" 测试：

```tsx
it('applies brown top/right/bottom borders when article is unsaved (academic)', () => {
  render(<AnthropicArticleRow article={article({ isSaved: false })} theme="academic" />)
  const row = screen.getByTestId('anthropic-article-row')
  expect(row.className).toContain('border-l-[rgba(232,213,183,0.12)]')
  expect(row.className).toContain('border-t-[rgba(232,213,183,0.12)]')
  expect(row.className).toContain('border-r-[rgba(232,213,183,0.12)]')
  expect(row.className).toContain('border-b-[rgba(232,213,183,0.12)]')
})

it('applies brown top/right/bottom borders when article is unsaved (newspaper)', () => {
  render(<AnthropicArticleRow article={article({ isSaved: false })} theme="newspaper" />)
  const row = screen.getByTestId('anthropic-article-row')
  expect(row.className).toContain('border-l-[#c9c3b8]/30')
  expect(row.className).toContain('border-t-[#c9c3b8]/30')
  expect(row.className).toContain('border-r-[#c9c3b8]/30')
  expect(row.className).toContain('border-b-[#c9c3b8]/30')
})
```

### Step 3: 运行单元测试

```bash
npx vitest run tests/anthropic-article-row.test.tsx
```

Expected: PASS

### Step 4: Commit

```bash
git add src/components/anthropic/AnthropicArticleRow.tsx tests/anthropic-article-row.test.tsx
git commit -m "fix(ui): apply brown borders on all four sides for unsaved Anthropic article rows"
```

---

## Task 2: 解除 .md-body 的 720px 宽度限制

**Files:**
- Modify: `src/components/md/markdown.css`
- Modify: `src/components/anthropic/AnthropicArticleReader.tsx`
- Modify: `src/components/briefing/AcademicBriefingLayout.tsx`
- Modify: `src/components/briefing/NewspaperBriefingLayout.tsx`

### Step 1: 添加 briefing 文章场景下的宽度覆盖

编辑 `src/components/md/markdown.css`，在 `.md-body` 规则后新增：

```css
/* In briefing/article readers the outer container already centers and caps width,
   so remove the internal 720px limit so text actually uses the wider area. */
.briefing-article-body .md-body {
  max-width: none;
  margin: 0;
}
```

### Step 2: 在三个内容容器上添加 wrapper class

`AnthropicArticleReader.tsx:164`：

```tsx
<div className="relative w-[95%] max-w-[1600px] min-w-[520px] mx-auto px-6 py-10 pb-24 briefing-article-body">
```

`AcademicBriefingLayout.tsx:31`：

```tsx
<div className="w-[95%] max-w-[1600px] min-w-[520px] mx-auto px-4 py-6 relative briefing-article-body">
```

`NewspaperBriefingLayout.tsx:31`：

```tsx
<article className="w-[95%] max-w-[1600px] min-w-[520px] mx-auto px-4 py-6 relative briefing-article-body">
```

### Step 3: 运行相关测试

```bash
npx vitest run tests/briefing-layout.test.tsx tests/briefing-page.test.tsx tests/anthropic-reader-theme.test.tsx
```

Expected: All PASS

### Step 4: Commit

```bash
git add src/components/md/markdown.css src/components/anthropic/AnthropicArticleReader.tsx src/components/briefing/AcademicBriefingLayout.tsx src/components/briefing/NewspaperBriefingLayout.tsx
git commit -m "fix(ui): remove .md-body 720px limit inside article readers so width fix actually applies"
```

---

## Task 3: 修复幽灵笔不显示 / 高亮迅速消失

**Files:**
- Modify: `src/components/article-assistant/ArticleAnnotations.tsx`

### Step 1: 将 mouseup 监听从 container 提升到 document

编辑 `handleMouseUp` 注册位置：

```tsx
// document 级 mouseup 能捕获拖拽选区释放，即使鼠标落在 article 外
document.addEventListener('mouseup', handleMouseUp)
return () => {
  document.removeEventListener('mouseup', handleMouseUp)
  document.removeEventListener('mousedown', handleMouseDown)
}
```

（`handleMouseDown` 已在 document 上，保持不变。）

### Step 2: 修正 mousedown 清除条件

编辑 `handleMouseDown`：

```tsx
const handleMouseDown = (e: MouseEvent) => {
  const target = e.target as HTMLElement

  // Only clear ghost + highlight when clicking truly outside the active selection UI
  const isInsideGhost = ghostRef.current?.contains(target) ?? false
  const isInsideHighlight = target.closest('[data-testid="anno-selection-highlight"]') !== null
  const isInsideMarker = target.closest('.anno-wrap') !== null
  const isInsideNoteCard = target.closest('[data-testid="anno-note-card"]') !== null

  if (!isInsideGhost && !isInsideHighlight && !isInsideMarker && !isInsideNoteCard) {
    setGhost(null)
    setSelectionHighlights([])
  }

  // Close note card if clicking outside both the marker pen and the note card
  const anchorEl = cardAnchorElRef.current
  if (
    anchorEl &&
    !anchorEl.contains(target) &&
    !target.closest('[data-testid="anno-note-card"]')
  ) {
    doSaveAndClose()
  }
}
```

### Step 3: 验证 ArticleAssistantPanel 的 mouseup 不破坏 selection

`ArticleAssistantPanel.tsx:49-61` 已存在 document mouseup 监听并调用 `setAssistantSelection`。该逻辑与 `ArticleAnnotations` 不冲突，只需确保 `ArticleAnnotations` 的 handleMouseUp 也在 document 上即可。

### Step 4: 运行测试

```bash
npx vitest run tests/article-assistant/
```

Expected: All PASS

### Step 5: Commit

```bash
git add src/components/article-assistant/ArticleAnnotations.tsx
git commit -m "fix(annotations): listen to mouseup on document, only clear highlight on outside clicks"
```

---

## Task 4: 补全 E2E 测试

**Files:**
- Modify: `e2e/specs/anthropic-blog-ui.spec.ts`
- Modify: `e2e/specs/article-annotations.spec.ts`

### Step 1: 博客边框 E2E 同时覆盖已保存和未保存

在 `anthropic-blog-ui.spec.ts` 已有测试基础上，新增对未保存行的断言：

```ts
test('未导入文章行四边均为棕色（无白/灰残留）', async ({ window }) => {
  const cover = new CoverPage(window)
  await cover.enterName('E2E 测试员')
  await cover.goToBriefing()
  await expect(window.locator(SELECTORS.briefing.page)).toBeVisible()

  await window.locator(SELECTORS.briefing.sourceAnthropicButton).click()
  const prompt = window.locator(SELECTORS.briefing.anthropicNewArticlesPrompt)
  await prompt.waitFor({ timeout: 120000 }).catch(() => {})
  if (await prompt.isVisible().catch(() => false)) await prompt.click()

  const rows = window.locator(SELECTORS.briefing.anthropicArticleRow)
  await rows.first().waitFor({ timeout: 120000 })

  const unsavedRow = rows.filter({ hasNot: window.locator(SELECTORS.briefing.anthropicArticleSaved) }).first()
  await expect(unsavedRow).toBeVisible()

  const colors = await unsavedRow.evaluate((el) => {
    const s = getComputedStyle(el)
    return {
      top: s.borderTopColor,
      right: s.borderRightColor,
      bottom: s.borderBottomColor,
      left: s.borderLeftColor,
    }
  })

  // Academic default: expect brown-ish, not rgb(229,231,235) Tailwind default gray
  expect(colors.top).not.toBe('rgb(229, 231, 235)')
  expect(colors.right).not.toBe('rgb(229, 231, 235)')
  expect(colors.bottom).not.toBe('rgb(229, 231, 235)')
})
```

### Step 2: 文章宽度 E2E 断言实际 computed width

替换已有的 "文章内容区使用加宽后的 95%/1600px" 测试：

```ts
test('文章内容区使用加宽后的 95%/1600px', async ({ window }) => {
  const cover = new CoverPage(window)
  await cover.enterName('E2E 测试员')
  await cover.goToBriefing()
  await expect(window.locator(SELECTORS.briefing.page)).toBeVisible()

  await window.locator(SELECTORS.briefing.sourceAnthropicButton).click()
  const prompt = window.locator(SELECTORS.briefing.anthropicNewArticlesPrompt)
  await prompt.waitFor({ timeout: 120000 }).catch(() => {})
  if (await prompt.isVisible().catch(() => false)) await prompt.click()

  const rows = window.locator(SELECTORS.briefing.anthropicArticleRow)
  await rows.first().waitFor({ timeout: 120000 })
  await rows.first().click()

  const reader = window.locator(SELECTORS.briefing.anthropicArticleReader)
  await reader.waitFor({ state: 'visible', timeout: 120000 })

  const content = window.locator(
    `${SELECTORS.briefing.anthropicArticleReader} .max-w-\\[1600px\\]`,
  )
  await expect(content).toBeVisible()
  await expect(content).toHaveClass(/w-\[95%\]/)

  // 关键回归：正文实际宽度必须接近容器宽度，而不是被内部 .md-body 压回 720px
  const firstPara = reader.locator('article p').first()
  await firstPara.waitFor({ state: 'visible', timeout: 15000 })
  const paraBox = await firstPara.boundingBox()
  const contentBox = await content.boundingBox()
  expect(paraBox).not.toBeNull()
  expect(contentBox).not.toBeNull()
  expect(paraBox!.width).toBeGreaterThan(contentBox!.width * 0.7)
})
```

### Step 3: 幽灵笔 E2E 覆盖真实鼠标拖拽

在 `article-annotations.spec.ts` 中新增：

```ts
test('E2E-A3: 真实鼠标拖拽选区后幽灵笔与高亮出现', async ({ window }) => {
  const cover = new CoverPage(window)
  await cover.enterName('E2E 测试员')
  await cover.goToBriefing()
  await expect(window.locator(SELECTORS.briefing.page)).toBeVisible()

  await window.locator(SELECTORS.briefing.sourceAnthropicButton).click()
  const prompt = window.locator(SELECTORS.briefing.anthropicNewArticlesPrompt)
  await prompt.waitFor({ timeout: 120000 }).catch(() => {})
  if (await prompt.isVisible().catch(() => false)) await prompt.click()

  const rows = window.locator(SELECTORS.briefing.anthropicArticleRow)
  await rows.first().waitFor({ timeout: 120000 })
  await rows.first().click()

  const reader = window.locator(SELECTORS.briefing.anthropicArticleReader)
  await reader.waitFor({ state: 'visible', timeout: 120000 })

  const p = window.locator('article p').first()
  await p.waitFor({ state: 'visible', timeout: 15000 })
  const box = await p.boundingBox()
  expect(box).not.toBeNull()

  // Drag-select first few characters inside the paragraph
  await window.mouse.move(box!.x + 10, box!.y + 10)
  await window.mouse.down()
  await window.mouse.move(box!.x + 120, box!.y + 10)
  await window.mouse.up()

  const ghostPen = window.locator(SELECTORS.annotations.ghostPen)
  await expect(ghostPen).toBeVisible({ timeout: 5000 })

  const highlight = window.locator(SELECTORS.annotations.selectionHighlight).first()
  await expect(highlight).toBeVisible({ timeout: 3000 })
})
```

### Step 4: 运行 E2E

```bash
npx playwright test e2e/specs/anthropic-blog-ui.spec.ts e2e/specs/article-annotations.spec.ts --project=chromium
```

Expected: 新增测试 PASS（真实 API 导入可能慢，保留 120s timeout）

### Step 5: Commit

```bash
git add e2e/specs/anthropic-blog-ui.spec.ts e2e/specs/article-annotations.spec.ts
git commit -m "test(e2e): assert real computed widths/border colors and real drag selection"
```

---

## Task 5: 清空导读缓存

用户要求顺手清空当前所有导读缓存，下次进入重新加载。

```bash
rm "C:\Users\86468\Desktop\学习库\Anthropic博客\2026-01\Demystifying evals for AI agents.guide.md"
rm "C:\Users\86468\Desktop\学习库\Anthropic博客\2026-04\An update on recent Claude Code quality reports.guide.md"
rm "C:\Users\86468\Desktop\学习库\Anthropic博客\2026-07\How we contain Claude across products.guide.md"
rm "C:\Users\86468\Desktop\学习库\夜航简报\夜航简报-2026-07-05.guide.md"
rm "C:\Users\86468\Desktop\学习库\夜航简报\夜航简报-2026-07-11.guide.md"
```

---

## 任务执行顺序

```
Task 1 (边框)  ──┐
Task 2 (宽度)  ──┼── 可并行
Task 3 (幽灵笔) ┤
                  ↓
Task 4 (E2E)   ─── 依赖 1-3
Task 5 (清缓存) ─── 独立
```

---

## 验收清单

- [ ] 未导入文章行 `border-top/right/bottom-color` 不是 Tailwind 默认灰
- [ ] 已保存文章行保持左橙 + 三边棕
- [ ] 文章正文 `p` 实际宽度 > 外层容器宽度的 70%
- [ ] 真实鼠标拖拽后 ghost pen 出现、highlight overlay 出现
- [ ] 点击高亮/ghost pen 外区域后 highlight + ghost pen 消失
- [ ] 点击幽灵笔创建标注后临时 highlight 消失
- [ ] 单元测试全部通过
- [ ] E2E 测试全部通过
- [ ] 所有 `.guide.md` 缓存文件已删除
- [ ] 报刊主题无回归
