# 夜航简报 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refactor the single-call Night Briefing generator into a profile-aware two-stage LLM pipeline, save results under `STUDY_LIBRARY_PATH/夜航简报/`, and add a history drawer for reading past briefings.

**Architecture:** The main-process IPC handler orchestrates two `chatNonStream` calls — call 1 extracts structured summaries from feeds using the user's `profile_text`, call 2 assembles the bilingual Markdown digest. The renderer store passes `profile` to generation and exposes a `briefingList` action; a new drawer component lists cached dates.

**Tech Stack:** Electron 30, React 18 + TypeScript + Tailwind CSS + Zustand, Vitest, gray-matter.

---

## File Structure

| File | Action | Responsibility |
|------|--------|----------------|
| `electron/prompts/briefing/profile-context.md` | Create | Injects `profile_text` and tells the LLM to tailor relevance judgments |
| `src/types/index.ts` | Modify | Adds `profile` to `briefingGenerate` and adds `briefingList` to `IpcApi` |
| `electron/preload.ts` | Modify | Exposes `briefingList` to the renderer |
| `electron/ipc/briefing.ts` | Modify | Two-call pipeline, profile injection, `夜航简报/` directory, `briefing:list` handler, recovery dump on write failure |
| `src/store/index.ts` | Modify | Passes `profile` to `briefingGenerate`, adds `briefingHistory` state and `loadBriefingHistory` action |
| `src/components/BriefingHistoryDrawer.tsx` | Create | Right-side drawer that lists cached briefing dates |
| `src/pages/Briefing.tsx` | Modify | Adds "往期" button, integrates drawer, loads history on open |
| `tests/briefing.test.ts` | Modify | Covers two-call pipeline, thinking config, profile injection, directory path, `briefing:list` |
| `tests/briefing-prompts.test.ts` | Modify | Verifies `profile-context.md` exists and contains `{{profile_text}}` |

---

## Task 1: Create `profile-context.md`

**Files:**
- Create: `electron/prompts/briefing/profile-context.md`
- Test: `tests/briefing-prompts.test.ts`

- [ ] **Step 1: Write the prompt file**

```markdown
# Reader Profile Context

The following is the reader's background and interests. Use it to judge which builders, podcast episodes, and blog posts are most relevant to them. When a feed item connects to their background, explicitly explain the connection in the summary.

{{profile_text}}

If the profile is empty, treat the reader as a general AI practitioner and do not assume specialized knowledge.
```

- [ ] **Step 2: Add the new file to the prompt checklist test**

In `tests/briefing-prompts.test.ts`, change the `files` array to include `profile-context.md` and add a placeholder test.

```typescript
const files = [
  'profile-context.md',
  'digest-intro.md',
  'summarize-tweets.md',
  'summarize-podcast.md',
  'summarize-blogs.md',
  'translate.md',
]

it('profile-context.md contains the profile placeholder', () => {
  const text = fs.readFileSync(path.join(PROMPT_DIR, 'profile-context.md'), 'utf8')
  expect(text).toContain('{{profile_text}}')
})
```

- [ ] **Step 3: Run the prompt tests**

Run: `npx vitest run tests/briefing-prompts.test.ts`

Expected: PASS for all existing prompts; the new placeholder test should also pass.

- [ ] **Step 4: Commit**

```bash
git add electron/prompts/briefing/profile-context.md tests/briefing-prompts.test.ts
git commit -m "feat(briefing): add profile-context prompt and test"
```

---

## Task 2: Update `src/types/index.ts`

**Files:**
- Modify: `src/types/index.ts:183`

- [ ] **Step 1: Update `IpcApi.briefingGenerate` and add `briefingList`**

Replace the existing `briefingGenerate` line with these two entries:

```typescript
briefingGenerate: (args: { date: string; profile: Profile; force?: boolean }) => Promise<BriefingResult>
briefingList: () => Promise<{ date: string; filePath: string }[]>
```

- [ ] **Step 2: Verify `Profile` is already imported**

`Profile` is defined on lines 8-12 of the same file, so no extra import is needed.

- [ ] **Step 3: Run type check**

Run: `npx tsc --noEmit`

Expected: no new type errors from this change.

- [ ] **Step 4: Commit**

```bash
git add src/types/index.ts
git commit -m "feat(types): add profile and briefingList to IPC API"
```

---

## Task 3: Update `electron/preload.ts`

**Files:**
- Modify: `electron/preload.ts:75`

- [ ] **Step 1: Add `briefingList` next to `briefingGenerate`**

Change the existing `briefingGenerate` entry to:

```typescript
briefingGenerate: (args) => ipcRenderer.invoke('briefing:generate', args),
briefingList: () => ipcRenderer.invoke('briefing:list'),
```

- [ ] **Step 2: Run type check**

Run: `npx tsc --noEmit`

Expected: no new type errors.

- [ ] **Step 3: Commit**

```bash
git add electron/preload.ts
git commit -m "feat(preload): expose briefingList IPC"
```

---

## Task 4: Refactor `electron/ipc/briefing.ts` to the Two-Call Pipeline

**Files:**
- Modify: `electron/ipc/briefing.ts` (full replacement)
- Test: `tests/briefing.test.ts`

- [ ] **Step 1: Replace the IPC handler with the pipeline implementation**

```typescript
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
```

- [ ] **Step 2: Update `tests/briefing.test.ts`**

Replace the file with:

```typescript
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { ipcMain } from 'electron'
import { registerBriefingIpc } from '@electron/ipc/briefing'
import * as kimi from '@electron/lib/kimi'
import type { AppConfig } from '@electron/env'
import type { Profile } from '@shared/index'

vi.mock('electron', () => ({
  ipcMain: { handle: vi.fn() }
}))

const profile: Profile = {
  name: 'Tester',
  profile_text: 'I follow LLM infrastructure and agent tooling.',
  preferred_topics: [],
}

describe('registerBriefingIpc', () => {
  let tmpDir: string
  let cfg: AppConfig
  let ipcHandlers: Record<string, Function> = {}

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'briefing-test-'))
    cfg = { apiKey: 'k', baseUrl: 'https://x', model: 'kimi-k2.6', libraryPath: tmpDir }
    ipcHandlers = {}
    vi.clearAllMocks()
    ;(ipcMain.handle as ReturnType<typeof vi.fn>).mockImplementation((channel: string, fn: Function) => {
      ipcHandlers[channel] = fn
    })
    registerBriefingIpc(cfg)
  })

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true })
    vi.unstubAllGlobals()
  })

  it('uses two LLM calls with max-effort thinking and injects profile text', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      json: async () => ({
        x: [{ name: 'A', handle: 'a', tweets: [{ text: 't', url: 'u', createdAt: 'd' }] }],
        podcasts: [],
        blogs: [],
      })
    })) as any)

    const structured = JSON.stringify({
      builders: [{ name: 'A', role: 'CEO', handle: 'a', summary: 's', key_url: 'u' }],
      podcasts: [],
      blogs: [],
    })

    vi.spyOn(kimi, 'chatNonStream')
      .mockResolvedValueOnce(structured)
      .mockResolvedValueOnce('## X / Twitter\nSummary text')

    const first = await ipcHandlers['briefing:generate'](null, { date: '2026-06-21', profile })

    expect(first.cached).toBe(false)
    expect(first.filePath).toContain(`${path.sep}夜航简报${path.sep}`)
    expect(kimi.chatNonStream).toHaveBeenCalledTimes(2)

    const firstCall = (kimi.chatNonStream as any).mock.calls[0][1]
    expect(firstCall.thinking).toEqual({ type: 'enabled', reasoning_effort: 'max' })
    expect(firstCall.messages[0].content).toContain('I follow LLM infrastructure')

    const secondCall = (kimi.chatNonStream as any).mock.calls[1][1]
    expect(secondCall.thinking).toEqual({ type: 'enabled', reasoning_effort: 'max' })
    expect(secondCall.messages[0].content).toContain(structured)

    const second = await ipcHandlers['briefing:generate'](null, { date: '2026-06-21', profile })
    expect(second.cached).toBe(true)
    expect(second.content.trim()).toBe(first.content.trim())
    expect(second.sources).toEqual(first.sources)
  })

  it('throws FEED_EMPTY when all feeds are empty', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ x: [], podcasts: [], blogs: [] }) })) as any)
    await expect(ipcHandlers['briefing:generate'](null, { date: '2026-06-21', profile })).rejects.toThrow('FEED_EMPTY')
  })

  it('rejects invalid date', async () => {
    await expect(ipcHandlers['briefing:generate'](null, { date: 'not-a-date', profile })).rejects.toThrow('Invalid')
  })

  it('lists cached briefing dates', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      json: async () => ({
        x: [{ name: 'A', handle: 'a', tweets: [{ text: 't', url: 'u', createdAt: 'd' }] }],
        podcasts: [],
        blogs: [],
      })
    })) as any)

    vi.spyOn(kimi, 'chatNonStream')
      .mockResolvedValueOnce(JSON.stringify({ builders: [], podcasts: [], blogs: [] }))
      .mockResolvedValueOnce('content')

    await ipcHandlers['briefing:generate'](null, { date: '2026-06-22', profile })

    const list = await ipcHandlers['briefing:list'](null)
    expect(list).toHaveLength(1)
    expect(list[0].date).toBe('2026-06-22')
    expect(list[0].filePath).toContain(`${path.sep}夜航简报${path.sep}`)
  })
})
```

- [ ] **Step 3: Run the briefing tests**

Run: `npx vitest run tests/briefing.test.ts`

Expected: all tests pass.

- [ ] **Step 4: Commit**

```bash
git add electron/ipc/briefing.ts tests/briefing.test.ts
git commit -m "feat(briefing): two-call pipeline, profile injection, briefingList IPC"
```

---

## Task 5: Update `src/store/index.ts`

**Files:**
- Modify: `src/store/index.ts:72-79`, `src/store/index.ts:173`, `src/store/index.ts:295-305`

- [ ] **Step 1: Add `briefingHistory` to the store type**

In the `AppStore` type, replace the briefing state block with:

```typescript
// 简报
briefing: {
  result: BriefingResult | null
  loading: boolean
  error: string | null
}
briefingHistory: {
  list: { date: string; filePath: string }[]
  loading: boolean
  error: string | null
}
generateBriefing: (date: string) => Promise<void>
loadBriefingHistory: () => Promise<void>
```

- [ ] **Step 2: Add the initial state and actions**

Replace the initial `briefing` state and `generateBriefing` implementation with:

```typescript
briefing: { result: null, loading: false, error: null },
briefingHistory: { list: [], loading: false, error: null },

generateBriefing: async (date: string) => {
  const s = get()
  if (s.briefing.loading) return
  set({ briefing: { result: null, loading: true, error: null } })
  try {
    const result = await ipc.briefingGenerate({ date, profile: s.profile })
    set({ briefing: { result, loading: false, error: null } })
  } catch (err: any) {
    set({ briefing: { result: null, loading: false, error: err.message || String(err) } })
  }
},

loadBriefingHistory: async () => {
  set({ briefingHistory: { ...get().briefingHistory, loading: true, error: null } })
  try {
    const list = await ipc.briefingList()
    set({ briefingHistory: { list, loading: false, error: null } })
  } catch (err: any) {
    set({ briefingHistory: { ...get().briefingHistory, loading: false, error: err.message || String(err) } })
  }
},
```

- [ ] **Step 3: Run type check**

Run: `npx tsc --noEmit`

Expected: no type errors.

- [ ] **Step 4: Commit**

```bash
git add src/store/index.ts
git commit -m "feat(store): pass profile to briefingGenerate and add history loader"
```

---

## Task 6: Create `BriefingHistoryDrawer.tsx`

**Files:**
- Create: `src/components/BriefingHistoryDrawer.tsx`

- [ ] **Step 1: Write the drawer component**

```tsx
import { useEffect } from 'react'

export type BriefingHistoryItem = {
  date: string
  filePath: string
}

type Props = {
  open: boolean
  onClose: () => void
  currentDate?: string
  history: BriefingHistoryItem[]
  loading: boolean
  onSelect: (date: string) => void
}

function formatDrawerDate(date: string): string {
  return date.slice(5)
}

export function BriefingHistoryDrawer({ open, onClose, currentDate, history, loading, onSelect }: Props) {
  useEffect(() => {
    if (open) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }
    return () => {
      document.body.style.overflow = ''
    }
  }, [open])

  if (!open) return null

  return (
    <>
      <div
        className="fixed inset-0 bg-black/40 z-40"
        onClick={onClose}
        aria-hidden="true"
      />
      <div className="fixed right-0 top-0 h-full w-60 bg-ink/95 border-l border-slate/40 z-50 p-4 flex flex-col shadow-2xl">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-bold text-parchment">往期简报</h2>
          <button
            onClick={onClose}
            className="text-slate hover:text-parchment transition-colors"
            aria-label="关闭"
          >
            ✕
          </button>
        </div>

        {loading && (
          <div className="text-xs text-slate py-2">加载中...</div>
        )}

        <div className="flex-1 overflow-y-auto space-y-1">
          {history.map(item => {
            const isCurrent = item.date === currentDate
            return (
              <button
                key={item.date}
                onClick={() => {
                  onSelect(item.date)
                  onClose()
                }}
                className={`w-full text-left px-3 py-2 rounded text-sm transition-colors ${
                  isCurrent
                    ? 'bg-ember/20 text-ember border border-ember/40'
                    : 'text-parchment/70 hover:bg-slate/20 hover:text-parchment'
                }`}
              >
                {formatDrawerDate(item.date)}
              </button>
            )
          })}

          {!loading && history.length === 0 && (
            <div className="text-xs text-slate py-2">暂无往期简报</div>
          )}
        </div>
      </div>
    </>
  )
}
```

- [ ] **Step 2: Run type check**

Run: `npx tsc --noEmit`

Expected: no type errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/BriefingHistoryDrawer.tsx
git commit -m "feat(briefing): add history drawer component"
```

---

## Task 7: Update `src/pages/Briefing.tsx`

**Files:**
- Modify: `src/pages/Briefing.tsx`

- [ ] **Step 1: Import the drawer and add drawer state**

Add the import:

```tsx
import { BriefingHistoryDrawer } from '@/components/BriefingHistoryDrawer'
```

Inside the component, add:

```tsx
const { result, loading, error } = useStore(s => s.briefing)
const generateBriefing = useStore(s => s.generateBriefing)
const { list: historyList, loading: historyLoading } = useStore(s => s.briefingHistory)
const loadBriefingHistory = useStore(s => s.loadBriefingHistory)
const [drawerOpen, setDrawerOpen] = useState(false)
```

- [ ] **Step 2: Adjust the auto-generation effect**

Change the `useEffect` so it only auto-generates when there is no result at all, allowing past-date results to stay on screen:

```tsx
useEffect(() => {
  if (!result && !loading && !error) {
    generateBriefing(today)
  }
}, [result, loading, error, today, generateBriefing])
```

- [ ] **Step 3: Add the "往期" button to the header**

Replace the right side of the header with a group containing the history button and the swap-painting button:

```tsx
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
  <div className="flex items-center gap-1">
    <Button
      variant="ghost"
      onClick={() => {
        setDrawerOpen(true)
        loadBriefingHistory()
      }}
    >
      往期
    </Button>
    <SwapPaintingButton surface="briefing" />
  </div>
</header>
```

- [ ] **Step 4: Render the drawer**

Add the drawer just before the closing `</div>` of the page:

```tsx
<BriefingHistoryDrawer
  open={drawerOpen}
  onClose={() => setDrawerOpen(false)}
  currentDate={result?.date ?? today}
  history={historyList}
  loading={historyLoading}
  onSelect={(date) => generateBriefing(date)}
/>
```

- [ ] **Step 5: Run type check**

Run: `npx tsc --noEmit`

Expected: no type errors.

- [ ] **Step 6: Commit**

```bash
git add src/pages/Briefing.tsx
git commit -m "feat(briefing): integrate history drawer on briefing page"
```

---

## Task 8: Run All Tests

**Files:**
- All touched files

- [ ] **Step 1: Run the full test suite**

Run: `npm run test`

Expected: all tests pass, including updated `briefing.test.ts` and `briefing-prompts.test.ts`.

- [ ] **Step 2: Run type check**

Run: `npx tsc --noEmit`

Expected: no type errors across the renderer and main processes.

- [ ] **Step 3: Commit any remaining changes**

```bash
git add -A
git commit -m "test(briefing): verify full suite and types after drawer integration"
```

---

## Task 9: Dev Smoke Test

**Files:**
- Runtime behavior only

- [ ] **Step 1: Start the dev server**

Run: `npm run dev`

- [ ] **Step 2: Manual checks**

1. From the cover page, click **夜航简报**.
2. Confirm the page shows a loading skeleton, then the generated digest.
3. Confirm the file is saved at `STUDY_LIBRARY_PATH/夜航简报/夜航简报-YYYY-MM-DD.md`.
4. Reload the page and confirm it reads from cache (no new LLM call).
5. Click **往期**, select a cached date, and confirm the page switches to that date.
6. Click the **← 返回封面** arrow and confirm navigation back to cover.

- [ ] **Step 3: Stop dev server**

Press `Ctrl + C` in the terminal.

---

## Spec Coverage Checklist

| Spec Section | Implementation Task |
|--------------|---------------------|
| 2-call LLM pipeline with `reasoning_effort: 'max'` | Task 4 |
| Profile injection via `profile-context.md` | Task 1 + Task 4 |
| Save path `STUDY_LIBRARY_PATH/夜航简报/` | Task 4 |
| Frontmatter with `type: briefing` and JSON `sources` | Task 4 |
| `briefingList` IPC for past briefings | Task 2 + Task 3 + Task 4 |
| Drawer-based past-briefing navigation | Task 5 + Task 6 + Task 7 |
| Auto-generate on entry, cache on same day | Task 4 + Task 7 |
| Error handling: FEED_EMPTY, network, LLM, write recovery | Task 4 + Task 7 (existing UI) |
| Tests for pipeline, profile, path, list, prompts | Task 1 + Task 4 |

---

## Placeholder & Consistency Check

- No `TBD` or `TODO` items remain in the plan.
- All referenced IPC channel names (`briefing:generate`, `briefing:list`) match between `types`, `preload`, and `briefing.ts`.
- `Profile` type fields (`name`, `profile_text`, `preferred_topics`) match the existing `StateJson.profile` definition.
- The `BriefingHistoryDrawer` `onSelect` signature matches `generateBriefing(date: string)`.
