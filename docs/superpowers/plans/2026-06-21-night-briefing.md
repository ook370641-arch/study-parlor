# 夜航简报 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "夜航简报" daily AI-industry digest page to Study Parlor, with a Cover entry, timeline/nautical UI, bilingual report, expandable sources, and same-day file caching in the study library.

**Architecture:** A new main-process IPC handler fetches public follow-builders feeds, assembles a single user prompt from built-in prompt files, calls `chatNonStream` once, writes `夜航简报-YYYY-MM-DD.md`, and returns the result. The renderer reuses the existing `SurfaceBackground` oil-painting pipeline and adds a `Briefing` page plus a shared `BackToCover` arrow for `Home` and `Briefing`.

**Tech Stack:** Electron 30, React 18, TypeScript, Tailwind CSS, Zustand, gray-matter, Vitest.

---

## File map

| File | Change | Responsibility |
|------|--------|----------------|
| `src/types/index.ts` | Modify | `DocType`, `BriefingResult`, `BriefingSource`, `IpcApi.briefingGenerate`, `Painting` unchanged |
| `electron/lib/frontmatter.ts` | Modify | Add `'briefing'` to `EXT_FIELDS`; infer type from filename |
| `electron/prompts/briefing/*.md` | Create 5 files | Built-in digest prompts copied from follow-builders |
| `electron/ipc/briefing.ts` | Create | Main-process feed fetch, LLM call, file cache, IPC handler |
| `electron/ipc/index.ts` | Modify | Register `registerBriefingIpc` |
| `electron/preload.ts` | Modify | Expose `briefingGenerate` |
| `src/lib/ipc.ts` | Modify | Renderer facade for `briefingGenerate` |
| `src/store/index.ts` | Modify | Add `'briefing'` page, painting surface, briefing state, `generateBriefing` action |
| `src/components/SurfaceBackground.tsx` | Modify | Allow `surface="briefing"` |
| `src/components/SwapPaintingButton.tsx` | Modify | Allow `surface="briefing"` |
| `src/components/BackToCover.tsx` | Create | Shared ← arrow button |
| `src/components/BriefingSkeleton.tsx` | Create | Loading placeholder |
| `src/lib/format-briefing-date.ts` | Create | Local `YYYY-MM-DD` helper |
| `src/lib/parse-briefing-markdown.ts` | Create | Split LLM markdown into timeline sections + sources |
| `src/pages/Home.tsx` | Modify | Add `BackToCover` |
| `src/pages/Cover.tsx` | Modify | Add "夜航简报" secondary button |
| `src/pages/Briefing.tsx` | Create | Briefing page with timeline layout |
| `src/App.tsx` | Modify | Render `Briefing` page |
| `tests/briefing.test.ts` | Create | IPC cache, feed fetch, markdown parsing tests |
| `tests/briefing-prompts.test.ts` | Create | Prompt files exist and contain expected markers |

---

## Task 1: Shared types and frontmatter

**Files:**
- Modify: `src/types/index.ts:6`, `src/types/index.ts:104-210`
- Modify: `electron/lib/frontmatter.ts:8-13`, `electron/lib/frontmatter.ts:25-32`

- [ ] **Step 1.1: Add `briefing` to `DocType` and new briefing types**

```typescript
// src/types/index.ts
export type DocType = 'progress' | 'review' | 'fable' | 'transcript' | 'briefing'

export type BriefingSourceType = 'x' | 'podcast' | 'blog'

export type BriefingSourceItem = {
  text?: string
  url?: string
  timestamp?: string
}

export type BriefingSource = {
  type: BriefingSourceType
  author?: string
  title?: string
  url?: string
  items: BriefingSourceItem[]
}

export type BriefingResult = {
  title: string
  date: string
  content: string
  sources: BriefingSource[]
  filePath: string
  cached: boolean
}
```

- [ ] **Step 1.2: Add `briefingGenerate` to `IpcApi`**

Insert into `IpcApi` before `bootFatal`:

```typescript
briefingGenerate: (args: { date: string; force?: boolean }) => Promise<BriefingResult>
```

- [ ] **Step 1.3: Add briefing frontmatter support**

```typescript
// electron/lib/frontmatter.ts
const EXT_FIELDS: Record<DocType, string[]> = {
  progress: ['session_number', 'difficulty', 'progress_summary', 'last_studied', 'review_count'],
  review: ['review_index', 'last_reviewed', 'source_title'],
  fable: ['source_topic'],
  transcript: ['session_number'],
  briefing: [],
}

function inferDocTypeFromFilename(filename: string): DocType {
  const lower = filename.toLowerCase()
  if (lower.includes('学习报告')) return 'progress'
  if (lower.includes('复习报告')) return 'review'
  if (lower.includes('寓言')) return 'fable'
  if (lower.includes('原始对话')) return 'transcript'
  if (lower.includes('夜航简报')) return 'briefing'
  return 'progress'
}
```

- [ ] **Step 1.4: Run type checks**

```bash
npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 1.5: Commit**

```bash
git add src/types/index.ts electron/lib/frontmatter.ts
git commit -m "types(briefing): add DocType, BriefingResult, IpcApi and frontmatter support"
```

---

## Task 2: Built-in briefing prompts

**Files:**
- Create: `electron/prompts/briefing/digest-intro.md`
- Create: `electron/prompts/briefing/summarize-tweets.md`
- Create: `electron/prompts/briefing/summarize-podcast.md`
- Create: `electron/prompts/briefing/summarize-blogs.md`
- Create: `electron/prompts/briefing/translate.md`

- [ ] **Step 2.1: Create the five prompt files**

Copy the exact content from the follow-builders skill prompts (already captured in the design companion run). Each file must be plain Markdown with no frontmatter.

`electron/prompts/briefing/digest-intro.md`:
```markdown
# Digest Intro Prompt

You are assembling the final digest from individual source summaries.

## Format

Start with this header (replace [Date] with today's date):

AI Builders Digest — [Date]

Then organize content in this order:

1. X / TWITTER section — list each builder with new posts
2. OFFICIAL BLOGS section — list each blog post from AI company blogs (OpenAI, Anthropic, etc.)
3. PODCASTS section — list each podcast with new episodes

## Rules

- Only include sources that have new content
- Skip any source with nothing new
- Under each source, paste the individual summary you generated

### Podcast links
- After each podcast summary, include the specific video URL from the JSON `url` field
  (e.g. https://youtube.com/watch?v=Iu4gEnZFQz8)
- NEVER link to the channel page. Always link to the specific video.
- Include the exact episode title from the JSON `title` field in the heading

### Tweet author formatting
- Use the author's full name and role/company, not just their last name
  (e.g. "Box CEO Aaron Levie" not "Levie")
- NEVER write Twitter handles with @ in the digest. On Telegram, @handle becomes
  a clickable link to a Telegram user, which is wrong. Instead write handles
  without @ (e.g. "Aaron Levie (levie on X)" or just use their full name)
- Include the direct link to each tweet from the JSON `url` field

### Blog post formatting
- Use the blog name as a section header (e.g. "Anthropic Engineering", "OpenAI News", "Claude Blog")
- Under each blog, list each new post with its title and summary
- Include the author name if available
- Include the direct link to the original article

### Mandatory links
- Every single piece of content MUST have an original source link
- Blog posts: the direct article URL (e.g. https://www.anthropic.com/engineering/...)
- Podcasts: the YouTube video URL (e.g. https://youtube.com/watch?v=xxx)
- Tweets: the direct tweet URL (e.g. https://x.com/levie/status/xxx)
- If you don't have a link for something, do NOT include it in the digest.
  No link = not real = do not include.

### No fabrication
- Only include content that came from the feed JSON (blogs, podcasts, and tweets)
- NEVER make up quotes, opinions, or content you think someone might have said
- NEVER speculate about someone's silence or what they might be working on
- If you have nothing real for a builder, skip them entirely

### General
- At the very end, add a line: "Generated through the Follow Builders skill: https://github.com/zarazhangrui/follow-builders"
- Keep formatting clean and scannable — this will be read on a phone screen
```

`electron/prompts/briefing/summarize-tweets.md`:
```markdown
# X/Twitter Summary Prompt

You are summarizing recent posts from an AI builder for a busy professional who wants
to know what this person is thinking and building.

## Instructions

- Start by introducing the author with their full name AND role/company
  (e.g. "Replit CEO Amjad Masad", "Box CEO Aaron Levie", "a16z partner Justine Moore")
  Do NOT use just their last name. Do NOT use their Twitter handle with @.
- Only include substantive content: original opinions, insights, product announcements,
  technical discussions, industry analysis, or lessons learned
- SKIP: mundane personal tweets, retweets without commentary, promotional content,
  "great event!" type posts, engagement bait
- For threads: summarize the full thread as one cohesive piece, not individual tweets
- For quote tweets: include the context of what they're responding to
- Write 2-4 sentences per builder summarizing their key points
- If they made a bold prediction or shared a contrarian take, lead with that
- If they shared a tool, demo, or resource, mention it by name with the link
- If there's nothing substantive to report, say "No notable posts" rather than
  padding with fluff
```

`electron/prompts/briefing/summarize-podcast.md`:
```markdown
# Podcast Remix Prompt

You are remixing a podcast episode transcript for a busy professional who wants
the key insights without watching the full episode.

## Instructions

- Write a remix of 200-400 words
- Start with a one-sentence "The Takeaway" — what's the single most important takeaway?
- Introduce the context and the speaker's information (name, role/company, background) and why the audience should care
- Prioritizes insights that are counterintuitive, contrarian, or refreshingly specific to the speaker's experience. Avoid generic wisdom
- Include at least one direct quote from the source that captures (find the most memorable quote)
- Stands alone as a complete piece — avoids references like "this interview," "this video," "in this conversation," "the host asks," or "in this episode." Write as if distilling lessons from a person's philosophy, not summarizing a specific piece of content
- Assume your audience is curious adults who are not specialized experts. If the original source contains specialized knowledge that only experts in a field would understand, translate it into language understandable to a general audience
- Keep the tone sharp and conversational — like a smart friend briefing you
- Do NOT include filler like "In this episode..." or "The host and guest discussed..."
- Jump straight into the substance
```

`electron/prompts/briefing/summarize-blogs.md`:
```markdown
# Blog Post Summary Prompt

You are summarizing a blog post from an AI company (OpenAI, Anthropic, etc.) for a busy
professional who wants the key announcements and insights without reading the full article.

## Instructions

- Start with the blog name and article title (e.g. "Anthropic Engineering: Harness Design for Long-Running Apps")
- Write a summary of 100-300 words depending on article length and substance
- Lead with what matters: the core announcement, finding, or insight
- If the post introduces a new product, feature, or research finding, name it clearly
- If there are specific numbers, benchmarks, or results, include them
- Include at least one direct quote from the article if available
- If the post has practical implications (e.g. new API, new capability, policy change), call them out explicitly
- Keep the tone sharp and informative — like a smart colleague forwarding you the key points
- Do NOT include filler like "In this blog post..." or "The author discusses..."
- Jump straight into the substance
- Include the direct link to the original article
```

`electron/prompts/briefing/translate.md`:
```markdown
# Translation Prompt

You are translating an AI industry digest from English to Chinese.

## Instructions

- Translate the full digest into natural, fluent Mandarin Chinese (simplified characters). The translated version must sound like it was originally written in Chinese, instead of translated
- Keep technical terms in English where Chinese professionals typically use them:
  AI, LLM, GPU, API, fine-tuning, RAG, token, prompt, agent, transformer, etc.
- Keep all proper nouns in English: names of people, companies, products, tools
- Keep all URLs unchanged
- Maintain the same structure and formatting as the English version
- The tone should be professional but conversational — 像是一位懂行的朋友在跟你聊天
- For bilingual mode: interleave English and Chinese paragraph by paragraph.
  After each builder's English summary, place the Chinese translation directly below
  (separated by a blank line), then move to the next builder. Same for podcasts.
  Do NOT output all English first then all Chinese.
- Never use em-dashes
```

- [ ] **Step 2.2: Commit**

```bash
git add electron/prompts/briefing
git commit -m "chore(briefing): add built-in digest prompts"
```

---

## Task 3: Main-process briefing IPC handler

**Files:**
- Create: `electron/ipc/briefing.ts`

- [ ] **Step 3.1: Write `electron/ipc/briefing.ts`**

```typescript
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
      const sources = frontmatter.sources ? JSON.parse(String(frontmatter.sources)) as BriefingSource[] : []
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
      messages: [{ role: 'user', content: userContent }],
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
```

- [ ] **Step 3.2: Register the handler in `electron/ipc/index.ts`**

```typescript
import { registerBriefingIpc } from './briefing'

export function registerAllIpc(cfg: AppConfig, getMainWindow: () => BrowserWindow | null) {
  registerConfigIpc()
  registerFilesIpc(cfg)
  registerStateIpc()
  registerLlmIpc(cfg, getMainWindow)
  registerSessionsIpc()
  registerBriefingIpc(cfg)
}
```

- [ ] **Step 3.3: Type-check**

```bash
npx tsc --noEmit -p tsconfig.node.json
```
Expected: no errors.

- [ ] **Step 3.4: Commit**

```bash
git add electron/ipc/briefing.ts electron/ipc/index.ts
git commit -m "feat(briefing): add main-process feed fetch, LLM generation and file cache"
```

---

## Task 4: Wire preload and renderer IPC facade

**Files:**
- Modify: `electron/preload.ts:74-90`
- Modify: `src/lib/ipc.ts:48-58`

- [ ] **Step 4.1: Expose `briefingGenerate` in preload**

Add to the `api` object after `onSetupDone`:

```typescript
briefingGenerate: (args) => ipcRenderer.invoke('briefing:generate', args),
```

- [ ] **Step 4.2: Add facade getter in `src/lib/ipc.ts`**

```typescript
get briefingGenerate() { return ensure().briefingGenerate },
```

- [ ] **Step 4.3: Type-check**

```bash
npx tsc --noEmit
npx tsc --noEmit -p tsconfig.node.json
```

- [ ] **Step 4.4: Commit**

```bash
git add electron/preload.ts src/lib/ipc.ts
git commit -m "feat(ipc): wire briefingGenerate through preload and facade"
```

---

## Task 5: Store additions for briefing

**Files:**
- Modify: `src/store/index.ts:12`, `src/store/index.ts:70-74`, `src/store/index.ts:78-79`, `src/store/index.ts:155`, `src/store/index.ts:178-195`, `src/store/index.ts:197`

- [ ] **Step 5.1: Extend `Page` and painting types**

```typescript
type Page = 'cover' | 'home' | 'study' | 'profile' | 'extension' | 'settings' | 'briefing'
```

Add `briefing: null` to `currentPaintings` shape:

```typescript
currentPaintings: {
  cover: Painting | null
  home: Painting | null
  study: Painting | null
  briefing: Painting | null
}
```

Update `swapPainting` signature:

```typescript
swapPainting: (surface: 'cover' | 'home' | 'study' | 'briefing') => void
```

- [ ] **Step 5.2: Add briefing state and action to `AppStore`**

Insert into `AppStore` after `pendingArchives`:

```typescript
briefing: {
  result: BriefingResult | null
  loading: boolean
  error: string | null
}
generateBriefing: (date: string) => Promise<void>
```

Import `BriefingResult` in the type import from `@shared/index`.

- [ ] **Step 5.3: Add defaults and implementations in the store object**

Defaults:

```typescript
currentPaintings: { cover: null, home: null, study: null, briefing: null },
briefing: { result: null, loading: false, error: null },
```

Update `initPaintings`:

```typescript
initPaintings: () => {
  set({
    currentPaintings: {
      cover: pickRandom(manifest, null),
      home: pickRandom(manifest, null),
      study: pickRandom(manifest, null),
      briefing: pickRandom(manifest, null),
    }
  })
},
```

Add `generateBriefing` action after `clearArchiveResult`:

```typescript
generateBriefing: async (date: string) => {
  set(s => ({ briefing: { ...s.briefing, loading: true, error: null } }))
  try {
    const result = await ipc.briefingGenerate({ date })
    set({ briefing: { result, loading: false, error: null } })
  } catch (err: any) {
    set({ briefing: { result: null, loading: false, error: err.message || String(err) } })
  }
},
```

- [ ] **Step 5.4: Type-check**

```bash
npx tsc --noEmit
```

- [ ] **Step 5.5: Commit**

```bash
git add src/store/index.ts
git commit -m "feat(store): add briefing page, painting surface and generate action"
```

---

## Task 6: Allow briefing surface on background components

**Files:**
- Modify: `src/components/SurfaceBackground.tsx:5`
- Modify: `src/components/SwapPaintingButton.tsx:4`

- [ ] **Step 6.1: Update surface unions**

```typescript
// SurfaceBackground.tsx
interface Props {
  surface: 'cover' | 'home' | 'study' | 'briefing'
}

// SwapPaintingButton.tsx
interface Props {
  surface: 'cover' | 'home' | 'study' | 'briefing'
  className?: string
}
```

- [ ] **Step 6.2: Commit**

```bash
git add src/components/SurfaceBackground.tsx src/components/SwapPaintingButton.tsx
git commit -m "feat(ui): allow briefing surface on background and swap button"
```

---

## Task 7: Shared BackToCover button and Cover entry

**Files:**
- Create: `src/components/BackToCover.tsx`
- Modify: `src/pages/Cover.tsx:30-47`

- [ ] **Step 7.1: Create `BackToCover.tsx`**

```typescript
import { useStore } from '@/store'

interface Props {
  className?: string
}

export function BackToCover({ className = '' }: Props) {
  const goto = useStore(s => s.goto)
  return (
    <button
      onClick={() => goto('cover')}
      aria-label="返回封面"
      className={`text-2xl leading-none text-parchment/70 hover:text-parchment transition-colors px-2 py-1 ${className}`}
    >
      ←
    </button>
  )
}
```

- [ ] **Step 7.2: Add "夜航简报" button to `Cover.tsx`**

Inside the `profile.name` branch, below the existing `Button`:

```tsx
<Button
  variant="ghost"
  onClick={() => goto('briefing')}
  className="border border-slate text-slate hover:text-parchment hover:border-parchment"
>
  夜航简报
</Button>
```

- [ ] **Step 7.3: Type-check**

```bash
npx tsc --noEmit
```

- [ ] **Step 7.4: Commit**

```bash
git add src/components/BackToCover.tsx src/pages/Cover.tsx
git commit -m "feat(cover): add BackToCover component and 夜航简报 entry"
```

---

## Task 8: Home page back arrow

**Files:**
- Modify: `src/pages/Home.tsx:1-40`

- [ ] **Step 8.1: Import and place `BackToCover`**

```typescript
import { BackToCover } from '@/components/BackToCover'
```

Add as the first element inside the root `<div>`:

```tsx
<BackToCover className="absolute top-4 left-4 z-10" />
```

- [ ] **Step 8.2: Commit**

```bash
git add src/pages/Home.tsx
git commit -m "feat(home): add back-to-cover arrow"
```

---

## Task 9: Date formatter and markdown parser

**Files:**
- Create: `src/lib/format-briefing-date.ts`
- Create: `src/lib/parse-briefing-markdown.ts`

- [ ] **Step 9.1: Create date helper**

```typescript
export function formatBriefingDate(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}
```

- [ ] **Step 9.2: Create parser**

```typescript
export type BriefingSection = {
  title: string
  body: string
}

export type BriefingSourceGroup = {
  title: string
  items: string[]
}

export type ParsedBriefing = {
  sections: BriefingSection[]
  sources: BriefingSourceGroup[]
}

export function parseBriefingMarkdown(raw: string): ParsedBriefing {
  const lines = raw.split('\n')
  const sections: BriefingSection[] = []
  const sources: BriefingSourceGroup[] = []

  let current: { kind: 'section' | 'source'; title: string; buffer: string[]; subTitle?: string } | null = null

  function flush() {
    if (!current) return
    const body = current.buffer.join('\n').trim()
    if (current.kind === 'section') {
      sections.push({ title: current.title, body })
    } else if (current.subTitle) {
      sources.push({ title: current.subTitle, items: body ? body.split('\n').map(s => s.trim()).filter(Boolean) : [] })
    }
    current = null
  }

  for (let line of lines) {
    const sectionMatch = line.match(/^##\s+(.*)/)
    const sourceMatch = line.match(/^###\s+(.*)/)

    if (sectionMatch) {
      flush()
      const title = sectionMatch[1].trim()
      if (title.includes('原始来源') || title.toLowerCase().includes('sources')) {
        current = { kind: 'source', title, buffer: [] }
      } else {
        current = { kind: 'section', title, buffer: [] }
      }
      continue
    }

    if (sourceMatch && current?.kind === 'source') {
      flush()
      current = { kind: 'source', title: current.title, subTitle: sourceMatch[1].trim(), buffer: [] }
      continue
    }

    if (current) {
      current.buffer.push(line)
    }
  }
  flush()

  return { sections, sources }
}
```

- [ ] **Step 9.3: Add parser tests**

Create `tests/briefing-parser.test.ts`:

```typescript
import { describe, expect, it } from 'vitest'
import { parseBriefingMarkdown } from '@/lib/parse-briefing-markdown'

describe('parseBriefingMarkdown', () => {
  it('splits H2 sections', () => {
    const raw = `## 今日航标\nEval-driven dev is default.\n\n## Builder 动态\n@karpathy: data quality beats quantity.`
    const { sections, sources } = parseBriefingMarkdown(raw)
    expect(sections).toHaveLength(2)
    expect(sections[0].title).toBe('今日航标')
    expect(sections[1].title).toBe('Builder 动态')
    expect(sources).toHaveLength(0)
  })

  it('collects sources under 原始来源', () => {
    const raw = `## 原始来源\n### @karpathy\n- tweet a\n- tweet b\n### Latent Space\n- episode 1`
    const { sections, sources } = parseBriefingMarkdown(raw)
    expect(sections).toHaveLength(0)
    expect(sources).toHaveLength(2)
    expect(sources[0].title).toBe('@karpathy')
    expect(sources[0].items).toEqual(['- tweet a', '- tweet b'])
  })
})
```

- [ ] **Step 9.4: Run parser tests**

```bash
npx vitest run tests/briefing-parser.test.ts
```
Expected: PASS.

- [ ] **Step 9.5: Commit**

```bash
git add src/lib/format-briefing-date.ts src/lib/parse-briefing-markdown.ts tests/briefing-parser.test.ts
git commit -m "feat(briefing): add date formatter and markdown parser with tests"
```

---

## Task 10: Briefing page UI

**Files:**
- Create: `src/components/BriefingSkeleton.tsx`
- Create: `src/pages/Briefing.tsx`

- [ ] **Step 10.1: Create skeleton component**

```typescript
export function BriefingSkeleton() {
  return (
    <div className="space-y-4 animate-pulse">
      <div className="h-6 bg-parchment/10 rounded w-1/3" />
      <div className="h-24 bg-parchment/5 rounded border border-parchment/10" />
      <div className="h-16 bg-parchment/5 rounded border border-parchment/10" />
      <div className="h-16 bg-parchment/5 rounded border border-parchment/10" />
    </div>
  )
}
```

- [ ] **Step 10.2: Create `Briefing.tsx`**

```typescript
import { useEffect, useState } from 'react'
import { useStore } from '@/store'
import { SurfaceBackground } from '@/components/SurfaceBackground'
import { SwapPaintingButton } from '@/components/SwapPaintingButton'
import { BackToCover } from '@/components/BackToCover'
import { BriefingSkeleton } from '@/components/BriefingSkeleton'
import { Button } from '@/components/Button'
import { formatBriefingDate } from '@/lib/format-briefing-date'
import { parseBriefingMarkdown } from '@/lib/parse-briefing-markdown'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

function formatDisplayDate(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number)
  return `${y} 年 ${m} 月 ${d} 日`
}

export function Briefing() {
  const goto = useStore(s => s.goto)
  const { result, loading, error } = useStore(s => s.briefing)
  const generateBriefing = useStore(s => s.generateBriefing)
  const [showSources, setShowSources] = useState(false)

  const today = formatBriefingDate(new Date())

  useEffect(() => {
    if (!result && !loading && !error) {
      generateBriefing(today)
    }
  }, [result, loading, error, today, generateBriefing])

  const parsed = result ? parseBriefingMarkdown(result.content) : null

  return (
    <div className="relative h-full flex flex-col overflow-hidden">
      <SurfaceBackground surface="briefing" />

      <header className="relative z-[5] flex items-center justify-between px-8 py-4 bg-ink/70 backdrop-blur-md border-b border-slate/40">
        <BackToCover />
        <div className="text-center">
          <h1 className="text-xl font-serif">夜航简报</h1>
          {result && (
            <div className="text-xs text-parchment/50 font-sans">
              {formatDisplayDate(result.date)} · AI 行业日报
            </div>
          )}
        </div>
        <SwapPaintingButton surface="briefing" />
      </header>

      <main className="relative z-[5] flex-1 overflow-y-auto px-6 py-6 max-w-3xl w-full mx-auto">
        {loading && <BriefingSkeleton />}

        {error && (
          <div className="bg-wine/20 border border-wine rounded-md p-6 text-center space-y-4">
            <p className="text-parchment/80 font-sans">
              {error === 'FEED_EMPTY' ? '今日海面平静，暂无新信号。' : `简报生成失败：${error}`}
            </p>
            <Button onClick={() => generateBriefing(today)}>重试</Button>
          </div>
        )}

        {parsed && (
          <div className="space-y-6">
            <div className="timeline relative pl-5">
              <div className="absolute left-[5px] top-1 bottom-1 w-px bg-parchment/15" />
              {parsed.sections.map((section, i) => (
                <div key={i} className="relative mb-6">
                  <div className="absolute -left-[15px] top-1.5 w-2 h-2 rounded-full bg-ember" />
                  <h2 className="text-sm font-bold text-ember mb-2 font-sans">{section.title}</h2>
                  <div className="bg-ink/60 backdrop-blur-sm border border-slate/30 rounded-md p-4 text-sm leading-relaxed text-parchment/85">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>{section.body}</ReactMarkdown>
                  </div>
                </div>
              ))}
            </div>

            {parsed.sources.length > 0 && (
              <div className="border-t border-slate/30 pt-4">
                <button
                  onClick={() => setShowSources(s => !s)}
                  className="w-full text-left text-xs text-slate hover:text-parchment transition-colors flex items-center justify-between py-2"
                >
                  <span>▼ 原始来源</span>
                  <span>{showSources ? '收起' : '展开'}</span>
                </button>
                {showSources && (
                  <div className="mt-2 space-y-3 bg-ink/60 backdrop-blur-sm border border-slate/30 rounded-md p-4">
                    {parsed.sources.map((group, i) => (
                      <div key={i}>
                        <h3 className="text-xs font-bold text-parchment/70 mb-1">{group.title}</h3>
                        <ul className="text-xs text-parchment/50 space-y-1">
                          {group.items.map((item, j) => (
                            <li key={j}>
                              <ReactMarkdown remarkPlugins={[remarkGfm]}>{item}</ReactMarkdown>
                            </li>
                          ))}
                        </ul>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  )
}
```

- [ ] **Step 10.3: Add global CSS for react-markdown links inside briefing**

Add to `src/index.css` (or create the rule if the file exists):

```css
.timeline a {
  color: #6b8fa8;
  text-decoration: underline;
}
.timeline a:hover {
  color: #e8d5b7;
}
```

- [ ] **Step 10.4: Type-check**

```bash
npx tsc --noEmit
```

- [ ] **Step 10.5: Commit**

```bash
git add src/components/BriefingSkeleton.tsx src/pages/Briefing.tsx src/index.css
git commit -m "feat(briefing): add timeline layout page and skeleton"
```

---

## Task 11: Render Briefing in App

**Files:**
- Modify: `src/App.tsx:6`, `src/App.tsx:162-169`

- [ ] **Step 11.1: Import and render**

```typescript
import { Briefing } from '@/pages/Briefing'
```

Add inside the page switch block:

```tsx
{page === 'briefing' && <Briefing />}
```

- [ ] **Step 11.2: Commit**

```bash
git add src/App.tsx
git commit -m "feat(app): render briefing page"
```

---

## Task 12: Integration tests

**Files:**
- Create: `tests/briefing.test.ts`

- [ ] **Step 12.1: Write IPC and cache tests**

```typescript
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { registerBriefingIpc } from '@electron/ipc/briefing'
import * as kimi from '@electron/lib/kimi'

const cfg = { apiKey: 'k', baseUrl: 'https://x', model: 'kimi-k2.6', libraryPath: '' }

describe('registerBriefingIpc', () => {
  let tmpDir: string
  let ipcHandlers: Record<string, Function> = {}

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'briefing-test-'))
    cfg.libraryPath = tmpDir
    ipcHandlers = {}
    vi.stubGlobal('ipcMain', {
      handle: (channel: string, fn: Function) => { ipcHandlers[channel] = fn }
    })
    registerBriefingIpc(cfg)
  })

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true })
    vi.unstubAllGlobals()
  })

  it('returns cached file on second call for same date', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      json: async () => ({ x: [{ name: 'A', handle: 'a', tweets: [{ text: 't', url: 'u', createdAt: 'd' }] }], podcasts: [], blogs: [] })
    })) as any)
    vi.spyOn(kimi, 'chatNonStream').mockResolvedValue('## 今日航标\nHello')

    const first = await ipcHandlers['briefing:generate'](null, { date: '2026-06-21' })
    expect(first.cached).toBe(false)

    const second = await ipcHandlers['briefing:generate'](null, { date: '2026-06-21' })
    expect(second.cached).toBe(true)
    expect(second.content).toBe(first.content)
  })

  it('throws FEED_EMPTY when all feeds are empty', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ x: [], podcasts: [], blogs: [] }) })) as any)
    await expect(ipcHandlers['briefing:generate'](null, { date: '2026-06-21' })).rejects.toThrow('FEED_EMPTY')
  })

  it('rejects invalid date', async () => {
    await expect(ipcHandlers['briefing:generate'](null, { date: 'not-a-date' })).rejects.toThrow('Invalid')
  })
})
```

- [ ] **Step 12.2: Run tests**

```bash
npx vitest run tests/briefing.test.ts tests/briefing-parser.test.ts tests/briefing-prompts.test.ts
```

The briefing-prompts test should be created in Task 13.

- [ ] **Step 12.3: Commit**

```bash
git add tests/briefing.test.ts
git commit -m "test(briefing): add IPC cache and feed-empty tests"
```

---

## Task 13: Prompt file presence test

**Files:**
- Create: `tests/briefing-prompts.test.ts`

- [ ] **Step 13.1: Write test**

```typescript
import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

const PROMPT_DIR = path.resolve(__dirname, '../electron/prompts/briefing')
const files = ['digest-intro.md', 'summarize-tweets.md', 'summarize-podcast.md', 'summarize-blogs.md', 'translate.md']

describe('briefing prompts', () => {
  for (const f of files) {
    it(`includes ${f}`, () => {
      const p = path.join(PROMPT_DIR, f)
      expect(fs.existsSync(p)).toBe(true)
      const text = fs.readFileSync(p, 'utf8')
      expect(text.length).toBeGreaterThan(50)
    })
  }

  it('translate.md mentions bilingual mode', () => {
    const text = fs.readFileSync(path.join(PROMPT_DIR, 'translate.md'), 'utf8')
    expect(text).toContain('bilingual')
  })
})
```

- [ ] **Step 13.2: Run**

```bash
npx vitest run tests/briefing-prompts.test.ts
```

- [ ] **Step 13.3: Commit**

```bash
git add tests/briefing-prompts.test.ts
git commit -m "test(briefing): verify built-in prompt files"
```

---

## Task 14: Full validation

- [ ] **Step 14.1: Run all tests**

```bash
npm run test
```
Expected: all tests pass.

- [ ] **Step 14.2: Run production build**

```bash
npm run build
```
Expected: build succeeds with no TS errors.

- [ ] **Step 14.3: Manual smoke checklist**

```bash
npm run dev
```

1. On Cover, click **夜航简报** → should navigate to Briefing page with oil-painting background.
2. Briefing page shows loading skeleton, then timeline content.
3. Click **原始来源** → source panel expands with URLs.
4. Click **←** → returns to Cover.
5. From Home, click **←** → returns to Cover.
6. Re-enter Briefing same day → content loads instantly from cache (no skeleton delay).
7. Check library root contains `夜航简报-YYYY-MM-DD.md`.

- [ ] **Step 14.4: Commit final fixes if any**

```bash
git add -A
git commit -m "feat(briefing): finish integration and validation"
```

---

## Self-review

### Spec coverage

| Spec section | Task |
|--------------|------|
| 1.1 goal | Task 10, 11 |
| 1.2 scope (Cover entry, briefing page, auto-generate, cache, sources, save, back arrows) | Tasks 7, 8, 10, 11, 3 |
| 3.1 Cover entry | Task 7 |
| 3.2 Briefing page (timeline layout + oil-painting background) | Tasks 6, 10 |
| 3.3 Home back arrow | Task 8 |
| 4. data flow / IPC | Tasks 3, 4 |
| 5. IPC API design | Task 1 |
| 6. file save rules + frontmatter | Tasks 1, 3 |
| 7. prompts | Task 2 |
| 8. state management | Task 5 |
| 9. error handling | Tasks 3, 10 |
| 10. component list | Tasks 6, 7, 8, 10 |
| 11. tests | Tasks 9, 12, 13 |

### Placeholder scan

- No `TBD`, `TODO`, or "implement later" strings.
- All test files include real assertions and sample data.
- All IPC handlers, components, and utility functions include concrete code.
- Prompt files contain the exact skill content.

### Type consistency

- `DocType` extended in one place and consumed by `frontmatter.ts`.
- `surface` union is identical across `SurfaceBackground`, `SwapPaintingButton`, and store.
- `briefingGenerate` signature matches in `IpcApi`, preload, facade, and main handler.
- `BriefingResult` shape matches cache read and write paths.

### Known gaps intentionally out of scope

- Background pre-generation at boot (spec 13 follow-up).
- Manual refresh / force regenerate in UI (`force: true` exists in IPC only).
- Background job scheduling.

---

**Plan complete and saved to `docs/superpowers/plans/2026-06-21-night-briefing.md`.**

Two execution options:

1. **Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration.
2. **Inline Execution** — Execute tasks in this session using `executing-plans`, batch execution with checkpoints.

Which approach would you like?
