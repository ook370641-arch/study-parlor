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

// --- tier-2: 裸 fetch + turndown ---
export async function plainFetch(url: string, signal?: AbortSignal): Promise<string> {
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

export async function scraperFetch(url: string): Promise<ScraperResult> {
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
    tavilyExtract: makeTavilyExtract(process.env.TAVILY_API_KEY ?? ''),
    plainFetch,
    scraperFetch,
  }
  const errors: any[] = []

  // tier-1
  try {
    const markdown = await d.tavilyExtract(opts.url, opts.signal)
    if (markdown.length < MIN_CONTENT_LENGTH) throw codedError('NO_CONTENT', 'tavily extract content too short')
    return {
      url: opts.url, title: titleFromMarkdown(markdown, opts.url), markdown,
      summary: firstParagraph(markdown), publishedAt: null, authors: [], tier: 1,
    }
  } catch (err) { errors.push(err) }

  // tier-2
  try {
    const markdown = await d.plainFetch(opts.url, opts.signal)
    if (markdown.length < MIN_CONTENT_LENGTH) throw codedError('NO_CONTENT', 'plain fetch content too short')
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
