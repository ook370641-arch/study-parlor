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
