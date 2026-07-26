# 夜航简报十点修复 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix 10 UX/visual defects on the briefing page: excessive dimming, candlelight improvements, missing assistant, button layout, naming/widths, writing collapse, job crash, duplicate dates, and animation flash.

**Architecture:** Surgical edits across ~12 files. Most changes are single-line CSS/Tailwind tweaks or prop removals. The most complex changes are: (a) BriefingSourceSidebar rail control vertical layout redesign, (b) E2E four-source switching cycle test.

**Tech Stack:** React 18 + TypeScript + Tailwind CSS + Zustand + Playwright (E2E)

---

### Task 1: #0 Lighten the page — BriefingVeil gradient reduction

**Files:**
- Modify: `src/components/briefing/BriefingVeil.tsx:20-23`
- Modify: `src/styles/globals.css:123-137`
- Modify: `src/pages/Briefing.tsx:189`

**Root cause:** BriefingVeil applies a fixed full-page dark gradient (top 30%→bottom 94% black) at opacity=1 permanently. Content shell has `bg-ink/45 backdrop-blur-md border` adding frosted glass + unnecessary border over the reading area.

- [ ] **Step 1: Reduce BriefingVeil gradient opacity**

Edit `src/components/briefing/BriefingVeil.tsx` lines 20-23, change the gradient stops:
```tsx
style={{
  opacity: flash ? 0.82 : 1,
  background:
    'linear-gradient(180deg, rgba(12,8,6,0.08) 0%, rgba(12,8,6,0.18) 26%, rgba(12,8,6,0.32) 55%, rgba(12,8,6,0.45) 100%)',
}}
```

- [ ] **Step 2: Reduce content shell overlay opacity and remove border**

Edit `src/pages/Briefing.tsx` line 189, change:
```tsx
// Before:
className={`flex-1 flex flex-col min-w-0 ${isAcademic ? 'bg-ink/45 backdrop-blur-md border border-parchment/15 rounded-xl overflow-hidden' : ''}`}
// After:
className={`flex-1 flex flex-col min-w-0 ${isAcademic ? 'bg-ink/30 backdrop-blur-md rounded-xl overflow-hidden' : ''}`}
```

- [ ] **Step 3: Reduce painting-vignette center radial**

Edit `src/styles/globals.css`, find the `.painting-vignette` block. Reduce the center radial gradient from `rgba(0,0,0,0.4)` to `rgba(0,0,0,0.2)`:
```css
/* In .painting-vignette block — change the third background layer */
radial-gradient(ellipse at center, transparent 35%, rgba(0,0,0,0.2) 100%)
```

- [ ] **Step 4: Run affected unit tests**

Run: `npx vitest run tests/briefing-page.test.tsx tests/briefing-sidebar.test.tsx`

Expected: All pass (no functional logic changed, only CSS values).

---

### Task 2: #1 Candlelight cursor auto-hide

**Files:**
- Modify: `src/components/briefing/CandlelightLayer.tsx:46-48,67-73`
- Modify: `src/styles/globals.css` (after line 316, end of candlelight block)

- [ ] **Step 1: Add cursor-hidden CSS rule**

Append to `src/styles/globals.css` after the candlelight block (line 316):
```css
/* 烛光随行：默认隐藏光标增强沉浸感，交互元素始终显示 */
.cursor-hidden { cursor: none; }
.cursor-hidden button, .cursor-hidden a, .cursor-hidden [role="button"],
.cursor-hidden input, .cursor-hidden textarea, .cursor-hidden [contenteditable],
.cursor-hidden summary, .cursor-hidden select, .cursor-hidden [tabindex] {
  cursor: auto;
}
```

- [ ] **Step 2: Toggle cursor-hidden class in CandlelightLayer**

Edit `src/components/briefing/CandlelightLayer.tsx`:

In the `onMove` handler (line 48), add cursor restoration:
```tsx
const onMove = (e: MouseEvent) => {
  target = { x: e.clientX, y: e.clientY }
  if (!seen) { pos = { ...target }; seen = true }
  glow.style.opacity = '1'
  document.documentElement.classList.remove('cursor-hidden')  // ADD
  armIdle()
}
```

In the `armIdle` timeout (line 46), add cursor hiding:
```tsx
const armIdle = () => {
  if (idleTimer) clearTimeout(idleTimer)
  idleTimer = window.setTimeout(() => {
    glow.style.opacity = '0'
    document.documentElement.classList.add('cursor-hidden')  // ADD
  }, IDLE_MS)
}
```

In the cleanup (lines 67-73), remove the class:
```tsx
return () => {
  cancelAnimationFrame(raf)
  if (idleTimer) clearTimeout(idleTimer)
  document.documentElement.classList.remove('cursor-hidden')  // ADD
  window.removeEventListener('mousemove', onMove)
  document.documentElement.removeEventListener('mouseleave', onLeave)
  window.removeEventListener('blur', onBlur)
}
```

---

### Task 3: #2 Candlelight z-index — raise above content panels

**Files:**
- Modify: `src/components/briefing/CandlelightLayer.tsx:109`

- [ ] **Step 1: Change z-[3] to z-[6]**

Edit `src/components/briefing/CandlelightLayer.tsx` line 109:
```tsx
// Before:
<div data-testid="briefing-candlelight" className="fixed inset-0 z-[3] pointer-events-none" aria-hidden="true">
// After:
<div data-testid="briefing-candlelight" className="fixed inset-0 z-[6] pointer-events-none" aria-hidden="true">
```

Rationale: All content panels are at z-[5]; ChatWindow is at z-50 (untouched). Candle at z-[6] sits between content and the floating chat window.

---

### Task 4: #3 Restore job briefing 旁注助手 (ArticleAssistantPanel guide)

**Files:**
- Modify: `src/pages/Briefing.tsx:454`

- [ ] **Step 1: Remove showGuide={false}**

Edit `src/pages/Briefing.tsx` line 454, change:
```tsx
// Before:
<ArticleAssistantPanel
  articleType="briefing"
  parentPath={jobResult.filePath}
  articleTitle={jobResult.title}
  articleContent={jobResult.content ?? ''}
  showGuide={false}
/>
// After:
<ArticleAssistantPanel
  articleType="briefing"
  parentPath={jobResult.filePath}
  articleTitle={jobResult.title}
  articleContent={jobResult.content ?? ''}
/>
```

This restores `showGuide` defaulting to `true`, so the guide sidebar renders for job briefings.

---

### Task 5: #4 Button vertical layout with candlelight-style icons

**Files:**
- Modify: `src/components/BriefingSourceSidebar.tsx:186-275`

- [ ] **Step 1: Change rail controls to vertical stack**

Replace the entire rail controls `<div>` (lines 186-275) with a vertical layout. Each control is a circular `w-8 h-8` icon button matching the candlelight/plate toggle style.

```tsx
<div
  data-testid="briefing-rail-controls"
  className={`flex flex-col items-center gap-2 p-2 ${themeClasses.railBorder}`}
>
  {/* Row 1: Back to cover — circular icon */}
  <button
    type="button"
    data-testid="briefing-back-to-cover"
    onClick={() => goto('home')}
    className={`w-8 h-8 rounded-full border flex items-center justify-center transition-colors ${
      isAcademic ? 'border-parchment/25 text-parchment/50 hover:text-parchment hover:border-parchment/40' : 'border-[#2a1f1a]/25 text-[#2a1f1a]/50 hover:text-[#2a1f1a]'
    }`}
    title="返回首页"
  >
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
      <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
      <polyline points="9 22 9 12 15 12 15 22"/>
    </svg>
  </button>

  {/* Row 2: Font size group (horizontal pair) */}
  <div className="flex items-center gap-1">
    {source === 'writing' ? (
      <>
        <button type="button" data-testid="writing-ui-font-size-decrease" disabled={!canDecreaseWritingUI}
          onClick={() => void decreaseWritingUI()}
          className={`w-8 h-8 rounded-full border flex items-center justify-center text-sm transition-colors ${
            canDecreaseWritingUI
              ? (isAcademic ? 'border-parchment/25 text-parchment/50 hover:text-parchment' : 'border-[#2a1f1a]/25 text-[#2a1f1a]/50 hover:text-[#2a1f1a]')
              : 'border-transparent text-parchment/20 cursor-not-allowed'
          }`}
          title="减小界面字号">−</button>
        <button type="button" data-testid="writing-ui-font-size-increase" disabled={!canIncreaseWritingUI}
          onClick={() => void increaseWritingUI()}
          className={`w-8 h-8 rounded-full border flex items-center justify-center text-sm transition-colors ${
            canIncreaseWritingUI
              ? (isAcademic ? 'border-parchment/25 text-parchment/50 hover:text-parchment' : 'border-[#2a1f1a]/25 text-[#2a1f1a]/50 hover:text-[#2a1f1a]')
              : 'border-transparent text-parchment/20 cursor-not-allowed'
          }`}
          title="增大界面字号">+</button>
      </>
    ) : (
      <>
        <button type="button" data-testid="briefing-font-size-decrease" disabled={!canDecrease}
          onClick={decrease}
          className={`w-8 h-8 rounded-full border flex items-center justify-center text-sm transition-colors ${
            canDecrease
              ? (isAcademic ? 'border-parchment/25 text-parchment/50 hover:text-parchment' : 'border-[#2a1f1a]/25 text-[#2a1f1a]/50 hover:text-[#2a1f1a]')
              : 'border-transparent text-parchment/20 cursor-not-allowed'
          }`}
          title="减小字号">−</button>
        <button type="button" data-testid="briefing-font-size-increase" disabled={!canIncrease}
          onClick={increase}
          className={`w-8 h-8 rounded-full border flex items-center justify-center text-sm transition-colors ${
            canIncrease
              ? (isAcademic ? 'border-parchment/25 text-parchment/50 hover:text-parchment' : 'border-[#2a1f1a]/25 text-[#2a1f1a]/50 hover:text-[#2a1f1a]')
              : 'border-transparent text-parchment/20 cursor-not-allowed'
          }`}
          title="增大字号">+</button>
      </>
    )}
  </div>

  {/* Row 3: Theme toggle — circular icon */}
  <BriefingThemeToggle />

  {/* Row 4: Candlelight toggle — academic only (hidden in newspaper, not just disabled) */}
  {isAcademic && (
    <button type="button" data-testid="briefing-candlelight-toggle" aria-pressed={candle}
      onClick={() => void toggleCandle()}
      className={`w-8 h-8 rounded-full border flex items-center justify-center transition-colors ${
        candle
          ? 'border-ember/60 text-ember bg-ember/10'
          : 'border-parchment/25 text-parchment/50'
      }`}
      title="烛光随行">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
        <path d="M12 3c1.5 2.5 3.5 4.2 3.5 7a3.5 3.5 0 1 1-7 0c0-1.5.6-2.6 1.4-3.7.3 1 .9 1.7 1.6 2.2C11.6 6.6 11.7 4.8 12 3z"/><path d="M9 21h6"/>
      </svg>
    </button>
  )}

  {/* Row 5: Painting plate toggle — academic only */}
  {isAcademic && painting && (
    <button type="button" data-testid="painting-plate-toggle" aria-pressed={plate}
      onClick={() => void togglePlate()}
      className={`w-8 h-8 rounded-full border flex items-center justify-center transition-colors ${
        plate
          ? 'border-ember/60 text-ember bg-ember/10'
          : 'border-parchment/25 text-parchment/50'
      }`}
      title="并置画框">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
        <rect x="3" y="5" width="18" height="14" rx="1"/><rect x="6.5" y="8" width="11" height="8"/>
      </svg>
    </button>
  )}

  {/* Row 6: Job profile entry — only for job-briefing source */}
  {source === 'job-briefing' && (
    <button
      type="button"
      data-testid="job-briefing-profile-entry"
      onClick={() => goto('settings')}
      className={`w-8 h-8 rounded-full border flex items-center justify-center transition-colors text-[10px] ${
        isAcademic ? 'border-parchment/25 text-parchment/50 hover:text-parchment' : 'border-[#2a1f1a]/25 text-[#2a1f1a]/50 hover:text-[#2a1f1a]'
      }`}
      title="编辑求职档案"
    >档案</button>
  )}
</div>
```

Remove `import { BackToCover } from './BackToCover'` and `import { Button } from './Button'` (no longer used). Remove the `BackToCover` usage on line 190.

- [ ] **Step 2: Update BriefingThemeToggle to match circular style**

Read current `BriefingThemeToggle` — if it already matches the `w-8 h-8 rounded-full border` style, no change needed. If not, ensure it uses the same pattern.

- [ ] **Step 3: Run sidebar unit tests**

Run: `npx vitest run tests/briefing-sidebar.test.tsx`

Expected: Tests that reference the old `BackToCover` or `Button` components within the rail controls may need updating. Update test assertions to match new button elements. Candle/plate toggle tests should still pass (unchanged testids).

---

### Task 6: #5 Rename sources + tighten column widths

**Files:**
- Modify: `src/components/BriefingSourceSidebar.tsx:116-141` (navItems labels)
- Modify: `src/components/BriefingSourceSidebar.tsx:146` (sidebar width)
- Modify: `src/pages/Briefing.tsx:209,235` (date column width)
- Modify: `src/components/BriefingDateColumn.tsx:91` (date button padding)

- [ ] **Step 1: Update source names**

Edit `src/components/BriefingSourceSidebar.tsx` lines 116-141:
```tsx
const navItems = [
  {
    id: 'writing',
    label: '写作',
    icon: () => <span>✍️</span>,
    testId: 'briefing-source-writing',
  },
  {
    id: 'digest',
    label: '前沿',
    icon: DigestIcon,
    testId: 'briefing-source-digest',
  },
  {
    id: 'anthropic',
    label: '博客',
    icon: AnthropicIcon,
    testId: 'briefing-source-anthropic',
  },
  {
    id: 'job-briefing',
    label: '求职',
    icon: JobBriefingIcon,
    testId: 'briefing-source-job-briefing',
  },
] as const
```

- [ ] **Step 2: Tighten sidebar width**

Edit `src/components/BriefingSourceSidebar.tsx` line 146:
```tsx
// Before: collapsed ? 'w-14' : 'w-48'
// After: collapsed ? 'w-14' : 'w-40'
className={`h-full flex flex-col transition-all ${collapsed ? 'w-14' : 'w-40'} ...`}
```

- [ ] **Step 3: Tighten date column width from w-64 to w-44**

Edit `src/pages/Briefing.tsx`:
- Line 209: `width={64}` → `width={44}`
- Line 235: `width={64}` → `width={44}`

Update `src/components/BriefingListColumn.tsx` line 7 to allow `44`:
```tsx
width?: 44 | 64 | 80
```
And line 31:
```tsx
const widthClass = width === 80 ? 'w-80' : width === 44 ? 'w-44' : 'w-64'
```

- [ ] **Step 4: Reduce date button horizontal padding**

Edit `src/components/BriefingDateColumn.tsx` around line 91, change `px-3` to `px-2`:
```tsx
// In the date entry button className
className={`w-full text-left px-2 py-2 rounded ...`}
```

---

### Task 7: #6 Writing collapsed view — show recent files + boost toggle visibility

**Files:**
- Modify: `src/components/writing/WritingListColumn.tsx:50-63`
- Modify: `src/components/BriefingListColumn.tsx:40-47`

- [ ] **Step 1: Add circular background to collapse toggle**

Edit `src/components/BriefingListColumn.tsx` lines 40-47:
```tsx
<button
  data-testid="briefing-list-column-toggle"
  onClick={onToggle}
  className={`w-7 h-7 rounded-full flex items-center justify-center text-sm transition-colors ${
    isAcademic ? 'text-parchment/60 hover:text-parchment hover:bg-parchment/10' : 'text-[#2a1f1a]/60 hover:text-[#2a1f1a] hover:bg-[#1a1a1a]/5'
  }`}
  title={collapsed ? '展开' : '折叠'}
>
  {collapsed ? '▶' : '◀'}
</button>
```

- [ ] **Step 2: Show recent files in collapsed writing view**

Edit `src/components/writing/WritingListColumn.tsx` lines 50-63. Instead of just counts, show up to 3 recent file names as clickable vertical-rl text. Add `useStore` import for `selectWritingFile` and access the tree:

```tsx
if (collapsed) {
  // Collect up to 3 recent file names from the writing tree for mini-navigation
  const recentFiles: { name: string; path: string }[] = []
  const collect = (nodes: typeof tree) => {
    if (!nodes) return
    for (const n of nodes.writing ?? []) {
      if (n.kind === 'file') {
        recentFiles.push({ name: n.name, path: n.path })
      } else if (n.children) {
        for (const c of n.children) {
          if (c.kind === 'file') recentFiles.push({ name: c.name, path: c.path })
          if (recentFiles.length >= 3) return
        }
      }
      if (recentFiles.length >= 3) return
    }
  }
  collect(tree)

  return (
    <div className="flex flex-col items-center py-3 gap-3 h-full">
      <span
        data-testid="writing-collapsed-expand"
        className={`cursor-pointer text-xs ${isAcademic ? 'text-parchment/60 hover:text-ember' : 'text-[#6b5d52] hover:text-[#2a1f1a]'}`}
        style={{ writingMode: 'vertical-rl' }}
        title="展开文章列表"
      >文章</span>
      <span data-testid="writing-collapsed-articles-count" className="min-w-[18px] px-1 py-0.5 rounded-full text-[10px] text-center bg-ember text-white">
        {countFiles(tree?.writing)}
      </span>
      {recentFiles.map((f, i) => (
        <button
          key={i}
          data-testid={`writing-collapsed-recent-${i}`}
          onClick={() => selectWritingFile(f.path)}
          className={`text-[10px] truncate max-w-[40px] ${isAcademic ? 'text-parchment/40 hover:text-parchment/70' : 'text-[#6b5d52]/50 hover:text-[#6b5d52]'}`}
          style={{ writingMode: 'vertical-rl' }}
          title={f.name}
        >{f.name.length > 6 ? f.name.slice(0, 6) + '…' : f.name}</button>
      ))}
      <div className="flex-1" />
      <span className={dim} style={{ writingMode: 'vertical-rl' }}>仓库</span>
      <span data-testid="writing-collapsed-repository-count" className={`min-w-[18px] px-1 py-0.5 rounded-full text-[10px] text-center ${isAcademic ? 'bg-parchment/20 text-parchment' : 'bg-[#1a1a1a] text-white'}`}>
        {countFiles(tree?.repository)}
      </span>
    </div>
  )
}
```

This gives the user 3 clickable mini-labels to jump to recent files while collapsed, plus the "文章" label is now clickable hinting at expand.

---

### Task 8: #7 E2E — Four-source switching cycle test

**Files:**
- Create: `e2e/specs/briefing-source-switching.spec.ts`
- Modify: `e2e/source-map.json` (add new spec to briefing group)

**Pre-check:** Job profile panel E2E already exists at `e2e/specs/job-briefing-profile-panel.spec.ts` (17 tests). Four-source switching cycle does NOT exist — only digest↔job in `briefing-rail-layout.spec.ts`.

- [ ] **Step 1: Write the four-source switching cycle E2E spec**

Create `e2e/specs/briefing-source-switching.spec.ts`:
```ts
import { test, expect } from '../fixtures/electron'
import { CoverPage } from '../pages/CoverPage'
import { SELECTORS } from '../helpers/selectors'

test.describe('@p1 briefing source switching', () => {
  test('cycles through all four sources without crash', async ({ window }) => {
    const cover = new CoverPage(window)
    await cover.enterName('E2E 测试员')
    await cover.goToBriefing()

    // Start on digest
    await expect(window.locator(SELECTORS.briefing.sourceSidebar)).toBeVisible()
    await expect(window.locator(SELECTORS.briefing.dateColumn)).toBeVisible()

    // Switch to writing
    await window.locator(SELECTORS.writing.sourceButton).click()
    await expect(window.locator(SELECTORS.writing.boardEmpty)).toBeVisible({ timeout: 5000 })

    // Switch to anthropic
    await window.locator(SELECTORS.briefing.sourceAnthropicButton).click()
    await expect(window.locator(SELECTORS.briefing.anthropicPanel)).toBeVisible({ timeout: 10000 })

    // Switch to job-briefing
    await window.locator(SELECTORS.briefing.sourceJobBriefingButton).click()
    await expect(window.locator(SELECTORS.briefing.receiveJobButton)).toBeVisible({ timeout: 5000 })

    // Switch back to digest
    await window.locator(SELECTORS.briefing.sourceDigestButton).click()
    await expect(window.locator(SELECTORS.briefing.dateColumn)).toBeVisible({ timeout: 5000 })

    // Full cycle again to verify no cumulative state corruption
    await window.locator(SELECTORS.writing.sourceButton).click()
    await expect(window.locator(SELECTORS.writing.boardEmpty)).toBeVisible({ timeout: 5000 })
    await window.locator(SELECTORS.briefing.sourceAnthropicButton).click()
    await expect(window.locator(SELECTORS.briefing.anthropicPanel)).toBeVisible({ timeout: 10000 })

    // No error boundary should appear at any point
    await expect(window.locator('[data-testid="error-boundary"]')).toHaveCount(0)
  })

  test('source sidebar shows correct active state for each source', async ({ window }) => {
    const cover = new CoverPage(window)
    await cover.enterName('E2E 测试员')
    await cover.goToBriefing()

    // Check each source button gets active styling when selected
    const sources = [
      { selector: SELECTORS.writing.sourceButton, name: 'writing' },
      { selector: SELECTORS.briefing.sourceDigestButton, name: 'digest' },
      { selector: SELECTORS.briefing.sourceAnthropicButton, name: 'anthropic' },
      { selector: SELECTORS.briefing.sourceJobBriefingButton, name: 'job-briefing' },
    ]

    for (const { selector } of sources) {
      await window.locator(selector).click()
      await window.waitForTimeout(300) // let React commit
      // Active button should have border-l class (active indicator)
      await expect(window.locator(selector)).toHaveClass(/border-l/)
    }
  })
})
```

- [ ] **Step 2: Add to source-map**

Edit `e2e/source-map.json`, in the `briefing` group's `specs` array, append:
```json
"briefing-source-switching.spec.ts"
```

- [ ] **Step 3: Check selectors**

Verify `SELECTORS.briefing.dateColumn` and `SELECTORS.briefing.anthropicPanel` exist in `e2e/helpers/selectors.ts`. If `dateColumn` is missing, check if `briefing-list-column` is the correct selector — use `[data-testid="briefing-date-column"]` directly if needed.

Check `SELECTORS.briefing.errorBoundary` — if it doesn't exist, use `[data-testid="error-boundary"]` directly in the test (used above).

---

### Task 9: #8 Fix duplicate date — formatGeneratedAt returns time only

**Files:**
- Modify: `src/pages/Briefing.tsx:38-50`

- [ ] **Step 1: Simplify formatGeneratedAt to always return only time**

Edit `src/pages/Briefing.tsx` lines 38-50:
```tsx
function formatGeneratedAt(iso: string, _date: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleTimeString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
}
```

The `date` parameter is now unused (kept for API compatibility — callers at lines 338, 397, 420 pass two args). Mark as `_date` to signal intent.

- [ ] **Step 2: Run date column unit tests**

Run: `npx vitest run tests/briefing-page.test.tsx`

Expected: All pass. The date column test at line 48 only checks for element presence, not text content.

---

### Task 10: #9 Suppress BriefingProgress when result already exists

**Files:**
- Modify: `src/pages/Briefing.tsx:284-291,369-375`

- [ ] **Step 1: Guard BriefingProgress rendering**

The crash/rendering logic for digest generation (lines 369-375) and job generation (lines 284-291) shows `BriefingProgress` when `phase` is `'generating' | 'resolved' | 'departing'`. When `result` already exists (revisit), suppress this:

For digest (around line 369), change:
```tsx
) : digestPhase === 'generating' || digestPhase === 'resolved' || digestPhase === 'departing' ? (
```
to:
```tsx
) : (digestPhase === 'generating' || digestPhase === 'resolved' || digestPhase === 'departing') && !result ? (
```

For job-briefing (around line 284), change:
```tsx
) : jobPhase === 'generating' || jobPhase === 'resolved' || jobPhase === 'departing' ? (
```
to:
```tsx
) : (jobPhase === 'generating' || jobPhase === 'resolved' || jobPhase === 'departing') && !jobResult ? (
```

The `!result` / `!jobResult` guard ensures BriefingProgress only renders when no cached result exists. When content is already available, the phase transition from idle→generating→resolved is suppressed from UI — the content renders directly via the `result ? (...)` branch below.

- [ ] **Step 2: Run source switching unit test**

Run: `npx vitest run tests/briefing-page.test.tsx`

Expected: All pass. The source switching test cycles between sources; with this fix, switching to digest when result is null should still show empty state (not progress).

---

### Task 11: Update tests for new labels and layout

**Files:**
- Modify: `tests/briefing-sidebar.test.tsx`

- [ ] **Step 1: Update label references in tests**

Search for old labels (`AI 日报`, `Anthropic 博客`, `求职简报`) in `tests/briefing-sidebar.test.tsx` and replace with new labels (`前沿`, `博客`, `求职`).

- [ ] **Step 2: Update rail control test assertions**

If tests reference `BackToCover` or `Button` components inside the rail controls, update to match the new circular icon buttons. Testid names remain the same (`briefing-font-size-decrease`, etc.).

- [ ] **Step 3: Run all affected tests**

Run: `npx vitest run tests/briefing-page.test.tsx tests/briefing-sidebar.test.tsx`

Expected: All pass.

---

### Task 12: Run targeted E2E verification

- [ ] **Step 1: Run targeted E2E**

Run: `node scripts/e2e-changed.js --run`

This will pick up all changed specs (briefing-source-switching.spec.ts is new, plus any others whose source-map entries match changed source files).

- [ ] **Step 2: Verify no regressions**

Check output for failures. If any spec fails, investigate before proceeding.
