import fs from 'node:fs'
import path from 'node:path'
import { ipcMain } from 'electron'
import matter from 'gray-matter'
import { chatNonStream } from '../lib/kimi'
import { dumpRecovery } from '../lib/recovery'
import { parseFrontmatter, serializeFrontmatter } from '../lib/frontmatter'
import type { AppConfig } from '../env'
import type { BriefingResult, BriefingSource, BriefingStage, Message, Profile } from '@shared/index'

const DEFAULT_FEED_X_URL = 'https://raw.githubusercontent.com/zarazhangrui/follow-builders/main/feed-x.json'
const DEFAULT_FEED_PODCASTS_URL = 'https://raw.githubusercontent.com/zarazhangrui/follow-builders/main/feed-podcasts.json'
const DEFAULT_FEED_BLOGS_URL = 'https://raw.githubusercontent.com/zarazhangrui/follow-builders/main/feed-blogs.json'

function feedUrls() {
  return {
    x: process.env.BRIEFING_FEED_X_URL || DEFAULT_FEED_X_URL,
    podcasts: process.env.BRIEFING_FEED_PODCASTS_URL || DEFAULT_FEED_PODCASTS_URL,
    blogs: process.env.BRIEFING_FEED_BLOGS_URL || DEFAULT_FEED_BLOGS_URL,
  }
}

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
  let res: Response
  try {
    const ctl = new AbortController()
    const timeoutId = setTimeout(() => ctl.abort(), 30_000)
    try {
      res = await fetch(url, {
        signal: ctl.signal,
        headers: { 'User-Agent': 'study-parlor/1.0' },
      })
    } finally {
      clearTimeout(timeoutId)
    }
  } catch (err) {
    console.error(`[briefing] fetch failed: ${url}`, err)
    throw new Error(`NETWORK_ERROR: ${url}`)
  }
  if (!res.ok) {
    console.error(`[briefing] fetch returned ${res.status}: ${url}`)
    throw new Error(`NETWORK_ERROR: ${url} (${res.status})`)
  }
  try {
    return (await res.json()) as T
  } catch (err) {
    console.error(`[briefing] invalid JSON from ${url}`, err)
    throw new Error(`NETWORK_ERROR: ${url} (invalid JSON)`)
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
    const tweets = builder.tweets ?? []
    if (tweets.length === 0) continue
    sources.push({
      type: 'x',
      author: builder.name,
      title: builder.handle,
      url: tweets[0]?.url,
      items: tweets.map(t => ({ text: t.text, url: t.url, timestamp: t.createdAt })),
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
  try {
    return JSON.parse(text)
  } catch (err) {
    throw new Error(`BRIEFING_PARSE_ERROR: ${err instanceof Error ? err.message : String(err)}`)
  }
}

export function registerBriefingIpc(cfg: AppConfig) {
  ipcMain.handle('briefing:generate', async (event, args: { date: string; profile: Profile; force?: boolean }): Promise<BriefingResult> => {
    const sender = event.sender
    const emitProgress = (stage: BriefingStage, detail?: string) => {
      if (!sender.isDestroyed()) {
        sender.send('briefing:progress', stage, detail)
      }
    }
    const { date, profile } = args
    validateDate(date)

    const filePath = briefingFilePath(cfg, date)

    if (!args.force && fs.existsSync(filePath)) {
      const raw = fs.readFileSync(filePath, 'utf8')
      const { frontmatter, body } = parseFrontmatter(raw, { filename: path.basename(filePath) })

      // E2E fixtures can seed cached error files with "## Error\n\nBRIEFING_<ERROR_CODE>"
      // to exercise error UI without hitting the network/LLM.
      const errorMatch = body
        .trim()
        .match(/^##\s*Error\s*\n\s*(BRIEFING_(FEED_EMPTY|NETWORK_ERROR|LLM_ERROR|ASSEMBLY_ERROR))$/)
      if (errorMatch) {
        throw new Error(errorMatch[1])
      }

      const rawSources = matter(raw).data?.briefing_sources ?? matter(raw).data?.sources
      let sources: BriefingSource[] = []
      if (typeof rawSources === 'string' && rawSources) {
        try {
          sources = JSON.parse(rawSources) as BriefingSource[]
        } catch {
          sources = []
        }
      }
      const generatedAt = String(frontmatter.created ?? new Date().toISOString())
      return {
        title: String(frontmatter.title || '夜航简报'),
        date,
        content: body,
        sources,
        filePath,
        cached: true,
        generatedAt,
      }
    }

    // E2E fast path: return mock briefing without hitting feeds/LLM when no cache.
    // Set E2E_BRIEFING_DISABLE_MOCK=1 to exercise the real fetch/LLM generation chain.
    // Also require E2E_CONFIG_DIR so unit tests (NODE_ENV=test) do not take this path.
    if (
      process.env.NODE_ENV === 'test' &&
      process.env.E2E_CONFIG_DIR &&
      process.env.E2E_BRIEFING_DISABLE_MOCK !== '1'
    ) {
      emitProgress('fetching', 'MOCK')
      emitProgress('extracting', 'MOCK')
      emitProgress('assembling', 'MOCK')
      emitProgress('finalizing', 'MOCK')
      const mockContent = '## X / Twitter\n\n### Test Feed\nTest content in English.\n\n## 中文摘要\n\n这是一条中文测试内容。'
      const frontmatter = `---\ntitle: 夜航简报\ntype: briefing\ncreated: '${new Date().toISOString()}'\ntags:\n  - industry-digest\n  - ai\n---\n\n`
      fs.mkdirSync(path.dirname(filePath), { recursive: true })
      try {
        fs.writeFileSync(filePath, frontmatter + mockContent, 'utf8')
      } catch {
        // cache write can fail silently
      }
      emitProgress('done')
      return {
        title: '夜航简报',
        date,
        content: mockContent,
        sources: [],
        filePath,
        cached: false,
        generatedAt: new Date().toISOString(),
      }
    }

    const urls = feedUrls()
    const [feedX, feedPodcasts, feedBlogs] = await Promise.all([
      fetchJson<FeedX>(urls.x).catch((err) => {
        console.warn(`[briefing] feed X unavailable, continuing: ${err.message}`)
        return null
      }),
      fetchJson<FeedPodcasts>(urls.podcasts).catch((err) => {
        console.warn(`[briefing] feed podcasts unavailable, continuing: ${err.message}`)
        return null
      }),
      fetchJson<FeedBlogs>(urls.blogs).catch((err) => {
        console.warn(`[briefing] feed blogs unavailable, continuing: ${err.message}`)
        return null
      }),
    ])

    emitProgress('fetching')

    if (!hasAnyContent(feedX, feedPodcasts, feedBlogs)) {
      throw new Error('FEED_EMPTY')
    }

    const prompts = readPrompts()

    const extractionPrompt = buildExtractionPrompt({
      profile,
      prompts,
      feedX: feedX ?? {},
      feedPodcasts: feedPodcasts ?? {},
      feedBlogs: feedBlogs ?? {},
    })

    const llmCtl = new AbortController()
    const llmTimeout = setTimeout(() => llmCtl.abort(), 300_000)
    let cacheWriteFailed = false

    try {
      emitProgress('extracting')
      let structuredRaw: string
      try {
        structuredRaw = await chatNonStream(cfg, {
          messages: [{ role: 'user', content: extractionPrompt } as Message],
          temperature: 0.5,
          thinking: { type: 'enabled', reasoning_effort: 'high' },
          signal: llmCtl.signal,
        })
      } catch (err) {
        throw new Error(`LLM_ERROR: ${err instanceof Error ? err.message : String(err)}`)
      }

      let structured: unknown
      try {
        structured = parseStructuredJson(structuredRaw)
      } catch (err) {
        throw new Error(`ASSEMBLY_ERROR: ${err instanceof Error ? err.message : String(err)}`)
      }

      emitProgress('assembling')
      const assemblyPrompt = buildAssemblyPrompt({
        prompts,
        structured: JSON.stringify(structured, null, 2),
      })

      let content: string
      try {
        content = await chatNonStream(cfg, {
          messages: [{ role: 'user', content: assemblyPrompt } as Message],
          temperature: 0.5,
          thinking: { type: 'enabled', reasoning_effort: 'high' },
          signal: llmCtl.signal,
        })
      } catch (err) {
        throw new Error(`LLM_ERROR: ${err instanceof Error ? err.message : String(err)}`)
      }

      emitProgress('finalizing')
      const sources = buildSources({ feedX, feedPodcasts, feedBlogs })
      const generatedAt = new Date().toISOString()

      const fm = {
        title: '夜航简报',
        type: 'briefing' as const,
        created: generatedAt,
        tags: ['industry-digest', 'ai'],
        briefing_sources: JSON.stringify(sources),
      }

      try {
        fs.mkdirSync(briefingDir(cfg), { recursive: true })
        fs.writeFileSync(filePath, serializeFrontmatter('briefing', fm, content), 'utf8')
      } catch (writeErr) {
        console.error('[briefing] failed to write cached file, dumping recovery', writeErr)
        dumpRecovery(path.basename(filePath), content)
        cacheWriteFailed = true
      }

      return {
        title: '夜航简报',
        date,
        content,
        sources,
        filePath,
        cached: false,
        cacheWriteFailed,
        generatedAt,
      }
    } finally {
      clearTimeout(llmTimeout)
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
