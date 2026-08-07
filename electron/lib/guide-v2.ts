import type { ArticleAssistantGuide, ArticleAssistantTerm } from '@shared/index'
import { extractJsonObject } from './extract-json'

// 与 src/lib/guide-progress.ts 中的同名副本保持同步（进程隔离，不能互 import）。
export const GUIDE_FORMAT_VERSION = 2

/** 检索规划产出的一条查询；entries 为 1-based 条目序号（§n） */
export type GuidePlanQuery = { query: string; entries: number[]; reason?: string }

export type GuideMaterial = { title: string; url: string; snippet: string }

/** 与渲染侧副本保持同步；此处用于规划校验的条目总数。
 *  「## 原始来源 / Sources」section 及其下的 ### 来源分组不是导读条目，计数前截断。 */
export function countArticleHeadings(content: string): number {
  const cut = content.search(/^##\s+.*(?:原始来源|sources).*$/im)
  const body = cut >= 0 ? content.slice(0, cut) : content
  const m = body.match(/^#{2,3}\s+\S/gm)
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
