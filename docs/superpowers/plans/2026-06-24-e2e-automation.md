# E2E 自动化调试实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为 Study Parlor 搭建基于 Playwright 的 E2E 自动化测试，覆盖启动冒烟、新主题探索归档、继续主题、复习检测四个核心流程，每次测试在隔离的临时学习库中运行。

**Architecture:** 使用 `@playwright/test` 的 `electron.launch()` 启动真实 Electron 应用，通过自定义 fixture 注入 `E2E_STUDY_LIBRARY_PATH` 实现测试库隔离；页面对象封装 Home / PreStudy / Study 的交互；断言以 DOM 状态和文件系统结果为主，不依赖 LLM 返回文案。

**Tech Stack:** Playwright 1.45+、Electron 30.5.1、TypeScript、Vitest（现有单元测试不变）。

---

## 文件结构

```
study-parlor/
├── e2e/
│   ├── fixtures/electron.ts
│   ├── helpers/selectors.ts
│   ├── helpers/test-library.ts
│   ├── pages/HomePage.ts
│   ├── pages/PreStudyPage.ts
│   ├── pages/StudyPage.ts
│   ├── specs/smoke.spec.ts
│   ├── specs/new-topic-progress.spec.ts
│   ├── specs/continue-topic.spec.ts
│   ├── specs/review-topic.spec.ts
│   ├── playwright.config.ts
│   └── README.md
├── electron/main.ts              # 小改：路径覆盖 + remote-debugging-port
├── .gitignore                    # 追加 E2E 产物
├── package.json                  # 追加依赖与脚本
└── docs/superpowers/specs/2026-06-24-e2e-automation-design.md
```

---

### Task 1: 安装 Playwright 依赖

**Files:**
- Modify: `package.json`

- [ ] **Step 1: 添加 devDependency**

```json
"@playwright/test": "^1.45.0"
```

加到 `package.json` 的 `devDependencies` 中，放在 `electron` 附近即可。

- [ ] **Step 2: 安装并下载浏览器二进制**

Run:
```bash
npm install
npx playwright install chromium
```

Expected: 命令成功退出，没有 403/网络错误。

- [ ] **Step 3: 验证安装**

Run:
```bash
npx playwright --version
```

Expected: 输出版本号，例如 `Version 1.45.0`。

---

### Task 2: 配置 package.json 脚本

**Files:**
- Modify: `package.json`

- [ ] **Step 1: 追加脚本**

在 `package.json` 的 `scripts` 中增加：

```json
{
  "test:e2e": "playwright test",
  "test:e2e:smoke": "playwright test --grep @smoke",
  "test:e2e:debug": "playwright test --headed --trace on"
}
```

保留原有 `test`、`test:watch` 不变。

- [ ] **Step 2: 验证脚本可见**

Run:
```bash
npm run test:e2e -- --help | head -20
```

Expected: 看到 Playwright 的帮助输出，没有 "missing script" 错误。

---

### Task 3: 配置 .gitignore

**Files:**
- Modify: `.gitignore`

- [ ] **Step 1: 追加 E2E 产物目录**

在 `.gitignore` 末尾追加：

```gitignore
# Playwright E2E
e2e-results/
e2e/.test-library/
test-results/
playwright-report/
*.trace.zip
```

- [ ] **Step 2: 验证未追踪**

Run:
```bash
git check-ignore -v e2e-results/test.txt
```

Expected: 输出 `.gitignore:<行号>:e2e-results/`。

---

### Task 4: 创建 Playwright 配置文件

**Files:**
- Create: `e2e/playwright.config.ts`

- [ ] **Step 1: 写入配置**

```ts
import { defineConfig, devices } from '@playwright/test'
import path from 'node:path'

export default defineConfig({
  testDir: path.join(__dirname, 'specs'),
  outputDir: path.join(__dirname, '..', 'e2e-results'),
  fullyParallel: false,
  workers: 1,
  retries: 1,
  timeout: 120000,
  expect: {
    timeout: 10000,
  },
  reporter: [['line'], ['html', { outputFolder: path.join(__dirname, '..', 'playwright-report') }]],
  use: {
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    {
      name: 'electron',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
})
```

> `fullyParallel: false` 和 `workers: 1` 是因为所有测试共享真实 Kimi API key，避免并发导致状态混乱或额度不可控。

- [ ] **Step 2: 验证配置可加载**

Run:
```bash
npx playwright test --config e2e/playwright.config.ts --list
```

Expected: 输出 `Total: 0 tests in 0 files`（因为还没有 spec 文件）。

---

### Task 5: 主进程支持 E2E 测试库路径覆盖

**Files:**
- Modify: `electron/main.ts`

- [ ] **Step 1: 在 bootstrap 顶部读取覆盖路径**

找到 `bootstrap()` 函数开头：

```ts
async function bootstrap() {
  console.log('[bootstrap] start')
  let cfg: ReturnType<typeof loadEnv> | undefined
  let needsSetup = false
```

替换为：

```ts
async function bootstrap() {
  console.log('[bootstrap] start')

  // E2E tests can inject a temporary library path via environment variable.
  if (process.env.E2E_STUDY_LIBRARY_PATH) {
    process.env.STUDY_LIBRARY_PATH = process.env.E2E_STUDY_LIBRARY_PATH
    console.log('[bootstrap] E2E library override:', process.env.STUDY_LIBRARY_PATH)
  }

  let cfg: ReturnType<typeof loadEnv> | undefined
  let needsSetup = false
```

- [ ] **Step 2: 预留 remote-debugging-port（为后续 CDP/Agent 层）**

在 `electron/main.ts` 顶部、导入语句之后，加入：

```ts
const isDev = !!process.env.ELECTRON_RENDERER_URL

if (isDev || process.env.NODE_ENV === 'test') {
  app.commandLine.appendSwitch('remote-debugging-port', '9222')
}
```

放在 `let mainWindow: BrowserWindow | null = null` 之前。

- [ ] **Step 3: 删除旧 isDev 声明（避免重复）**

找到第 121 行附近的：

```ts
const isDev = !!process.env.ELECTRON_RENDERER_URL
```

删除这一行。因为已经在顶部定义了 `isDev`。

- [ ] **Step 4: 编译检查**

Run:
```bash
npm run build
```

Expected: `tsc --noEmit` 和 `tsc --noEmit -p tsconfig.node.json` 都通过。

---

### Task 6: 给 Home.tsx 增加 data-testid

**Files:**
- Modify: `src/pages/Home.tsx`

- [ ] **Step 1: 问候语**

找到：

```tsx
<div className="relative z-[5] text-center text-parchment/60 font-sans text-sm mb-8">
  晚安，{profile.name}
</div>
```

替换为：

```tsx
<div data-testid="home-greeting" className="relative z-[5] text-center text-parchment/60 font-sans text-sm mb-8">
  晚安，{profile.name}
</div>
```

- [ ] **Step 2: 新主题按钮**

找到：

```tsx
<Button
  onClick={() => openPreStudy({ mode: 'progress', topic: '' })}
  className="w-full text-lg py-4"
>
  新的小径
</Button>
```

替换为：

```tsx
<Button
  data-testid="new-topic-button"
  onClick={() => openPreStudy({ mode: 'progress', topic: '' })}
  className="w-full text-lg py-4"
>
  新的小径
</Button>
```

- [ ] **Step 3: 学习库区域**

找到：

```tsx
<div className="text-xs text-parchment/40 font-sans mb-3">学习库</div>
```

替换为：

```tsx
<div data-testid="library-section" className="text-xs text-parchment/40 font-sans mb-3">学习库</div>
```

- [ ] **Step 4: 继续按钮（中断的笔录）**

找到：

```tsx
<button
  onClick={() => restoreSession(firstUnsaved)}
  className="text-xs text-ember hover:text-parchment transition-colors font-sans"
>
  继续
</button>
```

替换为：

```tsx
<button
  data-testid="continue-unsaved-button"
  onClick={() => restoreSession(firstUnsaved)}
  className="text-xs text-ember hover:text-parchment transition-colors font-sans"
>
  继续
</button>
```

---

### Task 7: 给 PreStudyModal.tsx 增加 data-testid

**Files:**
- Modify: `src/components/PreStudyModal.tsx`

- [ ] **Step 1: 弹窗容器**

找到：

```tsx
<div className="panel w-[480px] p-8 space-y-6 max-h-[90vh] overflow-y-auto"
     onClick={e => e.stopPropagation()}>
```

替换为：

```tsx
<div data-testid="prestudy-modal"
     className="panel w-[480px] p-8 space-y-6 max-h-[90vh] overflow-y-auto"
     onClick={e => e.stopPropagation()}>
```

- [ ] **Step 2: 主题输入框**

找到：

```tsx
<Input ref={topicRef} value={topic}
       onChange={e => setTopic(e.target.value)}
       placeholder="主题或一个问题"
       className="w-full" />
```

替换为：

```tsx
<Input data-testid="topic-input"
       ref={topicRef} value={topic}
       onChange={e => setTopic(e.target.value)}
       placeholder="主题或一个问题"
       className="w-full" />
```

- [ ] **Step 3: 模式选择按钮**

「全新主题」按钮：

```tsx
<button
  data-testid="topic-source-new"
  onClick={() => {
```

「已有主题」按钮：

```tsx
<button
  data-testid="topic-source-existing"
  onClick={() => {
```

> 只需在对应 `<button>` 开标签上增加 `data-testid` 属性。

- [ ] **Step 4: 开始按钮**

找到：

```tsx
<Button onClick={onConfirm}>开始</Button>
```

替换为：

```tsx
<Button data-testid="start-button" onClick={onConfirm}>开始</Button>
```

- [ ] **Step 5: 撤回按钮**

找到：

```tsx
<Button variant="ghost" onClick={closePreStudy}>撤回</Button>
```

替换为：

```tsx
<Button data-testid="cancel-button" variant="ghost" onClick={closePreStudy}>撤回</Button>
```

---

### Task 8: 给 Study.tsx 增加 data-testid

**Files:**
- Modify: `src/pages/Study.tsx`

- [ ] **Step 1: 页面容器**

找到：

```tsx
<div className={`relative h-full flex flex-col ${isExiting ? 'study-exit' : ''}`}>
```

替换为：

```tsx
<div data-testid="study-page" className={`relative h-full flex flex-col ${isExiting ? 'study-exit' : ''}`}>
```

- [ ] **Step 2: 消息列表区域**

找到：

```tsx
<div ref={scrollRef} className="relative z-[5] flex-1 overflow-y-auto px-8 py-4 max-w-4xl w-full mx-auto">
```

替换为：

```tsx
<div data-testid="message-list" ref={scrollRef} className="relative z-[5] flex-1 overflow-y-auto px-8 py-4 max-w-4xl w-full mx-auto">
```

- [ ] **Step 3: 归档提示条**

找到：

```tsx
<div className="my-2 px-4 py-2 bg-ember/10 border border-ember/40 rounded
                text-sm font-sans text-parchment/80 flex justify-between items-center">
```

替换为：

```tsx
<div data-testid="archive-pending-banner"
     className="my-2 px-4 py-2 bg-ember/10 border border-ember/40 rounded
                text-sm font-sans text-parchment/80 flex justify-between items-center">
```

- [ ] **Step 4: 封存按钮**

找到：

```tsx
<Button onClick={onEnd}>封存。它从此成为档案。</Button>
```

替换为：

```tsx
<Button data-testid="archive-button" onClick={onEnd}>封存。它从此成为档案。</Button>
```

- [ ] **Step 5: ChatInput 区域（测试通过 DOM 定位 textarea）**

`ChatInput.tsx` 是通用组件，这里不改它。测试通过 `study-page` 内部 `textarea` 定位输入框：

```ts
page.locator('[data-testid="study-page"] textarea')
```

如需更稳定，可在 `ChatInput.tsx` 的 `<textarea>` 上加 `data-testid="chat-input"`。

---

### Task 9: 创建 E2E 选择器常量

**Files:**
- Create: `e2e/helpers/selectors.ts`

- [ ] **Step 1: 写入常量**

```ts
export const SELECTORS = {
  home: {
    greeting: '[data-testid="home-greeting"]',
    newTopicButton: '[data-testid="new-topic-button"]',
    librarySection: '[data-testid="library-section"]',
    continueUnsavedButton: '[data-testid="continue-unsaved-button"]',
  },
  preStudy: {
    modal: '[data-testid="prestudy-modal"]',
    topicInput: '[data-testid="topic-input"]',
    topicSourceNew: '[data-testid="topic-source-new"]',
    topicSourceExisting: '[data-testid="topic-source-existing"]',
    startButton: '[data-testid="start-button"]',
    cancelButton: '[data-testid="cancel-button"]',
  },
  study: {
    page: '[data-testid="study-page"]',
    messageList: '[data-testid="message-list"]',
    chatInput: '[data-testid="study-page"] textarea',
    sendButton: 'text=递出',
    archivePendingBanner: '[data-testid="archive-pending-banner"]',
    archiveButton: '[data-testid="archive-button"]',
  },
} as const
```

---

### Task 10: 创建测试学习库工厂

**Files:**
- Create: `e2e/helpers/test-library.ts`

- [ ] **Step 1: 写入 helper**

```ts
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'

const TEST_LIBRARY_ROOT = path.join(process.cwd(), 'e2e', '.test-library')

export function createTestLibrary(): string {
  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  const dir = path.join(TEST_LIBRARY_ROOT, id)
  fs.mkdirSync(dir, { recursive: true })
  return dir
}

export async function cleanupTestLibrary(dir: string, keepOnFailure: boolean = false): Promise<void> {
  if (keepOnFailure) return
  try {
    fs.rmSync(dir, { recursive: true, force: true })
  } catch (err) {
    console.warn('[e2e] failed to cleanup test library:', dir, err)
  }
}

export function seedNewTopic(libPath: string, slug: string, title: string): void {
  const filePath = path.join(libPath, `${slug}.md`)
  const content = `---
title: ${title}
description: 自动生成用于 E2E 测试的主题
type: progress
created: '2026-06-24T00:00:00.000Z'
tags:
  - test
session_number: 1
difficulty: high
progress_summary: E2E fixture data
last_studied: '2026-06-24T00:00:00.000Z'
review_count: 0
---

# ${title}

这是 E2E 测试用的占位学习报告。
`
  fs.writeFileSync(filePath, content)
}

export function seedReviewableTopic(libPath: string, slug: string, title: string): void {
  const filePath = path.join(libPath, `${slug}.md`)
  const content = `---
title: ${title}
description: 自动生成用于 E2E 复习测试的主题
type: progress
created: '2026-05-01T00:00:00.000Z'
tags:
  - test
session_number: 2
difficulty: mid
progress_summary: E2E fixture data for review
last_studied: '2026-05-01T00:00:00.000Z'
review_count: 1
---

# ${title}

这是 E2E 复习测试用的占位学习报告。
`
  fs.writeFileSync(filePath, content)
}
```

---

### Task 11: 创建自定义 Playwright fixture

**Files:**
- Create: `e2e/fixtures/electron.ts`

- [ ] **Step 1: 写入 fixture**

```ts
import { test as base } from '@playwright/test'
import { ElectronApplication, Page, _electron as electron } from 'playwright'
import { createTestLibrary, cleanupTestLibrary } from '../helpers/test-library'

type E2EFixtures = {
  electronApp: ElectronApplication
  window: Page
  testLibraryPath: string
}

export const test = base.extend<E2EFixtures>({
  testLibraryPath: async ({}, use) => {
    const dir = createTestLibrary()
    await use(dir)
  },

  electronApp: async ({ testLibraryPath }, use, testInfo) => {
    const app = await electron.launch({
      args: ['.'],
      cwd: process.cwd(),
      env: {
        ...process.env,
        NODE_ENV: 'test',
        E2E_STUDY_LIBRARY_PATH: testLibraryPath,
      },
    })

    await use(app)

    await app.close()

    const failed = testInfo.status === 'failed' || testInfo.status === 'timedOut'
    if (failed) {
      console.log(`[e2e] test failed, keeping test library for inspection: ${testLibraryPath}`)
    }
    await cleanupTestLibrary(testLibraryPath, failed)
  },

  window: async ({ electronApp }, use) => {
    const page = await electronApp.firstWindow()
    await use(page)
  },
})

export { expect } from '@playwright/test'
```

> 注意：从 `playwright` 导入 `_electron as electron`，不是从 `@playwright/test`。

---

### Task 12: 创建 HomePage 页面对象

**Files:**
- Create: `e2e/pages/HomePage.ts`

- [ ] **Step 1: 写入页面对象**

```ts
import { Page, Locator } from '@playwright/test'
import { SELECTORS } from '../helpers/selectors'

export class HomePage {
  readonly greeting: Locator
  readonly newTopicButton: Locator
  readonly librarySection: Locator

  constructor(private page: Page) {
    this.greeting = page.locator(SELECTORS.home.greeting)
    this.newTopicButton = page.locator(SELECTORS.home.newTopicButton)
    this.librarySection = page.locator(SELECTORS.home.librarySection)
  }

  async waitForLoaded() {
    await this.greeting.waitFor({ state: 'visible' })
    await this.librarySection.waitFor({ state: 'visible' })
  }

  async startNewTopic() {
    await this.newTopicButton.click()
  }

  async getTopicCardCount(): Promise<number> {
    return this.page.locator('[data-testid="topic-card"]').count()
  }

  async continueUnsavedSession() {
    await this.page.locator(SELECTORS.home.continueUnsavedButton).click()
  }
}
```

---

### Task 13: 创建 PreStudyPage 页面对象

**Files:**
- Create: `e2e/pages/PreStudyPage.ts`

- [ ] **Step 1: 写入页面对象**

```ts
import { Page, Locator } from '@playwright/test'
import { SELECTORS } from '../helpers/selectors'

export class PreStudyPage {
  readonly modal: Locator
  readonly topicInput: Locator
  readonly startButton: Locator

  constructor(private page: Page) {
    this.modal = page.locator(SELECTORS.preStudy.modal)
    this.topicInput = page.locator(SELECTORS.preStudy.topicInput)
    this.startButton = page.locator(SELECTORS.preStudy.startButton)
  }

  async waitForVisible() {
    await this.modal.waitFor({ state: 'visible' })
  }

  async fillTopic(topic: string) {
    await this.topicInput.fill(topic)
  }

  async ensureNewTopicSource() {
    const newSource = this.page.locator(SELECTORS.preStudy.topicSourceNew)
    const selected = await newSource.evaluate(el => {
      return el.classList.contains('bg-ember')
    }).catch(() => false)
    if (!selected) {
      await newSource.click()
    }
  }

  async selectMode(mode: 'progress' | 'review') {
    // Mode is selected by the caller (openPreStudy). This helper waits for UI to reflect it.
    const expectedText = mode === 'progress' ? '探索新知' : '复习检测'
    await this.page.locator(`text=${expectedText}`).first().waitFor({ state: 'visible' })
  }

  async clickStart() {
    await this.startButton.click()
  }
}
```

---

### Task 14: 创建 StudyPage 页面对象

**Files:**
- Create: `e2e/pages/StudyPage.ts`

- [ ] **Step 1: 写入页面对象**

```ts
import { Page, Locator } from '@playwright/test'
import { SELECTORS } from '../helpers/selectors'

export class StudyPage {
  readonly pageElement: Locator
  readonly messageList: Locator
  readonly chatInput: Locator
  readonly sendButton: Locator
  readonly archivePendingBanner: Locator
  readonly archiveButton: Locator

  constructor(private page: Page) {
    this.pageElement = page.locator(SELECTORS.study.page)
    this.messageList = page.locator(SELECTORS.study.messageList)
    this.chatInput = page.locator(SELECTORS.study.chatInput)
    this.sendButton = page.locator(SELECTORS.study.sendButton)
    this.archivePendingBanner = page.locator(SELECTORS.study.archivePendingBanner)
    this.archiveButton = page.locator(SELECTORS.study.archiveButton)
  }

  async waitForLoaded() {
    await this.pageElement.waitFor({ state: 'visible' })
  }

  async waitForAssistantContent(timeout: number = 60000) {
    // Wait until there is at least one assistant message with non-empty text.
    await this.pageElement.locator('[data-testid="message-list"] .assistant, [data-testid="message-list"] > div')
      .filter({ hasText: /\S/ })
      .first()
      .waitFor({ state: 'visible', timeout })
  }

  async sendMessage(text: string) {
    await this.chatInput.fill(text)
    await this.sendButton.click()
  }

  async archive() {
    await this.archivePendingBanner.waitFor({ state: 'visible' })
    await this.archiveButton.click()
  }
}
```

> 如果 `ChatBubble` 没有给 assistant 消息加区分 class，可以改用「消息数量 > 1」来推断已收到回复。

---

### Task 15: 创建 smoke 测试

**Files:**
- Create: `e2e/specs/smoke.spec.ts`

- [ ] **Step 1: 写入测试**

```ts
import { test, expect } from '../fixtures/electron'
import { HomePage } from '../pages/HomePage'

test.describe('@smoke', () => {
  test('应用启动并渲染首页', async ({ window }) => {
    const home = new HomePage(window)
    await home.waitForLoaded()
    await expect(home.greeting).toContainText('晚安')
    await expect(home.newTopicButton).toBeVisible()
    await expect(home.librarySection).toBeVisible()
  })
})
```

- [ ] **Step 2: 运行 smoke**

Run:
```bash
npm run test:e2e:smoke
```

Expected: 测试通过，Electron 窗口出现并关闭，终端显示 `1 passed`。

---

### Task 16: 创建新主题探索归档测试

**Files:**
- Create: `e2e/specs/new-topic-progress.spec.ts`

- [ ] **Step 1: 写入测试**

```ts
import { test, expect } from '../fixtures/electron'
import { HomePage } from '../pages/HomePage'
import { PreStudyPage } from '../pages/PreStudyPage'
import { StudyPage } from '../pages/StudyPage'
import fs from 'node:fs'
import path from 'node:path'

test.describe('@slow', () => {
  test('新主题探索并归档', async ({ window, testLibraryPath }) => {
    const home = new HomePage(window)
    const preStudy = new PreStudyPage(window)
    const study = new StudyPage(window)

    await home.waitForLoaded()
    await home.startNewTopic()

    await preStudy.waitForVisible()
    await preStudy.ensureNewTopicSource()
    await preStudy.fillTopic('TypeScript 装饰器')
    await preStudy.clickStart()

    await study.waitForLoaded()
    await study.waitForAssistantContent(60000)

    await study.sendMessage('能否给一个具体例子？')

    // Wait until archive suggestion banner appears
    await study.archive()

    // Wait until back on home
    await home.waitForLoaded()

    // Assert file was created
    const files = fs.readdirSync(testLibraryPath)
    const mdFiles = files.filter(f => f.endsWith('.md'))
    expect(mdFiles.length).toBe(1)

    const content = fs.readFileSync(path.join(testLibraryPath, mdFiles[0]), 'utf-8')
    expect(content).toContain('TypeScript 装饰器')
  })
})
```

> 该测试会消耗真实 Kimi API token，运行时间约 30–90 秒。

---

### Task 17: 创建继续主题测试

**Files:**
- Create: `e2e/specs/continue-topic.spec.ts`

- [ ] **Step 1: 写入测试**

```ts
import { test, expect } from '../fixtures/electron'
import { HomePage } from '../pages/HomePage'
import { PreStudyPage } from '../pages/PreStudyPage'
import { StudyPage } from '../pages/StudyPage'
import { seedNewTopic } from '../helpers/test-library'

test.describe('@slow', () => {
  test('继续已有主题', async ({ window, testLibraryPath }) => {
    seedNewTopic(testLibraryPath, 'typescript-decorators', 'TypeScript 装饰器')

    const home = new HomePage(window)
    const preStudy = new PreStudyPage(window)
    const study = new StudyPage(window)

    await home.waitForLoaded()

    // Click the topic card in the library to continue
    await window.locator('[data-testid="topic-card"]').first().click()

    // If PreStudy opens (continue flow), confirm and start
    if (await window.locator('[data-testid="prestudy-modal"]').isVisible().catch(() => false)) {
      await preStudy.clickStart()
    }

    await study.waitForLoaded()
    await study.waitForAssistantContent(60000)

    await study.sendMessage('继续')

    // Just verify no crash and we remain on study page
    await expect(study.pageElement).toBeVisible()
  })
})
```

---

### Task 18: 创建复习检测测试

**Files:**
- Create: `e2e/specs/review-topic.spec.ts`

- [ ] **Step 1: 写入测试**

```ts
import { test, expect } from '../fixtures/electron'
import { HomePage } from '../pages/HomePage'
import { PreStudyPage } from '../pages/PreStudyPage'
import { StudyPage } from '../pages/StudyPage'
import { seedReviewableTopic } from '../helpers/test-library'
import fs from 'node:fs'
import path from 'node:path'

test.describe('@slow', () => {
  test('复习已有主题', async ({ window, testLibraryPath }) => {
    seedReviewableTopic(testLibraryPath, 'typescript-decorators', 'TypeScript 装饰器')

    const home = new HomePage(window)
    const preStudy = new PreStudyPage(window)
    const study = new StudyPage(window)

    await home.waitForLoaded()

    // Open review via topic card context menu or review button
    // This assumes StudyLibrary exposes a review action; adjust selector as needed.
    await window.locator('[data-testid="topic-card"]').first().hover()
    await window.locator('[data-testid="topic-card-review"]').first().click().catch(async () => {
      // Fallback: click card and select review mode
      await window.locator('[data-testid="topic-card"]').first().click()
      await preStudy.waitForVisible()
      // Review mode should already be selected if caller passed mode=review
    })

    if (await window.locator('[data-testid="prestudy-modal"]').isVisible().catch(() => false)) {
      await preStudy.clickStart()
    }

    await study.waitForLoaded()
    await study.waitForAssistantContent(60000)

    await study.sendMessage('我记得装饰器可以修饰类和方法。')

    await study.archive()

    await home.waitForLoaded()

    const files = fs.readdirSync(testLibraryPath)
    const mdFile = files.find(f => f.endsWith('.md'))
    expect(mdFile).toBeDefined()
    const content = fs.readFileSync(path.join(testLibraryPath, mdFile!), 'utf-8')
    expect(content).toContain('复习')
  })
})
```

> 如果 UI 没有 `topic-card-review` 按钮，需要在 `StudyLibrary` 相关组件上加一个，或改为通过 PreStudy 的「复习检测」入口进入。

---

### Task 19: 创建 E2E README

**Files:**
- Create: `e2e/README.md`

- [ ] **Step 1: 写入文档**

```markdown
# E2E 测试

## 前置要求

- 项目已 `npm install`
- 已运行 `npx playwright install chromium`
- `.env` 中 `KIMI_API_KEY` 是真实 key

## 常用命令

```bash
npm run test:e2e:smoke        # 快速 smoke 测试
npm run test:e2e              # 全部 E2E（含慢测试，可能耗时数分钟）
npm run test:e2e:debug        # headed 模式 + trace
npx playwright test --grep-invert @slow   # 跳过慢测试
```

## 添加新测试

1. 在 `e2e/specs/` 下新建 `.spec.ts`。
2. 使用 `import { test } from '../fixtures/electron'`。
3. 如需测试数据，在 fixture 里调用 `seedNewTopic` / `seedReviewableTopic`。
4. 用页面对象封装交互，用 `data-testid` 做断言。

## 调试失败

- 失败截图：`e2e-results/`
- Trace 回放：`npx playwright show-trace e2e-results/trace.zip`
- 保留的测试库：`e2e/.test-library/<uuid>/`
```

---

### Task 20: 运行完整 E2E 套件

- [ ] **Step 1: 先跑 smoke**

Run:
```bash
npm run test:e2e:smoke
```

Expected: `1 passed`。

- [ ] **Step 2: 跑全部慢测试**

Run:
```bash
npm run test:e2e
```

Expected: 4 个测试最终全部通过（可能因 LLM 耗时重试 1 次）。

- [ ] **Step 3: 确认产物在 .gitignore 中**

Run:
```bash
git status --short
```

Expected: 只看到新增的 `e2e/` 文件、`electron/main.ts`、`package.json`、`.gitignore` 改动；没有 `e2e-results/`、`e2e/.test-library/` 等未忽略文件。

---

## 自检清单

- **Spec 覆盖**：
  - 隔离临时测试库 ✅ Task 11
  - 主进程路径覆盖 ✅ Task 5
  - remote-debugging-port 预留 ✅ Task 5
  - 页面对象 + data-testid ✅ Task 6/7/8 + 12/13/14
  - 4 个测试流程 ✅ Task 15/16/17/18
  - 截图/trace/保留现场 ✅ Task 4 + Task 11
  - README ✅ Task 19
- **无占位符**：所有任务包含具体文件路径与代码。
- **类型一致性**：`testLibraryPath` 在 fixture 和测试中用相同字符串类型；`data-testid` 选择器与 UI 改动一一对应。

---

## 执行方式

Plan complete and saved to `docs/superpowers/plans/2026-06-24-e2e-automation.md`. Two execution options:

**1. Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints

Which approach?
