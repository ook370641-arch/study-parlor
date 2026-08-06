# Anthropic 博客多栏目扩展 + 博客导读 v2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 博客子源从 engineering 单栏目扩展为 engineering/institute/research 三栏目（合并时间线 + 色签过滤），并把博客导读升级为 v2 管线（保留章节总结 + 搜索增强背景）。

**Architecture:** 栏目做成声明式配置（主/渲染双副本，参照 `GUIDE_FORMAT_VERSION` 双副本先例——spec 中原定的 `anthropic:getSections` IPC 改为双副本，因为配置是纯静态常量，异步 IPC 取常量没有收益）；抓取/正文提取/阅读器/旁注全链路参数化复用；导读管线 `guide-v2-pipeline.ts` 抽出 hooks（prompt 构造器 + 校验器），digest/blog 各挂各的。

**Tech Stack:** Electron 30 + React 18 + TypeScript + Zustand + Vitest + Playwright。

**Spec:** `docs/superpowers/specs/2026-08-07-anthropic-blog-sections-design.md`

## Global Constraints

- 只跑定向测试（`.claude/rules/general.md` §9）：改哪个文件跑哪个测试 + `node scripts/e2e-changed.js --run`；禁止全量 `npx vitest run` / `npm run test:e2e`。
- 新增持久化字段全部带缺省值，旧 state.json / 旧 frontmatter / 旧 v1 导读缓存零迁移（`ipc-state.md` §3）。
- `type` 恒为 `'anthropic-article'` 不变；frontmatter 只**新增** `section` 字段。
- 存储目录仍 `Anthropic博客/YYYY-MM/`，不按栏目分目录。
- 栏目配置双副本必须逐字同步（测试强制断言相等），同步注释参照 `electron/lib/guide-v2.ts:4` 的写法。
- 组件文件只导出组件（`ui-styling.md` §10）：helper 进 `src/lib/`。
- 新 IPC 形状变更按 types → handler → preload → facade → store → 测试顺序（`ipc-state.md` §1）；本次 preload/facade 是透传，只动类型签名。
- LLM JSON 输出走 提取→校验 既有路径（`extractJsonObject` + 形状校验器），禁止裸 `JSON.parse`。
- 真实 API 测试默认运行、支持 `REAL_TEST_REPLAY=1` 回放（`e2e.md` §1b/§1c），密钥读应用自己的 `.env`。
- E2E seed 工厂 `BASE_STATE` 与 store schema 同步（`e2e.md` §7）；新 spec 同步 `e2e/source-map.json`（`e2e.md` §10）。
- 每个任务的验证命令：单测 `npx vitest run <file>`（只跑指定文件）；类型检查 `tsc --noEmit && tsc --noEmit -p tsconfig.node.json`。

---

### Task 1: 类型契约 + 栏目配置双副本 + 持久化缺省值

**Files:**
- Create: `electron/lib/anthropic-sections.ts`
- Create: `src/lib/anthropic-sections.ts`
- Modify: `src/types/index.ts:48-78`（AnthropicArticleMeta / AnthropicBlogCache）、`:193-223`（Frontmatter）
- Modify: `electron/ipc/state.ts:24`（DEFAULT.anthropicBlogCache）
- Modify: `src/store/index.ts:520`（store 初始 anthropicBlogCache）
- Test: `tests/anthropic-sections.test.ts`

**Interfaces:**
- Produces:
  - `AnthropicSectionKey = 'engineering' | 'institute' | 'research'`（types）
  - `AnthropicSection = { key, label, indexUrl, linkPrefix, excludePrefixes?, color }`（两份副本各自导出，形状相同）
  - `ANTHROPIC_SECTIONS: AnthropicSection[]`（engineering → institute → research 顺序）
  - `sectionForUrl(url: string): AnthropicSectionKey`（两份副本都有）
  - `sectionOf(article): AnthropicSectionKey`（仅渲染副本）
  - `AnthropicArticleMeta.section?: AnthropicSectionKey`、`AnthropicBlogCache.sectionStatus?: Partial<Record<AnthropicSectionKey, AnthropicSectionStatus>>`、`AnthropicSectionStatus = { fetchedAt: string | null; error: AnthropicError | null }`、`Frontmatter.section?: string`
- Consumes: 无（纯数据层）。

- [ ] **Step 1: Write the failing test**

创建 `tests/anthropic-sections.test.ts`：

```ts
import { describe, it, expect } from 'vitest'
import {
  ANTHROPIC_SECTIONS as MAIN_SECTIONS,
  sectionForUrl as mainSectionForUrl,
} from '../electron/lib/anthropic-sections'
import {
  ANTHROPIC_SECTIONS as RENDER_SECTIONS,
  sectionForUrl,
  sectionOf,
} from '../src/lib/anthropic-sections'

describe('ANTHROPIC_SECTIONS config', () => {
  it('has exactly engineering / institute / research in order', () => {
    expect(MAIN_SECTIONS.map((s) => s.key)).toEqual(['engineering', 'institute', 'research'])
  })

  it('research excludes team pages', () => {
    const research = MAIN_SECTIONS.find((s) => s.key === 'research')
    expect(research?.excludePrefixes).toEqual(['/research/team/'])
  })

  it('each section has indexUrl matching its linkPrefix', () => {
    for (const s of MAIN_SECTIONS) {
      expect(s.indexUrl).toBe(`https://www.anthropic.com${s.linkPrefix.slice(0, -1)}`)
      expect(s.color).toMatch(/^#[0-9a-f]{6}$/)
    }
  })

  it('renderer copy stays in sync with main copy', () => {
    expect(RENDER_SECTIONS).toEqual(MAIN_SECTIONS)
  })
})

describe('sectionForUrl', () => {
  it('maps section urls to keys', () => {
    expect(sectionForUrl('https://www.anthropic.com/engineering/foo')).toBe('engineering')
    expect(sectionForUrl('https://www.anthropic.com/institute/recursive-self-improvement')).toBe('institute')
    expect(sectionForUrl('https://www.anthropic.com/research/global-workspace')).toBe('research')
  })

  it('falls back to engineering for unknown urls', () => {
    expect(sectionForUrl('https://www.anthropic.com/news/claude-opus-5')).toBe('engineering')
    expect(sectionForUrl('')).toBe('engineering')
  })
})

describe('sectionOf', () => {
  it('prefers meta.section over url inference', () => {
    expect(sectionOf({ url: 'https://www.anthropic.com/institute/x', section: 'research' })).toBe('research')
  })

  it('infers from url when section missing (old cache)', () => {
    expect(sectionOf({ url: 'https://www.anthropic.com/research/x' })).toBe('research')
    expect(sectionOf({ url: 'https://www.anthropic.com/engineering/x' })).toBe('engineering')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/anthropic-sections.test.ts`
Expected: FAIL（模块不存在，`electron/lib/anthropic-sections` 无法解析）

- [ ] **Step 3: 类型契约（types/index.ts）**

`src/types/index.ts` 三处修改：

1. `AnthropicArticleMeta`（:48-58）加字段与联合类型——在 `AnthropicArticleMeta` 前插入：

```ts
export type AnthropicSectionKey = 'engineering' | 'institute' | 'research'
```

并在 meta 类型内 `local?: 'constitution'` 后加：

```ts
  /** 栏目标识；旧缓存/旧数据缺失时视为 'engineering'（见 sectionOf/sectionForUrl 回退） */
  section?: AnthropicSectionKey
```

2. `AnthropicBlogCache`（:73-78）替换为：

```ts
export type AnthropicSectionStatus = {
  fetchedAt: string | null
  error: AnthropicError | null
}

export type AnthropicBlogCache = {
  lastFetchedAt: string | null
  articles: AnthropicArticleMeta[]
  loading: boolean
  error: AnthropicError | null
  /** 各栏目抓取状态；旧 state.json 无此字段，缺省 {} */
  sectionStatus?: Partial<Record<AnthropicSectionKey, AnthropicSectionStatus>>
}
```

3. `Frontmatter`（:193-223）在 `authors?: string[]` 后加：

```ts
  /** Anthropic 博客栏目；旧文章缺省视为 'engineering' */
  section?: string
```

同时把 `IpcApi.anthropicDiscover`（:670-673）的 ok 变体改为：

```ts
  anthropicDiscover: () => Promise<
    | { ok: true; lastFetchedAt: string; articles: AnthropicArticleMeta[]; sectionStatus: Partial<Record<AnthropicSectionKey, AnthropicSectionStatus>> }
    | { ok: false; code: AnthropicErrorCode; message: string }
  >
```

- [ ] **Step 4: 主进程副本 `electron/lib/anthropic-sections.ts`**

```ts
import type { AnthropicSectionKey } from '@shared/index'

// 与 src/lib/anthropic-sections.ts 中的渲染侧副本保持同步（进程隔离，不能互 import；
// 双副本先例见 electron/lib/guide-v2.ts 的 GUIDE_FORMAT_VERSION）。
export interface AnthropicSection {
  key: AnthropicSectionKey
  label: string
  indexUrl: string
  linkPrefix: string
  /** 索引页中需要排除的链接前缀（如 research 的团队页） */
  excludePrefixes?: string[]
  color: string
}

export const ANTHROPIC_SECTIONS: AnthropicSection[] = [
  {
    key: 'engineering',
    label: 'Engineering',
    indexUrl: 'https://www.anthropic.com/engineering',
    linkPrefix: '/engineering/',
    color: '#d97757',
  },
  {
    key: 'institute',
    label: 'Institute',
    indexUrl: 'https://www.anthropic.com/institute',
    linkPrefix: '/institute/',
    color: '#8a9a5b',
  },
  {
    key: 'research',
    label: 'Research',
    indexUrl: 'https://www.anthropic.com/research',
    linkPrefix: '/research/',
    excludePrefixes: ['/research/team/'],
    color: '#6b8fa3',
  },
]

/** 从文章 URL 回推栏目；无法识别时归 engineering（旧数据兜底） */
export function sectionForUrl(url: string): AnthropicSectionKey {
  for (const s of ANTHROPIC_SECTIONS) {
    if (url.includes(s.linkPrefix)) return s.key
  }
  return 'engineering'
}
```

- [ ] **Step 5: 渲染副本 `src/lib/anthropic-sections.ts`**

内容与主进程副本逐字一致（config + `sectionForUrl`），头部注释改为「与 electron/lib/anthropic-sections.ts 保持同步（主/渲染进程不能互 import）」，另加渲染侧专用 helper：

```ts
import type { AnthropicArticleMeta, AnthropicSectionKey } from '@shared/index'

// 与 electron/lib/anthropic-sections.ts 保持同步（主/渲染进程不能互 import）。
// ... interface AnthropicSection / ANTHROPIC_SECTIONS / sectionForUrl 与主进程副本逐字相同 ...

/** 文章所属栏目：优先 meta.section，缺失时从 URL 回推，最终兜底 engineering */
export function sectionOf(
  article: Pick<AnthropicArticleMeta, 'url'> & { section?: AnthropicSectionKey }
): AnthropicSectionKey {
  return article.section ?? sectionForUrl(article.url)
}
```

- [ ] **Step 6: 持久化缺省值**

`electron/ipc/state.ts:24` 改为：

```ts
  anthropicBlogCache: { lastFetchedAt: null, articles: [], loading: false, error: null, sectionStatus: {} },
```

`src/store/index.ts:520` 同样加 `sectionStatus: {}`。

- [ ] **Step 7: Run test to verify it passes**

Run: `npx vitest run tests/anthropic-sections.test.ts`
Expected: PASS（11 个断言全绿）

- [ ] **Step 8: 类型检查 + Commit**

```bash
tsc --noEmit && tsc --noEmit -p tsconfig.node.json
git add electron/lib/anthropic-sections.ts src/lib/anthropic-sections.ts src/types/index.ts electron/ipc/state.ts src/store/index.ts tests/anthropic-sections.test.ts
git commit -m "feat(anthropic): 栏目配置双副本 + section/sectionStatus 类型契约"
```

---

### Task 2: discover 多栏目化（scraper + IPC）

**Files:**
- Modify: `electron/lib/anthropic-scraper.ts:8-9`（URL 常量）、`:92-160`（LISTING_SCRIPT / discoverArticles）、新增 `classifyError`
- Modify: `electron/ipc/anthropic.ts:9-28`（classifyError 移出）、`:31-71`（discover handler 带 sectionStatus）
- Test: `tests/anthropic.test.ts`

**Interfaces:**
- Consumes: `ANTHROPIC_SECTIONS` / `AnthropicSection` / `AnthropicSectionStatus`（Task 1）
- Produces:
  - `buildListingScript(section: AnthropicSection): string`
  - `discoverArticles(libraryRoot)` 返回 `{ lastFetchedAt: string; articles: AnthropicArticleMeta[]; sectionStatus: Partial<Record<AnthropicSectionKey, AnthropicSectionStatus>> }`（articles 每条带 `section`）
  - `classifyError(err: unknown): { code: AnthropicErrorCode; message: string }`（从 ipc/anthropic.ts 移到 scraper，ipc 改为 import）
  - 栏目失败语义：单栏目失败仅记 `sectionStatus[key].error`；**全部**失败才 throw（走 IPC 整体错误路径）

- [ ] **Step 1: 更新既有 mock + 写失败测试**

`tests/anthropic.test.ts` 的 `anthropic integration` describe 中，现有 `runScriptInScraperWindow` mock 只识别 engineering 脚本。在 mockImplementation 的分支链里、engineering 分支**之后**加（保持既有测试在多栏目 discover 下仍绿）：

```ts
      if (script.includes('a[href^="/institute/"]') || script.includes('a[href^="/research/"]')) {
        return []
      }
```

新增 describe：

```ts
describe('discoverArticles multi-section', () => {
  const ENG = { url: 'https://www.anthropic.com/engineering/e1', title: 'Eng', summary: null, dateText: 'Aug 1, 2026', imageUrl: null }
  const INS = { url: 'https://www.anthropic.com/institute/i1', title: 'Inst', summary: null, dateText: 'Aug 3, 2026', imageUrl: null }
  const RES = { url: 'https://www.anthropic.com/research/r1', title: 'Res', summary: null, dateText: 'Aug 2, 2026', imageUrl: null }
  let tmp: string

  function mockListing(impl: (url: string) => unknown) {
    vi.mocked(runScriptInScraperWindow).mockImplementation(async (_script, opts) => {
      return impl((opts as { url: string }).url) as never
    })
  }

  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sp-anthropic-ms-'))
  })
  afterEach(() => {
    fs.rmSync(tmp, { recursive: true, force: true })
  })

  it('buildListingScript 参数化前缀与排除规则', async () => {
    const { buildListingScript } = await import('../electron/lib/anthropic-scraper')
    const { ANTHROPIC_SECTIONS } = await import('../electron/lib/anthropic-sections')
    const eng = ANTHROPIC_SECTIONS.find((s) => s.key === 'engineering')!
    const res = ANTHROPIC_SECTIONS.find((s) => s.key === 'research')!
    expect(buildListingScript(eng)).toContain('a[href^="/engineering/"]')
    expect(buildListingScript(res)).toContain('a[href^="/research/"]')
    expect(buildListingScript(res)).toContain('/research/team/')
    expect(buildListingScript(eng)).toContain('EXCLUDE_PREFIXES')
  })

  it('三栏目文章带 section 合并返回，sectionStatus 全部成功', async () => {
    mockListing((url) => (url.includes('/institute') ? [INS] : url.includes('/research') ? [RES] : [ENG]))
    const { discoverArticles } = await import('../electron/lib/anthropic-scraper')
    const result = await discoverArticles(tmp)
    expect(result.articles).toHaveLength(3)
    expect(result.articles.map((a) => a.section).sort()).toEqual(['engineering', 'institute', 'research'])
    expect(result.sectionStatus.institute?.error).toBeNull()
    expect(result.sectionStatus.research?.fetchedAt).toBeTruthy()
  })

  it('单栏目失败隔离：其他栏目正常返回，失败栏目记入 sectionStatus', async () => {
    mockListing((url) => {
      if (url.includes('/institute')) throw new Error('timeout waiting for selector')
      return url.includes('/research') ? [RES] : [ENG]
    })
    const { discoverArticles } = await import('../electron/lib/anthropic-scraper')
    const result = await discoverArticles(tmp)
    expect(result.articles).toHaveLength(2)
    expect(result.sectionStatus.institute?.error?.code).toBe('network-error')
    expect(result.sectionStatus.engineering?.error).toBeNull()
  })

  it('全部栏目失败时整体抛错', async () => {
    mockListing(() => { throw new Error('load failed') })
    const { discoverArticles } = await import('../electron/lib/anthropic-scraper')
    await expect(discoverArticles(tmp)).rejects.toThrow('load failed')
  })
})
```

注意：`runScriptInScraperWindow` 真实签名是 `(script, opts)`；既有测试只 mock 了单参，本测试按双参 mock。文件顶部补 import（若缺）：`import { discoverArticles } from '../electron/lib/anthropic-scraper'` 不需要——测试里用动态 import 即可，但 `runScriptInScraperWindow` 已在顶部 import。

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/anthropic.test.ts`
Expected: 新增 4 个测试 FAIL（`buildListingScript` 不存在 / discoverArticles 无 sectionStatus）

- [ ] **Step 3: scraper 多栏目化**

`electron/lib/anthropic-scraper.ts`：

1. 删除 `:9` 的 `ENGINEERING_URL`（本改动使其成为孤儿）。`:6` import 行后加：

```ts
import { ANTHROPIC_SECTIONS, type AnthropicSection } from './anthropic-sections'
import type { AnthropicSectionKey, AnthropicSectionStatus, AnthropicErrorCode } from '@shared/index'
```

（`:6` 原有 `import type { AnthropicArticleMeta } from '@shared/index'` 并入同一行或保留两行均可。）

2. 把 `electron/ipc/anthropic.ts:9-28` 的 `classifyError` **移动**到本文件并 `export`（函数体逐字不变）；`electron/ipc/anthropic.ts` 删除本地定义，改为 `import { discoverArticles, importArticle, classifyError } from '../lib/anthropic-scraper'`。

3. `LISTING_SCRIPT` 常量（:92-135）替换为：

```ts
export function buildListingScript(section: AnthropicSection): string {
  return `(() => {
  const seen = new Set()
  const results = []
  const EXCLUDE_PREFIXES = ${JSON.stringify(section.excludePrefixes ?? [])}
  const datePattern = /\\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\\s+\\d{1,2},?\\s+\\d{4}\\b/

  // Find the card container for an <a> element, then extract all metadata
  // from the container. This avoids the bug where the first <a> (often an
  // image-only link) "wins" the per-URL dedup and blocks the title-bearing
  // <a> from contributing its data.
  const extractCard = (a) => {
    let container = a.closest('[class*="ArticleList"], article, li')
    if (!container) container = a.parentElement

    const href = a.getAttribute('href')
    const url = href.startsWith('http') ? href : 'https://www.anthropic.com' + href

    const titleEl = container?.querySelector('h2, h3, h4, [class*="__title"], [class*="title"]')
    const title = titleEl?.textContent?.trim() || a.textContent?.trim() || null

    const summaryEl = container?.querySelector('[class*="__summary"]')
    const summary = summaryEl?.textContent?.trim() || null

    const dateEl = container?.querySelector('[class*="__date"]')
    const dateText = dateEl?.textContent?.trim()
      || container?.textContent?.match(datePattern)?.[0]
      || null

    const img = container?.querySelector('img')
    const imageUrl = img?.getAttribute('src') || img?.getAttribute('data-src') || null

    return { url, title, summary, dateText, imageUrl }
  }

  document.querySelectorAll('a[href^="${section.linkPrefix}"]').forEach((a) => {
    const href = a.getAttribute('href')
    if (!href) return
    if (EXCLUDE_PREFIXES.some((p) => href.startsWith(p))) return
    const url = href.startsWith('http') ? href : 'https://www.anthropic.com' + href
    if (seen.has(url)) return
    seen.add(url)
    results.push(extractCard(a))
  })

  return results
})()`
}
```

（测试 Step 1 中 `"EXCLUDE_PREFIXES"` 占位断言对齐此实现——`toContain('EXCLUDE_PREFIXES')`，写测试时用无引号裸词。）

4. `discoverArticles`（:137-160）替换为：

```ts
export async function discoverArticles(
  libraryRoot: string
): Promise<{
  lastFetchedAt: string
  articles: AnthropicArticleMeta[]
  sectionStatus: Partial<Record<AnthropicSectionKey, AnthropicSectionStatus>>
}> {
  const saved = findSavedArticles(libraryRoot)
  const articles: AnthropicArticleMeta[] = []
  const sectionStatus: Partial<Record<AnthropicSectionKey, AnthropicSectionStatus>> = {}
  const failures: unknown[] = []

  for (const section of ANTHROPIC_SECTIONS) {
    try {
      const links = await runScriptInScraperWindow<
        { url: string; title: string; summary: string | null; dateText: string | null; imageUrl: string | null }[]
      >(buildListingScript(section), {
        url: section.indexUrl,
        waitForSelector: `a[href^="${section.linkPrefix}"]`,
      })

      const mapped = links
        .map((link) => ({
          url: link.url,
          title: link.title,
          summary: link.summary,
          publishedAt: parseDateString(link.dateText),
          imageUrl: toAbsoluteUrl(link.imageUrl ?? ''),
          section: section.key,
        }))
        .filter((a) => a.title && a.url)

      for (const a of mapped) {
        const filePath = saved.get(a.url)
        articles.push({ ...a, isSaved: !!filePath, filePath })
      }
      sectionStatus[section.key] = { fetchedAt: new Date().toISOString(), error: null }
    } catch (err) {
      failures.push(err)
      sectionStatus[section.key] = { fetchedAt: null, error: classifyError(err) }
    }
  }

  // 全部失败才整体报错（走 IPC classifyError → parse-error/network-error 路径）；
  // 部分失败按栏目降级，面板逐栏目提示。
  if (articles.length === 0 && failures.length > 0) throw failures[0]
  return { lastFetchedAt: new Date().toISOString(), articles, sectionStatus }
}
```

5. `electron/ipc/anthropic.ts:31-71` discover handler 的三处 cache 构造带 `sectionStatus`：

```ts
    const prev = getCurrentState().anthropicBlogCache
    const loadingCache: AnthropicBlogCache = {
      lastFetchedAt: prev?.lastFetchedAt ?? null,
      articles: prev?.articles ?? [],
      loading: true,
      error: null,
      sectionStatus: prev?.sectionStatus ?? {},
    }
```

```ts
      const cache: AnthropicBlogCache = {
        lastFetchedAt: result.lastFetchedAt,
        articles: result.articles,
        loading: false,
        error: null,
        sectionStatus: result.sectionStatus,
      }
      await patchState({ anthropicBlogCache: cache })
      return { ok: true as const, lastFetchedAt: result.lastFetchedAt, articles: result.articles, sectionStatus: result.sectionStatus }
```

错误分支：

```ts
      const cache: AnthropicBlogCache = {
        lastFetchedAt: prev?.lastFetchedAt ?? null,
        articles: prev?.articles ?? [],
        loading: false,
        error,
        sectionStatus: prev?.sectionStatus ?? {},
      }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/anthropic.test.ts`
Expected: 全部 PASS（含既有 helper/integration 测试）

- [ ] **Step 5: 类型检查 + Commit**

```bash
tsc --noEmit && tsc --noEmit -p tsconfig.node.json
git add electron/lib/anthropic-scraper.ts electron/ipc/anthropic.ts tests/anthropic.test.ts
git commit -m "feat(anthropic): discover 多栏目化——栏目失败隔离 + sectionStatus"
```

---

### Task 3: importArticle 写入 section + frontmatter 契约

**Files:**
- Modify: `electron/lib/frontmatter.ts:15`（EXT_FIELDS）、`:73` 附近（parse 映射）
- Modify: `electron/lib/anthropic-scraper.ts:369-420`（importArticle）
- Test: `tests/frontmatter.test.ts`、`tests/anthropic.test.ts`

**Interfaces:**
- Consumes: `sectionForUrl`（Task 1）、`discoverArticles` 返回的 `meta.section`（Task 2）
- Produces: anthropic-article frontmatter 新字段 `section: string`；`tags: ['anthropic', section]`；`parseFrontmatter` 能读回 `section`

- [ ] **Step 1: Write the failing test**

`tests/frontmatter.test.ts` 追加：

```ts
describe('anthropic-article section field', () => {
  it('round-trips section for anthropic-article', () => {
    const raw = serializeFrontmatter('anthropic-article', {
      title: 'T',
      type: 'anthropic-article',
      created: '2026-08-01T00:00:00.000Z',
      tags: ['anthropic', 'institute'],
      source_url: 'https://www.anthropic.com/institute/x',
      section: 'institute',
    } as never, 'body')
    const { frontmatter } = parseFrontmatter(raw, { filename: 'x.md' })
    expect(frontmatter.section).toBe('institute')
    expect(frontmatter.tags).toEqual(['anthropic', 'institute'])
  })

  it('old article without section parses as undefined', () => {
    const raw = serializeFrontmatter('anthropic-article', {
      title: 'T',
      type: 'anthropic-article',
      created: '2026-08-01T00:00:00.000Z',
      tags: ['anthropic', 'engineering'],
      source_url: 'https://www.anthropic.com/engineering/x',
    } as never, 'body')
    const { frontmatter } = parseFrontmatter(raw, { filename: 'x.md' })
    expect(frontmatter.section).toBeUndefined()
  })
})
```

（导入名以 `tests/frontmatter.test.ts` 现有 import 为准——若现有用例用的是别的函数签名，对齐之。）

`tests/anthropic.test.ts` 追加：

```ts
describe('importArticle section', () => {
  it('institute 文章写入 section/tags', async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sp-anthropic-sec-'))
    const INS_URL = 'https://www.anthropic.com/institute/recursive-self-improvement'
    vi.mocked(runScriptInScraperWindow).mockImplementation(async (script, opts) => {
      const url = (opts as { url?: string } | undefined)?.url ?? ''
      if (script.includes('a[href^="/institute/"]')) {
        return [{ url: INS_URL, title: 'When AI builds itself', summary: 'S', dateText: 'Aug 5, 2026', imageUrl: null }] as never
      }
      if (script.includes('a[href^="/engineering/"]') || script.includes('a[href^="/research/"]')) return [] as never
      if (script.includes('article:published_time')) {
        return {
          title: 'When AI builds itself',
          url: INS_URL,
          publishedAt: '2026-08-05T00:00:00.000Z',
          authors: ['Anthropic'],
          summary: 'S',
          contentHtml: '<article><p>Body.</p></article>',
          images: [],
        } as never
      }
      return [] as never
    })
    // 全局 fetch（图片下载）不需要——无图片
    const { importArticle } = await import('../electron/lib/anthropic-scraper')
    const { filePath } = await importArticle(INS_URL, tmp)
    const raw = fs.readFileSync(filePath, 'utf8')
    const { parseFrontmatter } = await import('../electron/lib/frontmatter')
    const { frontmatter } = parseFrontmatter(raw, { filename: path.basename(filePath) })
    expect(frontmatter.section).toBe('institute')
    expect(frontmatter.tags).toEqual(['anthropic', 'institute'])
    fs.rmSync(tmp, { recursive: true, force: true })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/frontmatter.test.ts tests/anthropic.test.ts`
Expected: 新用例 FAIL（section 不落盘 / parse 读不出）

- [ ] **Step 3: 实现**

1. `electron/lib/frontmatter.ts:15`：

```ts
  'anthropic-article': ['source_url', 'published_at', 'imported_at', 'authors', 'summary', 'section'],
```

2. 同文件 parse 映射（:73-86 区块，放 `authors:` 行后）：

```ts
    section: typeof data.section === 'string' ? data.section : undefined,
```

3. `electron/lib/anthropic-scraper.ts` importArticle：`:380-382` 后（拿到 `meta` 与 `article` 后）加：

```ts
  const section = meta?.section ?? sectionForUrl(article.url)
```

顶部 import 加 `sectionForUrl`（并入 Task 2 的 `anthropic-sections` import 行）。frontmatter 字段（:401-416）改两行、加一行：

```ts
      tags: ['anthropic', section],
      section,
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/frontmatter.test.ts tests/anthropic.test.ts`
Expected: PASS

- [ ] **Step 5: 类型检查 + Commit**

```bash
tsc --noEmit && tsc --noEmit -p tsconfig.node.json
git add electron/lib/frontmatter.ts electron/lib/anthropic-scraper.ts tests/frontmatter.test.ts tests/anthropic.test.ts
git commit -m "feat(anthropic): importArticle 写入 frontmatter section + 栏目化 tags"
```

---

### Task 4: store 接入 sectionStatus

**Files:**
- Modify: `src/store/index.ts:1260-1297`（discoverAnthropicArticles）
- Test: `tests/anthropic-sections-store.test.ts`

**Interfaces:**
- Consumes: `IpcApi.anthropicDiscover` 新 ok 变体（Task 1 types）
- Produces: `discoverAnthropicArticles()` commit 后 `anthropicBlogCache.sectionStatus` 为最新抓取状态；失败/非 commit 路径保留旧 sectionStatus

- [ ] **Step 1: Write the failing test**

创建 `tests/anthropic-sections-store.test.ts`：

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/ipc', () => ({
  ipc: {
    anthropicDiscover: vi.fn(),
    patchState: vi.fn(),
  },
}))

import { ipc } from '@/lib/ipc'
import { useStore } from '@/store'

describe('discoverAnthropicArticles sectionStatus', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useStore.setState({
      anthropicBlogCache: { lastFetchedAt: null, articles: [], loading: false, error: null, sectionStatus: {} },
    } as never)
  })

  it('commit 时写入最新 sectionStatus', async () => {
    const sectionStatus = {
      engineering: { fetchedAt: '2026-08-07T00:00:00.000Z', error: null },
      institute: { fetchedAt: null, error: { code: 'parse-error', message: '解析失败' } },
    }
    vi.mocked(ipc.anthropicDiscover).mockResolvedValue({
      ok: true,
      lastFetchedAt: '2026-08-07T00:00:00.000Z',
      articles: [],
      sectionStatus,
    } as never)
    const result = await useStore.getState().discoverAnthropicArticles()
    expect(result.ok).toBe(true)
    expect(useStore.getState().anthropicBlogCache.sectionStatus).toEqual(sectionStatus)
  })

  it('整体失败时保留旧 sectionStatus', async () => {
    const old = { engineering: { fetchedAt: '2026-08-06T00:00:00.000Z', error: null } }
    useStore.setState({
      anthropicBlogCache: { lastFetchedAt: null, articles: [], loading: false, error: null, sectionStatus: old },
    } as never)
    vi.mocked(ipc.anthropicDiscover).mockResolvedValue({
      ok: false, code: 'network-error', message: '网络连接失败，请检查网络后重试',
    } as never)
    const result = await useStore.getState().discoverAnthropicArticles()
    expect(result.ok).toBe(false)
    expect(useStore.getState().anthropicBlogCache.sectionStatus).toEqual(old)
  })
})
```

（若 `@/store` import 在此测试环境下需要额外 mock 链，参照 `tests/anthropic-delete-store.test.ts` 的既有 mock 写法对齐。）

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/anthropic-sections-store.test.ts`
Expected: FAIL（commit 后 sectionStatus 不是新值）

- [ ] **Step 3: 实现**

`src/store/index.ts:1269-1279` ok 分支改为：

```ts
      if (result.ok) {
        const next: AnthropicBlogCache = {
          lastFetchedAt: result.lastFetchedAt,
          articles: result.articles,
          loading: false,
          error: null,
          sectionStatus: result.sectionStatus,
        }
```

失败/异常分支（:1281-1296）保持 `{ ...s.anthropicBlogCache, loading: false, error }` 扩散写法不变——天然保留旧 sectionStatus。

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/anthropic-sections-store.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/store/index.ts tests/anthropic-sections-store.test.ts
git commit -m "feat(anthropic): store 提交 sectionStatus，失败保留旧值"
```

---

### Task 5: 博客导读 v2 纯逻辑 + prompt 文件

**Files:**
- Modify: `electron/lib/guide-v2.ts`（新增 blog 校验器与两个 prompt 构造器）
- Create: `electron/prompts/blog-guide-v2.md`
- Test: `tests/article-assistant/guide-v2.test.ts`

**Interfaces:**
- Consumes: `isValidTermV2` / `countArticleHeadings` / `GuideMaterial`（guide-v2.ts 既有）
- Produces:
  - `isValidGuideBlogV2(value: unknown): value is ArticleAssistantGuide`（要求 `summary` 非空；不要求 `context`）
  - `buildBlogGuidePlanPrompt(articleContent: string, articleTitle?: string): string`
  - `buildBlogGuideV2UserPrompt(args: { articleContent: string; articleTitle?: string; materials: Map<number, GuideMaterial[]>; entryCount: number }): string`
  - prompt 文件 `electron/prompts/blog-guide-v2.md`（electron-builder.yml 已含 `electron/prompts` 整目录，打包自动覆盖）

- [ ] **Step 1: Write the failing test**

`tests/article-assistant/guide-v2.test.ts` 追加：

```ts
describe('isValidGuideBlogV2', () => {
  it('接受 summary 形状的博客导读', () => {
    expect(isValidGuideBlogV2({
      background: 'bg',
      chunks: [{ heading: 'H', summary: '本章总结', terms: [] }],
    })).toBe(true)
  })

  it('拒绝 summary 为空 / digest context 形状', () => {
    expect(isValidGuideBlogV2({
      background: 'bg',
      chunks: [{ heading: 'H', summary: '', terms: [] }],
    })).toBe(false)
    expect(isValidGuideBlogV2({
      background: 'bg',
      chunks: [{ heading: 'H', context: '铺陈', terms: [] }],
    })).toBe(false)
  })

  it('拒绝非法 terms / 空 chunks / 缺 background', () => {
    expect(isValidGuideBlogV2({ background: 'bg', chunks: [] })).toBe(false)
    expect(isValidGuideBlogV2({ chunks: [{ heading: 'H', summary: 's', terms: [] }] })).toBe(false)
    expect(isValidGuideBlogV2({
      background: 'bg',
      chunks: [{ heading: 'H', summary: 's', terms: [{ term: 1 }] }],
    })).toBe(false)
  })
})

describe('buildBlogGuidePlanPrompt', () => {
  it('包含章节计数与 JSON schema', () => {
    const p = buildBlogGuidePlanPrompt('## A\nx\n\n## B\ny', 'T')
    expect(p).toContain('2 个章节')
    expect(p).toContain('"queries"')
    expect(p).toContain('T')
  })
})

describe('buildBlogGuideV2UserPrompt', () => {
  it('按章节组织资料夹，无资料章节显式标注', () => {
    const p = buildBlogGuideV2UserPrompt({
      articleContent: '## A\nx',
      articleTitle: 'T',
      materials: new Map([[1, [{ title: 'm', url: 'u', snippet: 's' }]]]),
      entryCount: 2,
    })
    expect(p).toContain('各章节背景资料夹')
    expect(p).toContain('### §1\n- m\n  u\n  s')
    expect(p).toContain('### §2\n（无外部资料')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/article-assistant/guide-v2.test.ts`
Expected: FAIL（三个函数未导出）

- [ ] **Step 3: 实现（guide-v2.ts 追加）**

```ts
/** 博客导读 v2 形状校验：chunks 非空、每条 heading + 非空 summary（章节总结）+ terms 合法。
 *  与 digest v2 的差异：博客保留章节总结，不要 context。 */
export function isValidGuideBlogV2(value: unknown): value is ArticleAssistantGuide {
  const o = value as Record<string, unknown> | null
  if (!o || typeof o.background !== 'string' || !Array.isArray(o.chunks) || o.chunks.length === 0) return false
  return (o.chunks as unknown[]).every((c) => {
    const chunk = c as Record<string, unknown> | null
    return (
      !!chunk &&
      typeof chunk.heading === 'string' &&
      typeof chunk.summary === 'string' &&
      chunk.summary.trim().length > 0 &&
      Array.isArray(chunk.terms) &&
      (chunk.terms as unknown[]).every(isValidTermV2)
    )
  })
}

/** 博客（长文）检索规划 prompt：以章节为单位 */
export function buildBlogGuidePlanPrompt(articleContent: string, articleTitle?: string): string {
  const entryCount = countArticleHeadings(articleContent)
  return `你将为一篇 AI 领域长文撰写"章节导读"做检索规划。文章共 ${entryCount} 个章节（§1–§${entryCount}），全文附在最后。

逐章判断：为初学者写该章导读时，是否需要外部事实材料（技术背景、人物/机构履历、相关争论的来龙去脉、前置概念）？
- 每章都是候选：默认需要；仅当章节自足、常识足以覆盖时才不配查询。
- 一条查询可服务多个章节，在 entries 里列出所有相关章节序号。
- 查询词用英文（此类资料英文质量更高），简短精准。
- 查询总数 0-${entryCount} 动态决定：不遗漏需要事实支撑的章节，也不为常识章节浪费查询。

只输出 JSON（不要 markdown 代码块、不要任何解释）：
{"queries":[{"query":"...","entries":[1,3],"reason":"一句话说明查什么"}]}

文章标题：${articleTitle ?? '未命名文章'}

文章全文：
${articleContent}`
}

/** 博客版阶段 3 user prompt：正文 + 按章节组织的资料夹（无资料章节显式标注） */
export function buildBlogGuideV2UserPrompt(args: {
  articleContent: string
  articleTitle?: string
  materials: Map<number, GuideMaterial[]>
  entryCount: number
}): string {
  const sections: string[] = []
  for (let i = 1; i <= args.entryCount; i++) {
    const folder = args.materials.get(i)
    if (!folder || folder.length === 0) {
      sections.push(`### §${i}\n（无外部资料——可用模型自身知识，但禁止编造具体数字、日期、履历；拿不准就讲议题语境而非人物事实）`)
    } else {
      const items = folder.map((m) => `- ${m.title}\n  ${m.url}\n  ${m.snippet}`).join('\n')
      sections.push(`### §${i}\n${items}`)
    }
  }
  return `Article title: ${args.articleTitle ?? '未命名文章'}

${args.articleContent}

---

## 各章节背景资料夹（§ 编号与正文章节一一对应；写某章时只用该章的资料）

${sections.join('\n\n')}`
}
```

- [ ] **Step 4: prompt 文件 `electron/prompts/blog-guide-v2.md`**

```markdown
You are a veteran AI practitioner writing a reading companion for a smart beginner. Given a long-form AI article, produce a Chinese reading guide in JSON.

## Output format

Return ONLY a JSON object matching this schema. Do not wrap it in markdown code blocks or add explanatory prose.

{
  "background": "整体一段：把这篇文章放进当下 AI 领域的语境——它踩在哪个故事线上、为什么此时出现（见下方写作任务）。",
  "chunks": [
    {
      "heading": "原文中的 H2 或 H3 标题，保持原语言，不要翻译",
      "summary": "用中文概括这一章的核心内容（章节总结，见下方写作任务）。",
      "terms": [
        {
          "term": "英文或技术术语",
          "translation": "中文翻译，并在括号中保留英文原文，例如：上下文（context）",
          "explanation": "用 2-3 句中文解释这个概念"
        }
      ]
    }
  ]
}

## 写作任务

### background（整体背景）

读者自己会读正文。background 只写正文没说的语境：

1. 这篇文章踩在哪个正在进行的故事线上？（某场争论、某个技术脉络、作者机构的战略走向）
2. 作者/机构是谁？为什么这个声音在此话题上有分量？
3. 初学者读这篇时，最缺的是哪块拼图？

优先使用随附资料夹中对应 § 编号的材料；写某章相关的背景时只用对应资料，不得挪用。资料夹标注"无外部资料"时可用模型自身知识，但禁止编造具体数字、日期、履历；拿不准就讲议题语境而非人物事实。

### summary（章节总结）

概括该章的核心论点与关键信息，让读者在跳读/回顾时快速定位。总结的对象是正文本身——这与 background 的"不复述"要求相反，不要混淆：

- 写出本章的主张和支撑它的关键机制/数据，不是"本章讨论了 X"式的空转述。
- 长度 1-3 句，密度优先。

### terms

每章 0-3 个，只收初学者 genuinely 需要解释的术语。

## 语言风格

- 平实准确：不写空话套话（"命题""范式""赋能"之类抽象名词堆叠），也不刻意口语化、刻意通俗。
- 判断落实成具体的人、事、数字；措辞以准确为先，深浅自然。
- 术语首次出现由名词解释（terms）兜底，行文保持通畅即可。

## Constraints

- Split the article by H2/H3 headings, one chunk per section, in original order.
- Each chunk may have 0-3 terms. Only include terms that genuinely need explanation.
- All output must be in Chinese (headings excepted).
- For technical terms, give the Chinese equivalent first, followed by the original English in parentheses, e.g., 上下文（context）. 不要嵌套重复，禁止出现「LLM（大语言模型（LLM））」这类写法。
- Do not translate headings; keep the exact original heading text.
- Do not output "Vol.", "AI Builders Digest", "Generated through", "档案编号", "学习卷宗", or any other decorative metadata.
- If the article has no clear headings, return a single chunk with heading "全文".
- 空字段用 ""，不要省略字段。
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run tests/article-assistant/guide-v2.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add electron/lib/guide-v2.ts electron/prompts/blog-guide-v2.md tests/article-assistant/guide-v2.test.ts
git commit -m "feat(guide): 博客导读 v2 纯逻辑——summary 校验器 + 章节规划/撰写 prompt"
```

---

### Task 6: 导读管线泛化（runBlogGuideV2）

**Files:**
- Modify: `electron/lib/guide-v2-pipeline.ts:38-137`
- Test: `tests/article-assistant/guide-v2-pipeline.test.ts`

**Interfaces:**
- Consumes: Task 5 的 `isValidGuideBlogV2` / `buildBlogGuidePlanPrompt` / `buildBlogGuideV2UserPrompt`
- Produces:
  - `runBlogGuideV2(cfg, args, onProgress): Promise<ArticleAssistantGuide>`（与 `runDigestGuideV2` 同签名）
  - 内部 `GuideV2Hooks = { buildPlanPrompt, buildUserPrompt, validate }`；`runDigestGuideV2` 行为零变化

- [ ] **Step 1: Write the failing test**

`tests/article-assistant/guide-v2-pipeline.test.ts` 追加 import `runBlogGuideV2`，并加 describe：

```ts
const VALID_BLOG_GUIDE = JSON.stringify({
  background: 'bg',
  chunks: [
    { heading: '一', summary: '第一章总结', terms: [] },
    { heading: '二', summary: '第二章总结', terms: [] },
  ],
})

describe('runBlogGuideV2 编排', () => {
  beforeEach(() => {
    vi.mocked(chatStream).mockImplementation(async (_c, _a, onChunk) => {
      onChunk(VALID_BLOG_GUIDE)
    })
  })

  it('产出 summary 形状的博客导读', async () => {
    vi.mocked(chatNonStream).mockResolvedValue('not json at all')
    const guide = await runBlogGuideV2(CFG, ARGS, () => {})
    expect(guide.chunks).toHaveLength(2)
    expect(guide.chunks[0].summary).toBe('第一章总结')
  })

  it('规划两次畸形 JSON → 重试 1 次后降级无搜索照常生成', async () => {
    vi.mocked(chatNonStream).mockResolvedValue('not json at all')
    await runBlogGuideV2(CFG, ARGS, () => {})
    expect(vi.mocked(chatNonStream).mock.calls.length).toBe(2)
    expect(searchWeb).not.toHaveBeenCalled()
    const userContent = vi.mocked(chatStream).mock.calls[0][1].messages[1].content as string
    expect(userContent).toContain('无外部资料')
  })

  it('digest context 形状在博客管线被判非法 → GUIDE_JSON_ERROR', async () => {
    vi.mocked(chatStream).mockImplementation(async (_c, _a, onChunk) => {
      onChunk(VALID_GUIDE) // digest 形状（context 而非 summary）
    })
    await expect(runBlogGuideV2(CFG, ARGS, () => {})).rejects.toMatchObject({ code: 'GUIDE_JSON_ERROR' })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/article-assistant/guide-v2-pipeline.test.ts`
Expected: FAIL（`runBlogGuideV2` 未导出）

- [ ] **Step 3: 实现——抽出 hooks，digest/blog 双入口**

`electron/lib/guide-v2-pipeline.ts`：import 行追加 `buildBlogGuidePlanPrompt, buildBlogGuideV2UserPrompt, isValidGuideBlogV2`。把 `runDigestGuideV2` 的函数体（:42-137）改为内部通用函数，三处 digest 专属调用换成 hooks：

```ts
export interface GuideV2Hooks {
  buildPlanPrompt: (articleContent: string, articleTitle?: string) => string
  buildUserPrompt: (args: {
    articleContent: string
    articleTitle?: string
    materials: Map<number, GuideMaterial[]>
    entryCount: number
  }) => string
  validate: (guide: unknown) => guide is ArticleAssistantGuide
}

/**
 * 导读 v2 三阶段管线：检索规划 → 并行搜索（按条目归档）→ 流式撰写。
 * 降级：规划失败重试 1 次后跳过搜索；单查询失败仅置空对应资料夹；无 API key 全部走模型自身知识。
 */
async function runGuideV2(
  cfg: AppConfig,
  args: { system: string; articleContent: string; articleTitle?: string; entriesTotal?: number },
  hooks: GuideV2Hooks,
  onProgress: (p: GuideProgress) => void
): Promise<ArticleAssistantGuide> {
  // 函数体 = 原 runDigestGuideV2 实现，仅三处替换：
  //   buildGuidePlanPrompt(args.articleContent, args.articleTitle) → hooks.buildPlanPrompt(...)
  //   buildGuideV2UserPrompt({...})                              → hooks.buildUserPrompt({...})
  //   isValidGuideV2(guide)                                      → hooks.validate(guide)
}

export function runDigestGuideV2(
  cfg: AppConfig,
  args: { system: string; articleContent: string; articleTitle?: string; entriesTotal?: number },
  onProgress: (p: GuideProgress) => void
): Promise<ArticleAssistantGuide> {
  return runGuideV2(cfg, args, {
    buildPlanPrompt: buildGuidePlanPrompt,
    buildUserPrompt: buildGuideV2UserPrompt,
    validate: isValidGuideV2,
  }, onProgress)
}

export function runBlogGuideV2(
  cfg: AppConfig,
  args: { system: string; articleContent: string; articleTitle?: string; entriesTotal?: number },
  onProgress: (p: GuideProgress) => void
): Promise<ArticleAssistantGuide> {
  return runGuideV2(cfg, args, {
    buildPlanPrompt: buildBlogGuidePlanPrompt,
    buildUserPrompt: buildBlogGuideV2UserPrompt,
    validate: isValidGuideBlogV2,
  }, onProgress)
}
```

（`GuideMaterial` 类型需从 guide-v2.ts 补进 import 列表。）

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/article-assistant/guide-v2-pipeline.test.ts`
Expected: 既有 digest 用例 + 新增 blog 用例全部 PASS

- [ ] **Step 5: Commit**

```bash
git add electron/lib/guide-v2-pipeline.ts tests/article-assistant/guide-v2-pipeline.test.ts
git commit -m "feat(guide): 管线泛化 hooks——新增 runBlogGuideV2"
```

---

### Task 7: generateGuide 路由 + 导读版本语义（writeGuide / parseAssistantGuideBody / isGuideCacheCurrent / store 进度）

**Files:**
- Modify: `electron/ipc/article-assistant.ts:261-336`（E2E mock）、`:338-399`（路由）、`:666`（writeGuide isV2）、`:106-150`（parseAssistantGuideBody 签名与回填）、`:708`（readGuide 调用点）
- Modify: `src/lib/guide-progress.ts:17-24`（isGuideCacheCurrent）
- Modify: `src/store/index.ts:2112`（guideProgress 初始化条件）
- Test: `tests/guide-progress.test.ts`、`tests/article-assistant-guide-ipc.test.ts`

**Interfaces:**
- Consumes: `runBlogGuideV2`（Task 6）、prompt 文件 `blog-guide-v2.md`（Task 5）
- Produces:
  - `articleAssistant:generateGuide`：`anthropic-article` 走 blog v2 管线；`web-article` 保持 v1；`briefing` 不变
  - `parseAssistantGuideBody(body, guideVersion?, parentType?)`——context 回填仅 briefing
  - `isGuideCacheCurrent`：`briefing` / `anthropic-article` 要求 `guide_version >= 2`；`web-article` / `writing` 永远有效
  - `writeGuide`：`parentType` 为 `briefing` / `anthropic-article` 时恒写 `guide_version: 2`

- [ ] **Step 1: 更新 pipeline mock + Write the failing tests**

`tests/article-assistant-guide-ipc.test.ts:20-22` 的 mock 必须补 `runBlogGuideV2`（否则 article-assistant.ts import 新符号后为 undefined）：

```ts
vi.mock('../electron/lib/guide-v2-pipeline', () => ({
  runDigestGuideV2: vi.fn(() => new Promise(() => {})),
  runBlogGuideV2: vi.fn(() => new Promise(() => {})),
}))
```

追加测试：

```ts
describe('generateGuide routing', () => {
  it('anthropic-article 走 blog v2 管线', async () => {
    const { runBlogGuideV2, runDigestGuideV2 } = await import('../electron/lib/guide-v2-pipeline')
    const blogGuide = { background: 'bg', chunks: [{ heading: 'H', summary: 'S', terms: [] }] }
    vi.mocked(runBlogGuideV2).mockResolvedValueOnce(blogGuide as never)
    const event = { sender: { isDestroyed: () => false, send: vi.fn() } }
    const result = await handlers['articleAssistant:generateGuide'](event as never, {
      articleContent: '## H\nx',
      articleType: 'anthropic-article',
      articleTitle: 'T',
    } as never)
    expect(runBlogGuideV2).toHaveBeenCalledOnce()
    expect(runDigestGuideV2).not.toHaveBeenCalled()
    expect(result).toEqual(blogGuide)
  })
})

describe('parseAssistantGuideBody parentType', () => {
  const body = '# 背景\n\nbg.\n\n## §1 H\n\n章节文本。'
  it('v2 + briefing 回填 context', () => {
    const g = parseAssistantGuideBody(body, 2, 'briefing')
    expect(g!.chunks[0].context).toBe('章节文本。')
  })
  it('v2 + anthropic-article 不回填 context（博客 v2 保留 summary 语义）', () => {
    const g = parseAssistantGuideBody(body, 2, 'anthropic-article')
    expect(g!.chunks[0].summary).toBe('章节文本。')
    expect(g!.chunks[0].context).toBeUndefined()
  })
})

describe('writeGuide version', () => {
  it('anthropic-article + summary-only 导读也写 guide_version: 2', async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sp-guide-'))
    registerArticleAssistantIpc({ libraryPath: tmp } as unknown as AppConfig)
    fs.mkdirSync(path.join(tmp, 'Anthropic博客', '2026-08'), { recursive: true })
    fs.writeFileSync(path.join(tmp, 'Anthropic博客', '2026-08', 'a.md'), 'x')
    const result = await handlers['articleAssistant:writeGuide'](null as never, {
      parentPath: 'Anthropic博客/2026-08/a.md',
      parentType: 'anthropic-article',
      guide: { background: 'bg', chunks: [{ heading: 'H', summary: 'S', terms: [] }] },
    } as never) as { filePath: string }
    const raw = fs.readFileSync(result.filePath, 'utf8')
    expect(raw).toContain('guide_version: 2')
    fs.rmSync(tmp, { recursive: true, force: true })
  })
})
```

（`handlers` 注册注意：文件顶部 `registerArticleAssistantIpc` 若已在 beforeEach 注册过，重复注册会覆盖 handlers——以该文件既有注册方式为准对齐；writeGuide 测试用独立 tmp 目录即可。）

`tests/guide-progress.test.ts` 追加：

```ts
describe('isGuideCacheCurrent anthropic-article', () => {
  it('旧 v1 博客导读（无版本）失效', () => {
    expect(isGuideCacheCurrent('anthropic-article', undefined)).toBe(false)
    expect(isGuideCacheCurrent('anthropic-article', 1)).toBe(false)
  })
  it('v2 博客导读命中', () => {
    expect(isGuideCacheCurrent('anthropic-article', 2)).toBe(true)
  })
  it('web-article / writing 不受版本约束', () => {
    expect(isGuideCacheCurrent('web-article', undefined)).toBe(true)
    expect(isGuideCacheCurrent('writing', undefined)).toBe(true)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/guide-progress.test.ts tests/article-assistant-guide-ipc.test.ts`
Expected: 新用例 FAIL（anthropic-article 未路由 v2 / 版本判定未扩展 / parse 无 parentType 参）

- [ ] **Step 3: 实现**

1. `electron/ipc/article-assistant.ts` import 加 `runBlogGuideV2`（与 `runDigestGuideV2` 同行）。

2. E2E mock 分支（:308 `const mockGuide` 之前）为 anthropic-article 补进度事件：

```ts
        if (args.articleType === 'anthropic-article') {
          // 博客 v2 mock：合成三阶段进度事件（与 briefing mock 同节奏），返回 summary 形状导读
          const entriesTotal = Math.max(args.entriesTotal ?? 1, 1)
          send('articleAssistant:guideProgress', { stage: 'planning' })
          await sleep(400)
          send('articleAssistant:guideProgress', { stage: 'searching', done: 1, total: 1 })
          await sleep(500)
          for (let i = 1; i <= 3; i++) {
            await sleep(400)
            send('articleAssistant:guideProgress', {
              stage: 'writing',
              chars: i * 200,
              entriesDone: Math.min(i - 1, entriesTotal),
              entriesTotal,
            })
          }
        }
```

3. 路由：在 briefing 分支（:339-358）之后、旧路径（:360-399）之前插入：

```ts
      // 博客走 v2 管线（搜索增强背景 + 保留章节总结）；web-article 沿用旧单次调用
      if (args.articleType === 'anthropic-article') {
        const blogPromptPath = path.join(promptsDir(), 'blog-guide-v2.md')
        const systemBlog = fs.existsSync(blogPromptPath) ? fs.readFileSync(blogPromptPath, 'utf8') : ''
        try {
          return await runBlogGuideV2(
            cfg,
            {
              system: systemBlog,
              articleContent: args.articleContent,
              articleTitle: args.articleTitle,
              entriesTotal: args.entriesTotal,
            },
            (p) => send('articleAssistant:guideProgress', p)
          )
        } catch (err) {
          const code = (err as Error & { code?: string }).code
          if (code === 'GUIDE_JSON_ERROR' || code === 'GUIDE_ABORT') throw err
          throw typedError('GUIDE_LLM_ERROR', err instanceof Error ? err.message : String(err))
        }
      }
```

旧路径注释（:360）改为 `// 旧路径（web-article）`。

4. `parseAssistantGuideBody`（:106）签名与回填逻辑：

```ts
export function parseAssistantGuideBody(
  body: string,
  guideVersion?: number,
  parentType?: 'briefing' | 'anthropic-article' | 'web-article' | 'writing'
): ArticleAssistantGuide | null {
  // v2 回填语义：digest 的正文段是 context（背景铺陈），回读必须回填 context，
  // 否则 session 里的 guide 丢失 context 后被 persistAssistantState 重写 → 缓存降级。
  // 博客 v2 的正文段是 summary（章节总结），不回填 context。
  const isV2 = (guideVersion ?? 1) >= GUIDE_FORMAT_VERSION
  const backfillContext = isV2 && parentType === 'briefing'
```

:145 的 push 改为：

```ts
    chunks.push(
      backfillContext
        ? { heading, summary: text, context: text, terms }
        : { heading, summary: text, terms }
    )
```

（原 `isV2 ?` 三元删除。注意：briefing 之外传 guideVersion>=2 时旧行为也回填 context——语义修正，digest 是唯一 context 消费者。）

5. `readGuide`（:708）调用点：`parseAssistantGuideBody(body, guideVersion, args.parentType)`。

6. `writeGuide`（:666）isV2 判定：

```ts
      const isV2 =
        args.parentType === 'briefing' ||
        args.parentType === 'anthropic-article' ||
        args.guide.chunks.some((c) => typeof c.context === 'string' && c.context.length > 0)
```

7. `src/lib/guide-progress.ts:17-24`：

```ts
/** 导读缓存版本判定：web-article / writing 永远有效；briefing 与 anthropic-article 需要 v2 */
export function isGuideCacheCurrent(
  contextType: 'briefing' | 'anthropic-article' | 'web-article' | 'writing',
  guideVersion: number | undefined
): boolean {
  if (contextType === 'web-article' || contextType === 'writing') return true
  return (guideVersion ?? 1) >= GUIDE_FORMAT_VERSION
}
```

8. `src/store/index.ts:2112`：

```ts
    set({ assistantSession: { ...s, guideLoading: true, guideError: null, guideProgress: s.contextType === 'briefing' || s.contextType === 'anthropic-article' ? { stage: 'planning' } : null } })
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/guide-progress.test.ts tests/article-assistant-guide-ipc.test.ts tests/store-article-assistant.test.ts`
Expected: PASS（第三个文件确认 store 改动无回归）

- [ ] **Step 5: 类型检查 + Commit**

```bash
tsc --noEmit && tsc --noEmit -p tsconfig.node.json
git add electron/ipc/article-assistant.ts src/lib/guide-progress.ts src/store/index.ts tests/guide-progress.test.ts tests/article-assistant-guide-ipc.test.ts
git commit -m "feat(guide): anthropic-article 路由博客 v2 管线 + 导读版本语义扩展到博客"
```

---

### Task 8: UI——合并时间线 + 栏目色签 + 多选过滤 + 栏目失败提示

**Files:**
- Modify: `src/lib/anthropic-articles.ts`（新增 sortArticlesByDateDesc）
- Modify: `src/components/anthropic/AnthropicBlogPanel.tsx:60`（sectionStatus 选择器）、`:75-95`（过滤状态与 memo）、`:163-298`（列表列 JSX）、`:168`（title）
- Modify: `src/components/anthropic/AnthropicArticleRow.tsx:176-194`（meta 行 + 色签）
- Test: `tests/anthropic-articles.test.ts`、`tests/anthropic-blog-panel.test.tsx`、`tests/anthropic-article-row.test.tsx`

**Interfaces:**
- Consumes: `ANTHROPIC_SECTIONS` / `sectionOf`（Task 1 渲染副本）、`anthropicBlogCache.sectionStatus`（Task 4）
- Produces:
  - `sortArticlesByDateDesc(articles: AnthropicArticleMeta[]): AnthropicArticleMeta[]`（local 条目在前，其余按 publishedAt 倒序、缺失排尾）
  - testid：`anthropic-section-filter`、`anthropic-section-chip`（带 `data-section`）、`anthropic-section-tag`、`anthropic-section-error`（带 `data-section`）

- [ ] **Step 1: Write the failing tests**

`tests/anthropic-articles.test.ts` 追加：

```ts
describe('sortArticlesByDateDesc', () => {
  it('local 条目在前，其余按 publishedAt 倒序，缺失日期排尾', () => {
    const a = (url: string, publishedAt: string | null, local?: 'constitution') =>
      ({ url, title: url, summary: null, publishedAt, imageUrl: null, local })
    const sorted = sortArticlesByDateDesc([
      a('old', '2026-07-01T00:00:00.000Z'),
      a('const', null, 'constitution'),
      a('new', '2026-08-05T00:00:00.000Z'),
      a('nodate', null),
    ])
    expect(sorted.map((x) => x.url)).toEqual(['const', 'new', 'old', 'nodate'])
  })
})
```

`tests/anthropic-blog-panel.test.tsx` 追加（helper `article(url, title)` 返回对象上展开覆盖字段）：

```ts
  it('合并时间线按日期倒序渲染，色签过滤可切换', async () => {
    useStore.setState({
      anthropicBlogCache: {
        lastFetchedAt: null,
        articles: [
          { ...article('e1', 'Eng Old'), section: 'engineering', publishedAt: '2026-07-01T00:00:00.000Z' },
          { ...article('i1', 'Inst New'), section: 'institute', publishedAt: '2026-08-05T00:00:00.000Z' },
          { ...article('r1', 'Res Mid'), section: 'research', publishedAt: '2026-08-01T00:00:00.000Z' },
        ],
        loading: false,
        error: null,
        sectionStatus: {},
      },
    } as any)
    render(<AnthropicBlogPanel theme="academic" />)
    const titles = screen.getAllByTestId('anthropic-article-title').map((el) => el.textContent)
    expect(titles).toEqual(['Inst New', 'Res Mid', 'Eng Old'])

    fireEvent.click(screen.getByTestId('anthropic-section-filter').querySelector('[data-section="institute"]')!)
    await waitFor(() => {
      const rest = screen.getAllByTestId('anthropic-article-title').map((el) => el.textContent)
      expect(rest).toEqual(['Res Mid', 'Eng Old'])
    })
  })

  it('栏目失败时显示重试提示', () => {
    useStore.setState({
      anthropicBlogCache: {
        lastFetchedAt: null,
        articles: [article('e1', 'Eng')],
        loading: false,
        error: null,
        sectionStatus: { institute: { fetchedAt: null, error: { code: 'parse-error', message: '解析页面失败' } } },
      },
    } as any)
    render(<AnthropicBlogPanel theme="academic" />)
    const banner = screen.getByTestId('anthropic-section-error')
    expect(banner).toHaveAttribute('data-section', 'institute')
    expect(banner.textContent).toContain('Institute')
    fireEvent.click(banner)
    expect(useStore.getState().discoverAnthropicArticles).toHaveBeenCalled()
  })
```

（注意 beforeEach 里 `discoverAnthropicArticles` 被 setState 成 mock——第三条断言依赖它；若该 mock 在 auto-detect effect 中被消耗，断言 `toHaveBeenCalled` 仍成立。）

`tests/anthropic-article-row.test.tsx` 追加：

```ts
  it('renders section tag for non-local article', () => {
    render(<AnthropicArticleRow article={{ ...baseArticle, section: 'institute' }} theme="academic" />)
    const tag = screen.getByTestId('anthropic-section-tag')
    expect(tag.textContent).toBe('Institute')
  })

  it('no section tag for constitution entry', () => {
    render(<AnthropicArticleRow article={{ ...baseArticle, local: 'constitution' }} theme="academic" />)
    expect(screen.queryByTestId('anthropic-section-tag')).not.toBeInTheDocument()
  })
```

（`baseArticle` 以该文件既有 fixture 为准对齐；旧文章无 section 时 `sectionOf` 从 URL 回推，engineering URL 也渲染 `Engineering` 签——这是预期行为，可在测试里固定。）

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/anthropic-articles.test.ts tests/anthropic-blog-panel.test.tsx tests/anthropic-article-row.test.tsx`
Expected: 新用例 FAIL

- [ ] **Step 3: sortArticlesByDateDesc**

`src/lib/anthropic-articles.ts` 追加：

```ts
/** 合并时间线排序：本地内置条目（宪法报告）始终在前，其余按 publishedAt 倒序（缺失排尾） */
export function sortArticlesByDateDesc(articles: AnthropicArticleMeta[]): AnthropicArticleMeta[] {
  const local = articles.filter((a) => a.local)
  const rest = articles.filter((a) => !a.local)
  rest.sort((a, b) => (b.publishedAt ?? '').localeCompare(a.publishedAt ?? ''))
  return [...local, ...rest]
}
```

- [ ] **Step 4: AnthropicBlogPanel**

import 区加：

```ts
import { ANTHROPIC_SECTIONS, sectionOf } from '@/lib/anthropic-sections'
import { sortArticlesByDateDesc } from '@/lib/anthropic-articles'
import type { AnthropicSectionKey } from '@shared/index'
```

（`findNewArticleUrls` 的既有 import 与 `sortArticlesByDateDesc` 合并为一行。）

`:60` 选择器改：

```ts
  const { articles, loading, error, lastFetchedAt, sectionStatus } = useStore((s) => s.anthropicBlogCache)
```

`:75` 后加状态：

```ts
  const [activeSections, setActiveSections] = useState<ReadonlySet<AnthropicSectionKey>>(
    () => new Set(ANTHROPIC_SECTIONS.map((s) => s.key))
  )
```

`:85` displayArticles 改：

```ts
  const displayArticles = useMemo(() => sortArticlesByDateDesc(withConstitutionEntry(articles)), [articles])
```

`:87-95` filtered 改：

```ts
  const filtered = useMemo(() => {
    const bySection = displayArticles.filter(
      (a) => a.local === 'constitution' || activeSections.has(sectionOf(a))
    )
    const q = query.trim().toLowerCase()
    if (!q) return bySection
    return bySection.filter(
      (a) =>
        a.title?.toLowerCase().includes(q) ||
        (a.summary ?? '').toLowerCase().includes(q)
    )
  }, [displayArticles, query, activeSections])
```

`:168` title 改：`title="Anthropic 博客"`。

checkError 块（:212-231）之后插入栏目失败提示：

```tsx
            {ANTHROPIC_SECTIONS.filter((s) => sectionStatus?.[s.key]?.error).map((s) => (
              <div key={s.key} className={`px-4 py-2 border-b ${themeClasses.border} shrink-0`}>
                <button
                  type="button"
                  data-testid="anthropic-section-error"
                  data-section={s.key}
                  onClick={() => discover()}
                  disabled={loading}
                  className={`flex items-center gap-2 text-xs rounded transition-colors ${
                    isAcademic
                      ? 'text-wine hover:bg-wine/10'
                      : 'text-[#8a3a3a] hover:bg-[#8a3a3a]/10'
                  }`}
                >
                  <span>{s.label} 栏目更新失败：{sectionStatus?.[s.key]?.error?.message || '点击重试'}</span>
                </button>
              </div>
            ))}
```

搜索框块（:254-262）之后插入色签过滤行：

```tsx
            <div className={`px-4 py-2 border-b ${themeClasses.border} shrink-0`} data-testid="anthropic-section-filter">
              <div className="flex flex-wrap gap-1.5">
                {ANTHROPIC_SECTIONS.map((s) => {
                  const active = activeSections.has(s.key)
                  return (
                    <button
                      key={s.key}
                      type="button"
                      data-testid="anthropic-section-chip"
                      data-section={s.key}
                      aria-pressed={active}
                      onClick={() =>
                        setActiveSections((prev) => {
                          const next = new Set(prev)
                          if (next.has(s.key)) next.delete(s.key)
                          else next.add(s.key)
                          return next
                        })
                      }
                      className={`px-2 py-0.5 rounded-full border text-[10px] transition-colors ${active ? '' : themeClasses.muted}`}
                      style={active ? { borderColor: s.color, color: s.color } : { borderColor: 'transparent' }}
                    >
                      {s.label}
                    </button>
                  )
                })}
              </div>
            </div>
```

- [ ] **Step 5: AnthropicArticleRow 色签**

import 区加：

```ts
import { ANTHROPIC_SECTIONS, sectionOf } from '@/lib/anthropic-sections'
```

组件内（`:98` 边框逻辑之前）加：

```ts
  const section = article.local === 'constitution'
    ? null
    : ANTHROPIC_SECTIONS.find((s) => s.key === sectionOf(article)) ?? null
```

日期 `<p>`（:176-182）之后、`article.local === 'constitution'` pill 块之前插入：

```tsx
          {section && (
            <span
              data-testid="anthropic-section-tag"
              className="inline-block mt-1.5 px-2 py-0.5 rounded-full border text-[10px]"
              style={{ borderColor: `${section.color}66`, color: section.color }}
            >
              {section.label}
            </span>
          )}
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `npx vitest run tests/anthropic-articles.test.ts tests/anthropic-blog-panel.test.tsx tests/anthropic-article-row.test.tsx`
Expected: PASS

- [ ] **Step 7: 类型检查 + Commit**

```bash
tsc --noEmit && tsc --noEmit -p tsconfig.node.json
git add src/lib/anthropic-articles.ts src/components/anthropic/AnthropicBlogPanel.tsx src/components/anthropic/AnthropicArticleRow.tsx tests/anthropic-articles.test.ts tests/anthropic-blog-panel.test.tsx tests/anthropic-article-row.test.tsx
git commit -m "feat(anthropic): 合并时间线 + 栏目色签多选过滤 + 栏目失败重试提示"
```

---

### Task 9: E2E——多栏目 spec + BASE_STATE 同步 + source-map

**Files:**
- Modify: `e2e/helpers/test-library.ts:461`（BASE_STATE.anthropicBlogCache）
- Create: `e2e/specs/anthropic-blog-sections.spec.ts`
- Modify: `e2e/source-map.json`（anthropic-blog group）

**Interfaces:**
- Consumes: Task 8 的 testid、Task 7 的 E2E mock 进度事件
- Produces: `@p1` 多栏目 E2E 覆盖（合并时间线 / 色签过滤 / 栏目失败提示 / 博客导读 v2 进度与渲染）

- [ ] **Step 1: BASE_STATE 同步**

`e2e/helpers/test-library.ts:461` 改为：

```ts
  anthropicBlogCache: { lastFetchedAt: null, articles: [], loading: false, error: null, sectionStatus: {} },
```

- [ ] **Step 2: 新 spec `e2e/specs/anthropic-blog-sections.spec.ts`**

完整代码（seed 模式对齐 `anthropic-blog-image.spec.ts`，导读 mock 在所有 E2E 自动生效——`isE2EMock()` = `NODE_ENV==='test' && E2E_CONFIG_DIR`，见 `article-assistant.ts:40-42`）：

```ts
import { test, expect } from '../fixtures/electron'
import { CoverPage } from '../pages/CoverPage'
import { SELECTORS } from '../helpers/selectors'
import { seedAnthropicArticle, seedStateJson } from '../helpers/test-library'

const SEL = {
  sectionChip: '[data-testid="anthropic-section-chip"]',
  sectionTag: '[data-testid="anthropic-section-tag"]',
  sectionError: '[data-testid="anthropic-section-error"]',
}

const PROFILE = { name: 'E2E 测试员', profile_text: '', preferred_topics: [] }

function seedSectionArticle(
  testLibraryPath: string,
  section: 'engineering' | 'institute' | 'research',
  slug: string,
  title: string,
  publishedAt: string,
  body: string
) {
  const url = `https://www.anthropic.com/${section}/${slug}`
  const filePath = seedAnthropicArticle(testLibraryPath, slug, title, body, {
    source_url: url,
    section,
    published_at: publishedAt,
    tags: ['anthropic', section],
  })
  return { url, title, summary: null, publishedAt, imageUrl: null, isSaved: true, filePath, section }
}

test.describe('Anthropic 多栏目 @p1', () => {
  test('E2E-SEC-1: 合并时间线 + 色签过滤 + 栏目失败提示', async ({
    window,
    testLibraryPath,
    testConfigDir,
  }) => {
    const articles = [
      seedSectionArticle(testLibraryPath, 'engineering', 'e2e-eng-old', 'E2E Eng Old', '2026-07-01T00:00:00.000Z', '## 一\n\n工程旧文。'),
      seedSectionArticle(testLibraryPath, 'institute', 'e2e-ins-new', 'E2E Inst New', '2026-08-05T00:00:00.000Z', '## 甲\n\n机构新文。\n\n## 乙\n\n第二节。'),
      seedSectionArticle(testLibraryPath, 'research', 'e2e-res-mid', 'E2E Res Mid', '2026-08-01T00:00:00.000Z', '## 研究\n\n研究中文。'),
    ]
    seedStateJson(testConfigDir, {
      profile: PROFILE,
      briefingSource: 'anthropic',
      anthropicBlogCache: {
        lastFetchedAt: new Date().toISOString(),
        articles,
        loading: false,
        error: null,
        sectionStatus: {
          institute: { fetchedAt: null, error: { code: 'parse-error', message: '解析页面失败，Anthropic 网站结构可能已变更' } },
        },
      },
    })

    const cover = new CoverPage(window)
    await cover.goToBriefing()
    await expect(window.locator(SELECTORS.briefing.anthropicPanel)).toBeVisible()

    // 栏目色签行：三个 chip
    await expect(window.locator(SEL.sectionChip)).toHaveCount(3)

    // 合并时间线：seeded 三篇按 publishedAt 倒序（宪法条目在 E2E 无报告产物不出现）
    const titles = await window.locator(SELECTORS.briefing.anthropicArticleTitle).allTextContents()
    expect(titles.filter((t) => t.startsWith('E2E'))).toEqual(['E2E Inst New', 'E2E Res Mid', 'E2E Eng Old'])

    // 行内色签可见
    await expect(window.locator(SEL.sectionTag).first()).toBeVisible()

    // 色签过滤：关掉 research → Res Mid 消失；再点开恢复
    await window.locator(`${SEL.sectionChip}[data-section="research"]`).click()
    await expect(
      window.locator(SELECTORS.briefing.anthropicArticleTitle).filter({ hasText: 'E2E Res Mid' })
    ).toHaveCount(0)
    await expect(
      window.locator(SELECTORS.briefing.anthropicArticleTitle).filter({ hasText: 'E2E Inst New' })
    ).toHaveCount(1)
    await window.locator(`${SEL.sectionChip}[data-section="research"]`).click()
    await expect(
      window.locator(SELECTORS.briefing.anthropicArticleTitle).filter({ hasText: 'E2E Res Mid' })
    ).toHaveCount(1)

    // 栏目失败提示（institute）
    const banner = window.locator(`${SEL.sectionError}[data-section="institute"]`)
    await expect(banner).toBeVisible()
    await expect(banner).toContainText('Institute')
  })

  test('E2E-SEC-2: 打开 institute 文章自动生成博客导读 v2', async ({
    window,
    testLibraryPath,
    testConfigDir,
  }) => {
    const article = seedSectionArticle(
      testLibraryPath,
      'institute',
      'e2e-ins-guide',
      'E2E Inst Guide',
      '2026-08-05T00:00:00.000Z',
      '## 甲\n\n第一节。\n\n## 乙\n\n第二节。'
    )
    seedStateJson(testConfigDir, {
      profile: PROFILE,
      briefingSource: 'anthropic',
      anthropicBlogCache: {
        lastFetchedAt: new Date().toISOString(),
        articles: [article],
        loading: false,
        error: null,
        sectionStatus: {},
      },
    })

    const cover = new CoverPage(window)
    await cover.goToBriefing()
    await expect(window.locator(SELECTORS.briefing.anthropicPanel)).toBeVisible()
    await window.locator(SELECTORS.briefing.anthropicArticleRow).first().click()
    await expect(window.locator(SELECTORS.briefing.anthropicArticleReader)).toBeVisible()

    // E2E mock（Task 7）为 anthropic-article 合成三阶段进度并返回 summary 形状导读（2 个 chunk）
    const chunks = window.locator(SELECTORS.briefing.guideChunk)
    await expect(chunks).toHaveCount(2, { timeout: 30000 })
    await expect(chunks.first()).toContainText('AI Safety')
  })
})
```

注意点：
- 面板挂载时会 auto-detect（`discover({commit:false})`），E2E 下走真实抓取但不写缓存——不断言其结果，与 `anthropic-blog-image.spec.ts` 现状一致。
- 全程 `data-testid` 选择器（`e2e.md` §6）；导读断言 pinning mock 文案（`AI Safety`）。
- 若 `SELECTORS.briefing` 无 `guideChunk` 之外需要的常量，spec 内联 `SEL` 即可（不强行进 selectors.ts）。

- [ ] **Step 3: source-map.json**

`anthropic-blog` group（:100-108）改为：

```json
    "anthropic-blog": {
      "sources": [
        "src/components/anthropic/**",
        "electron/ipc/anthropic.ts",
        "electron/lib/anthropic-scraper.ts",
        "electron/lib/anthropic-sections.ts",
        "src/lib/anthropic-articles.ts",
        "src/lib/anthropic-sections.ts"
      ],
      "specs": [
        "anthropic-blog*.spec.ts"
      ]
    },
```

再检查导读相关 group（覆盖 `article-assistant-guide.spec.ts` 的 group）sources 是否包含 `electron/ipc/article-assistant.ts`、`electron/lib/guide-v2*.ts`、`electron/lib/guide-v2-pipeline.ts`、`electron/prompts/**`、`src/lib/guide-progress.ts`——缺则补齐。

- [ ] **Step 4: 运行定向 E2E**

Run: `node scripts/e2e-changed.js --run`
Expected: anthropic-blog 相关 spec + 新 spec 全绿；无孤儿 spec WARNING（若有，补 source-map）

- [ ] **Step 5: Commit**

```bash
git add e2e/helpers/test-library.ts e2e/specs/anthropic-blog-sections.spec.ts e2e/source-map.json
git commit -m "test(e2e): 多栏目时间线/色签过滤/栏目失败/博客导读 v2 E2E + source-map 同步"
```

---

### Task 10: 真实 API 冒烟（博客导读 v2）+ 最终验证

**Files:**
- Create: `tests/blog-guide-v2-real.test.ts`
- Create: `tests/fixtures/blog-guide-v2-real-guide.json`（首次真实运行生成后提交）

**Interfaces:**
- Consumes: Task 5 的 blog prompt 构造器与校验器、`electron/prompts/blog-guide-v2.md`
- Produces: 默认运行的真实 API 回归（`e2e.md` §1b），`REAL_TEST_REPLAY=1` 零成本回放

- [ ] **Step 1: 写真实测试**

`tests/blog-guide-v2-real.test.ts`（模式逐行对齐 `tests/guide-v2-real.test.ts`，差异：fixture 为长文、校验器为 blog、replay 文件独立）：

```ts
/**
 * 真实 API 集成测试：博客导读 v2 的规划与生成（不含 Tavily 搜索——
 * getSearchApiKey 依赖 Electron safeStorage，node 环境不可用）。
 *
 * @vitest-environment node
 *
 * 默认运行（真实 API 调用，耗时约 1-3 分钟）。需要项目根目录 .env 配置
 * KIMI_API_KEY（非占位符）。
 * 回放：REAL_TEST_REPLAY=1 npx vitest run tests/blog-guide-v2-real.test.ts
 */

import { describe, it, expect, beforeAll } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { loadEnv, type AppConfig } from '../electron/env'
import { chatNonStream } from '../electron/lib/kimi'
import {
  buildBlogGuidePlanPrompt,
  buildBlogGuideV2UserPrompt,
  isValidGuideBlogV2,
  parseGuidePlan,
} from '../electron/lib/guide-v2'
import { extractJsonObject } from '../electron/lib/extract-json'

const BLOG_FIXTURE = `## The case for agents

Agents are models using tools in a loop. We argue most failures are context failures.

## Building effective context

Context engineering means curating what enters the context window at each step.

## Evaluation and iteration

Without evals, agent improvements are guesswork. We describe a lightweight eval harness.`

const REPLAY_FILE = path.resolve(__dirname, 'fixtures', 'blog-guide-v2-real-guide.json')
const REPLAY = process.env.REAL_TEST_REPLAY === '1'

// readDotEnv / beforeAll 与 tests/guide-v2-real.test.ts 完全相同（复制之）

describe('blog guide v2 real API', () => {
  it('planning produces valid queries within entry range', async () => {
    if (REPLAY) return
    const raw = await chatNonStream(cfg, {
      messages: [{ role: 'user', content: buildBlogGuidePlanPrompt(BLOG_FIXTURE, 'Agents') }],
      temperature: 0.3,
      thinking: { type: 'disabled' },
    })
    const plan = parseGuidePlan(raw, 10)
    for (const q of plan) {
      expect(q.query.length).toBeGreaterThan(0)
      expect(q.entries.length).toBeGreaterThan(0)
    }
  }, 120_000)

  it('generation yields a valid blog v2 guide (background + summary chunks)', async () => {
    let raw: string
    if (REPLAY) {
      raw = fs.readFileSync(REPLAY_FILE, 'utf8')
    } else {
      const system = fs.readFileSync(path.resolve(process.cwd(), 'electron/prompts/blog-guide-v2.md'), 'utf8')
      raw = await chatNonStream(cfg, {
        messages: [
          { role: 'system', content: system },
          {
            role: 'user',
            content: buildBlogGuideV2UserPrompt({
              articleContent: BLOG_FIXTURE,
              articleTitle: 'Agents',
              materials: new Map(),
              entryCount: 3,
            }),
          },
        ],
        temperature: 0.7,
        thinking: { type: 'enabled', reasoning_effort: 'max' },
      })
      fs.mkdirSync(path.dirname(REPLAY_FILE), { recursive: true })
      fs.writeFileSync(REPLAY_FILE, raw, 'utf8')
    }
    const extracted = extractJsonObject(raw)
    expect(extracted).toBeTruthy()
    const guide = JSON.parse(extracted!)
    expect(isValidGuideBlogV2(guide)).toBe(true)
    expect(guide.background.trim().length).toBeGreaterThan(0)
    for (const chunk of guide.chunks) {
      // 章节总结应有实质内容
      expect(chunk.summary!.length).toBeGreaterThan(10)
    }
  }, 300_000)
})
```

- [ ] **Step 2: 真实运行一次生成 replay fixture**

Run: `npx vitest run tests/blog-guide-v2-real.test.ts`
Expected: PASS（真实 API，1-3 分钟），并生成 `tests/fixtures/blog-guide-v2-real-guide.json`

- [ ] **Step 3: 回放验证**

Run: `REAL_TEST_REPLAY=1 npx vitest run tests/blog-guide-v2-real.test.ts`
Expected: PASS（秒级）

- [ ] **Step 4: 最终验证（定向）**

```bash
tsc --noEmit && tsc --noEmit -p tsconfig.node.json
npx vitest run tests/anthropic-sections.test.ts tests/anthropic.test.ts tests/frontmatter.test.ts tests/anthropic-sections-store.test.ts tests/article-assistant/guide-v2.test.ts tests/article-assistant/guide-v2-pipeline.test.ts tests/guide-progress.test.ts tests/article-assistant-guide-ipc.test.ts tests/anthropic-articles.test.ts tests/anthropic-blog-panel.test.tsx tests/anthropic-article-row.test.tsx
node scripts/e2e-changed.js --run
```

Expected: 全绿。

- [ ] **Step 5: Commit**

```bash
git add tests/blog-guide-v2-real.test.ts tests/fixtures/blog-guide-v2-real-guide.json
git commit -m "test(guide): 博客导读 v2 真实 API 冒烟 + replay fixture"
```

---

## Self-Review 记录

- **Spec 覆盖**：栏目配置(T1) / discover 多栏目+失败隔离(T2) / frontmatter section+tags(T3) / sectionStatus 缓存(T1+T2+T4) / 已存文章三层回退（frontmatter→URL→engineering：T3 写入 + T1 sectionOf/sectionForUrl 回推）/ 博客导读 v2 管线+prompt(T5+T6) / 路由+版本失效(T7) / C 布局 UI(T8) / E2E+source-map(T9) / 真实冒烟(T10)。✅
- **偏差声明**：spec 中「渲染层经 IPC 拿栏目配置」改为双副本静态模块（纯常量，IPC 无异步收益；先例 `GUIDE_FORMAT_VERSION`），双副本相等由 T1 测试强制。
- **占位符扫描**：所有代码步骤含完整代码；E2E spec 为可运行的完整 Playwright 代码。T7 writeGuide 测试的 `handlers` 注册方式以 `tests/article-assistant-guide-ipc.test.ts` 既有结构为准（该文件顶部已捕获 handlers）。
- **类型一致性**：`AnthropicSectionKey` / `AnthropicSectionStatus` / `sectionOf` / `sortArticlesByDateDesc` / `isValidGuideBlogV2` / `runBlogGuideV2` / `parseAssistantGuideBody(body, guideVersion?, parentType?)` 在产出/消费任务间签名一致。
