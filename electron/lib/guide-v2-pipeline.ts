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
  buildBlogGuidePlanPrompt,
  buildBlogGuideV2UserPrompt,
  buildGuidePlanPrompt,
  buildGuideV2UserPrompt,
  countArticleHeadings,
  countStreamedChunks,
  isValidGuideBlogV2,
  isValidGuideV2,
  parseGuidePlan,
  type GuideMaterial,
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
  const entryCount = Math.max(countArticleHeadings(args.articleContent), 1)

  // 阶段 1：检索规划
  onProgress({ stage: 'planning' })
  let queries: GuidePlanQuery[] = []
  for (let attempt = 0; attempt < 2 && queries.length === 0; attempt++) {
    try {
      const raw = await chatNonStream(cfg, {
        messages: [{ role: 'user', content: hooks.buildPlanPrompt(args.articleContent, args.articleTitle) }],
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
          content: hooks.buildUserPrompt({
            articleContent: args.articleContent,
            articleTitle: args.articleTitle,
            materials,
            entryCount,
          }),
        },
      ],
      temperature: 0.7,
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
  if (!hooks.validate(guide)) {
    debugDump('bad-shape', { raw: acc.slice(0, 4000) })
    throw typed('GUIDE_JSON_ERROR', 'Guide v2 JSON missing required fields or invalid shape')
  }
  return guide
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
