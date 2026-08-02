# 拾贝（Scout）来源 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 新增第五简报来源「拾贝」（id `scout`）：用户与 Agent 对话（给主题/丢 URL），Agent 搜索→列候选→确认后抓取全文入库，文章阅读体验与 Anthropic 博客源一致（摘要栏+旁注）。

**Architecture:** Agent 循环照搬写作助手模式（` ```tool ` 协议块 + SSE 流式 + 主进程工具分发），工具集为 `web_search / propose_candidates / fetch_and_save / read_article`。抓取走三级管线（Tavily Extract → 裸 fetch+turndown → scraper 窗口）。文章存 `<学习库>/拾贝/文章/YYYY-MM/*.md`（DocType `web-article`），对话存 `<学习库>/拾贝/对话/*.json`。阅读侧复用 `ArticleAssistantPanel`（零改动）+ 泛化 `AnthropicArticleReader` + 抽取通用 `ArticleRow`。

**Tech Stack:** Electron 30 主进程（Node fetch / turndown / gray-matter / undici）、React 18 + Zustand、Vitest、Playwright E2E。

**Spec:** `docs/superpowers/specs/2026-08-02-scout-source-design.md`

**关键约束（从 CLAUDE.md / .claude/rules 继承）：**
- 跨层契约顺序：types → main handler → preload → facade → store → 组件/测试（ipc-state §1）
- 验证只跑受影响测试：`npx vitest run tests/<file>`，禁止全量（general §9）
- 组件文件只导出组件（ui-styling §10）
- mock 分支必须同时满足 `NODE_ENV==='test'` 与 `E2E_CONFIG_DIR`（e2e §1）
- 禁止 test.skip/fixme（e2e §1c）

---

### Task 1: 共享类型 + frontmatter + 扫描排除（跨层契约先行）

**Files:**
- Modify: `src/types/index.ts`（DocType、Frontmatter、briefingSource、Scout 类型、IpcApi）
- Modify: `electron/lib/frontmatter.ts`（EXT_FIELDS、parseFrontmatter）
- Modify: `electron/ipc/files.ts:287`（扫描排除清单）
- Modify: `electron/ipc/state.ts`（DEFAULT 新字段）
- Test: `tests/frontmatter.test.ts`（追加）、`tests/scout-contracts.test.ts`（新建）

- [ ] **Step 1: 写失败测试**

在 `tests/frontmatter.test.ts` 末尾追加：

```ts
describe('web-article frontmatter', () => {
  it('serializes and parses web-article ext fields', () => {
    const raw = serializeFrontmatter('web-article', {
      title: 'The Second Half',
      type: 'web-article',
      created: '2025-04-10T00:00:00.000Z',
      tags: ['拾贝'],
      source_url: 'https://ysymyth.github.io/The-Second-Half/',
      source_name: 'ysymyth.github.io',
      published_at: '2025-04-10T00:00:00.000Z',
      imported_at: '2026-08-02T00:00:00.000Z',
      authors: ['Shunyu Yao'],
      summary: 'AI 进入下半场',
    }, '# The Second Half\n\n正文')
    const { frontmatter, body } = parseFrontmatter(raw, { filename: 'The Second Half.md' })
    expect(frontmatter.type).toBe('web-article')
    expect(frontmatter.source_url).toBe('https://ysymyth.github.io/The-Second-Half/')
    expect(frontmatter.source_name).toBe('ysymyth.github.io')
    expect(frontmatter.authors).toEqual(['Shunyu Yao'])
    expect(frontmatter.summary).toBe('AI 进入下半场')
    expect(body).toContain('正文')
  })
})
```

新建 `tests/scout-contracts.test.ts`：

```ts
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

// 契约测试：拾贝文件夹必须被 files:scan 排除（点亮灯火/推荐逻辑不可见）
describe('scout contracts', () => {
  it('files:scan excludes 拾贝 directory', () => {
    const src = fs.readFileSync(path.join(__dirname, '..', 'electron', 'ipc', 'files.ts'), 'utf8')
    const m = src.match(/\[(['\w\u4e00-\u9fff,\s]*'拾贝'[\w\u4e00-9fff',\s]*)\]\.includes\(td\)/)
    expect(m, 'files.ts exclusion list must include 拾贝').toBeTruthy()
  })

  it('state DEFAULT includes scout fields', () => {
    const src = fs.readFileSync(path.join(__dirname, '..', 'electron', 'ipc', 'state.ts'), 'utf8')
    expect(src).toContain("scoutTab: 'chat'")
    expect(src).toContain('scoutActiveConversationId: null')
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run tests/frontmatter.test.ts tests/scout-contracts.test.ts`
Expected: FAIL（`web-article` 不是有效 DocType；排除清单无拾贝；state 无 scout 字段）

- [ ] **Step 3: 实现类型改动**

`src/types/index.ts`：

1. `DocType` 联合类型加 `'web-article'`（找到 DocType 定义，在 `'anthropic-article'` 后加）。
2. `Frontmatter` 类型加字段：`source_name?: string`（放在 `source_url?: string` 后面）。
3. `briefingSource` 两处（store 接口约 482 行 `briefingSource?: 'digest' | 'anthropic' | 'job-briefing' | 'writing'`）加 `| 'scout'`。
4. 文件末尾追加拾贝类型：

```ts
// --- 拾贝（Scout）来源 ---
export type ScoutErrorCode =
  | 'NETWORK_ERROR'
  | 'TAVILY_ERROR'
  | 'FETCH_BLOCKED'
  | 'NO_CONTENT'
  | 'LLM_ERROR'

export type ScoutCandidate = {
  title: string
  url: string
  sourceName: string
  reason: string
  fetchable?: boolean      // 预检结果；undefined = 未检
  failReason?: string
}

export type ScoutMessage = {
  role: 'user' | 'assistant'
  content: string
  candidates?: ScoutCandidate[]   // assistant 消息附带的候选卡片
  candidatesResolved?: boolean
}

export type ScoutConversationMeta = {
  id: string
  title: string
  createdAt: string
  updatedAt: string
  filePath: string
}

export type ScoutConversation = ScoutConversationMeta & {
  messages: ScoutMessage[]
}

export type ScoutArticleMeta = {
  url: string
  title: string
  summary: string | null
  publishedAt: string | null
  sourceName: string | null
  filePath: string
}

export type ScoutToolEvent =
  | { conversationId: string; phase: 'start' | 'done'; tool: 'web_search'; query: string }
  | { conversationId: string; phase: 'candidates'; candidates: ScoutCandidate[] }
  | { conversationId: string; phase: 'start' | 'done'; tool: 'fetch_and_save'; urls: string[]; savedTitles?: string[] }
  | { conversationId: string; phase: 'start' | 'done'; tool: 'read_article'; url: string }
```

5. `IpcApi` 接口追加（对照现有 `anthropicDiscover` 等成员的位置）：

```ts
  scoutSendMessage: (a: { conversationId: string; messages: ScoutMessage[] }) => Promise<void>
  scoutAbort: (a: { conversationId: string }) => Promise<void>
  scoutListConversations: () => Promise<ScoutConversationMeta[]>
  scoutCreateConversation: () => Promise<ScoutConversation>
  scoutGetConversation: (a: { id: string }) => Promise<ScoutConversation | null>
  scoutRenameConversation: (a: { id: string; title: string }) => Promise<{ ok: true } | { ok: false; message: string }>
  scoutDeleteConversation: (a: { id: string }) => Promise<{ ok: true } | { ok: false; message: string }>
  scoutListArticles: () => Promise<ScoutArticleMeta[]>
  scoutDeleteArticle: (a: { filePath: string }) => Promise<{ ok: true } | { ok: false; message: string }>
  onScoutTool: (cb: (e: ScoutToolEvent) => void) => () => void
```

6. `StateJson`（同文件，`writingListTab` 附近）加：

```ts
  scoutTab?: 'chat' | 'articles'
  scoutActiveConversationId?: string | null
```

`electron/lib/frontmatter.ts`：

```ts
// EXT_FIELDS 加一行（'anthropic-article' 之后）：
  'web-article': ['source_url', 'source_name', 'published_at', 'imported_at', 'authors', 'summary'],
```

```ts
// parseFrontmatter 的 frontmatter 对象加一行（source_url 行之后）：
    source_name: typeof data.source_name === 'string' ? data.source_name : undefined,
// parent_type 联合（第 77 行）加 'web-article'：
    parent_type: data.parent_type === 'briefing' || data.parent_type === 'anthropic-article' || data.parent_type === 'job-briefing' || data.parent_type === 'web-article' ? data.parent_type : undefined,
```

`electron/ipc/files.ts:287`：

```ts
      if (['writing', 'repository', '夜航简报', '求职简报', 'Anthropic博客', '拾贝'].includes(td)) continue
```

`electron/ipc/state.ts` DEFAULT：

```ts
  scoutTab: 'chat',
  scoutActiveConversationId: null,
```

`src/components/article-assistant/ArticleAssistantPanel.tsx` props 第 8 行：

```ts
  articleType: 'briefing' | 'anthropic-article' | 'web-article'
```

（若 `src/types/index.ts` 或其他文件也有 `'briefing' | 'anthropic-article'` 联合，用 `grep -rn "'anthropic-article'" src electron --include=*.ts*` 找出全部含 `parent_type`/`articleType` 联合的位置同步加 `'web-article'`；以 `npx tsc --noEmit` 通过为准。）

- [ ] **Step 4: 跑测试确认通过**

Run: `npx vitest run tests/frontmatter.test.ts tests/scout-contracts.test.ts`
Expected: PASS；再跑 `npx tsc --noEmit` 确认无类型错误

- [ ] **Step 5: Commit**

```bash
git add src/types/index.ts electron/lib/frontmatter.ts electron/ipc/files.ts electron/ipc/state.ts src/components/article-assistant/ArticleAssistantPanel.tsx tests/frontmatter.test.ts tests/scout-contracts.test.ts
git commit -m "feat: add web-article doctype and scout shared types"
```

---

### Task 2: 三级抓取管线 article-fetcher

**Files:**
- Create: `electron/lib/scout/article-fetcher.ts`
- Test: `tests/scout-fetcher.test.ts`

- [ ] **Step 1: 写失败测试**

`tests/scout-fetcher.test.ts`：

```ts
import { describe, it, expect } from 'vitest'
import { fetchArticle, type FetchDeps } from '../electron/lib/scout/article-fetcher'

const LONG_MD = '# Title\n\n' + '正文内容。'.repeat(200) // >500 字

function deps(overrides: Partial<FetchDeps>): FetchDeps {
  return {
    tavilyExtract: async () => { throw Object.assign(new Error('no key'), { code: 'TAVILY_ERROR' }) },
    plainFetch: async () => { throw new Error('fetch failed') },
    scraperFetch: async () => { throw new Error('scraper disabled in test') },
    ...overrides,
  }
}

describe('fetchArticle 三级管线', () => {
  it('tier-1 tavily 成功直接返回，不调用后续', async () => {
    let tier2Called = false
    const r = await fetchArticle({
      url: 'https://a.com/x',
      deps: deps({
        tavilyExtract: async () => LONG_MD,
        plainFetch: async () => { tier2Called = true; return LONG_MD },
      }),
    })
    expect(r.tier).toBe(1)
    expect(r.markdown).toBe(LONG_MD)
    expect(tier2Called).toBe(false)
  })

  it('tier-1 失败回退 tier-2 裸 fetch', async () => {
    const r = await fetchArticle({
      url: 'https://blog.example/post',
      deps: deps({ plainFetch: async () => LONG_MD }),
    })
    expect(r.tier).toBe(2)
  })

  it('tier-1/2 均失败回退 tier-3 scraper 窗口', async () => {
    const r = await fetchArticle({
      url: 'https://spa.example/post',
      deps: deps({ scraperFetch: async () => ({ markdown: LONG_MD, title: 'SPA 标题', publishedAt: null, authors: [] }) }),
    })
    expect(r.tier).toBe(3)
    expect(r.title).toBe('SPA 标题')
  })

  it('三级全失败：403 → FETCH_BLOCKED', async () => {
    const err403 = () => { throw Object.assign(new Error('HTTP 403'), { httpStatus: 403 }) }
    await expect(fetchArticle({
      url: 'https://blocked.example/',
      deps: deps({ tavilyExtract: err403, plainFetch: err403, scraperFetch: err403 }),
    })).rejects.toMatchObject({ code: 'FETCH_BLOCKED' })
  })

  it('三级全失败：内容为空 → NO_CONTENT', async () => {
    await expect(fetchArticle({
      url: 'https://empty.example/',
      deps: deps({
        tavilyExtract: async () => '太短',
        plainFetch: async () => '也太短',
        scraperFetch: async () => ({ markdown: '', title: '', publishedAt: null, authors: [] }),
      }),
    })).rejects.toMatchObject({ code: 'NO_CONTENT' })
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run tests/scout-fetcher.test.ts`
Expected: FAIL（模块不存在）

- [ ] **Step 3: 实现 article-fetcher.ts**

`electron/lib/scout/article-fetcher.ts`：

```ts
import TurndownService from 'turndown'
import { runScriptInScraperWindow } from '../anthropic-browser'

const MIN_CONTENT_LENGTH = 500
const TAVILY_EXTRACT_URL = 'https://api.tavily.com/extract'
const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36'

export type FetchedArticle = {
  url: string
  title: string
  markdown: string
  summary: string
  publishedAt: string | null
  authors: string[]
  tier: 1 | 2 | 3
}

export type ScraperResult = {
  markdown: string
  title: string
  publishedAt: string | null
  authors: string[]
}

export type FetchDeps = {
  tavilyExtract: (url: string, signal?: AbortSignal) => Promise<string>
  plainFetch: (url: string, signal?: AbortSignal) => Promise<string>
  scraperFetch: (url: string) => Promise<ScraperResult>
}

function codedError(code: string, message: string): Error & { code: string } {
  return Object.assign(new Error(message), { code })
}

function firstParagraph(markdown: string, maxLength = 280): string {
  const first = markdown.split('\n\n').map(b => b.trim()).find(b => b.length > 0 && !b.startsWith('#'))
  if (!first) return ''
  const text = first.replace(/\n/g, ' ').replace(/\s+/g, ' ').trim()
  return text.length <= maxLength ? text : `${text.slice(0, maxLength - 1)}…`
}

const turndown = new TurndownService({ headingStyle: 'atx', codeBlockStyle: 'fenced' })

// --- tier-1: Tavily Extract ---
async function defaultTavilyExtract(url: string, signal?: AbortSignal): Promise<string> {
  const apiKey = process.env.TAVILY_API_KEY
  if (!apiKey) throw codedError('TAVILY_ERROR', 'missing TAVILY_API_KEY')
  const res = await fetch(TAVILY_EXTRACT_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    signal,
    body: JSON.stringify({ api_key: apiKey, urls: [url] }),
  })
  if (!res.ok) {
    const code = res.status === 403 ? 'FETCH_BLOCKED' : 'TAVILY_ERROR'
    throw Object.assign(codedError(code, `tavily extract HTTP ${res.status}`), { httpStatus: res.status })
  }
  const data = await res.json() as { results?: { raw_content?: string }[] }
  const content = data.results?.[0]?.raw_content ?? ''
  if (content.length < MIN_CONTENT_LENGTH) throw codedError('NO_CONTENT', 'tavily extract empty')
  return content
}

// --- tier-2: 裸 fetch + turndown ---
async function defaultPlainFetch(url: string, signal?: AbortSignal): Promise<string> {
  let res: Response
  try {
    res = await fetch(url, { headers: { 'User-Agent': USER_AGENT }, signal, redirect: 'follow' })
  } catch (err: any) {
    throw codedError('NETWORK_ERROR', err?.message || 'fetch failed')
  }
  if (!res.ok) {
    const code = res.status === 403 || res.status === 401 ? 'FETCH_BLOCKED' : 'NETWORK_ERROR'
    throw Object.assign(codedError(code, `HTTP ${res.status}`), { httpStatus: res.status })
  }
  const html = await res.text()
  const m = html.match(/<article[\s\S]*?<\/article>/i) || html.match(/<main[\s\S]*?<\/main>/i)
  const fragment = m ? m[0] : html
  const cleaned = fragment
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<(nav|header|footer|aside)[\s\S]*?<\/\1>/gi, '')
  const markdown = turndown.turndown(cleaned).trim()
  if (markdown.length < MIN_CONTENT_LENGTH) throw codedError('NO_CONTENT', 'plain fetch content too short')
  return markdown
}

// --- tier-3: scraper 窗口（复用 anthropic-browser 基建） ---
const GENERIC_ARTICLE_SCRIPT = `(() => {
  const data = { title: '', publishedAt: null, authors: [], contentHtml: '' }
  data.title = document.querySelector('h1')?.textContent?.trim()
    || document.querySelector('title')?.textContent?.trim() || ''
  const timeEl = document.querySelector('time[datetime]')
  if (timeEl) data.publishedAt = timeEl.getAttribute('datetime')
  if (!data.publishedAt) {
    data.publishedAt = document.querySelector('meta[property="article:published_time"]')?.getAttribute('content') || null
  }
  const authorMeta = document.querySelector('meta[name="author"]')?.getAttribute('content')
  if (authorMeta) data.authors.push(authorMeta)
  const selectors = ['article', 'main article', '[data-testid="article-body"]', '.prose', '.article-content', 'main']
  let contentEl = null
  for (const sel of selectors) { contentEl = document.querySelector(sel); if (contentEl) break }
  if (contentEl) {
    const clone = contentEl.cloneNode(true)
    clone.querySelectorAll('nav, header, footer, aside, script, style, form').forEach((el) => el.remove())
    data.contentHtml = clone.innerHTML.trim()
  }
  return data
})()`

async function defaultScraperFetch(url: string): Promise<ScraperResult> {
  const result = await runScriptInScraperWindow<{
    title: string; publishedAt: string | null; authors: string[]; contentHtml: string
  }>(GENERIC_ARTICLE_SCRIPT, { url, waitForSelector: 'main, article, [role="main"]', timeoutMs: 60000 })
  const markdown = result.contentHtml ? turndown.turndown(result.contentHtml).trim() : ''
  return { markdown, title: result.title, publishedAt: result.publishedAt, authors: result.authors }
}

function titleFromMarkdown(markdown: string, url: string): string {
  const h1 = markdown.match(/^#\s+(.+)$/m)
  if (h1) return h1[1].trim()
  try { return new URL(url).hostname } catch { return 'untitled' }
}

function isBlocked(err: any): boolean {
  return err?.code === 'FETCH_BLOCKED' || err?.httpStatus === 403 || err?.httpStatus === 401
}

export async function fetchArticle(opts: {
  url: string
  signal?: AbortSignal
  deps?: FetchDeps
}): Promise<FetchedArticle> {
  const d = opts.deps ?? {
    tavilyExtract: defaultTavilyExtract,
    plainFetch: defaultPlainFetch,
    scraperFetch: defaultScraperFetch,
  }
  const errors: any[] = []

  // tier-1
  try {
    const markdown = await d.tavilyExtract(opts.url, opts.signal)
    return {
      url: opts.url, title: titleFromMarkdown(markdown, opts.url), markdown,
      summary: firstParagraph(markdown), publishedAt: null, authors: [], tier: 1,
    }
  } catch (err) { errors.push(err) }

  // tier-2
  try {
    const markdown = await d.plainFetch(opts.url, opts.signal)
    return {
      url: opts.url, title: titleFromMarkdown(markdown, opts.url), markdown,
      summary: firstParagraph(markdown), publishedAt: null, authors: [], tier: 2,
    }
  } catch (err) { errors.push(err) }

  // tier-3
  try {
    const r = await d.scraperFetch(opts.url)
    if (r.markdown.length < MIN_CONTENT_LENGTH) throw codedError('NO_CONTENT', 'scraper content too short')
    return {
      url: opts.url, title: r.title || titleFromMarkdown(r.markdown, opts.url), markdown: r.markdown,
      summary: firstParagraph(r.markdown), publishedAt: r.publishedAt, authors: r.authors, tier: 3,
    }
  } catch (err) { errors.push(err) }

  // 全部失败：任何一层是被拒（403）→ FETCH_BLOCKED，否则 NO_CONTENT
  if (errors.some(isBlocked)) throw codedError('FETCH_BLOCKED', `无法抓取 ${opts.url}（站点拒绝访问）`)
  const noContent = errors.some(e => e?.code === 'NO_CONTENT')
  throw codedError(noContent ? 'NO_CONTENT' : 'NETWORK_ERROR', `无法抓取 ${opts.url}`)
}
```

注意：`defaultTavilyExtract` 读的 API key 应走 credentials 而非裸 env——但 article-fetcher 保持纯函数风格，key 由调用方（tools.ts）注入：把 `defaultTavilyExtract` 改为工厂 `makeTavilyExtract(apiKey: string)`，deps 默认在 tools.ts 组装。修正导出：

```ts
export function makeTavilyExtract(apiKey: string) {
  return async (url: string, signal?: AbortSignal): Promise<string> => {
    const res = await fetch(TAVILY_EXTRACT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal,
      body: JSON.stringify({ api_key: apiKey, urls: [url] }),
    })
    if (!res.ok) {
      const code = res.status === 403 ? 'FETCH_BLOCKED' : 'TAVILY_ERROR'
      throw Object.assign(codedError(code, `tavily extract HTTP ${res.status}`), { httpStatus: res.status })
    }
    const data = await res.json() as { results?: { raw_content?: string }[] }
    const content = data.results?.[0]?.raw_content ?? ''
    if (content.length < MIN_CONTENT_LENGTH) throw codedError('NO_CONTENT', 'tavily extract empty')
    return content
  }
}
```

并删掉 `defaultTavilyExtract`，`fetchArticle` 无 deps 时 tier-1 用 `makeTavilyExtract(process.env.TAVILY_API_KEY ?? '')`（tools.ts 总是显式传 deps，此为兜底）。

- [ ] **Step 4: 跑测试确认通过**

Run: `npx vitest run tests/scout-fetcher.test.ts`
Expected: PASS（5 个用例）

- [ ] **Step 5: Commit**

```bash
git add electron/lib/scout/article-fetcher.ts tests/scout-fetcher.test.ts
git commit -m "feat: add scout three-tier article fetcher"
```

---

### Task 3: 文章落库 article-store

**Files:**
- Create: `electron/lib/scout/article-store.ts`
- Test: `tests/scout-article-store.test.ts`

- [ ] **Step 1: 写失败测试**

`tests/scout-article-store.test.ts`：

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { saveArticle, listArticles, deleteArticle, findSavedByUrl, SCOUT_DIR } from '../electron/lib/scout/article-store'
import type { FetchedArticle } from '../electron/lib/scout/article-fetcher'

let root: string
beforeEach(() => { root = fs.mkdtempSync(path.join(os.tmpdir(), 'scout-test-')) })
afterEach(() => { fs.rmSync(root, { recursive: true, force: true }) })

function fetched(overrides: Partial<FetchedArticle> = {}): FetchedArticle {
  return {
    url: 'https://a.com/x', title: '测试文章', markdown: '# 测试文章\n\n正文',
    summary: '摘要', publishedAt: '2026-08-01T00:00:00.000Z', authors: ['作者'], tier: 1,
    ...overrides,
  }
}

describe('scout article-store', () => {
  it('saveArticle 写入 拾贝/文章/YYYY-MM/ 并带完整 frontmatter', () => {
    const r = saveArticle(root, fetched())
    expect(r.filePath).toContain(SCOUT_DIR)
    expect(r.filePath).toContain(path.join('文章', '2026-08'))
    const raw = fs.readFileSync(r.filePath, 'utf8')
    expect(raw).toContain("type: 'web-article'".replace(/'/g, '') === '' ? '' : 'web-article')
    expect(raw).toContain('https://a.com/x')
    expect(raw).toContain('正文')
  })

  it('同 source_url 重复保存 → wasAlreadySaved，不产生新文件', () => {
    const a = saveArticle(root, fetched())
    const b = saveArticle(root, fetched())
    expect(b.wasAlreadySaved).toBe(true)
    expect(b.filePath).toBe(a.filePath)
  })

  it('同名不同 URL → 序号后缀', () => {
    const a = saveArticle(root, fetched())
    const b = saveArticle(root, fetched({ url: 'https://b.com/y' }))
    expect(b.wasAlreadySaved).toBe(false)
    expect(b.filePath).not.toBe(a.filePath)
    expect(fs.existsSync(a.filePath)).toBe(true)
    expect(fs.existsSync(b.filePath)).toBe(true)
  })

  it('listArticles 返回已存文章元数据；findSavedByUrl 命中', () => {
    saveArticle(root, fetched())
    const list = listArticles(root)
    expect(list).toHaveLength(1)
    expect(list[0].url).toBe('https://a.com/x')
    expect(list[0].title).toBe('测试文章')
    expect(findSavedByUrl(root).get('https://a.com/x')).toBe(list[0].filePath)
  })

  it('deleteArticle 删除文件并拒绝库外路径', () => {
    const r = saveArticle(root, fetched())
    expect(deleteArticle(root, r.filePath)).toEqual({ ok: true })
    expect(fs.existsSync(r.filePath)).toBe(false)
    expect(deleteArticle(root, 'C:/Windows/evil.md').ok).toBe(false)
  })

  it('listArticles 容错：损坏文件跳过不抛', () => {
    const dir = path.join(root, SCOUT_DIR, '文章', '2026-08')
    fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(path.join(dir, 'bad.md'), '---\n: broken yaml: [', 'utf8')
    expect(() => listArticles(root)).not.toThrow()
    expect(listArticles(root)).toHaveLength(0)
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run tests/scout-article-store.test.ts`
Expected: FAIL（模块不存在）

- [ ] **Step 3: 实现 article-store.ts**

`electron/lib/scout/article-store.ts`：

```ts
import fs from 'node:fs'
import path from 'node:path'
import { parseFrontmatter, serializeFrontmatter } from '../frontmatter'
import { deleteSiblingFiles } from '../sibling-files'
import type { FetchedArticle } from './article-fetcher'
import type { ScoutArticleMeta } from '@shared/index'

export const SCOUT_DIR = '拾贝'
const ARTICLES_SUBDIR = '文章'

export function safeFileName(title: string): string {
  return title.replace(/[\\/:*?"<>|]/g, '_').replace(/\s+/g, ' ').trim().slice(0, 120)
}

function monthFolder(iso: string | null): string {
  const d = iso ? new Date(iso) : new Date()
  const t = Number.isNaN(d.getTime()) ? new Date() : d
  return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}`
}

function walkMdFiles(dir: string, cb: (filePath: string) => void) {
  if (!fs.existsSync(dir)) return
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) walkMdFiles(full, cb)
    else if (entry.isFile() && entry.name.endsWith('.md')) cb(full)
  }
}

export function findSavedByUrl(libraryRoot: string): Map<string, string> {
  const map = new Map<string, string>()
  walkMdFiles(path.join(libraryRoot, SCOUT_DIR, ARTICLES_SUBDIR), (filePath) => {
    try {
      const raw = fs.readFileSync(filePath, 'utf8')
      const { frontmatter } = parseFrontmatter(raw, { filename: path.basename(filePath) })
      if (frontmatter.source_url) map.set(frontmatter.source_url, filePath)
    } catch { /* 跳过损坏文件 */ }
  })
  return map
}

export function saveArticle(
  libraryRoot: string,
  fetched: FetchedArticle
): { filePath: string; wasAlreadySaved: boolean } {
  const saved = findSavedByUrl(libraryRoot)
  const existing = saved.get(fetched.url)
  if (existing && fs.existsSync(existing)) return { filePath: existing, wasAlreadySaved: true }

  const dir = path.join(libraryRoot, SCOUT_DIR, ARTICLES_SUBDIR, monthFolder(fetched.publishedAt))
  fs.mkdirSync(dir, { recursive: true })

  const base = safeFileName(fetched.title) || 'untitled'
  let filePath = path.join(dir, `${base}.md`)
  let counter = 2
  while (fs.existsSync(filePath)) {
    filePath = path.join(dir, `${base}-${counter}.md`)
    counter++
  }

  let sourceName: string | undefined
  try { sourceName = new URL(fetched.url).hostname } catch { /* ignore */ }

  const raw = serializeFrontmatter('web-article', {
    title: fetched.title,
    type: 'web-article',
    created: fetched.publishedAt ?? new Date().toISOString(),
    tags: ['拾贝'],
    source_url: fetched.url,
    source_name: sourceName,
    published_at: fetched.publishedAt ?? undefined,
    imported_at: new Date().toISOString(),
    authors: fetched.authors.length > 0 ? fetched.authors : undefined,
    summary: fetched.summary || undefined,
    description: fetched.summary || undefined,
  }, fetched.markdown)

  fs.writeFileSync(filePath, raw, 'utf8')
  return { filePath, wasAlreadySaved: false }
}

export function listArticles(libraryRoot: string): ScoutArticleMeta[] {
  const articles: ScoutArticleMeta[] = []
  walkMdFiles(path.join(libraryRoot, SCOUT_DIR, ARTICLES_SUBDIR), (filePath) => {
    try {
      const raw = fs.readFileSync(filePath, 'utf8')
      const { frontmatter } = parseFrontmatter(raw, { filename: path.basename(filePath) })
      if (!frontmatter.source_url) return
      articles.push({
        url: frontmatter.source_url,
        title: frontmatter.title,
        summary: frontmatter.summary ?? null,
        publishedAt: frontmatter.published_at ?? null,
        sourceName: frontmatter.source_name ?? null,
        filePath,
      })
    } catch { /* 跳过损坏文件 */ }
  })
  // 新文章在前
  articles.sort((a, b) => (b.publishedAt ?? '').localeCompare(a.publishedAt ?? ''))
  return articles
}

export function deleteArticle(
  libraryRoot: string,
  filePath: string
): { ok: true } | { ok: false; message: string } {
  const dir = path.resolve(libraryRoot, SCOUT_DIR, ARTICLES_SUBDIR)
  const abs = path.resolve(filePath)
  if (!abs.startsWith(dir + path.sep) || !fs.existsSync(abs)) {
    return { ok: false, message: '文件不存在或路径非法' }
  }
  try {
    fs.rmSync(abs)
    deleteSiblingFiles(abs) // 同时删旁注对话/标注/导读（与 Anthropic 删除语义一致）
    return { ok: true }
  } catch (err: any) {
    return { ok: false, message: err?.message || String(err) }
  }
}
```

（先确认 `electron/lib/sibling-files.ts` 存在且导出 `deleteSiblingFiles`——anthropic-delete.ts 第 4 行已引用，直接复用。）

- [ ] **Step 4: 跑测试确认通过**

Run: `npx vitest run tests/scout-article-store.test.ts`
Expected: PASS（6 个用例）

- [ ] **Step 5: Commit**

```bash
git add electron/lib/scout/article-store.ts tests/scout-article-store.test.ts
git commit -m "feat: add scout article store (save/list/delete/dedup)"
```

---

### Task 4: 对话存档 conversation-store

**Files:**
- Create: `electron/lib/scout/conversation-store.ts`
- Test: `tests/scout-conversation-store.test.ts`

- [ ] **Step 1: 写失败测试**

`tests/scout-conversation-store.test.ts`：

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {
  listConversations, createConversation, getConversation, saveConversation,
  renameConversation, deleteConversation,
} from '../electron/lib/scout/conversation-store'

let root: string
beforeEach(() => { root = fs.mkdtempSync(path.join(os.tmpdir(), 'scout-conv-')) })
afterEach(() => { fs.rmSync(root, { recursive: true, force: true }) })

describe('scout conversation-store', () => {
  it('createConversation 生成 JSON，默认名为创建日期时间', () => {
    const c = createConversation(root)
    expect(c.messages).toEqual([])
    expect(c.title).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/)
    expect(fs.existsSync(c.filePath)).toBe(true)
    expect(c.filePath).toContain(path.join('拾贝', '对话'))
  })

  it('saveConversation 更新消息与 updatedAt；getConversation 还原候选状态', () => {
    const c = createConversation(root)
    c.messages = [
      { role: 'user', content: '找文章' },
      { role: 'assistant', content: '候选如下', candidates: [{ title: 'A', url: 'https://a.com', sourceName: 'a.com', reason: '好', fetchable: true }], candidatesResolved: false },
    ]
    saveConversation(root, c)
    const loaded = getConversation(root, c.id)
    expect(loaded?.messages).toHaveLength(2)
    expect(loaded?.messages[1].candidates?.[0].fetchable).toBe(true)
    expect(loaded!.updatedAt >= c.createdAt).toBe(true)
  })

  it('listConversations 按 updatedAt 倒序，只含 meta', () => {
    const a = createConversation(root)
    const b = createConversation(root)
    saveConversation(root, { ...a, messages: [{ role: 'user', content: 'x' }] })
    const list = listConversations(root)
    expect(list).toHaveLength(2)
    expect(list[0].id).toBe(a.id) // a 刚保存过，最新
    expect((list[0] as any).messages).toBeUndefined()
    expect(list.map(x => x.id).sort()).toEqual([a.id, b.id].sort())
  })

  it('renameConversation 改名不动文件名', () => {
    const c = createConversation(root)
    const r = renameConversation(root, c.id, 'Agent 架构研究')
    expect(r).toEqual({ ok: true })
    const loaded = getConversation(root, c.id)
    expect(loaded?.title).toBe('Agent 架构研究')
    expect(loaded?.filePath).toBe(c.filePath)
  })

  it('deleteConversation 删文件；不存在返回错误', () => {
    const c = createConversation(root)
    expect(deleteConversation(root, c.id)).toEqual({ ok: true })
    expect(fs.existsSync(c.filePath)).toBe(false)
    expect(deleteConversation(root, c.id).ok).toBe(false)
  })

  it('损坏 JSON 容错：list 跳过，get 返回 null', () => {
    const dir = path.join(root, '拾贝', '对话')
    fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(path.join(dir, '20990101-0000-bad0.json'), '{broken', 'utf8')
    expect(listConversations(root)).toHaveLength(0)
    expect(getConversation(root, '20990101-0000-bad0')).toBeNull()
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run tests/scout-conversation-store.test.ts`
Expected: FAIL（模块不存在）

- [ ] **Step 3: 实现 conversation-store.ts**

`electron/lib/scout/conversation-store.ts`：

```ts
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import type { ScoutConversation, ScoutConversationMeta } from '@shared/index'
import { SCOUT_DIR } from './article-store'

const CONVERSATIONS_SUBDIR = '对话'

function conversationsDir(libraryRoot: string): string {
  return path.join(libraryRoot, SCOUT_DIR, CONVERSATIONS_SUBDIR)
}

function filePathFor(libraryRoot: string, id: string): string {
  // id 只允许安全字符，防路径穿越
  const safe = id.replace(/[^\w-]/g, '')
  return path.join(conversationsDir(libraryRoot), `${safe}.json`)
}

function defaultTitle(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}

function makeId(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}-${crypto.randomBytes(2).toString('hex')}`
}

type ConversationFile = {
  id: string
  title: string
  createdAt: string
  updatedAt: string
  messages: ScoutConversation['messages']
}

function readFile(filePath: string): ConversationFile | null {
  try {
    const data = JSON.parse(fs.readFileSync(filePath, 'utf8')) as ConversationFile
    if (typeof data.id !== 'string' || !Array.isArray(data.messages)) return null
    return {
      id: data.id,
      title: typeof data.title === 'string' ? data.title : data.id,
      createdAt: typeof data.createdAt === 'string' ? data.createdAt : new Date().toISOString(),
      updatedAt: typeof data.updatedAt === 'string' ? data.updatedAt : data.createdAt,
      messages: data.messages,
    }
  } catch {
    return null
  }
}

export function createConversation(libraryRoot: string): ScoutConversation {
  const now = new Date()
  const id = makeId(now)
  fs.mkdirSync(conversationsDir(libraryRoot), { recursive: true })
  const conv: ScoutConversation = {
    id,
    title: defaultTitle(now),
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
    filePath: filePathFor(libraryRoot, id),
    messages: [],
  }
  fs.writeFileSync(conv.filePath, JSON.stringify(conv, null, 2), 'utf8')
  return conv
}

export function getConversation(libraryRoot: string, id: string): ScoutConversation | null {
  const filePath = filePathFor(libraryRoot, id)
  const data = readFile(filePath)
  if (!data) return null
  return { ...data, filePath }
}

export function saveConversation(libraryRoot: string, conv: ScoutConversation): void {
  const updated: ConversationFile = {
    id: conv.id,
    title: conv.title,
    createdAt: conv.createdAt,
    updatedAt: new Date().toISOString(),
    messages: conv.messages,
  }
  fs.mkdirSync(conversationsDir(libraryRoot), { recursive: true })
  fs.writeFileSync(filePathFor(libraryRoot, conv.id), JSON.stringify(updated, null, 2), 'utf8')
}

export function listConversations(libraryRoot: string): ScoutConversationMeta[] {
  const dir = conversationsDir(libraryRoot)
  if (!fs.existsSync(dir)) return []
  const list: ScoutConversationMeta[] = []
  for (const entry of fs.readdirSync(dir)) {
    if (!entry.endsWith('.json')) continue
    const filePath = path.join(dir, entry)
    const data = readFile(filePath)
    if (!data) continue
    list.push({
      id: data.id,
      title: data.title,
      createdAt: data.createdAt,
      updatedAt: data.updatedAt,
      filePath,
    })
  }
  list.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
  return list
}

export function renameConversation(
  libraryRoot: string,
  id: string,
  title: string
): { ok: true } | { ok: false; message: string } {
  const conv = getConversation(libraryRoot, id)
  if (!conv) return { ok: false, message: '对话不存在' }
  const trimmed = title.trim()
  if (!trimmed) return { ok: false, message: '名称不能为空' }
  saveConversation(libraryRoot, { ...conv, title: trimmed.slice(0, 60) })
  return { ok: true }
}

export function deleteConversation(
  libraryRoot: string,
  id: string
): { ok: true } | { ok: false; message: string } {
  const filePath = filePathFor(libraryRoot, id)
  if (!fs.existsSync(filePath)) return { ok: false, message: '对话不存在' }
  try {
    fs.rmSync(filePath)
    return { ok: true }
  } catch (err: any) {
    return { ok: false, message: err?.message || String(err) }
  }
}
```

注意：测试里 `listConversations` 期望「刚保存的 a 排最前」——两个对话同一秒创建时 updatedAt 可能相等，sort 需稳定。`saveConversation` 里 `new Date().toISOString()` 含毫秒，创建与保存相隔执行时间，一般成立；若 flaky，把 sort 改为 `b.updatedAt.localeCompare(a.updatedAt) || b.id.localeCompare(a.id)`。

- [ ] **Step 4: 跑测试确认通过**

Run: `npx vitest run tests/scout-conversation-store.test.ts`
Expected: PASS（6 个用例）

- [ ] **Step 5: Commit**

```bash
git add electron/lib/scout/conversation-store.ts tests/scout-conversation-store.test.ts
git commit -m "feat: add scout conversation store (json crud)"
```

---

### Task 5: 工具协议 tool-protocol（拾贝版）

**Files:**
- Create: `electron/lib/scout/tool-protocol.ts`
- Test: `tests/scout-tool-protocol.test.ts`

- [ ] **Step 1: 写失败测试**

`tests/scout-tool-protocol.test.ts`：

```ts
import { describe, it, expect } from 'vitest'
import { extractToolCall, createToolBuffer } from '../electron/lib/scout/tool-protocol'

describe('scout tool-protocol', () => {
  it('解析 web_search', () => {
    expect(extractToolCall('```tool\n{"tool":"web_search","query":"AI agent"}\n```'))
      .toEqual({ tool: 'web_search', query: 'AI agent' })
  })

  it('解析 propose_candidates 并校验候选结构', () => {
    const text = '```tool\n' + JSON.stringify({
      tool: 'propose_candidates',
      candidates: [{ title: 'A', url: 'https://a.com', sourceName: 'a.com', reason: '好' }],
    }) + '\n```'
    expect(extractToolCall(text)).toEqual({
      tool: 'propose_candidates',
      candidates: [{ title: 'A', url: 'https://a.com', sourceName: 'a.com', reason: '好' }],
    })
  })

  it('propose_candidates 缺字段 → null', () => {
    const text = '```tool\n{"tool":"propose_candidates","candidates":[{"title":"A"}]}\n```'
    expect(extractToolCall(text)).toBeNull()
  })

  it('解析 fetch_and_save / read_article', () => {
    expect(extractToolCall('```tool\n{"tool":"fetch_and_save","urls":["https://a.com"]}\n```'))
      .toEqual({ tool: 'fetch_and_save', urls: ['https://a.com'] })
    expect(extractToolCall('```tool\n{"tool":"read_article","url":"https://a.com"}\n```'))
      .toEqual({ tool: 'read_article', url: 'https://a.com' })
  })

  it('非法 JSON / 未知工具 → null', () => {
    expect(extractToolCall('```tool\n{bad\n```')).toBeNull()
    expect(extractToolCall('```tool\n{"tool":"hack"}\n```')).toBeNull()
  })

  it('流式 buffer：tool 块不外泄到正文，尾部半截 ```to 不吞字', () => {
    const buf = createToolBuffer()
    let out = ''
    out += buf.feed('前言 ')
    out += buf.feed('```to')
    out += buf.feed('ol\n{"tool":"web_search","query":"q"}\n```')
    out += buf.feed('后文')
    out += buf.flush()
    expect(out).toBe('前言 后文')
    expect(buf.takeTool()).toEqual({ tool: 'web_search', query: 'q' })
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run tests/scout-tool-protocol.test.ts`
Expected: FAIL（模块不存在）

- [ ] **Step 3: 实现 tool-protocol.ts**

`electron/lib/scout/tool-protocol.ts`（以写作助手 `electron/lib/writing-assistant/tool-protocol.ts` 为蓝本，`createToolBuffer` 逐字复制，仅工具集不同）：

```ts
export const MAX_TOOL_CALLS = 3

export type ScoutCandidateInput = {
  title: string
  url: string
  sourceName: string
  reason: string
}

export type ToolCall =
  | { tool: 'web_search'; query: string }
  | { tool: 'propose_candidates'; candidates: ScoutCandidateInput[] }
  | { tool: 'fetch_and_save'; urls: string[] }
  | { tool: 'read_article'; url: string }

const VALID_TOOLS = ['web_search', 'propose_candidates', 'fetch_and_save', 'read_article']

function isCandidate(x: unknown): x is ScoutCandidateInput {
  if (!x || typeof x !== 'object') return false
  const o = x as Record<string, unknown>
  return typeof o.title === 'string' && typeof o.url === 'string'
    && typeof o.sourceName === 'string' && typeof o.reason === 'string'
}

export function extractToolCall(text: string): ToolCall | null {
  const m = text.match(/```tool\s*\n([\s\S]*?)```/)
  if (!m) return null
  let json: unknown
  try { json = JSON.parse(m[1].trim()) } catch { return null }
  if (!json || typeof json !== 'object') return null
  const o = json as Record<string, unknown>
  if (!VALID_TOOLS.includes(o.tool as string)) return null
  if (o.tool === 'web_search' && typeof o.query === 'string' && o.query.length > 0)
    return { tool: 'web_search', query: o.query }
  if (o.tool === 'propose_candidates' && Array.isArray(o.candidates) && o.candidates.length > 0 && o.candidates.every(isCandidate))
    return { tool: 'propose_candidates', candidates: o.candidates as ScoutCandidateInput[] }
  if (o.tool === 'fetch_and_save' && Array.isArray(o.urls) && o.urls.length > 0 && o.urls.every((x): x is string => typeof x === 'string'))
    return { tool: 'fetch_and_save', urls: o.urls }
  if (o.tool === 'read_article' && typeof o.url === 'string' && o.url.length > 0)
    return { tool: 'read_article', url: o.url }
  return null
}

// --- 以下与写作助手 tool-protocol.ts 的 createToolBuffer 逐字相同 ---
export function createToolBuffer() {
  let buf = ''
  let inTool = false
  let toolBody = ''
  let completed: string | null = null

  const feed = (chunk: string): string => {
    buf += chunk
    let out = ''
    for (;;) {
      if (inTool) {
        const end = buf.indexOf('```')
        if (end === -1) { toolBody += buf; buf = ''; return out }
        toolBody += buf.slice(0, end)
        buf = buf.slice(end + 3)
        inTool = false
        completed = toolBody
        toolBody = ''
        continue
      }
      const start = buf.indexOf('```tool')
      if (start === -1) {
        const m = buf.match(/`{1,3}(t|to|too|tool)?$/)
        const tail = m?.[0] ?? ''
        const keep = tail && buf.endsWith(tail) ? tail.length : 0
        out += buf.slice(0, buf.length - keep)
        buf = buf.slice(buf.length - keep)
        return out
      }
      out += buf.slice(0, start)
      buf = buf.slice(start + '```tool'.length)
      inTool = true
    }
  }

  return {
    feed,
    takeTool: (): ToolCall | null => {
      if (completed === null) return null
      const body = completed
      completed = null
      const clean = body.replace(/^\n/, '')
      return extractToolCall('```tool\n' + clean + '\n```')
    },
    flush: (): string => { const rest = buf; buf = ''; return rest },
  }
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `npx vitest run tests/scout-tool-protocol.test.ts`
Expected: PASS（6 个用例）

- [ ] **Step 5: Commit**

```bash
git add electron/lib/scout/tool-protocol.ts tests/scout-tool-protocol.test.ts
git commit -m "feat: add scout tool protocol"
```

---

### Task 6: 系统 prompt + 工具执行（含候选预检）

**Files:**
- Create: `electron/lib/scout/prompt.ts`
- Create: `electron/lib/scout/tools.ts`
- Test: `tests/scout-tools.test.ts`

- [ ] **Step 1: 写失败测试**

`tests/scout-tools.test.ts`：

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { executeScoutTool, type ScoutToolDeps } from '../electron/lib/scout/tools'
import { buildScoutSystemPrompt } from '../electron/lib/scout/prompt'

let root: string
beforeEach(() => { root = fs.mkdtempSync(path.join(os.tmpdir(), 'scout-tools-')) })
afterEach(() => { fs.rmSync(root, { recursive: true, force: true }) })

const LONG_MD = '# 好文\n\n' + '内容。'.repeat(300)

function makeDeps(overrides: Partial<ScoutToolDeps> = {}): ScoutToolDeps {
  return {
    libraryPath: root,
    send: () => {},
    searchWeb: async () => [{ title: 'T', url: 'https://a.com/x', content: 'snippet' }],
    tavilyExtract: async () => LONG_MD,
    plainFetch: async () => LONG_MD,
    scraperFetch: async () => ({ markdown: LONG_MD, title: '好文', publishedAt: null, authors: [] }),
    ...overrides,
  }
}

describe('executeScoutTool', () => {
  it('web_search 返回格式化结果', async () => {
    const r = await executeScoutTool({ tool: 'web_search', query: 'q' }, makeDeps())
    expect(r).toContain('https://a.com/x')
  })

  it('propose_candidates 预检：可抓取的标 fetchable，失败的标 failReason', async () => {
    const deps = makeDeps({
      plainFetch: async (url) => url.includes('bad') ? Promise.reject(Object.assign(new Error('403'), { httpStatus: 403 })) : LONG_MD,
    })
    const r = await executeScoutTool({
      tool: 'propose_candidates',
      candidates: [
        { title: '好', url: 'https://a.com/good', sourceName: 'a.com', reason: 'r' },
        { title: '坏', url: 'https://a.com/bad', sourceName: 'a.com', reason: 'r' },
      ],
    }, deps)
    const parsed = JSON.parse(r)
    expect(parsed.candidates[0].fetchable).toBe(true)
    expect(parsed.candidates[1].fetchable).toBe(false)
    expect(parsed.candidates[1].failReason).toBeTruthy()
  })

  it('propose_candidates 预检内容入缓存，fetch_and_save 消费缓存不再抓取', async () => {
    let fetchCount = 0
    const deps = makeDeps({
      plainFetch: async () => { fetchCount++; return LONG_MD },
    })
    await executeScoutTool({
      tool: 'propose_candidates',
      candidates: [{ title: '好', url: 'https://a.com/good', sourceName: 'a.com', reason: 'r' }],
    }, deps)
    expect(fetchCount).toBe(1)
    const r = await executeScoutTool({ tool: 'fetch_and_save', urls: ['https://a.com/good'] }, deps)
    expect(fetchCount).toBe(1) // 缓存命中，未再抓
    expect(r).toContain('已入库')
    // 文件确实落盘
    const saved = fs.readdirSync(path.join(root, '拾贝', '文章'), { recursive: true })
    expect(saved.length).toBeGreaterThan(0)
  })

  it('fetch_and_save 重复 URL → 提示已在库中', async () => {
    const deps = makeDeps()
    await executeScoutTool({ tool: 'fetch_and_save', urls: ['https://a.com/x'] }, deps)
    const r = await executeScoutTool({ tool: 'fetch_and_save', urls: ['https://a.com/x'] }, deps)
    expect(r).toContain('已在库中')
  })

  it('read_article 读已入库文章全文；未入库提示先抓取', async () => {
    const deps = makeDeps()
    await executeScoutTool({ tool: 'fetch_and_save', urls: ['https://a.com/x'] }, deps)
    const r = await executeScoutTool({ tool: 'read_article', url: 'https://a.com/x' }, deps)
    expect(r).toContain('内容。')
    const miss = await executeScoutTool({ tool: 'read_article', url: 'https://not-saved.com/' }, deps)
    expect(miss).toContain('尚未入库')
  })

  it('read_article 超长截断并注明', async () => {
    const huge = '# 长文\n\n' + '字'.repeat(30000)
    const deps = makeDeps({ plainFetch: async () => huge })
    await executeScoutTool({ tool: 'fetch_and_save', urls: ['https://a.com/x'] }, deps)
    const r = await executeScoutTool({ tool: 'read_article', url: 'https://a.com/x' }, deps)
    expect(r.length).toBeLessThan(huge.length)
    expect(r).toContain('截断')
  })
})

describe('buildScoutSystemPrompt', () => {
  it('包含四工具说明与候选确认规则与负面示例', () => {
    const p = buildScoutSystemPrompt()
    expect(p).toContain('web_search')
    expect(p).toContain('propose_candidates')
    expect(p).toContain('fetch_and_save')
    expect(p).toContain('read_article')
    expect(p).toContain('确认')
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run tests/scout-tools.test.ts`
Expected: FAIL（模块不存在）

- [ ] **Step 3: 实现 prompt.ts 与 tools.ts**

`electron/lib/scout/prompt.ts`：

```ts
export function buildScoutSystemPrompt(): string {
  return `你是「拾贝」助手，住在学者的书房里，负责从互联网采集高质量文章原文。

## 工作方式

用户会给你两类输入：
1. **研究主题**（如「帮我找几篇 AI Agent 架构的一手长文」）→ 先搜索，再提候选，等用户确认后抓取
2. **文章 URL** → 直接用 fetch_and_save 抓取，不要走候选流程

## 工具（在回复中输出 \`\`\`tool 代码块调用）

- {"tool":"web_search","query":"..."} — 搜索。查询词用英文效果更好；一次只发一个工具调用
- {"tool":"propose_candidates","candidates":[{"title":"...","url":"...","sourceName":"...","reason":"..."}]} — 提出候选。reason 用一句话说清推荐理由。系统会自动预检可抓取性，不可抓取的候选不会呈现给用户
- {"tool":"fetch_and_save","urls":["..."]} — 抓取入库。**只有在用户明确确认候选后才能调用**
- {"tool":"read_article","url":"..."} — 读取已入库文章全文，用于回答关于文章内容的问题

## 规则

- 提候选前必须先搜索（web_search），禁止凭记忆编造 URL
- 筛选标准：一手源头（官方博客、作者本人博客、原始论文页），拒绝资讯转述、聚合站、营销文
- 候选 3-6 篇，宁缺毋滥
- 用户确认后才能 fetch_and_save；用户没确认的不要抓
- 用户问已入库文章的内容时，先 read_article 再回答，不要凭印象
- 用中文回复，语气温和简练

## 负面示例（禁止）

- ❌ 没搜索就列候选（编造 URL）
- ❌ 用户还没确认就调用 fetch_and_save
- ❌ 一次回复里发多个 tool 块`
}
```

`electron/lib/scout/tools.ts`：

```ts
import fs from 'node:fs'
import { fetchArticle, type FetchDeps, type FetchedArticle } from './article-fetcher'
import { saveArticle, findSavedByUrl } from './article-store'
import { parseFrontmatter } from '../frontmatter'
import type { ToolCall } from './tool-protocol'
import type { ScoutCandidate, ScoutToolEvent } from '@shared/index'

const READ_ARTICLE_MAX_CHARS = 20000

export type ScoutToolDeps = {
  libraryPath: string
  send: (e: ScoutToolEvent) => void
  searchWeb: (opts: { query: string; signal?: AbortSignal }) => Promise<{ title: string; url: string; content: string }[]>
  tavilyExtract: FetchDeps['tavilyExtract']
  plainFetch: FetchDeps['plainFetch']
  scraperFetch: FetchDeps['scraperFetch']
  conversationId?: string
  signal?: AbortSignal
}

// 预检缓存：同一次 executeScoutTool 调用序列（一个 loop turn）内共享。
// key = url，value = 已抓到的文章内容。
const precheckCache = new Map<string, FetchedArticle>()

export function clearPrecheckCache(): void {
  precheckCache.clear()
}

function fetchDepsOf(deps: ScoutToolDeps): FetchDeps {
  return {
    tavilyExtract: deps.tavilyExtract,
    plainFetch: deps.plainFetch,
    scraperFetch: deps.scraperFetch,
  }
}

export async function executeScoutTool(call: ToolCall, deps: ScoutToolDeps): Promise<string> {
  switch (call.tool) {
    case 'web_search': {
      deps.send({ conversationId: deps.conversationId ?? '', phase: 'start', tool: 'web_search', query: call.query })
      const results = await deps.searchWeb({ query: call.query, signal: deps.signal })
      deps.send({ conversationId: deps.conversationId ?? '', phase: 'done', tool: 'web_search', query: call.query })
      if (results.length === 0) return '搜索无结果。'
      return results.map((r, i) => `[${i + 1}] ${r.title}\nURL: ${r.url}\n摘要: ${(r.content || '').slice(0, 300)}`).join('\n\n')
    }

    case 'propose_candidates': {
      // 预检：每个候选跑抓取管线，成功缓存内容，失败标注原因
      const checked: ScoutCandidate[] = []
      for (const c of call.candidates) {
        try {
          const fetched = await fetchArticle({ url: c.url, signal: deps.signal, deps: fetchDepsOf(deps) })
          precheckCache.set(c.url, fetched)
          checked.push({ ...c, fetchable: true })
        } catch (err: any) {
          checked.push({ ...c, fetchable: false, failReason: err?.code === 'FETCH_BLOCKED' ? '站点拒绝访问' : '无法提取正文' })
        }
      }
      deps.send({ conversationId: deps.conversationId ?? '', phase: 'candidates', candidates: checked })
      return JSON.stringify({ candidates: checked })
    }

    case 'fetch_and_save': {
      deps.send({ conversationId: deps.conversationId ?? '', phase: 'start', tool: 'fetch_and_save', urls: call.urls })
      const lines: string[] = []
      const savedTitles: string[] = []
      for (const url of call.urls) {
        // 去重：已入库不重复抓
        const existing = findSavedByUrl(deps.libraryPath).get(url)
        if (existing && fs.existsSync(existing)) {
          lines.push(`《${url}》已在库中，跳过重复抓取。`)
          continue
        }
        try {
          const fetched = precheckCache.get(url)
            ?? await fetchArticle({ url, signal: deps.signal, deps: fetchDepsOf(deps) })
          precheckCache.delete(url)
          const r = saveArticle(deps.libraryPath, fetched)
          if (r.wasAlreadySaved) {
            lines.push(`《${fetched.title}》已在库中。`)
          } else {
            savedTitles.push(fetched.title)
            lines.push(`《${fetched.title}》已入库。`)
          }
        } catch (err: any) {
          const reason = err?.code === 'FETCH_BLOCKED' ? '站点拒绝访问' : err?.code === 'NO_CONTENT' ? '无法提取正文' : '网络错误'
          lines.push(`抓取失败（${url}）：${reason}。`)
        }
      }
      deps.send({ conversationId: deps.conversationId ?? '', phase: 'done', tool: 'fetch_and_save', urls: call.urls, savedTitles })
      return lines.join('\n')
    }

    case 'read_article': {
      deps.send({ conversationId: deps.conversationId ?? '', phase: 'start', tool: 'read_article', url: call.url })
      const filePath = findSavedByUrl(deps.libraryPath).get(call.url)
      let result: string
      if (!filePath || !fs.existsSync(filePath)) {
        result = `该文章尚未入库（${call.url}）。如需引用其内容，请先 fetch_and_save。`
      } else {
        const { frontmatter, body } = parseFrontmatter(fs.readFileSync(filePath, 'utf8'), { filename: filePath })
        const full = `# ${frontmatter.title}\n\n${body.trim()}`
        result = full.length > READ_ARTICLE_MAX_CHARS
          ? `${full.slice(0, READ_ARTICLE_MAX_CHARS)}\n\n（正文过长已截断，仅前 ${READ_ARTICLE_MAX_CHARS} 字符）`
          : full
      }
      deps.send({ conversationId: deps.conversationId ?? '', phase: 'done', tool: 'read_article', url: call.url })
      return result
    }
  }
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `npx vitest run tests/scout-tools.test.ts`
Expected: PASS（7 个用例）

- [ ] **Step 5: Commit**

```bash
git add electron/lib/scout/prompt.ts electron/lib/scout/tools.ts tests/scout-tools.test.ts
git commit -m "feat: add scout system prompt and tool execution with candidate precheck"
```

---

### Task 7: Agent 循环 loop

**Files:**
- Create: `electron/lib/scout/loop.ts`
- Test: `tests/scout-loop.test.ts`

- [ ] **Step 1: 写失败测试**

`tests/scout-loop.test.ts`：

```ts
import { describe, it, expect } from 'vitest'
import { runScoutTurn, type ScoutLoopDeps } from '../electron/lib/scout/loop'

function textStream(text: string) {
  return async (_opts: any, onChunk: (t: string) => void, _onReasoning?: (t: string) => void) => {
    onChunk(text)
  }
}

function makeDeps(chatStreamImpl: any): ScoutLoopDeps {
  return {
    chatStream: chatStreamImpl,
    executeTool: async () => '工具结果',
    buildDeps: () => ({} as any),
  }
}

describe('runScoutTurn', () => {
  it('无工具调用：单轮流式输出后结束', async () => {
    const chunks: string[] = []
    await runScoutTurn(
      { messages: [{ role: 'user', content: '你好' }], onChunk: (t) => chunks.push(t), onReasoning: () => {}, signal: new AbortController().signal },
      makeDeps(textStream('直接回复'))
    )
    expect(chunks.join('')).toBe('直接回复')
  })

  it('工具调用：执行后带着工具结果再流一轮', async () => {
    let round = 0
    const chunks: string[] = []
    const toolCalls: string[] = []
    const deps: ScoutLoopDeps = {
      chatStream: async (_opts: any, onChunk: (t: string) => void) => {
        round++
        if (round === 1) onChunk('先搜一下\n```tool\n{"tool":"web_search","query":"q"}\n```')
        else onChunk('最终回复')
      },
      executeTool: async (call) => { toolCalls.push(call.tool); return '搜索结果' },
      buildDeps: () => ({} as any),
    }
    await runScoutTurn(
      { messages: [{ role: 'user', content: '找文章' }], onChunk: (t) => chunks.push(t), onReasoning: () => {}, signal: new AbortController().signal },
      deps
    )
    expect(toolCalls).toEqual(['web_search'])
    expect(chunks.join('')).toContain('最终回复')
    expect(chunks.join('')).not.toContain('```tool') // tool 块不外泄
  })

  it('超过 MAX_TOOL_CALLS 轮：强制收尾一轮不再执行工具', async () => {
    let toolRuns = 0
    const deps: ScoutLoopDeps = {
      chatStream: async (_opts: any, onChunk: (t: string) => void) => {
        onChunk('```tool\n{"tool":"web_search","query":"q"}\n```')
      },
      executeTool: async () => { toolRuns++; return 'r' },
      buildDeps: () => ({} as any),
    }
    await runScoutTurn(
      { messages: [], onChunk: () => {}, onReasoning: () => {}, signal: new AbortController().signal },
      deps
    )
    expect(toolRuns).toBe(3) // MAX_TOOL_CALLS = 3
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run tests/scout-loop.test.ts`
Expected: FAIL（模块不存在）

- [ ] **Step 3: 实现 loop.ts**

`electron/lib/scout/loop.ts`（蓝本：`electron/lib/writing-assistant/loop.ts`）：

```ts
import type { AppConfig } from '../../env'
import type { Message } from '@shared/index'
import type { ScoutMessage } from '@shared/index'
import { createToolBuffer, MAX_TOOL_CALLS, type ToolCall } from './tool-protocol'
import { buildScoutSystemPrompt } from './prompt'

export type ScoutLoopDeps = {
  chatStream: (
    opts: { messages: Message[]; temperature: number; signal: AbortSignal; thinking?: unknown },
    onChunk: (t: string) => void,
    onReasoning: (t: string) => void
  ) => Promise<void>
  executeTool: (call: ToolCall, roundDeps: unknown) => Promise<string>
  buildDeps: () => unknown
}

export async function runScoutTurn(
  args: {
    messages: ScoutMessage[]
    onChunk: (text: string) => void
    onReasoning: (text: string) => void
    signal: AbortSignal
  },
  deps: ScoutLoopDeps
): Promise<void> {
  const history: Message[] = [
    { role: 'system', content: buildScoutSystemPrompt() },
    // 候选卡片等结构化字段不进 LLM 上下文，只发纯文本
    ...args.messages.map(m => ({ role: m.role as 'user' | 'assistant', content: m.content })),
  ]

  for (let round = 0; round <= MAX_TOOL_CALLS; round++) {
    const buf = createToolBuffer()

    await deps.chatStream(
      { messages: history, temperature: 0.7, signal: args.signal, thinking: { type: 'enabled', reasoning_effort: 'high' } },
      (text: string) => { const out = buf.feed(text); if (out) args.onChunk(out) },
      args.onReasoning
    )

    const tail = buf.flush()
    if (tail) args.onChunk(tail)

    const call = buf.takeTool()
    if (!call) return

    if (round === MAX_TOOL_CALLS) {
      history.push({ role: 'user', content: '工具调用次数已达上限，请直接回答用户的问题。' })
      await deps.chatStream(
        { messages: history, temperature: 0.7, signal: args.signal, thinking: { type: 'disabled' } },
        args.onChunk,
        args.onReasoning
      )
      return
    }

    const toolResult = await deps.executeTool(call, deps.buildDeps())
    history.push(
      { role: 'assistant', content: `（调用工具：${call.tool}）` },
      { role: 'user', content: `工具结果：\n${toolResult}` }
    )
  }
}
```

注意：真实装配（把 `kimi.chatStream`、AppConfig、tools.executeScoutTool 接进来）在 Task 8 的 IPC 层完成，loop 保持依赖注入纯函数。

- [ ] **Step 4: 跑测试确认通过**

Run: `npx vitest run tests/scout-loop.test.ts`
Expected: PASS（3 个用例）

- [ ] **Step 5: Commit**

```bash
git add electron/lib/scout/loop.ts tests/scout-loop.test.ts
git commit -m "feat: add scout agent loop"
```

---

### Task 8: IPC + preload + facade（含 E2E mock 分支）

**Files:**
- Create: `electron/ipc/scout.ts`
- Modify: `electron/ipc/index.ts`（注册）
- Modify: `electron/preload.ts`（暴露）
- Modify: `src/lib/ipc.ts`（facade）
- Test: `tests/scout-ipc.test.ts`

- [ ] **Step 1: 写失败测试**

`tests/scout-ipc.test.ts`（蓝本：`tests/search-ipc.test.ts` 的 ipcMain mock 模式）：

```ts
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const handlers = new Map<string, (...args: any[]) => any>()
vi.mock('electron', () => ({
  ipcMain: { handle: (ch: string, fn: any) => handlers.set(ch, fn) },
}))

import { registerScoutIpc } from '../electron/ipc/scout'

let root: string
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'scout-ipc-'))
  handlers.clear()
  registerScoutIpc({ libraryPath: root } as any)
})
afterEach(() => { fs.rmSync(root, { recursive: true, force: true }) })

describe('scout ipc', () => {
  it('对话 CRUD 全链路', async () => {
    const conv = await handlers.get('scout:createConversation')!()
    expect(conv.messages).toEqual([])
    const list = await handlers.get('scout:listConversations')!()
    expect(list).toHaveLength(1)
    expect(list[0].id).toBe(conv.id)
    const rn = await handlers.get('scout:renameConversation')!(null, { id: conv.id, title: '新名字' })
    expect(rn).toEqual({ ok: true })
    const got = await handlers.get('scout:getConversation')!(null, { id: conv.id })
    expect(got.title).toBe('新名字')
    const del = await handlers.get('scout:deleteConversation')!(null, { id: conv.id })
    expect(del).toEqual({ ok: true })
    expect(await handlers.get('scout:listConversations')!()).toHaveLength(0)
  })

  it('scout:listArticles 空库返回空数组', async () => {
    expect(await handlers.get('scout:listArticles')!()).toEqual([])
  })

  it('scout:abort 对不存在对话不抛错', async () => {
    await expect(handlers.get('scout:abort')!(null, { conversationId: 'nope' })).resolves.toBeUndefined()
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run tests/scout-ipc.test.ts`
Expected: FAIL（模块不存在）

- [ ] **Step 3: 实现 IPC + preload + facade**

`electron/ipc/scout.ts`（蓝本：`electron/ipc/writing-assistant.ts` 的 SSE/mock 结构 + `electron/ipc/anthropic.ts` 的 CRUD 结构）：

```ts
import { ipcMain } from 'electron'
import type { AppConfig } from '../env'
import { chatStream } from '../lib/kimi'
import { runScoutTurn } from '../lib/scout/loop'
import { executeScoutTool } from '../lib/scout/tools'
import { makeTavilyExtract } from '../lib/scout/article-fetcher'
import { saveConversation, createConversation, getConversation, listConversations, renameConversation, deleteConversation } from '../lib/scout/conversation-store'
import { listArticles, deleteArticle } from '../lib/scout/article-store'
import { getSearchApiKey } from '../lib/credentials'
import { searchWeb } from '../lib/search'
import type { ScoutMessage, ScoutToolEvent } from '@shared/index'

const scoutSessions = new Map<string, AbortController>()

function isE2EMock(): boolean {
  return process.env.NODE_ENV === 'test' && !!process.env.E2E_CONFIG_DIR
}

export function registerScoutIpc(cfg: AppConfig): void {
  ipcMain.handle('scout:sendMessage', async (event, args: { conversationId: string; messages: ScoutMessage[] }): Promise<void> => {
    const send = (channel: string, ...payload: unknown[]) => {
      if (event.sender.isDestroyed()) return
      event.sender.send(channel, ...payload)
    }

    // E2E 确定性 mock：模拟「搜索→候选→抓取」全流程，产出两篇 fixture 文章
    if (isE2EMock()) {
      const ctl = new AbortController()
      scoutSessions.set(args.conversationId, ctl)
      try {
        const lastUser = args.messages.filter(m => m.role === 'user').at(-1)?.content ?? ''
        if (/^抓取/.test(lastUser)) {
          // 用户确认抓取：写两篇 fixture 文章
          const { saveArticle } = await import('../lib/scout/article-store')
          for (const [i, title] of ['ReAct 原文', 'The Second Half'].entries()) {
            saveArticle(cfg.libraryPath, {
              url: `https://example.com/article-${i}`, title, markdown: `# ${title}\n\nE2E 正文`,
              summary: `${title} 摘要`, publishedAt: '2026-08-01T00:00:00.000Z', authors: [], tier: 1,
            })
          }
          send('scout:tool', { conversationId: args.conversationId, phase: 'start', tool: 'fetch_and_save', urls: [] })
          send('scout:tool', { conversationId: args.conversationId, phase: 'done', tool: 'fetch_and_save', urls: [], savedTitles: ['ReAct 原文', 'The Second Half'] })
          send('llm:chunk', args.conversationId, '两篇都已入库，去「文章」Tab 查看。')
        } else {
          send('llm:chunk', args.conversationId, '我找到了两篇候选：')
          send('scout:tool', {
            conversationId: args.conversationId, phase: 'candidates',
            candidates: [
              { title: 'ReAct 原文', url: 'https://example.com/article-0', sourceName: 'example.com', reason: '奠基论文', fetchable: true },
              { title: 'The Second Half', url: 'https://example.com/article-1', sourceName: 'example.com', reason: '一手长文', fetchable: true },
            ],
          })
          send('llm:chunk', args.conversationId, '确认后我就抓取。')
        }
        send('llm:done', args.conversationId)
      } finally {
        scoutSessions.delete(args.conversationId)
      }
      return
    }

    // 真实分支
    const ctl = new AbortController()
    scoutSessions.set(args.conversationId, ctl)
    try {
      const conv = getConversation(cfg.libraryPath, args.conversationId)
      if (conv) saveConversation(cfg.libraryPath, { ...conv, messages: args.messages })

      await runScoutTurn(
        {
          messages: args.messages,
          onChunk: (t) => send('llm:chunk', args.conversationId, t),
          onReasoning: (t) => send('scout:reasoningChunk', args.conversationId, t),
          signal: ctl.signal,
        },
        {
          chatStream: (opts, onChunk, onReasoning) =>
            chatStream(cfg, { messages: opts.messages, temperature: opts.temperature, signal: opts.signal, thinking: opts.thinking as any }, onChunk, onReasoning),
          buildDeps: () => ({
            libraryPath: cfg.libraryPath,
            conversationId: args.conversationId,
            signal: ctl.signal,
            send: (e: ScoutToolEvent) => send('scout:tool', e),
            searchWeb: ({ query, signal }: { query: string; signal?: AbortSignal }) =>
              getSearchApiKey().then(key => searchWeb({ query, apiKey: key, signal })),
            tavilyExtract: makeTavilyExtract(await getSearchApiKey()),
            plainFetch: undefined as never, // 见下方说明
            scraperFetch: undefined as never,
          }),
          executeTool: (call, roundDeps) => executeScoutTool(call, roundDeps as any),
        }
      )

      // 回合结束持久化助手回复（renderer 会把最终消息列表随下一条消息送回；
      // 此处保存工具产生的中间状态）
      send('llm:done', args.conversationId)
    } catch (err: any) {
      if (err?.name === 'AbortError') return
      send('llm:error', args.conversationId, { code: err?.code ?? 'LLM_ERROR', message: String(err?.message ?? err) })
    } finally {
      scoutSessions.delete(args.conversationId)
    }
  })

  ipcMain.handle('scout:abort', (_, args: { conversationId: string }) => {
    const ctl = scoutSessions.get(args.conversationId)
    if (ctl) { ctl.abort(); scoutSessions.delete(args.conversationId) }
  })

  ipcMain.handle('scout:listConversations', () => listConversations(cfg.libraryPath))
  ipcMain.handle('scout:createConversation', () => createConversation(cfg.libraryPath))
  ipcMain.handle('scout:getConversation', (_, args: { id: string }) => getConversation(cfg.libraryPath, args.id))
  ipcMain.handle('scout:renameConversation', (_, args: { id: string; title: string }) => renameConversation(cfg.libraryPath, args.id, args.title))
  ipcMain.handle('scout:deleteConversation', (_, args: { id: string }) => deleteConversation(cfg.libraryPath, args.id))
  ipcMain.handle('scout:listArticles', () => listArticles(cfg.libraryPath))
  ipcMain.handle('scout:deleteArticle', (_, args: { filePath: string }) => deleteArticle(cfg.libraryPath, args.filePath))
}
```

**实现注意**：`buildDeps` 不能含 `undefined as never`——`plainFetch`/`scraperFetch` 需要从 article-fetcher 导出默认实现。回到 Task 2 的 `article-fetcher.ts`，把 `defaultPlainFetch` / `defaultScraperFetch` 改为具名导出 `plainFetch` / `scraperFetch`（`fetchArticle` 内部默认 deps 同步引用），此处直接 import 使用。（执行本任务的 subagent 先做这个导出调整，并跑 `npx vitest run tests/scout-fetcher.test.ts` 确认不回归。）

`buildDeps` 里 `tavilyExtract: makeTavilyExtract(await getSearchApiKey())` 含 await，把 `buildDeps` 改为 `async`，`loop.ts` 的 `executeTool` 调用处改为 `deps.executeTool(call, await deps.buildDeps())`（loop 类型同步改 `buildDeps: () => Promise<unknown> | unknown`，Task 7 测试不受影响）。

`electron/ipc/index.ts`：找到 `registerWritingAssistantIpc(cfg)` 等注册行，加：

```ts
import { registerScoutIpc } from './scout'
// ...registerAllIpc 内：
  registerScoutIpc(cfg)
```

`electron/preload.ts`（anthropic 段之后）：

```ts
  scoutSendMessage: (a) => ipcRenderer.invoke('scout:sendMessage', a),
  scoutAbort: (a) => ipcRenderer.invoke('scout:abort', a),
  scoutListConversations: () => ipcRenderer.invoke('scout:listConversations'),
  scoutCreateConversation: () => ipcRenderer.invoke('scout:createConversation'),
  scoutGetConversation: (a) => ipcRenderer.invoke('scout:getConversation', a),
  scoutRenameConversation: (a) => ipcRenderer.invoke('scout:renameConversation', a),
  scoutDeleteConversation: (a) => ipcRenderer.invoke('scout:deleteConversation', a),
  scoutListArticles: () => ipcRenderer.invoke('scout:listArticles'),
  scoutDeleteArticle: (a) => ipcRenderer.invoke('scout:deleteArticle', a),
  onScoutTool: (cb) => {
    const handler = (_e, payload) => cb(payload)
    ipcRenderer.on('scout:tool', handler)
    return () => ipcRenderer.removeListener('scout:tool', handler)
  },
```

`src/lib/ipc.ts`（anthropic 段之后）：

```ts
  get scoutSendMessage() { return ensure().scoutSendMessage },
  get scoutAbort() { return ensure().scoutAbort },
  get scoutListConversations() { return ensure().scoutListConversations },
  get scoutCreateConversation() { return ensure().scoutCreateConversation },
  get scoutGetConversation() { return ensure().scoutGetConversation },
  get scoutRenameConversation() { return ensure().scoutRenameConversation },
  get scoutDeleteConversation() { return ensure().scoutDeleteConversation },
  get scoutListArticles() { return ensure().scoutListArticles },
  get scoutDeleteArticle() { return ensure().scoutDeleteArticle },
  get onScoutTool() { return ensure().onScoutTool },
```

- [ ] **Step 4: 跑测试确认通过**

Run: `npx vitest run tests/scout-ipc.test.ts tests/scout-fetcher.test.ts tests/scout-loop.test.ts`
Expected: PASS；`npx tsc --noEmit` 通过

- [ ] **Step 5: Commit**

```bash
git add electron/ipc/scout.ts electron/ipc/index.ts electron/preload.ts src/lib/ipc.ts electron/lib/scout/article-fetcher.ts electron/lib/scout/loop.ts tests/scout-ipc.test.ts
git commit -m "feat: add scout ipc layer with e2e mock branch"
```

---

### Task 9: store scout slice

**Files:**
- Modify: `src/store/index.ts`
- Test: `tests/scout-store.test.ts`

- [ ] **Step 1: 写失败测试**

`tests/scout-store.test.ts`（蓝本：现有 `tests/store.test.ts` 的 ipc mock 方式）：

```ts
import { describe, it, expect, beforeEach, vi } from 'vitest'

const mockIpc = {
  scoutListConversations: vi.fn(),
  scoutCreateConversation: vi.fn(),
  scoutGetConversation: vi.fn(),
  scoutRenameConversation: vi.fn(),
  scoutDeleteConversation: vi.fn(),
  scoutListArticles: vi.fn(),
  scoutDeleteArticle: vi.fn(),
  scoutSendMessage: vi.fn(),
  scoutAbort: vi.fn(),
  patchState: vi.fn(),
}
vi.mock('@/lib/ipc', () => ({ ipc: new Proxy({}, { get: (_, k) => mockIpc[k as keyof typeof mockIpc] ?? (() => Promise.resolve()) }) }))

import { useStore } from '@/store'

const CONV = { id: 'c1', title: '2026-08-02 15:04', createdAt: 'a', updatedAt: 'b', filePath: '/x/c1.json' }

beforeEach(() => {
  vi.clearAllMocks()
  useStore.setState({
    scoutTab: 'chat', scoutConversations: [], scoutActiveConversationId: null,
    scoutMessages: [], scoutStreaming: false, scoutArticles: [],
    scoutReaderFilePath: null, scoutReaderBody: null, scoutReaderTitle: null,
  })
})

describe('scout store slice', () => {
  it('initScout 加载对话列表与文章列表', async () => {
    mockIpc.scoutListConversations.mockResolvedValue([CONV])
    mockIpc.scoutListArticles.mockResolvedValue([{ url: 'u', title: 't', summary: null, publishedAt: null, sourceName: null, filePath: '/a.md' }])
    await useStore.getState().initScout()
    expect(useStore.getState().scoutConversations).toHaveLength(1)
    expect(useStore.getState().scoutArticles).toHaveLength(1)
  })

  it('createScoutConversation 新建并选中', async () => {
    mockIpc.scoutCreateConversation.mockResolvedValue({ ...CONV, messages: [] })
    mockIpc.scoutListConversations.mockResolvedValue([CONV])
    await useStore.getState().createScoutConversation()
    expect(useStore.getState().scoutActiveConversationId).toBe('c1')
    expect(useStore.getState().scoutMessages).toEqual([])
  })

  it('selectScoutConversation 还原消息', async () => {
    mockIpc.scoutGetConversation.mockResolvedValue({ ...CONV, messages: [{ role: 'user', content: 'hi' }] })
    await useStore.getState().selectScoutConversation('c1')
    expect(useStore.getState().scoutMessages).toHaveLength(1)
  })

  it('renameScoutConversation 更新列表项', async () => {
    mockIpc.scoutRenameConversation.mockResolvedValue({ ok: true })
    mockIpc.scoutListConversations.mockResolvedValue([CONV])
    await useStore.getState().initScout()
    mockIpc.scoutListConversations.mockResolvedValue([{ ...CONV, title: '改名' }])
    await useStore.getState().renameScoutConversation('c1', '改名')
    expect(useStore.getState().scoutConversations[0].title).toBe('改名')
  })

  it('deleteScoutConversation 清空当前选中', async () => {
    mockIpc.scoutListConversations.mockResolvedValue([CONV])
    await useStore.getState().initScout()
    useStore.setState({ scoutActiveConversationId: 'c1', scoutMessages: [{ role: 'user', content: 'x' }] })
    mockIpc.scoutDeleteConversation.mockResolvedValue({ ok: true })
    await useStore.getState().deleteScoutConversation('c1')
    expect(useStore.getState().scoutActiveConversationId).toBeNull()
    expect(useStore.getState().scoutConversations).toHaveLength(0)
  })

  it('confirmScoutCandidates 标记已确认并发送结构化用户消息', async () => {
    useStore.setState({
      scoutActiveConversationId: 'c1',
      scoutMessages: [
        { role: 'user', content: '找文章' },
        { role: 'assistant', content: '候选', candidates: [
          { title: 'A', url: 'https://a', sourceName: 'a', reason: 'r', fetchable: true },
          { title: 'B', url: 'https://b', sourceName: 'b', reason: 'r', fetchable: true },
        ], candidatesResolved: false },
      ],
    })
    mockIpc.scoutSendMessage.mockResolvedValue(undefined)
    await useStore.getState().confirmScoutCandidates(['https://a'])
    const msgs = useStore.getState().scoutMessages
    expect(msgs[1].candidatesResolved).toBe(true)
    expect(msgs[2].role).toBe('user')
    expect(msgs[2].content).toContain('https://a')
    expect(mockIpc.scoutSendMessage).toHaveBeenCalledWith(expect.objectContaining({ conversationId: 'c1' }))
  })

  it('deleteScoutArticle 关闭打开的 reader 并刷新列表', async () => {
    mockIpc.scoutListArticles.mockResolvedValue([])
    useStore.setState({ scoutReaderFilePath: '/a.md', scoutArticles: [{ url: 'u', title: 't', summary: null, publishedAt: null, sourceName: null, filePath: '/a.md' }] })
    mockIpc.scoutDeleteArticle.mockResolvedValue({ ok: true })
    await useStore.getState().deleteScoutArticle('/a.md')
    expect(useStore.getState().scoutReaderFilePath).toBeNull()
    expect(useStore.getState().scoutArticles).toHaveLength(0)
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run tests/scout-store.test.ts`
Expected: FAIL（slice 不存在）

- [ ] **Step 3: 实现 store slice**

`src/store/index.ts`：

1. 接口 `StoreState` 加（anthropic 段附近）：

```ts
  // --- 拾贝（Scout）---
  scoutTab: 'chat' | 'articles'
  scoutConversations: ScoutConversationMeta[]
  scoutActiveConversationId: string | null
  scoutMessages: ScoutMessage[]
  scoutStreaming: boolean
  scoutArticles: ScoutArticleMeta[]
  scoutReaderFilePath: string | null
  scoutReaderBody: string | null
  scoutReaderTitle: string | null
  setScoutTab: (tab: 'chat' | 'articles') => Promise<void>
  initScout: () => Promise<void>
  createScoutConversation: () => Promise<void>
  selectScoutConversation: (id: string) => Promise<void>
  renameScoutConversation: (id: string, title: string) => Promise<void>
  deleteScoutConversation: (id: string) => Promise<void>
  sendScoutMessage: (content: string) => Promise<void>
  abortScout: () => Promise<void>
  confirmScoutCandidates: (urls: string[]) => Promise<void>
  openScoutReader: (filePath: string) => void
  closeScoutReader: () => void
  setScoutReaderContent: (content: { body: string | null; title: string | null }) => void
  deleteScoutArticle: (filePath: string) => Promise<void>
```

2. 初始值（`anthropicReaderFilePath: null` 附近）：

```ts
  scoutTab: 'chat',
  scoutConversations: [],
  scoutActiveConversationId: null,
  scoutMessages: [],
  scoutStreaming: false,
  scoutArticles: [],
  scoutReaderFilePath: null,
  scoutReaderBody: null,
  scoutReaderTitle: null,
```

3. init 恢复（约 520 行 `briefingSource` 恢复逻辑处）：`scoutTab: state.scoutTab === 'articles' ? 'articles' : 'chat'`、`scoutActiveConversationId: state.scoutActiveConversationId ?? null`。

4. actions（`deleteAnthropicArticle` 之后）：

```ts
  setScoutTab: async (tab) => {
    set({ scoutTab: tab })
    await ipc.patchState({ scoutTab: tab } as Partial<StateJson>)
    if (tab === 'articles') {
      const articles = await ipc.scoutListArticles()
      set({ scoutArticles: articles })
    }
  },

  initScout: async () => {
    const [conversations, articles] = await Promise.all([ipc.scoutListConversations(), ipc.scoutListArticles()])
    set({ scoutConversations: conversations, scoutArticles: articles })
  },

  createScoutConversation: async () => {
    const conv = await ipc.scoutCreateConversation()
    const conversations = await ipc.scoutListConversations()
    set({ scoutConversations: conversations, scoutActiveConversationId: conv.id, scoutMessages: [] })
    await ipc.patchState({ scoutActiveConversationId: conv.id } as Partial<StateJson>)
  },

  selectScoutConversation: async (id) => {
    const conv = await ipc.scoutGetConversation({ id })
    if (!conv) return
    set({ scoutActiveConversationId: id, scoutMessages: conv.messages })
    await ipc.patchState({ scoutActiveConversationId: id } as Partial<StateJson>)
  },

  renameScoutConversation: async (id, title) => {
    const r = await ipc.scoutRenameConversation({ id, title })
    if (!r.ok) { get().showToast(r.message); return }
    const conversations = await ipc.scoutListConversations()
    set({ scoutConversations: conversations })
  },

  deleteScoutConversation: async (id) => {
    const r = await ipc.scoutDeleteConversation({ id })
    if (!r.ok) { get().showToast(r.message); return }
    const conversations = await ipc.scoutListConversations()
    set((s) => ({
      scoutConversations: conversations,
      scoutActiveConversationId: s.scoutActiveConversationId === id ? null : s.scoutActiveConversationId,
      scoutMessages: s.scoutActiveConversationId === id ? [] : s.scoutMessages,
    }))
  },

  sendScoutMessage: async (content) => {
    const id = get().scoutActiveConversationId
    if (!id || get().scoutStreaming) return
    const messages: ScoutMessage[] = [...get().scoutMessages, { role: 'user', content }]
    set({ scoutMessages: messages, scoutStreaming: true })
    try {
      await ipc.scoutSendMessage({ conversationId: id, messages })
    } finally {
      set({ scoutStreaming: false })
    }
  },

  abortScout: async () => {
    const id = get().scoutActiveConversationId
    if (!id) return
    await ipc.scoutAbort({ conversationId: id })
    set({ scoutStreaming: false })
  },

  confirmScoutCandidates: async (urls) => {
    const messages = get().scoutMessages.map((m, i, arr) =>
      i === arr.length - 1 && m.candidates ? { ...m, candidatesResolved: true } : m
    )
    set({ scoutMessages: messages })
    const lines = urls.map((u, i) => `${i + 1}. ${u}`).join('\n')
    await get().sendScoutMessage(`抓取以下候选：\n${lines}`)
  },

  openScoutReader: (filePath) => set({ scoutReaderFilePath: filePath }),
  closeScoutReader: () => set({ scoutReaderFilePath: null, scoutReaderBody: null, scoutReaderTitle: null }),
  setScoutReaderContent: ({ body, title }) => set({ scoutReaderBody: body, scoutReaderTitle: title }),

  deleteScoutArticle: async (filePath) => {
    const r = await ipc.scoutDeleteArticle({ filePath })
    if (!r.ok) { get().showToast(r.message); return }
    const articles = await ipc.scoutListArticles()
    set((s) => ({
      scoutArticles: articles,
      scoutReaderFilePath: s.scoutReaderFilePath === filePath ? null : s.scoutReaderFilePath,
      scoutReaderBody: s.scoutReaderFilePath === filePath ? null : s.scoutReaderBody,
      scoutReaderTitle: s.scoutReaderFilePath === filePath ? null : s.scoutReaderTitle,
    }))
  },
```

5. SSE 监听接线：`session-runtime.ts` 或 store 中已有 `onLlmChunk` 注册处——拾贝复用 `llm:chunk` 通道但按 `scoutActiveConversationId` 路由。找到现有 `onLlmChunk((sessionId, text) => ...)` 注册点，确认它只处理学习会话的 sessionId；在其旁注册拾贝监听（新建 `src/lib/scout-runtime.ts`，组件文件外、store 初始化处调用 `initScoutRuntime()`）：

```ts
import { ipc } from '@/lib/ipc'
import { useStore } from '@/store'

let initialized = false

export function initScoutRuntime(): void {
  if (initialized) return
  initialized = true

  ipc.onLlmChunk((sessionId: string, text: string) => {
    const s = useStore.getState()
    if (sessionId !== s.scoutActiveConversationId || !s.scoutStreaming) return
    const msgs = [...s.scoutMessages]
    const last = msgs[msgs.length - 1]
    if (last?.role === 'assistant' && !(last as any).__finalized) {
      msgs[msgs.length - 1] = { ...last, content: last.content + text }
    } else {
      msgs.push({ role: 'assistant', content: text })
    }
    useStore.setState({ scoutMessages: msgs })
  })

  ipc.onScoutTool((e) => {
    const s = useStore.getState()
    if (e.conversationId !== s.scoutActiveConversationId) return
    if (e.phase === 'candidates') {
      // 把候选卡片挂到最近一条 assistant 消息
      const msgs = [...s.scoutMessages]
      for (let i = msgs.length - 1; i >= 0; i--) {
        if (msgs[i].role === 'assistant') {
          msgs[i] = { ...msgs[i], candidates: e.candidates, candidatesResolved: false }
          break
        }
      }
      if (msgs.length === 0 || msgs[msgs.length - 1].role !== 'assistant') {
        msgs.push({ role: 'assistant', content: '', candidates: e.candidates, candidatesResolved: false })
      }
      useStore.setState({ scoutMessages: msgs })
    }
    if (e.phase === 'done' && e.tool === 'fetch_and_save') {
      // 抓取完成刷新文章列表
      void ipc.scoutListArticles().then((articles) => useStore.setState({ scoutArticles: articles }))
    }
  })
}
```

注意 `onLlmChunk` 若与学习会话共用同一 sessionId 判断逻辑，先读 `src/lib/session-runtime.ts` 确认现有注册方式，拾贝监听不得影响学习会话路由（判断条件含 `scoutStreaming`，学习会话期间该值为 false）。

- [ ] **Step 4: 跑测试确认通过**

Run: `npx vitest run tests/scout-store.test.ts`
Expected: PASS（7 个用例）

- [ ] **Step 5: Commit**

```bash
git add src/store/index.ts src/lib/scout-runtime.ts tests/scout-store.test.ts
git commit -m "feat: add scout store slice and runtime listeners"
```

---

### Task 10: ArticleRow 通用化

**Files:**
- Create: `src/components/article/ArticleRow.tsx`
- Modify: `src/components/anthropic/AnthropicArticleRow.tsx`（改为容器）
- Test: `tests/article-row.test.tsx`（新建）、`tests/anthropic-article-row.test.tsx`（保持通过）

- [ ] **Step 1: 写失败测试**

`tests/article-row.test.tsx`：

```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ArticleRow } from '@/components/article/ArticleRow'

const base = {
  title: 'The Second Half',
  summary: 'AI 进入下半场',
  dateText: '2025年4月10日',
  testId: 'article-row',
}

describe('ArticleRow（通用展示行）', () => {
  it('渲染标题/摘要/日期', () => {
    render(<ArticleRow {...base} onOpen={() => {}} />)
    expect(screen.getByText('The Second Half')).toBeInTheDocument()
    expect(screen.getByText('AI 进入下半场')).toBeInTheDocument()
    expect(screen.getByText('2025年4月10日')).toBeInTheDocument()
  })

  it('点击触发 onOpen；isNew 显示新标记', () => {
    const onOpen = vi.fn()
    render(<ArticleRow {...base} isNew onOpen={onOpen} />)
    fireEvent.click(screen.getByTestId('article-row'))
    expect(onOpen).toHaveBeenCalledOnce()
    expect(screen.getByTestId('article-row-new-badge')).toBeInTheDocument()
  })

  it('onRequestDelete 提供时渲染删除按钮', () => {
    const onDelete = vi.fn()
    render(<ArticleRow {...base} onOpen={() => {}} onRequestDelete={onDelete} />)
    fireEvent.click(screen.getByTestId('article-row-delete'))
    expect(onDelete).toHaveBeenCalledOnce()
  })

  it('双主题 class 不报错', () => {
    const { unmount } = render(<ArticleRow {...base} theme="newspaper" onOpen={() => {}} />)
    unmount()
    render(<ArticleRow {...base} theme="academic" onOpen={() => {}} />)
    expect(screen.getByTestId('article-row')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run tests/article-row.test.tsx`
Expected: FAIL（组件不存在）

- [ ] **Step 3: 实现 ArticleRow + 改造 AnthropicArticleRow**

`src/components/article/ArticleRow.tsx`（样式从 `AnthropicArticleRow` 逐字提取卡片视觉部分；只导出组件）：

```tsx
import { memo } from 'react'
import type { BriefingTheme } from '@shared/index'

interface Props {
  title: string
  summary: string | null
  dateText: string
  sourceName?: string | null
  isNew?: boolean
  theme?: BriefingTheme
  testId?: string
  onOpen: () => void
  onRequestDelete?: () => void
}

export const ArticleRow = memo(function ArticleRow({
  title, summary, dateText, sourceName, isNew, theme = 'academic', testId = 'article-row', onOpen, onRequestDelete,
}: Props) {
  const isAcademic = theme !== 'newspaper'
  const card = isAcademic
    ? 'border-parchment/15 bg-parchment/5 hover:bg-parchment/10'
    : 'border-[#c9c3b8] bg-white hover:bg-[#faf8f5]'
  const titleCls = isAcademic ? 'text-parchment' : 'text-[#1a1a1a]'
  const muted = isAcademic ? 'text-parchment/50' : 'text-[#6b5d52]'

  return (
    <div
      data-testid={testId}
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => { if (e.key === 'Enter') onOpen() }}
      className={`relative rounded-lg border p-3 cursor-pointer transition-colors ${card} ${isNew ? 'border-l-2 border-l-ember' : ''}`}
    >
      {isNew && (
        <span data-testid="article-row-new-badge" className="absolute top-2 right-2 min-w-[18px] px-1 py-0.5 rounded-full text-[10px] text-center bg-ember text-white">新</span>
      )}
      <p className={`text-sm font-serif leading-snug pr-6 ${titleCls}`}>{title}</p>
      {summary && <p className={`mt-1 text-xs line-clamp-2 ${muted}`}>{summary}</p>}
      <p className={`mt-1.5 text-[10px] ${muted}`}>{sourceName ? `${sourceName} · ` : ''}{dateText}</p>
      {onRequestDelete && (
        <button
          type="button"
          data-testid="article-row-delete"
          aria-label="删除文章"
          onClick={(e) => { e.stopPropagation(); onRequestDelete() }}
          className={`absolute bottom-2 right-2 text-xs opacity-0 group-hover:opacity-100 hover:text-wine ${muted}`}
        >🗑</button>
      )}
    </div>
  )
})
```

`AnthropicArticleRow.tsx` 改造：保留文件名与导出（不动其测试），卡片视觉部分替换为 `ArticleRow` 的 class 组合——**若发现 Anthropic 行有导入中 spinner、图片缩略等 ArticleRow 未覆盖的状态，保持 AnthropicArticleRow 原样不拆，仅让拾贝使用新 ArticleRow**（通用化以不回归 Anthropic 为先，测试 `tests/anthropic-article-row.test.tsx` 必须原样通过）。删除按钮的 `group-hover` 需要父级 `group` class，酌情在卡片根加 `group`。

- [ ] **Step 4: 跑测试确认通过**

Run: `npx vitest run tests/article-row.test.tsx tests/anthropic-article-row.test.tsx`
Expected: 全部 PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/article/ArticleRow.tsx src/components/anthropic/AnthropicArticleRow.tsx tests/article-row.test.tsx
git commit -m "feat: extract generic ArticleRow component"
```

---

### Task 11: Reader 支持 web-article + ReportHeader 徽标

**Files:**
- Modify: `src/components/anthropic/AnthropicArticleReader.tsx`（按 frontmatter type 条件渲染通用头）
- Modify: `src/components/md/ReportHeader.tsx`（TYPE_LABELS / TYPE_BADGE_STYLES）
- Test: `tests/anthropic-reader-theme.test.tsx`（保持通过）、`tests/web-article-reader.test.tsx`（新建）

- [ ] **Step 1: 写失败测试**

`tests/web-article-reader.test.tsx`（mock 方式参照 `tests/anthropic-reader-theme.test.tsx`，ipc.readMd 返回 web-article frontmatter）：

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'

vi.mock('@/lib/ipc', () => ({
  ipc: {
    readMd: vi.fn().mockResolvedValue({
      frontmatter: {
        title: 'The Second Half', type: 'web-article', source_url: 'https://ysymyth.github.io/The-Second-Half/',
        source_name: 'ysymyth.github.io', published_at: '2025-04-10T00:00:00.000Z', authors: ['Shunyu Yao'],
      },
      body: '# The Second Half\n\ntldr: halftime.',
    }),
    readAssetAsDataUrl: vi.fn(),
  },
}))

import { AnthropicArticleReader } from '@/components/anthropic/AnthropicArticleReader'

describe('web-article reader', () => {
  beforeEach(() => {
    // store 默认值按现有 anthropic reader 测试的方式补齐
  })

  it('web-article 渲染通用头：标题/来源链接/日期', async () => {
    render(<AnthropicArticleReader filePath="/lib/拾贝/文章/2025-04/The Second Half.md" />)
    expect(await screen.findByText('The Second Half')).toBeInTheDocument()
    const link = screen.getByRole('link', { name: /ysymyth\.github\.io/ })
    expect(link).toHaveAttribute('href', 'https://ysymyth.github.io/The-Second-Half/')
    expect(link).toHaveAttribute('target', '_blank')
    expect(link).toHaveAttribute('rel', expect.stringContaining('noopener'))
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run tests/web-article-reader.test.tsx`
Expected: FAIL（当前按 anthropic 头渲染，无来源链接）

- [ ] **Step 3: 实现**

`AnthropicArticleReader.tsx`：找到渲染文章头部的位置（标题/作者/日期区），改为按 `frontmatter.type` 分支：

```tsx
{frontmatter.type === 'web-article' ? (
  <>
    <h1>{frontmatter.title}</h1>
    <p className={/* muted 样式 */}>
      {frontmatter.source_name && frontmatter.source_url && (
        <a href={frontmatter.source_url} target="_blank" rel="noopener noreferrer" className="underline hover:text-ember">
          {frontmatter.source_name}
        </a>
      )}
      {frontmatter.published_at && ` · ${formatDate(frontmatter.published_at)}`}
      {frontmatter.authors?.length ? ` · ${frontmatter.authors.join(', ')}` : ''}
    </p>
  </>
) : (
  /* 现有 anthropic 头部，原样保留 */
)}
```

组件名/文件名不改（避免动全部引用与测试）；行为已泛化。若执行中发现 reader 内有 anthropic 专属逻辑（如 `AnthropicErrorMessage`）干扰 web-article，同样用 type 分支隔离。

`ReportHeader.tsx`：

```ts
// TYPE_LABELS 加：
  'web-article': '拾贝文章',
// TYPE_BADGE_STYLES 加：
  'web-article': 'bg-ember/80 text-ink',
```

- [ ] **Step 4: 跑测试确认通过**

Run: `npx vitest run tests/web-article-reader.test.tsx tests/anthropic-reader-theme.test.tsx tests/anthropic-reader-images.test.tsx`
Expected: 全部 PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/anthropic/AnthropicArticleReader.tsx src/components/md/ReportHeader.tsx tests/web-article-reader.test.tsx
git commit -m "feat: support web-article in article reader and report header"
```

---

### Task 12: Scout 组件群（Panel / ListColumn / ConversationList / ChatView / CandidateCards）

**Files:**
- Create: `src/components/scout/ScoutPanel.tsx`
- Create: `src/components/scout/ScoutListColumn.tsx`
- Create: `src/components/scout/ScoutConversationList.tsx`
- Create: `src/components/scout/ScoutChatView.tsx`
- Create: `src/components/scout/ScoutCandidateCards.tsx`
- Test: `tests/scout-panel.test.tsx`

**实现总则**：双主题 class 表逐字复制 `AnthropicBlogPanel.tsx` 的 `themeClasses` memo（32-58 行）；第二列结构复制 `WritingListColumn.tsx` 的 tab 栏（134-152 行）；reader 区复用 Task 11 的 `AnthropicArticleReader` 与 `ArticleAssistantPanel`（`articleType="web-article"`）。每个文件只导出组件。

- [ ] **Step 1: 写失败测试**

`tests/scout-panel.test.tsx`（store mock 参照 `tests/anthropic-blog-panel.test.tsx`）：

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

const storeState: any = {
  scoutTab: 'chat',
  scoutConversations: [{ id: 'c1', title: '2026-08-02 15:04', createdAt: '', updatedAt: '', filePath: '' }],
  scoutActiveConversationId: null,
  scoutMessages: [],
  scoutStreaming: false,
  scoutArticles: [],
  scoutReaderFilePath: null,
  scoutReaderBody: null,
  scoutReaderTitle: null,
  setScoutTab: vi.fn(),
  initScout: vi.fn(),
  createScoutConversation: vi.fn(),
  selectScoutConversation: vi.fn(),
  renameScoutConversation: vi.fn(),
  deleteScoutConversation: vi.fn(),
  sendScoutMessage: vi.fn(),
  confirmScoutCandidates: vi.fn(),
  openScoutReader: vi.fn(),
  briefingFontSize: 'base',
}
vi.mock('@/store', () => ({ useStore: (sel: any) => sel(storeState) }))
vi.mock('@/lib/ipc', () => ({ ipc: {} }))

import { ScoutPanel } from '@/components/scout/ScoutPanel'

beforeEach(() => {
  storeState.scoutTab = 'chat'
  storeState.scoutMessages = []
  storeState.scoutReaderFilePath = null
})

describe('ScoutPanel', () => {
  it('聊天 Tab：显示对话列表与新建按钮', () => {
    render(<ScoutPanel />)
    expect(screen.getByTestId('scout-tab-chat')).toBeInTheDocument()
    expect(screen.getByTestId('scout-new-conversation')).toBeInTheDocument()
    expect(screen.getByText('2026-08-02 15:04')).toBeInTheDocument()
  })

  it('切到文章 Tab：显示文章列表', () => {
    storeState.scoutTab = 'articles'
    storeState.scoutArticles = [{ url: 'u', title: 'The Second Half', summary: 's', publishedAt: null, sourceName: 'a.com', filePath: '/a.md' }]
    render(<ScoutPanel />)
    expect(screen.getByTestId('scout-tab-articles')).toBeInTheDocument()
    expect(screen.getByText('The Second Half')).toBeInTheDocument()
  })

  it('新建对话按钮触发 createScoutConversation', () => {
    render(<ScoutPanel />)
    fireEvent.click(screen.getByTestId('scout-new-conversation'))
    expect(storeState.createScoutConversation).toHaveBeenCalled()
  })

  it('候选卡片：不可抓取灰显不可选，确认按钮发送选中', () => {
    storeState.scoutActiveConversationId = 'c1'
    storeState.scoutMessages = [{
      role: 'assistant', content: '候选如下',
      candidates: [
        { title: '可抓', url: 'https://ok', sourceName: 'ok', reason: 'r', fetchable: true },
        { title: '不可抓', url: 'https://no', sourceName: 'no', reason: 'r', fetchable: false, failReason: '站点拒绝访问' },
      ],
      candidatesResolved: false,
    }]
    render(<ScoutPanel />)
    const bad = screen.getByTestId('scout-candidate-1')
    expect(bad).toHaveAttribute('aria-disabled', 'true')
    expect(screen.getByText('站点拒绝访问')).toBeInTheDocument()
    fireEvent.click(screen.getByTestId('scout-candidate-0'))
    fireEvent.click(screen.getByTestId('scout-confirm-candidates'))
    expect(storeState.confirmScoutCandidates).toHaveBeenCalledWith(['https://ok'])
  })

  it('candidatesResolved 后卡片不再可交互', () => {
    storeState.scoutActiveConversationId = 'c1'
    storeState.scoutMessages = [{
      role: 'assistant', content: '候选如下',
      candidates: [{ title: 'A', url: 'https://a', sourceName: 'a', reason: 'r', fetchable: true }],
      candidatesResolved: true,
    }]
    render(<ScoutPanel />)
    expect(screen.queryByTestId('scout-confirm-candidates')).not.toBeInTheDocument()
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run tests/scout-panel.test.tsx`
Expected: FAIL（组件不存在）

- [ ] **Step 3: 实现组件**

`src/components/scout/ScoutPanel.tsx`（结构镜像 AnthropicBlogPanel；useEffect 里 `initScout()`）：

```tsx
import { useEffect, useMemo } from 'react'
import { useStore } from '@/store'
import { BriefingListColumn } from '@/components/BriefingListColumn'
import { AnthropicArticleReader } from '@/components/anthropic/AnthropicArticleReader'
import { ArticleAssistantPanel } from '@/components/article-assistant'
import { ScoutListColumn } from './ScoutListColumn'
import { ScoutChatView } from './ScoutChatView'
import type { BriefingTheme } from '@shared/index'

export function ScoutPanel({ theme = 'academic' }: { theme?: BriefingTheme }) {
  const initScout = useStore((s) => s.initScout)
  const scoutTab = useStore((s) => s.scoutTab)
  const readerFilePath = useStore((s) => s.scoutReaderFilePath)
  const readerBody = useStore((s) => s.scoutReaderBody)
  const readerTitle = useStore((s) => s.scoutReaderTitle)

  useEffect(() => { void initScout() }, [initScout])

  // themeClasses 从 AnthropicBlogPanel 逐字复制（此处省略，执行时复制 32-58 行）
  const isAcademic = theme !== 'newspaper'
  const muted = isAcademic ? 'text-parchment/50' : 'text-[#6b5d52]'

  return (
    <div data-testid="scout-panel" className="relative flex-1 flex min-w-0 overflow-hidden z-[5]">
      <BriefingListColumn collapsed={false} onToggle={() => {}} theme={theme} width={80} title="拾贝">
        <ScoutListColumn theme={theme} />
      </BriefingListColumn>

      <div className="flex-1 min-w-0 flex flex-col">
        {scoutTab === 'articles' && readerFilePath ? (
          <AnthropicArticleReader filePath={readerFilePath} theme={theme} />
        ) : scoutTab === 'chat' ? (
          <ScoutChatView theme={theme} />
        ) : (
          <div className={`flex-1 flex items-center justify-center text-sm ${muted}`}>
            从左侧列表选择一篇文章开始阅读
          </div>
        )}
      </div>

      {scoutTab === 'articles' && readerFilePath && readerBody && (
        <ArticleAssistantPanel
          articleType="web-article"
          parentPath={readerFilePath}
          articleTitle={readerTitle ?? undefined}
          articleContent={readerBody}
          autoGenerateGuide
          theme={theme}
        />
      )}
    </div>
  )
}
```

`src/components/scout/ScoutListColumn.tsx`（tab 栏复制 WritingListColumn 134-152 行结构）：

```tsx
import { useState } from 'react'
import { useStore } from '@/store'
import { ScoutConversationList } from './ScoutConversationList'
import { ArticleRow } from '@/components/article/ArticleRow'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import type { BriefingTheme, ScoutArticleMeta } from '@shared/index'

export function ScoutListColumn({ theme = 'academic' }: { theme?: BriefingTheme }) {
  const tab = useStore((s) => s.scoutTab)
  const setTab = useStore((s) => s.setScoutTab)
  const articles = useStore((s) => s.scoutArticles)
  const openScoutReader = useStore((s) => s.openScoutReader)
  const deleteScoutArticle = useStore((s) => s.deleteScoutArticle)
  const [pendingDelete, setPendingDelete] = useState<ScoutArticleMeta | null>(null)
  const isAcademic = theme !== 'newspaper'
  const borderCol = isAcademic ? 'border-parchment/15' : 'border-[#c9c3b8]'
  const tabIdle = isAcademic ? 'text-parchment/50 hover:text-parchment/70' : 'text-[#6b5d52]/70 hover:text-[#6b5d52]'

  return (
    <div className="flex flex-col h-full">
      <div className={`flex m-2 rounded-lg border ${borderCol} text-xs shrink-0 overflow-hidden`} role="tablist">
        {(['chat', 'articles'] as const).map((t) => (
          <button
            key={t}
            role="tab"
            aria-pressed={tab === t}
            data-testid={t === 'chat' ? 'scout-tab-chat' : 'scout-tab-articles'}
            onClick={() => void setTab(t)}
            className={`flex-1 py-1.5 transition-colors ${
              tab === t ? (isAcademic ? 'bg-ember/20 text-ember' : 'bg-[#1a1a1a] text-white') : tabIdle
            }`}
          >
            {t === 'chat' ? '💬 聊天' : '📄 文章'}
          </button>
        ))}
      </div>
      <div className="flex-1 overflow-y-auto">
        {tab === 'chat' ? (
          <ScoutConversationList theme={theme} />
        ) : (
          <div className="px-2 space-y-2 pb-2">
            {articles.length === 0 && (
              <p className={`text-center py-8 text-xs ${isAcademic ? 'text-parchment/40' : 'text-[#6b5d52]/60'}`}>
                还没有文章，去聊天 Tab 让拾贝帮你找
              </p>
            )}
            {articles.map((a) => (
              <ArticleRow
                key={a.url}
                title={a.title}
                summary={a.summary}
                dateText={a.publishedAt ? new Date(a.publishedAt).toLocaleDateString('zh-CN') : '未知日期'}
                sourceName={a.sourceName}
                theme={theme}
                testId={`scout-article-row`}
                onOpen={() => openScoutReader(a.filePath)}
                onRequestDelete={() => setPendingDelete(a)}
              />
            ))}
          </div>
        )}
      </div>
      <ConfirmDialog
        open={pendingDelete !== null}
        title="删除文章"
        icon="trash"
        confirmLabel="删除"
        confirmVariant="danger"
        onCancel={() => setPendingDelete(null)}
        onConfirm={() => {
          const target = pendingDelete
          setPendingDelete(null)
          if (target) void deleteScoutArticle(target.filePath)
        }}
      >
        <p>即将删除「{pendingDelete?.title}」，文章卡片将从列表移除。</p>
        <p className="mt-2">将同时删除该文章的旁注对话、标注与导读。</p>
      </ConfirmDialog>
    </div>
  )
}
```

`src/components/scout/ScoutConversationList.tsx`：

```tsx
import { useState } from 'react'
import { useStore } from '@/store'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import type { BriefingTheme, ScoutConversationMeta } from '@shared/index'

export function ScoutConversationList({ theme = 'academic' }: { theme?: BriefingTheme }) {
  const conversations = useStore((s) => s.scoutConversations)
  const activeId = useStore((s) => s.scoutActiveConversationId)
  const createConversation = useStore((s) => s.createScoutConversation)
  const selectConversation = useStore((s) => s.selectScoutConversation)
  const renameConversation = useStore((s) => s.renameScoutConversation)
  const deleteConversation = useStore((s) => s.deleteScoutConversation)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editValue, setEditValue] = useState('')
  const [pendingDelete, setPendingDelete] = useState<ScoutConversationMeta | null>(null)
  const isAcademic = theme !== 'newspaper'
  const item = (active: boolean) =>
    `group flex items-center gap-1 rounded px-2 py-1.5 text-xs cursor-pointer transition-colors ${
      active
        ? isAcademic ? 'bg-ember/15 text-parchment' : 'bg-[#1a1a1a]/10 text-[#1a1a1a]'
        : isAcademic ? 'text-parchment/60 hover:bg-parchment/5' : 'text-[#6b5d52] hover:bg-[#1a1a1a]/5'
    }`

  const submitRename = (id: string) => {
    const v = editValue.trim()
    setEditingId(null)
    if (v) void renameConversation(id, v)
  }

  return (
    <div className="flex flex-col h-full">
      <div className="p-2 shrink-0">
        <button
          type="button"
          data-testid="scout-new-conversation"
          onClick={() => void createConversation()}
          className={`text-xs ${isAcademic ? 'text-ember hover:text-ember/80' : 'text-[#8a3a3a] hover:text-[#6a2a2a]'}`}
        >＋ 新建对话</button>
      </div>
      <div className="flex-1 overflow-y-auto px-2 pb-2 space-y-0.5">
        {conversations.length === 0 && (
          <p className={`text-center py-8 text-xs ${isAcademic ? 'text-parchment/40' : 'text-[#6b5d52]/60'}`}>
            还没有对话，点上方新建
          </p>
        )}
        {conversations.map((c) => (
          <div
            key={c.id}
            data-testid={`scout-conversation-${c.id}`}
            className={item(c.id === activeId)}
            onClick={() => void selectConversation(c.id)}
          >
            {editingId === c.id ? (
              <input
                autoFocus
                data-testid="scout-conversation-rename-input"
                value={editValue}
                onChange={(e) => setEditValue(e.target.value)}
                onBlur={() => submitRename(c.id)}
                onKeyDown={(e) => { if (e.key === 'Enter') submitRename(c.id); if (e.key === 'Escape') setEditingId(null) }}
                onClick={(e) => e.stopPropagation()}
                className={`flex-1 min-w-0 bg-transparent border-b outline-none text-xs ${isAcademic ? 'border-ember/50 text-parchment' : 'border-[#1a1a1a]/50 text-[#1a1a1a]'}`}
              />
            ) : (
              <span
                className="flex-1 min-w-0 truncate"
                title="点击名称改名"
                onDoubleClick={() => { setEditingId(c.id); setEditValue(c.title) }}
              >{c.title}</span>
            )}
            <button
              type="button"
              data-testid={`scout-conversation-delete-${c.id}`}
              aria-label="删除对话"
              onClick={(e) => { e.stopPropagation(); setPendingDelete(c) }}
              className="opacity-0 group-hover:opacity-100 text-[10px] hover:text-wine shrink-0"
            >✕</button>
          </div>
        ))}
      </div>
      <ConfirmDialog
        open={pendingDelete !== null}
        title="删除对话"
        icon="trash"
        confirmLabel="删除"
        confirmVariant="danger"
        onCancel={() => setPendingDelete(null)}
        onConfirm={() => {
          const target = pendingDelete
          setPendingDelete(null)
          if (target) void deleteConversation(target.id)
        }}
      >
        <p>即将删除对话「{pendingDelete?.title}」。</p>
        <p className="mt-2">已抓取入库的文章不受影响。</p>
      </ConfirmDialog>
    </div>
  )
}
```

`src/components/scout/ScoutChatView.tsx`：

```tsx
import { useEffect, useRef, useState } from 'react'
import { useStore } from '@/store'
import { ScoutCandidateCards } from './ScoutCandidateCards'
import type { BriefingTheme } from '@shared/index'

export function ScoutChatView({ theme = 'academic' }: { theme?: BriefingTheme }) {
  const activeId = useStore((s) => s.scoutActiveConversationId)
  const messages = useStore((s) => s.scoutMessages)
  const streaming = useStore((s) => s.scoutStreaming)
  const sendMessage = useStore((s) => s.sendScoutMessage)
  const abort = useStore((s) => s.abortScout)
  const [input, setInput] = useState('')
  const scrollRef = useRef<HTMLDivElement>(null)
  const isAcademic = theme !== 'newspaper'
  const muted = isAcademic ? 'text-parchment/50' : 'text-[#6b5d52]'

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight })
  }, [messages])

  if (!activeId) {
    return (
      <div data-testid="scout-chat-empty" className={`flex-1 flex flex-col items-center justify-center gap-2 text-sm ${muted}`}>
        <p>从左侧选择一个对话，或新建对话开始</p>
        <p className="text-xs opacity-70">给拾贝一个研究主题，或者直接丢一个文章链接</p>
      </div>
    )
  }

  const submit = () => {
    const v = input.trim()
    if (!v || streaming) return
    setInput('')
    void sendMessage(v)
  }

  return (
    <div data-testid="scout-chat-view" className="flex-1 flex flex-col min-h-0">
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-3">
        {messages.map((m, i) => (
          <div key={i}>
            <div
              data-testid={`scout-message-${m.role}`}
              className={`max-w-[80%] rounded-lg px-3 py-2 text-sm whitespace-pre-wrap ${
                m.role === 'user'
                  ? isAcademic ? 'ml-auto bg-ember/15 text-parchment' : 'ml-auto bg-[#1a1a1a]/10 text-[#1a1a1a]'
                  : isAcademic ? 'bg-parchment/8 text-parchment/90' : 'bg-white text-[#1a1a1a] border border-[#c9c3b8]'
              }`}
            >{m.content}</div>
            {m.role === 'assistant' && m.candidates && (
              <ScoutCandidateCards message={m} theme={theme} />
            )}
          </div>
        ))}
        {streaming && <div className={`text-xs animate-pulse ${muted}`}>拾贝工作中…</div>}
      </div>
      <div className={`p-3 border-t flex gap-2 shrink-0 ${isAcademic ? 'border-parchment/15' : 'border-[#c9c3b8]'}`}>
        <textarea
          data-testid="scout-chat-input"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit() } }}
          placeholder="给拾贝一个主题，或丢一个链接…"
          rows={2}
          className={`flex-1 resize-none rounded border px-3 py-2 text-sm outline-none ${
            isAcademic
              ? 'bg-parchment/10 border-slate/30 text-parchment placeholder:text-parchment/40 focus:border-ember/50'
              : 'bg-white border-[#c9c3b8] text-[#1a1a1a] placeholder:text-[#6b5d52]/60 focus:border-[#1a1a1a]/50'
          }`}
        />
        {streaming ? (
          <button type="button" data-testid="scout-chat-abort" onClick={() => void abort()}
            className={`self-end px-3 py-2 rounded text-sm ${isAcademic ? 'bg-wine/20 text-parchment hover:bg-wine/30' : 'bg-[#8a3a3a]/10 text-[#8a3a3a]'}`}>停止</button>
        ) : (
          <button type="button" data-testid="scout-chat-send" onClick={submit} disabled={!input.trim()}
            className={`self-end px-3 py-2 rounded text-sm disabled:opacity-30 ${isAcademic ? 'bg-ember/20 text-parchment hover:bg-ember/30' : 'bg-[#1a1a1a] text-white'}`}>发送</button>
        )}
      </div>
    </div>
  )
}
```

`src/components/scout/ScoutCandidateCards.tsx`：

```tsx
import { useState } from 'react'
import { useStore } from '@/store'
import type { BriefingTheme, ScoutMessage } from '@shared/index'

export function ScoutCandidateCards({ message, theme = 'academic' }: { message: ScoutMessage; theme?: BriefingTheme }) {
  const confirm = useStore((s) => s.confirmScoutCandidates)
  const streaming = useStore((s) => s.scoutStreaming)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const isAcademic = theme !== 'newspaper'
  const candidates = message.candidates ?? []

  const toggle = (url: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(url)) next.delete(url); else next.add(url)
      return next
    })
  }

  return (
    <div data-testid="scout-candidate-cards" className="mt-2 space-y-2 max-w-[80%]">
      {candidates.map((c, i) => {
        const disabled = c.fetchable === false
        return (
          <button
            key={c.url}
            type="button"
            data-testid={`scout-candidate-${i}`}
            aria-disabled={disabled}
            disabled={disabled || message.candidatesResolved || streaming}
            onClick={() => toggle(c.url)}
            className={`w-full text-left rounded-lg border p-3 transition-colors ${
              disabled
                ? 'opacity-50 cursor-not-allowed ' + (isAcademic ? 'border-parchment/10' : 'border-[#c9c3b8]')
                : selected.has(c.url)
                  ? 'border-ember ' + (isAcademic ? 'bg-ember/10' : 'bg-ember/5')
                  : isAcademic ? 'border-parchment/15 bg-parchment/5 hover:bg-parchment/10' : 'border-[#c9c3b8] bg-white hover:bg-[#faf8f5]'
            }`}
          >
            <p className={`text-sm font-serif ${isAcademic ? 'text-parchment' : 'text-[#1a1a1a]'}`}>
              {selected.has(c.url) && '✓ '}{c.title}
            </p>
            <p className={`text-[10px] mt-0.5 ${isAcademic ? 'text-parchment/40' : 'text-[#6b5d52]/70'}`}>{c.sourceName}</p>
            <p className={`text-xs mt-1 ${isAcademic ? 'text-parchment/60' : 'text-[#6b5d52]'}`}>
              {disabled ? `⚠ ${c.failReason ?? '无法抓取'}` : c.reason}
            </p>
          </button>
        )
      })}
      {!message.candidatesResolved && (
        <div className="flex gap-2">
          <button
            type="button"
            data-testid="scout-confirm-candidates"
            disabled={selected.size === 0 || streaming}
            onClick={() => void confirm(Array.from(selected))}
            className={`px-3 py-1.5 rounded text-xs disabled:opacity-30 ${isAcademic ? 'bg-ember/20 text-parchment hover:bg-ember/30' : 'bg-[#1a1a1a] text-white'}`}
          >抓取选中（{selected.size}）</button>
          <button
            type="button"
            data-testid="scout-confirm-all-candidates"
            disabled={streaming}
            onClick={() => void confirm(candidates.filter((c) => c.fetchable !== false).map((c) => c.url))}
            className={`px-3 py-1.5 rounded text-xs ${isAcademic ? 'text-parchment/60 hover:text-parchment' : 'text-[#6b5d52] hover:text-[#1a1a1a]'}`}
          >全部抓取</button>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `npx vitest run tests/scout-panel.test.tsx`
Expected: PASS（5 个用例）

- [ ] **Step 5: Commit**

```bash
git add src/components/scout/ tests/scout-panel.test.tsx
git commit -m "feat: add scout panel components (tabs/conversations/chat/candidates)"
```

---

### Task 13: Sidebar 入口 + Briefing 分支 + 页面级元素覆盖

**Files:**
- Modify: `src/components/BriefingSourceSidebar.tsx`（nav item）
- Modify: `src/pages/Briefing.tsx`（渲染分支）
- Modify: `src/store/index.ts`（`briefingSource` 恢复逻辑约 520 行，加 `'scout'`）
- Test: `tests/briefing-sidebar.test.tsx`（追加）、`tests/scout-entry.test.tsx`（新建）

- [ ] **Step 1: 写失败测试**

`tests/scout-entry.test.tsx`：

```tsx
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

// 入口契约测试：拾贝必须出现在 sidebar 与 Briefing 分支（feature-development §12：UI 出口）
describe('scout 入口契约', () => {
  it('BriefingSourceSidebar 包含拾贝 nav item 与 testid', () => {
    const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'components', 'BriefingSourceSidebar.tsx'), 'utf8')
    expect(src).toContain("'scout'")
    expect(src).toContain('拾贝')
    expect(src).toContain('briefing-source-scout')
  })

  it('Briefing.tsx 渲染 scout 分支', () => {
    const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'pages', 'Briefing.tsx'), 'utf8')
    expect(src).toContain("source === 'scout'")
    expect(src).toContain('ScoutPanel')
  })

  it('store briefingSource 恢复逻辑包含 scout', () => {
    const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'store', 'index.ts'), 'utf8')
    expect(src).toMatch(/briefingSource === 'scout'/)
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run tests/scout-entry.test.tsx`
Expected: FAIL

- [ ] **Step 3: 实现**

`BriefingSourceSidebar.tsx`：navItems 数组（`job-briefing` 之后）加：

```tsx
function ScoutIcon() {
  return (
    <svg data-testid="briefing-source-icon-scout" width="20" height="20" viewBox="0 0 24 24"
      fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3c-4 3-7 4-7 9a7 7 0 0 0 14 0c0-5-3-6-7-9z" />
      <path d="M12 3v18" />
    </svg>
  )
}
// navItems 追加：
    {
      id: 'scout',
      label: '拾贝',
      icon: ScoutIcon,
      testId: 'briefing-source-scout',
    },
```

（若 `setSource(item.id)` 的类型收窄报错，同步该文件内 nav item id 的联合类型。）

`Briefing.tsx`：
- import：`import { ScoutPanel } from '@/components/scout/ScoutPanel'`
- 主区渲染分支（`source === 'anthropic' ? <AnthropicBlogPanel/>` 旁）加：

```tsx
            ) : source === 'scout' ? (
              <ScoutPanel theme={theme} />
```

- 检查页面级元素（ui-styling §9 checklist）：背景插画层、换画按钮、字号控制、Drawer、烛光对 `source === 'scout'` 均生效——这些若为全局挂载则无需改动；若有 `source === 'digest'` 排他条件且拾贝需要该元素，补上 scout。逐个 grep `source === '` 确认。

`src/store/index.ts` 约 520 行恢复逻辑：

```ts
      briefingSource: state.briefingSource === 'anthropic' || state.briefingSource === 'job-briefing' || state.briefingSource === 'writing' || state.briefingSource === 'scout' ? state.briefingSource : 'digest',
```

- [ ] **Step 4: 跑测试确认通过**

Run: `npx vitest run tests/scout-entry.test.tsx tests/briefing-sidebar.test.tsx`
Expected: PASS；`npx tsc --noEmit` 通过

- [ ] **Step 5: Commit**

```bash
git add src/components/BriefingSourceSidebar.tsx src/pages/Briefing.tsx src/store/index.ts tests/scout-entry.test.tsx
git commit -m "feat: add scout source entry in sidebar and briefing page"
```

---

### Task 14: E2E spec + source-map group

**Files:**
- Create: `e2e/specs/scout-source.spec.ts`
- Modify: `e2e/source-map.json`（新 group）
- Modify: `e2e/README.md`（目录清单加一行）
- Modify: `e2e/helpers/test-library.ts`（若 BASE_STATE 需补 scout 字段，按 e2e §6 同步）

- [ ] **Step 1: 写 spec**

`e2e/specs/scout-source.spec.ts`（fixture/POM 参照 `e2e/specs/anthropic-blog*.spec.ts` 与 `e2e/helpers/`；走 Task 8 的 E2E mock 分支，无需网络）：

```ts
import { test, expect } from '../fixtures/electron'

test.describe('拾贝来源', () => {
  test('sidebar 出现拾贝入口，点击进入', async ({ page }) => {
    // 导航到简报页（参照 briefing-source-switching.spec.ts 的导航方式）
    await expect(page.getByTestId('briefing-source-scout')).toBeVisible()
    await page.getByTestId('briefing-source-scout').click()
    await expect(page.getByTestId('scout-panel')).toBeVisible()
    await expect(page.getByTestId('scout-tab-chat')).toBeVisible()
    await expect(page.getByTestId('scout-tab-articles')).toBeVisible()
  })

  test('新建对话 → 发消息 → 候选卡片 → 确认抓取 → 文章入列', async ({ page }) => {
    await page.getByTestId('briefing-source-scout').click()
    await page.getByTestId('scout-new-conversation').click()
    await page.getByTestId('scout-chat-input').fill('帮我找 AI agent 的一手长文')
    await page.getByTestId('scout-chat-send').click()
    // E2E mock 返回两个可抓取候选
    await expect(page.getByTestId('scout-candidate-0')).toBeVisible()
    await expect(page.getByTestId('scout-candidate-1')).toBeVisible()
    await page.getByTestId('scout-confirm-all-candidates').click()
    // 确认消息出现在聊天记录
    await expect(page.getByText(/抓取以下候选/)).toBeVisible()
    // 切文章 Tab，两篇 mock 文章在列
    await page.getByTestId('scout-tab-articles').click()
    await expect(page.getByText('ReAct 原文')).toBeVisible()
    await expect(page.getByText('The Second Half')).toBeVisible()
  })

  test('打开文章：reader + 旁注助手出现', async ({ page }) => {
    // 依赖上一个用例的库 seed（或在本用例内重走抓取流程）
    await page.getByTestId('briefing-source-scout').click()
    await page.getByTestId('scout-new-conversation').click()
    await page.getByTestId('scout-chat-input').fill('找文章')
    await page.getByTestId('scout-chat-send').click()
    await page.getByTestId('scout-confirm-all-candidates').click()
    await page.getByTestId('scout-tab-articles').click()
    await page.getByText('ReAct 原文').click()
    // reader 打开后出现旁注面板（ArticleAssistantPanel 的 tab）
    await expect(page.getByTestId('article-assistant-tab')).toBeVisible()
  })

  test('跨重启持久化：对话与文章保留', async ({ page, app }) => {
    await page.getByTestId('briefing-source-scout').click()
    await page.getByTestId('scout-new-conversation').click()
    await page.getByTestId('scout-chat-input').fill('找文章')
    await page.getByTestId('scout-chat-send').click()
    await expect(page.getByTestId('scout-candidate-0')).toBeVisible()
    // 重启（参照现有跨重启 spec 的写法）
    await app.close()
    const { page: page2 } = await test.info().project.use as any // 按现有重启 spec 模式重拉
    // ——执行时按 e2e/specs 中已有的「重启」用例（如 reload 持久化）复制其 fixture 用法——
  })
})
```

**执行注意**：上面的 spec 是骨架。执行 subagent 必须先读 `e2e/specs/anthropic-blog-image.spec.ts`（或任意现有 spec）与 `e2e/helpers/` 的 fixture/POM，把导航、重启、seed 写法替换为项目真实模式（e2e §7 POM 封装、§9 seed 后刷新）。第 4 个用例按现有跨重启 spec 的真实 fixture 重写，不留伪代码。所有选择器进 `e2e/helpers/selectors.ts` 的 SELECTORS 常量（e2e §5）。

- [ ] **Step 2: 更新 source-map.json**

`groups` 加：

```json
    "scout": {
      "sources": [
        "src/components/scout/**",
        "src/components/article/**",
        "electron/lib/scout/**",
        "electron/ipc/scout.ts"
      ],
      "specs": [
        "scout-*.spec.ts"
      ]
    },
```

`e2e/README.md` 目录清单加一行 scout spec 说明。

- [ ] **Step 3: 跑 E2E**

Run: `npx playwright test --config e2e/playwright.config.ts scout-source`
Expected: 4 个用例全 PASS（走 E2E mock 分支）

- [ ] **Step 4: Commit**

```bash
git add e2e/specs/scout-source.spec.ts e2e/source-map.json e2e/README.md e2e/helpers/
git commit -m "test: add scout source e2e spec and source-map group"
```

---

### Task 15: 真实 API 回归脚本 + 收尾验证

**Files:**
- Create: `scripts/test-scout-fetch.js`

- [ ] **Step 1: 写脚本**

`scripts/test-scout-fetch.js`（蓝本：`scripts/test-real-apis.js` 的手动真实 API 模式；读项目根 `.env` 的 TAVILY_API_KEY）：

```js
// 真实 API 回归：三级抓取管线 smoke（手动运行，不进 CI 默认链路）
// 用法：node scripts/test-scout-fetch.js [url]
require('dotenv').config()
const path = require('path')

async function main() {
  const url = process.argv[2] || 'https://ysymyth.github.io/The-Second-Half/'
  const { fetchArticle, makeTavilyExtract, plainFetch, scraperFetch } = await import(
    path.join(__dirname, '..', 'electron', 'lib', 'scout', 'article-fetcher.ts')
  ).catch(() => {
    // electron-vite 未编译 ts 时的降级：用 tsx/esbuild-register
    console.error('请用 npx tsx scripts/test-scout-fetch.js 运行')
    process.exit(1)
  })
  const r = await fetchArticle({
    url,
    deps: {
      tavilyExtract: makeTavilyExtract(process.env.TAVILY_API_KEY ?? ''),
      plainFetch,
      scraperFetch,
    },
  })
  console.log(`tier=${r.tier} title=${r.title} len=${r.markdown.length}`)
  console.log(r.summary)
}
main().catch((e) => { console.error(e); process.exit(1) })
```

（若 ts 直接 import 不可行，参照 `scripts/test-real-apis.js` 现有的 ts 加载方式对齐。）

- [ ] **Step 2: 运行脚本验证**

Run: `npx tsx scripts/test-scout-fetch.js`
Expected: 输出 `tier=1 title=The Second Half len>10000`

- [ ] **Step 3: 收尾验证（定向，不跑全量）**

```bash
npx vitest run tests/scout-contracts.test.ts tests/scout-fetcher.test.ts tests/scout-article-store.test.ts tests/scout-conversation-store.test.ts tests/scout-tool-protocol.test.ts tests/scout-tools.test.ts tests/scout-loop.test.ts tests/scout-ipc.test.ts tests/scout-store.test.ts tests/article-row.test.tsx tests/web-article-reader.test.tsx tests/scout-panel.test.tsx tests/scout-entry.test.tsx tests/frontmatter.test.ts tests/briefing-sidebar.test.tsx tests/anthropic-article-row.test.tsx tests/anthropic-reader-theme.test.tsx
npx tsc --noEmit
node scripts/e2e-changed.js --run
```

Expected: 全部 PASS

- [ ] **Step 4: Commit**

```bash
git add scripts/test-scout-fetch.js
git commit -m "test: add scout real-api fetch regression script"
```

---

## Self-Review 记录

- **Spec 覆盖**：交互模式(§T5-T8)、命名入口(§T13)、布局组件(§T10-T12)、Agent 协议与候选确认(§T5-T7)、候选预检(§T6)、存储与点亮灯火排除(§T1/T3/T4)、错误码(§T2 分级/T8 透传)、测试策略(各任务 + T14/T15)、验收清单 → 均有对应任务。
- **类型一致性**：`ScoutCandidate/ScoutMessage/ScoutConversation(Meta)/ScoutArticleMeta/ScoutToolEvent`（T1 定义）在 T6/T8/T9/T12 引用一致；`fetchArticle/FetchedArticle/FetchDeps`（T2）→ T6/T8/T15 一致；`saveArticle/listArticles/deleteArticle/findSavedByUrl/SCOUT_DIR`（T3）→ T4/T6/T8 一致；`plainFetch/scraperFetch` 具名导出的调整已在 T8 注明回改 T2。
- **已知留白（执行时按参照文件对齐，非占位）**：T8 E2E mock fixture 文章写入依赖 E2E_CONFIG_DIR 隔离（沿用现有模式）；T12 themeClasses 从 AnthropicBlogPanel 复制；T14 spec 骨架需按真实 POM 重写（步骤内已说明）。
