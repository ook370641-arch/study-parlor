import { chatNonStream } from './kimi'
import { extractJsonArray } from './extract-json'
import type { AppConfig } from '../env'
import type { SearchSource, SearchResult } from '@shared/index'

const DEFAULT_TAVILY_API_URL = 'https://api.tavily.com/search'
const MAX_SNIPPET_LENGTH = 200

export type TavilySearchOptions = {
  query: string
  apiKey: string
  baseUrl?: string
  maxResults?: number
  signal?: AbortSignal
  days?: number
  includeDomains?: string[]
}

export type TavilyResult = {
  title: string
  url: string
  content: string
  score?: number
}

export async function searchWeb(opts: TavilySearchOptions): Promise<TavilyResult[]> {
  const url = opts.baseUrl || process.env.TAVILY_API_URL || DEFAULT_TAVILY_API_URL
  const ctl = new AbortController()
  const timeoutId = setTimeout(() => ctl.abort(), 15000)
  let externalListenerAdded = false
  const onExternalAbort = () => ctl.abort()
  if (opts.signal) {
    if (opts.signal.aborted) {
      ctl.abort()
    } else {
      opts.signal.addEventListener('abort', onExternalAbort, { once: true })
      externalListenerAdded = true
    }
  }

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: ctl.signal,
      body: JSON.stringify({
        api_key: opts.apiKey,
        query: opts.query,
        search_depth: 'basic',
        max_results: opts.maxResults ?? 5,
        include_answer: false,
        ...(opts.days !== undefined ? { days: opts.days } : {}),
        ...(opts.includeDomains?.length ? { include_domains: opts.includeDomains } : {})
      })
    })
    if (!res.ok) {
      let body = ''
      try { body = await res.text() } catch { /* ignore */ }
      console.error(`[search] Tavily HTTP ${res.status}: ${body.slice(0, 500)}`)
      const err = new Error(`Tavily search failed: HTTP ${res.status}`) as Error & { code: string }
      err.code = 'TAVILY_ERROR'
      throw err
    }
    const data = await res.json() as { results?: TavilyResult[] }
    if (!data.results || data.results.length === 0) {
      const err = new Error('NO_RESULTS') as Error & { code: string }
      err.code = 'NO_RESULTS'
      throw err
    }
    return data.results
  } catch (err: any) {
    // Connection-level errors (TypeError, DNS, etc.) have no .code — mark them so
    // toJobErrorCode can classify them as TAVILY_ERROR instead of NETWORK_ERROR.
    if (!err.code && err.name !== 'AbortError') {
      err.code = 'TAVILY_ERROR'
    }
    throw err
  } finally {
    clearTimeout(timeoutId)
    if (externalListenerAdded) {
      opts.signal!.removeEventListener('abort', onExternalAbort)
    }
  }
}

export async function generateSearchQueries(
  cfg: AppConfig,
  topic: string
): Promise<string[]> {
  const prompt = `用户将要学习主题为："${topic}"

请生成 3 个搜索查询词，用于帮助一位苏格拉底式导师准备该主题的背景资料。

要求：
- 查询词应覆盖主题的核心概念、常见误解、实际应用
- 每个查询词简短，适合交给搜索引擎
- 只输出 JSON 数组，不要解释

输出格式：
["查询1", "查询2", "查询3"]`

  const text = await chatNonStream(cfg, {
    messages: [{ role: 'user', content: prompt }],
    temperature: 0.3,
    thinking: { type: 'disabled' }
  })
  const extracted = extractJsonArray(text)
  if (!extracted) throw new Error('JSON extraction failed')
  let arr: unknown
  try {
    arr = JSON.parse(extracted)
  } catch {
    throw new Error('JSON parse failed')
  }
  if (!Array.isArray(arr)) throw new Error('JSON parse failed: not an array')
  const queries = arr.filter((q): q is string => typeof q === 'string')
  if (queries.length === 0) throw new Error('No valid search queries generated')
  return queries.slice(0, 3)
}

export async function generateExploratoryQueries(
  cfg: AppConfig,
  topic: string
): Promise<string[]> {
  const prompt = `用户想研究：「${topic}」

请生成 2-3 个宽域搜索查询词，用于全面了解这个主题。要求：
- 覆盖不同角度（架构设计、工程实践、对比分析、底层原理）
- 查询词简短、精准，适合英文搜索引擎
- 查询词用英文（此类技术资料英文质量更高）
只输出 JSON 数组：["查询1", "查询2"]`

  const text = await chatNonStream(cfg, {
    messages: [{ role: 'user', content: prompt }],
    temperature: 0.3,
    thinking: { type: 'disabled' }
  })
  const extracted = extractJsonArray(text)
  if (!extracted) throw new Error('JSON extraction failed')
  let arr: unknown
  try {
    arr = JSON.parse(extracted)
  } catch {
    throw new Error('JSON parse failed')
  }
  if (!Array.isArray(arr)) throw new Error('JSON parse failed: not an array')
  const queries = arr.filter((q): q is string => typeof q === 'string')
  if (queries.length === 0) throw new Error('No valid search queries generated')
  return queries.slice(0, 3)
}

export async function identifySubDimensions(
  cfg: AppConfig,
  topic: string,
  round1Results: TavilyResult[]
): Promise<string[]> {
  const prompt = `以下是关于「${topic}」的第一轮网络搜索结果。请通读，识别 2-4 个值得深挖的子维度，生成精准搜索查询词。

第一轮结果：
${formatResultsForSearchPrompt(round1Results, 'R1')}

只输出 JSON 数组：["查询1", "查询2"]`

  const text = await chatNonStream(cfg, {
    messages: [{ role: 'user', content: prompt }],
    temperature: 0.3,
    thinking: { type: 'disabled' }
  })
  const extracted = extractJsonArray(text)
  if (!extracted) throw new Error('JSON extraction failed')
  let arr: unknown
  try {
    arr = JSON.parse(extracted)
  } catch {
    throw new Error('JSON parse failed')
  }
  if (!Array.isArray(arr)) throw new Error('JSON parse failed: not an array')
  const queries = arr.filter((q): q is string => typeof q === 'string')
  return queries.slice(0, 4)
}

export async function synthesizeResearchReport(
  cfg: AppConfig,
  topic: string,
  round1Results: TavilyResult[],
  round2Results: TavilyResult[]
): Promise<string> {
  const prompt = `你是一位技术研究助手。以下是从两轮网络搜索得到的关于「${topic}」的资料。

## 第一轮（全景扫描）
${formatResultsForSearchPrompt(round1Results, 'R1')}

## 第二轮（子维度深钻）
${round2Results.length > 0
  ? formatResultsForSearchPrompt(round2Results, 'R2')
  : '（无 — 仅基于第一轮结果合成）'}

请撰写一份结构化的研究报告。要求：

1. 输出纯 markdown 格式，控制在 4000 字以内
2. 结构灵活但不失深度——根据材料自然产生的维度组织章节，而不是套固定模板
3. 优先使用：对比表格、分层分析、关键数据点
4. 每个事实性陈述后附上来源编号 [1] [2] ...
5. 如果材料之间存在矛盾或不同观点，明确指出
6. 结尾附"关键收获"：3-5 条最值得记住的要点
7. 结尾附"来源列表"

写作风格：资深工程师写的内部技术备忘录。`

  const report = await chatNonStream(cfg, {
    messages: [{ role: 'user', content: prompt }],
    temperature: 0.5,
    thinking: { type: 'enabled', reasoning_effort: 'high' }
  })
  return report.trim()
}

export async function generateTutorSupplement(
  cfg: AppConfig,
  topic: string,
  report: string
): Promise<{ tutorNotes: string; questions: string }> {
  const prompt = `以下是一份关于「${topic}」的研究报告。

---
${report}
---

请基于以上报告，生成以下两部分内容：

### 导师备课笔记
将报告的核心知识转化为苏格拉底式导师的备课参考。包含：核心概念（2-4个）、关键区分点、常见误解（2-3个）、前置知识。风格：导师知道但不直接告诉学生的背景笔记。控制在 800 字以内。

### 提问方向
基于报告内容，给出 3-5 个苏格拉底式提问方向，用于引导学生自己发现这些知识。每个提问方向包含：引导问题 + 期望学生最终自己发现的结论。

请用 markdown 分隔线 --- 隔开两个部分。`

  const text = await chatNonStream(cfg, {
    messages: [{ role: 'user', content: prompt }],
    temperature: 0.5,
    thinking: { type: 'enabled', reasoning_effort: 'high' }
  })

  // 解析两个部分：以第一个 "\n---\n" 为界
  const sepIdx = text.indexOf('\n---\n')
  let tutorNotes = ''
  let questions = ''
  if (sepIdx > 0) {
    tutorNotes = text.slice(0, sepIdx).trim()
    questions = text.slice(sepIdx + 5).trim()
  } else {
    // 降级：整段作为导师笔记
    tutorNotes = text.trim()
  }
  return { tutorNotes, questions }
}

function formatResultsForSearchPrompt(
  results: TavilyResult[],
  label: string
): string {
  if (!results || results.length === 0) return `（${label}: 无结果）`
  return results.map((r, i) =>
    `[${label}-${i + 1}] ${r.title}\nURL: ${r.url}\n摘要: ${(r.content || '').slice(0, 400)}`
  ).join('\n\n')
}

export async function generateTutorBrief(
  cfg: AppConfig,
  topic: string,
  results: TavilyResult[]
): Promise<SearchResult> {
  const sourcesText = results.map((r, i) =>
    `[${i + 1}] ${r.title}\nURL: ${r.url}\n摘要：${r.content}`
  ).join('\n\n')

  const prompt = `你是一位苏格拉底式导师的备课助手。以下是从网络搜索得到的关于 "${topic}" 的原始资料。

请整理成一份"导师备课笔记"，用于后续辅导时作为背景知识。

要求：
1. 控制在 5000 中文字以内
2. 包含：核心概念（2-4 个）、关键区分点、常见误解（2-3 个）、应用场景（1-2 个）、前置知识
3. 每个关键观点后附上原始来源编号 [1] [2] ...
4. 不要写成"教学大纲"，而要写成"导师知道但不直接告诉学生"的背景笔记

原始资料：
${sourcesText}`

  const summary = await chatNonStream(cfg, {
    messages: [{ role: 'user', content: prompt }],
    temperature: 0.3,
    thinking: { type: 'disabled' }
  })

  const sources: SearchSource[] = results.map(r => ({
    title: r.title,
    url: r.url,
    snippet: r.content.slice(0, MAX_SNIPPET_LENGTH)
  }))

  return { summary: summary.trim(), sources }
}
