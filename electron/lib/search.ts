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
