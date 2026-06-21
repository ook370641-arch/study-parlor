import fs from 'node:fs'
import path from 'node:path'
import { ipcMain } from 'electron'
import { chatNonStream } from '../lib/kimi'
import { parseFrontmatter, serializeFrontmatter } from '../lib/frontmatter'
import type { AppConfig } from '../env'
import type { BriefingResult, BriefingSource, Message } from '@shared/index'

const FEED_X_URL = 'https://raw.githubusercontent.com/zarazhangrui/follow-builders/main/feed-x.json'
const FEED_PODCASTS_URL = 'https://raw.githubusercontent.com/zarazhangrui/follow-builders/main/feed-podcasts.json'
const FEED_BLOGS_URL = 'https://raw.githubusercontent.com/zarazhangrui/follow-builders/main/feed-blogs.json'

function promptsDir(): string {
  const candidates = [
    path.resolve(__dirname, '..', 'prompts', 'briefing'),
    path.resolve(__dirname, '..', '..', 'electron', 'prompts', 'briefing'),
  ]
  for (const c of candidates) {
    if (fs.existsSync(c)) return c
  }
  throw new Error(`briefing prompts dir not found. Tried: ${candidates.join(', ')}`)
}

function readPrompts(): Record<string, string> {
  const dir = promptsDir()
  const files = fs.readdirSync(dir).filter(f => f.endsWith('.md'))
  const out: Record<string, string> = {}
  for (const f of files) {
    const key = f.replace(/\.md$/, '').replace(/-/g, '_')
    out[key] = fs.readFileSync(path.join(dir, f), 'utf8')
  }
  return out
}

async function fetchJson<T>(url: string): Promise<T | null> {
  try {
    const res = await fetch(url)
    if (!res.ok) return null
    return (await res.json()) as T
  } catch (err) {
    console.error(`[briefing] fetch failed: ${url}`, err)
    return null
  }
}

function validateDate(date: string): void {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new Error('Invalid briefing date format')
  }
}

function buildUserContent(args: {
  date: string
  prompts: Record<string, string>
  feedX: unknown
  feedPodcasts: unknown
  feedBlogs: unknown
}): string {
  const sections = [
    `# Follow Builders Digest — ${args.date}`,
    `## Output mode`,
    `Bilingual (English + Chinese). Follow the translate.md bilingual interleaving rule.`,
    ``,
    `## Prompts`,
    ...Object.entries(args.prompts).map(([k, v]) => `### ${k}\n${v}`),
    ``,
    `## Feeds`,
    `### X/Twitter`,
    '```json\n' + JSON.stringify(args.feedX, null, 2) + '\n```',
    `### Podcasts`,
    '```json\n' + JSON.stringify(args.feedPodcasts, null, 2) + '\n```',
    `### Blogs`,
    '```json\n' + JSON.stringify(args.feedBlogs, null, 2) + '\n```',
  ]
  return sections.join('\n\n')
}

function buildSources(args: {
  feedX?: { x?: Array<{ name: string; handle: string; tweets: Array<{ text: string; url: string; createdAt: string }> }> } | null
  feedPodcasts?: { podcasts?: Array<{ name: string; title: string; url: string; publishedAt?: string }> } | null
  feedBlogs?: { blogs?: Array<{ name: string; title: string; url: string; publishedAt?: string | null }> } | null
}): BriefingSource[] {
  const sources: BriefingSource[] = []

  for (const builder of args.feedX?.x ?? []) {
    sources.push({
      type: 'x',
      author: builder.name,
      title: builder.handle,
      url: builder.tweets[0]?.url,
      items: builder.tweets.map(t => ({ text: t.text, url: t.url, timestamp: t.createdAt })),
    })
  }

  for (const episode of args.feedPodcasts?.podcasts ?? []) {
    sources.push({
      type: 'podcast',
      author: episode.name,
      title: episode.title,
      url: episode.url,
      items: [{ text: episode.title, url: episode.url, timestamp: episode.publishedAt ?? '' }],
    })
  }

  for (const post of args.feedBlogs?.blogs ?? []) {
    sources.push({
      type: 'blog',
      author: post.name,
      title: post.title,
      url: post.url,
      items: [{ text: post.title, url: post.url, timestamp: post.publishedAt ?? '' }],
    })
  }

  return sources
}

export function registerBriefingIpc(cfg: AppConfig) {
  ipcMain.handle('briefing:generate', async (_, args: { date: string; force?: boolean }): Promise<BriefingResult> => {
    const { date } = args
    validateDate(date)

    const fileName = `夜航简报-${date}.md`
    const filePath = path.join(cfg.libraryPath, fileName)

    // Same-day cache hit
    if (!args.force && fs.existsSync(filePath)) {
      const raw = fs.readFileSync(filePath, 'utf8')
      const { frontmatter, body } = parseFrontmatter(raw, { filename: fileName })
      const rawSources = (frontmatter as unknown as { sources?: string }).sources
      const sources: BriefingSource[] = rawSources ? JSON.parse(rawSources) as BriefingSource[] : []
      return {
        title: String(frontmatter.title || '夜航简报'),
        date,
        content: body,
        sources,
        filePath,
        cached: true,
      }
    }

    const [feedX, feedPodcasts, feedBlogs] = await Promise.all([
      fetchJson<unknown>(FEED_X_URL),
      fetchJson<unknown>(FEED_PODCASTS_URL),
      fetchJson<unknown>(FEED_BLOGS_URL),
    ])

    const hasAnyContent =
      (feedX as any)?.x?.length > 0 ||
      (feedPodcasts as any)?.podcasts?.length > 0 ||
      (feedBlogs as any)?.blogs?.length > 0

    if (!hasAnyContent) {
      throw new Error('FEED_EMPTY')
    }

    const prompts = readPrompts()
    const userContent = buildUserContent({ date, prompts, feedX, feedPodcasts, feedBlogs })

    const content = await chatNonStream(cfg, {
      messages: [{ role: 'user', content: userContent } as Message],
      temperature: 0.5,
    })

    const sources = buildSources({ feedX: feedX as any, feedPodcasts: feedPodcasts as any, feedBlogs: feedBlogs as any })

    const fm = {
      title: '夜航简报',
      type: 'briefing' as const,
      created: new Date().toISOString(),
      tags: ['industry-digest', 'ai'],
      sources: JSON.stringify(sources),
    }

    fs.writeFileSync(filePath, serializeFrontmatter('briefing', fm, content), 'utf8')

    return {
      title: '夜航简报',
      date,
      content,
      sources,
      filePath,
      cached: false,
    }
  })
}
