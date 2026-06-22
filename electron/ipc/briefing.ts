import fs from 'node:fs'
import path from 'node:path'
import { ipcMain } from 'electron'
import matter from 'gray-matter'
import { chatNonStream } from '../lib/kimi'
import { dumpRecovery } from '../lib/recovery'
import { parseFrontmatter, serializeFrontmatter } from '../lib/frontmatter'
import type { AppConfig } from '../env'
import type { BriefingResult, BriefingSource, Message, Profile } from '@shared/index'

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

const PROMPT_FILES = [
  'profile-context.md',
  'digest-intro.md',
  'summarize-tweets.md',
  'summarize-podcast.md',
  'summarize-blogs.md',
  'translate.md',
]

function readPrompts(): Record<string, string> {
  const dir = promptsDir()
  const out: Record<string, string> = {}
  for (const f of PROMPT_FILES) {
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

function briefingDir(cfg: AppConfig): string {
  return path.join(cfg.libraryPath, '夜航简报')
}

function briefingFilePath(cfg: AppConfig, date: string): string {
  return path.join(briefingDir(cfg), `夜航简报-${date}.md`)
}

type FeedX = {
  x?: Array<{
    name: string
    handle: string
    role?: string
    tweets: Array<{ text: string; url: string; createdAt: string }>
  }>
}

type FeedPodcasts = {
  podcasts?: Array<{
    name: string
    title: string
    url: string
    publishedAt?: string
  }>
}

type FeedBlogs = {
  blogs?: Array<{
    name: string
    title: string
    url: string
    publishedAt?: string | null
  }>
}

function hasAnyContent(feedX: FeedX | null, feedPodcasts: FeedPodcasts | null, feedBlogs: FeedBlogs | null): boolean {
  return (
    (feedX?.x?.length ?? 0) > 0 ||
    (feedPodcasts?.podcasts?.length ?? 0) > 0 ||
    (feedBlogs?.blogs?.length ?? 0) > 0
  )
}

function buildSources(args: {
  feedX?: FeedX | null
  feedPodcasts?: FeedPodcasts | null
  feedBlogs?: FeedBlogs | null
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

function buildExtractionPrompt(args: {
  profile: Profile
  prompts: Record<string, string>
  feedX: unknown
  feedPodcasts: unknown
  feedBlogs: unknown
}): string {
  const profileContext = args.prompts.profile_context.replace(
    '{{profile_text}}',
    args.profile.profile_text || '（未提供背景，按通用 AI 从业者处理）'
  )

  const schema = {
    builders: [
      {
        name: '...',
        role: '...',
        handle: '...',
        summary: '...',
        key_url: '...',
      },
    ],
    podcasts: [
      {
        show: '...',
        episode: '...',
        url: '...',
        takeaway: '...',
        summary: '...',
        quote: '...',
      },
    ],
    blogs: [
      {
        blog: '...',
        title: '...',
        url: '...',
        summary: '...',
        quote: '...',
      },
    ],
  }

  const sections = [
    `# Follow Builders Structured Extraction`,
    ``,
    profileContext,
    ``,
    `## Output format`,
    `Output ONLY a single JSON object matching the schema below. Do not include markdown code fences or explanations.`,
    ``,
    '```json\n' + JSON.stringify(schema, null, 2) + '\n```',
    ``,
    `## Summary instructions`,
    `### summarize-tweets`,
    args.prompts.summarize_tweets,
    ``,
    `### summarize-podcast`,
    args.prompts.summarize_podcast,
    ``,
    `### summarize-blogs`,
    args.prompts.summarize_blogs,
    ``,
    `## Feeds`,
    `### X/Twitter`,
    '```json\n' + JSON.stringify(args.feedX, null, 2) + '\n```',
    `### Podcasts`,
    '```json\n' + JSON.stringify(args.feedPodcasts, null, 2) + '\n```',
    `### Blogs`,
    '```json\n' + JSON.stringify(args.feedBlogs, null, 2) + '\n```',
  ]
  return sections.join('\n')
}

function buildAssemblyPrompt(args: {
  prompts: Record<string, string>
  structured: string
}): string {
  const sections = [
    `# Bilingual Digest Assembly`,
    ``,
    args.prompts.digest_intro,
    ``,
    args.prompts.translate,
    ``,
    `## Structured summaries to assemble`,
    '```json\n' + args.structured + '\n```',
    ``,
    `Write the final digest in Markdown following the section order and bilingual interleaving rules above.`,
  ]
  return sections.join('\n')
}

function parseStructuredJson(raw: string): unknown {
  let text = raw.trim()
  if (text.startsWith('```')) {
    text = text.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim()
  }
  return JSON.parse(text)
}

export function registerBriefingIpc(cfg: AppConfig) {
  ipcMain.handle('briefing:generate', async (_, args: { date: string; profile: Profile; force?: boolean }): Promise<BriefingResult> => {
    const { date, profile } = args
    validateDate(date)

    const filePath = briefingFilePath(cfg, date)

    if (!args.force && fs.existsSync(filePath)) {
      const raw = fs.readFileSync(filePath, 'utf8')
      const { frontmatter, body } = parseFrontmatter(raw, { filename: path.basename(filePath) })
      const rawSources = matter(raw).data?.sources
      let sources: BriefingSource[] = []
      if (typeof rawSources === 'string' && rawSources) {
        try {
          sources = JSON.parse(rawSources) as BriefingSource[]
        } catch {
          sources = []
        }
      }
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
      fetchJson<FeedX>(FEED_X_URL),
      fetchJson<FeedPodcasts>(FEED_PODCASTS_URL),
      fetchJson<FeedBlogs>(FEED_BLOGS_URL),
    ])

    if (!hasAnyContent(feedX, feedPodcasts, feedBlogs)) {
      throw new Error('FEED_EMPTY')
    }

    const prompts = readPrompts()

    const extractionPrompt = buildExtractionPrompt({
      profile,
      prompts,
      feedX,
      feedPodcasts,
      feedBlogs,
    })

    const structuredRaw = await chatNonStream(cfg, {
      messages: [{ role: 'user', content: extractionPrompt } as Message],
      temperature: 0.5,
      thinking: { type: 'enabled', reasoning_effort: 'max' },
    })

    const structured = parseStructuredJson(structuredRaw)

    const assemblyPrompt = buildAssemblyPrompt({
      prompts,
      structured: JSON.stringify(structured, null, 2),
    })

    const content = await chatNonStream(cfg, {
      messages: [{ role: 'user', content: assemblyPrompt } as Message],
      temperature: 0.5,
      thinking: { type: 'enabled', reasoning_effort: 'max' },
    })

    const sources = buildSources({ feedX, feedPodcasts, feedBlogs })

    const fm = {
      title: '夜航简报',
      type: 'briefing' as const,
      created: new Date().toISOString(),
      tags: ['industry-digest', 'ai'],
      sources: JSON.stringify(sources),
    }

    try {
      fs.mkdirSync(briefingDir(cfg), { recursive: true })
      fs.writeFileSync(filePath, serializeFrontmatter('briefing', fm, content), 'utf8')
    } catch (writeErr) {
      console.error('[briefing] failed to write cached file, dumping recovery', writeErr)
      dumpRecovery(path.basename(filePath), content)
    }

    return {
      title: '夜航简报',
      date,
      content,
      sources,
      filePath,
      cached: false,
    }
  })

  ipcMain.handle('briefing:list', async (): Promise<{ date: string; filePath: string }[]> => {
    const dir = briefingDir(cfg)
    if (!fs.existsSync(dir)) return []

    const entries = fs.readdirSync(dir)
    const list: { date: string; filePath: string }[] = []
    for (const name of entries) {
      const m = name.match(/^夜航简报-(\d{4}-\d{2}-\d{2})\.md$/)
      if (!m) continue
      list.push({ date: m[1], filePath: path.join(dir, name) })
    }
    return list.sort((a, b) => b.date.localeCompare(a.date))
  })
}
