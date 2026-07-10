# Anthropic 博客集成夜航简报（二轮）实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 `anthropic-scraper/` 消融进 Study Parlor 主代码库，用 Electron 内置 Chromium 替代 Playwright 运行时依赖，完成 P0–P3 所有读者体验缺口，使功能可上线打包。

**Architecture:** 主进程维护一个隐藏 off-screen `BrowserWindow` 单例，复用于列表/文章抓取；`turndown` 转成 Markdown 后做图片本地化（`.assets/`）；IPC 返回统一 `{ ok, ... } | { ok: false, code, message }` 结构；渲染进程使用可隐藏列表的分栏阅读器，并复用现有的 `briefingFontSize` 与 AI 日报版式组件。

**Tech Stack:** Electron 30 + React 18 + TypeScript + Zustand + Tailwind CSS + Turndown（仅构建期依赖，主进程 bundle）

---

## 文件结构

| 文件 | 职责 |
|---|---|
| `package.json` | `playwright` 移入 `devDependencies`，保留 `turndown` 运行时依赖 |
| `electron.vite.config.ts` | main 进程 external 仅保留 `electron`，让 `turndown` 被打包 |
| `electron-builder.yml` | 保持现有 `files` 白名单（`out/**/*` / `package.json` / `electron/prompts`） |
| `electron/main.ts` | CSP `img-src` 增加 `file:`，支持本地图片 |
| `src/types/index.ts` | 增加错误码类型、统一 IPC 返回结构、`anthropicBlogLastSeenAt` 等 |
| `electron/lib/frontmatter.ts` | 保持 `anthropic-article` 扩展字段（如需要可加入 `summary`） |
| `electron/lib/anthropic-browser.ts` | 新增：off-screen BrowserWindow 单例与取消机制 |
| `electron/lib/anthropic-scraper.ts` | 重写：用 BrowserWindow 抓取、图片本地化、结构化错误 |
| `electron/ipc/anthropic.ts` | 重写：统一 `{ ok }` 返回、新增 `anthropic:cancelImport` |
| `electron/ipc/app.ts` | 新增：`app:openExternal`（用 `shell.openExternal` 打开外链） |
| `electron/ipc/index.ts` | 注册 `registerAppIpc` 与 `registerAnthropicIpc` |
| `electron/preload.ts` | 暴露 `openExternal`、`anthropicCancelImport` |
| `src/lib/ipc.ts` | facade 增加对应 getter |
| `electron/ipc/state.ts` | `DEFAULT` 增加 `anthropicBlogLastSeenAt` |
| `src/store/index.ts` | 增加 `anthropicBlogLastSeenAt`、`anthropicImportingUrl`、取消/标为已读 actions |
| `src/components/md/MarkdownRenderer.tsx` | 增加可选 `hideHeader` prop |
| `src/components/md/components.tsx` | 外链 `<a>` 使用 `ipc.openExternal` |
| `src/components/anthropic/AnthropicErrorMessage.tsx` | 新增：错误码到中文文案映射 |
| `src/components/anthropic/AnthropicArticleRow.tsx` | 重写：新/已保存/导入中/取消状态 |
| `src/components/anthropic/AnthropicArticleReader.tsx` | 新增：分栏右侧阅读器、字体大小、ESC、外链、本地图片 |
| `src/components/anthropic/AnthropicBlogPanel.tsx` | 重写：搜索、自动刷新、新文章标记、分栏布局 |
| `src/pages/Briefing.tsx` | 移除 `ArticleReaderModal`，阅读器由 Panel 内部承载 |
| `e2e/helpers/selectors.ts` | 增加搜索/分栏/阅读器/取消等新选择器 |
| `e2e/helpers/test-library.ts` | `BASE_STATE` 增加 `anthropicBlogLastSeenAt` |
| `e2e/specs/anthropic-blog.spec.ts` | 更新为分栏阅读器链路，保留离线测试 |
| `tests/anthropic.test.ts` | 更新为 helper + 图片本地化单元测试，移除主进程 BrowserWindow 集成测试 |

---

### Task 1: 依赖与构建配置

**Files:**
- Modify: `package.json`
- Modify: `electron.vite.config.ts`

- [ ] **Step 1: 调整依赖位置**

`package.json` 改为：

```json
{
  "dependencies": {
    "dotenv": "^16.4.5",
    "gray-matter": "^4.0.3",
    "react": "^18.3.1",
    "react-dom": "^18.3.1",
    "react-markdown": "^10.1.0",
    "rehype-raw": "^7.0.0",
    "remark-gfm": "^4.0.1",
    "turndown": "^7.2.0",
    "zustand": "^4.5.5"
  },
  "devDependencies": {
    "@playwright/test": "^1.45.0",
    "@testing-library/jest-dom": "^6.9.1",
    "@testing-library/react": "^16.3.2",
    "@types/node": "^20.14.10",
    "@types/react": "^18.3.3",
    "@types/react-dom": "^18.3.0",
    "@types/turndown": "^5.0.5",
    "@vitejs/plugin-react": "^4.3.1",
    "autoprefixer": "^10.4.19",
    "electron": "30.5.1",
    "electron-builder": "^26.8.1",
    "electron-vite": "^2.3.0",
    "jsdom": "^29.1.1",
    "playwright": "^1.45.0",
    "postcss": "^8.4.40",
    "tailwindcss": "^3.4.7",
    "typescript": "^5.5.4",
    "vite": "^5.4.1",
    "vitest": "^2.0.5"
  }
}
```

- [ ] **Step 2: 修改 main 进程 external**

`electron.vite.config.ts`：

```ts
        external: ['electron']
```

- [ ] **Step 3: 安装依赖**

Run:
```bash
npm install
```

Expected: `node_modules` 中 `playwright` 仅在 devDependencies 生效；`turndown` 仍在运行时依赖。

---

### Task 2: 共享类型

**Files:**
- Modify: `src/types/index.ts`

- [ ] **Step 1: 增加 Anthropic 错误码与统一返回类型**

在 `AnthropicBlogCache` 上方插入：

```ts
export type AnthropicErrorCode =
  | 'browser-init-failed'
  | 'network-error'
  | 'parse-error'
  | 'import-failed'
  | 'cancelled'
  | 'unknown'

export type AnthropicError = {
  code: AnthropicErrorCode
  message: string
}
```

修改 `AnthropicBlogCache`（内存态，不持久化 `loading`/`error`）：

```ts
export type AnthropicBlogCache = {
  lastFetchedAt: string | null
  articles: AnthropicArticleMeta[]
  loading: boolean
  error: AnthropicError | null
}
```

- [ ] **Step 2: 扩展 StateJson**

```ts
  briefingSource?: 'digest' | 'anthropic'
  anthropicBlogCache?: AnthropicBlogCache
  anthropicBlogLastSeenAt?: string | null
```

- [ ] **Step 3: 扩展 IpcApi**

替换 Anthropic 部分为：

```ts
  // Anthropic blog
  anthropicDiscover: () => Promise<
    | { ok: true; lastFetchedAt: string; articles: AnthropicArticleMeta[] }
    | { ok: false; code: AnthropicErrorCode; message: string }
  >
  anthropicImportArticle: (url: string) => Promise<
    | { ok: true; filePath: string; wasAlreadySaved: boolean }
    | { ok: false; code: AnthropicErrorCode; message: string }
  >
  anthropicCancelImport: () => Promise<void>

  // App shell
  openExternal: (url: string) => Promise<void>
```

- [ ] **Step 4: 类型检查**

Run:
```bash
npx tsc --noEmit
```

Expected: 仅 Anthropic 相关旧签名报错（下一步修复）。

---

### Task 3: 外链打开 IPC

**Files:**
- Create: `electron/ipc/app.ts`
- Modify: `electron/ipc/index.ts`
- Modify: `electron/preload.ts`
- Modify: `src/lib/ipc.ts`
- Modify: `src/components/md/components.tsx`

- [ ] **Step 1: 创建 `electron/ipc/app.ts`**

```ts
import { ipcMain, shell } from 'electron'

export function registerAppIpc() {
  ipcMain.handle('app:openExternal', async (_, url: string) => {
    if (!url || typeof url !== 'string') return
    await shell.openExternal(url)
  })
}
```

- [ ] **Step 2: 在 IPC 总线注册**

`electron/ipc/index.ts`：

```ts
import { registerAppIpc } from './app'

export function registerAllIpc(cfg: AppConfig, getMainWindow: () => BrowserWindow | null) {
  registerAppIpc()
  registerConfigIpc()
  // ... existing registers
}
```

- [ ] **Step 3: Preload 暴露**

`electron/preload.ts` 在 `briefingGenerate` 上方加入：

```ts
  openExternal: (url) => ipcRenderer.invoke('app:openExternal', url),
```

并在 Anthropic 部分加入：

```ts
  anthropicCancelImport: () => ipcRenderer.invoke('anthropic:cancelImport'),
```

- [ ] **Step 4: Facade 增加 getter**

`src/lib/ipc.ts` 加入：

```ts
  get openExternal() { return ensure().openExternal },
  get anthropicCancelImport() { return ensure().anthropicCancelImport },
```

- [ ] **Step 5: Markdown 外链组件使用 openExternal**

`src/components/md/components.tsx`：

```ts
import { ipc } from '@/lib/ipc'

const baseComponents: Components = {
  // ... existing components
  a: ({ href, children }) => {
    const isExternal = href?.startsWith('http://') || href?.startsWith('https://')
    if (isExternal) {
      return (
        <a
          href={href}
          onClick={(e) => {
            e.preventDefault()
            ipc.openExternal(href)
          }}
          className="text-ember hover:underline"
        >
          {children}
        </a>
      )
    }
    return <a href={href}>{children}</a>
  },
  // ... rest
}
```

---

### Task 4: BrowserWindow 单例

**Files:**
- Create: `electron/lib/anthropic-browser.ts`

- [ ] **Step 1: 创建文件**

```ts
import { BrowserWindow } from 'electron'

type NavOptions = {
  waitForSelector?: string
  timeout?: number
}

export class AnthropicBrowser {
  private win: BrowserWindow | null = null
  private current: { url: string; abort: AbortController } | null = null

  async evaluate<T>(url: string, script: string, opts: NavOptions = {}): Promise<T> {
    await this.ensureWindow()
    const abort = new AbortController()
    this.current = { url, abort }
    try {
      await this.navigate(url, { ...opts, abort })
      if (abort.signal.aborted) throw this.cancelledError()
      const result = await this.win!.webContents.executeJavaScript(script, true)
      if (abort.signal.aborted) throw this.cancelledError()
      return result as T
    } finally {
      if (this.current?.abort === abort) this.current = null
    }
  }

  cancelCurrent(): void {
    this.current?.abort.abort()
    try {
      this.win?.webContents.stop()
    } catch {}
  }

  destroy(): void {
    this.cancelCurrent()
    if (this.win && !this.win.isDestroyed()) {
      this.win.destroy()
      this.win = null
    }
  }

  private cancelledError() {
    const err = new Error('操作已取消')
    ;(err as any).code = 'cancelled'
    return err
  }

  private async ensureWindow(): Promise<void> {
    if (this.win && !this.win.isDestroyed()) return
    this.win = new BrowserWindow({
      width: 1280,
      height: 800,
      show: false,
      webPreferences: {
        offscreen: true,
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
      },
    })
    this.win.webContents.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36'
    )
  }

  private navigate(
    url: string,
    opts: NavOptions & { abort: AbortController }
  ): Promise<void> {
    const { abort, waitForSelector, timeout = 60000 } = opts
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        cleanup()
        reject(Object.assign(new Error(`导航超时：${url}`), { code: 'network-error' }))
      }, timeout)

      const onFinish = async () => {
        if (abort.signal.aborted) {
          cleanup()
          reject(this.cancelledError())
          return
        }
        if (!waitForSelector) {
          cleanup()
          resolve()
          return
        }
        try {
          await this.waitForSelector(waitForSelector, { abort, timeout: 10000 })
          cleanup()
          resolve()
        } catch (err) {
          cleanup()
          reject(err)
        }
      }

      const onFail = (_: any, code: string, desc: string) => {
        cleanup()
        reject(
          Object.assign(new Error(`页面加载失败：${desc || code}`), {
            code: mapErrorCode(code),
          })
        )
      }

      const cleanup = () => {
        clearTimeout(timer)
        this.win!.webContents.off('did-finish-load', onFinish)
        this.win!.webContents.off('did-fail-load', onFail)
      }

      this.win!.webContents.on('did-finish-load', onFinish)
      this.win!.webContents.on('did-fail-load', onFail)
      this.win!.webContents.loadURL(url).catch((err: Error) => {
        cleanup()
        reject(Object.assign(new Error(`无法打开页面：${err.message}`), { code: 'network-error' }))
      })

      abort.signal.addEventListener(
        'abort',
        () => {
          cleanup()
          reject(this.cancelledError())
        },
        { once: true }
      )
    })
  }

  private async waitForSelector(
    selector: string,
    opts: { abort: AbortController; timeout: number }
  ): Promise<void> {
    const deadline = Date.now() + opts.timeout
    while (Date.now() < deadline) {
      if (opts.abort.signal.aborted) throw this.cancelledError()
      const found = await this.win!.webContents.executeJavaScript(
        `!!document.querySelector(${JSON.stringify(selector)})`,
        true
      )
      if (found) return
      await new Promise((r) => setTimeout(r, 200))
    }
    throw Object.assign(new Error(`等待元素超时：${selector}`), { code: 'parse-error' })
  }
}

function mapErrorCode(code: string): string {
  const c = String(code).toLowerCase()
  if (
    c.includes('internet_disconnected') ||
    c.includes('name_not_resolved') ||
    c.includes('err_network') ||
    c.includes('timeout')
  ) {
    return 'network-error'
  }
  return 'browser-init-failed'
}

export const anthropicBrowser = new AnthropicBrowser()
```

- [ ] **Step 2: 编译检查**

Run:
```bash
npx tsc --noEmit -p tsconfig.node.json
```

Expected: 无新增错误。

---

### Task 5: 重写抓取与图片本地化

**Files:**
- Modify: `electron/lib/anthropic-scraper.ts`

- [ ] **Step 1: 完整替换文件内容**

```ts
import fs from 'node:fs'
import path from 'node:path'
import https from 'node:https'
import { URL } from 'node:url'
import TurndownService from 'turndown'
import { anthropicBrowser } from './anthropic-browser'
import { parseFrontmatter, serializeFrontmatter } from './frontmatter'
import type { AnthropicArticleMeta, AnthropicErrorCode } from '@shared/index'

const BASE_URL = 'https://www.anthropic.com'
const ENGINEERING_URL = `${BASE_URL}/engineering`
const IMPORT_DIR = 'Anthropic博客'

const turndown = new TurndownService({
  headingStyle: 'atx',
  codeBlockStyle: 'fenced',
})

export function toAbsoluteUrl(relativeOrAbsolute: string): string {
  if (!relativeOrAbsolute) return relativeOrAbsolute
  if (/^https?:\/\//.test(relativeOrAbsolute)) return relativeOrAbsolute
  if (relativeOrAbsolute.startsWith('//')) return `https:${relativeOrAbsolute}`
  return `${BASE_URL}${relativeOrAbsolute.startsWith('/') ? '' : '/'}${relativeOrAbsolute}`
}

export function parseDateString(str: string | null | undefined): string | null {
  if (!str) return null
  try {
    const cleaned = String(str).trim().replace(/\.$/, '')
    const parsed = new Date(cleaned)
    if (!Number.isNaN(parsed.getTime())) return parsed.toISOString()
  } catch {}
  return null
}

export function firstParagraphToSummary(markdown: string, maxLength = 280): string {
  if (!markdown) return ''
  const firstBlock = markdown
    .split('\n\n')
    .map((b) => b.trim())
    .find((b) => b.length > 0 && !b.startsWith('#'))
  if (!firstBlock) return ''
  const text = firstBlock.replace(/\n/g, ' ').replace(/\s+/g, ' ').trim()
  if (text.length <= maxLength) return text
  return `${text.slice(0, maxLength - 1)}…`
}

function safeFileName(title: string): string {
  return title
    .replace(/[\\/:*?"<>|]/g, '_')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120)
}

export function getImportFolder(publishedAt: string): string {
  try {
    const d = new Date(publishedAt)
    if (!Number.isNaN(d.getTime())) {
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    }
  } catch {}
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

function walkMdFiles(dir: string, cb: (filePath: string) => void) {
  if (!fs.existsSync(dir)) return
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      walkMdFiles(full, cb)
    } else if (entry.isFile() && entry.name.endsWith('.md')) {
      cb(full)
    }
  }
}

export function findSavedArticles(libraryRoot: string): Map<string, string> {
  const map = new Map<string, string>()
  const dir = path.join(libraryRoot, IMPORT_DIR)
  walkMdFiles(dir, (filePath) => {
    try {
      const raw = fs.readFileSync(filePath, 'utf8')
      const { frontmatter } = parseFrontmatter(raw, { filename: path.basename(filePath) })
      if (frontmatter.source_url) map.set(frontmatter.source_url, filePath)
    } catch {}
  })
  return map
}

function wrapError(err: any): { code: AnthropicErrorCode; message: string } {
  const code: AnthropicErrorCode = err?.code || 'unknown'
  const message = err?.message || String(err)
  return { code, message }
}

const LISTING_SCRIPT = `
(() => {
  const seen = new Set()
  const results = []
  const datePattern = /\\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\\s+\\d{1,2},?\\s+\\d{4}\\b/
  const findCardDate = (a) => {
    let container = a.closest('[class*="ArticleList"], article, li')
    if (!container) container = a.parentElement
    const dateEl = container?.querySelector('[class*="__date"]')
    if (dateEl) return dateEl.textContent?.trim() || null
    let el = a
    for (let i = 0; i < 4 && el; i++) {
      const match = el.textContent?.match(datePattern)
      if (match) return match[0]
      el = el.parentElement
    }
    return null
  }
  const findCardImage = (a) => {
    let container = a.closest('[class*="ArticleList"], article, li')
    if (!container) container = a.parentElement
    const img = container?.querySelector('img')
    return img?.getAttribute('src') || img?.getAttribute('data-src') || null
  }
  document.querySelectorAll('a[href^="/engineering/"]').forEach(a => {
    const href = a.getAttribute('href')
    if (!href) return
    const url = href.startsWith('http') ? href : (window.location.origin + href)
    if (seen.has(url)) return
    seen.add(url)
    const title = a.querySelector('h2, h3, h4, [class*="__title"], [class*="title"]')?.textContent?.trim()
      || a.textContent?.trim()
    const summary = a.querySelector('[class*="__summary"]')?.textContent?.trim() || null
    results.push({ url, title, summary, dateText: findCardDate(a), imageUrl: findCardImage(a) })
  })
  return results
})()
`

const ARTICLE_SCRIPT = `
(() => {
  const data = {
    title: '',
    url: window.location.href,
    publishedAt: null,
    authors: [],
    summary: '',
    contentHtml: '',
    images: []
  }
  data.title = document.querySelector('h1')?.textContent?.trim()
    || document.querySelector('title')?.textContent?.trim()
    || ''

  const timeEl = document.querySelector('time[datetime]')
  if (timeEl) data.publishedAt = timeEl.getAttribute('datetime')
  if (!data.publishedAt) {
    data.publishedAt =
      document.querySelector('meta[property="article:published_time"]')?.getAttribute('content')
      || document.querySelector('meta[name="publish-date"]')?.getAttribute('content')
      || null
  }
  if (!data.publishedAt) {
    try {
      document.querySelectorAll('script[type="application/ld+json"]').forEach(script => {
        if (data.publishedAt) return
        const json = JSON.parse(script.textContent || '{}')
        const candidates = [
          json.datePublished,
          json?.['@graph']?.find?.(x => x.datePublished)?.datePublished,
        ]
        for (const d of candidates) {
          if (d) { data.publishedAt = d; break }
        }
      })
    } catch {}
  }

  document.querySelectorAll('a[href*="/authors/"], [data-testid="author-name"], .author').forEach(el => {
    const name = el.textContent?.trim()
    if (name && !data.authors.includes(name)) data.authors.push(name)
  })
  if (data.authors.length === 0) {
    const authorMeta = document.querySelector('meta[name="author"]')?.getAttribute('content')
    if (authorMeta) data.authors.push(authorMeta)
  }
  if (data.authors.length === 0) {
    try {
      document.querySelectorAll('script[type="application/ld+json"]').forEach(script => {
        if (data.authors.length > 0) return
        const json = JSON.parse(script.textContent || '{}')
        const author = json.author?.name || json?.['@graph']?.find?.(x => x.author)?.author?.name
        if (author && !data.authors.includes(author)) data.authors.push(author)
      })
    } catch {}
  }

  data.summary =
    document.querySelector('meta[property="og:description"]')?.getAttribute('content')
    || document.querySelector('meta[name="twitter:description"]')?.getAttribute('content')
    || document.querySelector('meta[name="description"]')?.getAttribute('content')
    || ''

  const selectors = ['article', 'main article', 'main > div', '[data-testid="article-body"]', '.prose', '.article-content', 'main']
  let contentEl = null
  for (const sel of selectors) {
    contentEl = document.querySelector(sel)
    if (contentEl) break
  }

  if (contentEl) {
    const clone = contentEl.cloneNode(true)
    clone.querySelectorAll('nav, header, footer, aside, script, style, form, .related-posts').forEach(el => el.remove())
    clone.querySelectorAll('img').forEach(img => {
      const src = img.getAttribute('src') || img.getAttribute('data-src')
      if (src) {
        const absolute = src.startsWith('http')
          ? src
          : (window.location.origin + (src.startsWith('/') ? '' : '/') + src)
        img.setAttribute('src', absolute)
        img.removeAttribute('data-src')
      }
    })
    data.contentHtml = clone.innerHTML.trim()
    clone.querySelectorAll('img').forEach(img => {
      const src = img.getAttribute('src')
      if (src) data.images.push({ url: src, alt: img.getAttribute('alt') || '' })
    })
  }

  return data
})()
`

export async function discoverArticles(
  libraryRoot: string
): Promise<{ ok: true; lastFetchedAt: string; articles: AnthropicArticleMeta[] } | { ok: false; code: AnthropicErrorCode; message: string }> {
  if (process.env.E2E_ANTHROPIC_OFFLINE === '1') {
    return { ok: false, code: 'network-error', message: 'Anthropic 网站不可达（离线模拟）' }
  }
  try {
    const links = await anthropicBrowser.evaluate<
      { url: string; title: string; summary: string | null; dateText: string | null; imageUrl: string | null }[]
    >(ENGINEERING_URL, LISTING_SCRIPT, { waitForSelector: 'a[href^="/engineering/"]' })

    const saved = findSavedArticles(libraryRoot)
    const articles = links
      .map((link) => ({
        url: link.url,
        title: link.title,
        summary: link.summary,
        publishedAt: parseDateString(link.dateText),
        imageUrl: toAbsoluteUrl(link.imageUrl),
        isSaved: saved.has(link.url),
      }))
      .filter((a) => a.title && a.url)

    return { ok: true, lastFetchedAt: new Date().toISOString(), articles }
  } catch (err: any) {
    return { ok: false, ...wrapError(err) }
  }
}

function sanitizeImageFileName(name: string): string {
  return name.replace(/[\\/:*?"<>|]/g, '_').slice(0, 80)
}

function imageFileNameFromUrl(url: string): string {
  try {
    const parsed = new URL(url)
    const base = path.basename(parsed.pathname) || 'image'
    const clean = sanitizeImageFileName(base)
    if (clean) return clean
  } catch {}
  return `image-${Date.now()}.png`
}

async function downloadImage(url: string, destPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, (res) => {
      if (res.statusCode !== 200) {
        reject(new Error(`status ${res.statusCode}`))
        return
      }
      const file = fs.createWriteStream(destPath)
      res.pipe(file)
      file.on('finish', () => {
        file.close()
        resolve()
      })
      file.on('error', reject)
    })
    req.on('error', reject)
    req.setTimeout(30000, () => {
      req.destroy()
      reject(new Error('timeout'))
    })
  })
}

export async function localizeImages(markdown: string, assetDir: string): Promise<string> {
  fs.mkdirSync(assetDir, { recursive: true })
  const matches = Array.from(markdown.matchAll(/!\[([^\]]*)\]\((https?:\/\/[^)\s]+)\)/g))
  const replacements: { from: string; to: string }[] = []
  const usedPaths = new Set<string>()

  for (const match of matches) {
    const [full, alt, url] = match
    if (replacements.some((r) => r.from === full)) continue

    let fileName = imageFileNameFromUrl(url)
    let destPath = path.join(assetDir, fileName)
    let counter = 2
    while (usedPaths.has(destPath) || fs.existsSync(destPath)) {
      const ext = path.extname(fileName)
      const base = path.basename(fileName, ext)
      destPath = path.join(assetDir, `${base}-${counter}${ext}`)
      counter++
    }
    usedPaths.add(destPath)

    let relativePath: string
    try {
      await downloadImage(url, destPath)
      relativePath = './' + path.basename(assetDir) + '/' + path.basename(destPath)
    } catch {
      relativePath = url
    }

    replacements.push({ from: full, to: `![${alt}](${relativePath})` })
  }

  let result = markdown
  for (const { from, to } of replacements) {
    result = result.replace(from, to)
  }
  return result
}

export async function importArticle(
  url: string,
  libraryRoot: string
): Promise<{ ok: true; filePath: string; wasAlreadySaved: boolean } | { ok: false; code: AnthropicErrorCode; message: string }> {
  if (process.env.E2E_ANTHROPIC_OFFLINE === '1') {
    return { ok: false, code: 'network-error', message: 'Anthropic 网站不可达（离线模拟）' }
  }

  const saved = findSavedArticles(libraryRoot)
  const existing = saved.get(url)
  if (existing) return { ok: true, filePath: existing, wasAlreadySaved: true }

  try {
    const data = await anthropicBrowser.evaluate<{
      title: string
      url: string
      publishedAt: string | null
      authors: string[]
      summary: string
      contentHtml: string
      images: { url: string; alt: string }[]
    }>(url, ARTICLE_SCRIPT, { waitForSelector: 'article, main' })

    const markdown = data.contentHtml ? turndown.turndown(data.contentHtml) : ''

    const GENERIC_SUMMARY_MARKERS = [
      'Anthropic is an AI safety',
      'reliable, interpretable, and steerable AI systems',
    ]
    const isGeneric = data.summary && GENERIC_SUMMARY_MARKERS.some((marker) => data.summary.includes(marker))
    const summary = data.summary && !isGeneric ? data.summary : firstParagraphToSummary(markdown)

    const publishedAt = data.publishedAt || new Date().toISOString()
    const folder = getImportFolder(publishedAt)
    const dir = path.join(libraryRoot, IMPORT_DIR, folder)
    fs.mkdirSync(dir, { recursive: true })

    const baseName = safeFileName(data.title) || 'untitled'
    let filePath = path.join(dir, `${baseName}.md`)
    let counter = 2
    while (fs.existsSync(filePath)) {
      filePath = path.join(dir, `${baseName}-${counter}.md`)
      counter++
    }

    const assetDir = path.join(dir, `${baseName}.assets`)
    const localizedMarkdown = await localizeImages(markdown, assetDir)

    const raw = serializeFrontmatter(
      'anthropic-article',
      {
        title: data.title,
        description: summary,
        type: 'anthropic-article',
        created: publishedAt,
        tags: ['anthropic', 'engineering'],
        source_url: data.url,
        published_at: publishedAt,
        imported_at: new Date().toISOString(),
        authors: data.authors.length > 0 ? data.authors : ['Anthropic'],
      },
      localizedMarkdown
    )

    fs.writeFileSync(filePath, raw, 'utf8')
    return { ok: true, filePath, wasAlreadySaved: false }
  } catch (err: any) {
    return { ok: false, ...wrapError(err) }
  }
}
```

- [ ] **Step 2: 编译检查**

Run:
```bash
npx tsc --noEmit -p tsconfig.node.json
```

Expected: 无新增错误。

---

### Task 6: 重写 Anthropic IPC

**Files:**
- Modify: `electron/ipc/anthropic.ts`

- [ ] **Step 1: 完整替换文件内容**

```ts
import { ipcMain } from 'electron'
import { discoverArticles, importArticle } from '../lib/anthropic-scraper'
import { anthropicBrowser } from '../lib/anthropic-browser'
import { patchState } from './state'
import type { AppConfig } from '../env'
import type { AnthropicErrorCode } from '@shared/index'

export function registerAnthropicIpc(cfg: AppConfig) {
  ipcMain.handle('anthropic:discover', async () => {
    const result = await discoverArticles(cfg.libraryPath)
    if (result.ok) {
      patchState({ anthropicBlogCache: result })
    }
    return result
  })

  ipcMain.handle('anthropic:importArticle', async (_, url: string) => {
    return importArticle(url, cfg.libraryPath)
  })

  ipcMain.handle('anthropic:cancelImport', async () => {
    anthropicBrowser.cancelCurrent()
  })
}
```

- [ ] **Step 2: 编译检查**

Run:
```bash
npx tsc --noEmit -p tsconfig.node.json
```

Expected: 无新增错误。

---

### Task 7: 状态默认值

**Files:**
- Modify: `electron/ipc/state.ts`

- [ ] **Step 1: 扩展 DEFAULT**

```ts
const DEFAULT: StateJson = {
  version: 1,
  profile: { name: '', profile_text: '', preferred_topics: [] },
  lastUsed: { difficulty: 'mid', temperature: 0.7 },
  groupInspirations: {},
  ui: { session_count: 0 },
  inspirationStrategy: 'v2',
  fableStyleTags: ['科幻', '童话', '历史', '日常生活', '悬疑', '诗意散文'],
  lastFableTags: [],
  topicContinueSuggestions: {},
  briefingSource: 'digest',
  anthropicBlogCache: { lastFetchedAt: null, articles: [] },
  anthropicBlogLastSeenAt: null,
}
```

---

### Task 8: Store 状态层更新

**Files:**
- Modify: `src/store/index.ts`

- [ ] **Step 1: 扩展 AppStore 类型**

在 Anthropic 区域改为：

```ts
  // Anthropic 博客
  briefingSource: 'digest' | 'anthropic'
  anthropicBlogCache: AnthropicBlogCache
  anthropicReaderFilePath: string | null
  anthropicBlogLastSeenAt: string | null
  anthropicImportingUrl: string | null
  setBriefingSource: (source: 'digest' | 'anthropic') => Promise<void>
  discoverAnthropicArticles: () => Promise<void>
  importAnthropicArticle: (url: string) => Promise<void>
  cancelAnthropicImport: () => Promise<void>
  openAnthropicReader: (filePath: string) => void
  closeAnthropicReader: () => void
  markAnthropicArticlesAsSeen: () => Promise<void>
```

- [ ] **Step 2: 扩展默认值**

在 `anthropicReaderFilePath: null,` 后增加：

```ts
  anthropicBlogLastSeenAt: null,
  anthropicImportingUrl: null,
```

- [ ] **Step 3: 在 init 中加载持久化字段**

在 `anthropicBlogCache: state.anthropicBlogCache ? ... : ...` 后增加：

```ts
      anthropicBlogLastSeenAt: state.anthropicBlogLastSeenAt ?? null,
```

- [ ] **Step 4: 替换 Anthropic actions 块**

替换 `setBriefingSource` 到 `closeAnthropicReader` 的整块为：

```ts
  setBriefingSource: async (source) => {
    set({ briefingSource: source })
    await ipc.patchState({ briefingSource: source } as Partial<StateJson>)
  },

  discoverAnthropicArticles: async () => {
    set((s) => ({
      anthropicBlogCache: { ...s.anthropicBlogCache, loading: true, error: null },
    }))
    try {
      const result = await ipc.anthropicDiscover()
      if (!result.ok) {
        set((s) => ({
          anthropicBlogCache: { ...s.anthropicBlogCache, loading: false, error: { code: result.code, message: result.message } },
        }))
        return
      }
      set((s) => ({
        anthropicBlogCache: { ...result, loading: false, error: null },
      }))
    } catch (err: any) {
      set((s) => ({
        anthropicBlogCache: {
          ...s.anthropicBlogCache,
          loading: false,
          error: { code: err?.code || 'unknown', message: err?.message || String(err) },
        },
      }))
    }
  },

  importAnthropicArticle: async (url) => {
    set({ anthropicImportingUrl: url })
    try {
      const result = await ipc.anthropicImportArticle(url)
      if (!result.ok) {
        get().showToast(result.message || '导入失败')
        set({ anthropicImportingUrl: null })
        return
      }
      set((s) => ({
        anthropicBlogCache: {
          ...s.anthropicBlogCache,
          articles: s.anthropicBlogCache.articles.map((a) =>
            a.url === url ? { ...a, isSaved: true } : a
          ),
        },
        anthropicReaderFilePath: result.filePath,
        anthropicImportingUrl: null,
      }))
    } catch (err: any) {
      get().showToast(err?.message || '导入失败')
      set({ anthropicImportingUrl: null })
    }
  },

  cancelAnthropicImport: async () => {
    await ipc.anthropicCancelImport()
    set({ anthropicImportingUrl: null })
  },

  openAnthropicReader: (filePath) => set({ anthropicReaderFilePath: filePath }),
  closeAnthropicReader: () => set({ anthropicReaderFilePath: null }),

  markAnthropicArticlesAsSeen: async () => {
    const now = new Date().toISOString()
    set({ anthropicBlogLastSeenAt: now })
    await ipc.patchState({ anthropicBlogLastSeenAt: now } as Partial<StateJson>)
  },
```

- [ ] **Step 5: 类型检查**

Run:
```bash
npx tsc --noEmit
```

Expected: 无新增错误。

---

### Task 9: CSP 允许本地图片

**Files:**
- Modify: `electron/main.ts`

- [ ] **Step 1: 修改 CSP 行**

将 `img-src 'self' data: https:` 改为：

```ts
            ? "default-src 'self'; script-src 'self' 'unsafe-inline'; img-src 'self' data: https: file:; style-src 'self' 'unsafe-inline'; connect-src 'self' https://api.kimi.com"
            : "default-src 'self'; script-src 'self'; img-src 'self' data: https: file:; style-src 'self' 'unsafe-inline'; connect-src 'self' https://api.kimi.com"
```

---

### Task 10: MarkdownRenderer 支持隐藏头部

**Files:**
- Modify: `src/components/md/MarkdownRenderer.tsx`

- [ ] **Step 1: 增加 `hideHeader` prop**

```ts
interface Props {
  content: string
  fileName: string
  briefingStyle?: 'academic' | 'newspaper'
  hideHeader?: boolean
}
```

```ts
export function MarkdownRenderer({ content, fileName, briefingStyle, hideHeader }: Props) {
```

将 `const hideReportHeader = fileName === 'briefing.md'` 改为：

```ts
  const hideReportHeader = hideHeader || fileName === 'briefing.md'
```

---

### Task 11: 错误消息组件

**Files:**
- Create: `src/components/anthropic/AnthropicErrorMessage.tsx`

- [ ] **Step 1: 创建组件**

```tsx
import type { AnthropicError } from '@shared/index'

interface Props {
  error: AnthropicError
  onRetry?: () => void
}

const MESSAGES: Record<string, string> = {
  'browser-init-failed': '内置浏览器启动失败，请重启应用后重试。',
  'network-error': '网络连接失败，请检查网络后重试。',
  'parse-error': '页面解析失败，Anthropic 网站结构可能已变更。',
  'import-failed': '文章导入失败，请重试。',
  'cancelled': '操作已取消。',
  'unknown': '发生未知错误，请重试。',
}

export function AnthropicErrorMessage({ error, onRetry }: Props) {
  return (
    <div className="rounded border border-wine/50 bg-wine/10 p-4 text-parchment">
      <p className="mb-2">{MESSAGES[error.code] || error.message}</p>
      {onRetry && (
        <button onClick={onRetry} className="text-ember hover:underline">
          重试
        </button>
      )}
    </div>
  )
}
```

---

### Task 12: 阅读器组件

**Files:**
- Create: `src/components/anthropic/AnthropicArticleReader.tsx`

- [ ] **Step 1: 创建组件**

```tsx
import { useEffect, useMemo, useState } from 'react'
import { useStore } from '@/store'
import { ipc } from '@/lib/ipc'
import { MarkdownRenderer } from '@/components/md/MarkdownRenderer'
import {
  ACADEMIC_BODY_STYLES,
  ACADEMIC_HEADING_STYLES,
} from '@/lib/briefing-font-size'
import type { Frontmatter } from '@shared/index'

interface Props {
  filePath: string
  onClose: () => void
  listHidden: boolean
  onToggleList: () => void
}

function formatDate(iso: string | undefined) {
  if (!iso) return null
  try {
    return new Date(iso).toLocaleDateString('zh-CN', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    })
  } catch {
    return iso
  }
}

function resolveImagePaths(body: string, mdFilePath: string): string {
  const mdDir = mdFilePath.replace(/\\/g, '/').split('/').slice(0, -1).join('/')
  return body.replace(
    /!\[([^\]]*)\]\((?!https?:\/\/)([^)\s]+)\)/g,
    (match, alt, rel) => {
      const relPath = rel.replace(/^\.\/?/, '')
      const abs = `${mdDir}/${relPath}`
      return `![${alt}](file://${abs})`
    }
  )
}

export function AnthropicArticleReader({ filePath, onClose, listHidden, onToggleList }: Props) {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [frontmatter, setFrontmatter] = useState<Frontmatter | null>(null)
  const [body, setBody] = useState('')

  const fontSize = useStore((s) => s.briefingFontSize)
  const increase = useStore((s) => s.increaseBriefingFontSize)
  const decrease = useStore((s) => s.decreaseBriefingFontSize)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    ipc
      .readMd(filePath)
      .then((r) => {
        if (cancelled) return
        setFrontmatter(r.frontmatter)
        setBody(resolveImagePaths(r.body, filePath))
        setLoading(false)
      })
      .catch((err) => {
        if (cancelled) return
        setError(String(err?.message || err))
        setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [filePath])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const style = useMemo(() => {
    const bodyStyle = ACADEMIC_BODY_STYLES[fontSize]
    const headingStyle = ACADEMIC_HEADING_STYLES[fontSize]
    return {
      '--briefing-body-size': bodyStyle.size,
      '--briefing-body-weight': String(bodyStyle.weight),
      '--briefing-heading-size': headingStyle.size,
      '--briefing-heading-weight': String(headingStyle.weight),
    } as React.CSSProperties
  }, [fontSize])

  const openSource = (url: string) => {
    ipc.openExternal(url)
  }

  return (
    <div
      data-testid="anthropic-article-reader"
      className="flex-1 flex flex-col min-w-0 bg-[#2a1f1a] border-l border-slate/30"
      style={style}
    >
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate/30">
        <div className="flex items-center gap-2">
          <button
            data-testid="anthropic-reader-toggle-list"
            onClick={onToggleList}
            className="text-xs px-2 py-1 rounded border border-slate/30 text-parchment/80 hover:bg-slate/10"
          >
            {listHidden ? '显示列表' : '隐藏列表'}
          </button>
        </div>
        <div className="flex items-center gap-2">
          <button
            data-testid="anthropic-reader-font-decrease"
            onClick={decrease}
            className="text-sm px-2 py-1 rounded text-parchment/80 hover:bg-slate/10"
            aria-label="缩小字体"
          >
            A-
          </button>
          <button
            data-testid="anthropic-reader-font-increase"
            onClick={increase}
            className="text-sm px-2 py-1 rounded text-parchment/80 hover:bg-slate/10"
            aria-label="放大字体"
          >
            A+
          </button>
          <button
            data-testid="anthropic-reader-close"
            onClick={onClose}
            className="text-parchment/60 hover:text-parchment text-xl px-2"
            aria-label="关闭阅读器"
          >
            ✕
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-6 py-6">
        {loading ? (
          <div className="space-y-4">
            <div className="h-6 rounded bg-parchment/10 animate-pulse" />
            <div className="h-40 rounded bg-parchment/10 animate-pulse" />
          </div>
        ) : error ? (
          <p className="text-parchment">{error}</p>
        ) : frontmatter ? (
          <article>
            <h1
              data-testid="anthropic-reader-title"
              className="text-2xl font-serif font-semibold text-parchment mb-3"
            >
              {frontmatter.title}
            </h1>

            <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-parchment/60 mb-4">
              {frontmatter.source_url && (
                <span>
                  来源：
                  <button
                    onClick={() => openSource(frontmatter.source_url!)}
                    className="text-ember hover:underline"
                  >
                    Anthropic Engineering ↗
                  </button>
                </span>
              )}
              {frontmatter.published_at && (
                <span>发布：{formatDate(frontmatter.published_at)}</span>
              )}
              {frontmatter.imported_at && (
                <span>导入：{formatDate(frontmatter.imported_at)}</span>
              )}
              {frontmatter.authors && frontmatter.authors.length > 0 && (
                <span>作者：{frontmatter.authors.join(', ')}</span>
              )}
            </div>

            {frontmatter.description && (
              <div className="mb-6 px-4 py-3 border-l-4 border-ember bg-parchment/5 rounded-r text-parchment/80 italic leading-relaxed">
                {frontmatter.description}
              </div>
            )}

            <div className="text-parchment/90 leading-[1.85]" style={{ fontSize: 'var(--briefing-body-size)', fontWeight: 'var(--briefing-body-weight)' }}>
              <MarkdownRenderer
                content={body}
                fileName={frontmatter.title || 'article.md'}
                briefingStyle="academic"
                hideHeader
              />
            </div>
          </article>
        ) : null}
      </div>
    </div>
  )
}
```

---

### Task 13: 文章行组件

**Files:**
- Modify: `src/components/anthropic/AnthropicArticleRow.tsx`

- [ ] **Step 1: 完整替换文件内容**

```tsx
import { useStore } from '@/store'
import type { AnthropicArticleMeta } from '@shared/index'

interface Props {
  article: AnthropicArticleMeta
  isNew?: boolean
}

function formatDate(iso: string | null) {
  if (!iso) return '未知日期'
  try {
    return new Date(iso).toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric' })
  } catch {
    return iso
  }
}

export function AnthropicArticleRow({ article, isNew }: Props) {
  const importingUrl = useStore((s) => s.anthropicImportingUrl)
  const importArticle = useStore((s) => s.importAnthropicArticle)
  const cancelImport = useStore((s) => s.cancelAnthropicImport)
  const openReader = useStore((s) => s.openAnthropicReader)

  const isImporting = importingUrl === article.url

  const handleClick = () => {
    if (isImporting) return
    if (article.isSaved && article.filePath) {
      openReader(article.filePath)
      return
    }
    importArticle(article.url)
  }

  return (
    <div
      data-testid="anthropic-article-row"
      className="rounded border border-slate/30 bg-ink/60 p-4 hover:border-ember/50 transition-colors group"
    >
      <button onClick={handleClick} className="w-full text-left" disabled={isImporting}>
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <h3
              data-testid="anthropic-article-title"
              className="text-base font-serif text-parchment group-hover:text-ember transition-colors truncate"
            >
              {article.title}
            </h3>
            <p className="text-xs text-parchment/50 mt-1">{formatDate(article.publishedAt)}</p>
            {article.summary && (
              <p className="text-sm text-parchment/70 mt-2 line-clamp-2">{article.summary}</p>
            )}
          </div>
          <div className="shrink-0 flex flex-col items-end gap-2">
            {isNew && (
              <span className="text-xs px-2 py-0.5 rounded bg-wine/60 text-parchment">新</span>
            )}
            {article.isSaved && (
              <span data-testid="anthropic-article-saved" className="text-xs px-2 py-0.5 rounded bg-ember/20 text-ember">
                已保存
              </span>
            )}
            {!article.isSaved && !isImporting && (
              <span className="text-xs px-2 py-0.5 rounded border border-parchment/20 text-parchment/50">
                未保存
              </span>
            )}
            {isImporting && (
              <span className="text-xs text-parchment/50">导入中…</span>
            )}
          </div>
        </div>
      </button>
      {isImporting && (
        <button
          data-testid="anthropic-article-cancel"
          onClick={cancelImport}
          className="mt-3 text-xs text-ember hover:underline"
        >
          取消导入
        </button>
      )}
    </div>
  )
}
```

> 说明：`AnthropicArticleMeta` 类型当前没有 `filePath`，下一步在类型中增加。

---

### Task 14: 扩展 AnthropicArticleMeta 类型

**Files:**
- Modify: `src/types/index.ts`

- [ ] **Step 1: 增加 `filePath` 可选字段**

```ts
export type AnthropicArticleMeta = {
  url: string
  title: string
  summary: string | null
  publishedAt: string | null
  imageUrl: string | null
  isSaved?: boolean
  filePath?: string
}
```

- [ ] **Step 2: 在 scraper 的 discoverArticles 中回填 filePath**

在 `electron/lib/anthropic-scraper.ts` 的 `articles.map` 中，将 `isSaved: saved.has(link.url)` 改为：

```ts
        isSaved: saved.has(link.url),
        filePath: saved.get(link.url),
```

---

### Task 15: 博客列表面板

**Files:**
- Modify: `src/components/anthropic/AnthropicBlogPanel.tsx`

- [ ] **Step 1: 完整替换文件内容**

```tsx
import { useEffect, useMemo, useState } from 'react'
import { useStore } from '@/store'
import { AnthropicArticleRow } from './AnthropicArticleRow'
import { AnthropicArticleReader } from './AnthropicArticleReader'
import { AnthropicErrorMessage } from './AnthropicErrorMessage'

const ONE_HOUR_MS = 60 * 60 * 1000

export function AnthropicBlogPanel() {
  const cache = useStore((s) => s.anthropicBlogCache)
  const lastSeenAt = useStore((s) => s.anthropicBlogLastSeenAt)
  const readerFilePath = useStore((s) => s.anthropicReaderFilePath)
  const discover = useStore((s) => s.discoverAnthropicArticles)
  const closeReader = useStore((s) => s.closeAnthropicReader)
  const markAsSeen = useStore((s) => s.markAnthropicArticlesAsSeen)

  const [searchQuery, setSearchQuery] = useState('')
  const [listHidden, setListHidden] = useState(false)

  useEffect(() => {
    const last = cache.lastFetchedAt
    const stale = !last || Date.now() - new Date(last).getTime() > ONE_HOUR_MS
    if (stale && !cache.loading && !cache.error) {
      discover()
    }
  }, [cache.lastFetchedAt, cache.loading, cache.error, discover])

  useEffect(() => {
    if (!cache.loading && cache.articles.length > 0 && cache.error === null) {
      const timer = setTimeout(() => {
        markAsSeen()
      }, 5000)
      return () => clearTimeout(timer)
    }
  }, [cache.loading, cache.articles.length, cache.error, markAsSeen])

  const filtered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    if (!q) return cache.articles
    return cache.articles.filter(
      (a) =>
        a.title.toLowerCase().includes(q) ||
        (a.summary?.toLowerCase().includes(q) ?? false)
    )
  }, [cache.articles, searchQuery])

  const hasNew = useMemo(() => {
    if (!lastSeenAt) return false
    return cache.articles.some((a) => a.publishedAt && new Date(a.publishedAt).getTime() > new Date(lastSeenAt).getTime())
  }, [cache.articles, lastSeenAt])

  return (
    <div
      data-testid="anthropic-blog-panel"
      className="relative flex-1 flex min-w-0 bg-ink/60"
    >
      <div
        className={`flex flex-col border-r border-slate/30 transition-all duration-200 ${
          listHidden && readerFilePath ? 'w-0 opacity-0 overflow-hidden' : 'w-5/12 min-w-[280px]'
        }`}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate/30">
          <div>
            <h2 className="text-lg font-serif text-parchment">Anthropic Engineering</h2>
            {cache.lastFetchedAt && (
              <p className="text-xs text-parchment/50">
                上次更新：{new Date(cache.lastFetchedAt).toLocaleString('zh-CN')}
              </p>
            )}
          </div>
          <button
            data-testid="anthropic-refresh-button"
            onClick={() => discover()}
            disabled={cache.loading}
            className="px-3 py-1.5 rounded bg-ember/20 text-parchment hover:bg-ember/30 disabled:opacity-50"
          >
            {cache.loading ? '刷新中...' : '刷新列表'}
          </button>
        </div>

        <div className="px-4 py-3 border-b border-slate/30">
          <input
            data-testid="anthropic-search-input"
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="搜索标题或摘要…"
            className="w-full px-3 py-2 rounded bg-ink/80 border border-slate/30 text-parchment placeholder:text-parchment/40 focus:outline-none focus:border-ember/50"
          />
        </div>

        {hasNew && (
          <div className="px-4 py-2 border-b border-slate/30 flex items-center justify-between">
            <span className="text-xs text-ember">有新文章</span>
            <button
              data-testid="anthropic-mark-seen"
              onClick={markAsSeen}
              className="text-xs text-parchment/70 hover:text-parchment underline"
            >
              全部已读
            </button>
          </div>
        )}

        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
          {cache.loading && cache.articles.length === 0 && (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-20 rounded bg-parchment/10 animate-pulse" />
              ))}
            </div>
          )}

          {cache.error && (
            <AnthropicErrorMessage error={cache.error} onRetry={() => discover()} />
          )}

          {!cache.loading && !cache.error && filtered.length === 0 && (
            <div className="text-center text-parchment/60 py-12">
              {searchQuery ? '没有匹配的文章。' : '暂无文章，点击右上角刷新列表。'}
            </div>
          )}

          {filtered.map((article) => (
            <AnthropicArticleRow
              key={article.url}
              article={article}
              isNew={
                !!(
                  lastSeenAt &&
                  article.publishedAt &&
                  new Date(article.publishedAt).getTime() > new Date(lastSeenAt).getTime()
                )
              }
            />
          ))}
        </div>
      </div>

      {readerFilePath ? (
        <AnthropicArticleReader
          filePath={readerFilePath}
          onClose={closeReader}
          listHidden={listHidden}
          onToggleList={() => setListHidden((v) => !v)}
        />
      ) : (
        <div className="flex-1 flex items-center justify-center text-parchment/50">
          点击左侧文章开始阅读
        </div>
      )}
    </div>
  )
}
```

---

### Task 16: 简报主页面集成

**Files:**
- Modify: `src/pages/Briefing.tsx`

- [ ] **Step 1: 移除弹窗导入与渲染**

删除：
```ts
import { ArticleReaderModal } from '@/components/anthropic/ArticleReaderModal'
```

删除：
```ts
  const readerFilePath = useStore((s) => s.anthropicReaderFilePath)
  const closeAnthropicReader = useStore((s) => s.closeAnthropicReader)
```

删除 JSX 末尾：
```tsx
      {readerFilePath && (
        <ArticleReaderModal filePath={readerFilePath} onClose={closeAnthropicReader} />
      )}
```

- [ ] **Step 2: 类型检查**

Run:
```bash
npx tsc --noEmit
```

Expected: 无新增错误。

---

### Task 17: E2E 选择器

**Files:**
- Modify: `e2e/helpers/selectors.ts`

- [ ] **Step 1: 更新 briefing 对象**

替换 `briefing` 对象中的 Anthropic 相关选择器为：

```ts
  briefing: {
    // ... existing keys above
    anthropicPanel: '[data-testid="anthropic-blog-panel"]',
    anthropicRefreshButton: '[data-testid="anthropic-refresh-button"]',
    anthropicSearchInput: '[data-testid="anthropic-search-input"]',
    anthropicArticleRow: '[data-testid="anthropic-article-row"]',
    anthropicArticleTitle: '[data-testid="anthropic-article-title"]',
    anthropicArticleSaved: '[data-testid="anthropic-article-saved"]',
    anthropicArticleCancel: '[data-testid="anthropic-article-cancel"]',
    anthropicArticleReader: '[data-testid="anthropic-article-reader"]',
    anthropicReaderTitle: '[data-testid="anthropic-reader-title"]',
    anthropicReaderClose: '[data-testid="anthropic-reader-close"]',
    anthropicReaderToggleList: '[data-testid="anthropic-reader-toggle-list"]',
    anthropicReaderFontIncrease: '[data-testid="anthropic-reader-font-increase"]',
    anthropicReaderFontDecrease: '[data-testid="anthropic-reader-font-decrease"]',
    anthropicMarkSeen: '[data-testid="anthropic-mark-seen"]',
  },
```

---

### Task 18: E2E 测试库存根

**Files:**
- Modify: `e2e/helpers/test-library.ts`

- [ ] **Step 1: 扩展 BASE_STATE**

```ts
const BASE_STATE = {
  profile: {
    name: 'E2E 测试员',
    profile_text: '',
    preferred_topics: [],
  },
  lastUsed: {
    difficulty: 'mid',
    temperature: 0.7,
  },
  session_count: 0,
  groups: [],
  activeGroupId: null,
  groupInspirations: {},
  topicContinueSuggestions: {},
  unsavedSessions: [],
  pendingArchives: [],
  archiveResult: null,
  terminology: {},
  briefingSource: 'digest',
  anthropicBlogCache: { lastFetchedAt: null, articles: [] },
  anthropicBlogLastSeenAt: null,
}
```

---

### Task 19: E2E 测试

**Files:**
- Modify: `e2e/specs/anthropic-blog.spec.ts`

- [ ] **Step 1: 完整替换文件**

```ts
import { test, expect } from '../fixtures/electron'
import { CoverPage } from '../pages/CoverPage'
import { SELECTORS } from '../helpers/selectors'
import * as fs from 'node:fs'
import * as path from 'node:path'

function listMdFiles(dir: string): string[] {
  const out: string[] = []
  for (const entry of fs.readdirSync(dir, { withFileTypes: true, recursive: true })) {
    if (entry.isFile() && entry.name.endsWith('.md')) {
      out.push(path.join((entry as any).parentPath || dir, entry.name))
    }
  }
  return out
}

test.describe('Anthropic 博客集成', () => {
  test('E2E-1/2/3/4: 列表发现、首次导入、重复打开、列表隐藏', async ({
    window,
    testLibraryPath,
  }) => {
    const cover = new CoverPage(window)
    await cover.enterIfNeeded()
    await cover.goToBriefing()
    await expect(window.locator(SELECTORS.briefing.page)).toBeVisible()

    await window.locator(SELECTORS.briefing.sourceAnthropicButton).click()
    await window.locator(SELECTORS.briefing.anthropicRefreshButton).click()

    const rows = window.locator(SELECTORS.briefing.anthropicArticleRow)
    await rows.first().waitFor({ timeout: 120000 })
    expect(await rows.count()).toBeGreaterThan(0)

    // 搜索过滤
    const firstTitle = await rows.first().locator(SELECTORS.briefing.anthropicArticleTitle).textContent()
    expect(firstTitle).toBeTruthy()
    await window.locator(SELECTORS.briefing.anthropicSearchInput).fill(firstTitle!)
    await expect(rows).toHaveCount(1)
    await window.locator(SELECTORS.briefing.anthropicSearchInput).fill('')

    // 首次导入并打开阅读器
    const firstRow = rows.first()
    await firstRow.click()
    const reader = window.locator(SELECTORS.briefing.anthropicArticleReader)
    await reader.waitFor({ state: 'visible', timeout: 120000 })
    const readerTitle = await window.locator(SELECTORS.briefing.anthropicReaderTitle).textContent()
    expect(readerTitle).toBeTruthy()

    // 检查本地归档与图片本地化
    const anthropicDir = path.join(testLibraryPath, 'Anthropic博客')
    await expect.poll(() => fs.existsSync(anthropicDir)).toBe(true)
    const files = listMdFiles(anthropicDir)
    expect(files.length).toBeGreaterThan(0)
    const saved = fs.readFileSync(files[0], 'utf8')
    expect(saved).toContain('source_url:')
    expect(saved).toContain('published_at:')
    expect(saved).toContain('imported_at:')

    // 隐藏 / 显示列表
    await window.locator(SELECTORS.briefing.anthropicReaderToggleList).click()
    await expect(window.locator(SELECTORS.briefing.anthropicArticleRow).first()).not.toBeVisible()
    await window.locator(SELECTORS.briefing.anthropicReaderToggleList).click()
    await expect(window.locator(SELECTORS.briefing.anthropicArticleRow).first()).toBeVisible()

    // 字体大小调节
    await window.locator(SELECTORS.briefing.anthropicReaderFontIncrease).click()
    await window.locator(SELECTORS.briefing.anthropicReaderFontDecrease).click()

    // 关闭阅读器
    await window.locator(SELECTORS.briefing.anthropicReaderClose).click()
    await expect(reader).toBeHidden()

    // 已保存文章再次点击直接打开
    const savedRow = window
      .locator(SELECTORS.briefing.anthropicArticleRow)
      .filter({ has: window.locator(SELECTORS.briefing.anthropicArticleSaved) })
      .first()
    await savedRow.click()
    await reader.waitFor({ state: 'visible', timeout: 10000 })
    await window.locator(SELECTORS.briefing.anthropicReaderClose).click()
  })

  test.use({ extraEnv: { E2E_ANTHROPIC_OFFLINE: '1' } })
  test('E2E-5: 离线错误链路', async ({ window }) => {
    const cover = new CoverPage(window)
    await cover.enterIfNeeded()
    await cover.goToBriefing()
    await window.locator(SELECTORS.briefing.sourceAnthropicButton).click()
    await window.locator(SELECTORS.briefing.anthropicRefreshButton).click()
    const panel = window.locator(SELECTORS.briefing.anthropicPanel)
    await expect(panel.locator('text=网络连接失败')).toBeVisible({ timeout: 20000 })
  })
})
```

- [ ] **Step 2: 运行 E2E**

Run:
```bash
npx playwright test --config e2e/playwright.config.ts e2e/specs/anthropic-blog.spec.ts
```

Expected: 两条测试通过。

---

### Task 20: 单元测试

**Files:**
- Modify: `tests/anthropic.test.ts`

- [ ] **Step 1: 完整替换文件**

```ts
import { describe, it, expect, vi } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import https from 'node:https'
import {
  parseDateString,
  firstParagraphToSummary,
  toAbsoluteUrl,
  getImportFolder,
  localizeImages,
} from '../electron/lib/anthropic-scraper'

describe('anthropic helpers', () => {
  it('toAbsoluteUrl converts relative urls', () => {
    expect(toAbsoluteUrl('/engineering/foo')).toBe('https://www.anthropic.com/engineering/foo')
    expect(toAbsoluteUrl('https://example.com')).toBe('https://example.com')
    expect(toAbsoluteUrl('//cdn.example.com/a.png')).toBe('https://cdn.example.com/a.png')
  })

  it('parseDateString parses Apr 23, 2026', () => {
    const result = parseDateString('Apr 23, 2026')
    expect(result).toBeTruthy()
    expect(result!.startsWith('2026-04-23')).toBe(true)
  })

  it('firstParagraphToSummary extracts first non-heading paragraph', () => {
    const md = '# Title\n\nHello world.\n\nSecond paragraph.'
    expect(firstParagraphToSummary(md)).toBe('Hello world.')
  })

  it('firstParagraphToSummary truncates long paragraph', () => {
    const long = 'a'.repeat(300)
    const md = `# Title\n\n${long}\n\nNext.`
    expect(firstParagraphToSummary(md).endsWith('…')).toBe(true)
  })

  it('getImportFolder groups by YYYY-MM', () => {
    expect(getImportFolder('2026-04-23T00:00:00.000Z')).toBe('2026-04')
    expect(getImportFolder('invalid')).toMatch(/^\d{4}-\d{2}$/)
  })
})

describe('localizeImages', () => {
  it('downloads images and rewrites markdown to relative paths', async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sp-anthropic-images-'))
    const assetDir = path.join(tmp, 'article.assets')

    // Mock https.get
    const mockResponse = {
      statusCode: 200,
      pipe: (dest: fs.WriteStream) => {
        dest.write('fake-image-data')
        dest.end()
      },
    }
    const spy = vi.spyOn(https, 'get').mockImplementation((url: any, _opts: any, cb: any) => {
      cb(mockResponse as any)
      return { on: vi.fn(), setTimeout: vi.fn(), destroy: vi.fn() } as any
    })

    const markdown = '![Figure 1](https://cdn.example.com/image.png)'
    const result = await localizeImages(markdown, assetDir)

    expect(result).toContain('./article.assets/image.png')
    expect(fs.existsSync(path.join(assetDir, 'image.png'))).toBe(true)

    spy.mockRestore()
    fs.rmSync(tmp, { recursive: true, force: true })
  })

  it('falls back to original URL on download failure', async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sp-anthropic-images-'))
    const assetDir = path.join(tmp, 'article.assets')

    const spy = vi.spyOn(https, 'get').mockImplementation((_url: any, _opts: any, cb: any) => {
      cb({ statusCode: 404 } as any)
      return { on: vi.fn(), setTimeout: vi.fn(), destroy: vi.fn() } as any
    })

    const markdown = '![Figure 1](https://cdn.example.com/missing.png)'
    const result = await localizeImages(markdown, assetDir)

    expect(result).toBe(markdown)

    spy.mockRestore()
    fs.rmSync(tmp, { recursive: true, force: true })
  })
})
```

- [ ] **Step 2: 运行测试**

Run:
```bash
npx vitest run tests/anthropic.test.ts
```

Expected: 全部通过。

---

### Task 21: 打包验证

**Files:** 无新增/修改

- [ ] **Step 1: 构建生产包**

Run:
```bash
npm run build
```

Expected: `tsc --noEmit` 与 `tsc --noEmit -p tsconfig.node.json` 均通过；electron-vite 构建成功。

- [ ] **Step 2: 打包安装程序**

Run:
```bash
npm run package
```

Expected: 生成 `release/` 目录下的安装包；构建日志无 `playwright` 找不到模块的错误。

- [ ] **Step 3: 验证未打包 Playwright**

检查打包产物（例如 Windows nsis 解压后的 `resources/app.asar`）中不存在 `node_modules/playwright`。

简单检查命令：
```bash
npx asar list release/win-unpacked/resources/app.asar | grep playwright || echo " playwright not bundled (good)"
```

Expected: 输出 `playwright not bundled (good)`。

---

### Task 22: 删除独立 scraper 目录

**Files:**
- Delete: `anthropic-scraper/` 目录

- [ ] **Step 1: 确认主代码库链路稳定**

在 Task 21 打包验证通过后执行。

- [ ] **Step 2: 删除目录**

Run:
```bash
rm -rf anthropic-scraper
```

- [ ] **Step 3: 提交**

```bash
git rm -r anthropic-scraper
git add -A
git commit -m "chore: remove standalone anthropic-scraper after main integration"
```

---

## 自检

### 1. Spec 覆盖度

| Spec 要求 | 实现任务 |
|---|---|
| P0: 生产打包去掉 Playwright 运行时依赖 | Task 1 + Task 4 + Task 21 |
| P0: 统一 IPC `{ ok }` 错误结构 | Task 2 + Task 6 + Task 8 |
| P1: 浏览器复用、取消导入 | Task 4 + Task 6 + Task 8 + Task 13 |
| P1: 图片本地化与本地图片渲染 | Task 5 + Task 9 + Task 12 |
| P1: 自动刷新列表 | Task 15 |
| P2: 分栏阅读器 + 隐藏列表 | Task 12 + Task 15 |
| P2: 搜索/过滤 | Task 15 |
| P2: 新文章标记 | Task 2 + Task 7 + Task 8 + Task 15 |
| P2: 字体大小控制 / ESC 关闭 | Task 12 |
| P3: 外链用系统浏览器打开 | Task 3 + Task 12 |
| P3: 错误码中文映射 | Task 11 |
| 测试 | Task 19 + Task 20 |

### 2. Placeholder 扫描

- 无 "TBD"、"TODO"。
- 所有代码步骤给出完整可运行代码。
- 无 "similar to Task X" 的省略。

### 3. 类型一致性

- IPC 方法名：`anthropicDiscover`、`anthropicImportArticle`、`anthropicCancelImport`、`openExternal`。
- Store 字段：`anthropicBlogLastSeenAt`、`anthropicImportingUrl`、`cancelAnthropicImport`、`markAnthropicArticlesAsSeen`。
- 组件 testid 与 `e2e/helpers/selectors.ts` 一致。
- `AnthropicArticleMeta` 增加 `filePath`，并在 `discoverArticles` 中回填。

---

## 执行选项

**计划已完成并保存到 `docs/superpowers/plans/2026-07-10-anthropic-blog-briefing.md`。**

两个执行方式：

**1. Subagent-Driven（推荐）**
- 每个 Task 派发一个独立子代理，按依赖顺序串行实现。
- 每完成一个 Task 后我进行快速 review，再进入下一个。

**2. Inline Execution**
- 在当前会话里按 Task 顺序直接修改代码，关键节点暂停确认。

**请选择一种方式继续。**
