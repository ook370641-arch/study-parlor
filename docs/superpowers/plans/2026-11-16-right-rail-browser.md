---
status: planned
---

# 阅读右栏内置浏览器实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在文章与书籍阅读右栏增加一个安全、可持久化的单页面浏览器，支持网址 / Bing 搜索、基础导航和网页内查找。

**Architecture:** 主进程以 `WebContentsView` 独占网页生命周期，React 只负责紧凑工具栏、查找条与占位区域。固定用途 IPC 传递导航和 bounds；单个视图跨应用内状态保留，最后 URL 写入现有 `state.json`。

**Tech Stack:** Electron 30.5.1、React 18、TypeScript、Zustand、Vitest、Playwright；不新增运行时依赖。

**Spec:** `docs/superpowers/specs/2026-11-16-right-rail-browser-design.md`

## Global Constraints

- 只在 `codex/right-rail-browser` 的独立 worktree 修改；不得编辑主工作区或重启其开发服务。
- 使用 `WebContentsView`，不启用 `<webview>`，不使用 iframe 代替通用浏览器。
- 单页面、无多标签；视觉采用 A 紧凑单排；关键词固定使用 Bing。
- 网页 session 固定为 `persist:study-parlor-browser`，仅允许 HTTP(S)，`sandbox: true`、`contextIsolation: true`、`nodeIntegration: false`，无应用 Preload。
- 应用内切换只隐藏不销毁；应用启动不创建视图、不后台联网。
- 不做 AI 控制、Chrome 扩展、书签、历史页或下载管理。
- 单元测试只跑受影响文件；E2E 只跑定向 spec，不跑全量。
- 所有会启动第二个 Electron 实例的 E2E 命令，运行前必须取得用户明确确认。
- 每个任务只提交本任务文件，不修复无关问题。

---

## File Structure

- `electron/lib/browser-url.ts`：纯输入解析与 HTTP(S) 协议校验。
- `electron/lib/browser-view.ts`：单个视图的生命周期、导航、查找、安全策略和事件。
- `electron/ipc/browser.ts`：固定用途 IPC 与主窗口控制器获取。
- `src/components/article-assistant/BrowserPanel.tsx`：A 方案工具栏、查找条、占位区与错误态。
- `src/lib/article-panel-mode.ts`：启动时把持久化的 browser 模式回退为 guide。
- `src/types/index.ts`：浏览器 DTO、`IpcApi`、`StateJson` 与面板模式类型。
- `src/store/index.ts`：面板模式、启动水合和最后 URL。
- `e2e/specs/right-rail-browser.spec.ts`：本地网页的行为回归。

### Task 1: 地址栏输入解析与协议策略

**Files:**
- Create: `electron/lib/browser-url.ts`
- Test: `tests/browser-url.test.ts`

**Interfaces:**
- Produces: `browserTargetForInput(input: string): string`；空输入返回空字符串，其他输入返回 HTTP(S) URL。
- Produces: `isAllowedBrowserUrl(value: string): boolean`；仅接受解析成功的 `http:` / `https:`。

- [ ] **Step 1: 写失败测试**

```ts
import { describe, expect, it } from 'vitest'
import { browserTargetForInput, isAllowedBrowserUrl } from '@electron/lib/browser-url'

describe('browser URL policy', () => {
  it.each([
    ['https://example.com/a', 'https://example.com/a'],
    ['example.com/a', 'https://example.com/a'],
    ['localhost:3000', 'http://localhost:3000/'],
  ])('normalizes %s', (input, expected) => {
    expect(browserTargetForInput(input)).toBe(expected)
  })

  it('turns keywords into a Bing search', () => {
    expect(browserTargetForInput('苏格拉底 提问')).toBe(
      'https://www.bing.com/search?q=%E8%8B%8F%E6%A0%BC%E6%8B%89%E5%BA%95%20%E6%8F%90%E9%97%AE',
    )
  })

  it('returns empty input unchanged and never executes unsafe schemes', () => {
    expect(browserTargetForInput('  ')).toBe('')
    expect(isAllowedBrowserUrl('file:///C:/private.txt')).toBe(false)
    expect(isAllowedBrowserUrl('javascript:alert(1)')).toBe(false)
    expect(isAllowedBrowserUrl('data:text/html,hello')).toBe(false)
    expect(isAllowedBrowserUrl('https://example.com')).toBe(true)
  })
})
```

- [ ] **Step 2: 运行测试并确认失败**

Run: `npx vitest run tests/browser-url.test.ts`

Expected: FAIL，原因是 `@electron/lib/browser-url` 尚不存在。

- [ ] **Step 3: 实现最小纯函数**

```ts
export function isAllowedBrowserUrl(value: string): boolean {
  try {
    const url = new URL(value)
    return url.protocol === 'http:' || url.protocol === 'https:'
  } catch {
    return false
  }
}

export function browserTargetForInput(input: string): string {
  const value = input.trim()
  if (!value) return ''
  if (isAllowedBrowserUrl(value)) return new URL(value).toString()

  const hasScheme = /^[a-z][a-z\d+.-]*:/i.test(value)
  const looksLikeHost = !/\s/.test(value) && (
    /^(localhost|127(?:\.\d+){3}|0\.0\.0\.0)(?::\d+)?(?:[/?#]|$)/i.test(value)
    || /^[^\s/?#]+\.[^\s/?#]+/.test(value)
  )
  if (!hasScheme && looksLikeHost) {
    const local = /^(localhost|127(?:\.\d+){3}|0\.0\.0\.0)(?::\d+)?(?:[/?#]|$)/i.test(value)
    const candidate = `${local ? 'http' : 'https'}://${value}`
    if (isAllowedBrowserUrl(candidate)) return new URL(candidate).toString()
  }

  return `https://www.bing.com/search?q=${encodeURIComponent(value)}`
}
```

- [ ] **Step 4: 运行测试并确认通过**

Run: `npx vitest run tests/browser-url.test.ts`

Expected: 5 个测试通过（`it.each` 的 3 个用例加 2 个独立测试）。

- [ ] **Step 5: 提交**

```bash
git add electron/lib/browser-url.ts tests/browser-url.test.ts
git commit -m "feat: add browser address parsing"
```

### Task 2: 浏览与基础导航纵切片

**Files:**
- Create: `electron/lib/browser-view.ts`
- Create: `electron/ipc/browser.ts`
- Create: `src/components/article-assistant/BrowserPanel.tsx`
- Create: `e2e/specs/right-rail-browser.spec.ts`
- Modify: `src/types/index.ts`
- Modify: `electron/preload.ts`
- Modify: `electron/ipc/index.ts`
- Modify: `src/components/article-assistant/ArticleGuideTabs.tsx`
- Modify: `src/store/index.ts`
- Modify: `e2e/source-map.json`

**Interfaces:**
- Consumes: Task 1 的 `browserTargetForInput` 与 `isAllowedBrowserUrl`。
- Produces: `ArticlePanelMode = 'guide' | 'companion' | 'browser'`。
- Produces: `BrowserBounds = { x: number; y: number; width: number; height: number }`。
- Produces: `BrowserViewState = { url: string; title: string; loading: boolean; canGoBack: boolean; canGoForward: boolean; error: string | null }`。
- Produces: `BrowserController`，方法为 `show(bounds, restoreUrl?)`、`hide()`、`setBounds(bounds)`、`navigate(input)`、`goBack()`、`goForward()`、`reload()`、`openExternal()`、`getState()`。
- Produces: `IpcApi` 的 `browserShow`、`browserHide`、`browserSetBounds`、`browserNavigate`、`browserGoBack`、`browserGoForward`、`browserReload`、`browserOpenExternal`、`onBrowserState`。

- [ ] **Step 1: 写本地网页导航 E2E**

使用 `createMockServer` 提供 `/first` 与 `/second`，页面含链接和输入框。先在 spec 中定义可复用的文章打开函数：

```ts
async function openArticle(window: Page, libraryPath: string, configDir: string): Promise<void> {
  seedBlogArticleWithCache(libraryPath, configDir, {
    slug: 'e2e-right-rail-browser',
    title: 'E2E Right Rail Browser',
    body: '## 浏览器测试\n\n用于打开阅读右栏。',
  })
  const cover = new CoverPage(window)
  await cover.goToBriefing()
  await expect(window.locator(SELECTORS.briefing.anthropicPanel)).toBeVisible({ timeout: 10000 })
  await window.locator(`${SELECTORS.briefing.anthropicArticleRow}:has-text("E2E Right Rail Browser")`).click()
  await expect(window.locator(SELECTORS.briefing.anthropicArticleReader)).toBeVisible({ timeout: 15000 })
}
```

测试签名使用 `{ window, testLibraryPath, testConfigDir }`，导航断言代码：

```ts
const server = await createMockServer([
  { path: '/first', handler: (_req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
    res.end('<html><body><input aria-label="draft"><a href="/second">第二页</a></body></html>')
  } },
  { path: '/second', handler: (_req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
    res.end('<html><body><h1>第二页</h1><div style="height:1500px"></div><p id="bottom">底部</p></body></html>')
  } },
])
try {
  await openArticle(window, testLibraryPath, testConfigDir)
  await window.locator('[data-testid="article-panel-tab-browser-anthropic"]').click()
  await window.locator('[data-testid="browser-address"]').fill(`${server.url}/first`)
  await window.locator('[data-testid="browser-address"]').press('Enter')
  await expect.poll(() => window.context().pages().some((page) => page.url() === `${server.url}/first`)).toBe(true)
  const browserPage = window.context().pages().find((page) => page.url() === `${server.url}/first`)!
  await browserPage.getByLabel('draft').fill('保留我')
  await browserPage.getByRole('link', { name: '第二页' }).click()
  await expect(browserPage.getByRole('heading', { name: '第二页' })).toBeVisible()
  await browserPage.locator('#bottom').scrollIntoViewIfNeeded()
  await expect(browserPage.locator('#bottom')).toBeVisible()
  await window.locator('[data-testid="browser-back"]').click()
  await expect.poll(() => browserPage.url()).toBe(`${server.url}/first`)
  await expect(browserPage.getByLabel('draft')).toHaveValue('保留我')
  await window.locator('[data-testid="browser-forward"]').click()
  await expect.poll(() => browserPage.url()).toBe(`${server.url}/second`)
  await window.locator('[data-testid="browser-reload"]').click()
  await expect(browserPage.getByRole('heading', { name: '第二页' })).toBeVisible()
} finally {
  await server.close()
}
```

所需导入为 `Page`、`CoverPage`、`SELECTORS`、`seedBlogArticleWithCache` 和 `createMockServer`；流程不触发真实导读或公网请求。

- [ ] **Step 2: 经用户确认后运行 E2E，确认失败**

Run: `node scripts/e2e-changed.js --run --no-retries`

Expected: FAIL，找不到 `article-panel-tab-browser-anthropic`。

- [ ] **Step 3: 定义共享 DTO 与 Preload 合同**

在 `src/types/index.ts` 增加：

```ts
export type ArticlePanelMode = 'guide' | 'companion' | 'browser'
export type BrowserBounds = { x: number; y: number; width: number; height: number }
export type BrowserViewState = {
  url: string
  title: string
  loading: boolean
  canGoBack: boolean
  canGoForward: boolean
  error: string | null
}
```

把 `StateJson`、store 字段和 `setArticlePanelMode` 参数中的字符串联合统一替换为 `ArticlePanelMode`，并在 `IpcApi` 增加：

```ts
browserShow: (args: { bounds: BrowserBounds; restoreUrl?: string | null }) => Promise<BrowserViewState>
browserHide: () => Promise<void>
browserSetBounds: (bounds: BrowserBounds) => Promise<void>
browserNavigate: (input: string) => Promise<BrowserViewState>
browserGoBack: () => Promise<void>
browserGoForward: () => Promise<void>
browserReload: () => Promise<void>
browserOpenExternal: () => Promise<void>
onBrowserState: (cb: (state: BrowserViewState) => void) => () => void
```

Preload 用同名 IPC 通道实现这些方法；`onBrowserState` 监听 `browser:state` 并返回移除监听器的函数。

- [ ] **Step 4: 实现主进程控制器**

`browser-view.ts` 用 `WeakMap<BrowserWindow, BrowserController>` 缓存控制器。`ensure()` 懒创建一个视图并接入以下完整安全设置：

```ts
const browserSession = session.fromPartition('persist:study-parlor-browser')
browserSession.setPermissionRequestHandler((_webContents, _permission, callback) => callback(false))
browserSession.setPermissionCheckHandler(() => false)
const view = new WebContentsView({
  webPreferences: {
    sandbox: true,
    contextIsolation: true,
    nodeIntegration: false,
    session: browserSession,
  },
})
view.webContents.setWindowOpenHandler(({ url }) => {
  if (isAllowedBrowserUrl(url)) void view.webContents.loadURL(url)
  return { action: 'deny' }
})
view.webContents.on('will-navigate', (event, url) => {
  if (!isAllowedBrowserUrl(url)) event.preventDefault()
})
view.webContents.on('will-redirect', (event, url) => {
  if (!isAllowedBrowserUrl(url)) event.preventDefault()
})
```

`show()` 先把规范化后的整数 bounds 设置到视图，再把视图加入 `window.contentView`。仅当 `view.webContents.getURL()` 为空且 `restoreUrl` 通过协议校验时加载恢复地址。`hide()` 只 `removeChildView(view)`，不调用 `destroy()`。

`navigate()` 调用 Task 1 的解析函数并加载非空目标。`show()` 的恢复加载与 `navigate()` 都用 `try/catch` 捕获 `loadURL` 拒绝，设置错误文案并返回当前状态，不让 IPC 产生未处理拒绝。`getState()` 从 WebContents 读取 URL、标题、加载与导航能力。`did-start-loading`、`did-stop-loading`、`did-navigate`、`did-navigate-in-page`、`page-title-updated` 后发送 `browser:state`；主框架 `did-fail-load` 且 `errorCode !== -3` 时设置错误文案。

`openExternal()` 仅对当前通过 `isAllowedBrowserUrl` 的 URL 调用 `shell.openExternal(url)`。窗口 `closed` 时从 WeakMap 删除引用，所有公共方法先检查窗口和 WebContents 是否销毁。

- [ ] **Step 5: 注册固定用途 IPC**

`registerBrowserIpc(getMainWindow)` 从当前窗口取得 `BrowserController`，没有可用窗口时安全返回。将 `browser:show`、`browser:hide`、`browser:setBounds`、`browser:navigate`、`browser:goBack`、`browser:goForward`、`browser:reload`、`browser:openExternal` 映射到 Task 2 的同名控制器方法，并在 `registerAllIpc` 注册。

- [ ] **Step 6: 实现 A 方案面板与第三页签**

`ArticleGuideTabs` 增加：

```tsx
<button data-testid={`article-panel-tab-browser-${source}`} className={tabCls('browser')} onClick={() => setMode(source, 'browser')}>浏览器</button>
```

正文分支改为 `guide`、`companion`、`browser` 三分支，浏览器渲染 `<BrowserPanel theme={theme} />`。

`BrowserPanel` 的占位元素使用 `data-testid="browser-view-placeholder"`。首次挂载时订阅状态、调用 `browserShow`，用 `ResizeObserver` 与 window resize 调用 `browserSetBounds`；卸载时取消观察、移除监听并调用 `browserHide`。bounds 取自占位元素的 `getBoundingClientRect()`，坐标和尺寸取整，宽高最小为 1。

工具栏使用 inline SVG，不新增图标依赖；地址框为 `browser-address`，后退为 `browser-back`，另设前进、刷新和外部打开测试标识。地址框仅在未聚焦编辑时随状态事件更新。加载失败在占位区显示错误、重试与外部打开按钮。

- [ ] **Step 7: 构建并运行定向验证**

Run: `npm run build`

Expected: TypeScript 与 electron-vite 构建通过。

经用户确认后 Run: `node scripts/e2e-changed.js --run --no-retries`

Expected: 新浏览器导航 E2E 与受影响旧 spec 通过。

- [ ] **Step 8: 更新 source map 并提交**

在 `article-side-panel.sources` 追加以下四项，在 `article-side-panel.specs` 追加 `right-rail-browser.spec.ts`；不要把新 spec 重复加入其他 group。`electron/preload.ts` 已有多组覆盖，不移动既有映射。

```json
"electron/lib/browser-*.ts",
"electron/ipc/browser.ts",
"src/components/article-assistant/BrowserPanel.tsx",
"src/lib/article-panel-mode.ts"
```

```bash
git add electron/lib/browser-view.ts electron/ipc/browser.ts electron/ipc/index.ts electron/preload.ts src/types/index.ts src/store/index.ts src/components/article-assistant/ArticleGuideTabs.tsx src/components/article-assistant/BrowserPanel.tsx e2e/specs/right-rail-browser.spec.ts e2e/source-map.json
git commit -m "feat: add embedded reading browser"
```

### Task 3: 网页内查找与快捷键

**Files:**
- Modify: `electron/lib/browser-view.ts`
- Modify: `electron/ipc/browser.ts`
- Modify: `electron/preload.ts`
- Modify: `src/types/index.ts`
- Modify: `src/components/article-assistant/BrowserPanel.tsx`
- Test: `e2e/specs/right-rail-browser.spec.ts`

**Interfaces:**
- Produces: `BrowserFindResult = { activeMatchOrdinal: number; matches: number }`。
- Produces: `BrowserShortcut = 'find' | 'closeFind'`。
- Produces: 控制器 `find(text: string, forward: boolean, findNext: boolean): void` 与 `stopFind(): void`。
- Produces: `IpcApi.browserFind(args)`、`browserStopFind()`、`onBrowserFindResult(cb)`、`onBrowserShortcut(cb)`。

- [ ] **Step 1: 先写查找 E2E**

在本地 `/first` 页面加入三段“苏格拉底”文本，然后：

```ts
await window.locator('[data-testid="browser-find-open"]').click()
await window.locator('[data-testid="browser-find-input"]').fill('苏格拉底')
await expect(window.locator('[data-testid="browser-find-count"]')).toHaveText('1 / 3')
await window.locator('[data-testid="browser-find-input"]').press('Enter')
await expect(window.locator('[data-testid="browser-find-count"]')).toHaveText('2 / 3')
await window.locator('[data-testid="browser-find-input"]').press('Shift+Enter')
await expect(window.locator('[data-testid="browser-find-count"]')).toHaveText('1 / 3')
await window.locator('[data-testid="browser-find-input"]').press('Escape')
await expect(window.locator('[data-testid="browser-find-input"]')).toHaveCount(0)
await expect(window.locator('[data-testid="browser-find-count"]')).toHaveCount(0)
```

再打开查找，聚焦网页后发送 `Control+F`，断言查找条重新出现；在网页聚焦状态发送 `Escape`，断言查找条关闭。

- [ ] **Step 2: 经用户确认后运行并确认失败**

Run: `node scripts/e2e-changed.js --run --no-retries`

Expected: FAIL，找不到 `browser-find-open`。

- [ ] **Step 3: 实现主进程查找与快捷键**

```ts
view.webContents.on('found-in-page', (_event, result) => {
  send('browser:findResult', {
    activeMatchOrdinal: result.activeMatchOrdinal,
    matches: result.matches,
  })
})
view.webContents.on('before-input-event', (event, input) => {
  if (input.type !== 'keyDown') return
  if (input.control && input.key.toLowerCase() === 'f') {
    event.preventDefault()
    send('browser:shortcut', 'find')
  } else if (input.key === 'Escape') {
    send('browser:shortcut', 'closeFind')
  }
})
```

`find()` 在文本非空时调用 `findInPage(text, { forward, findNext })`；空文本调用 `stopFind()`。`stopFind()` 调用 `stopFindInPage('clearSelection')` 并发送 `{ activeMatchOrdinal: 0, matches: 0 }`。导航开始时同样清除旧查找状态。

- [ ] **Step 4: 实现查找条和 API**

在类型、Preload、IPC 中接入 `browser:find`、`browser:stopFind`、`browser:findResult`、`browser:shortcut`。React 查找条使用 `browser-find-input`、`browser-find-count`、`browser-find-open` 测试标识；Enter / Shift+Enter 分别设置 `findNext` 与 `forward`。收到 `find` 快捷键时打开并聚焦，收到 `closeFind` 或查找框 Escape 时关闭并停止查找。

- [ ] **Step 5: 验证并提交**

Run: `npm run build`

经用户确认后 Run: `node scripts/e2e-changed.js --run --no-retries`

Expected: 构建与定向测试通过。

```bash
git add electron/lib/browser-view.ts electron/ipc/browser.ts electron/preload.ts src/types/index.ts src/components/article-assistant/BrowserPanel.tsx e2e/specs/right-rail-browser.spec.ts
git commit -m "feat: add in-page browser find"
```

### Task 4: 跨状态保持与跨重启恢复

**Files:**
- Create: `src/lib/article-panel-mode.ts`
- Create: `tests/article-panel-mode.test.ts`
- Modify: `src/types/index.ts`
- Modify: `src/store/index.ts`
- Modify: `electron/ipc/state.ts`
- Modify: `electron/lib/browser-view.ts`
- Modify: `src/components/article-assistant/BrowserPanel.tsx`
- Test: `e2e/specs/right-rail-browser.spec.ts`

**Interfaces:**
- Produces: `restoreArticlePanelMode(saved: StateJson['articlePanelMode']): Record<'anthropic' | 'book', ArticlePanelMode>`。
- Produces: `StateJson.browserLastUrl?: string | null`，默认 `null`。
- Consumes: Task 2 的 `browserShow({ bounds, restoreUrl })`。

- [ ] **Step 1: 写启动模式恢复失败测试**

```ts
import { describe, expect, it } from 'vitest'
import { restoreArticlePanelMode } from '@/lib/article-panel-mode'

describe('restoreArticlePanelMode', () => {
  it('keeps guide and companion but never restores an active browser', () => {
    expect(restoreArticlePanelMode({ anthropic: 'browser', book: 'companion' })).toEqual({
      anthropic: 'guide',
      book: 'companion',
    })
  })

  it('falls back to guide for missing values', () => {
    expect(restoreArticlePanelMode(undefined)).toEqual({ anthropic: 'guide', book: 'guide' })
  })
})
```

- [ ] **Step 2: 运行测试并确认失败**

Run: `npx vitest run tests/article-panel-mode.test.ts`

Expected: FAIL，模块尚不存在。

- [ ] **Step 3: 实现启动恢复函数并接入 store**

```ts
import type { ArticlePanelMode, StateJson } from '@shared/index'

export function restoreArticlePanelMode(
  saved: StateJson['articlePanelMode'],
): Record<'anthropic' | 'book', ArticlePanelMode> {
  return {
    anthropic: saved?.anthropic === 'companion' ? 'companion' : 'guide',
    book: saved?.book === 'companion' ? 'companion' : 'guide',
  }
}
```

store 水合改用此函数，并新增 `browserLastUrl: string | null`，初始为 `null`、从 `state.browserLastUrl ?? null` 恢复。`StateJson` 与 `electron/ipc/state.ts` 的 DEFAULT 同步增加该字段。

- [ ] **Step 4: 持久化最后 URL 并恢复**

在主进程 `did-navigate` 与 `did-navigate-in-page` 中，仅对通过 `isAllowedBrowserUrl(url)` 的主框架当前 URL 调用：

```ts
patchState({ browserLastUrl: view.webContents.getURL() })
```

`BrowserPanel` 从 store 读取 `browserLastUrl`，首次 `browserShow` 时传为 `restoreUrl`。视图已存在时控制器继续使用当前页面，不重复加载恢复地址。

- [ ] **Step 5: 增加状态保持 E2E**

导航到 `/first` 后在网页输入框填写“保留我”。切页签与折叠恢复使用：

```ts
await window.getByTestId('article-panel-tab-guide-anthropic').click()
await window.getByTestId('article-panel-tab-browser-anthropic').click()
await expect(browserPage.getByLabel('draft')).toHaveValue('保留我')
await window.getByTestId('article-assistant-divider-toggle').click()
await window.getByTestId('article-assistant-divider-toggle').click()
await window.getByTestId('article-panel-tab-browser-anthropic').click()
await expect(browserPage.getByLabel('draft')).toHaveValue('保留我')
```

跨来源测试在打开文章前调用 `seedBook(testLibraryPath, { title: 'E2E Browser Book', chapters: [{ title: '第一章', body: '正文。' }] })`，然后执行：

```ts
await window.getByTestId('briefing-source-book').click()
await window.getByTestId('book-card-0').click()
await window.getByTestId('chapter-row-0').click()
await expect(window.getByTestId('book-chapter-body')).toContainText('正文。')
await window.getByTestId('article-panel-tab-browser-book').click()
await expect(browserPage.getByLabel('draft')).toHaveValue('保留我')
await window.getByTestId('briefing-source-anthropic').click()
await window.getByTestId('article-panel-tab-browser-anthropic').click()
await expect(browserPage.getByLabel('draft')).toHaveValue('保留我')
expect(browserPage.url()).toBe(`${server.url}/first`)
```

随后验证落盘与 renderer reload；本步需要为 spec 增加 `fs`、`path`、`seedBook` 导入：

```ts
const state = JSON.parse(fs.readFileSync(path.join(testConfigDir, 'state.json'), 'utf8'))
expect(state.browserLastUrl).toBe(`${server.url}/first`)
server.clearRequests()
await window.reload()
const cover = new CoverPage(window)
await cover.enterName('E2E 测试员')
await cover.goToBriefing()
await window.getByTestId('briefing-source-anthropic').click()
await expect(window.getByTestId('browser-view-placeholder')).toHaveCount(0)
expect(server.requests).toHaveLength(0)
await window.getByTestId('article-panel-tab-browser-anthropic').click()
await expect(browserPage.getByLabel('draft')).toHaveValue('保留我')
```

- [ ] **Step 6: 运行单元、构建与定向 E2E**

Run: `npx vitest run tests/article-panel-mode.test.ts tests/browser-url.test.ts`

Run: `npm run build`

经用户确认后 Run: `node scripts/e2e-changed.js --run --no-retries`

Expected: 全部通过。应用重启的人工验收保留到 Task 5，不在此步额外启动实例。

- [ ] **Step 7: 提交**

```bash
git add src/lib/article-panel-mode.ts tests/article-panel-mode.test.ts src/types/index.ts src/store/index.ts electron/ipc/state.ts electron/lib/browser-view.ts src/components/article-assistant/BrowserPanel.tsx e2e/specs/right-rail-browser.spec.ts
git commit -m "feat: persist embedded browser state"
```

### Task 5: 文档、重启验收与交付检查

**Files:**
- Modify: `AGENTS.md`
- Modify: `docs/README.md`
- Modify: `docs/superpowers/specs/2026-11-16-right-rail-browser-design.md`
- Modify: `docs/superpowers/plans/2026-11-16-right-rail-browser.md`

**Interfaces:**
- Consumes: Tasks 1–4 已通过的实现与测试。
- Produces: 当前架构说明与完整交付证据。

- [ ] **Step 1: 更新现状文档**

在 `AGENTS.md` 的阅读体系说明中补充：右栏第三页签、`WebContentsView` 单实例、`persist:study-parlor-browser`、浏览器 IPC / 组件位置、`browserLastUrl` 恢复规则和安全边界。

`docs/README.md` 域 10 移除 planned 指针，现状改为「导读 / 对照 / 浏览器」，历史链末尾添加 `11-16 right-rail-browser`。功能落地后将 spec 与 plan frontmatter 均改为 `status: historical`。

- [ ] **Step 2: 运行文档与静态检查**

Run: `npm run docs:check`

Run: `git diff --check`

Expected: 文档索引、frontmatter、引用与空白检查全部通过。

- [ ] **Step 3: 运行最终定向验证**

Run: `npx vitest run tests/browser-url.test.ts tests/article-panel-mode.test.ts`

Run: `npm run build`

经用户确认后 Run: `node scripts/e2e-changed.js --run --no-retries`

Expected: 所有命令退出码为 0；不运行全量 E2E。

- [ ] **Step 4: 人工验收真实重启**

经用户明确确认后，在独立 worktree 启动应用，访问本地网页并关闭应用；重新启动后确认没有自动请求该网页，点击「浏览器」才恢复最后 URL。检查切换页签不丢表单、网站 Cookie 可复用、网页无 Node / 学习库访问能力。结束后只关闭该独立实例，不清理或重启用户主工作区进程。

- [ ] **Step 5: 提交并汇报**

```bash
git add AGENTS.md docs/README.md docs/superpowers/specs/2026-11-16-right-rail-browser-design.md docs/superpowers/plans/2026-11-16-right-rail-browser.md
git commit -m "docs: record embedded browser delivery"
```

汇报修改、测试证据、提交、分支和 worktree；按项目规则询问是否合并，未经授权不合并、不推送、不清理 worktree。
