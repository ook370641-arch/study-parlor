# 夜航简报-前沿导读升级 v2（背景铺陈式）实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把夜航简报（digest）的导读从"复述正文的摘要"升级为"背景铺陈"（动态次数搜索 + 一次流式生成），其他文章类型保持旧路径。

**Architecture:** 主进程三阶段管线：检索规划（轻量 LLM，产出 `queries[{query, entries}]` 条目映射）→ 并行 Tavily 搜索（按条目归档资料夹）→ 流式生成（Kimi SSE，边收边发进度事件，收齐后 JSON 校验）。渲染层按 `guide_version` 做缓存失效，GuideSidebar 渲染 `context` 并展示三态进度。

**Tech Stack:** Electron 主进程 TypeScript、Kimi API（chatNonStream/chatStream）、Tavily（`electron/lib/search.ts` 的 `searchWeb`）、Zustand、Vitest、Playwright。

**Spec:** `docs/superpowers/specs/2026-08-04-digest-guide-v2-design.md`

## Global Constraints

- 只改 digest（`articleType === 'briefing'`）；anthropic-article / web-article 走旧路径，行为零变化。
- 验证只跑受影响测试，禁止全量（`.claude/rules/general.md` §9）：每个任务只跑该任务列出的测试文件。
- LLM 结构化输出必须走"提取 → 消毒 → 平衡校验 → 形状校验"（`.claude/rules/llm.md` §4），用 `extractJsonObject`，禁止直接 `JSON.parse` LLM 原文。
- 渲染进程禁止 import `electron/lib/**`（`.claude/rules/ipc-state.md` §5）；主进程未配置 `@`/`@shared` 以外的别名，跨进程共享的小工具在两侧各放一份并互注同步注释。
- 新增 IPC/事件按 types → handler → preload → facade → store → 组件 顺序五层同步（`.claude/rules/ipc-state.md` §1）。
- E2E mock 分支必须同时满足 `NODE_ENV==='test'` 且有 `E2E_CONFIG_DIR`（沿用现有 `isE2EMock()`）。
- 主进程 SSE 调用统一 `chatStream`（内部已带总/闲超时）；禁止新写 fetch。

---

### Task 1: 类型契约 + 两侧纯逻辑模块

**Files:**
- Modify: `src/types/index.ts:86-95`（`ArticleAssistantChunk`/`ArticleAssistantGuide`），`:119-123`（`ArticleAssistantGuideFile`），`:646-650`（IpcApi generateGuide），`:548-549` 附近（IpcApi 事件订阅区）
- Modify: `electron/lib/article-assistant-prompt.ts:42`（summary 变为可选后的编译兜底）
- Create: `src/lib/guide-progress.ts`
- Create: `electron/lib/guide-v2.ts`
- Test: `tests/guide-progress.test.ts`（新建）
- Test: `tests/article-assistant/guide-v2.test.ts`（新建）

**Interfaces:**
- Produces（后续任务依赖的确切签名）：
  - `ArticleAssistantChunk { heading: string; summary?: string; context?: string; terms: ArticleAssistantTerm[] }`
  - `GuideProgress = { stage: 'planning' } | { stage: 'searching'; done: number; total: number } | { stage: 'writing'; chars: number; entriesDone: number; entriesTotal: number }`
  - `ArticleAssistantGuideFile.guideVersion?: number`
  - `src/lib/guide-progress.ts`: `GUIDE_FORMAT_VERSION`, `countArticleHeadings(content: string): number`, `isGuideCacheCurrent(contextType, guideVersion): boolean`, `guideProgressText(p: GuideProgress | null): string`, `guideProgressFraction(p: GuideProgress | null): number`
  - `electron/lib/guide-v2.ts`: `GUIDE_FORMAT_VERSION`, `GuidePlanQuery`, `GuideMaterial`, `countArticleHeadings`, `countStreamedChunks(acc: string): number`, `parseGuidePlan(raw: string, entryCount: number): GuidePlanQuery[]`, `assignMaterials(queries, results): Map<number, GuideMaterial[]>`, `isValidGuideV2(value: unknown): value is ArticleAssistantGuide`, `buildGuidePlanPrompt(content: string, title?: string): string`, `buildGuideV2UserPrompt(args): string`

- [ ] **Step 1: 写失败测试 `tests/guide-progress.test.ts`**

```ts
import { describe, it, expect } from 'vitest'
import {
  GUIDE_FORMAT_VERSION,
  countArticleHeadings,
  isGuideCacheCurrent,
  guideProgressText,
  guideProgressFraction,
} from '../src/lib/guide-progress'

describe('countArticleHeadings', () => {
  it('counts H2 and H3 but not H1/H4', () => {
    const md = '# 标题\n\n## 一\nx\n### 二\ny\n#### 三\nz\n## 四\n'
    expect(countArticleHeadings(md)).toBe(3)
  })
  it('returns 0 for headingless content', () => {
    expect(countArticleHeadings('plain text')).toBe(0)
  })
})

describe('isGuideCacheCurrent', () => {
  it('briefing without version is stale', () => {
    expect(isGuideCacheCurrent('briefing', undefined)).toBe(false)
  })
  it('briefing v1 is stale, v2 current', () => {
    expect(isGuideCacheCurrent('briefing', 1)).toBe(false)
    expect(isGuideCacheCurrent('briefing', GUIDE_FORMAT_VERSION)).toBe(true)
  })
  it('non-briefing is always current regardless of version', () => {
    expect(isGuideCacheCurrent('anthropic-article', undefined)).toBe(true)
    expect(isGuideCacheCurrent('web-article', undefined)).toBe(true)
  })
})

describe('guideProgressText', () => {
  it('formats the three stages', () => {
    expect(guideProgressText(null)).toBe('规划检索中…')
    expect(guideProgressText({ stage: 'planning' })).toBe('规划检索中…')
    expect(guideProgressText({ stage: 'searching', done: 3, total: 7 })).toBe('检索背景资料中… 3/7')
    expect(guideProgressText({ stage: 'writing', chars: 860, entriesDone: 2, entriesTotal: 14 }))
      .toBe('撰写导读中… §2/14 · 已写 860 字')
  })
})

describe('guideProgressFraction', () => {
  it('is monotonic across stages and clamps overshoot', () => {
    expect(guideProgressFraction({ stage: 'planning' })).toBeCloseTo(0.05)
    expect(guideProgressFraction({ stage: 'searching', done: 1, total: 2 })).toBeCloseTo(0.175)
    expect(guideProgressFraction({ stage: 'writing', chars: 100, entriesDone: 7, entriesTotal: 14 })).toBeCloseTo(0.65)
    // 超发 clamp：模型多输出 heading 键时不超过 1
    expect(guideProgressFraction({ stage: 'writing', chars: 100, entriesDone: 20, entriesTotal: 14 })).toBe(1)
    // total 为 0 时不产生 NaN
    expect(guideProgressFraction({ stage: 'searching', done: 0, total: 0 })).toBeCloseTo(0.05)
  })
})
```

- [ ] **Step 2: 写失败测试 `tests/article-assistant/guide-v2.test.ts`**

```ts
import { describe, it, expect } from 'vitest'
import {
  parseGuidePlan,
  assignMaterials,
  countStreamedChunks,
  isValidGuideV2,
  buildGuidePlanPrompt,
  buildGuideV2UserPrompt,
} from '../../electron/lib/guide-v2'

describe('parseGuidePlan', () => {
  const entryCount = 14

  it('parses valid plan and keeps query→entries mapping', () => {
    const raw = '{"queries":[{"query":"Andrej Karpathy background","entries":[1],"reason":"人物履历"},{"query":"AI agent CRM landscape","entries":[7,9]}]}'
    const plan = parseGuidePlan(raw, entryCount)
    expect(plan).toHaveLength(2)
    expect(plan[0]).toMatchObject({ query: 'Andrej Karpathy background', entries: [1] })
    expect(plan[1].entries).toEqual([7, 9])
  })

  it('drops queries with out-of-range or empty entries', () => {
    const raw = '{"queries":[{"query":"ok","entries":[1,99]},{"query":"bad","entries":[99]},{"query":"empty","entries":[]}]}'
    const plan = parseGuidePlan(raw, entryCount)
    expect(plan).toHaveLength(1)
    expect(plan[0].entries).toEqual([1])
  })

  it('dedupes entries within one query', () => {
    const raw = '{"queries":[{"query":"x","entries":[2,2,3]}]}'
    expect(parseGuidePlan(raw, entryCount)[0].entries).toEqual([2, 3])
  })

  it('returns empty array for malformed JSON and wrong shapes', () => {
    expect(parseGuidePlan('not json at all', entryCount)).toEqual([])
    expect(parseGuidePlan('{"foo":1}', entryCount)).toEqual([])
    expect(parseGuidePlan('{"queries":"nope"}', entryCount)).toEqual([])
  })

  it('tolerates markdown fences around the JSON', () => {
    const raw = '```json\n{"queries":[{"query":"x","entries":[1]}]}\n```'
    expect(parseGuidePlan(raw, entryCount)).toHaveLength(1)
  })
})

describe('assignMaterials', () => {
  it('assigns each query result to its entries; shared query lands in both folders', () => {
    const queries = [
      { query: 'a', entries: [1] },
      { query: 'b', entries: [2, 3] },
    ]
    const m1 = [{ title: 'T1', url: 'https://a', snippet: 's1' }]
    const m2 = [{ title: 'T2', url: 'https://b', snippet: 's2' }]
    const folders = assignMaterials(queries, [m1, m2])
    expect(folders.get(1)).toEqual(m1)
    expect(folders.get(2)).toEqual(m2)
    expect(folders.get(3)).toEqual(m2)
  })

  it('failed query (null) leaves folders empty; entry without any query absent', () => {
    const queries = [{ query: 'a', entries: [1] }]
    const folders = assignMaterials(queries, [null])
    expect(folders.get(1)).toBeUndefined()
    expect(folders.size).toBe(0)
  })

  it('dedupes by url when two queries serve the same entry', () => {
    const queries = [{ query: 'a', entries: [1] }, { query: 'b', entries: [1] }]
    const shared = { title: 'S', url: 'https://same', snippet: 'x' }
    const folders = assignMaterials(queries, [[shared], [shared, { title: 'O', url: 'https://other', snippet: 'y' }]])
    expect(folders.get(1)).toHaveLength(2)
  })
})

describe('countStreamedChunks', () => {
  it('counts "heading" keys in accumulated partial JSON', () => {
    expect(countStreamedChunks('{"background":"x","chunks":[{"heading":"A","context":"…')).toBe(1)
    expect(countStreamedChunks('')).toBe(0)
    // 正文里提到 heading 一词但没有 JSON 键形态时不计
    expect(countStreamedChunks('the heading of this section')).toBe(0)
  })
})

describe('isValidGuideV2', () => {
  const valid = {
    background: 'bg',
    chunks: [
      { heading: 'H', context: '背景铺陈', terms: [{ term: 't', translation: 'x', explanation: 'e' }] },
      { heading: 'H2', context: '背景2', terms: [] },
    ],
  }
  it('accepts a valid v2 guide', () => {
    expect(isValidGuideV2(valid)).toBe(true)
  })
  it('rejects v1 shape (summary instead of context)', () => {
    const v1 = { background: 'bg', chunks: [{ heading: 'H', summary: 's', terms: [] }] }
    expect(isValidGuideV2(v1)).toBe(false)
  })
  it('rejects empty context, empty chunks, missing background', () => {
    expect(isValidGuideV2({ background: 'b', chunks: [{ heading: 'H', context: '  ', terms: [] }] })).toBe(false)
    expect(isValidGuideV2({ background: 'b', chunks: [] })).toBe(false)
    expect(isValidGuideV2({ chunks: valid.chunks })).toBe(false)
  })
})

describe('prompts', () => {
  it('buildGuidePlanPrompt states entry count and JSON-only output', () => {
    const p = buildGuidePlanPrompt('## A\nx\n## B\ny', '夜航简报')
    expect(p).toContain('§1–§2')
    expect(p).toContain('"queries"')
    expect(p).toContain('"entries"')
    expect(p).toMatch(/不要 markdown|禁.*markdown|只输出 JSON/)
    expect(p).toContain('## A')
  })

  it('buildGuideV2UserPrompt marks entries without materials explicitly', () => {
    const materials = new Map([[2, [{ title: 'T', url: 'https://x', snippet: 's' }]]])
    const p = buildGuideV2UserPrompt({ articleContent: '## A\nx\n## B\ny', articleTitle: '夜航简报', materials, entryCount: 2 })
    expect(p).toContain('### §1')
    expect(p).toContain('无外部资料')
    expect(p).toContain('### §2')
    expect(p).toContain('https://x')
  })
})
```

- [ ] **Step 3: 跑测试确认失败**

Run: `npx vitest run tests/guide-progress.test.ts tests/article-assistant/guide-v2.test.ts`
Expected: FAIL（模块不存在）

- [ ] **Step 4: 改类型 `src/types/index.ts`**

`ArticleAssistantChunk`（L86-90）改为：

```ts
export type ArticleAssistantChunk = {
  heading: string
  /** v1 摘要式导读；v2（digest 背景铺陈）起由 context 取代，旧缓存/非 digest 类型仍是 summary */
  summary?: string
  /** v2 背景铺陈，仅 digest 新链路产出 */
  context?: string
  terms: ArticleAssistantTerm[]
}
```

`ArticleAssistantGuideFile`（L119-123）加字段：

```ts
export type ArticleAssistantGuideFile = {
  filePath: string
  guide: ArticleAssistantGuide
  generatedAt: string
  /** digest 导读格式版本；缺失视为 1（摘要式） */
  guideVersion?: number
}
```

`ArticleAssistantGuide` 后新增：

```ts
/** digest 导读 v2 生成进度（主进程 articleAssistant:guideProgress 事件负载） */
export type GuideProgress =
  | { stage: 'planning' }
  | { stage: 'searching'; done: number; total: number }
  | { stage: 'writing'; chars: number; entriesDone: number; entriesTotal: number }
```

IpcApi generateGuide（L646-650）加 `entriesTotal?: number`：

```ts
  articleAssistantGenerateGuide: (args: {
    articleContent: string
    articleType: 'briefing' | 'anthropic-article' | 'web-article'
    articleTitle?: string
    /** digest v2：正文 H2/H3 标题数，用于撰写进度分母 */
    entriesTotal?: number
  }) => Promise<ArticleAssistantGuide>
```

IpcApi 事件订阅区（`onArticleAssistantSearchDone` 声明之后）加：

```ts
  onArticleAssistantGuideProgress: (cb: (payload: GuideProgress) => void) => () => void
```

- [ ] **Step 5: 修编译兜底 `electron/lib/article-assistant-prompt.ts:42`**

`summary` 变可选后该处 `.map((c) => \`## ${c.heading}\n${c.summary}\`)` 会渲染 `undefined`。改为：

```ts
      .map((c) => `## ${c.heading}\n${c.context ?? c.summary ?? ''}`)
```

- [ ] **Step 6: 创建 `src/lib/guide-progress.ts`（渲染侧纯函数）**

```ts
import type { GuideProgress } from '@shared/index'

// 与 electron/lib/guide-v2.ts 中的 GUIDE_FORMAT_VERSION / countArticleHeadings
// 保持同步——主/渲染进程不能互相 import（rules ipc-state §5），此为渲染侧副本。
export const GUIDE_FORMAT_VERSION = 2

/** 统计正文 H2/H3 标题数，作为撰写进度分母（entriesTotal） */
export function countArticleHeadings(content: string): number {
  const m = content.match(/^#{2,3}\s+\S/gm)
  return m ? m.length : 0
}

/** digest 导读缓存版本判定：非 digest 永远有效；digest 需要 v2 */
export function isGuideCacheCurrent(
  contextType: 'briefing' | 'anthropic-article' | 'web-article' | 'writing',
  guideVersion: number | undefined
): boolean {
  if (contextType !== 'briefing') return true
  return (guideVersion ?? 1) >= GUIDE_FORMAT_VERSION
}

export function guideProgressText(p: GuideProgress | null): string {
  if (!p || p.stage === 'planning') return '规划检索中…'
  if (p.stage === 'searching') return `检索背景资料中… ${p.done}/${p.total}`
  return `撰写导读中… §${p.entriesDone}/${p.entriesTotal} · 已写 ${p.chars} 字`
}

/** 进度痕宽度（0-1）：规划 5%，搜索 5%-30%，撰写 30%-100%，超发 clamp 到 1 */
export function guideProgressFraction(p: GuideProgress | null): number {
  if (!p || p.stage === 'planning') return 0.05
  if (p.stage === 'searching') return p.total > 0 ? 0.05 + 0.25 * (p.done / p.total) : 0.05
  if (p.entriesTotal <= 0) return 0.3
  return Math.min(0.3 + 0.7 * (p.entriesDone / p.entriesTotal), 1)
}
```

- [ ] **Step 7: 创建 `electron/lib/guide-v2.ts`（主进程纯逻辑）**

```ts
import type { ArticleAssistantGuide, ArticleAssistantTerm } from '@shared/index'
import { extractJsonObject } from './extract-json'

// 与 src/lib/guide-progress.ts 中的同名副本保持同步（进程隔离，不能互 import）。
export const GUIDE_FORMAT_VERSION = 2

/** 检索规划产出的一条查询；entries 为 1-based 条目序号（§n） */
export type GuidePlanQuery = { query: string; entries: number[]; reason?: string }

export type GuideMaterial = { title: string; url: string; snippet: string }

/** 与渲染侧副本保持同步；此处用于规划校验的条目总数 */
export function countArticleHeadings(content: string): number {
  const m = content.match(/^#{2,3}\s+\S/gm)
  return m ? m.length : 0
}

/** 撰写进度启发式：已收流式文本中 "heading" JSON 键的个数 ≈ 已写完的条目数 */
export function countStreamedChunks(accumulated: string): number {
  const m = accumulated.match(/"heading"\s*:/g)
  return m ? m.length : 0
}

/** 解析检索规划输出；非法查询（空 query / entries 全越界）丢弃，永不 throw */
export function parseGuidePlan(raw: string, entryCount: number): GuidePlanQuery[] {
  const extracted = extractJsonObject(raw)
  if (!extracted) return []
  let parsed: unknown
  try {
    parsed = JSON.parse(extracted)
  } catch {
    return []
  }
  const o = parsed as Record<string, unknown> | null
  if (!o || !Array.isArray(o.queries)) return []
  const valid: GuidePlanQuery[] = []
  for (const q of o.queries as unknown[]) {
    const item = q as Record<string, unknown> | null
    if (!item || typeof item.query !== 'string' || !item.query.trim()) continue
    const entries = Array.isArray(item.entries)
      ? [...new Set(
          (item.entries as unknown[]).filter(
            (e): e is number => typeof e === 'number' && Number.isInteger(e) && e >= 1 && e <= entryCount
          )
        )]
      : []
    if (entries.length === 0) continue
    valid.push({
      query: item.query.trim(),
      entries,
      ...(typeof item.reason === 'string' ? { reason: item.reason } : {}),
    })
  }
  return valid
}

/** 按 query→entries 映射把搜索结果归档到各条目资料夹；失败查询（null）跳过；同条目跨查询按 url 去重 */
export function assignMaterials(
  queries: GuidePlanQuery[],
  results: (GuideMaterial[] | null)[]
): Map<number, GuideMaterial[]> {
  const folders = new Map<number, GuideMaterial[]>()
  queries.forEach((q, i) => {
    const materials = results[i]
    if (!materials || materials.length === 0) return
    for (const entry of q.entries) {
      const existing = folders.get(entry) ?? []
      const seen = new Set(existing.map((m) => m.url))
      folders.set(entry, [...existing, ...materials.filter((m) => !seen.has(m.url))])
    }
  })
  return folders
}

function isValidTermV2(value: unknown): value is ArticleAssistantTerm {
  const o = value as Record<string, unknown> | null
  return !!o && typeof o.term === 'string' && typeof o.translation === 'string' && typeof o.explanation === 'string'
}

/** v2 形状校验：chunks 非空、每条 heading + 非空 context + terms 合法 */
export function isValidGuideV2(value: unknown): value is ArticleAssistantGuide {
  const o = value as Record<string, unknown> | null
  if (!o || typeof o.background !== 'string' || !Array.isArray(o.chunks) || o.chunks.length === 0) return false
  return (o.chunks as unknown[]).every((c) => {
    const chunk = c as Record<string, unknown> | null
    return (
      !!chunk &&
      typeof chunk.heading === 'string' &&
      typeof chunk.context === 'string' &&
      chunk.context.trim().length > 0 &&
      Array.isArray(chunk.terms) &&
      (chunk.terms as unknown[]).every(isValidTermV2)
    )
  })
}

/** 阶段 1 检索规划 prompt（轻量、低温、禁 thinking） */
export function buildGuidePlanPrompt(articleContent: string, articleTitle?: string): string {
  const entryCount = countArticleHeadings(articleContent)
  return `你将为一份 AI 行业简报撰写"背景铺陈式导读"做检索规划。简报共 ${entryCount} 个条目（§1–§${entryCount}），全文附在最后。

逐条判断：为初学者撰写该条的背景时，是否需要外部事实材料（人物履历、机构背景、某场争论的来龙去脉、近期事件）？
- 每个条目都是候选：默认需要；仅当条目是自足的纯观点、常识足以覆盖时才不配查询。
- 一条查询可服务多个条目（如两条谈同一场争论），在 entries 里列出所有相关条目序号。
- 查询词用英文（此类资料英文质量更高），简短精准。
- 查询总数 0-${entryCount} 动态决定：不遗漏需要事实支撑的条目，也不为常识条目浪费查询。

只输出 JSON（不要 markdown 代码块、不要任何解释）：
{"queries":[{"query":"...","entries":[1,3],"reason":"一句话说明查什么"}]}

简报标题：${articleTitle ?? '夜航简报'}

简报全文：
${articleContent}`
}

/** 阶段 3 生成的 user prompt：正文 + 按条目组织的资料夹（无资料条目显式标注） */
export function buildGuideV2UserPrompt(args: {
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
  return `Article title: ${args.articleTitle ?? '夜航简报'}

${args.articleContent}

---

## 各条目背景资料夹（§ 编号与正文条目一一对应；写某条时只用该条的资料）

${sections.join('\n\n')}`
}
```

- [ ] **Step 8: 跑测试确认通过 + 类型检查**

Run: `npx vitest run tests/guide-progress.test.ts tests/article-assistant/guide-v2.test.ts`
Expected: PASS

Run: `npx tsc --noEmit`
Expected: 通过（注意 `GuideSidebar.tsx:68` 的 `chunk.summary` 变为 `string | undefined`，React 渲染 undefined 合法，不应报错；若报 TS 错误，把它改为 `{chunk.context ?? chunk.summary}`——这本就是 Task 5 的内容，可提前）

- [ ] **Step 9: Commit**

```bash
git add src/types/index.ts src/lib/guide-progress.ts electron/lib/guide-v2.ts electron/lib/article-assistant-prompt.ts tests/guide-progress.test.ts tests/article-assistant/guide-v2.test.ts
git commit -m "feat(article-assistant): 导读 v2 类型契约与纯逻辑模块（规划解析/资料归档/进度启发式）"
```

---

### Task 2: v2 prompt 文件

**Files:**
- Create: `electron/prompts/digest-guide-v2.md`
- Test: `tests/article-assistant/prompt.test.ts`（追加 describe 块）

**Interfaces:**
- Consumes: 无（独立 prompt 资产，Task 3 的 handler 读取它）
- Produces: prompt 文件必须包含的契约锚点：`"context"` schema 字段、三层 ❌/✅ 示例、语言风格节、JSON-only 禁令、heading 不翻译、terms 中英对照格式

- [ ] **Step 1: 先写失败测试（追加到 `tests/article-assistant/prompt.test.ts` 末尾）**

```ts
const digestGuideV2Prompt = fs.readFileSync(
  path.resolve(process.cwd(), 'electron/prompts/digest-guide-v2.md'),
  'utf8'
)

describe('digest-guide-v2.md prompt', () => {
  it('demands JSON-only output with no markdown fences or prose', () => {
    expect(digestGuideV2Prompt).toMatch(/Return ONLY a JSON object|只输出 JSON/)
    expect(digestGuideV2Prompt).toMatch(/Do not wrap it in markdown code blocks|不要 markdown 代码块/)
  })

  it('documents the background/chunks/heading/context/terms schema', () => {
    for (const key of ['"background"', '"chunks"', '"heading"', '"context"', '"terms"']) {
      expect(digestGuideV2Prompt).toContain(key)
    }
  })

  it('reframes the reader assumption: article content is waste, not material', () => {
    expect(digestGuideV2Prompt).toMatch(/读者自己会读正文|WILL read the briefing themselves/)
  })

  it('carries the self-question checklist (故事线/说话者/赞成或挑战/拼图)', () => {
    expect(digestGuideV2Prompt).toContain('故事线')
    expect(digestGuideV2Prompt).toMatch(/说话者|说话的人/)
    expect(digestGuideV2Prompt).toMatch(/支持或挑战|赞成或挑战/)
    expect(digestGuideV2Prompt).toContain('拼图')
  })

  it('anchors the three-tier examples: summary / 掉书袋 / 刻意通俗 forbidden, 前见 expected', () => {
    // 三层反例 + 一层正例
    expect(digestGuideV2Prompt).toContain('❌')
    expect(digestGuideV2Prompt).toContain('✅')
    expect(digestGuideV2Prompt).toContain('掉书袋')
    expect(digestGuideV2Prompt).toContain('刻意通俗')
    expect(digestGuideV2Prompt).toContain('Karpathy')
  })

  it('states the language style: 平实准确, no abstract-noun stacking, no forced colloquialism', () => {
    expect(digestGuideV2Prompt).toContain('平实准确')
    expect(digestGuideV2Prompt).toMatch(/命题|范式|赋能/)
  })

  it('keeps heading language and terms format from v1', () => {
    expect(digestGuideV2Prompt).toMatch(/Do not translate headings|不要翻译.*标题|标题.*不要翻译/)
    expect(digestGuideV2Prompt).toContain('上下文（context）')
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run tests/article-assistant/prompt.test.ts`
Expected: FAIL（读取 digest-guide-v2.md 报 ENOENT）

- [ ] **Step 3: 创建 `electron/prompts/digest-guide-v2.md`**

```markdown
You are a veteran AI practitioner writing a reading companion for a smart beginner. Given an AI industry digest, produce a Chinese reading guide in JSON.

## Output format

Return ONLY a JSON object matching this schema. Do not wrap it in markdown code blocks or add explanatory prose.

{
  "background": "整体一段：把这期简报放进当下 AI 领域的语境——这几条线索共同反映了什么趋势或争论。",
  "chunks": [
    {
      "heading": "原文中的 H2 或 H3 标题，保持原语言，不要翻译",
      "context": "本条背景铺陈（见下方写作任务）。",
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

## 读者假设（最重要）

读者自己会读正文。正文里已有的信息都是废品——context 里出现任何对条目内容的转述，都是失败。你的 context 只写正文没说的、资深从业者习以为常的语境。

## 写作任务

为每条撰写 context 前，默默过一遍这份清单：

1. 这条踩在哪个正在进行的故事线上？（某场争论、某个技术脉络、某家公司的战略走向）
2. 说话者是谁？为什么这个人的声音在这个话题上有分量？
3. 这条在支持或挑战哪个流行看法？
4. 初学者读这条时，最缺的是哪块拼图？

只写回答这些问题的内容。若某条是自足的纯观点、无需外部语境，用一句话说明它为何仍值得注意，不要硬凑背景。详略由条目重要性决定，不限定篇幅。

## 语言风格

- 平实准确：不写空话套话（"命题""范式""赋能"之类抽象名词堆叠），也不刻意口语化、刻意通俗。
- 判断落实成具体的人、事、数字；措辞以准确为先，深浅自然。
- 术语首次出现由名词解释（terms）兜底，铺陈文字本身保持通畅即可。

## 正反锚点（示例即标准）

❌ 摘要（禁止）：「Karpathy 用 Opus 5 将《指环王》片段渲染为 Three.js 动画，仅花 2 小时 10 美元，展示了 LLM 使个性化体验近乎零成本。」

❌ 掉书袋（禁止）：「圈内转发它，是因为"2 小时 10 美元"给"个性化软件成本趋零"这个反复被争论的命题提供了一个具体数据点。」

❌ 刻意通俗（禁止）：「用大白话告诉 AI 想要什么，让 AI 把整个程序写出来……这账算得很具体。」

✅ 期望：「Karpathy 是 OpenAI 创始成员、前特斯拉 AI 总监。2025 年初他提出"vibe coding"一词，指用自然语言描述需求、让模型生成完整程序的做法，这条推文是该主张的又一次公开实验。它受到关注，在于成本与耗时的具体：过去需要专业团队完成的动画，如今一个人以 10 美元、两小时即可完成。」

## 事实纪律

- 优先使用随附资料夹中对应 § 编号的材料；写某条时只用该条的资料，不得跨条挪用。
- 资料夹标注"无外部资料"的条目：可用模型自身知识，但禁止编造具体数字、日期、履历；拿不准就讲议题语境而非人物事实。

## Constraints

- Split the digest by H2/H3 headings, one chunk per entry, in original order.
- Each chunk may have 0-3 terms. Only include terms that genuinely need explanation.
- All output must be in Chinese (headings excepted).
- For technical terms, give the Chinese equivalent first, followed by the original English in parentheses, e.g., 上下文（context）. 不要嵌套重复，禁止出现「LLM（大语言模型（LLM））」这类写法。
- Do not translate headings; keep the exact original heading text.
- Do not output "Vol.", "AI Builders Digest", "Generated through", "档案编号", "学习卷宗", or any other decorative metadata.
- If the article has no clear headings, return a single chunk with heading "全文".
- 空字段用 ""，不要省略字段。
```

- [ ] **Step 4: 跑测试确认通过**

Run: `npx vitest run tests/article-assistant/prompt.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add electron/prompts/digest-guide-v2.md tests/article-assistant/prompt.test.ts
git commit -m "feat(article-assistant): digest 导读 v2 prompt——背景铺陈任务定义与三层正反锚点"
```

---

### Task 3: 主进程管线 + 进度事件 + 缓存版本 + IPC 五层同步

**Files:**
- Create: `electron/lib/guide-v2-pipeline.ts`
- Modify: `electron/ipc/article-assistant.ts`（`registerArticleAssistantIpc` 内 generateGuide 分支、writeGuide/readGuide、serializeGuide、E2E mock）
- Modify: `electron/preload.ts`（`:55-61` 附近事件订阅区）
- Modify: `src/lib/ipc.ts`（facade getter 区）
- Modify: `electron/lib/frontmatter.ts:17`（EXT_FIELDS）
- Test: `tests/article-assistant-guide-ipc.test.ts`（追加）
- Test: `tests/frontmatter.test.ts`（追加一条）

**Interfaces:**
- Consumes: Task 1 的 `guide-v2.ts` 全部导出 + `GuideProgress` 类型；Task 2 的 prompt 文件
- Produces:
  - `runDigestGuideV2(cfg: AppConfig, args: { system: string; articleContent: string; articleTitle?: string; entriesTotal?: number }, onProgress: (p: GuideProgress) => void): Promise<ArticleAssistantGuide>`——抛错带 `.code`: `'GUIDE_JSON_ERROR'`，其余错误由 handler 映射为 `GUIDE_LLM_ERROR`
  - IPC 事件 `articleAssistant:guideProgress`（负载 `GuideProgress`，无 sessionId）
  - preload/facade `onArticleAssistantGuideProgress(cb)`
  - `.guide.md` frontmatter `guide_version: 2`（仅 v2 格式写入）

- [ ] **Step 1: 先写失败测试（追加到 `tests/article-assistant-guide-ipc.test.ts`）**

```ts
describe('serializeGuide v2', () => {
  it('writes context text in the body position and round-trips it into summary', () => {
    const guide = {
      background: 'bg',
      chunks: [{ heading: 'H', context: 'C 背景铺陈', terms: [] }],
    }
    const parsed = parseAssistantGuideBody(serializeGuide(guide as any))
    expect(parsed).not.toBeNull()
    expect(parsed!.chunks[0].summary).toBe('C 背景铺陈')
  })

  it('prefers context over summary when both present', () => {
    const guide = {
      background: 'bg',
      chunks: [{ heading: 'H', summary: '旧摘要', context: '新铺陈', terms: [] }],
    }
    expect(serializeGuide(guide as any)).toContain('新铺陈')
    expect(serializeGuide(guide as any)).not.toContain('旧摘要')
  })
})
```

再追加到 `tests/frontmatter.test.ts`（文件已存在，模仿现有用例风格）：

```ts
it('article-assistant frontmatter keeps guide_version through serialization', () => {
  const out = serializeFrontmatter(
    'article-assistant',
    { title: '导读', type: 'article-assistant', created: '2026-08-04', guide_version: 2 } as any,
    'body'
  )
  expect(out).toContain('guide_version: 2')
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run tests/article-assistant-guide-ipc.test.ts tests/frontmatter.test.ts`
Expected: FAIL（context 尚未被 serializeGuide 使用，第一个测试得到 summary 为空/不含 'C 背景铺陈'）

- [ ] **Step 3: 创建 `electron/lib/guide-v2-pipeline.ts`**

```ts
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { chatNonStream, chatStream } from './kimi'
import { searchWeb } from './search'
import { getSearchApiKey } from './credentials'
import { extractJsonObject } from './extract-json'
import type { AppConfig } from '../env'
import type { ArticleAssistantGuide, GuideProgress } from '@shared/index'
import {
  assignMaterials,
  buildGuidePlanPrompt,
  buildGuideV2UserPrompt,
  countArticleHeadings,
  countStreamedChunks,
  isValidGuideV2,
  parseGuidePlan,
  type GuidePlanQuery,
} from './guide-v2'

function typed(code: 'GUIDE_JSON_ERROR', message: string): Error & { code: string } {
  const err = new Error(message) as Error & { code: string }
  err.code = code
  return err
}

/** 可观测性：规划/搜索/坏输出落盘到 ~/.studyparlor/debug/，best-effort */
function debugDump(name: string, data: unknown): void {
  try {
    const dir = path.join(os.homedir(), '.studyparlor', 'debug')
    fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(path.join(dir, `guide-v2-${name}-${Date.now()}.json`), JSON.stringify(data, null, 2))
  } catch {
    /* best-effort */
  }
}

/**
 * digest 导读 v2 三阶段管线：检索规划 → 并行搜索（按条目归档）→ 流式撰写。
 * 降级：规划失败重试 1 次后跳过搜索；单查询失败仅置空对应资料夹；无 API key 全部走模型自身知识。
 */
export async function runDigestGuideV2(
  cfg: AppConfig,
  args: { system: string; articleContent: string; articleTitle?: string; entriesTotal?: number },
  onProgress: (p: GuideProgress) => void
): Promise<ArticleAssistantGuide> {
  const entryCount = Math.max(countArticleHeadings(args.articleContent), 1)

  // 阶段 1：检索规划
  onProgress({ stage: 'planning' })
  let queries: GuidePlanQuery[] = []
  for (let attempt = 0; attempt < 2 && queries.length === 0; attempt++) {
    try {
      const raw = await chatNonStream(cfg, {
        messages: [{ role: 'user', content: buildGuidePlanPrompt(args.articleContent, args.articleTitle) }],
        temperature: 0.3,
        thinking: { type: 'disabled' },
      })
      queries = parseGuidePlan(raw, entryCount)
    } catch {
      // 下一轮重试；两次都失败则 queries 保持 []，降级为无搜索
    }
  }
  debugDump('plan', { entryCount, queries })

  // 阶段 2：并行搜索（无 key / 单查询失败仅置空对应资料夹）
  const apiKey = await getSearchApiKey().catch(() => null)
  const total = queries.length
  let done = 0
  const results = await Promise.all(
    queries.map(async (q) => {
      try {
        if (!apiKey) return null
        const rs = await searchWeb({ query: q.query, apiKey, maxResults: 3 })
        return rs.map((r) => ({ title: r.title, url: r.url, snippet: r.content.slice(0, 300) }))
      } catch {
        return null
      } finally {
        done += 1
        onProgress({ stage: 'searching', done, total })
      }
    })
  )
  const materials = assignMaterials(queries, results)
  debugDump('search', { queries, found: results.map((r) => r?.length ?? 0) })

  // 阶段 3：流式撰写，每 chunk 发进度；收齐后走提取→校验
  const entriesTotal = Math.max(args.entriesTotal ?? entryCount, 1)
  let acc = ''
  await chatStream(
    cfg,
    {
      messages: [
        { role: 'system', content: args.system },
        {
          role: 'user',
          content: buildGuideV2UserPrompt({
            articleContent: args.articleContent,
            articleTitle: args.articleTitle,
            materials,
            entryCount,
          }),
        },
      ],
      temperature: 0.7,
      // 本地控制器仅为满足 chatStream 签名；中断语义由渲染层 contextId 校验承担（与旧路径一致）
      signal: new AbortController().signal,
      thinking: { type: 'enabled', reasoning_effort: 'max' },
    },
    (text) => {
      acc += text
      onProgress({
        stage: 'writing',
        chars: acc.length,
        entriesDone: Math.min(countStreamedChunks(acc), entriesTotal),
        entriesTotal,
      })
    }
  )

  const extracted = extractJsonObject(acc)
  if (!extracted) {
    debugDump('bad-json', { raw: acc.slice(0, 4000) })
    throw typed('GUIDE_JSON_ERROR', 'Failed to extract JSON object from guide v2 response')
  }
  let guide: unknown
  try {
    guide = JSON.parse(extracted)
  } catch (e) {
    debugDump('bad-json', { raw: acc.slice(0, 4000) })
    throw typed('GUIDE_JSON_ERROR', e instanceof Error ? e.message : 'Guide v2 JSON parse failed')
  }
  if (!isValidGuideV2(guide)) {
    debugDump('bad-shape', { raw: acc.slice(0, 4000) })
    throw typed('GUIDE_JSON_ERROR', 'Guide v2 JSON missing required fields or invalid shape')
  }
  return guide
}
```

- [ ] **Step 4: 改 `electron/ipc/article-assistant.ts`**

4a. 顶部 import 区追加：

```ts
import { runDigestGuideV2 } from '../lib/guide-v2-pipeline'
import { GUIDE_FORMAT_VERSION } from '../lib/guide-v2'
```

4b. `serializeGuide`（L92-100）中 `c.summary` 改为：

```ts
    return `## §${i + 1} ${c.heading}\n\n${c.context ?? c.summary ?? ''}${terms}`
```

4c. `generateGuide` handler（L242-306）：签名 `async (_, args:` 改为 `async (event, args:`，在 `isE2EMock()` 分支内 briefing 走 v2 mock，并在真实路径前插入 briefing 分支。完整替换后的 handler 主体（保留现有非 briefing 路径不动）：

```ts
    async (event, args: { articleContent: string; articleType: 'briefing' | 'anthropic-article' | 'web-article'; articleTitle?: string; entriesTotal?: number }) => {
      const send = (channel: string, ...payload: unknown[]) => {
        if (event.sender.isDestroyed()) return
        event.sender.send(channel, ...payload)
      }
      const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

      // E2E deterministic mock: return a fixed valid guide without calling the LLM.
      if (isE2EMock()) {
        if (args.articleType === 'briefing') {
          // v2 mock：合成三阶段进度事件（带延时，给 E2E 留出断言窗口），返回 context 格式导读
          const entriesTotal = Math.max(args.entriesTotal ?? 1, 1)
          send('articleAssistant:guideProgress', { stage: 'planning' })
          await sleep(400)
          send('articleAssistant:guideProgress', { stage: 'searching', done: 1, total: 2 })
          await sleep(500)
          send('articleAssistant:guideProgress', { stage: 'searching', done: 2, total: 2 })
          for (let i = 1; i <= 5; i++) {
            await sleep(400)
            send('articleAssistant:guideProgress', {
              stage: 'writing',
              chars: i * 240,
              entriesDone: Math.min(i >= 3 ? 1 : 0, entriesTotal),
              entriesTotal,
            })
          }
          const mockGuideV2: ArticleAssistantGuide = {
            background: '这是一份 E2E 测试简报的整体背景：本期条目共同反映了 AI Agent 工程化落地的争论。',
            chunks: [
              {
                heading: 'AI Safety',
                context: 'Constitutional AI 出自 Anthropic 2022 年的同名论文，是用成文原则替代人工反馈的对齐路线（E2E mock 背景铺陈）。',
                terms: [
                  {
                    term: 'Constitutional AI',
                    translation: '宪法式 AI',
                    explanation: '一种用一组书面原则约束模型行为、减少人工标注的对齐方法。',
                  },
                ],
              },
            ],
          }
          return mockGuideV2
        }
        const mockGuide: ArticleAssistantGuide = {
          background: '这是一段用于 E2E 测试的文章背景介绍，说明本文讨论 AI 对齐与安全。',
          chunks: [
            {
              heading: 'AI Safety',
              summary: '本段介绍 Constitutional AI 的核心思想与动机。',
              terms: [
                {
                  term: 'Constitutional AI',
                  translation: '宪法式 AI',
                  explanation: '一种用一组书面原则约束模型行为、减少人工标注的对齐方法。',
                },
              ],
            },
          ],
        }
        return mockGuide
      }

      // digest 走 v2 背景铺陈管线；其余类型沿用旧的单次摘要式调用
      if (args.articleType === 'briefing') {
        const v2PromptPath = path.join(promptsDir(), 'digest-guide-v2.md')
        const systemV2 = fs.existsSync(v2PromptPath) ? fs.readFileSync(v2PromptPath, 'utf8') : ''
        try {
          return await runDigestGuideV2(
            cfg,
            {
              system: systemV2,
              articleContent: args.articleContent,
              articleTitle: args.articleTitle,
              entriesTotal: args.entriesTotal,
            },
            (p) => send('articleAssistant:guideProgress', p)
          )
        } catch (err) {
          const code = (err as Error & { code?: string }).code
          if (code === 'GUIDE_JSON_ERROR') throw err
          throw typedError('GUIDE_LLM_ERROR', err instanceof Error ? err.message : String(err))
        }
      }

      // 旧路径（anthropic-article / web-article）：保留现有 L266-304 的代码不变——
      // digest-guide.md + chatNonStream + extractJsonObject + isValidGuide + 错误映射，
      // 不做任何改动。
```

4d. `writeGuide`（L568-579）fm 构造处：v2 格式写 `guide_version`：

```ts
      const isV2 = args.guide.chunks.some((c) => typeof c.context === 'string' && c.context.length > 0)
      const fm = {
        title: '导读',
        type: 'article-assistant' as const,
        created: now,
        created_at: now,
        updated_at: now,
        parent_path: args.parentPath,
        parent_type: args.parentType,
        generated_at: now,
        ...(isV2 ? { guide_version: GUIDE_FORMAT_VERSION } : {}),
        tags: [] as string[],
      }
```

4e. `readGuide`（L604-613）返回对象加 `guideVersion`：

```ts
        const fmRecord = frontmatter as unknown as Record<string, unknown>
        return {
          filePath: guidePath,
          guide,
          generatedAt: (fmRecord.generated_at as string | undefined) ?? frontmatter.created,
          guideVersion: typeof fmRecord.guide_version === 'number' ? fmRecord.guide_version : undefined,
        }
```

- [ ] **Step 5: 改 `electron/lib/frontmatter.ts:17` EXT_FIELDS**

```ts
  'article-assistant': ['parent_path', 'parent_type', 'created_at', 'updated_at', 'guide_version'],
```

（serializeFrontmatter 本有未知字段兜底，但 rules ipc-state §9 要求 EXT_FIELDS 列出实际写入字段。）

- [ ] **Step 6: preload + facade 同步**

`electron/preload.ts` 在现有 `onArticleAssistantReasoningChunk` 订阅（L60-61）后追加：

```ts
  onArticleAssistantGuideProgress: (cb) => {
    const handler = (_e: unknown, payload: unknown) => cb(payload as import('@shared/index').GuideProgress)
    ipcRenderer.on('articleAssistant:guideProgress', handler)
    return () => ipcRenderer.off('articleAssistant:guideProgress', handler)
  },
```

（与 L55-61 现有两个订阅的写法保持一致；若文件顶部已 import 类型则直接用 `GuideProgress`。）

`src/lib/ipc.ts` 在 `onArticleAssistantReasoningChunk` getter（L98）后追加：

```ts
  get onArticleAssistantGuideProgress() { return ensure().onArticleAssistantGuideProgress },
```

- [ ] **Step 7: 跑测试确认通过 + 类型检查**

Run: `npx vitest run tests/article-assistant-guide-ipc.test.ts tests/frontmatter.test.ts`
Expected: PASS

Run: `npx tsc --noEmit`
Expected: 通过

- [ ] **Step 8: Commit**

```bash
git add electron/lib/guide-v2-pipeline.ts electron/ipc/article-assistant.ts electron/preload.ts src/lib/ipc.ts electron/lib/frontmatter.ts tests/article-assistant-guide-ipc.test.ts tests/frontmatter.test.ts
git commit -m "feat(article-assistant): digest 导读 v2 主进程管线——规划/搜索/流式撰写 + 进度事件 + guide_version 缓存"
```

---

### Task 4: store + runtime 接线

**Files:**
- Modify: `src/store/index.ts`（AssistantSession 类型区 ~L32、`openAssistantSession` L1668、`loadAssistantGuide` L1734、`generateAssistantGuide` L1933，新增 action）
- Modify: `src/lib/assistant-session-runtime.ts`（`attachAssistantSessionListeners` 内追加订阅）
- Test: `tests/store-article-assistant.test.ts`（改 1 条既有断言 + 追加 describe）

**Interfaces:**
- Consumes: `GuideProgress`、`guideVersion`、`entriesTotal`（Task 1/3）；`guide-progress.ts` 的 `isGuideCacheCurrent`、`countArticleHeadings`
- Produces:
  - `AssistantSession.guideProgress: GuideProgress | null`
  - store action `setAssistantGuideProgress(p: GuideProgress | null): void`
  - `generateAssistantGuide` 调用 IPC 时多传 `entriesTotal: number`

- [ ] **Step 1: 先改既有断言 + 写新失败测试（`tests/store-article-assistant.test.ts`）**

既有测试 `'auto-generates and persists when cache is empty and autoGenerateGuide is set'`（L73-77）的 `toHaveBeenCalledWith` 改为包含 `entriesTotal`：

```ts
      expect(ipc.articleAssistantGenerateGuide).toHaveBeenCalledWith({
        articleContent: 'article body',
        articleType: 'briefing',
        articleTitle: 'B',
        entriesTotal: 0,
      })
```

既有测试 `'does not auto-generate when a cached guide already exists'`（L86-104）：它的 mock 缓存是 briefing 且**无 guideVersion**，在新逻辑下属于失效缓存会触发重新生成，与新行为冲突。给其 mock 返回值加 `guideVersion: 2`，保持原意图（"有效缓存不重新生成"）：

```ts
      vi.mocked(ipc.articleAssistantReadGuide).mockResolvedValue({
        filePath: '/guide.json',
        guide: guideFixture as any,
        generatedAt: '2026-07-11',
        guideVersion: 2,
      })
```

追加 describe：

```ts
  describe('guide v2 cache versioning and progress', () => {
    const openBriefing = (articleContent = 'article body') =>
      useStore.getState().openAssistantSession({
        contextId: '/lib/d.md',
        contextType: 'briefing',
        articleContent,
        articleTitle: 'D',
        autoGenerateGuide: true,
      })

    it('regenerates when briefing cache has no guideVersion (v1)', async () => {
      vi.mocked(ipc.articleAssistantReadGuide).mockResolvedValue({
        filePath: '/g.md',
        guide: guideFixture as any,
        generatedAt: '2026-08-01',
      })
      openBriefing()
      await flush(); await flush(); await flush()
      expect(ipc.articleAssistantGenerateGuide).toHaveBeenCalled()
    })

    it('uses briefing cache when guideVersion is 2', async () => {
      vi.mocked(ipc.articleAssistantReadGuide).mockResolvedValue({
        filePath: '/g.md',
        guide: guideFixture as any,
        generatedAt: '2026-08-04',
        guideVersion: 2,
      })
      openBriefing()
      await flush(); await flush()
      expect(ipc.articleAssistantGenerateGuide).not.toHaveBeenCalled()
      expect(useStore.getState().assistantSession?.guide).toEqual(guideFixture)
    })

    it('uses non-briefing cache without version check', async () => {
      vi.mocked(ipc.articleAssistantReadGuide).mockResolvedValue({
        filePath: '/g.md',
        guide: guideFixture as any,
        generatedAt: '2026-08-01',
      })
      useStore.getState().openAssistantSession({
        contextId: '/lib/e.md',
        contextType: 'anthropic-article',
        articleContent: 'body',
        autoGenerateGuide: true,
      })
      await flush(); await flush()
      expect(ipc.articleAssistantGenerateGuide).not.toHaveBeenCalled()
    })

    it('counts H2/H3 headings as entriesTotal', async () => {
      openBriefing('## 一\nx\n### 二\ny\n## 三\nz')
      await flush(); await flush(); await flush()
      expect(ipc.articleAssistantGenerateGuide).toHaveBeenCalledWith(
        expect.objectContaining({ entriesTotal: 3 })
      )
    })

    it('tracks guideProgress and clears it on success', async () => {
      // 挂起生成，避免 microtask 一把跑完导致断言不到中间态
      let resolveGuide!: (g: unknown) => void
      vi.mocked(ipc.articleAssistantGenerateGuide).mockReturnValue(
        new Promise((r) => { resolveGuide = r }) as Promise<any>
      )
      openBriefing()
      await flush(); await flush()
      expect(useStore.getState().assistantSession?.guideProgress).toEqual({ stage: 'planning' })

      useStore.getState().setAssistantGuideProgress({ stage: 'searching', done: 1, total: 2 })
      expect(useStore.getState().assistantSession?.guideProgress).toEqual({ stage: 'searching', done: 1, total: 2 })

      resolveGuide(guideFixture)
      await flush(); await flush()
      expect(useStore.getState().assistantSession?.guide).toEqual(guideFixture)
      expect(useStore.getState().assistantSession?.guideProgress).toBeNull()
    })

    it('clears guideProgress on failure', async () => {
      vi.mocked(ipc.articleAssistantGenerateGuide).mockRejectedValue(Object.assign(new Error('x'), { code: 'GUIDE_LLM_ERROR' }))
      openBriefing()
      await flush(); await flush(); await flush()
      expect(useStore.getState().assistantSession?.guideError).toBe('GUIDE_LLM_ERROR')
      expect(useStore.getState().assistantSession?.guideProgress).toBeNull()
    })
  })
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run tests/store-article-assistant.test.ts`
Expected: FAIL（entriesTotal 未传、guideVersion 未判定、guideProgress/setAssistantGuideProgress 不存在）

- [ ] **Step 3: 改 `src/store/index.ts`**

3a. import 区追加：

```ts
import { countArticleHeadings, isGuideCacheCurrent } from '@/lib/guide-progress'
```

`GuideProgress` 类型从既有 `@shared/index` import 列表中补入。

3b. `AssistantSession` 类型（`guideLoading: boolean` 附近）加字段：

```ts
  guideProgress: GuideProgress | null
```

3c. `openAssistantSession`（L1677）初始化对象加 `guideProgress: null`。

3d. 新增 action（放在 `setGuideScrollToChunk` 之后）：

```ts
  setAssistantGuideProgress: (p) => {
    const s = get().assistantSession
    if (!s) return
    set({ assistantSession: { ...s, guideProgress: p } })
  },
```

并在 store 类型声明区（`setGuideScrollToChunk` 的声明附近）加 `setAssistantGuideProgress: (p: GuideProgress | null) => void`。

3e. `loadAssistantGuide`（L1742）缓存判定：

```ts
      if (file?.guide && isGuideCacheCurrent(s.contextType, file.guideVersion)) {
        set({ assistantSession: { ...cur, guide: file.guide, guideLoading: false } })
      } else {
        set({ assistantSession: { ...cur, guideLoading: false } })
      }
```

3f. `generateAssistantGuide`（L1933-1958）：

```ts
  generateAssistantGuide: async () => {
    const s = get().assistantSession
    if (!s || s.guideLoading || s.guide) return
    const entriesTotal = countArticleHeadings(s.articleContent)
    set({ assistantSession: { ...s, guideLoading: true, guideError: null, guideProgress: { stage: 'planning' } } })
    try {
      const guide = await ipc.articleAssistantGenerateGuide({
        articleContent: s.articleContent,
        articleType: s.contextType,
        articleTitle: s.articleTitle,
        entriesTotal,
      })
      const cur = get().assistantSession
      if (!cur || cur.contextId !== s.contextId) return
      set({ assistantSession: { ...cur, guide, guideLoading: false, guideProgress: null } })
      try {
        await ipc.articleAssistantWriteGuide({ parentPath: s.contextId, parentType: s.contextType, guide })
      } catch {
        get().showToast('导读已生成但保存失败')
      }
    } catch (err) {
      const raw = (err as Error & { code?: string })?.code
      const code: ArticleAssistantErrorCode = raw === 'GUIDE_JSON_ERROR' ? 'GUIDE_JSON_ERROR' : raw === 'GUIDE_ABORT' ? 'GUIDE_ABORT' : 'GUIDE_LLM_ERROR'
      const cur = get().assistantSession
      if (!cur || cur.contextId !== s.contextId) return
      set({ assistantSession: { ...cur, guideLoading: false, guideError: code, guideProgress: null } })
    }
  },
```

- [ ] **Step 4: 改 `src/lib/assistant-session-runtime.ts`**

`attachAssistantSessionListeners` 内 `onArticleAssistantSearchDone` 订阅后追加：

```ts
  ipc.onArticleAssistantGuideProgress((payload) => {
    const s = useStore.getState().assistantSession
    if (!s || !s.guideLoading) return
    useStore.getState().setAssistantGuideProgress(payload)
  })
```

- [ ] **Step 5: 跑测试确认通过 + 类型检查**

Run: `npx vitest run tests/store-article-assistant.test.ts`
Expected: PASS

Run: `npx tsc --noEmit`
Expected: 通过

- [ ] **Step 6: Commit**

```bash
git add src/store/index.ts src/lib/assistant-session-runtime.ts tests/store-article-assistant.test.ts
git commit -m "feat(article-assistant): store 接入导读 v2——缓存版本失效、进度状态、entriesTotal"
```

---

### Task 5: GuideSidebar 渲染 context + 三态进度 UI（双版式）

**Files:**
- Modify: `src/components/article-assistant/GuideSidebar.tsx`
- Test: `tests/GuideSidebar.test.tsx`（追加）

**Interfaces:**
- Consumes: `assistantSession.guideProgress`（Task 4）、`guideProgressText`/`guideProgressFraction`（Task 1）、chunk `context`（Task 1）
- Produces: `data-testid="guide-progress"`（E2E 断言锚点）

- [ ] **Step 1: 先写失败测试（追加到 `tests/GuideSidebar.test.tsx`）**

注意现有 `mockStore` helper 的 `fullState` 只有 `assistantSession` 与 `setAssistantActiveChunk`；组件新增 selector 后会自动从 `assistantSession` 读取，无需改 helper。`sessionWithGuide()` 返回的对象加 `guideProgress: null`（类型要求）。

```ts
  it('renders chunk context (v2) when present, falling back to summary', () => {
    const s = sessionWithGuide()
    s.guide = {
      background: '背景',
      chunks: [
        { heading: '一', context: '背景铺陈文字', terms: [] },
        { heading: '二', summary: '旧摘要文字', terms: [] },
      ],
    }
    mockStore(s)
    render(<GuideSidebar />)
    expect(screen.getByText('背景铺陈文字')).toBeInTheDocument()
    expect(screen.getByText('旧摘要文字')).toBeInTheDocument()
  })

  it('shows searching progress text and progress bar while generating', () => {
    const s = sessionWithGuide()
    s.guide = null
    s.guideLoading = true
    s.guideProgress = { stage: 'searching', done: 1, total: 2 }
    mockStore(s)
    render(<GuideSidebar />)
    const el = screen.getByTestId('guide-progress')
    expect(el).toHaveTextContent('检索背景资料中… 1/2')
  })

  it('shows writing progress with entry counter and char count', () => {
    const s = sessionWithGuide()
    s.guide = null
    s.guideLoading = true
    s.guideProgress = { stage: 'writing', chars: 860, entriesDone: 2, entriesTotal: 14 }
    mockStore(s)
    render(<GuideSidebar />)
    expect(screen.getByTestId('guide-progress')).toHaveTextContent('撰写导读中… §2/14 · 已写 860 字')
  })

  it('renders progress under newspaper theme too', () => {
    const s = sessionWithGuide()
    s.guide = null
    s.guideLoading = true
    s.guideProgress = { stage: 'planning' }
    mockStore(s)
    render(<GuideSidebar theme="newspaper" />)
    expect(screen.getByTestId('guide-progress')).toHaveTextContent('规划检索中…')
  })
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run tests/GuideSidebar.test.tsx`
Expected: FAIL（context 未渲染、guide-progress testid 不存在）

- [ ] **Step 3: 改 `src/components/article-assistant/GuideSidebar.tsx`**

3a. import 区追加：

```ts
import { guideProgressFraction, guideProgressText } from '@/lib/guide-progress'
```

3b. store selector 区（L14-20 附近）加：

```ts
  const guideProgress = useStore((s) => s.assistantSession?.guideProgress ?? null)
```

3c. 加载块（L40-42 `{guideLoading && ...}`）替换为：

```tsx
      {guideLoading && (
        <div data-testid="guide-progress" className="px-4">
          <div
            style={{ fontSize: GUIDE_TERM_SIZE, fontVariantNumeric: 'tabular-nums' }}
            className={isAcademic ? 'text-parchment/60' : 'text-[#6b5d52]'}
          >
            {guideProgressText(guideProgress)}
          </div>
          <div className={`mt-2 h-px ${isAcademic ? 'bg-parchment/10' : 'bg-[#1a1a1a]/10'}`}>
            <div
              className="h-px bg-ember/60 transition-[width] duration-500 motion-reduce:transition-none"
              style={{ width: `${Math.round(guideProgressFraction(guideProgress) * 100)}%` }}
            />
          </div>
        </div>
      )}
```

3d. chunk 正文（L68）：

```tsx
                <div className={`leading-relaxed mb-2 ${isAcademic ? 'text-parchment/80' : 'text-[#555]'}`}>{chunk.context ?? chunk.summary}</div>
```

- [ ] **Step 4: 跑测试确认通过**

Run: `npx vitest run tests/GuideSidebar.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/article-assistant/GuideSidebar.tsx tests/GuideSidebar.test.tsx
git commit -m "feat(article-assistant): 导读栏渲染 v2 context 与三态进度痕（双版式）"
```

---

### Task 6: E2E——进度可见 + 旧缓存失效重新生成

**Files:**
- Modify: `e2e/helpers/test-library.ts`（追加 `seedBriefingGuideFile`）
- Modify: `e2e/specs/article-assistant-guide.spec.ts`（追加 2 个 test）

**Interfaces:**
- Consumes: Task 3 的 v2 mock（合成进度事件 + context 导读，总时长约 3.4s）、Task 5 的 `guide-progress` testid
- Produces: `seedBriefingGuideFile(libPath: string, date: string, body: string): void`

- [ ] **Step 1: `e2e/helpers/test-library.ts` 追加（放在 `seedBriefing` 之后）**

```ts
/**
 * Seed a v1-format (no guide_version) .guide.md for a digest, used to verify
 * stale-cache invalidation regenerates the guide via the v2 pipeline.
 */
export function seedBriefingGuideFile(libPath: string, date: string, body: string): void {
  const dir = path.join(libPath, '夜航简报')
  fs.mkdirSync(dir, { recursive: true })
  const fm = `---
title: 导读
type: article-assistant
created: '2026-01-01'
tags: []
---

`
  fs.writeFileSync(path.join(dir, `夜航简报-${date}.guide.md`), fm + body, 'utf8')
}
```

- [ ] **Step 2: `e2e/specs/article-assistant-guide.spec.ts` 追加测试**

import 区加 `seedBriefingGuideFile` 与 `fs`、`path`。describe 块内追加：

```ts
  test('v2 guide: progress stages visible, then context-based guide renders', async ({ window, testLibraryPath }) => {
    const assistant = await openDigestWithGuide(window, testLibraryPath)
    // v2 mock 的合成进度约 3.4s：先断言进度文案出现，再等导读落地
    await expect(window.locator('[data-testid="guide-progress"]')).toContainText('检索背景资料中', { timeout: 15000 })
    await assistant.waitForGuideLoaded()
    await expect(window.locator('[data-testid="guide-chunk"]').first()).toContainText('E2E mock 背景铺陈')
  })

  test('stale v1 guide cache is regenerated to v2', async ({ window, testLibraryPath }) => {
    const today = localToday()
    seedBriefing(testLibraryPath, today, DIGEST_CONTENT)
    seedBriefingGuideFile(testLibraryPath, today, '# 背景\n\n旧版背景。\n\n## §1 AI Safety\n\n旧版摘要内容。')

    const cover = new CoverPage(window)
    await cover.enterName('E2E 测试员')
    await cover.goToBriefing()
    await window.locator(SELECTORS.briefing.receiveDigestButton).click()
    await expect(window.locator(SELECTORS.briefing.academicLayout)).toBeVisible({ timeout: 15000 })

    const assistant = new ArticleAssistantPage(window)
    await assistant.waitForMounted()
    await assistant.waitForGuideLoaded()

    // 旧缓存被判定失效并重新生成：渲染的是 v2 mock 内容而非旧摘要
    await expect(window.locator('[data-testid="guide-chunk"]').first()).toContainText('E2E mock 背景铺陈')
    await expect(window.locator('[data-testid="guide-chunk"]').first()).not.toContainText('旧版摘要内容')

    // 覆盖写盘后带 guide_version: 2
    const guidePath = path.join(testLibraryPath, '夜航简报', `夜航简报-${today}.guide.md`)
    await expect
      .poll(() => (fs.existsSync(guidePath) ? fs.readFileSync(guidePath, 'utf8') : ''), { timeout: 10000 })
      .toContain('guide_version: 2')
  })
```

- [ ] **Step 3: 跑定向 E2E**

Run: `node scripts/e2e-changed.js --run`
Expected: `article-assistant-guide.spec.ts`（含既有用例）与 `guide-visibility.spec.ts` 等受影响 spec 全部通过。

source-map 检查：`e2e/source-map.json` 的 `article-assistant` group specs 含 glob `article-assistant*.spec.ts`，本次未新建 spec 文件，无需维护；若 `e2e-changed.js` 输出孤儿 WARNING 则补齐。

- [ ] **Step 4: Commit**

```bash
git add e2e/helpers/test-library.ts e2e/specs/article-assistant-guide.spec.ts
git commit -m "test(article-assistant): 导读 v2 进度可见性与旧缓存失效重生的 E2E 覆盖"
```

---

### Task 7: 真实 API 冒烟（不进 CI 的独立回归）

**Files:**
- Create: `tests/guide-v2-real.test.ts`

**Interfaces:**
- Consumes: `buildGuidePlanPrompt`/`parseGuidePlan`/`buildGuideV2UserPrompt`/`isValidGuideV2`（Task 1）、`chatNonStream`、prompt 文件（Task 2）、`loadEnv`（`electron/env`，仿 `tests/job-briefing-real.test.ts`）

- [ ] **Step 1: 创建 `tests/guide-v2-real.test.ts`**

```ts
/**
 * 真实 API 集成测试：digest 导读 v2 的规划与生成（不含 Tavily 搜索——
 * getSearchApiKey 依赖 Electron safeStorage，node 环境不可用；搜索层由
 * 单测与 E2E mock 覆盖）。
 *
 * @vitest-environment node
 *
 * 默认运行（真实 API 调用，耗时约 1-3 分钟）。需要项目根目录 .env 配置
 * KIMI_API_KEY（非占位符）。
 * 回放：REAL_TEST_REPLAY=1 npx vitest run tests/guide-v2-real.test.ts
 */

import { describe, it, expect, beforeAll } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { loadEnv, type AppConfig } from '../electron/env'
import { chatNonStream } from '../electron/lib/kimi'
import {
  buildGuidePlanPrompt,
  buildGuideV2UserPrompt,
  isValidGuideV2,
  parseGuidePlan,
} from '../electron/lib/guide-v2'
import { extractJsonObject } from '../electron/lib/extract-json'

const DIGEST_FIXTURE = `## X / Twitter

### AI researcher Andrej Karpathy (karpathy on X)
Karpathy 用 Opus 5 将《指环王》片段渲染为 Three.js 动画，花费 2 小时和 10 美元。

### CEO of Box Aaron Levie (levie on X)
Levie 预测 AI 在日常生产力上的影响将趋平，但在深度专业领域将垂直加速。

## 原始来源
### karpathy
- [tweet](https://x.com/karpathy/status/1)
### levie
- [tweet](https://x.com/levie/status/1)`

const REPLAY_FILE = path.resolve(__dirname, 'fixtures', 'guide-v2-real-guide.json')
const REPLAY = process.env.REAL_TEST_REPLAY === '1'

let cfg: AppConfig
beforeAll(() => {
  // 密钥缺失/占位符时让测试失败（rules e2e §1c），loadEnv 会抛出带指引的错误
  cfg = loadEnv()
})

describe('guide v2 real API', () => {
  it('planning produces valid queries within entry range', async () => {
    if (REPLAY) return // 规划结果不在回放范围
    const raw = await chatNonStream(cfg, {
      messages: [{ role: 'user', content: buildGuidePlanPrompt(DIGEST_FIXTURE, '夜航简报') }],
      temperature: 0.3,
      thinking: { type: 'disabled' },
    })
    const plan = parseGuidePlan(raw, 10)
    for (const q of plan) {
      expect(q.query.length).toBeGreaterThan(0)
      expect(q.entries.length).toBeGreaterThan(0)
    }
  }, 120_000)

  it('generation yields a valid v2 guide (background + context chunks)', async () => {
    let raw: string
    if (REPLAY) {
      raw = fs.readFileSync(REPLAY_FILE, 'utf8')
    } else {
      const system = fs.readFileSync(path.resolve(process.cwd(), 'electron/prompts/digest-guide-v2.md'), 'utf8')
      raw = await chatNonStream(cfg, {
        messages: [
          { role: 'system', content: system },
          {
            role: 'user',
            content: buildGuideV2UserPrompt({
              articleContent: DIGEST_FIXTURE,
              articleTitle: '夜航简报',
              materials: new Map(),
              entryCount: 2,
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
    expect(isValidGuideV2(guide)).toBe(true)
    expect(guide.background.trim().length).toBeGreaterThan(0)
    for (const chunk of guide.chunks) {
      // 背景铺陈不应是复述：长度下限兜底
      expect(chunk.context.length).toBeGreaterThan(30)
    }
  }, 300_000)
})
```

- [ ] **Step 2: 真实跑一遍**

Run: `npx vitest run tests/guide-v2-real.test.ts`
Expected: PASS（生成 fixture `tests/fixtures/guide-v2-real-guide.json`）

Run（回放验证零成本路径）: `REAL_TEST_REPLAY=1 npx vitest run tests/guide-v2-real.test.ts`
Expected: PASS

若生成结果复述正文（context 与条目文字高度重合），回到 Task 2 调 prompt，不要放宽断言。

- [ ] **Step 3: Commit**

```bash
git add tests/guide-v2-real.test.ts tests/fixtures/guide-v2-real-guide.json
git commit -m "test(article-assistant): 导读 v2 真实 API 冒烟（规划+生成，可回放）"
```

---

## Self-Review 记录

- **Spec 覆盖**：三阶段管线（T3）、动态搜索+条目映射（T1 assignMaterials/T3）、两层形态 background+context（T1/T2）、名词解释保留+嵌套修复（T2）、缓存版本失效（T3/T4）、进度 UI 三态+字数+双版式（T3/T4/T5）、错误降级矩阵（T3 pipeline）、debug 日志（T3 debugDump）、单测/E2E/真实 API（T1-T7）、UI 出口 testid（T5）。全覆盖。
- **类型一致性**：`GuideProgress`/`entriesTotal`/`guideVersion`/`setAssistantGuideProgress`/`guideProgressText`/`guideProgressFraction`/`runDigestGuideV2` 在产出与消费任务间签名一致；`isGuideCacheCurrent` 的 contextType 联合含 'writing' 以匹配 store 的 `contextType` 类型。
- **已知取舍**：`countArticleHeadings` 把 digest 的 `## 原始来源` 段也计入分母，进度条尾部可能到不了 100% 即完成——启发式可接受，不超 100%（有 clamp）。
