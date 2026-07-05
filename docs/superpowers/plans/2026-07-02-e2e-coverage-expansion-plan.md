# E2E 覆盖率扩张实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 补全 Study Parlor 所有已设计功能的 E2E 测试，覆盖 V2 OKR A 类（A0/A1/A2/A5）和 V1.0.2 功能性缺口，并通过"批量分析-批量修改-批量验证"的子 agent 流水线迭代调试，确保每个 phase 的 E2E 通过且功能实现冻结。

**Architecture:** 按 Phase 1-4 分阶段实现，每阶段先扩展公共基础设施（fixture/seed/page object），再编写/扩展 spec，最后批量跑测并派子 agent 修复失败。V2 A 类每个 phase 以"E2E 通过 + 功能冻结"为验收；V1.0.2 以补测试为主，仅做最小 bug 修复。

**Tech Stack:** Playwright + Electron CDP + TypeScript + Zustand mock + 本地 seed/fixture。

---

## 文件结构映射

### 新增文件

| 文件 | 职责 |
|---|---|
| `e2e/pages/ExtensionPage.ts` | Extension 页面导航与内容断言 |
| `e2e/pages/TerminologyPanel.ts` | "我的语言"面板交互 |
| `e2e/pages/BriefingPage.ts` | 简报生成流程、主题切换、历史抽屉、错误展示 |
| `e2e/pages/FableStyleDialog.ts` | 寓言风格对话框封装 |
| `e2e/pages/ConfirmDialog.ts` | 确认对话框封装 |
| `e2e/specs/terminology.spec.ts` | A2 DIY 术语 |
| `e2e/specs/wild-card.spec.ts` | A5 意外之径 |
| `e2e/specs/briefing-generation.spec.ts` | A0 简报自动生成 |
| `e2e/specs/external-materials.spec.ts` | A1 外部资料 |
| `e2e/specs/fable-generation.spec.ts` | 寓言生成与风格对话框 |
| `e2e/specs/library-pagination.spec.ts` | 学习库分页与 accordion |
| `e2e/specs/library-drag-and-delete.spec.ts` | 拖拽分组、删除确认 |
| `e2e/specs/continue-suggestions.spec.ts` | 继续学习推荐 |
| `e2e/specs/diagram-generation.spec.ts` | 学习图表生成与补生成 |
| `e2e/specs/extension-page.spec.ts` | Extension 页面内容 |
| `e2e/specs/group-guide.spec.ts` | 分组引导按钮 |

### 修改文件

| 文件 | 修改内容 |
|---|---|
| `e2e/fixtures/electron.ts` | 透传 `TAVILY_API_KEY`；支持 custom fixture 删除 Tavily key |
| `e2e/helpers/test-library.ts` | 新增 seed helpers（terminology、wild card、external materials、no-fable、no-diagram、continue suggestions） |
| `e2e/helpers/selectors.ts` | 补充缺少的 `data-testid` selector |
| `e2e/pages/LibraryPage.ts` | 扩展分页、拖拽、删除方法 |
| `e2e/pages/HomePage.ts` | 扩展 wild card、group rec refresh 方法 |
| `e2e/pages/PreStudyPage.ts` | 扩展外部资料 toggle、继续推荐卡片方法 |
| `e2e/pages/StudyPage.ts` | 扩展 external materials card、归档 overlay 断言 |
| `e2e/pages/SettingsPage.ts` | 扩展 Tavily key、显隐切换、取消重置方法 |
| `electron/ipc/llm.ts` | 为 `generateContinueSuggestions`、`generateGroupInspiration`、`wildCardInspiration`、`briefing:generate`、`searchPrepare` 增加 `NODE_ENV=test` mock 分支 |
| `electron/ipc/tavily.ts` | 支持 `TAVILY_BASE_URL` 覆盖，为第二批 mock server 做准备 |
| `src/types/index.ts` | 必要时补充 `IpcApi` 类型 |
| 现有 spec 文件 | 按设计文档第 5 节加深断言 |

---

## Phase 1：不依赖外部 API 的 A 类 + V1.0.2 入口

目标：A2 术语、A5 意外之径、Extension 页面、Group Guide 按钮全部覆盖，且 E2E 通过。

### Task 1: 扩展 seed helpers 支持 Phase 1

**Files:**
- Modify: `e2e/helpers/test-library.ts`
- Test: 后续 spec 使用

- [ ] **Step 1: 新增 `seedTerminology` helper**

```typescript
export function seedTerminology(
  configDir: string,
  terminology: Record<string, string>
): void {
  const statePath = path.join(configDir, 'state.json')
  const base = {
    profile: { name: 'E2E 测试员', profile_text: '', preferred_topics: [] },
    lastUsed: { difficulty: 'mid', temperature: 0.7 },
    session_count: 0,
    groups: [],
    activeGroupId: null,
    groupInspirations: {},
    topicContinueSuggestions: {},
    unsavedSessions: [],
    pendingArchives: [],
    archiveResult: null,
    terminology: {},
  }
  const state = fs.existsSync(statePath)
    ? JSON.parse(fs.readFileSync(statePath, 'utf8'))
    : base
  state.terminology = { ...state.terminology, ...terminology }
  fs.writeFileSync(statePath, JSON.stringify(state, null, 2), 'utf8')
}
```

- [ ] **Step 2: 新增 `seedWildCardInspiration` helper**

```typescript
export function seedWildCardInspiration(
  configDir: string,
  payload: { title: string; hook: string; topic: string }
): void {
  const statePath = path.join(configDir, 'state.json')
  const base = {
    profile: { name: 'E2E 测试员', profile_text: '', preferred_topics: [] },
    lastUsed: { difficulty: 'mid', temperature: 0.7 },
    session_count: 0,
    groups: [],
    activeGroupId: null,
    groupInspirations: {},
    topicContinueSuggestions: {},
    unsavedSessions: [],
    pendingArchives: [],
    archiveResult: null,
    terminology: {},
  }
  const state = fs.existsSync(statePath)
    ? JSON.parse(fs.readFileSync(statePath, 'utf8'))
    : base
  state.wildCardInspiration = payload
  fs.writeFileSync(statePath, JSON.stringify(state, null, 2), 'utf8')
}
```

- [ ] **Step 3: 运行现有 E2E 确保没有破坏**

Run: `npm run test:e2e:smoke`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add e2e/helpers/test-library.ts
git commit -m "test(e2e): add seedTerminology and seedWildCardInspiration helpers"
```

### Task 2: 新增 ExtensionPage 和 TerminologyPanel page objects

**Files:**
- Create: `e2e/pages/ExtensionPage.ts`
- Create: `e2e/pages/TerminologyPanel.ts`
- Modify: `e2e/helpers/selectors.ts`（如缺少 selector 则补充）

- [ ] **Step 1: 创建 `ExtensionPage.ts`**

```typescript
import type { Page } from '@playwright/test'
import { SELECTORS } from '../helpers/selectors'

export class ExtensionPage {
  constructor(private page: Page) {}

  async goto() {
    await this.page.locator(SELECTORS.home.extensionButton).click()
    await this.page.locator(SELECTORS.extension.page).waitFor({ state: 'visible' })
  }

  async waitForLoaded() {
    await this.page.locator(SELECTORS.extension.page).waitFor({ state: 'visible' })
  }

  get terminologyPanel() {
    return this.page.locator(SELECTORS.extension.terminologyPanel)
  }

  get libraryDirectoryCard() {
    return this.page.locator(SELECTORS.extension.libraryDirectoryCard)
  }

  get localAgentCard() {
    return this.page.locator(SELECTORS.extension.localAgentCard)
  }

  get customPicturesCard() {
    return this.page.locator(SELECTORS.extension.customPicturesCard)
  }
}
```

- [ ] **Step 2: 创建 `TerminologyPanel.ts`**

```typescript
import type { Page } from '@playwright/test'
import { SELECTORS } from '../helpers/selectors'

export class TerminologyPanel {
  constructor(private page: Page) {}

  get panel() {
    return this.page.locator(SELECTORS.extension.terminologyPanel)
  }

  async inputForField(field: string) {
    return this.page.locator(SELECTORS.extension.terminologyInput(field))
  }

  async setField(field: string, value: string) {
    const input = await this.inputForField(field)
    await input.fill(value)
  }

  async resetField(field: string) {
    await this.page.locator(SELECTORS.extension.terminologyReset(field)).click()
  }

  async resetAll() {
    await this.page.locator(SELECTORS.extension.terminologyResetAll).click()
  }

  get previewCard() {
    return this.page.locator(SELECTORS.extension.terminologyPreview)
  }
}
```

- [ ] **Step 3: 在 `selectors.ts` 中补充 Extension selector**

```typescript
extension: {
  page: '[data-testid="extension-page"]',
  terminologyPanel: '[data-testid="terminology-panel"]',
  terminologyInput: (field: string) => `[data-testid="terminology-input-${field}"]`,
  terminologyReset: (field: string) => `[data-testid="terminology-reset-${field}"]`,
  terminologyResetAll: '[data-testid="terminology-reset-all"]',
  terminologyPreview: '[data-testid="terminology-preview"]',
  libraryDirectoryCard: '[data-testid="extension-library-directory-card"]',
  localAgentCard: '[data-testid="extension-local-agent-card"]',
  customPicturesCard: '[data-testid="extension-custom-pictures-card"]',
},
library: {
  // merge into existing library selectors
  groupGuidePopover: '[data-testid="group-guide-popover"]',
},
```

- [ ] **Step 4: Commit**

```bash
git add e2e/pages/ExtensionPage.ts e2e/pages/TerminologyPanel.ts e2e/helpers/selectors.ts
git commit -m "test(e2e): add ExtensionPage and TerminologyPanel page objects"
```

### Task 3: 编写 A2 术语 E2E spec

**Files:**
- Create: `e2e/specs/terminology.spec.ts`
- Test: `npm run test:e2e -- e2e/specs/terminology.spec.ts`

- [ ] **Step 1: 编写 `terminology.spec.ts`**

```typescript
import { test as base, expect } from '../fixtures/electron'
import { HomePage } from '../pages/HomePage'
import { ExtensionPage } from '../pages/ExtensionPage'
import { TerminologyPanel } from '../pages/TerminologyPanel'
import { CoverPage } from '../pages/CoverPage'
import { SELECTORS } from '../helpers/selectors'
import { createTestConfigDir, cleanupTestConfigDir, seedTerminology } from '../helpers/test-library'
import * as fs from 'node:fs'
import * as path from 'node:path'

const test = base.extend({
  testConfigDir: async ({}, use, testInfo) => {
    const dir = createTestConfigDir()
    // Pre-seed terminology before app boots so the store reads it on startup.
    if (testInfo.title.includes('after reload') || testInfo.title.includes('reset field')) {
      seedTerminology(dir, { enterButton: '启程' })
    }
    await use(dir)
    await cleanupTestConfigDir(dir, testInfo.status === 'failed' || testInfo.status === 'timedOut')
  },
})

test.describe('@p1 terminology', () => {
  test('panel visible on extension page', async ({ window }) => {
    const cover = new CoverPage(window)
    await cover.enterIfNeeded()
    const home = new HomePage(window)
    await home.waitForLoaded()
    const extension = new ExtensionPage(window)
    await extension.goto()
    await expect(extension.terminologyPanel).toBeVisible()
  })

  test('modifying ritual verb updates UI and persists', async ({ window, testConfigDir }) => {
    const cover = new CoverPage(window)
    await cover.enterIfNeeded()
    const home = new HomePage(window)
    await home.waitForLoaded()
    const extension = new ExtensionPage(window)
    await extension.goto()
    const panel = new TerminologyPanel(window)
    await panel.setField('enterButton', '启明')
    await expect(panel.previewCard).toContainText('启明')
    const statePath = path.join(testConfigDir, 'state.json')
    const state = JSON.parse(fs.readFileSync(statePath, 'utf8'))
    expect(state.terminology.enterButton).toBe('启明')
  })

  test('modified label reflects on Cover after reload', async ({ window }) => {
    const cover = new CoverPage(window)
    await cover.enterIfNeeded()
    const button = window.locator(SELECTORS.cover.enterButton)
    await expect(button).toContainText('启程')
  })

  test('reset field restores default', async ({ window, testConfigDir }) => {
    const cover = new CoverPage(window)
    await cover.enterIfNeeded()
    const home = new HomePage(window)
    await home.waitForLoaded()
    const extension = new ExtensionPage(window)
    await extension.goto()
    const panel = new TerminologyPanel(window)
    await panel.resetField('enterButton')
    const statePath = path.join(testConfigDir, 'state.json')
    const state = JSON.parse(fs.readFileSync(statePath, 'utf8'))
    expect(state.terminology.enterButton).toBeUndefined()
  })
})
```

- [ ] **Step 2: 运行测试并收集失败**

Run: `npm run test:e2e -- e2e/specs/terminology.spec.ts`
Expected: 可能有 selector/testid/功能缺失失败

- [ ] **Step 3: 派子 agent 批量修复失败**

按失败模式分类后并行派发：
- selector 缺失 → 改组件加 `data-testid`
- 功能未实现 → 检查 `useTerminology()`  adoption

- [ ] **Step 4: 重新运行直到通过**

Run: `npm run test:e2e -- e2e/specs/terminology.spec.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add e2e/specs/terminology.spec.ts
git commit -m "test(e2e): add terminology coverage"
```

### Task 4: 扩展 HomePage 支持 wild card 断言

**Files:**
- Modify: `e2e/pages/HomePage.ts`
- Modify: `e2e/helpers/selectors.ts`

- [ ] **Step 1: 在 `selectors.ts` 中补充 wild card selector**

```typescript
home: {
  // ... existing selectors
  wildCardCard: '[data-testid="wild-card-card"]',
  wildCardTitle: '[data-testid="wild-card-title"]',
  wildCardHook: '[data-testid="wild-card-hook"]',
  wildCardRefresh: '[data-testid="wild-card-refresh"]',
},
```

- [ ] **Step 2: 在 `HomePage.ts` 中扩展方法**

```typescript
get wildCardCard() {
  return this.page.locator(SELECTORS.home.wildCardCard)
}

get wildCardTitle() {
  return this.page.locator(SELECTORS.home.wildCardTitle)
}

get wildCardHook() {
  return this.page.locator(SELECTORS.home.wildCardHook)
}

async refreshWildCard() {
  await this.page.locator(SELECTORS.home.wildCardRefresh).click()
  await expect(this.wildCardTitle).not.toHaveText('', { timeout: 30000 })
}
```

- [ ] **Step 3: Commit**

```bash
git add e2e/pages/HomePage.ts e2e/helpers/selectors.ts
git commit -m "test(e2e): extend HomePage for wild card"
```

### Task 5: 编写 A5 意外之径 E2E spec

**Files:**
- Create: `e2e/specs/wild-card.spec.ts`

- [ ] **Step 1: 编写 `wild-card.spec.ts`**

```typescript
import { test as base, expect } from '../fixtures/electron'
import { CoverPage } from '../pages/CoverPage'
import { HomePage } from '../pages/HomePage'
import { PreStudyPage } from '../pages/PreStudyPage'
import { createTestConfigDir, cleanupTestConfigDir, seedWildCardInspiration } from '../helpers/test-library'

const test = base.extend({
  testConfigDir: async ({}, use, testInfo) => {
    const dir = createTestConfigDir()
    seedWildCardInspiration(dir, {
      title: '量子烹饪学',
      hook: '当粒子对撞机遇上分子料理',
      topic: '量子烹饪学',
    })
    await use(dir)
    await cleanupTestConfigDir(dir, testInfo.status === 'failed' || testInfo.status === 'timedOut')
  },
})

test.describe('@p1 wild card recommendation', () => {
  test('displays wild card card from seed', async ({ window }) => {
    const cover = new CoverPage(window)
    await cover.enterIfNeeded()
    const home = new HomePage(window)
    await home.waitForLoaded()
    await expect(home.wildCardCard).toBeVisible()
    await expect(home.wildCardTitle).toContainText('量子烹饪学')
    await expect(home.wildCardHook).toContainText('粒子对撞机')
  })

  test('clicking wild card fills PreStudy topic', async ({ window }) => {
    const cover = new CoverPage(window)
    await cover.enterIfNeeded()
    const home = new HomePage(window)
    await home.waitForLoaded()
    await home.wildCardCard.click()
    const preStudy = new PreStudyPage(window)
    await preStudy.waitForVisible()
    const value = await preStudy.topicInput.inputValue()
    expect(value).toBe('量子烹饪学')
  })
})
```

- [ ] **Step 2: 运行并修复失败**

Run: `npm run test:e2e -- e2e/specs/wild-card.spec.ts`
Expected: 初始可能失败，按 12.2 流水线派子 agent 修复

- [ ] **Step 3: 通过后 commit**

```bash
git add e2e/specs/wild-card.spec.ts
git commit -m "test(e2e): add wild card recommendation coverage"
```

### Task 6: 编写 Extension 页面与 Group Guide 按钮 spec

**Files:**
- Create: `e2e/specs/extension-page.spec.ts`
- Create: `e2e/specs/group-guide.spec.ts`

- [ ] **Step 1: 编写 `extension-page.spec.ts`**

```typescript
import { test, expect } from '../fixtures/electron'
import { CoverPage } from '../pages/CoverPage'
import { HomePage } from '../pages/HomePage'
import { ExtensionPage } from '../pages/ExtensionPage'

test.describe('@p1 extension page', () => {
  test('shows three cards and library path', async ({ window, testLibraryPath }) => {
    const cover = new CoverPage(window)
    await cover.enterIfNeeded()
    const home = new HomePage(window)
    await home.waitForLoaded()
    const extension = new ExtensionPage(window)
    await extension.goto()
    await expect(extension.libraryDirectoryCard).toContainText(testLibraryPath)
    await expect(extension.localAgentCard).toBeVisible()
    await expect(extension.customPicturesCard).toBeVisible()
  })
})
```

- [ ] **Step 2: 编写 `group-guide.spec.ts`**

```typescript
import { test, expect } from '../fixtures/electron'
import { CoverPage } from '../pages/CoverPage'
import { HomePage } from '../pages/HomePage'
import { SELECTORS } from '../helpers/selectors'

test.describe('@p1 group guide', () => {
  test('opens and closes guide popover', async ({ window }) => {
    const cover = new CoverPage(window)
    await cover.enterIfNeeded()
    const home = new HomePage(window)
    await home.waitForLoaded()
    await window.locator(SELECTORS.library.groupGuideButton).click()
    const popover = window.locator(SELECTORS.library.groupGuidePopover)
    await expect(popover).toBeVisible()
    await window.locator('body').click()
    await expect(popover).toBeHidden()
  })
})
```

- [ ] **Step 3: 批量跑 Phase 1 所有 spec**

Run: `npm run test:e2e -- e2e/specs/terminology.spec.ts e2e/specs/wild-card.spec.ts e2e/specs/extension-page.spec.ts e2e/specs/group-guide.spec.ts`
Expected: 全部 PASS；失败则按 12.2 流水线处理

- [ ] **Step 4: Commit**

```bash
git add e2e/specs/extension-page.spec.ts e2e/specs/group-guide.spec.ts
git commit -m "test(e2e): add extension page and group guide coverage"
```

---

## Phase 2：需要 mock 化的 A 类 + 寓言生成

目标：A0 简报自动生成、A1 外部资料基础路径、寓言生成全部覆盖，且 E2E 通过。

### Task 7: 为 `electron/ipc/llm.ts` 增加 mock 分支

**Files:**
- Modify: `electron/ipc/llm.ts`

- [ ] **Step 1: 在 `NODE_ENV=test` 分支中添加 `generateContinueSuggestions` mock**

```typescript
if (process.env.NODE_ENV === 'test') {
  return [
    { title: ' NestJS 中的装饰器模式', context: 'TypeScript 装饰器', rationale: '贴近实际项目', benefit: '提升框架理解' },
    { title: '依赖注入原理', context: 'IoC 容器', rationale: '补全基础', benefit: '理解底层机制' },
  ]
}
```

- [ ] **Step 2: 添加 `wildCardInspiration` mock**

```typescript
if (process.env.NODE_ENV === 'test') {
  return { title: '量子烹饪学', hook: '当粒子对撞机遇上分子料理', topic: '量子烹饪学' }
}
```

- [ ] **Step 3: 添加 `briefing:generate` mock**

```typescript
if (process.env.NODE_ENV === 'test') {
  return {
    content: '## X / Twitter\n\n### Test Feed\nTest content in English.\n\n## 中文摘要\n\n这是一条中文测试内容。',
    generatedAt: new Date().toISOString(),
  }
}
```

- [ ] **Step 4: 添加 `searchPrepare` mock**

```typescript
if (process.env.NODE_ENV === 'test') {
  return {
    summary: '根据外部资料，TypeScript 装饰器是一种特殊声明，可附加到类、方法、访问器、属性或参数。',
    sources: [{ title: 'TypeScript Decorators', url: 'https://example.com/decorators' }],
  }
}
```

- [ ] **Step 5: Commit**

```bash
git add electron/ipc/llm.ts
git commit -m "test(e2e): add NODE_ENV=test mocks for A-class IPCs"
```

### Task 8: 扩展 fixture 支持 Tavily key 隔离

**Files:**
- Modify: `e2e/fixtures/electron.ts`

- [ ] **Step 1: 透传 `TAVILY_API_KEY` 并导出 fixture 内部 helpers**

```typescript
env: {
  ...env,
  NODE_ENV: 'test',
  E2E_CONFIG_DIR: testConfigDir,
  E2E_STUDY_LIBRARY_PATH: testLibraryPath,
  E2E_SKIP_PROBE: '1',
  TAVILY_API_KEY: process.env.TAVILY_API_KEY ?? '',
},
```

同时把 `waitForCdpUrl`、`waitForCdpPort`、`waitForProcessExit`、`killProcessTree`、`getAppPage` 从模块级导出，供 custom fixture 复用：

```typescript
export function waitForCdpUrl(proc: ChildProcess, timeoutMs: number): Promise<string> { /* existing */ }
export async function waitForCdpPort(url: string, timeoutMs: number): Promise<void> { /* existing */ }
export async function waitForProcessExit(proc: ChildProcess, timeoutMs: number): Promise<void> { /* existing */ }
export async function killProcessTree(proc: ChildProcess): Promise<void> { /* existing */ }
export async function getAppPage(context: BrowserContext, timeoutMs: number): Promise<Page> { /* existing */ }
```

- [ ] **Step 2: Commit**

```bash
git add e2e/fixtures/electron.ts
git commit -m "test(e2e): pass TAVILY_API_KEY and export fixture helpers"
```

### Task 9: 新增 BriefingPage 和 external materials page objects

**Files:**
- Create: `e2e/pages/BriefingPage.ts`
- Modify: `e2e/pages/PreStudyPage.ts`
- Modify: `e2e/pages/StudyPage.ts`
- Modify: `e2e/helpers/selectors.ts`

- [ ] **Step 1: 创建 `BriefingPage.ts`**

```typescript
import type { Page } from '@playwright/test'
import { SELECTORS } from '../helpers/selectors'

export class BriefingPage {
  constructor(private page: Page) {}

  get pageRoot() {
    return this.page.locator(SELECTORS.briefing.page)
  }

  get progress() {
    return this.page.locator(SELECTORS.briefing.progress)
  }

  get regenerateButton() {
    return this.page.locator(SELECTORS.briefing.regenerateButton)
  }

  async waitForGenerationComplete() {
    await this.page.locator(SELECTORS.briefing.academicLayout).waitFor({ state: 'visible', timeout: 30000 })
  }

  async toggleTheme() {
    await this.page.locator(SELECTORS.briefing.themeToggle).click()
  }

  get newspaperLayout() {
    return this.page.locator(SELECTORS.briefing.newspaperLayout)
  }
}
```

- [ ] **Step 2: 扩展 `PreStudyPage.ts` 外部资料方法**

```typescript
async toggleExternalMaterials() {
  await this.page.locator(SELECTORS.preStudy.externalMaterialsToggle).click()
}

async isExternalMaterialsEnabled(): Promise<boolean> {
  return this.page.locator(SELECTORS.preStudy.externalMaterialsToggle).isChecked()
}
```

- [ ] **Step 3: 扩展 `StudyPage.ts` 外部资料方法**

```typescript
get externalMaterialsCard() {
  return this.page.locator(SELECTORS.study.externalMaterialsCard)
}
```

- [ ] **Step 4: Commit**

```bash
git add e2e/pages/BriefingPage.ts e2e/pages/PreStudyPage.ts e2e/pages/StudyPage.ts e2e/helpers/selectors.ts
git commit -m "test(e2e): add BriefingPage and external materials helpers"
```

### Task 10: 编写 A0 简报自动生成 spec

**Files:**
- Create: `e2e/specs/briefing-generation.spec.ts`

- [ ] **Step 1: 编写 spec**

```typescript
import { test, expect } from '../fixtures/electron'
import { CoverPage } from '../pages/CoverPage'
import { BriefingPage } from '../pages/BriefingPage'
import * as fs from 'node:fs'
import * as path from 'node:path'

test.describe('@p1 briefing generation', () => {
  test('auto-generates briefing on first entry and writes cache', async ({ window, testLibraryPath }) => {
    const cover = new CoverPage(window)
    await cover.enterIfNeeded()
    await window.locator(SELECTORS.cover.briefingButton).click()
    const briefing = new BriefingPage(window)
    await briefing.progress.waitFor({ state: 'visible', timeout: 5000 })
    await briefing.waitForGenerationComplete()
    const today = new Date().toISOString().slice(0, 10)
    const cachePath = path.join(testLibraryPath, '夜航简报', `夜航简报-${today}.md`)
    expect(fs.existsSync(cachePath)).toBe(true)
    const content = fs.readFileSync(cachePath, 'utf8')
    expect(content).toContain('中文摘要')
  })
})
```

- [ ] **Step 2: 运行并修复失败**

Run: `npm run test:e2e -- e2e/specs/briefing-generation.spec.ts`
Expected: PASS 或按 12.2 流水线修复

- [ ] **Step 3: Commit**

```bash
git add e2e/specs/briefing-generation.spec.ts
git commit -m "test(e2e): add briefing auto-generation coverage"
```

### Task 11: 编写 A1 外部资料 spec

**Files:**
- Create: `e2e/specs/external-materials.spec.ts`
- Create: `e2e/specs/external-materials-missing-key.spec.ts`
- Modify: `e2e/fixtures/electron.ts`（custom fixture 可复用或内联）

- [ ] **Step 1: 编写 `external-materials.spec.ts` 主路径**

```typescript
import { test, expect } from '../fixtures/electron'
import { CoverPage } from '../pages/CoverPage'
import { HomePage } from '../pages/HomePage'
import { PreStudyPage } from '../pages/PreStudyPage'
import { StudyPage } from '../pages/StudyPage'
import { SettingsPage } from '../pages/SettingsPage'
import * as fs from 'node:fs'
import * as path from 'node:path'

test.describe('@p1 external materials', () => {
  test('toggle visible and clickable', async ({ window }) => {
    const cover = new CoverPage(window)
    await cover.enterIfNeeded()
    const home = new HomePage(window)
    await home.waitForLoaded()
    await home.startNewTopic()
    const preStudy = new PreStudyPage(window)
    await preStudy.waitForVisible()
    await preStudy.toggleExternalMaterials()
    expect(await preStudy.isExternalMaterialsEnabled()).toBe(true)
  })

  test('saves Tavily API key in settings', async ({ window, testConfigDir }) => {
    const cover = new CoverPage(window)
    await cover.enterIfNeeded()
    const home = new HomePage(window)
    await home.waitForLoaded()
    const settings = new SettingsPage(window)
    await settings.goto()
    await settings.setSearchApiKey('tvly-test-key')
    await settings.saveSearch()
    const envPath = path.join(testConfigDir, '.env')
    const envContent = fs.readFileSync(envPath, 'utf8')
    expect(envContent).toContain('TAVILY_API_KEY=tvly-test-key')
  })

  test('full mock path generates external materials file', async ({ window, testLibraryPath }) => {
    const cover = new CoverPage(window)
    await cover.enterIfNeeded()
    const home = new HomePage(window)
    await home.waitForLoaded()
    await home.startNewTopic()
    const preStudy = new PreStudyPage(window)
    await preStudy.waitForVisible()
    await preStudy.fillTopic('TypeScript 装饰器')
    await preStudy.toggleExternalMaterials()
    await preStudy.clickStart()
    const study = new StudyPage(window)
    await study.waitForLoaded()
    await expect(study.externalMaterialsCard).toBeVisible()
    await study.sendMessage('请解释装饰器')
    await study.waitForHistoryLength(2)
    await study.forceArchivePending()
    await study.archive()
    await study.closeArchiveReport()
    const topicDir = fs.readdirSync(testLibraryPath).find(name => fs.statSync(path.join(testLibraryPath, name)).isDirectory())
    const sessions = fs.readdirSync(path.join(testLibraryPath, topicDir!)).filter(name => fs.statSync(path.join(testLibraryPath, topicDir!, name)).isDirectory())
    const sessionDir = path.join(testLibraryPath, topicDir!, sessions[0])
    expect(fs.existsSync(path.join(sessionDir, '外部资料.md'))).toBe(true)
  })
})
```

- [ ] **Step 2: 编写 `external-materials-missing-key.spec.ts` 缺失 key 路径**

```typescript
import { test as base, expect } from '../fixtures/electron'
import { CoverPage } from '../pages/CoverPage'
import { HomePage } from '../pages/HomePage'
import { PreStudyPage } from '../pages/PreStudyPage'
import { createTestConfigDir, cleanupTestConfigDir } from '../helpers/test-library'
import { SELECTORS } from '../helpers/selectors'
import * as fs from 'node:fs'
import * as path from 'node:path'

const test = base.extend({
  // If the host shell also exports TAVILY_API_KEY, additionally override
  // electronProcess in this fixture to delete it from spawn env.
  testConfigDir: async ({}, use, testInfo) => {
    const dir = createTestConfigDir()
    const envPath = path.join(dir, '.env')
    if (fs.existsSync(envPath)) {
      let content = fs.readFileSync(envPath, 'utf8')
      content = content.replace(/^TAVILY_API_KEY=.+\n?/m, '')
      fs.writeFileSync(envPath, content)
    }
    await use(dir)
    await cleanupTestConfigDir(dir, testInfo.status === 'failed' || testInfo.status === 'timedOut')
  },
})

test.describe('@p1 external materials missing key', () => {
  test('shows toast when Tavily key missing', async ({ window }) => {
    const cover = new CoverPage(window)
    await cover.enterIfNeeded()
    const home = new HomePage(window)
    await home.waitForLoaded()
    await home.startNewTopic()
    const preStudy = new PreStudyPage(window)
    await preStudy.waitForVisible()
    await preStudy.fillTopic('TypeScript 装饰器')
    await preStudy.toggleExternalMaterials()
    await preStudy.clickStart()
    await expect(window.locator(SELECTORS.toast)).toContainText('请先在设置中配置')
  })
})
```

- [ ] **Step 3: 运行并修复失败**

Run: `npx playwright test --config e2e/playwright.config.ts e2e/specs/external-materials.spec.ts e2e/specs/external-materials-missing-key.spec.ts`
Expected: PASS 或按 12.2 流水线修复

- [ ] **Step 4: Commit**

```bash
git add e2e/specs/external-materials.spec.ts e2e/specs/external-materials-missing-key.spec.ts
git commit -m "test(e2e): add external materials coverage"
```

### Task 12: 编写寓言生成与风格对话框 spec

**Files:**
- Create: `e2e/pages/FableStyleDialog.ts`
- Create: `e2e/specs/fable-generation.spec.ts`
- Modify: `e2e/helpers/test-library.ts`（`seedTopicWithoutFable`）

- [ ] **Step 1: 新增 `seedTopicWithoutFable`**

```typescript
export function seedTopicWithoutFable(libPath: string, slug: string, title: string): void {
  validateSlug(slug)
  const dir = path.join(libPath, slug, 's1')
  fs.mkdirSync(dir, { recursive: true })
  const content = `---
title: ${title}
description: E2E fixture without fable
type: progress
created: '${new Date().toISOString()}'
tags:
  - test
session_number: 1
difficulty: mid
progress_summary: E2E fixture without fable
last_studied: '${new Date().toISOString()}'
review_count: 0
---

# ${title}

占位报告，无寓言。
`
  fs.writeFileSync(path.join(dir, '学习报告.md'), content)
}
```

- [ ] **Step 2: 创建 `FableStyleDialog.ts`**

```typescript
import type { Page } from '@playwright/test'
import { SELECTORS } from '../helpers/selectors'

export class FableStyleDialog {
  constructor(private page: Page) {}

  get dialog() {
    return this.page.locator(SELECTORS.fableStyleDialog.dialog)
  }

  async selectTag(tag: string) {
    await this.page.locator(SELECTORS.fableStyleDialog.tagButton(tag)).click()
  }

  async setDescription(text: string) {
    await this.page.locator(SELECTORS.fableStyleDialog.descriptionInput).fill(text)
  }

  async start() {
    await this.page.locator(SELECTORS.fableStyleDialog.startButton).click()
  }

  async cancel() {
    await this.page.locator(SELECTORS.fableStyleDialog.cancelButton).click()
  }
}
```

- [ ] **Step 3: 编写 `fable-generation.spec.ts`**

```typescript
import { test, expect } from '../fixtures/electron'
import { CoverPage } from '../pages/CoverPage'
import { HomePage } from '../pages/HomePage'
import { LibraryPage } from '../pages/LibraryPage'
import { FableStyleDialog } from '../pages/FableStyleDialog'
import { seedTopicWithoutFable } from '../helpers/test-library'
import * as fs from 'node:fs'
import * as path from 'node:path'

test.describe('@p1 fable generation', () => {
  test('shows generate button when report exists without fable', async ({ window, testLibraryPath }) => {
    seedTopicWithoutFable(testLibraryPath, 'typescript-decorators', 'TypeScript 装饰器')
    const cover = new CoverPage(window)
    await cover.enterIfNeeded()
    const home = new HomePage(window)
    await home.waitForLoaded()
    const library = new LibraryPage(window)
    await library.openSession('typescript-decorators', 1)
    await expect(library.generateFableButton).toBeVisible()
  })

  test('opens style dialog and generates fable', async ({ window, testLibraryPath, testConfigDir }) => {
    seedTopicWithoutFable(testLibraryPath, 'typescript-decorators', 'TypeScript 装饰器')
    const cover = new CoverPage(window)
    await cover.enterIfNeeded()
    const home = new HomePage(window)
    await home.waitForLoaded()
    const library = new LibraryPage(window)
    await library.openSession('typescript-decorators', 1)
    await library.generateFableButton.click()
    const dialog = new FableStyleDialog(window)
    await expect(dialog.dialog).toBeVisible()
    await dialog.selectTag('科幻')
    await dialog.setDescription('用赛博朋克风格')
    await dialog.start()
    await library.fableButton.waitFor({ state: 'visible', timeout: 60000 })
    const sessionDir = path.join(testLibraryPath, 'typescript-decorators', 's1')
    expect(fs.existsSync(path.join(sessionDir, '寓言.md'))).toBe(true)
  })
})
```

- [ ] **Step 4: 运行并修复失败**

Run: `npm run test:e2e -- e2e/specs/fable-generation.spec.ts`
Expected: PASS 或按 12.2 流水线修复

- [ ] **Step 5: Commit**

```bash
git add e2e/pages/FableStyleDialog.ts e2e/specs/fable-generation.spec.ts e2e/helpers/test-library.ts
git commit -m "test(e2e): add fable generation coverage"
```

---

## Phase 3：学习库分页/拖拽 + 继续推荐 + 图表生成

目标：学习库分页、拖拽分组、删除确认、继续推荐、图表生成全部覆盖。

### Task 13: 扩展 LibraryPage 支持分页与删除

**Files:**
- Modify: `e2e/pages/LibraryPage.ts`
- Modify: `e2e/helpers/selectors.ts`

- [ ] **Step 1: 扩展 `LibraryPage.ts`**

```typescript
async goToPage(index: number) {
  await this.page.locator(SELECTORS.library.paginationDot(index)).click()
}

async nextPage() {
  await this.page.locator(SELECTORS.library.paginationNext).click()
}

async prevPage() {
  await this.page.locator(SELECTORS.library.paginationPrev).click()
}

async dragTopicToGroup(topicTitle: string, groupId: string) {
  const source = this.page.locator(`[data-testid="topic-card"]:has-text("${topicTitle}")`)
  const target = this.page.locator(SELECTORS.library.gravityGroupTarget(groupId))
  await source.dragTo(target)
}

async deleteSession(topicSlug: string, sessionNumber: number) {
  await this.openSession(topicSlug, sessionNumber)
  await this.page.locator(SELECTORS.library.deleteSessionButton).click()
  const dialog = new ConfirmDialog(this.page)
  await dialog.confirm()
}
```

- [ ] **Step 2: 创建 `ConfirmDialog.ts`**

```typescript
import type { Page } from '@playwright/test'
import { SELECTORS } from '../helpers/selectors'

export class ConfirmDialog {
  constructor(private page: Page) {}

  get dialog() {
    return this.page.locator(SELECTORS.confirmDialog.dialog)
  }

  async confirm() {
    await this.page.locator(SELECTORS.confirmDialog.confirmButton).click()
  }

  async cancel() {
    await this.page.locator(SELECTORS.confirmDialog.cancelButton).click()
  }
}
```

- [ ] **Step 3: Commit**

```bash
git add e2e/pages/LibraryPage.ts e2e/pages/ConfirmDialog.ts e2e/helpers/selectors.ts
git commit -m "test(e2e): extend LibraryPage for pagination and delete"
```

### Task 14: 编写学习库分页与拖拽 spec

**Files:**
- Create: `e2e/specs/library-pagination.spec.ts`
- Create: `e2e/specs/library-drag-and-delete.spec.ts`

- [ ] **Step 1: 编写 `library-pagination.spec.ts`**

```typescript
import { test, expect } from '../fixtures/electron'
import { CoverPage } from '../pages/CoverPage'
import { HomePage } from '../pages/HomePage'
import { LibraryPage } from '../pages/LibraryPage'
import { seedNewTopic } from '../helpers/test-library'

test.describe('@p1 library pagination', () => {
  test('paginates when more than 10 topics', async ({ window, testLibraryPath }) => {
    for (let i = 0; i < 12; i++) {
      seedNewTopic(testLibraryPath, `topic-${i}`, `主题 ${i}`)
    }
    const cover = new CoverPage(window)
    await cover.enterIfNeeded()
    const home = new HomePage(window)
    await home.waitForLoaded()
    const library = new LibraryPage(window)
    await expect(library.page.locator(SELECTORS.library.paginationDot(0))).toBeVisible()
    await library.nextPage()
    await expect(library.page.locator('[data-testid="topic-card"]:has-text("主题 11")')).toBeVisible()
  })
})
```

- [ ] **Step 2: 编写 `library-drag-and-delete.spec.ts`**

```typescript
import { test, expect } from '../fixtures/electron'
import { CoverPage } from '../pages/CoverPage'
import { HomePage } from '../pages/HomePage'
import { LibraryPage } from '../pages/LibraryPage'
import { seedNewTopic, seedMultiSessionTopic } from '../helpers/test-library'
import * as fs from 'node:fs'
import * as path from 'node:path'

test.describe('@p2 library drag and delete', () => {
  test('deletes archived session permanently', async ({ window, testLibraryPath }) => {
    seedMultiSessionTopic(testLibraryPath, 'multi-session', '多会话主题', 3)
    const cover = new CoverPage(window)
    await cover.enterIfNeeded()
    const home = new HomePage(window)
    await home.waitForLoaded()
    const library = new LibraryPage(window)
    await library.deleteSession('multi-session', 2)
    expect(fs.existsSync(path.join(testLibraryPath, 'multi-session', 's2'))).toBe(false)
  })
})
```

- [ ] **Step 3: 运行并修复失败**

Run: `npm run test:e2e -- e2e/specs/library-pagination.spec.ts e2e/specs/library-drag-and-delete.spec.ts`
Expected: PASS 或按 12.2 流水线修复

- [ ] **Step 4: Commit**

```bash
git add e2e/specs/library-pagination.spec.ts e2e/specs/library-drag-and-delete.spec.ts
git commit -m "test(e2e): add library pagination and delete coverage"
```

### Task 15: 编写继续学习推荐 spec

**Files:**
- Create: `e2e/specs/continue-suggestions.spec.ts`
- Modify: `e2e/pages/PreStudyPage.ts`
- Modify: `e2e/helpers/test-library.ts`

- [ ] **Step 1: 新增 `seedContinueSuggestions` helper**

```typescript
export function seedContinueSuggestions(
  configDir: string,
  topic: string,
  suggestions: Array<Record<string, string>>,
  sessionCount: number
): void {
  const statePath = path.join(configDir, 'state.json')
  const base = {
    profile: { name: 'E2E 测试员', profile_text: '', preferred_topics: [] },
    lastUsed: { difficulty: 'mid', temperature: 0.7 },
    session_count: 0,
    groups: [],
    activeGroupId: null,
    groupInspirations: {},
    topicContinueSuggestions: {},
    unsavedSessions: [],
    pendingArchives: [],
    archiveResult: null,
    terminology: {},
  }
  const state = fs.existsSync(statePath)
    ? JSON.parse(fs.readFileSync(statePath, 'utf8'))
    : base
  state.topicContinueSuggestions = {
    [topic]: { suggestions, sessionCount },
  }
  fs.writeFileSync(statePath, JSON.stringify(state, null, 2), 'utf8')
}
```

- [ ] **Step 2: 扩展 `PreStudyPage.ts`**

```typescript
async selectContinueSuggestion(index: number) {
  await this.page.locator(SELECTORS.preStudy.continueSuggestionCard).nth(index).click()
}

async fillUserRequirement(text: string) {
  await this.page.locator(SELECTORS.preStudy.userRequirementInput).fill(text)
}
```

- [ ] **Step 3: 编写 `continue-suggestions.spec.ts`**

```typescript
import { test as base, expect } from '../fixtures/electron'
import { CoverPage } from '../pages/CoverPage'
import { HomePage } from '../pages/HomePage'
import { PreStudyPage } from '../pages/PreStudyPage'
import { SELECTORS } from '../helpers/selectors'
import {
  createTestConfigDir,
  cleanupTestConfigDir,
  seedContinueSuggestions,
  seedMultiSessionTopic,
} from '../helpers/test-library'

const test = base.extend({
  testConfigDir: async ({}, use, testInfo) => {
    const dir = createTestConfigDir()
    seedContinueSuggestions(dir, 'TypeScript 装饰器', [
      { title: 'NestJS 装饰器', context: '框架层', rationale: '实用', benefit: '项目应用' },
    ], 2)
    await use(dir)
    await cleanupTestConfigDir(dir, testInfo.status === 'failed' || testInfo.status === 'timedOut')
  },
})

test.describe('@p1 continue suggestions', () => {
  test('shows suggestion cards when continuing topic', async ({ window, testLibraryPath }) => {
    seedMultiSessionTopic(testLibraryPath, 'typescript-decorators', 'TypeScript 装饰器', 2)
    const cover = new CoverPage(window)
    await cover.enterIfNeeded()
    const home = new HomePage(window)
    await home.waitForLoaded()
    await home.startContinueTopic('TypeScript 装饰器')
    const preStudy = new PreStudyPage(window)
    await preStudy.waitForVisible()
    const cards = preStudy.page.locator(SELECTORS.preStudy.continueSuggestionCard)
    await expect(cards).toHaveCount(1)
    await expect(cards.first()).toContainText('NestJS 装饰器')
  })
})
```

- [ ] **Step 4: 运行并修复失败**

Run: `npm run test:e2e -- e2e/specs/continue-suggestions.spec.ts`
Expected: PASS 或按 12.2 流水线修复

- [ ] **Step 5: Commit**

```bash
git add e2e/specs/continue-suggestions.spec.ts e2e/helpers/test-library.ts e2e/pages/PreStudyPage.ts
git commit -m "test(e2e): add continue suggestions coverage"
```

### Task 16: 编写图表生成 spec

**Files:**
- Create: `e2e/specs/diagram-generation.spec.ts`
- Modify: `e2e/helpers/test-library.ts`（`seedTopicWithoutDiagram`）

- [ ] **Step 1: 新增 `seedTopicWithoutDiagram`**

```typescript
export function seedTopicWithoutDiagram(libPath: string, slug: string, title: string): void {
  validateSlug(slug)
  const dir = path.join(libPath, slug, 's1')
  fs.mkdirSync(dir, { recursive: true })
  const content = `---
title: ${title}
description: E2E fixture without diagram
type: progress
created: '${new Date().toISOString()}'
tags:
  - test
session_number: 1
difficulty: mid
progress_summary: E2E fixture without diagram
last_studied: '${new Date().toISOString()}'
review_count: 0
---

# ${title}

占位报告，无图表。
`
  fs.writeFileSync(path.join(dir, '学习报告.md'), content)
}
```

- [ ] **Step 2: 编写 `diagram-generation.spec.ts`**

```typescript
import { test, expect } from '../fixtures/electron'
import { CoverPage } from '../pages/CoverPage'
import { HomePage } from '../pages/HomePage'
import { LibraryPage } from '../pages/LibraryPage'
import { seedTopicWithoutDiagram } from '../helpers/test-library'
import * as fs from 'node:fs'
import * as path from 'node:path'

test.describe('@p1 diagram generation', () => {
  test('shows generate diagram button for report without diagram', async ({ window, testLibraryPath }) => {
    seedTopicWithoutDiagram(testLibraryPath, 'no-diagram', '无图表主题')
    const cover = new CoverPage(window)
    await cover.enterIfNeeded()
    const home = new HomePage(window)
    await home.waitForLoaded()
    const library = new LibraryPage(window)
    await library.openSession('no-diagram', 1)
    await expect(library.generateDiagramButton).toBeVisible()
  })
})
```

- [ ] **Step 3: 运行并修复失败**

Run: `npm run test:e2e -- e2e/specs/diagram-generation.spec.ts`
Expected: PASS 或按 12.2 流水线修复

- [ ] **Step 4: Commit**

```bash
git add e2e/specs/diagram-generation.spec.ts e2e/helpers/test-library.ts
git commit -m "test(e2e): add diagram generation coverage"
```

---

## Phase 4：A1 mock server、边界错误路径、视觉 smoke

目标：A1 错误路径 mock 化、剩余边界用例、视觉类 smoke 断言。

### Task 17: 为 Tavily 增加可配置 base URL 和 mock server

**Files:**
- Modify: `electron/ipc/tavily.ts`
- Modify: `e2e/fixtures/electron.ts`

- [ ] **Step 1: 在 `tavily.ts` 中支持 `TAVILY_BASE_URL` 覆盖**

```typescript
const baseUrl = process.env.TAVILY_BASE_URL || 'https://api.tavily.com'
```

- [ ] **Step 2: 在 `electron.ts` fixture 中启动 mock server（可选）**

仅当 `E2E_USE_MOCK_TAVILY=1` 时启动 mock server 并把地址传给 Electron：

```typescript
import { startMockTavilyServer } from '../helpers/mock-tavily-server'

// inside electronProcess fixture, before spawn:
let mockServer: http.Server | undefined
let tavilyBaseUrl: string | undefined
if (process.env.E2E_USE_MOCK_TAVILY === '1') {
  mockServer = startMockTavilyServer(0)
  const address = mockServer.address()
  const port = typeof address === 'object' && address ? address.port : 0
  tavilyBaseUrl = `http://127.0.0.1:${port}`
}

// in spawn env add:
TAVILY_BASE_URL: tavilyBaseUrl ?? process.env.TAVILY_BASE_URL ?? '',

// after use add:
mockServer?.close()
```

- [ ] **Step 3: 编写 mock server helper**

Create: `e2e/helpers/mock-tavily-server.ts`

```typescript
import http from 'node:http'

export function startMockTavilyServer(port: number): http.Server {
  return http.createServer((req, res) => {
    if (req.url?.includes('search')) {
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ results: [] }))
    } else {
      res.writeHead(500)
      res.end('error')
    }
  }).listen(port)
}
```

- [ ] **Step 4: Commit**

```bash
git add electron/ipc/tavily.ts e2e/helpers/mock-tavily-server.ts e2e/fixtures/electron.ts
git commit -m "test(e2e): add Tavily mock server support"
```

### Task 18: 编写 A1 边界错误路径 spec

**Files:**
- Modify: `e2e/specs/external-materials.spec.ts`

- [ ] **Step 1: 添加空结果和网络失败用例**

Create: `e2e/fixtures/mock-tavily.ts`

```typescript
import { test as base } from './electron'
import { spawn } from 'node:child_process'
import path from 'node:path'
import {
  waitForCdpUrl,
  waitForCdpPort,
  killProcessTree,
} from './electron'
import { startMockTavilyServer } from '../helpers/mock-tavily-server'

export const test = base.extend({
  electronProcess: async ({ testLibraryPath, testConfigDir }, use, testInfo) => {
    const env = { ...process.env }
    delete env.ELECTRON_RUN_AS_NODE

    const mockServer = startMockTavilyServer(0)
    const address = mockServer.address()
    const port = typeof address === 'object' && address ? address.port : 0

    const proc = spawn(
      path.join(process.cwd(), 'node_modules', 'electron', 'dist', 'electron.exe'),
      ['--remote-debugging-port=0', '--no-sandbox', '.'],
      {
        cwd: process.cwd(),
        env: {
          ...env,
          NODE_ENV: 'test',
          E2E_CONFIG_DIR: testConfigDir,
          E2E_STUDY_LIBRARY_PATH: testLibraryPath,
          E2E_SKIP_PROBE: '1',
          TAVILY_BASE_URL: `http://127.0.0.1:${port}`,
          TAVILY_API_KEY: 'mock-key',
        },
      }
    )

    const cdpUrl = await waitForCdpUrl(proc, 60000)
    await waitForCdpPort(cdpUrl, 10000)
    await use({ process: proc, cdpUrl })

    await killProcessTree(proc)
    mockServer.close()
  },
})
```

Modify: `e2e/specs/external-materials-error.spec.ts`

```typescript
import { test, expect } from '../fixtures/mock-tavily'
import { CoverPage } from '../pages/CoverPage'
import { HomePage } from '../pages/HomePage'
import { PreStudyPage } from '../pages/PreStudyPage'
import { StudyPage } from '../pages/StudyPage'

test.describe('@p2 external materials error paths', () => {
  test('shows empty state when Tavily returns no results', async ({ window }) => {
    const cover = new CoverPage(window)
    await cover.enterIfNeeded()
    const home = new HomePage(window)
    await home.waitForLoaded()
    await home.startNewTopic()
    const preStudy = new PreStudyPage(window)
    await preStudy.waitForVisible()
    await preStudy.fillTopic('TypeScript 装饰器')
    await preStudy.toggleExternalMaterials()
    await preStudy.clickStart()
    const study = new StudyPage(window)
    await study.waitForLoaded()
    await expect(study.externalMaterialsCard).toContainText('未找到外部资料')
  })

  test('shows retry on Tavily network error', async ({ window }) => {
    // Configure mock server to return 500 by passing env flag or calling helper before spawn
    const cover = new CoverPage(window)
    await cover.enterIfNeeded()
    const home = new HomePage(window)
    await home.waitForLoaded()
    await home.startNewTopic()
    const preStudy = new PreStudyPage(window)
    await preStudy.waitForVisible()
    await preStudy.fillTopic('TypeScript 装饰器')
    await preStudy.toggleExternalMaterials()
    await preStudy.clickStart()
    const study = new StudyPage(window)
    await study.waitForLoaded()
    await expect(study.externalMaterialsCard).toContainText('搜索失败')
    await expect(study.page.locator('[data-testid="external-materials-retry"]')).toBeVisible()
  })
})
```

- [ ] **Step 2: 运行并修复失败**

Run: `npm run test:e2e -- e2e/specs/external-materials.spec.ts --grep "empty state|network error"`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add e2e/specs/external-materials.spec.ts
git commit -m "test(e2e): add external materials error paths"
```

### Task 19: 扩展现有 spec 加深断言

**Files:**
- Modify: `e2e/specs/new-topic-progress.spec.ts`
- Modify: `e2e/specs/archive-edge.spec.ts`
- Modify: `e2e/specs/settings.spec.ts`
- Modify: `e2e/specs/library-management.spec.ts`

- [ ] **Step 1: 在 `new-topic-progress.spec.ts` 归档后断言原始对话和 frontmatter**

```typescript
const sessionDir = path.join(testLibraryPath, topicDir, 's1')
expect(fs.existsSync(path.join(sessionDir, '原始对话.md'))).toBe(true)
expect(fs.existsSync(path.join(sessionDir, '学习图表.mmd'))).toBe(true)
const report = fs.readFileSync(path.join(sessionDir, '学习报告.md'), 'utf8')
expect(report).toContain('type: progress')
```

- [ ] **Step 2: 在 `settings.spec.ts` 中添加显隐切换和取消重置**

```typescript
test('toggles API key visibility', async ({ window }) => {
  const settings = new SettingsPage(window)
  await settings.goto()
  await settings.toggleApiKeyVisibility()
  await expect(settings.apiKeyInput).toHaveAttribute('type', 'text')
})
```

- [ ] **Step 3: 运行被修改的 spec**

Run: `npm run test:e2e -- e2e/specs/new-topic-progress.spec.ts e2e/specs/archive-edge.spec.ts e2e/specs/settings.spec.ts`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add e2e/specs/new-topic-progress.spec.ts e2e/specs/archive-edge.spec.ts e2e/specs/settings.spec.ts
git commit -m "test(e2e): deepen existing spec assertions"
```

### Task 20: 视觉/动画 smoke 断言

**Files:**
- Modify: `e2e/specs/smoke.spec.ts`

- [ ] **Step 1: 添加背景元素存在断言**

```typescript
test('background surface exists', async ({ window }) => {
  await expect(window.locator('[data-testid="surface-background"]')).toBeAttached()
})
```

- [ ] **Step 2: Commit**

```bash
git add e2e/specs/smoke.spec.ts
git commit -m "test(e2e): add visual smoke assertions"
```

---

## 全局回归与收尾

### Task 21: Phase 4 回归与全量 E2E

**Files:** 所有新增/修改文件

- [ ] **Step 1: 跑 core 用例**

Run: `npm run test:e2e:core`
Expected: PASS

- [ ] **Step 2: 跑 p2 用例**

Run: `npm run test:e2e:p2`
Expected: PASS

- [ ] **Step 3: 跑 unstable 用例（需要真实 key）**

Run: `npx playwright test --config e2e/playwright.config.ts --grep @unstable`
Expected: PASS（外部服务正常时）

- [ ] **Step 4: 修复任何剩余失败**

按 12.2 流水线派子 agent 批量处理。

- [ ] **Step 5: Commit 最终状态**

```bash
git add .
git commit -m "test(e2e): complete coverage expansion for V2 A-class and V1.0.2 gaps"
```

---

## Self-Review

### Spec Coverage

- A0 简报自动生成：Task 10
- A1 外部资料：Task 11、Task 17、Task 18
- A2 DIY 术语：Task 1、Task 2、Task 3
- A5 意外之径：Task 1、Task 4、Task 5
- 寓言生成：Task 12
- 学习库分页/拖拽/删除：Task 13、Task 14
- 继续推荐：Task 15
- 图表生成：Task 16
- Extension/Group Guide：Task 6
- 现有覆盖加深：Task 19
- 视觉 smoke：Task 20

### Placeholder Scan

无 TBD/TODO。每个代码步骤包含实际代码片段或明确命令。

### Type Consistency

- `seedTerminology`、`seedWildCardInspiration`、`seedContinueSuggestions` 都接收 `configDir` 作为第一个参数，与 `seedStateJson` 保持一致。
- 需要预 seed 的 spec 使用 `base.extend({ testConfigDir: ... })` 在应用启动前写入 state.json。
- Page objects 都使用 `SELECTORS` 辅助。

### Gaps

- 真正的 `LibraryPage.openSession` 方法签名需与现有实现对齐，执行时检查。
- `electron/ipc/llm.ts` 中具体 mock 插入位置需在执行时确认函数边界。
- `npm run test:e2e` 命令实际只接受 `--grep` 而非多个文件路径，执行时用 `npx playwright test --config e2e/playwright.config.ts path/to/spec.ts` 更准确。
- A2 术语测试中的字段名（如 `enterButton`）需与 `Terminology` 类型中的真实 key 对齐。
- Tavily mock server 的 500 错误路径需在实现时确定触发方式（env flag、路由参数或独立 server）。
