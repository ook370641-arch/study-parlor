# 外部资料摘要面板 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 Study Parlor 学习页增加一个可展开/收起的右侧外部资料摘要面板，完整展示 5000 字以内的带引注摘要，并配套 E2E 测试。

**Architecture:** 新增 `ExternalSummaryPanel` 组件作为右侧 380px 覆盖层抽屉；通过 Zustand store 的 `isExternalSummaryOpen` 控制显隐；`ExternalMaterialsCard` 增加「摘要」入口；主进程仅调整 prompt 字数上限；E2E 通过直接操作 `window.useStore` 注入 mock 摘要数据来覆盖真实流程。

**Tech Stack:** React 18 + TypeScript + Tailwind CSS + Zustand + Electron + Playwright E2E

---

## File Structure

| File | Responsibility |
|------|----------------|
| `electron/lib/search.ts` | 调整 `generateTutorBrief` prompt，字数上限 3000 → 5000 |
| `src/store/index.ts` | 新增 `isExternalSummaryOpen` 状态及 `open/close/toggleExternalSummary` 方法 |
| `src/components/ExternalSummaryPanel.tsx` | 新增抽屉式摘要面板组件（动画、内容渲染、关闭手势） |
| `src/components/ExternalMaterialsCard.tsx` | 增加「摘要 →」入口，点击打开面板 |
| `src/pages/Study.tsx` | 挂载面板组件；根据面板状态给消息列表添加右侧 padding；处理 Esc 关闭 |
| `e2e/helpers/selectors.ts` | 新增摘要面板相关 data-testid |
| `e2e/pages/StudyPage.ts` | 新增打开/关闭/断言面板可见性的方法 |
| `e2e/specs/external-materials-summary-panel.spec.ts` | 新增 E2E 测试用例 |

---

## Task 1: 调整摘要生成 prompt 字数上限

**Files:**
- Modify: `electron/lib/search.ts:124`

**Goal:** 让 LLM 生成的导师备课笔记最长可达 5000 中文字。

- [ ] **Step 1: 修改 prompt 中的字数限制**

  将 `electron/lib/search.ts` 第 124 行：

  ```ts
  1. 控制在 3000 中文字以内
  ```

  改为：

  ```ts
  1. 控制在 5000 中文字以内
  ```

- [ ] **Step 2: 运行相关单元测试**

  Run:
  ```bash
  npx vitest run tests/search.test.ts
  ```

  Expected: PASS（该文件测试的是查询生成与 Tavily 调用，prompt 文本变更不影响断言）。

- [ ] **Step 3: Commit**

  ```bash
  git add electron/lib/search.ts
  git commit -m "feat(search): increase tutor brief limit from 3000 to 5000 chars"
  ```

---

## Task 2: 新增 Store 状态与操作方法

**Files:**
- Modify: `src/store/index.ts`

**Goal:** 在 AppStore 根层级增加 `isExternalSummaryOpen` 及操作方法。

- [ ] **Step 1: 在 AppStore 类型中添加状态字段**

  在 `src/store/index.ts` 的 `AppStore` 类型中，找到 `// 外部资料` 区块（约第 101 行），在其上方或附近添加：

  ```ts
  // 外部资料摘要面板
  isExternalSummaryOpen: boolean
  ```

  完整上下文示例：

  ```ts
  // 外部资料摘要面板
  isExternalSummaryOpen: boolean

  // 外部资料
  externalMaterials: {
    summary: string | null
    sources: SearchSource[]
    loading: boolean
    error: SearchErrorCode | null
  } | null
  ```

- [ ] **Step 2: 在 AppStore 类型中添加操作方法**

  在 `// 外部资料操作` 区块（约第 140 行）中添加：

  ```ts
  // 外部资料摘要面板操作
  openExternalSummary: () => void
  closeExternalSummary: () => void
  toggleExternalSummary: () => void
  ```

  完整上下文示例：

  ```ts
  // 外部资料操作
  prepareExternalMaterials: (topic: string) => Promise<void>
  setExternalMaterials: (materials: SearchResult) => void
  setExternalMaterialsError: (error: SearchErrorCode) => void
  clearExternalMaterials: () => void

  // 外部资料摘要面板操作
  openExternalSummary: () => void
  closeExternalSummary: () => void
  toggleExternalSummary: () => void
  ```

- [ ] **Step 3: 在 store 初始值中添加默认值**

  在 `useStore` 的初始对象中（约第 202 行 `externalMaterials: null` 附近）添加：

  ```ts
  isExternalSummaryOpen: false,
  ```

  完整上下文示例：

  ```ts
  externalMaterials: null,
  isExternalSummaryOpen: false,
  modal: null,
  ```

- [ ] **Step 4: 在 store 实现中添加操作方法**

  在 `clearExternalMaterials: () => set({ externalMaterials: null })` 之后（约第 424 行）添加：

  ```ts
  openExternalSummary: () => set({ isExternalSummaryOpen: true }),
  closeExternalSummary: () => set({ isExternalSummaryOpen: false }),
  toggleExternalSummary: () => set(s => ({ isExternalSummaryOpen: !s.isExternalSummaryOpen })),
  ```

- [ ] **Step 5: 运行 store 单元测试**

  Run:
  ```bash
  npx vitest run tests/store.test.ts
  ```

  Expected: PASS。

- [ ] **Step 6: Commit**

  ```bash
  git add src/store/index.ts
  git commit -m "feat(store): add isExternalSummaryOpen state and actions"
  ```

---

## Task 3: 创建 ExternalSummaryPanel 组件

**Files:**
- Create: `src/components/ExternalSummaryPanel.tsx`

**Goal：** 实现一个右侧 380px 抽屉面板，展示摘要内容、来源引注及来源列表。

- [ ] **Step 1: 创建组件文件**

  创建 `src/components/ExternalSummaryPanel.tsx`，内容如下：

  ```tsx
  import { useEffect, useRef } from 'react'
  import Markdown from 'react-markdown'
  import { useStore } from '@/store'
  import type { SearchSource } from '@shared/index'

  const PANEL_WIDTH = 380

  function SourceTag({ index }: { index: number }) {
    return (
      <a
        href={`#external-source-${index}`}
        className="text-ember text-[10px] ml-0.5 hover:underline"
        onClick={(e) => {
          e.preventDefault()
          const el = document.getElementById(`external-source-${index}`)
          el?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
        }}
      >
        [{index}]
      </a>
    )
  }

  function SourceList({ sources }: { sources: SearchSource[] }) {
    return (
      <div className="border-t border-parchment/10 pt-3 mt-4">
        <h4 className="text-ember text-[11px] font-semibold uppercase tracking-wider mb-2">来源</h4>
        <ul className="space-y-2">
          {sources.map((source, i) => {
            const num = i + 1
            return (
              <li
                key={num}
                id={`external-source-${num}`}
                data-testid={`external-summary-source-${num}`}
                className="text-[11px]"
              >
                <span className="text-ember font-semibold min-w-[1.25rem] inline-block">[{num}]</span>
                <a
                  href={source.url}
                  target="_blank"
                  rel="noreferrer"
                  className="text-ember hover:underline break-all"
                  title={source.snippet}
                >
                  {source.title || source.url}
                </a>
              </li>
            )
          })}
        </ul>
      </div>
    )
  }

  function SummaryContent({ summary, sources }: { summary: string; sources: SearchSource[] }) {
    // Convert plain [n] citations into markdown anchor links so they become clickable.
    const processed = summary.replace(/\[(\d+)\]/g, '[$1](#external-source-$1)')

    return (
      <>
        <Markdown
          components={{
            a: ({ href, children }) => {
              const match = href?.match(/^#external-source-(\d+)$/)
              if (match) {
                return <SourceTag index={Number(match[1])} />
              }
              return (
                <a href={href} target="_blank" rel="noreferrer" className="text-ember hover:underline">
                  {children}
                </a>
              )
            },
            h1: ({ children }) => <h4 className="text-ember text-[11px] font-semibold uppercase tracking-wider mt-4 mb-2 first:mt-0">{children}</h4>,
            h2: ({ children }) => <h4 className="text-ember text-[11px] font-semibold uppercase tracking-wider mt-4 mb-2 first:mt-0">{children}</h4>,
            h3: ({ children }) => <h4 className="text-ember text-[11px] font-semibold uppercase tracking-wider mt-4 mb-2 first:mt-0">{children}</h4>,
            p: ({ children }) => <p className="mb-2 text-parchment/80 leading-relaxed">{children}</p>,
          }}
        >
          {processed}
        </Markdown>
        {sources.length > 0 && <SourceList sources={sources} />}
      </>
    )
  }

  export function ExternalSummaryPanel() {
    const isOpen = useStore(s => s.isExternalSummaryOpen)
    const materials = useStore(s => s.externalMaterials)
    const closeExternalSummary = useStore(s => s.closeExternalSummary)
    const panelRef = useRef<HTMLDivElement>(null)

    useEffect(() => {
      if (!isOpen) return
      const onKey = (e: KeyboardEvent) => {
        if (e.key === 'Escape') closeExternalSummary()
      }
      window.addEventListener('keydown', onKey)
      return () => window.removeEventListener('keydown', onKey)
    }, [isOpen, closeExternalSummary])

    if (!isOpen) return null

    const hasSummary = !!materials?.summary
    const sources = materials?.sources ?? []

    return (
      <>
        {/* Transparent click-capture layer between panel and chat */}
        <div
          data-testid="external-summary-backdrop"
          className="fixed inset-0 z-[14]"
          style={{ right: `${PANEL_WIDTH}px` }}
          onClick={closeExternalSummary}
          aria-hidden="true"
        />
        <div
          ref={panelRef}
          data-testid="external-summary-panel"
          className="fixed right-0 top-0 bottom-0 z-[15] flex flex-col bg-[rgba(22,17,14,0.98)] border-l border-parchment/15 shadow-[-10px_0_40px_rgba(0,0,0,0.5)]"
          style={{ width: `${PANEL_WIDTH}px` }}
        >
          <div className="h-12 border-b border-parchment/10 px-4 flex items-center justify-between shrink-0">
            <div className="flex items-center gap-2 text-sm text-parchment font-sans">
              <span>🌐</span>
              <span>外部资料摘要</span>
            </div>
            <button
              data-testid="external-summary-close"
              onClick={closeExternalSummary}
              className="text-parchment/50 hover:text-parchment text-sm px-1"
              aria-label="关闭摘要面板"
            >
              ✕
            </button>
          </div>

          <div className="flex-1 overflow-y-auto px-4 py-4 text-[13px] leading-[1.75] text-parchment/80 font-serif">
            {!hasSummary ? (
              <div className="text-parchment/50 italic">暂无摘要</div>
            ) : (
              <SummaryContent summary={materials.summary!} sources={sources} />
            )}
          </div>
        </div>
      </>
    )
  }
  ```

- [ ] **Step 2: 运行 TypeScript 类型检查**

  Run:
  ```bash
  npx tsc --noEmit
  ```

  Expected: 无新增类型错误。

- [ ] **Step 3: Commit**

  ```bash
  git add src/components/ExternalSummaryPanel.tsx
  git commit -m "feat(ui): add ExternalSummaryPanel drawer component"
  ```

---

## Task 4: 在 ExternalMaterialsCard 增加摘要入口

**Files:**
- Modify: `src/components/ExternalMaterialsCard.tsx`

**Goal：** 让用户可以从现有的「外部资料」卡片打开摘要面板。

- [ ] **Step 1: 引入 store action**

  在文件顶部添加：

  ```tsx
  import { useStore } from '@/store'
  ```

  注意文件已导入 `useStore`，确认后直接复用。

- [ ] **Step 2: 读取 openExternalSummary**

  在组件内部，获取 `openExternalSummary`：

  ```tsx
  export function ExternalMaterialsCard() {
    const session = useStore(s => s.session)
    const materials = useStore(s => s.externalMaterials)
    const openExternalSummary = useStore(s => s.openExternalSummary)
    const [expanded, setExpanded] = useState(false)
    // ...
  ```

- [ ] **Step 3: 替换「展开/收起」为摘要入口**

  找到右侧的「展开/收起」按钮（约第 36-38 行），保留展开来源列表的功能，但在未展开时显示「摘要 →」入口。

  修改后的按钮区域应如下：

  ```tsx
  <button
    onClick={() => setExpanded(v => !v)}
    className="w-full px-4 py-3 flex items-center justify-between text-sm hover:bg-parchment/5 transition-colors"
  >
    <div className="flex items-center gap-2.5">
      <span aria-hidden="true">🌐</span>
      <span className="text-parchment/90">外部资料</span>
      {materials.loading && (
        <span className="text-xs text-parchment/50">收集中…</span>
      )}
      {!materials.loading && hasSources && (
        <span className="text-xs bg-ember/15 text-ember px-2 py-0.5 rounded-full">
          {materials.sources.length} 个来源
        </span>
      )}
      {isReview && (
        <span className="text-xs text-parchment/40">来自历史学习</span>
      )}
    </div>
    <div className="flex items-center gap-3">
      {!materials.loading && hasSources && (
        <button
          type="button"
          data-testid="external-summary-open"
          onClick={(e) => {
            e.stopPropagation()
            openExternalSummary()
          }}
          className="text-xs text-ember hover:underline"
        >
          摘要 →
        </button>
      )}
      <span className="text-ember text-xs">
        {expanded ? '收起' : '展开'}
      </span>
    </div>
  </button>
  ```

  说明：点击「摘要 →」打开面板；点击「展开/收起」仍折叠来源列表。

- [ ] **Step 4: 运行 TypeScript 类型检查**

  Run:
  ```bash
  npx tsc --noEmit
  ```

  Expected: 无新增类型错误。

- [ ] **Step 5: Commit**

  ```bash
  git add src/components/ExternalMaterialsCard.tsx
  git commit -m "feat(ui): add summary panel entry to ExternalMaterialsCard"
  ```

---

## Task 5: 在 Study 页面集成面板

**Files:**
- Modify: `src/pages/Study.tsx`

**Goal：** 挂载 `ExternalSummaryPanel`，并在面板展开时给消息列表添加右侧 padding，避免气泡被遮挡。

- [ ] **Step 1: 导入组件**

  在文件顶部导入：

  ```tsx
  import { ExternalSummaryPanel } from '@/components/ExternalSummaryPanel'
  ```

- [ ] **Step 2: 读取面板状态**

  在 `Study` 组件内部，读取 `isExternalSummaryOpen`：

  ```tsx
  export function Study() {
    const session = useStore(s => s.session)
    const isExternalSummaryOpen = useStore(s => s.isExternalSummaryOpen)
    const t = useTerminology()
    // ...
  ```

- [ ] **Step 3: 挂载面板并调整消息列表 padding**

  找到消息列表 div（约第 227 行），修改 `className`，根据面板状态动态添加 `pr-[380px]`：

  ```tsx
  <div
    data-testid="message-list"
    ref={scrollRef}
    className={`relative z-[5] flex-1 overflow-y-auto px-8 py-4 max-w-4xl w-full mx-auto transition-all duration-300 ${
      isExternalSummaryOpen ? 'pr-[380px]' : ''
    }`}
  >
  ```

  注意：这里使用 `pr-[380px]` 配合 `max-w-4xl` 与 `mx-auto`。由于面板是 fixed 定位，`pr-[380px]` 会让内容在可见左部区域内保持可读；如果屏幕较窄导致 `max-w-4xl + padding` 超出，内容会自动左移。

- [ ] **Step 4: 在页面中挂载 ExternalSummaryPanel**

  在 `return` 的 JSX 中，在 `ArchiveReportModal` 之后、`</>` 之前，或 Study 页面根 `div` 同级位置挂载面板：

  ```tsx
  {/* External materials summary panel */}
  <ExternalSummaryPanel />
  ```

  建议放在 `ArchiveReportModal` 代码块之后、Study 根 `div` 之前：

  ```tsx
  <>
    {/* Archive loading overlay */}
    {archiving && !archiveResult && <ArchiveLoadingOverlay onBack={onArchiveBack} />}

    {/* Archive report modal */}
    {archiveResult && (
      <ArchiveReportModal
        result={archiveResult}
        onClose={handleArchiveClose}
      />
    )}

    {/* External materials summary panel */}
    <ExternalSummaryPanel />

    <div data-testid="study-page" className={`relative h-full flex flex-col ${isExiting ? 'study-exit' : ''}`}>
    {/* ... */}
  ```

- [ ] **Step 5: 运行 TypeScript 类型检查**

  Run:
  ```bash
  npx tsc --noEmit
  ```

  Expected: 无新增类型错误。

- [ ] **Step 6: Commit**

  ```bash
  git add src/pages/Study.tsx
  git commit -m "feat(ui): integrate ExternalSummaryPanel into Study page"
  ```

---

## Task 6: 新增 E2E 选择器

**Files:**
- Modify: `e2e/helpers/selectors.ts`

**Goal：** 为测试提供稳定的定位器。

- [ ] **Step 1: 在 study 选择器区块添加新常量**

  在 `e2e/helpers/selectors.ts` 的 `study` 对象中（约第 75 行 `externalMaterialsCard` 之后）添加：

  ```ts
  externalSummaryOpen: '[data-testid="external-summary-open"]',
  externalSummaryPanel: '[data-testid="external-summary-panel"]',
  externalSummaryBackdrop: '[data-testid="external-summary-backdrop"]',
  externalSummaryClose: '[data-testid="external-summary-close"]',
  externalSummarySource: (n: number) => `[data-testid="external-summary-source-${n}"]`,
  ```

- [ ] **Step 2: Commit**

  ```bash
  git add e2e/helpers/selectors.ts
  git commit -m "test(e2e): add selectors for external summary panel"
  ```

---

## Task 7: 更新 StudyPage POM

**Files:**
- Modify: `e2e/pages/StudyPage.ts`

**Goal：** 为 E2E 测试封装摘要面板的操作方法。

- [ ] **Step 1: 添加 locators**

  在 `StudyPage` 类中，构造函数之后添加：

  ```ts
  readonly externalSummaryOpen: Locator
  readonly externalSummaryPanel: Locator
  readonly externalSummaryBackdrop: Locator
  readonly externalSummaryClose: Locator
  ```

  在构造函数中初始化：

  ```ts
  this.externalSummaryOpen = page.locator(SELECTORS.study.externalSummaryOpen)
  this.externalSummaryPanel = page.locator(SELECTORS.study.externalSummaryPanel)
  this.externalSummaryBackdrop = page.locator(SELECTORS.study.externalSummaryBackdrop)
  this.externalSummaryClose = page.locator(SELECTORS.study.externalSummaryClose)
  ```

- [ ] **Step 2: 添加方法**

  在类末尾添加：

  ```ts
  async openExternalSummary() {
    await this.externalSummaryOpen.click()
    await this.externalSummaryPanel.waitFor({ state: 'visible' })
  }

  async closeExternalSummary() {
    await this.externalSummaryClose.click()
    await this.externalSummaryPanel.waitFor({ state: 'hidden' })
  }

  async closeExternalSummaryByBackdrop() {
    await this.externalSummaryBackdrop.click()
    await this.externalSummaryPanel.waitFor({ state: 'hidden' })
  }

  async closeExternalSummaryByEsc() {
    await this.page.keyboard.press('Escape')
    await this.externalSummaryPanel.waitFor({ state: 'hidden' })
  }

  async isExternalSummaryVisible(): Promise<boolean> {
    return this.externalSummaryPanel.isVisible()
  }

  async getExternalSummaryText(): Promise<string | null> {
    return this.externalSummaryPanel.textContent()
  }

  async setMockExternalMaterials(summary: string, sources: { title: string; url: string; snippet?: string }[]) {
    await this.page.evaluate((args) => {
      const store = (window as any).useStore
      store.getState().setExternalMaterials({
        summary: args.summary,
        sources: args.sources,
      })
    }, { summary, sources })
  }
  ```

- [ ] **Step 3: Commit**

  ```bash
  git add e2e/pages/StudyPage.ts
  git commit -m "test(e2e): add ExternalSummaryPanel POM methods"
  ```

---

## Task 8: 创建 E2E 测试

**Files:**
- Create: `e2e/specs/external-materials-summary-panel.spec.ts`

**Goal：** 覆盖默认关闭、打开/关闭、来源引注、不遮挡对话内容等场景。

- [ ] **Step 1: 创建测试文件**

  创建 `e2e/specs/external-materials-summary-panel.spec.ts`，内容如下：

  ```ts
  import { test, expect } from '../fixtures/electron'
  import { CoverPage } from '../pages/CoverPage'
  import { HomePage } from '../pages/HomePage'
  import { PreStudyPage } from '../pages/PreStudyPage'
  import { StudyPage } from '../pages/StudyPage'
  import { seedStateJson } from '../helpers/test-library'

  test.describe('@p1 external materials summary panel', () => {
    test.beforeEach(async ({ testConfigDir }) => {
      seedStateJson(testConfigDir, {
        profile: { name: '摘要面板测试', profile_text: '', preferred_topics: [] },
      })
    })

    test('panel is closed by default and toggle is visible', async ({ window }) => {
      const cover = new CoverPage(window)
      await cover.enterIfNeeded('摘要面板测试')

      const home = new HomePage(window)
      await home.waitForLoaded()
      await home.startNewTopic()

      const preStudy = new PreStudyPage(window)
      await preStudy.waitForVisible()
      await preStudy.fillTopic('量子纠缠')
      await preStudy.clickStart()

      const study = new StudyPage(window)
      await study.waitForLoaded()

      // Inject mock external materials directly to avoid real network calls.
      await study.setMockExternalMaterials(
        '核心概念：量子纠缠是两个粒子的关联状态。\n关键区分点：纠缠不等于超距作用[1]。',
        [
          { title: 'Wikipedia: Quantum entanglement', url: 'https://example.com/1', snippet: 'Wikipedia' },
          { title: 'Nature: Bell tests', url: 'https://example.com/2', snippet: 'Nature' },
        ]
      )

      await expect(study.externalMaterialsCard).toBeVisible()
      await expect(study.externalSummaryOpen).toBeVisible()
      await expect(study.externalSummaryPanel).toBeHidden()
    })

    test('opens and closes summary panel', async ({ window }) => {
      const cover = new CoverPage(window)
      await cover.enterIfNeeded('摘要面板测试')

      const home = new HomePage(window)
      await home.waitForLoaded()
      await home.startNewTopic()

      const preStudy = new PreStudyPage(window)
      await preStudy.waitForVisible()
      await preStudy.fillTopic('量子纠缠')
      await preStudy.clickStart()

      const study = new StudyPage(window)
      await study.waitForLoaded()
      await study.setMockExternalMaterials(
        '常见误解：纠缠不能用于超光速通信[1]。',
        [{ title: 'Source 1', url: 'https://example.com/1' }]
      )

      await study.openExternalSummary()
      await expect(study.externalSummaryPanel).toContainText('外部资料摘要')
      await expect(study.externalSummaryPanel).toContainText('常见误解')

      await study.closeExternalSummary()
      await expect(study.externalSummaryPanel).toBeHidden()

      await study.openExternalSummary()
      await study.closeExternalSummaryByEsc()
      await expect(study.externalSummaryPanel).toBeHidden()
    })

    test('source citations are clickable and scroll to source list', async ({ window }) => {
      const cover = new CoverPage(window)
      await cover.enterIfNeeded('摘要面板测试')

      const home = new HomePage(window)
      await home.waitForLoaded()
      await home.startNewTopic()

      const preStudy = new PreStudyPage(window)
      await preStudy.waitForVisible()
      await preStudy.fillTopic('量子纠缠')
      await preStudy.clickStart()

      const study = new StudyPage(window)
      await study.waitForLoaded()
      await study.setMockExternalMaterials(
        '核心概念：纠缠描述两个粒子的关联[1][2]。',
        [
          { title: 'Wikipedia: Quantum entanglement', url: 'https://example.com/1' },
          { title: 'Nature: Bell tests', url: 'https://example.com/2' },
        ]
      )

      await study.openExternalSummary()
      await expect(study.externalSummaryPanel).toContainText('[1]')

      // Click citation [2].
      await study.externalSummaryPanel.locator('text=[2]').first().click()
      const source2 = window.locator('[data-testid="external-summary-source-2"]')
      await expect(source2).toBeVisible()

      await study.closeExternalSummary()
    })

    test('panel does not cover chat bubbles when open', async ({ window }) => {
      const cover = new CoverPage(window)
      await cover.enterIfNeeded('摘要面板测试')

      const home = new HomePage(window)
      await home.waitForLoaded()
      await home.startNewTopic()

      const preStudy = new PreStudyPage(window)
      await preStudy.waitForVisible()
      await preStudy.fillTopic('量子纠缠')
      await preStudy.clickStart()

      const study = new StudyPage(window)
      await study.waitForLoaded()
      await study.setMockExternalMaterials(
        '核心概念：纠缠描述两个粒子的关联[1]。',
        [{ title: 'Source 1', url: 'https://example.com/1' }]
      )

      // Inject a mock assistant message so the test does not depend on real LLM streaming.
      await window.evaluate(() => {
        const store = (window as any).useStore
        const session = store.getState().session
        if (session) {
          store.setState({
            session: {
              ...session,
              history: [
                ...session.history,
                { role: 'assistant', content: '这是一条比较长的测试回复，用于验证当右侧摘要面板展开时，聊天消息气泡不会被面板遮挡。' }
              ]
            }
          })
        }
      })

      await study.openExternalSummary()

      const messageList = study.messageList
      const listBox = await messageList.boundingBox()
      const panelBox = await study.externalSummaryPanel.boundingBox()
      expect(listBox).not.toBeNull()
      expect(panelBox).not.toBeNull()

      // The right edge of the message list should not extend past the left edge of the panel.
      // The message list has pr-[380px] when the panel is open.
      expect(listBox!.x + listBox!.width).toBeLessThanOrEqual(panelBox!.x + 2)

      await study.closeExternalSummary()
    })
  })
  ```

  注意：`waitForHistoryLength` 已存在于 `StudyPage`。`setMockExternalMaterials` 在 Task 7 中添加。遮挡测试通过 `window.useStore` 注入 mock 消息，避免依赖真实 LLM 流。

- [ ] **Step 2: 运行 E2E 测试**

  Run:
  ```bash
  npx playwright test e2e/specs/external-materials-summary-panel.spec.ts --project=chromium
  ```

  Expected: 4 个测试全部 PASS。

- [ ] **Step 3: Commit**

  ```bash
  git add e2e/specs/external-materials-summary-panel.spec.ts
  git commit -m "test(e2e): add external materials summary panel specs"
  ```

---

## Task 9: 验证完整流程

**Files:**
- 无新文件

**Goal：** 确保所有变更协同工作。

- [ ] **Step 1: 运行单元测试**

  Run:
  ```bash
  npm run test
  ```

  Expected: 全部 PASS（包括 `tests/store.test.ts`、`tests/search.test.ts` 等）。

- [ ] **Step 2: 运行 TypeScript 类型检查**

  Run:
  ```bash
  npx tsc --noEmit
  ```

  Expected: 无类型错误。

- [ ] **Step 3: 运行 E2E 相关测试**

  Run:
  ```bash
  npx playwright test e2e/specs/external-materials-summary-panel.spec.ts e2e/specs/external-materials.spec.ts --project=chromium
  ```

  Expected: 全部 PASS。

- [ ] **Step 4: 手动冒烟（可选）**

  Run:
  ```bash
  npm run dev
  ```

  手动验证：
  1. 新建主题，勾选「引入联网资料」。
  2. 进入学习页，等待外部资料收集完成。
  3. 点击「外部资料」卡片上的「摘要 →」。
  4. 确认右侧 380px 面板滑出，展示摘要与来源。
  5. 发送一条消息，确认气泡不被面板覆盖。
  6. 按 Esc 或点击面板外区域，确认面板关闭。

- [ ] **Step 5: Commit（如产生变更）**

  如果冒烟过程中修复了 bug，分别提交每个修复。

---

## Self-Review Checklist

### Spec Coverage

| Spec 要求 | 对应 Task |
|-----------|-----------|
| 面板默认关闭 | Task 2（store 初始值 `false`） |
| 380px 宽覆盖层抽屉 | Task 3（`PANEL_WIDTH = 380`） |
| 摘要字数 5000 | Task 1（prompt 调整） |
| 来源引注 `[n]` + 底部来源列表 | Task 3（`SummaryContent`、`SourceList`） |
| 不遮挡对话窗口 | Task 5（消息列表 `pr-[380px]`） |
| E2E 测试覆盖 | Task 6、7、8 |

### Placeholder Scan

- 无 TBD/TODO。
- 所有代码步骤均提供完整代码片段。
- 所有命令均提供预期输出。

### Type Consistency

- `isExternalSummaryOpen` 在 store 类型、初始值、操作方法中名称一致。
- `setExternalMaterials` 参数类型与现有 `SearchResult` 一致。
- 选择器 `externalSummarySource` 的 `data-testid` 与组件中一致。

---

## Execution Handoff

**Plan complete and saved to `docs/superpowers/plans/2026-07-06-external-materials-summary-panel-plan.md`.**

Two execution options:

1. **Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration
2. **Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints

**Which approach?**
