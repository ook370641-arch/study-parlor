# 博客五来源完整序列 + All 过滤器交互 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 博客源扩展为五来源完整序列（Engineering 25 / Research 144 / Alignment 54 / Interpretability 51 / Product 204），过滤器改为 All + 多选交互，修复导读卡死无终态问题。

**Architecture:** 来源配置升级为适配器（发现策略 sitemap/static-list/rss + 正文选择器）；主进程 HTTP 统一走 Electron `net.fetch`（Chromium 栈跟随系统代理）；sitemap 全量 URL + 索引页富元数据 + 老文章元数据后台回填（持久化缓存）；过滤器状态机为纯函数 lib。

**Tech Stack:** Electron 30 + React 18 + TypeScript + Zustand + Tailwind + Vitest + Playwright

**Spec:** `docs/superpowers/specs/2026-08-08-blog-multi-source-design.md`（已批准）

## Global Constraints

- 验证只跑受影响测试（`npx vitest run tests/<file>` 单文件、`node scripts/e2e-changed.js --run`），禁止全量（`.claude/rules/general.md` §9）。
- 五层同步顺序：types → IPC handler → preload → facade(`src/lib/ipc.ts`) → store → 组件/测试（`.claude/rules/ipc-state.md` §1）。
- 主/渲染进程不能互 import，共享配置双副本（`electron/lib/anthropic-sections.ts` 与 `src/lib/anthropic-sections.ts`），先例见 `GUIDE_FORMAT_VERSION`。
- 组件文件只导出组件；helper/常量/类型放 `src/lib/`（`.claude/rules/ui-styling.md` §10）。
- 新持久化字段必须带缺省值，旧 state.json 平滑过渡（ipc-state §3）。
- 外部数据每条记录视为可能缺字段，无效记录跳过不抛（general §1）。
- 已抓取的真实页面 fixture 在 `tests/fixtures/blog-sources/`（已落盘，见 Task 2），契约测试直接读文件，不依赖网络。
- 五源色签：engineering `#d97757` / research `#6b8fa3` / alignment `#b08d57` / interpretability `#7d6b9e` / product `#c2613e`；institute（遗留）`#8a9a5b`。

## 已验证的站点事实（写解析器的依据）

- 主站文章页：og:title 必有（属性顺序可能 content 在前）；无 `article:published_time`/`<time>`/JSON-LD 日期；**RSC payload 有 `\"publishedOn\":\"2025-04-24T10:59:00.000Z\"`**（转义形式）；正文有可见日期文本 "Apr 24, 2025"。
- sitemap 含跨栏目 307 重定向（`/research/building-effective-agents` → `/engineering/...`）→ 按最终 URL 去重。
- alignment/circuits 文章页是 **Distill 模板**：正文容器 `<d-article>`，标题 `<d-title><h1>`，无 `<article>`/`<main>`/`#quarto-content`。
- alignment 首页卡片：`<div class="date">July 2026</div>` 后跟一个或多个 `<a href="2026/slug/" class="note"><h3>标题</h3><div class="description">…</div></a>`（date 头对后续连续卡片生效，直到下一个 date 头）。**全页 58 张卡片 = 54 内链 + 4 外链**（arxiv/drive/2×anthropic.com/research）——外链不是本博客文章，解析时排除，契约 54。
- circuits feed 是 Atom：`<entry><title>…</title><link href="…"/><updated>ISO</updated><summary>…</summary></entry>`；entry URL 以 `/index.html` 结尾。**55 条 entry 中 4 条 link 指向外站**（2×alignment 转发、github PySvelte、distill.pub）——非 circuits 本域文章，解析时排除，契约 51。
- claude.com 文章页有 `<main>` 和 og 标签（属性顺序不固定）；sitemap 含本地化前缀（/ja/de/fr/ko/it），英文文章 URL 匹配 `^https://claude\.com/blog/[^/]+$`。
- claude.com 直连超时，经系统代理（用户 VPN）可达 → 所有 HTTP 走 `net.fetch`。

## 文件地图

| 文件 | 职责 | 变更 |
|---|---|---|
| `src/types/index.ts` | 共享类型 | SectionKey 扩五值+`'institute'` 遗留；`AnthropicBlogCache` 加 `articleMetaCache` |
| `electron/lib/anthropic-sections.ts` | 来源配置（主进程副本） | 重写为 `AnthropicSource` + `ANTHROPIC_SOURCES`（五源）+ `sectionForUrl` host 识别 |
| `src/lib/anthropic-sections.ts` | 来源配置（渲染副本） | 同步 + `filterGroupOf` 归组 |
| `electron/lib/net-fetch.ts` | 统一 HTTP 入口 | 新建 |
| `electron/lib/anthropic-discover.ts` | 三种发现策略纯解析器 + 元数据解析 + 并发池 | 新建 |
| `electron/lib/anthropic-scraper.ts` | discover 重写（分派/回填/去重）；import 选择器参数化 | 大改 |
| `electron/ipc/anthropic.ts` | backfill 进度事件推送；import 传 listingMeta | 修改 |
| `electron/preload.ts` | `onAnthropicBackfill` | 修改 |
| `src/lib/ipc.ts` | facade | 修改 |
| `src/lib/anthropic-runtime.ts` | 渲染侧 backfill 监听 | 新建 |
| `src/App.tsx` | 挂载 `initAnthropicRuntime()` | 修改 |
| `src/lib/section-filter.ts` | 过滤器状态机（纯函数） | 新建 |
| `src/components/anthropic/AnthropicBlogPanel.tsx` | All 按钮 + 状态机接入 + 归类 | 修改 |
| `electron/prompts/blog-guide-v2.md` | 输出契约强化 | 修改（按 Task 7 根因） |
| `electron/ipc/article-assistant.ts` | E2E bad-json 门控 | 修改 |
| `tests/fixtures/blog-sources/` | 真实页面 fixture | 已落盘（本计划准备阶段完成） |
| `e2e/source-map.json` | spec 归属 | 修改 |

---

## Task 1: 类型与五源配置

**Files:**
- Modify: `src/types/index.ts:48`（`AnthropicSectionKey`）、`:81-88`（`AnthropicBlogCache`）
- Modify: `electron/lib/anthropic-sections.ts`（整体重写）
- Modify: `src/lib/anthropic-sections.ts`（同步重写）
- Test: `tests/anthropic-sections.test.ts`

**Interfaces:**
- Produces（后续所有任务依赖）:
  - `type AnthropicSectionKey = 'engineering' | 'research' | 'alignment' | 'interpretability' | 'product' | 'institute'`（`'institute'` 仅遗留数据）
  - `interface AnthropicSource { key; label; color; discover: 'sitemap'|'static-list'|'rss'; indexUrl; sitemapUrl?; linkPrefix?; sitemapInclude?: RegExp; excludePrefixes?: string[]; contentSelectors?: string[] }`
  - `const ANTHROPIC_SOURCES: AnthropicSource[]`（五源，顺序即去重优先级）
  - `const LEGACY_SECTION_META: Record<string, { label: string; color: string }>`（仅 `institute` 一键）
  - `sectionForUrl(url: string): AnthropicSectionKey`
  - 渲染侧额外：`filterGroupOf(article: { local?: 'constitution'; url: string; section?: AnthropicSectionKey }): AnthropicSectionKey`
  - `AnthropicBlogCache.articleMetaCache?: Record<string, { title: string | null; publishedAt: string | null; summary: string | null; imageUrl: string | null }>`（key 为规范化 URL）

- [ ] **Step 1: 改类型**

`src/types/index.ts:48` 改为：

```ts
export type AnthropicSectionKey = 'engineering' | 'research' | 'alignment' | 'interpretability' | 'product' | 'institute'
```

`AnthropicBlogCache` 增加（带注释：旧 state.json 缺省 `{}`）：

```ts
  /** sitemap 老文章逐页回填的元数据缓存（key=规范化 URL）；旧 state.json 无此字段，缺省 {} */
  articleMetaCache?: Record<string, { title: string | null; publishedAt: string | null; summary: string | null; imageUrl: string | null }>
```

- [ ] **Step 2: 重写主进程配置 `electron/lib/anthropic-sections.ts`**

```ts
import type { AnthropicSectionKey } from '@shared/index'

// 与 src/lib/anthropic-sections.ts 渲染侧副本保持同步（进程隔离，不能互 import；
// 双副本先例见 electron/lib/guide-v2.ts 的 GUIDE_FORMAT_VERSION）。
export interface AnthropicSource {
  key: AnthropicSectionKey
  label: string
  color: string
  discover: 'sitemap' | 'static-list' | 'rss'
  /** sitemap 策略：索引页（富元数据来源）；static-list/rss 策略：列表页/feed URL */
  indexUrl: string
  sitemapUrl?: string
  /** sitemap URL 过滤：包含此前缀（主站用） */
  linkPrefix?: string
  /** sitemap URL 过滤：整 URL 正则（product 排除本地化前缀用） */
  sitemapInclude?: RegExp
  excludePrefixes?: string[]
  /** importArticle 正文容器选择器链（缺省用主站现有链） */
  contentSelectors?: string[]
}

export const ANTHROPIC_SOURCES: AnthropicSource[] = [
  {
    key: 'engineering', label: 'Engineering', color: '#d97757',
    discover: 'sitemap',
    indexUrl: 'https://www.anthropic.com/engineering',
    sitemapUrl: 'https://www.anthropic.com/sitemap.xml',
    linkPrefix: '/engineering/',
  },
  {
    key: 'research', label: 'Research', color: '#6b8fa3',
    discover: 'sitemap',
    indexUrl: 'https://www.anthropic.com/research',
    sitemapUrl: 'https://www.anthropic.com/sitemap.xml',
    linkPrefix: '/research/',
    excludePrefixes: ['/research/team/'],
  },
  {
    key: 'alignment', label: 'Alignment', color: '#b08d57',
    discover: 'static-list',
    indexUrl: 'https://alignment.anthropic.com/',
    contentSelectors: ['d-article'],
  },
  {
    key: 'interpretability', label: 'Interpretability', color: '#7d6b9e',
    discover: 'rss',
    indexUrl: 'https://transformer-circuits.pub/feed.xml',
    contentSelectors: ['d-article'],
  },
  {
    key: 'product', label: 'Product', color: '#c2613e',
    discover: 'sitemap',
    indexUrl: 'https://claude.com/blog',
    sitemapUrl: 'https://claude.com/sitemap.xml',
    sitemapInclude: /^https:\/\/claude\.com\/blog\/[^/]+$/,
    contentSelectors: ['main'],
  },
]

/** 遗留栏目（不再抓取，仅旧数据色签显示） */
export const LEGACY_SECTION_META: Record<string, { label: string; color: string }> = {
  institute: { label: 'Institute', color: '#8a9a5b' },
}

/** 从文章 URL 回推来源；无法识别时归 engineering（旧数据兜底） */
export function sectionForUrl(url: string): AnthropicSectionKey {
  if (url.includes('alignment.anthropic.com')) return 'alignment'
  if (url.includes('transformer-circuits.pub')) return 'interpretability'
  if (url.includes('claude.com/blog')) return 'product'
  if (url.includes('/institute/')) return 'institute'
  for (const s of ANTHROPIC_SOURCES) {
    if (s.linkPrefix && url.includes(s.linkPrefix)) return s.key
  }
  return 'engineering'
}
```

- [ ] **Step 3: 同步渲染副本 `src/lib/anthropic-sections.ts`**

同上内容（保留文件顶部"双副本"注释），另保留现有 `sectionOf`，并新增：

```ts
/** 过滤归组：constitution 算 engineering；institute（遗留）归入 research；其余按 sectionOf */
export function filterGroupOf(
  article: Pick<AnthropicArticleMeta, 'url'> & { local?: 'constitution'; section?: AnthropicSectionKey }
): AnthropicSectionKey {
  if (article.local === 'constitution') return 'engineering'
  const s = sectionOf(article)
  return s === 'institute' ? 'research' : s
}
```

- [ ] **Step 4: 更新引用与测试**

`grep -rn "ANTHROPIC_SECTIONS" src electron tests e2e` 找出全部引用，逐一改为 `ANTHROPIC_SOURCES`（含 `import type { AnthropicSection }` → `AnthropicSource`）。`tests/anthropic-sections.test.ts` 断言更新为五源；新增：

- `sectionForUrl('https://alignment.anthropic.com/2026/msm/') === 'alignment'`
- `sectionForUrl('https://transformer-circuits.pub/2026/workspace/index.html') === 'interpretability'`
- `sectionForUrl('https://claude.com/blog/1m-context') === 'product'`
- `sectionForUrl('https://www.anthropic.com/institute/recursive-self-improvement') === 'institute'`（遗留）
- `filterGroupOf({ local: 'constitution', url: 'x' }) === 'engineering'`
- `filterGroupOf({ url: 'https://www.anthropic.com/institute/x' }) === 'research'`

- [ ] **Step 5: 运行并提交**

```bash
npx tsc --noEmit
npx vitest run tests/anthropic-sections.test.ts tests/anthropic-sections-store.test.ts
git add -A && git commit -m "feat(blog): 五来源配置与类型扩展（含 institute 遗留值）"
```

---

## Task 2: 发现策略纯解析器 + fixture 契约测试

**Files:**
- Create: `electron/lib/anthropic-discover.ts`
- Test: `tests/anthropic-discover.test.ts`（新建）
- Fixture: `tests/fixtures/blog-sources/`（**已落盘**，本任务直接读取：anthropic-sitemap.xml / research-index.html / engineering-index.html / alignment-index.html / circuits-feed.xml / claude-sitemap.xml / claude-blog-index.html / alignment-article.html / circuits-article.html / research-article-old.html / claude-blog-article.html）

**Interfaces:**
- Consumes: `AnthropicSource`（Task 1）
- Produces（Task 4 依赖）:
  - `interface DiscoveredLink { url: string; title: string | null; summary: string | null; dateText: string | null; imageUrl: string | null }`
  - `parseSitemapUrls(xml: string, source: AnthropicSource): { url: string; lastmod: string | null }[]`
  - `parseAlignmentIndex(html: string, baseUrl: string): DiscoveredLink[]`
  - `parseAtomFeed(xml: string): DiscoveredLink[]`

- [ ] **Step 1: 写失败的契约测试 `tests/anthropic-discover.test.ts`**

```ts
import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { parseAlignmentIndex, parseAtomFeed, parseSitemapUrls } from '../electron/lib/anthropic-discover'
import { ANTHROPIC_SOURCES } from '../electron/lib/anthropic-sections'

const fx = (name: string) => fs.readFileSync(path.join(__dirname, 'fixtures/blog-sources', name), 'utf8')
const src = (key: string) => ANTHROPIC_SOURCES.find((s) => s.key === key)!

describe('parseSitemapUrls', () => {
  it('research: 144 篇，排除 team 页', () => {
    const urls = parseSitemapUrls(fx('anthropic-sitemap.xml'), src('research'))
    expect(urls.length).toBe(144)
    expect(urls.every((u) => !u.url.includes('/research/team/'))).toBe(true)
    expect(urls.every((u) => u.lastmod)).toBe(true)
  })
  it('engineering: 25 篇', () => {
    expect(parseSitemapUrls(fx('anthropic-sitemap.xml'), src('engineering')).length).toBe(25)
  })
  it('product: 204 篇英文，排除本地化前缀', () => {
    const urls = parseSitemapUrls(fx('claude-sitemap.xml'), src('product'))
    expect(urls.length).toBe(204)
    expect(urls.every((u) => /^https:\/\/claude\.com\/blog\/[^/]+$/.test(u.url))).toBe(true)
  })
})

describe('parseAlignmentIndex', () => {
  it('解析 54 篇内链文章（排除 4 条外部链接），标题/描述/月份齐全，date 头对连续卡片生效', () => {
    const links = parseAlignmentIndex(fx('alignment-index.html'), 'https://alignment.anthropic.com/')
    expect(links.length).toBe(54)
    for (const l of links) {
      expect(l.title).toBeTruthy()
      expect(l.dateText).toMatch(/\w+ \d{4}/)
      expect(l.url).toMatch(/^https:\/\/alignment\.anthropic\.com\/\d{4}\//)
    }
    // 外部链接（arxiv / drive / anthropic.com/research）不进入文章列表
    expect(links.every((l) => l.url.startsWith('https://alignment.anthropic.com/'))).toBe(true)
    // date 头后续卡片继承同一月份（July 2026 有两篇）
    const july = links.filter((l) => l.dateText === 'July 2026')
    expect(july.length).toBeGreaterThanOrEqual(2)
  })
})

describe('parseAtomFeed', () => {
  it('解析 51 条 circuits 内链 entry（排除 4 条转发外站 link），字段完整，保留 /index.html 结尾', () => {
    const links = parseAtomFeed(fx('circuits-feed.xml'))
    expect(links.length).toBe(51)
    for (const l of links) {
      expect(l.title).toBeTruthy()
      expect(l.url).toContain('transformer-circuits.pub')
      expect(l.dateText).toBeTruthy()
    }
  })
})
```

- [ ] **Step 2: 运行确认失败**

Run: `npx vitest run tests/anthropic-discover.test.ts`
Expected: FAIL（模块不存在）

- [ ] **Step 3: 实现 `electron/lib/anthropic-discover.ts`**

```ts
import type { AnthropicSource } from './anthropic-sections'

export interface DiscoveredLink {
  url: string
  title: string | null
  summary: string | null
  dateText: string | null
  imageUrl: string | null
}

/** sitemap <url> 条目按来源配置过滤；输出保持 sitemap 原顺序 */
export function parseSitemapUrls(xml: string, source: AnthropicSource): { url: string; lastmod: string | null }[] {
  const out: { url: string; lastmod: string | null }[] = []
  const seen = new Set<string>()
  for (const m of xml.matchAll(/<url>\s*<loc>([^<]+)<\/loc>(?:\s*<lastmod>([^<]*)<\/lastmod>)?[\s\S]*?<\/url>/g)) {
    const url = m[1]
    if (source.sitemapInclude && !source.sitemapInclude.test(url)) continue
    if (source.linkPrefix && !url.includes(source.linkPrefix)) continue
    if (source.excludePrefixes?.some((p) => url.includes(p))) continue
    if (seen.has(url)) continue
    seen.add(url)
    out.push({ url, lastmod: m[2] ?? null })
  }
  return out
}

/** alignment 首页：date 头对后续连续卡片生效，直到下一个 date 头；只收同源内链（外链 arxiv/drive/anthropic.research 不是本博客文章） */
export function parseAlignmentIndex(html: string, baseUrl: string): DiscoveredLink[] {
  const out: DiscoveredLink[] = []
  const tokenRe = /<div class="date">([^<]+)<\/div>|<a href="([^"]+)" class="note">\s*<h3>([\s\S]*?)<\/h3>\s*<div class="description">([\s\S]*?)<\/div>\s*<\/a>/g
  let currentDate: string | null = null
  for (const m of html.matchAll(tokenRe)) {
    if (m[1] !== undefined) { currentDate = m[1].trim(); continue }
    if (/^https?:\/\//.test(m[2])) continue // 外链卡片排除
    out.push({
      url: new URL(m[2], baseUrl).toString(),
      dateText: currentDate,
      title: m[3].replace(/<[^>]+>/g, '').trim() || null,
      summary: m[4].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim() || null,
      imageUrl: null,
    })
  }
  return out
}

function unescapeXml(s: string): string {
  return s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'")
}

/** Atom feed（transformer-circuits.pub/feed.xml）；entry URL 保留 /index.html 原样；只收 circuits 本域 link（feed 转发的外站 entry 非本博客文章） */
export function parseAtomFeed(xml: string): DiscoveredLink[] {
  const out: DiscoveredLink[] = []
  for (const m of xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g)) {
    const e = m[1]
    const url = e.match(/<link[^>]*href="([^"]+)"/)?.[1]
    if (!url || !url.includes('transformer-circuits.pub')) continue
    const title = e.match(/<title>([\s\S]*?)<\/title>/)?.[1]
    const updated = e.match(/<updated>([^<]+)<\/updated>/)?.[1]
    const summary = e.match(/<summary>([\s\S]*?)<\/summary>/)?.[1]
    out.push({
      url,
      title: title ? unescapeXml(title).trim() || null : null,
      dateText: updated ?? null,
      summary: summary ? unescapeXml(summary).replace(/\s+/g, ' ').trim() || null : null,
      imageUrl: null,
    })
  }
  return out
}
```

- [ ] **Step 4: 运行确认通过**

Run: `npx vitest run tests/anthropic-discover.test.ts`
Expected: PASS（若数量断言失败，以 fixture 实际为准核对解析器，不要改断言迁就 bug——数字 25/144/30/55/204 来自独立 sitemap/feed 实测）

- [ ] **Step 5: 提交**

```bash
git add electron/lib/anthropic-discover.ts tests/anthropic-discover.test.ts tests/fixtures/blog-sources
git commit -m "feat(blog): 三种发现策略纯解析器 + 真实页面 fixture 契约测试"
```

---

## Task 3: net.fetch 统一 + 文章元数据解析 + 并发池

**Files:**
- Create: `electron/lib/net-fetch.ts`
- Modify: `electron/lib/anthropic-discover.ts`（追加元数据解析与并发池）
- Test: `tests/anthropic-discover.test.ts`（追加）

**Interfaces:**
- Produces:
  - `httpFetch(url: string): Promise<Response>`（net-fetch.ts）
  - `interface ArticleMeta { canonicalUrl: string; title: string | null; summary: string | null; publishedAt: string | null; imageUrl: string | null }`
  - `type ArticleMetaCache = Record<string, { title: string | null; publishedAt: string | null; summary: string | null; imageUrl: string | null }>`
  - `parseArticleMetaHtml(html: string, finalUrl: string): ArticleMeta`
  - `mapWithConcurrency<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]>`

（`ArticleMetaCache` 类型定义在 `anthropic-discover.ts` 并 export，与 `src/types/index.ts` 的 `articleMetaCache` 字段结构一致——Task 4 的 discover 与 IPC 都用这个名字。）

- [ ] **Step 1: 新建 `electron/lib/net-fetch.ts`**

```ts
import { net } from 'electron'

/**
 * 主进程统一 HTTP 入口：走 Chromium 网络栈，自动跟随系统代理/VPN。
 * （node 原生 fetch 不走系统代理，claude.com 在直连下不可达。）
 * 单测用 vi.mock('../electron/lib/net-fetch') 替换。
 */
export function httpFetch(url: string): Promise<Response> {
  return net.fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } })
}
```

- [ ] **Step 2: 追加失败测试**

```ts
import { mapWithConcurrency, parseArticleMetaHtml } from '../electron/lib/anthropic-discover'

describe('parseArticleMetaHtml', () => {
  it('主站老文章：RSC publishedOn + og:title', () => {
    const meta = parseArticleMetaHtml(fx('research-article-old.html'), 'https://www.anthropic.com/research/exploring-model-welfare')
    expect(meta.title).toBe('Exploring model welfare')
    expect(meta.publishedAt).toBe('2025-04-24T10:59:00.000Z')
  })
  it('claude 文章：og 属性顺序不固定也能取到标题；JSON-LD datePublished', () => {
    const meta = parseArticleMetaHtml(fx('claude-blog-article.html'), 'https://claude.com/blog/1m-context')
    expect(meta.title).toContain('1M')
    expect(meta.publishedAt).toBeTruthy()
  })
  it('缺字段不抛：空 HTML 全 null', () => {
    const meta = parseArticleMetaHtml('<html></html>', 'https://x.com/a')
    expect(meta).toEqual({ canonicalUrl: 'https://x.com/a', title: null, summary: null, publishedAt: null, imageUrl: null })
  })
})

describe('mapWithConcurrency', () => {
  it('保持顺序且限制并发', async () => {
    let active = 0, peak = 0
    const items = Array.from({ length: 20 }, (_, i) => i)
    const rs = await mapWithConcurrency(items, 4, async (i) => {
      active++; peak = Math.max(peak, active)
      await new Promise((r) => setTimeout(r, 5))
      active--
      return i * 2
    })
    expect(rs).toEqual(items.map((i) => i * 2))
    expect(peak).toBeLessThanOrEqual(4)
  })
})
```

- [ ] **Step 3: 运行确认失败** → `npx vitest run tests/anthropic-discover.test.ts`（FAIL：导出不存在）

- [ ] **Step 4: 实现追加到 `electron/lib/anthropic-discover.ts`**

```ts
export interface ArticleMeta {
  canonicalUrl: string
  title: string | null
  summary: string | null
  publishedAt: string | null
  imageUrl: string | null
}

/** 从文章页 HTML 提取元数据。og meta 属性顺序不固定（content 可在前），两种顺序都匹配；
 *  日期链：RSC \"publishedOn\" → JSON-LD datePublished → 正文日期文本（调用方再补 sitemap lastmod 兜底） */
export function parseArticleMetaHtml(html: string, finalUrl: string): ArticleMeta {
  const meta = (prop: string): string | null =>
    html.match(new RegExp(`<meta[^>]*property="${prop}"[^>]*content="([^"]*)"`, 'i'))?.[1]
    ?? html.match(new RegExp(`<meta[^>]*content="([^"]*)"[^>]*property="${prop}"`, 'i'))?.[1]
    ?? null
  const h1 = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/)?.[1]?.replace(/<[^>]+>/g, '').trim()
  const publishedOn = html.match(/\\?"publishedOn\\?":\\?"([^"\\]+)/)?.[1]
  const ldDate = html.match(/"datePublished"\s*:\s*"([^"]+)"/)?.[1]
  const dateText = html.match(/\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{1,2},?\s+\d{4}\b/)?.[0]
  return {
    canonicalUrl: finalUrl,
    title: meta('og:title') ?? h1 ?? null,
    summary: meta('og:description'),
    publishedAt: publishedOn ?? ldDate ?? dateText ?? null,
    imageUrl: meta('og:image'),
  }
}

export async function mapWithConcurrency<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length)
  let next = 0
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const i = next++
        results[i] = await fn(items[i])
      }
    })
  )
  return results
}
```

- [ ] **Step 5: 运行通过并提交**

```bash
npx vitest run tests/anthropic-discover.test.ts
git add electron/lib/net-fetch.ts electron/lib/anthropic-discover.ts tests/anthropic-discover.test.ts
git commit -m "feat(blog): net.fetch 统一入口 + 文章元数据解析（RSC 日期/属性顺序容忍）+ 并发池"
```

---

## Task 4: discoverArticles 重写 + backfill 事件五层同步

**Files:**
- Modify: `electron/lib/anthropic-scraper.ts`（`discoverArticles` 重写；`buildListingScript` 保留不动）
- Modify: `electron/ipc/anthropic.ts`（接 backfill 回调推送事件；持久化 articleMetaCache）
- Modify: `src/types/index.ts`（`IpcApi` 加 `onAnthropicBackfill`）
- Modify: `electron/preload.ts`、`src/lib/ipc.ts`
- Create: `src/lib/anthropic-runtime.ts`；Modify: `src/App.tsx`、`src/store/index.ts`
- Test: `tests/anthropic.test.ts`（discover 用例改写）、`tests/anthropic-sections-store.test.ts`

**Interfaces:**
- Consumes: Task 1 配置、Task 2 解析器、Task 3 `httpFetch`/`parseArticleMetaHtml`/`mapWithConcurrency`、现有 `runScriptInScraperWindow`/`buildListingScript`（`anthropic-scraper.ts:114`）、现有 `parseDateString`/`toAbsoluteUrl`/`findSavedArticles`。
- Produces:
  - `discoverArticles(libraryRoot: string, opts?: { onBackfill?: (articles: AnthropicArticleMeta[], metaCache: ArticleMetaCache) => void }): Promise<{ lastFetchedAt; articles; sectionStatus }>`（主结果不含未命中回填的完整元数据；回填经 onBackfill 分批推送）
  - IPC 事件 `anthropic:backfill`，payload `{ articles: AnthropicArticleMeta[] }`
  - preload/facade: `onAnthropicBackfill(cb: (payload: { articles: AnthropicArticleMeta[] }) => void): () => void`
  - 渲染侧 `initAnthropicRuntime()`（幂等）

- [ ] **Step 1: 改写 discover 单测（先失败）**

`tests/anthropic.test.ts` 中 discover 用例改为 mock `net-fetch` 与 `anthropic-browser`：

```ts
vi.mock('../electron/lib/net-fetch', () => ({ httpFetch: vi.fn() }))
vi.mock('../electron/lib/anthropic-browser', () => ({ runScriptInScraperWindow: vi.fn(), cancelCurrentOperation: vi.fn() }))
```

用 fixture 构造 httpFetch 响应（按 URL 分派 sitemap/feed/alignment 首页），`runScriptInScraperWindow` 返回索引页卡片数组。断言：

- 五源合并返回，每源文章数 = fixture 数（25/144/30/55/204）
- research 无 team 页；每篇 `section` 正确
- 索引页覆盖不到的 sitemap URL 走 `articleMetaCache` 命中（预置缓存）→ 不触发回填
- 单源失败（让 claude sitemap reject）→ 其他四源正常返回，`sectionStatus.product.error` 非空
- 全部失败 → throw
- **索引页与缓存都未覆盖的 sitemap URL 不出现在初始结果**（无无标题裸行）；回填后 `onBackfill` 被调用，推送文章含解析出的 title/publishedAt；重定向 URL（mock 响应 `Response.url` 不同）按最终 URL 去重——canonical 与已发现文章相同则该篇不推送

- [ ] **Step 2: 运行确认失败**

Run: `npx vitest run tests/anthropic.test.ts`
Expected: FAIL

- [ ] **Step 3: 重写 `discoverArticles`**

骨架（保留现有 `findSavedArticles`、`buildListingScript`、`classifyError` 等不动）：

```ts
import { httpFetch } from './net-fetch'
import { mapWithConcurrency, parseAlignmentIndex, parseArticleMetaHtml, parseAtomFeed, parseSitemapUrls, type ArticleMeta } from './anthropic-discover'
import { ANTHROPIC_SOURCES, type AnthropicSource } from './anthropic-sections'
import type { ArticleMetaCache, DiscoveredLink } from './anthropic-discover'

type BackfillMiss = { source: AnthropicSource; url: string; lastmod: string | null }

async function discoverSitemapSource(
  section: AnthropicSource,
  metaCache: ArticleMetaCache,
  backfillMisses: BackfillMiss[]
): Promise<DiscoveredLink[]> {
  const xml = await (await httpFetch(section.sitemapUrl!)).text()
  const all = parseSitemapUrls(xml, section)
  // 索引页富元数据（现有 LISTING_SCRIPT 逻辑，隐藏窗）
  const cards = await runScriptInScraperWindow<{ url; title; summary; dateText; imageUrl }[]>(
    buildListingScript(section), { url: section.indexUrl, waitForSelector: `a[href^="${section.linkPrefix}"]` }
  ).catch(() => [] as { url; title; summary; dateText; imageUrl }[])
  const byUrl = new Map(cards.map((c) => [c.url, c]))
  const out: DiscoveredLink[] = []
  for (const { url, lastmod } of all) {
    const card = byUrl.get(url)
    if (card?.title) { out.push({ ...card, url }); continue }
    const cached = metaCache[url]
    if (cached?.title) { out.push({ url, title: cached.title, summary: cached.summary, dateText: cached.publishedAt, imageUrl: cached.imageUrl }); continue }
    backfillMisses.push({ source: section, url, lastmod })
    // 不入初始列表：无标题裸行违反「每篇都有标题」验收。
    // 回填拿到元数据后经 anthropic:backfill 事件入场，文章逐批「出现」在时间线。
  }
  return out
}
```

`discoverArticles` 主流程：按 `ANTHROPIC_SOURCES` 顺序逐源 try/catch 分派（sitemap/static-list/rss），失败记 `sectionStatus`；RSS/static-list 的 `dateText` 经 `parseDateString` 转 ISO；映射 `isSaved`/`filePath` 同现状。全失败 throw 沿用。**回填**（结果返回后继续）：

```ts
const results = await mapWithConcurrency(backfillMisses, 5, async (miss) => {
  try {
    const res = await httpFetch(miss.url)
    const meta = parseArticleMetaHtml(await res.text(), res.url || miss.url)
    meta.publishedAt = meta.publishedAt ?? (miss.lastmod ? parseDateString(miss.lastmod) : null)
    return { miss, meta }
  } catch { return null }
})
// 写 metaCache（miss.url 与 canonicalUrl 都写）；canonicalUrl 与已发现文章重复 → 丢弃该占位
// 每 10 篇调一次 opts.onBackfill(articles, metaCache)
```

注意：`discoverArticles` 需要读到现有 `articleMetaCache`——从 IPC 层传入（handler 读 `getCurrentState().anthropicBlogCache?.articleMetaCache ?? {}`），签名加第三参或 opts 内传 `metaCache`。

- [ ] **Step 4: IPC 接回填事件 + 持久化**

`electron/ipc/anthropic.ts` 的 `anthropic:discover` handler：`discoverArticles(cfg.libraryPath, { metaCache: prev?.articleMetaCache ?? {}, onBackfill: (articles, metaCache) => { send('anthropic:backfill', { articles }); patchState({ anthropicBlogCache: { ...当前cache, articleMetaCache: metaCache } }) } })`（send 助手仿照 article-assistant.ts 的 isDestroyed 守卫）。

- [ ] **Step 5: 五层同步（types → preload → facade → store → App）**

- `src/types/index.ts` `IpcApi` 加 `onAnthropicBackfill: (cb: (payload: { articles: AnthropicArticleMeta[] }) => void) => () => void`
- `electron/preload.ts`：`onAnthropicBackfill: (cb) => { const l = (_e, p) => cb(p); ipcRenderer.on('anthropic:backfill', l); return () => ipcRenderer.removeListener('anthropic:backfill', l) }`
- `src/lib/ipc.ts` facade 透传
- `src/lib/anthropic-runtime.ts`：

```ts
import { ipc } from '@/lib/ipc'
import { useStore } from '@/store'

let inited = false
export function initAnthropicRuntime() {
  if (inited) return
  inited = true
  ipc.onAnthropicBackfill(({ articles }) => {
    useStore.getState().mergeAnthropicArticles(articles)
  })
}
```

（先看 `mergeAnthropicArticles` 现有签名——panel 已在用；若不匹配就扩展它按 URL 覆盖合并。）
- `src/App.tsx` 在 `initScoutRuntime()` 旁加 `useEffect(() => { initAnthropicRuntime() }, [])`

- [ ] **Step 6: store 测试 + 运行**

`tests/anthropic-sections-store.test.ts` 加用例：backfill 合并按 URL 覆盖（占位文章获得 title/publishedAt）、`articleMetaCache` 缺省 `{}` 旧 state 兼容。

```bash
npx tsc --noEmit
npx vitest run tests/anthropic.test.ts tests/anthropic-sections-store.test.ts tests/anthropic-sections.test.ts
git add -A && git commit -m "feat(blog): discover 五源重写 + 元数据后台回填 + anthropic:backfill 事件"
```

---

## Task 5: importArticle 按源适配 + 去全量 discover 依赖

**Files:**
- Modify: `electron/lib/anthropic-scraper.ts`（`ARTICLE_SCRIPT` → `buildArticleScript(source)`；`extractArticle` waitForSelector 按源；图片 URL 域名修正；`importArticle` 签名）
- Modify: `electron/ipc/anthropic.ts`（import handler 传 listingMeta）
- Test: `tests/anthropic.test.ts`

**Interfaces:**
- Consumes: `ANTHROPIC_SOURCES`/`sectionForUrl`（Task 1）；`contentSelectors` 配置
- Produces: `importArticle(url: string, libraryRoot: string, listingMeta?: AnthropicArticleMeta | null): Promise<{ filePath: string; wasAlreadySaved: boolean }>`；`buildArticleScript(source: AnthropicSource): string`

**复审增补的三个 P0/P1 修正（2026-08-08 re-review 发现）：**

1. `extractArticle` 现有 `waitForSelector: 'main, article, [role="main"]'` 在 Distill 页（无 main/article）**必然超时**——按源参数化：`source.contentSelectors?.[0] ?? 'main, article, [role="main"]'`。
2. `ARTICLE_SCRIPT` 内图片 URL 拼接硬编码 `'https://www.anthropic.com'`——外站相对路径图片会拼错域名，改为 `new URL(src, window.location.href).toString()`；第二段 pageImages 脚本选择器 `article img, main img` 改为 `'d-article img, article img, main img'`（超集，主站兼容）。
3. turndown 对 Distill 自定义元素（`d-figure` 等）的转换效果未知——必须加真实 fixture 转换契约测试。

- [ ] **Step 1: 失败测试**

- `buildArticleScript(alignmentSrc)` 生成的脚本中 `d-article` 在选择器链最前；`buildArticleScript(productSrc)` 中 `main` 在最前
- 生成的脚本不含硬编码 `www.anthropic.com` 图片拼接（含 `window.location.href`）
- ARTICLE_SCRIPT 日期链增加 RSC `publishedOn` 提取一级（在现有 time/meta/JSON-LD 回退后再加：脚本在页面上下文执行，用 `document.documentElement.innerHTML.match(/\\?"publishedOn\\?":\\?"([^"\\]+)/)` 取原始 HTML 里的转义形式）
- `importArticle` 不再调用 `discoverArticles`：section 用 `sectionForUrl(url)`，listingMeta 由参数传入（缺省 null）
- **Distill 转换契约**：读 `tests/fixtures/blog-sources/circuits-article.html`，用正则/选择器取出 `<d-article>...</d-article>` 内容喂给 turndown（与生产同配置 `headingStyle: 'atx', codeBlockStyle: 'fenced'`），断言：markdown 非空、含 `#`/`##` 标题、正文段落数 > 5、无 `[object` 类残骸。alignment-article.html 同样断言。若 turndown 丢弃自定义元素内容，在 `buildArticleScript` 的 clone 阶段把 `d-figure`/`d-title` 等 `replaceWith` 为其 children（DOM 层面拍平），测试驱动该修复
- claude-blog-article.html 同法断言 `main` 容器转换

- [ ] **Step 2: 实现**

- `buildArticleScript(source)`：内容选择器链 = `[...(source.contentSelectors ?? []), 'article', 'main article', 'main > div', '[data-testid="article-body"]', '.prose', '.article-content', 'main']`（去重）；图片 URL 用 `new URL(src, window.location.href).toString()`；日期链加 `publishedOn` 级。
- `extractArticle(url, listingMeta, source)`：`waitForSelector: source.contentSelectors?.[0] ?? 'main, article, [role="main"]'`；pageImages 选择器 `'d-article img, article img, main img'`；`toAbsoluteUrl` 的主站硬编码同源修正（图片 map 绝对化用文章页 origin——把 `toAbsoluteUrl(img.url)` 改为基于 `new URL(url).origin` 的解析）。
- `source` 由 `sectionForUrl(url)` 查 `ANTHROPIC_SOURCES` 得到；institute 等遗留 URL 用默认链。
- 图片下载 `fetch` → `httpFetch`（`downloadImages` 内）。
- `importArticle(url, libraryRoot, listingMeta = null)`：删除 `await discoverArticles(libraryRoot)` 调用；`section = listingMeta?.section ?? sectionForUrl(url)`。
- `electron/ipc/anthropic.ts` import handler：`const listingMeta = getCurrentState().anthropicBlogCache?.articles.find((a) => a.url === url) ?? null` 传入。

- [ ] **Step 3: 运行并提交**

```bash
npx vitest run tests/anthropic.test.ts
git add -A && git commit -m "feat(blog): importArticle 按源适配（waitForSelector/正文容器/图片域名），去除全量 discover 依赖"
```

---

## Task 6: 过滤器状态机 + All 交互 UI

**Files:**
- Create: `src/lib/section-filter.ts`
- Modify: `src/components/anthropic/AnthropicBlogPanel.tsx:84-102`（状态）、`:290-317`（chips UI）、`:240-256`（失败提示条扩五源，逻辑本身不变）
- Test: `tests/section-filter.test.ts`（新建）、`tests/anthropic-blog-panel.test.tsx`

**Interfaces:**
- Consumes: `filterGroupOf`（Task 1 渲染副本）、`ANTHROPIC_SOURCES`
- Produces:
  - `type BlogFilter = { mode: 'all' } | { mode: 'pick'; selected: ReadonlySet<AnthropicSectionKey> }`
  - `clickAllChip(): BlogFilter`
  - `toggleSourceChip(filter: BlogFilter, key: AnthropicSectionKey, allKeys: readonly AnthropicSectionKey[]): BlogFilter`
  - `isSourceActive(filter: BlogFilter, key: AnthropicSectionKey): boolean`

- [ ] **Step 1: 状态机失败测试 `tests/section-filter.test.ts`**

```ts
import { describe, expect, it } from 'vitest'
import { clickAllChip, isSourceActive, toggleSourceChip, type BlogFilter } from '../src/lib/section-filter'

const ALL = ['engineering', 'research', 'alignment', 'interpretability', 'product'] as const

describe('blog filter state machine', () => {
  it('初始 All：全源可见', () => {
    const f: BlogFilter = { mode: 'all' }
    for (const k of ALL) expect(isSourceActive(f, k)).toBe(true)
  })
  it('All 态点某源 → 仅该源单选', () => {
    const f = toggleSourceChip({ mode: 'all' }, 'research', ALL)
    expect(f).toEqual({ mode: 'pick', selected: new Set(['research']) })
  })
  it('pick 态多点 → 多选并集', () => {
    let f = toggleSourceChip({ mode: 'all' }, 'research', ALL)
    f = toggleSourceChip(f, 'alignment', ALL)
    expect(isSourceActive(f, 'research')).toBe(true)
    expect(isSourceActive(f, 'alignment')).toBe(true)
    expect(isSourceActive(f, 'engineering')).toBe(false)
  })
  it('点灭最后一个 → 回退 All', () => {
    let f = toggleSourceChip({ mode: 'all' }, 'research', ALL)
    f = toggleSourceChip(f, 'research', ALL)
    expect(f).toEqual({ mode: 'all' })
  })
  it('手动点满五源 → 收编为 All', () => {
    let f = toggleSourceChip({ mode: 'all' }, 'engineering', ALL)
    for (const k of ALL.slice(1)) f = toggleSourceChip(f, k, ALL)
    expect(f).toEqual({ mode: 'all' })
  })
  it('clickAllChip 任意态 → All', () => {
    expect(clickAllChip()).toEqual({ mode: 'all' })
  })
})
```

- [ ] **Step 2: 运行失败 → 实现 `src/lib/section-filter.ts`**

```ts
import type { AnthropicSectionKey } from '@shared/index'

export type BlogFilter =
  | { mode: 'all' }
  | { mode: 'pick'; selected: ReadonlySet<AnthropicSectionKey> }

export function clickAllChip(): BlogFilter {
  return { mode: 'all' }
}

export function toggleSourceChip(
  filter: BlogFilter,
  key: AnthropicSectionKey,
  allKeys: readonly AnthropicSectionKey[]
): BlogFilter {
  if (filter.mode === 'all') return { mode: 'pick', selected: new Set([key]) }
  const next = new Set(filter.selected)
  if (next.has(key)) next.delete(key)
  else next.add(key)
  // 空选择回退 All；手动点满全部收编为 All
  if (next.size === 0 || next.size >= allKeys.length) return { mode: 'all' }
  return { mode: 'pick', selected: next }
}

export function isSourceActive(filter: BlogFilter, key: AnthropicSectionKey): boolean {
  return filter.mode === 'all' || filter.selected.has(key)
}
```

- [ ] **Step 3: Panel 接入**

`AnthropicBlogPanel.tsx`：

- `activeSections` state 替换为 `const [filter, setFilter] = useState<BlogFilter>({ mode: 'all' })`
- 过滤逻辑（现 `:91-102`）：

```tsx
const filtered = useMemo(() => {
  const bySource = filter.mode === 'all'
    ? displayArticles
    : displayArticles.filter((a) => filter.selected.has(filterGroupOf(a)))
  const q = query.trim().toLowerCase()
  if (!q) return bySource
  return bySource.filter((a) => a.title?.toLowerCase().includes(q) || (a.summary ?? '').toLowerCase().includes(q))
}, [displayArticles, query, filter])
```

注意：删掉旧逻辑里 `a.local === 'constitution' ||` 的无条件放行——constitution 现在由 `filterGroupOf` 归 engineering 参与过滤。

- chips UI（现 `:290-317`）：All chip 在最前，源 chip 沿用现有结构仅替换 active 判定与 onClick：

```tsx
<div className="flex flex-wrap gap-1.5">
  <button
    type="button"
    data-testid="anthropic-filter-all"
    aria-pressed={filter.mode === 'all'}
    onClick={() => setFilter(clickAllChip())}
    className={`px-2 py-0.5 rounded-full border text-[10px] transition-colors ${filter.mode === 'all' ? 'border-ember text-ember' : themeClasses.muted}`}
    style={filter.mode === 'all' ? {} : { borderColor: 'transparent' }}
  >
    All
  </button>
  {ANTHROPIC_SOURCES.map((s) => {
    const active = filter.mode !== 'all' && filter.selected.has(s.key)
    return (
      <button
        key={s.key}
        type="button"
        data-testid="anthropic-section-chip"
        data-section={s.key}
        aria-pressed={active}
        onClick={() => setFilter((prev) => toggleSourceChip(prev, s.key, ALL_SOURCE_KEYS))}
        className={`px-2 py-0.5 rounded-full border text-[10px] transition-colors ${active ? '' : themeClasses.muted}`}
        style={active ? { borderColor: s.color, color: s.color } : { borderColor: 'transparent' }}
      >
        {s.label}
      </button>
    )
  })}
</div>
```

`ALL_SOURCE_KEYS` 定义在 `src/lib/section-filter.ts`（`ANTHROPIC_SOURCES.map((s) => s.key)` 的冻结常量，从 lib 导出以避免组件文件导出非组件）。

- 失败提示条（`:240`）已是 `ANTHROPIC_SECTIONS.filter(...)` 遍历——改名为 `ANTHROPIC_SOURCES` 后自然覆盖五源，逻辑不动。

- [ ] **Step 4: 组件测试更新**

`tests/anthropic-blog-panel.test.tsx`：现有三 chip 断言改五 chip + All；新增交互用例（点 All 全亮→点 Research 仅它亮→再点 Alignment 两个亮→点灭两个回 All；constitution 条目只选 research 时隐藏、选 engineering 时显示；`section: 'institute'` 文章只选 research 时显示）。

**新增源无封面/月精度日期的行渲染断言**（复审增补）：`imageUrl: null` 的行渲染占位块不崩（alignment/circuits 全部文章无封面）；`publishedAt` 为月初 ISO（"2026-07-01"）时 `formatDate` 正常显示；`AnthropicArticleRow` 的色签对五源 + institute 遗留值都取到 label/color（institute 走 `LEGACY_SECTION_META`——若 row 目前直接从 `ANTHROPIC_SECTIONS` 找 meta，需改为先查 `ANTHROPIC_SOURCES` 再查 `LEGACY_SECTION_META`，否则 institute 行色签丢失）。

- [ ] **Step 5: 运行并提交**

```bash
npx tsc --noEmit
npx vitest run tests/section-filter.test.ts tests/anthropic-blog-panel.test.tsx
git add -A && git commit -m "feat(blog): All+多选过滤器状态机；constitution 归 engineering、institute 归 research"
```

---

## Task 7: 导读卡死修复（先复现定位，再修复）

**Files:**
- Check first: `electron/prompts/blog-guide-v2.md`（输出契约是否明确 `summary` 字段+负例）
- Modify（按根因定）: `electron/lib/guide-v2-pipeline.ts` / `electron/lib/guide-v2.ts` / `electron/prompts/blog-guide-v2.md`
- Modify: `electron/ipc/article-assistant.ts`（E2E bad-json 门控）
- Test: `tests/blog-guide-v2-real.test.ts`（真实 API 复现）、`tests/guide-v2*.test.ts`

**Interfaces:**
- Consumes: 现有 `runBlogGuideV2`、store `generateAssistantGuide`（`src/store/index.ts:2134-2176`，错误兜底已存在）
- Produces: mock 门控 `E2E_GUIDE_BAD_JSON=1` → mock 在 writing 进度后抛 `GUIDE_JSON_ERROR`

- [ ] **Step 1: 真实 API 复现（systematic-debugging：先看到现象再改）**

```bash
npx vitest run tests/blog-guide-v2-real.test.ts
```

观察：是否复现卡死/超时报错/校验失败。同时检查 `~/.studyparlor/debug/` 是否新增 `guide-v2-bad-*` 落盘。候选根因（按排查优先级）：

1. `blog-guide-v2.md` prompt 与 `isValidGuideBlogV2` 字段契约不一致（summary vs context）
2. `chatStream` thinking max 下 reasoning 长间隔触发 120s idle timeout → 应抛错但前端未展示（查 store catch 是否被执行——加临时 console.error）
3. `runGuideV2` 阶段 3 `new AbortController().signal` 永不 abort，配合 relay 挂起

定位后修复根因。**无论根因，必须同时完成 Step 2-4 的加固**。

- [ ] **Step 2: prompt 契约加固**

打开 `electron/prompts/blog-guide-v2.md`，确认包含（缺则补）：逐字字段 schema（`chunks[].summary` 而非 `context`）、负面示例（"禁止输出 context 字段"、"以 `{` 开头以 `}` 结尾，禁止 markdown 代码块"）（llm 规则 §5）。

- [ ] **Step 3: 错误传导验证**

单测断言 store 层兜底已有行为：`generateAssistantGuide` reject（任意错误）→ `guideLoading: false`、`guideError` 非空、`guideProgress: null`。先查 `tests/store-article-assistant.test.ts` 是否已有该用例；没有则在其中补一条。另确认 `GuideSidebar`（`tests/GuideSidebar.test.tsx` 对应组件）对 `anthropic-article` 渲染 `guideError` + 重试按钮（读组件确认，缺则补——这是卡死的直接兜底）。

- [ ] **Step 4: E2E 门控**

`electron/ipc/article-assistant.ts` 的 `isE2EMock()` 分支内、`anthropic-article` mock 进度事件之后：

```ts
if (process.env.E2E_GUIDE_BAD_JSON === '1') {
  throw typedError('GUIDE_JSON_ERROR', 'E2E forced bad guide json')
}
```

- [ ] **Step 5: 运行并提交**

```bash
npx vitest run tests/blog-guide-v2-real.test.ts   # 真实 API：必须到达成功终态
npx vitest run tests/guide-v2.test.ts tests/blog-guide-v2.test.ts 2>/dev/null || ls tests | grep guide
git add -A && git commit -m "fix(guide): 博客导读卡死修复（根因: ___）+ prompt 契约加固 + 错误传导兜底"
```

（commit message 填入实际根因）

---

## Task 8: E2E 覆盖 + source-map 同步

**Files:**
- Modify: `e2e/helpers/test-library.ts`（如需五源 seed helper）
- Modify/Create: `e2e/specs/anthropic-blog-sections.spec.ts`（扩五源交互）、`e2e/specs/article-assistant-guide.spec.ts`（或新建 `blog-guide-terminal.spec.ts`）
- Modify: `e2e/source-map.json`

- [ ] **Step 1: 五源时间线 + 过滤器 E2E**

seed `anthropicBlogCache`（五源各 2-3 篇 + 1 篇 `section:'institute'` + constitution 自动置顶），断言：

- 时间线合并按日期倒序；六枚 chip（All + 五源）
- All→Research 单选→+Alignment 多选→点灭回 All 全状态机
- 只选 research：constitution 隐藏、institute 文章可见；只选 engineering：constitution 可见、institute 隐藏
- seed `sectionStatus.product.error` → 提示条出现含 "Product"，其余源文章仍渲染；点重试触发 discover

- [ ] **Step 2: 导读终态 E2E**

- `E2E_GUIDE_BAD_JSON=1`：打开博客文章 → 导读区最终显示错误 + 重试，"撰写导读中"消失（`expect(...).toBeHidden()`）
- 正常 mock：导读渲染成功
- 两条共同断言"终态必达"

- [ ] **Step 3: articleMetaCache 持久化 E2E**

backfill 合并后 reload → 文章标题/日期仍在（读 state.json 断言 `articleMetaCache` 非空）。

- [ ] **Step 3b: backfill 事件 E2E（复审增补）**

`electron/ipc/anthropic.ts` 加 E2E 门控（沿用 `E2E_ANTHROPIC_OFFLINE` 模式）：`E2E_ANTHROPIC_BACKFILL=1` 时 discover handler 不走真实抓取，返回 ok 空结果后异步 `send('anthropic:backfill', { articles: [一篇带标题/日期的 mock 文章] })`。spec 断言：初始时间线无该文 → 事件到达后新行出现（标题可见、按日期插入正确位置）。

- [ ] **Step 3c: 新源阅读/旁注链路 E2E（复审增补）**

用现有 seed helper 写一篇 `section: 'alignment'`、`source_url: https://alignment.anthropic.com/2026/msm/` 的 `.md` 进 `Anthropic博客/`，seed 对应 cache 条目（`imageUrl: null`）。断言全链路等价 engineering：行显示 Alignment 色签 → 点击打开阅读器正文渲染 → 导读 mock 生成成功（summary 形状）→ 添加旁注成功 → 删除弹确认。这一条把"新源 = engineering 体验"钉死在回归里。

- [ ] **Step 4: 同步 `e2e/source-map.json`**（新 spec 入对应 group 或新建 blog group）

- [ ] **Step 5: 运行并提交**

```bash
node scripts/e2e-changed.js --run
git add -A && git commit -m "test(blog): 五源过滤器/失败条/导读终态/缓存持久化 E2E"
```

---

## Task 9: @real 五源完整性验收（手动，不进 CI）

**Files:**
- Create: `e2e/specs/anthropic-blog-real-sources.spec.ts`

- [ ] **Step 1: 写 @real spec**

真实应用 + 真实网络（不用 mock）：触发 discover，断言：

- `articles` 按源计数 `>=` 基线：engineering 25 / research 144 / alignment 54 / interpretability 51
- 每篇文章 `title` 与 `publishedAt` 非空（这是本轮的核心验收）
- product：可达时 `>= 204`；不可达时断言 `sectionStatus.product.error` 存在且其余四源完整（spec 顶部检测连通性二选一断言，不用 test.skip——e2e 规则禁止跳过）
- 长 timeout（首次回填 458 篇约 1-2 分钟，给 10 分钟）

- [ ] **Step 2: 真实导读生成**

`tests/blog-guide-v2-real.test.ts` 已在 Task 7 跑通；此处再在应用内手动生成一次博客导读确认终态。

- [ ] **Step 3: 运行（VPN 开/关各跑一次）**

```bash
npx playwright test e2e/specs/anthropic-blog-real-sources.spec.ts --grep @real
git add -A && git commit -m "test(blog): @real 五源完整性验收"
```

---

## Task 10: 集成验证

- [ ] **Step 1:** `npx tsc --noEmit && npm run build`
- [ ] **Step 2:** 定向单测：`npx vitest run tests/anthropic-discover.test.ts tests/anthropic.test.ts tests/anthropic-sections.test.ts tests/anthropic-sections-store.test.ts tests/section-filter.test.ts tests/anthropic-blog-panel.test.tsx`
- [ ] **Step 3:** `node scripts/e2e-changed.js --run`
- [ ] **Step 4:** 全绿后 `git commit --allow-empty -m "verify: blog multi-source plan all green"`

---

## 执行顺序依赖

1. Task 1 是全部前置。
2. Task 2 → 3 → 4 → 5 顺序执行（解析器 → HTTP/元数据 → discover → import）。
3. Task 6 依赖 Task 1，可与 2-5 并行。
4. Task 7 独立，可任意时段；建议尽早（用户在等导读修复）。
5. Task 8 依赖 4+6+7；Task 9 依赖全部；Task 10 最后。

推荐顺序：**1 → 7（导读修复优先）→ 2 → 3 → 4 → 5 → 6 → 8 → 9 → 10**。

## Spec 覆盖自检

| Spec 章节 | 对应任务 |
|---|---|
| 来源配置/适配器 | Task 1 |
| articleMetaCache 契约 | Task 1 + 4 |
| sitemap/static-list/rss 三策略 | Task 2 + 4 |
| net.fetch 统一 | Task 3 + 5（图片下载） |
| 元数据回填/并发/重定向去重 | Task 3 + 4 |
| 正文选择器按源（d-article/main） | Task 5 |
| import 去全量 discover | Task 5 |
| All 状态机/归类规则/失败条 | Task 6 |
| 导读修复 + E2E 终态 | Task 7 + 8 |
| @real 五源验收 | Task 9 |
| source-map 同步 | Task 8 |
