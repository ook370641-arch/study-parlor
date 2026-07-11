# 文章旁注助手 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a collapsible floating "文章旁注" assistant to Briefing and Anthropic blog articles, with auto-generated guide (background, heading summaries, terminology), Socratic Q&A, Tavily web search, and persisted conversation files.

**Architecture:** A new `articleAssistant` IPC domain generates the guide and writes/reads session files; a separate transient `assistantSession` slice in the Zustand store drives streaming chat via the existing `llm:start`/`llm:chunk`/`llm:done` events; a shared `ArticleAssistantPanel` component mounts in both `Briefing.tsx` and `AnthropicArticleReader.tsx`.

**Tech Stack:** Electron 30, React 18, TypeScript, Tailwind CSS, Zustand, electron-vite, Vitest, Playwright (E2E).

**Spec source:** `docs/superpowers/specs/2026-07-11-briefing-assistant-design.md`

**Acceptance checklist (ship with first version):**
- [ ] Empty/malformed guide JSON degrades gracefully to raw article view.
- [ ] LLM timeout/network error during chat surfaces a retryable error bubble.
- [ ] Tavily `NO_RESULTS` continues answer based on article; other search errors do the same with a notice.
- [ ] Article assistant files survive app restart and reload in the same article.
- [ ] Streaming can be cancelled mid-response.
- [ ] Theme/font-size changes do not lose assistant state.
- [ ] Packaged build includes new prompt file and component files.

---

## Task 0: Bootstrap types and constants

**Files:**
- Modify: `src/types/index.ts`
- Modify: `electron/lib/frontmatter.ts`
- Modify: `src/components/md/fileType.ts`
- Modify: `src/components/md/ReportHeader.tsx`

**Context:** Add the new `article-assistant` doc type to all type and rendering mappings before any handler or component references it.

- [ ] **Step 0.1: Add `article-assistant` to `DocType`**

```ts
// src/types/index.ts
export type DocType =
  | 'progress'
  | 'review'
  | 'fable'
  | 'transcript'
  | 'briefing'
  | 'external-materials'
  | 'anthropic-article'
  | 'article-assistant'
```

- [ ] **Step 0.2: Extend `Frontmatter` with assistant parent fields**

```ts
// src/types/index.ts
export type Frontmatter = {
  // ... existing fields ...
  parent_path?: string
  parent_type?: 'briefing' | 'anthropic-article'
}
```

- [ ] **Step 0.3: Add shared types for the guide and assistant session**

```ts
// src/types/index.ts
export type ArticleAssistantTerm = {
  term: string
  translation: string
  explanation: string
}

export type ArticleAssistantChunk = {
  heading: string
  summary: string
  terms: ArticleAssistantTerm[]
}

export type ArticleAssistantGuide = {
  background: string
  chunks: ArticleAssistantChunk[]
}

export type ArticleAssistantMessage = {
  role: 'user' | 'assistant'
  content: string
  searchSources?: { title: string; url: string; snippet: string }[]
}

export type ArticleAssistantSessionFile = {
  filePath: string
  messages: ArticleAssistantMessage[]
  createdAt: string
  updatedAt: string
}

export type ArticleAssistantErrorCode =
  | 'GUIDE_LLM_ERROR'
  | 'GUIDE_JSON_ERROR'
  | 'GUIDE_ABORT'
  | 'CHAT_LLM_ERROR'
  | 'CHAT_NETWORK_ERROR'
  | 'CHAT_TIMEOUT'
  | 'SAVE_ERROR'
```

- [ ] **Step 0.4: Add `IpcApi` methods**

```ts
// src/types/index.ts
export type IpcApi = {
  // ... existing methods ...
  articleAssistantGenerateGuide: (args: {
    articleContent: string
    articleType: 'briefing' | 'anthropic-article'
    articleTitle?: string
  }) => Promise<ArticleAssistantGuide>

  articleAssistantSendMessage: (args: {
    sessionId: string
    articleContent: string
    articleType: 'briefing' | 'anthropic-article'
    messages: ArticleAssistantMessage[]
    selection?: string
    useSearch?: boolean
  }) => Promise<void>

  articleAssistantAbort: (args: { sessionId: string }) => Promise<void>

  articleAssistantReadSession: (args: {
    parentPath: string
    parentType: 'briefing' | 'anthropic-article'
  }) => Promise<ArticleAssistantSessionFile | null>

  articleAssistantWriteSession: (args: {
    parentPath: string
    parentType: 'briefing' | 'anthropic-article'
    messages: ArticleAssistantMessage[]
  }) => Promise<{ filePath: string }>
}
```

- [ ] **Step 0.5: Register `EXT_FIELDS` for serialization**

```ts
// electron/lib/frontmatter.ts
const EXT_FIELDS: Record<DocType, string[]> = {
  // ... existing ...
  'article-assistant': ['parent_path', 'parent_type'],
}
```

- [ ] **Step 0.6: Map renderer doc type for `article-assistant`**

```ts
// src/components/md/fileType.ts
export function detectDocType(content: string, fileName: string): DocType {
  try {
    const { data } = matter(content)
    const type = data?.type
    if (type === 'progress' || type === 'review' || type === 'anthropic-article') return 'report'
    if (type === 'fable') return 'fable'
    if (type === 'article-assistant') return 'dialogue'
  } catch {}
  // ... filename fallback ...
}
```

- [ ] **Step 0.7: Add badge/label in `ReportHeader`**

```ts
// src/components/md/ReportHeader.tsx
const TYPE_LABELS: Record<DocType, string> = {
  // ... existing ...
  'article-assistant': '旁注记录',
}

const TYPE_BADGE_STYLES: Record<DocType, string> = {
  // ... existing ...
  'article-assistant': 'bg-ink/60 text-parchment/60',
}
```

- [ ] **Step 0.8: Run typecheck**

Run: `npx tsc --noEmit`
Expected: PASS (there will be new references missing, but the type additions themselves must compile).

---

## Task 1: Write the guide generation prompt

**Files:**
- Create: `electron/prompts/digest-guide.md`

**Context:** The prompt must request JSON with `background`, `chunks` (heading, summary, terms), and forbid decorative prose/markdown fences.

- [ ] **Step 1.1: Create prompt file**

```markdown
# digest-guide.md

You are a Socratic reading companion. Given an article, produce a concise reading guide in JSON.

## Output format

Return ONLY a JSON object matching this schema. Do not wrap it in markdown code blocks or add explanatory prose.

{
  "background": "1-2 sentences explaining what problem the article addresses and who it is for.",
  "chunks": [
    {
      "heading": "Exact H2 or H3 heading text from the article",
      "summary": "A short summary of the chunk. Let the LLM decide length; do not force a character count.",
      "terms": [
        {
          "term": "English or technical term",
          "translation": "Chinese translation",
          "explanation": "2-3 sentences of explanation in English"
        }
      ]
    }
  ]
}

## Constraints

- Split the article by H2/H3 headings.
- Each chunk may have 0-3 terms. Only include terms that genuinely need explanation.
- Tone: Socratic teaching companion.
- Do not output "Vol.", "AI Builders Digest", "Generated through", "档案编号", "学习卷宗", or any other decorative metadata.
- If the article has no clear headings, return a single chunk with heading "全文".
```

- [ ] **Step 1.2: Add prompt to builder files if required**

Check `electron-builder.yml` ensures `electron/prompts` is included. It already is per project rules; no change needed unless the file is missing from `files`.

---

## Task 2: Implement main-process guide generation

**Files:**
- Create: `electron/ipc/article-assistant.ts`
- Modify: `electron/ipc/index.ts`
- Modify: `electron/preload.ts`
- Modify: `src/lib/ipc.ts`

**Context:** The guide is generated with a single non-streaming LLM call and robust JSON extraction. Errors are mapped to typed codes.

- [ ] **Step 2.1: Create `electron/ipc/article-assistant.ts`**

```ts
import path from 'node:path'
import fs from 'node:fs'
import { ipcMain } from 'electron'
import type {
  AppConfig,
  ArticleAssistantGuide,
  ArticleAssistantErrorCode,
  ArticleAssistantMessage,
  ArticleAssistantSessionFile,
} from '../../src/types/index.js'
import { chatNonStream } from '../lib/llm-tasks.js'
import { extractJsonObject } from '../lib/json-extract.js'
import { parseFrontmatter, serializeFrontmatter } from '../lib/frontmatter.js'
import { dumpRecovery } from '../lib/recovery.js'

function typedError(code: ArticleAssistantErrorCode, message: string): Error {
  const err = new Error(message) as Error & { code: ArticleAssistantErrorCode }
  err.code = code
  return err
}

function resolveAssistantDir(parentPath: string, parentType: 'briefing' | 'anthropic-article', libraryPath: string): string {
  if (parentType === 'briefing') {
    return path.dirname(parentPath)
  }
  return path.dirname(parentPath)
}

function validateInsideRoot(targetDir: string, roots: string[]): void {
  const realTarget = fs.realpathSync(targetDir)
  for (const root of roots) {
    if (realTarget.startsWith(fs.realpathSync(root))) return
  }
  throw new Error(`Invalid assistant session path: ${targetDir}`)
}

export function registerArticleAssistantIpc(cfg: AppConfig) {
  ipcMain.handle(
    'articleAssistant:generateGuide',
    async (_, args: { articleContent: string; articleType: 'briefing' | 'anthropic-article'; articleTitle?: string }) => {
      const promptPath = path.join(__dirname, '..', 'prompts', 'digest-guide.md')
      const system = fs.existsSync(promptPath) ? fs.readFileSync(promptPath, 'utf8') : ''
      const user = `Article title: ${args.articleTitle ?? 'Untitled'}\n\n${args.articleContent}`

      try {
        const raw = await chatNonStream({ system, user, temperature: 0.7 })
        const parsed = extractJsonObject(raw)
        const guide = parsed as ArticleAssistantGuide
        if (!guide || typeof guide.background !== 'string' || !Array.isArray(guide.chunks)) {
          throw typedError('GUIDE_JSON_ERROR', 'Guide JSON missing required fields')
        }
        return guide
      } catch (err) {
        if ((err as Error & { code?: string })?.code === 'ABORT') {
          throw typedError('GUIDE_ABORT', 'Guide generation aborted')
        }
        if ((err as Error & { code?: ArticleAssistantErrorCode })?.code?.startsWith('GUIDE_')) throw err
        throw typedError('GUIDE_LLM_ERROR', err instanceof Error ? err.message : String(err))
      }
    }
  )

  // ... additional handlers in Task 4 and Task 5
}
```

- [ ] **Step 2.2: Register handler in `electron/ipc/index.ts`**

```ts
import { registerArticleAssistantIpc } from './article-assistant.js'

export function registerAllIpc(cfg: AppConfig, getMainWindow: () => BrowserWindow | null) {
  // ... existing registrations ...
  registerArticleAssistantIpc(cfg)
}
```

- [ ] **Step 2.3: Expose in preload**

```ts
// electron/preload.ts
const api: IpcApi = {
  // ... existing ...
  articleAssistantGenerateGuide: (a) => ipcRenderer.invoke('articleAssistant:generateGuide', a),
  articleAssistantSendMessage: (a) => ipcRenderer.invoke('articleAssistant:sendMessage', a),
  articleAssistantAbort: (a) => ipcRenderer.invoke('articleAssistant:abort', a),
  articleAssistantReadSession: (a) => ipcRenderer.invoke('articleAssistant:readSession', a),
  articleAssistantWriteSession: (a) => ipcRenderer.invoke('articleAssistant:writeSession', a),
}
```

- [ ] **Step 2.4: Add facade getters in `src/lib/ipc.ts`**

```ts
// src/lib/ipc.ts
export const ipc = {
  // ... existing ...
  get articleAssistantGenerateGuide() { return ensure().articleAssistantGenerateGuide },
  get articleAssistantSendMessage() { return ensure().articleAssistantSendMessage },
  get articleAssistantAbort() { return ensure().articleAssistantAbort },
  get articleAssistantReadSession() { return ensure().articleAssistantReadSession },
  get articleAssistantWriteSession() { return ensure().articleAssistantWriteSession },
}
```

- [ ] **Step 2.5: Run typecheck**

Run: `npx tsc --noEmit`
Expected: PASS (handlers only; streaming/save handlers not yet added).

---

## Task 3: Add file read/write handlers for assistant session

**Files:**
- Modify: `electron/ipc/article-assistant.ts`

**Context:** Sessions are stored as `assistant-session.md` beside the parent article. Body uses alternating `## 用户` / `## 助手` sections.

- [ ] **Step 3.1: Add write handler**

```ts
ipcMain.handle(
  'articleAssistant:writeSession',
  async (_, args: { parentPath: string; parentType: 'briefing' | 'anthropic-article'; messages: ArticleAssistantMessage[] }) => {
    const targetDir = resolveAssistantDir(args.parentPath, args.parentType, cfg.libraryPath)
    validateInsideRoot(targetDir, [cfg.libraryPath, path.join(os.homedir(), '.studyparlor', 'briefing-cache')])

    const filePath = path.join(targetDir, 'assistant-session.md')
    const now = new Date().toISOString()

    const bodyLines: string[] = []
    for (const m of args.messages) {
      const speaker = m.role === 'user' ? '用户' : '助手'
      bodyLines.push(`## ${speaker}`, '', m.content, '')
    }

    const fm = {
      title: '旁注记录',
      type: 'article-assistant' as const,
      created: fs.existsSync(filePath)
        ? parseFrontmatter(fs.readFileSync(filePath, 'utf8'), { filename: 'assistant-session.md' }).frontmatter.created ?? now
        : now,
      updated_at: now,
      parent_path: args.parentPath,
      parent_type: args.parentType,
      tags: [] as string[],
    }

    try {
      fs.writeFileSync(filePath, serializeFrontmatter('article-assistant', fm, bodyLines.join('\n')), 'utf8')
      return { filePath }
    } catch (err) {
      dumpRecovery(`article-assistant-${Date.now()}.md`, bodyLines.join('\n'))
      throw typedError('SAVE_ERROR', err instanceof Error ? err.message : String(err))
    }
  }
)
```

- [ ] **Step 3.2: Add read handler**

```ts
ipcMain.handle(
  'articleAssistant:readSession',
  async (_, args: { parentPath: string; parentType: 'briefing' | 'anthropic-article' }) => {
    const targetDir = resolveAssistantDir(args.parentPath, args.parentType, cfg.libraryPath)
    const filePath = path.join(targetDir, 'assistant-session.md')
    if (!fs.existsSync(filePath)) return null

    try {
      const raw = fs.readFileSync(filePath, 'utf8')
      const { frontmatter, body } = parseFrontmatter(raw, { filename: 'assistant-session.md' })
      const messages = parseAssistantSessionBody(body)
      return {
        filePath,
        messages,
        createdAt: frontmatter.created ?? frontmatter.created_at ?? new Date(0).toISOString(),
        updatedAt: frontmatter.updated_at ?? frontmatter.created ?? new Date(0).toISOString(),
      } satisfies ArticleAssistantSessionFile
    } catch (err) {
      return null
    }
  }
)
```

- [ ] **Step 3.3: Add body parser helper**

```ts
function parseAssistantSessionBody(body: string): ArticleAssistantMessage[] {
  const messages: ArticleAssistantMessage[] = []
  const sections = body.split(/^## /m).slice(1)
  for (const section of sections) {
    const [heading, ...rest] = section.split('\n')
    const content = rest.join('\n').trim()
    if (heading.startsWith('用户')) {
      messages.push({ role: 'user', content })
    } else if (heading.startsWith('助手')) {
      messages.push({ role: 'assistant', content })
    }
  }
  return messages
}
```

- [ ] **Step 3.4: Add `import os from 'node:os'` at top of `electron/ipc/article-assistant.ts`**

- [ ] **Step 3.5: Run unit tests for file round-trip**

Create: `tests/article-assistant/file-io.test.ts`

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { parseAssistantSessionBody } from '../../electron/ipc/article-assistant'

describe('parseAssistantSessionBody', () => {
  it('parses user/assistant sections', () => {
    const body = `## 用户\n\nHello\n\n## 助手\n\nHi there`
    const msgs = parseAssistantSessionBody(body)
    expect(msgs).toHaveLength(2)
    expect(msgs[0]).toEqual({ role: 'user', content: 'Hello' })
    expect(msgs[1]).toEqual({ role: 'assistant', content: 'Hi there' })
  })
})
```

Run: `npx vitest run tests/article-assistant/file-io.test.ts`
Expected: PASS.

---

## Task 4: Implement streaming chat handler

**Files:**
- Modify: `electron/ipc/article-assistant.ts`
- Create: `electron/lib/article-assistant-prompt.ts`

**Context:** `articleAssistant:sendMessage` assembles context, optionally calls Tavily, then starts an `llm:start` stream via the existing LLM IPC. The renderer owns the session id.

- [ ] **Step 4.1: Create prompt assembler**

```ts
// electron/lib/article-assistant-prompt.ts
import type { ArticleAssistantGuide, ArticleAssistantMessage } from '../../src/types/index.js'

export function buildAssistantSystemPrompt(): string {
  return `You are a Socratic teaching assistant. The user is reading an article. Answer in Chinese unless the user asks otherwise. Use short questions, analogies, and prompts that lead the user to think. Do not give long lectures.`
}

export function buildAssistantUserPrompt(args: {
  articleContent: string
  guide: ArticleAssistantGuide | null
  selection?: string
  messages: ArticleAssistantMessage[]
  searchResults?: string
}): string {
  const chunks = args.guide?.chunks ?? []
  const summaryBlock = chunks.map((c) => `## ${c.heading}\n${c.summary}`).join('\n\n')
  const historyBlock = args.messages
    .map((m) => `${m.role === 'user' ? '用户' : '助手'}：${m.content}`)
    .join('\n\n')

  const parts: string[] = []
  parts.push('# 文章全文')
  parts.push(args.articleContent)
  if (summaryBlock) {
    parts.push('\n# 文章摘要')
    parts.push(summaryBlock)
  }
  if (args.selection) {
    parts.push(`\n# 用户选中文本\n${args.selection}`)
  }
  if (args.searchResults) {
    parts.push(`\n# 网络搜索结果\n${args.searchResults}`)
  }
  if (historyBlock) {
    parts.push(`\n# 历史对话\n${historyBlock}`)
  }
  parts.push('\n请针对用户当前问题或选中文本给出苏格拉底式回复。')
  return parts.join('\n')
}

export function formatSearchResults(results: { title: string; url: string; content: string }[]): string {
  return results
    .map((r, i) => `来源 ${i + 1}：${r.title}\n${r.content}\n链接：${r.url}`)
    .join('\n\n')
}
```

- [ ] **Step 4.2: Add `searchWeb` import and Tavily integration**

In `electron/ipc/article-assistant.ts`:

```ts
import { searchWeb } from '../lib/search.js'

ipcMain.handle(
  'articleAssistant:sendMessage',
  async (event, args: {
    sessionId: string
    articleContent: string
    articleType: 'briefing' | 'anthropic-article'
    messages: ArticleAssistantMessage[]
    selection?: string
    useSearch?: boolean
  }) => {
    let searchResultsText: string | undefined
    let searchSources: { title: string; url: string; snippet: string }[] | undefined

    if (args.useSearch) {
      const query = [args.selection, args.messages.at(-1)?.content].filter(Boolean).join(' ')
      try {
        const search = await searchWeb({ query, maxResults: 8 })
        if (search.results.length === 0) {
          // NO_RESULTS: continue without search context; UI will show notice
        } else {
          searchSources = search.results.map((r) => ({ title: r.title, url: r.url, snippet: r.content.slice(0, 300) }))
          searchResultsText = formatSearchResults(search.results)
        }
      } catch (err) {
        // Any Tavily/network error: continue without search context; UI will show notice
      }
    }

    const userPrompt = buildAssistantUserPrompt({
      articleContent: args.articleContent,
      guide: null, // guide is not passed here; renderer may cache it separately
      selection: args.selection,
      messages: args.messages,
      searchResults: searchResultsText,
    })

    // Forward to existing llm IPC by emitting a start request on the main process side.
    // The handler below delegates to ipc.llmStart, but we are already in main process.
    // So we directly call the LLM IPC internal helper.
    const { startChatStream } = await import('../lib/llm-stream.js') // adjust to actual internal module
    await startChatStream({
      sessionId: args.sessionId,
      system: buildAssistantSystemPrompt(),
      messages: [{ role: 'user', content: userPrompt }],
      profile: { name: '', profile_text: '', preferred_topics: [] },
      temperature: 0.7,
      sender: event.sender,
    })
  }
)
```

**Important:** The project uses `electron/ipc/llm.ts` with `ipcMain.handle('llm:start', ...)`. To avoid circular dependencies, the article-assistant handler should **not** call `ipcRenderer.invoke`. Instead, extract the streaming logic into a shared main-process function, or call `event.sender.send('llm:start', ...)` and let the renderer start the stream.

Simpler correct approach: `articleAssistant:sendMessage` returns the assembled prompt and search sources; the renderer then calls `ipc.llmStart` directly. This keeps streaming ownership in the renderer.

Revised Step 4.2:

```ts
ipcMain.handle(
  'articleAssistant:sendMessage',
  async (_, args: {
    sessionId: string
    articleContent: string
    articleType: 'briefing' | 'anthropic-article'
    messages: ArticleAssistantMessage[]
    selection?: string
    useSearch?: boolean
  }) => {
    let searchSources: { title: string; url: string; snippet: string }[] | undefined
    let searchError: 'NO_RESULTS' | 'SEARCH_ERROR' | undefined

    if (args.useSearch) {
      const query = [args.selection, args.messages.at(-1)?.content].filter(Boolean).join(' ')
      try {
        const search = await searchWeb({ query, maxResults: 8 })
        if (search.results.length === 0) {
          searchError = 'NO_RESULTS'
        } else {
          searchSources = search.results.map((r) => ({ title: r.title, url: r.url, snippet: r.content.slice(0, 300) }))
        }
      } catch {
        searchError = 'SEARCH_ERROR'
      }
    }

    const userPrompt = buildAssistantUserPrompt({
      articleContent: args.articleContent,
      guide: null,
      selection: args.selection,
      messages: args.messages,
      searchResults: searchSources ? formatSearchResults(searchSources.map((s) => ({ ...s, content: s.snippet }))) : undefined,
    })

    return {
      sessionId: args.sessionId,
      system: buildAssistantSystemPrompt(),
      userPrompt,
      searchSources,
      searchError,
    }
  }
)
```

- [ ] **Step 4.3: Add abort handler (delegates to llm:abort)**

```ts
ipcMain.handle('articleAssistant:abort', async (_, args: { sessionId: string }) => {
  // Delegates to the existing llm:abort handler by invoking it internally.
  const { abortLlmSession } = await import('../lib/llm-sessions.js') // adjust to actual helper
  abortLlmSession(args.sessionId)
})
```

If no internal helper exists, use the same map of AbortControllers that `electron/ipc/llm.ts` uses. The safest path is to expose a shared `abortSession(sessionId)` from `electron/ipc/llm.ts` and import it.

- [ ] **Step 4.4: Update `src/types/index.ts` return type for `articleAssistantSendMessage`**

```ts
articleAssistantSendMessage: (args: {
  // ...
}) => Promise<{
  sessionId: string
  system: string
  userPrompt: string
  searchSources?: { title: string; url: string; snippet: string }[]
  searchError?: 'NO_RESULTS' | 'SEARCH_ERROR'
}>
```

- [ ] **Step 4.5: Run typecheck**

Run: `npx tsc --noEmit`
Expected: PASS.

---

## Task 5: Add assistant session state to Zustand store

**Files:**
- Modify: `src/store/index.ts`
- Create: `src/lib/assistant-session-runtime.ts`

**Context:** Add a transient `assistantSession` slice and wire it to the existing `llm:chunk`/`llm:done`/`llm:error` events.

- [ ] **Step 5.1: Add `AssistantSession` type and state**

```ts
// src/store/index.ts
export type AssistantSession = {
  contextId: string // parent article absolute path
  contextType: 'briefing' | 'anthropic-article'
  articleTitle?: string
  articleContent: string
  guide: ArticleAssistantGuide | null
  guideLoading: boolean
  guideError: ArticleAssistantErrorCode | null
  messages: ArticleAssistantMessage[]
  streaming: boolean
  abortId: string
  searchLoading: boolean
  pendingSelection?: string
  isOpen: boolean
}
```

Add to store initial state:

```ts
assistantSession: null,
```

- [ ] **Step 5.2: Add store actions**

```ts
// src/store/index.ts
openAssistantSession: (args: {
  contextId: string
  contextType: 'briefing' | 'anthropic-article'
  articleTitle?: string
  articleContent: string
}) => {
  const { contextId, contextType, articleTitle, articleContent } = args
  set({
    assistantSession: {
      contextId,
      contextType,
      articleTitle,
      articleContent,
      guide: null,
      guideLoading: false,
      guideError: null,
      messages: [],
      streaming: false,
      abortId: '',
      searchLoading: false,
      isOpen: false,
    },
  })
  get().loadAssistantGuide()
  get().loadAssistantSession()
},

closeAssistantSession: () => {
  const session = get().assistantSession
  if (session?.streaming) {
    ipc.llmAbort({ sessionId: session.abortId })
  }
  get().saveAssistantSession()
  set({ assistantSession: null })
},

toggleAssistantOpen: () => {
  const session = get().assistantSession
  if (!session) return
  set({ assistantSession: { ...session, isOpen: !session.isOpen } })
},

setAssistantSelection: (text: string) => {
  const session = get().assistantSession
  if (!session) return
  set({ assistantSession: { ...session, pendingSelection: text } })
},

loadAssistantGuide: async () => {
  const session = get().assistantSession
  if (!session) return
  set({ assistantSession: { ...session, guideLoading: true, guideError: null } })
  try {
    const guide = await ipc.articleAssistantGenerateGuide({
      articleContent: session.articleContent,
      articleType: session.contextType,
      articleTitle: session.articleTitle,
    })
    set({ assistantSession: { ...get().assistantSession!, guide, guideLoading: false } })
  } catch (err) {
    const code = (err as Error & { code?: ArticleAssistantErrorCode })?.code ?? 'GUIDE_LLM_ERROR'
    set({ assistantSession: { ...get().assistantSession!, guideLoading: false, guideError: code } })
  }
},

loadAssistantSession: async () => {
  const session = get().assistantSession
  if (!session) return
  const file = await ipc.articleAssistantReadSession({
    parentPath: session.contextId,
    parentType: session.contextType,
  })
  if (file?.messages.length) {
    set({ assistantSession: { ...get().assistantSession!, messages: file.messages } })
  }
},

saveAssistantSession: async () => {
  const session = get().assistantSession
  if (!session) return
  await ipc.articleAssistantWriteSession({
    parentPath: session.contextId,
    parentType: session.contextType,
    messages: session.messages,
  })
},

sendAssistantMessage: async (text: string, useSearch: boolean) => {
  const session = get().assistantSession
  if (!session || session.streaming || session.searchLoading) return

  const userMessage: ArticleAssistantMessage = {
    role: 'user',
    content: text || session.pendingSelection || '',
  }
  const messages = [...session.messages, userMessage]
  const abortId = `article-assistant-${Date.now()}`
  set({
    assistantSession: {
      ...session,
      messages,
      streaming: true,
      searchLoading: useSearch,
      abortId,
      pendingSelection: session.pendingSelection,
      isOpen: true,
    },
  })

  try {
    const prepared = await ipc.articleAssistantSendMessage({
      sessionId: abortId,
      articleContent: session.articleContent,
      articleType: session.contextType,
      messages,
      selection: session.pendingSelection,
      useSearch,
    })

    const assistantPlaceholder: ArticleAssistantMessage = {
      role: 'assistant',
      content: '',
      searchSources: prepared.searchSources,
    }
    set({
      assistantSession: {
        ...get().assistantSession!,
        messages: [...get().assistantSession!.messages, assistantPlaceholder],
        searchLoading: false,
      },
    })

    await ipc.llmStart({
      sessionId: abortId,
      system: prepared.system,
      messages: [{ role: 'user', content: prepared.userPrompt }],
      profile: get().profile,
      mode: 'progress',
      temperature: 0.7,
      difficulty: 'mid',
    })
  } catch (err) {
    const code = (err as Error & { code?: ArticleAssistantErrorCode })?.code ?? 'CHAT_LLM_ERROR'
    set({
      assistantSession: {
        ...get().assistantSession!,
        streaming: false,
        searchLoading: false,
        messages: [
          ...get().assistantSession!.messages,
          { role: 'assistant', content: '', error: code } as ArticleAssistantMessage,
        ],
      },
    })
  }
},

appendAssistantChunk: (text: string) => {
  const session = get().assistantSession
  if (!session || !session.streaming) return
  const last = session.messages.at(-1)
  if (!last || last.role !== 'assistant') return
  const updated = session.messages.slice(0, -1)
  updated.push({ ...last, content: last.content + text })
  set({ assistantSession: { ...session, messages: updated } })
},

finishAssistantStreaming: () => {
  const session = get().assistantSession
  if (!session) return
  set({ assistantSession: { ...session, streaming: false } })
  get().saveAssistantSession()
},

abortAssistantStream: () => {
  const session = get().assistantSession
  if (!session || !session.streaming) return
  ipc.llmAbort({ sessionId: session.abortId })
  set({ assistantSession: { ...session, streaming: false } })
},
```

- [ ] **Step 5.3: Wire streaming listeners**

Create `src/lib/assistant-session-runtime.ts`:

```ts
import { ipc } from '@/lib/ipc'
import { useStore } from '@/store'

let unsubChunk: (() => void) | null = null
let unsubDone: (() => void) | null = null
let unsubError: (() => void) | null = null

export function attachAssistantSessionListeners() {
  if (unsubChunk) return

  unsubChunk = ipc.onLlmChunk((sid, text) => {
    const session = useStore.getState().assistantSession
    if (!session || session.abortId !== sid) return
    useStore.getState().appendAssistantChunk(text)
  })

  unsubDone = ipc.onLlmDone((sid) => {
    const session = useStore.getState().assistantSession
    if (!session || session.abortId !== sid) return
    useStore.getState().finishAssistantStreaming()
  })

  unsubError = ipc.onLlmError((sid, err) => {
    const session = useStore.getState().assistantSession
    if (!session || session.abortId !== sid) return
    useStore.getState().finishAssistantStreaming()
    useStore.getState().showToast(`助手回复失败: ${err.message}`)
  })
}
```

- [ ] **Step 5.4: Attach listeners at app startup**

In `src/main.tsx` or wherever `attachSessionListeners()` is called, also call:

```ts
attachAssistantSessionListeners()
```

Find the exact call site with `Grep` for `attachSessionListeners` and add the new import/call next to it.

- [ ] **Step 5.5: Run typecheck**

Run: `npx tsc --noEmit`
Expected: PASS.

---

## Task 6: Build UI components

**Files:**
- Create: `src/components/article-assistant/ArticleAssistantPanel.tsx`
- Create: `src/components/article-assistant/GuideSidebar.tsx`
- Create: `src/components/article-assistant/ChatWindow.tsx`
- Create: `src/components/article-assistant/ResizeHandles.tsx`
- Create: `src/components/article-assistant/index.ts`
- Modify: `src/pages/Briefing.tsx`
- Modify: `src/components/anthropic/AnthropicArticleReader.tsx`

**Context:** The panel is shared across Briefing and Anthropic reader. It renders a right-side guide sidebar and a floating chat window that can be toggled via a vertical tab.

- [ ] **Step 6.1: Create `GuideSidebar.tsx`**

```tsx
import { useStore } from '@/store'

export function GuideSidebar() {
  const session = useStore((s) => s.assistantSession)
  if (!session) return null

  return (
    <div className="w-80 h-full border-l border-parchment/10 bg-ink/40 flex flex-col">
      <div className="px-4 py-3 text-xs uppercase tracking-widest text-parchment/60">导读</div>
      {session.guideLoading && <div className="px-4 text-sm text-parchment/50">生成导读中…</div>}
      {session.guideError && (
        <div className="px-4 text-sm text-ember">未能生成导读，可继续阅读原文。</div>
      )}
      {session.guide && (
        <div className="flex-1 overflow-y-auto px-4 pb-4 space-y-4">
          <div className="bg-ink/60 border border-parchment/10 rounded p-3 text-sm leading-relaxed text-parchment/90">
            <strong className="text-ember">背景</strong>：{session.guide.background}
          </div>
          {session.guide.chunks.map((chunk, i) => (
            <div key={i} className="bg-ink/60 border border-parchment/10 rounded p-3 text-sm">
              <div className="text-ember font-medium mb-1">{chunk.heading}</div>
              <div className="text-parchment/80 leading-relaxed mb-2">{chunk.summary}</div>
              {chunk.terms.length > 0 && (
                <div className="space-y-1">
                  {chunk.terms.map((t) => (
                    <div key={t.term} className="text-xs text-parchment/70">
                      <span className="text-ember">{t.term}</span> · {t.translation}
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 6.2: Create `ResizeHandles.tsx`**

Four invisible handles at each corner. Each handle starts a pointer capture that adjusts width/height based on movement.

```tsx
import { useRef } from 'react'

export type ResizeHandle = 'nw' | 'ne' | 'sw' | 'se'

export function ResizeHandles({
  onResize,
}: {
  onResize: (delta: { width: number; height: number }) => void
}) {
  const startRef = useRef<{ x: number; y: number; width: number; height: number } | null>(null)

  const handlePointerDown = (dir: ResizeHandle) => (e: React.PointerEvent) => {
    e.preventDefault()
    const el = (e.target as HTMLElement).parentElement!
    const rect = el.getBoundingClientRect()
    startRef.current = { x: e.clientX, y: e.clientY, width: rect.width, height: rect.height }
    ;(e.target as HTMLElement).setPointerCapture(e.pointerId)

    const onMove = (ev: PointerEvent) => {
      if (!startRef.current) return
      const dx = ev.clientX - startRef.current.x
      const dy = ev.clientY - startRef.current.y
      const signX = dir.includes('e') ? 1 : -1
      const signY = dir.includes('s') ? 1 : -1
      onResize({
        width: startRef.current.width + dx * signX,
        height: startRef.current.height + dy * signY,
      })
    }

    const onUp = () => {
      ;(e.target as HTMLElement).releasePointerCapture(e.pointerId)
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      startRef.current = null
    }

    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }

  const base = 'absolute w-3 h-3 z-10'
  return (
    <>
      <div className={`${base} top-0 left-0 cursor-nw-resize`} onPointerDown={handlePointerDown('nw')} />
      <div className={`${base} top-0 right-0 cursor-ne-resize`} onPointerDown={handlePointerDown('ne')} />
      <div className={`${base} bottom-0 left-0 cursor-sw-resize`} onPointerDown={handlePointerDown('sw')} />
      <div className={`${base} bottom-0 right-0 cursor-se-resize`} onPointerDown={handlePointerDown('se')} />
    </>
  )
}
```

- [ ] **Step 6.3: Create `ChatWindow.tsx`**

```tsx
import { useRef, useState, useEffect } from 'react'
import { useStore } from '@/store'
import { ResizeHandles } from './ResizeHandles'

const MIN_W = 260
const MIN_H = 180
const DEFAULT_W = 340
const DEFAULT_H = 260

export function ChatWindow() {
  const session = useStore((s) => s.assistantSession)
  const sendAssistantMessage = useStore((s) => s.sendAssistantMessage)
  const abortAssistantStream = useStore((s) => s.abortAssistantStream)
  const toggleAssistantOpen = useStore((s) => s.toggleAssistantOpen)
  const setAssistantSelection = useStore((s) => s.setAssistantSelection)

  const [input, setInput] = useState('')
  const [size, setSize] = useState({ width: DEFAULT_W, height: DEFAULT_H })
  const [position, setPosition] = useState<{ x?: number; y?: number }>({})
  const dragging = useRef<{ startX: number; startY: number; originX: number; originY: number } | null>(null)

  if (!session || !session.isOpen) return null

  const handleSend = (useSearch: boolean) => {
    if (!input.trim() && !session.pendingSelection) return
    sendAssistantMessage(input, useSearch)
    setInput('')
  }

  const handleDragStart = (e: React.PointerEvent) => {
    const el = (e.target as HTMLElement).closest('[data-chat-window]') as HTMLElement
    const rect = el.getBoundingClientRect()
    dragging.current = {
      startX: e.clientX,
      startY: e.clientY,
      originX: rect.left,
      originY: rect.top,
    }
    ;(e.target as HTMLElement).setPointerCapture(e.pointerId)

    const onMove = (ev: PointerEvent) => {
      if (!dragging.current) return
      setPosition({
        x: dragging.current.originX + (ev.clientX - dragging.current.startX),
        y: dragging.current.originY + (ev.clientY - dragging.current.startY),
      })
    }
    const onUp = () => {
      ;(e.target as HTMLElement).releasePointerCapture(e.pointerId)
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      dragging.current = null
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }

  return (
    <div
      data-chat-window
      data-testid="article-assistant-chat-window"
      className="fixed z-50 flex flex-col border border-parchment/20 bg-[#1a1512] shadow-2xl rounded-sm"
      style={{
        width: Math.max(MIN_W, size.width),
        height: Math.max(MIN_H, size.height),
        right: position.x === undefined ? 24 : undefined,
        bottom: position.y === undefined ? 24 : undefined,
        left: position.x,
        top: position.y,
      }}
    >
      <div
        className="h-10 flex items-center justify-between px-3 border-b border-parchment/10 cursor-move select-none"
        onPointerDown={handleDragStart}
      >
        <span className="text-xs tracking-widest text-parchment/80">旁注 · MARGIN</span>
        <button className="text-parchment/60 hover:text-ember" onClick={toggleAssistantOpen} aria-label="关闭">
          ✕
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {session.pendingSelection && (
          <div className="text-xs border-l-2 border-ember bg-ember/10 p-2 text-parchment/80">
            <div className="opacity-60 mb-1">你选中了：</div>
            “{session.pendingSelection}”
          </div>
        )}
        {session.messages.map((m, i) => (
          <div key={i} className={`text-sm ${m.role === 'user' ? 'text-ember' : 'text-parchment/90'}`}>
            {m.role === 'user' ? '你：' : '旁注：'}
            {m.content}
            {m.searchSources && m.searchSources.length > 0 && (
              <div className="text-xs text-parchment/50 mt-1">已搜索 {m.searchSources.length} 个来源</div>
            )}
          </div>
        ))}
        {session.streaming && (
          <div className="text-xs text-parchment/50">
            {session.searchLoading ? '搜索并思考中…' : '思考中…'}
          </div>
        )}
      </div>

      <div className="p-2 border-t border-parchment/10 flex gap-2">
        <button
          data-testid="article-assistant-search-btn"
          className="px-2 text-parchment/70 hover:text-ember disabled:opacity-40"
          onClick={() => handleSend(true)}
          disabled={session.streaming || session.searchLoading}
          aria-label="联网搜索"
        >
          {session.searchLoading ? '⏳' : '🔍'}
        </button>
        <input
          data-testid="article-assistant-input"
          className="flex-1 bg-[#0c0806] border border-parchment/20 rounded px-2 py-1 text-sm text-parchment/90 placeholder:text-parchment/40"
          placeholder="问点什么……"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSend(false)}
        />
        {session.streaming ? (
          <button className="text-xs text-ember" onClick={abortAssistantStream}>
            停止
          </button>
        ) : (
          <button className="text-xs text-parchment/80 hover:text-ember" onClick={() => handleSend(false)}>
            发送
          </button>
        )}
      </div>
      <ResizeHandles onResize={(delta) => setSize({ width: delta.width, height: delta.height })} />
    </div>
  )
}
```

- [ ] **Step 6.4: Create `ArticleAssistantPanel.tsx`**

```tsx
import { useEffect } from 'react'
import { useStore } from '@/store'
import { GuideSidebar } from './GuideSidebar'
import { ChatWindow } from './ChatWindow'

export function ArticleAssistantPanel({
  articleType,
  parentPath,
  articleTitle,
  articleContent,
}: {
  articleType: 'briefing' | 'anthropic-article'
  parentPath: string
  articleTitle?: string
  articleContent: string
}) {
  const session = useStore((s) => s.assistantSession)
  const openAssistantSession = useStore((s) => s.openAssistantSession)
  const closeAssistantSession = useStore((s) => s.closeAssistantSession)
  const setAssistantSelection = useStore((s) => s.setAssistantSelection)
  const toggleAssistantOpen = useStore((s) => s.toggleAssistantOpen)

  useEffect(() => {
    if (!session || session.contextId !== parentPath) {
      closeAssistantSession()
      openAssistantSession({ contextId: parentPath, contextType: articleType, articleTitle, articleContent })
    }
  }, [parentPath, articleType, articleTitle, articleContent])

  useEffect(() => {
    const onMouseUp = () => {
      const sel = window.getSelection()?.toString().trim()
      if (sel) setAssistantSelection(sel)
    }
    document.addEventListener('mouseup', onMouseUp)
    return () => document.removeEventListener('mouseup', onMouseUp)
  }, [setAssistantSelection])

  if (!session || session.contextId !== parentPath) return null

  return (
    <>
      <GuideSidebar />
      <button
        data-testid="article-assistant-tab"
        onClick={toggleAssistantOpen}
        className="absolute right-80 top-24 z-40 w-6 h-28 bg-ink/80 border border-parchment/20 border-r-0 rounded-l flex items-center justify-center"
      >
        <span className="text-[10px] tracking-widest text-parchment/70" style={{ writingMode: 'vertical-rl' }}>
          旁注
        </span>
        {session.pendingSelection && <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-ember" />}
      </button>
      <ChatWindow />
    </>
  )
}
```

- [ ] **Step 6.5: Create `index.ts` barrel**

```ts
export { ArticleAssistantPanel } from './ArticleAssistantPanel'
```

- [ ] **Step 6.6: Mount in `Briefing.tsx`**

Add import:

```tsx
import { ArticleAssistantPanel } from '@/components/article-assistant'
```

Locate the main layout in `src/pages/Briefing.tsx` (around L97-L205). The page already has a sidebar on the left and a main column. Add the assistant panel to the right of the main column only when an article is open. The spec requires it to be page chrome across states; however, it needs `parentPath` which only exists when an article is open. Therefore mount it conditionally inside the root `div` after the main column:

```tsx
<div className="relative h-full flex overflow-hidden ...">
  <BriefingSourceSidebar ... />
  <div className="flex-1 flex flex-col min-w-0">...</div>
  {result?.filePath && (
    <ArticleAssistantPanel
      articleType="briefing"
      parentPath={result.filePath}
      articleTitle={result.title}
      articleContent={result.content ?? ''}
    />
  )}
  {anthropicReaderFilePath && (
    <ArticleAssistantPanel
      articleType="anthropic-article"
      parentPath={anthropicReaderFilePath}
      articleContent={anthropicBody ?? ''}
    />
  )}
</div>
```

For Anthropic within Briefing, the body is loaded in `AnthropicArticleReader`. To avoid duplication, have `AnthropicArticleReader` mount its own panel and omit the Briefing-level Anthropic panel.

- [ ] **Step 6.7: Mount in `AnthropicArticleReader.tsx`**

```tsx
import { ArticleAssistantPanel } from '@/components/article-assistant'

// Inside the reader root, after the article scroll area:
<ArticleAssistantPanel
  articleType="anthropic-article"
  parentPath={filePath}
  articleTitle={frontmatter.title}
  articleContent={body}
/>
```

- [ ] **Step 6.8: Run typecheck and dev smoke test**

Run: `npx tsc --noEmit`
Expected: PASS.

Run: `npm run dev`
Expected: app starts; no console errors related to assistant imports.

---

## Task 7: Implement term highlighting in article body

**Files:**
- Modify: `src/components/md/MarkdownRenderer.tsx`
- Modify: `src/components/md/MarkdownContent.tsx`
- Create: `src/components/md/rehypeTermHighlight.ts`

**Context:** Terms from the generated guide should be highlighted in the article body with a dashed underline and hover tooltip.

- [ ] **Step 7.1: Create `rehypeTermHighlight.ts`**

```ts
import type { Plugin } from 'unified'
import type { Root, Text, Element } from 'hast'
import { visit } from 'unist-util-visit'

export type TermDef = { term: string; translation: string; explanation: string }

export function rehypeTermHighlight(terms: TermDef[]): Plugin<[], Root> {
  return () => (tree: Root) => {
    const sorted = [...terms].sort((a, b) => b.term.length - a.term.length)
    visit(tree, 'text', (node: Text, index, parent: Element | null) => {
      if (!parent || parent.tagName === 'script' || parent.tagName === 'style') return
      const text = node.value
      const parts: (Text | Element)[] = []
      let remaining = text
      while (remaining) {
        const match = sorted.find((t) => {
          const idx = remaining.toLowerCase().indexOf(t.term.toLowerCase())
          return idx >= 0
        })
        if (!match) {
          parts.push({ type: 'text', value: remaining })
          break
        }
        const idx = remaining.toLowerCase().indexOf(match.term.toLowerCase())
        if (idx > 0) parts.push({ type: 'text', value: remaining.slice(0, idx) })
        parts.push({
          type: 'element',
          tagName: 'span',
          properties: {
            className: 'article-term-highlight',
            title: `${match.translation} — ${match.explanation}`,
          },
          children: [{ type: 'text', value: remaining.slice(idx, idx + match.term.length) }],
        })
        remaining = remaining.slice(idx + match.term.length)
      }
      parent.children.splice(index ?? 0, 1, ...parts)
    })
  }
}
```

- [ ] **Step 7.2: Update `MarkdownContent.tsx`**

```tsx
interface Props {
  children: string
  components?: Components
  className?: string
  terms?: TermDef[]
}

export function MarkdownContent({ children, components, className, terms }: Props) {
  return (
    <div className={className}>
      <MdErrorBoundary>
        <Markdown
          remarkPlugins={[remarkGfm]}
          rehypePlugins={terms ? [rehypeRaw, [rehypeTermHighlight, terms]] : []}
          components={components}
          urlTransform={allowFileUrlTransform}
        >
          {children}
        </Markdown>
      </MdErrorBoundary>
    </div>
  )
}
```

- [ ] **Step 7.3: Update `MarkdownRenderer.tsx`**

Add `terms?: TermDef[]` prop and pass it down.

- [ ] **Step 7.4: Add global CSS**

In `src/index.css` or a new rule:

```css
.article-term-highlight {
  border-bottom: 1px dashed #d97757;
  cursor: help;
}
```

- [ ] **Step 7.5: Plumb terms from store to renderer**

In `Briefing.tsx` and `AnthropicArticleReader.tsx`, pass `terms={session?.guide?.chunks.flatMap((c) => c.terms) ?? []}` to `MarkdownRenderer`.

- [ ] **Step 7.6: Run typecheck**

Run: `npx tsc --noEmit`
Expected: PASS.

---

## Task 8: Add unit tests

**Files:**
- Create: `tests/article-assistant/prompt.test.ts`
- Create: `tests/article-assistant/json-extract.test.ts`
- Create: `tests/article-assistant/search-format.test.ts`
- Create: `tests/article-assistant/file-io.test.ts`

**Context:** Cover prompt content, JSON extraction robustness, search formatting, and session file round-trip.

- [ ] **Step 8.1: Prompt content test**

```ts
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

describe('digest-guide prompt', () => {
  const prompt = fs.readFileSync(path.join(__dirname, '../../electron/prompts/digest-guide.md'), 'utf8')

  it('requires JSON-only output', () => {
    expect(prompt).toMatch(/Return ONLY a JSON object/)
    expect(prompt).toMatch(/Do not wrap it in markdown code blocks/)
  })

  it('defines background and chunks schema', () => {
    expect(prompt).toMatch(/"background"/)
    expect(prompt).toMatch(/"chunks"/)
    expect(prompt).toMatch(/"heading"/)
    expect(prompt).toMatch(/"summary"/)
    expect(prompt).toMatch(/"terms"/)
  })

  it('forbids decorative metadata', () => {
    expect(prompt).toMatch(/AI Builders Digest|Vol\.|档案编号|学习卷宗/)
  })
})
```

- [ ] **Step 8.2: JSON extraction robustness**

Use existing `extractJsonObject` with sample malformed guide outputs.

```ts
import { describe, it, expect } from 'vitest'
import { extractJsonObject } from '../../electron/lib/json-extract'

describe('extractJsonObject for guide output', () => {
  it('strips markdown fence', () => {
    const raw = '```json\n{"background":"b","chunks":[]}\n```'
    expect(extractJsonObject(raw)).toEqual({ background: 'b', chunks: [] })
  })

  it('handles leading prose', () => {
    const raw = 'Here is the guide:\n{"background":"b","chunks":[]}'
    expect(extractJsonObject(raw)).toEqual({ background: 'b', chunks: [] })
  })

  it('throws on malformed JSON', () => {
    expect(() => extractJsonObject('not json')).toThrow()
  })
})
```

- [ ] **Step 8.3: Search results formatting**

```ts
import { describe, it, expect } from 'vitest'
import { formatSearchResults } from '../../electron/lib/article-assistant-prompt'

describe('formatSearchResults', () => {
  it('formats all results with index, title, content, url', () => {
    const out = formatSearchResults([
      { title: 'A', url: 'https://a', content: 'body a' },
      { title: 'B', url: 'https://b', content: 'body b' },
    ])
    expect(out).toContain('来源 1：A')
    expect(out).toContain('body a')
    expect(out).toContain('链接：https://a')
    expect(out).toContain('来源 2：B')
  })
})
```

- [ ] **Step 8.4: Run all new unit tests**

Run: `npx vitest run tests/article-assistant`
Expected: PASS.

---

## Task 9: Add component tests

**Files:**
- Create: `tests/article-assistant/ChatWindow.test.tsx`

**Context:** Test expand/collapse, selection quote, resize handle existence, and search button state.

- [ ] **Step 9.1: Render with open session**

```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ChatWindow } from '../../src/components/article-assistant/ChatWindow'
import * as storeModule from '../../src/store'

vi.mock('../../src/store', () => ({
  useStore: vi.fn(),
}))

function mockSession(overrides = {}) {
  return {
    contextId: '/tmp/test.md',
    contextType: 'briefing',
    articleContent: 'article',
    guide: null,
    guideLoading: false,
    guideError: null,
    messages: [],
    streaming: false,
    abortId: '',
    searchLoading: false,
    pendingSelection: 'selected text',
    isOpen: true,
    ...overrides,
  }
}

describe('ChatWindow', () => {
  it('shows selection quote', () => {
    ;(storeModule.useStore as any).mockImplementation((sel: any) =>
      sel({ assistantSession: mockSession(), sendAssistantMessage: vi.fn(), abortAssistantStream: vi.fn(), toggleAssistantOpen: vi.fn(), setAssistantSelection: vi.fn() })
    )
    render(<ChatWindow />)
    expect(screen.getByText(/你选中了：/)).toBeInTheDocument()
    expect(screen.getByText(/selected text/)).toBeInTheDocument()
  })

  it('renders four resize handles', () => {
    render(<ChatWindow />)
    expect(document.querySelectorAll('[class*="cursor-"]').length).toBeGreaterThanOrEqual(4)
  })

  it('toggles search button loading', () => {
    ;(storeModule.useStore as any).mockImplementation((sel: any) =>
      sel({ assistantSession: mockSession({ searchLoading: true }), sendAssistantMessage: vi.fn(), abortAssistantStream: vi.fn(), toggleAssistantOpen: vi.fn(), setAssistantSelection: vi.fn() })
    )
    render(<ChatWindow />)
    expect(screen.getByLabelText(/联网搜索/)).toBeDisabled()
  })
})
```

- [ ] **Step 9.2: Run component tests**

Run: `npx vitest run tests/article-assistant/ChatWindow.test.tsx`
Expected: PASS.

---

## Task 10: Add E2E tests

**Files:**
- Modify: `e2e/helpers/selectors.ts`
- Modify: `e2e/helpers/test-library.ts`
- Create: `e2e/specs/article-assistant.spec.ts`
- Create: `e2e/pages/ArticleAssistantPage.ts`

**Context:** Follow existing E2E patterns: selectors centralized, seed helpers in `test-library.ts`, page object encapsulates waits.

- [ ] **Step 10.1: Add selectors**

```ts
// e2e/helpers/selectors.ts
export const SELECTORS = {
  // ... existing ...
  articleAssistantTab: '[data-testid="article-assistant-tab"]',
  articleAssistantChatWindow: '[data-testid="article-assistant-chat-window"]',
  articleAssistantInput: '[data-testid="article-assistant-input"]',
  articleAssistantSearchBtn: '[data-testid="article-assistant-search-btn"]',
}
```

- [ ] **Step 10.2: Add page object**

```ts
// e2e/pages/ArticleAssistantPage.ts
import type { Page } from '@playwright/test'
import { SELECTORS } from '../helpers/selectors'

export class ArticleAssistantPage {
  constructor(private page: Page) {}

  async openChat() {
    await this.page.locator(SELECTORS.articleAssistantTab).click()
    await this.page.locator(SELECTORS.articleAssistantChatWindow).waitFor()
  }

  async typeQuestion(text: string) {
    await this.page.locator(SELECTORS.articleAssistantInput).fill(text)
  }

  async send() {
    await this.page.keyboard.press('Enter')
  }

  async clickSearch() {
    await this.page.locator(SELECTORS.articleAssistantSearchBtn).click()
  }

  async waitForResponse() {
    await this.page.waitForFunction(() => {
      const session = (window as any).useStore?.getState()?.assistantSession
      return session && session.messages.some((m: any) => m.role === 'assistant' && m.content.length > 0)
    }, { timeout: 60000 })
  }

  async resizeFromCorner(corner: 'se', delta: { x: number; y: number }) {
    const handle = this.page.locator(`${SELECTORS.articleAssistantChatWindow} [class*="cursor-${corner}-resize"]`)
    const box = await handle.boundingBox()
    if (!box) throw new Error('Resize handle not found')
    await handle.dragTo(this.page.locator('body'), {
      sourcePosition: { x: box.width / 2, y: box.height / 2 },
      targetPosition: { x: box.x + delta.x, y: box.y + delta.y },
    })
  }
}
```

- [ ] **Step 10.3: Write E2E spec**

```ts
// e2e/specs/article-assistant.spec.ts
import { test, expect } from '../fixtures/electron'
import { ArticleAssistantPage } from '../pages/ArticleAssistantPage'

test.describe('article assistant', () => {
  test('opens briefing article and shows guide', async ({ page, seedBriefingArticle }) => {
    await seedBriefingArticle({ date: '2026-07-11', title: 'Test Briefing', content: '## AI Safety\nConstitutional AI...' })
    // navigate to briefing and open date
    const assistant = new ArticleAssistantPage(page)
    await assistant.openChat()
    await expect(page.locator('[data-testid="article-assistant-chat-window"]')).toBeVisible()
  })

  test('selected text appears as quote', async ({ page }) => {
    // select article text, open chat, assert quote
  })

  test('sends question and receives streaming reply', async ({ page }) => {
    const assistant = new ArticleAssistantPage(page)
    await assistant.openChat()
    await assistant.typeQuestion('What is Constitutional AI?')
    await assistant.send()
    await assistant.waitForResponse()
  })

  test('search button includes selection and question in query', async ({ page }) => {
    // use window.evaluate to spy on searchWeb call or inspect store state
  })

  test('resizing from southeast corner changes window size', async ({ page }) => {
    const assistant = new ArticleAssistantPage(page)
    await assistant.openChat()
    const before = await page.locator(SELECTORS.articleAssistantChatWindow).boundingBox()
    await assistant.resizeFromCorner('se', { x: 100, y: 80 })
    const after = await page.locator(SELECTORS.articleAssistantChatWindow).boundingBox()
    expect(after!.width).toBeGreaterThan(before!.width)
    expect(after!.height).toBeGreaterThan(before!.height)
  })

  test('session file is saved with correct parent_path and parent_type', async ({ page, tmpLibrary }) => {
    // close article, assert file exists and frontmatter matches
  })
})
```

E2E tests will require fixture support for seeding briefing-cache articles; implement `seedBriefingArticle` in `e2e/helpers/test-library.ts` if it does not exist.

- [ ] **Step 10.4: Run E2E spec in mock mode**

Run: `npm run test:e2e:core -- e2e/specs/article-assistant.spec.ts`
Expected: PASS or deterministic failures only due to missing seed helpers (fix iteratively).

---

## Task 11: Build and package smoke test

**Files:**
- Modify: `electron-builder.yml` (if needed)

**Context:** Verify that new prompt and component files are bundled and the packaged app starts.

- [ ] **Step 11.1: Confirm `electron-builder.yml` includes new assets**

Ensure the `files` list includes:

```yml
files:
  - out/**/*
  - package.json
  - electron/prompts
  - electron/assets
```

If `electron/prompts` is already listed, no change.

- [ ] **Step 11.2: Build production**

Run: `npm run build`
Expected: SUCCESS.

- [ ] **Step 11.3: Package Windows installer**

Run: `npm run package`
Expected: `release/` contains installer and unpacked exe.

- [ ] **Step 11.4: Launch packaged app and open a briefing article**

Launch `release/win-unpacked/Study Parlor.exe` (or equivalent). Verify:
- Guide sidebar appears.
- Chat tab opens/closes.
- No `prompts/digest-guide.md` missing errors in DevTools.

---

## Task 12: Final review and commit

- [ ] **Step 12.1: Run full test suite**

Run: `npm run test`
Expected: all unit + process tests PASS.

- [ ] **Step 12.2: Run E2E core suite**

Run: `npm run test:e2e:core`
Expected: PASS (or only pre-existing failures).

- [ ] **Step 12.3: Check for unused code and stale imports**

Run: `npx tsc --noEmit`
Expected: PASS.

Run: `git diff --stat`
Expected: review that only intended files changed.

- [ ] **Step 12.4: Commit**

```bash
git add .
git commit -m "feat(article-assistant): add margin assistant for briefing and anthropic articles"
```

---

## Appendix: File map

| File | Responsibility |
|------|----------------|
| `src/types/index.ts` | Shared types: doc type, guide shape, IPC API, error codes |
| `electron/lib/frontmatter.ts` | `article-assistant` frontmatter extension fields |
| `electron/prompts/digest-guide.md` | Prompt for background/chunks/terms generation |
| `electron/ipc/article-assistant.ts` | Main-process handlers for guide, chat prep, abort, file IO |
| `electron/lib/article-assistant-prompt.ts` | Prompt assembly and search-result formatting |
| `electron/preload.ts` | Expose new IPC channels |
| `src/lib/ipc.ts` | Renderer facade getters |
| `src/store/index.ts` | Transient `assistantSession` state and actions |
| `src/lib/assistant-session-runtime.ts` | Routes `llm:*` events to assistant session |
| `src/components/article-assistant/ArticleAssistantPanel.tsx` | Mount point + selection listener |
| `src/components/article-assistant/GuideSidebar.tsx` | Right-side guide rendering |
| `src/components/article-assistant/ChatWindow.tsx` | Floating chat UI |
| `src/components/article-assistant/ResizeHandles.tsx` | Four-corner resize |
| `src/components/md/rehypeTermHighlight.ts` | Term underline/hover in article body |
| `src/pages/Briefing.tsx` | Mount assistant for briefing articles |
| `src/components/anthropic/AnthropicArticleReader.tsx` | Mount assistant for Anthropic articles |
| `tests/article-assistant/*.test.ts` | Unit + component tests |
| `e2e/pages/ArticleAssistantPage.ts` | E2E page object |
| `e2e/specs/article-assistant.spec.ts` | E2E coverage |
