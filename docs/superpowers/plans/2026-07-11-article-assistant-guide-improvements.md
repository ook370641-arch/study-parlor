# 文章旁注助手导读改进实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 2026-07-11 博客/日报阅读器 UI 升级基线上，实现导读持久化、AI 日报自动生成导读、正文按导读 chunk 分段、可拖拽折叠分栏、换画按钮仅保留在正文右上角。

**Architecture:**
- 主进程新增 `articleAssistant:readGuide` / `articleAssistant:writeGuide`，以 `<parent>.guide.md` 缓存结构化 guide（复用 `serializeFrontmatter`，与现有 `.assistant.md` 聊天会话文件区分）。
- Store 新增持久化字段 `articleAssistantGuideWidth` / `articleAssistantGuideCollapsed`，并在 `openAssistantSession` 时先读缓存、按需自动生成、生成后写缓存；切换文章时先保存旧 guide 再加载新 guide。
- 新增 `splitArticleIntoChunks` 算法按 guide heading 模糊拆分正文；`ArticleBodyChunks` 组件渲染分块卡片；`ArticleDivider` 提供 6px 拖拽条与折叠按钮；`GuideSidebar` 仅负责展示，不再承载换画按钮。
- `ArticleAssistantPanel` 统一调度宽度/折叠状态、分块高亮、自动生成的副作用；`Briefing.tsx` 与 `AnthropicArticleReader.tsx` 只负责传入文章数据和挂载面板。

**Tech Stack:** Electron 30 + React 18 + TypeScript + Tailwind CSS + Zustand + electron-vite + Vitest + Playwright E2E.

**Spec baseline:** `docs/superpowers/specs/2026-07-11-article-assistant-guide-improvements-design.md`

**Important deviation from spec:**
- 缓存文件后缀使用 `.guide.md` 而不是 `.assistant.md`。原因：当前 `electron/ipc/article-assistant.ts` 的 `sessionPathFor` 已经把 `<base>.assistant.md` 用于聊天会话持久化，若复用同一文件会造成冲突。`.guide.md` 同样放在父文件同目录，管理语义更清晰。

---

## Task 0: Types, state defaults, and IPC contract

**Files:**
- Modify: `src/types/index.ts`
- Modify: `electron/preload.ts`
- Modify: `src/lib/ipc.ts`
- Modify: `src/store/index.ts`
- Modify: `e2e/helpers/test-library.ts`

- [ ] **Step 1: Add `ArticleChunk` and extend `StateJson` / `IpcApi`**

In `src/types/index.ts`:

```ts
export type ArticleChunk = {
  heading: string
  body: string
  startIndex: number
}

export type ArticleAssistantGuideFile = {
  filePath: string
  guide: ArticleAssistantGuide
  generatedAt: string
}
```

Add to `StateJson`:

```ts
articleAssistantGuideWidth?: number
articleAssistantGuideCollapsed?: boolean
```

Add to `IpcApi`:

```ts
articleAssistantReadGuide: (args: { parentPath: string; parentType: 'briefing' | 'anthropic-article' }) => Promise<ArticleAssistantGuideFile | null>
articleAssistantWriteGuide: (args: { parentPath: string; parentType: 'briefing' | 'anthropic-article'; guide: ArticleAssistantGuide }) => Promise<{ filePath: string }>
```

- [ ] **Step 2: Expose methods in preload and facade**

In `electron/preload.ts` after `articleAssistantWriteSession`:

```ts
articleAssistantReadGuide: (a) => ipcRenderer.invoke('articleAssistant:readGuide', a),
articleAssistantWriteGuide: (a) => ipcRenderer.invoke('articleAssistant:writeGuide', a),
```

In `src/lib/ipc.ts`:

```ts
get articleAssistantReadGuide() { return ensure().articleAssistantReadGuide },
get articleAssistantWriteGuide() { return ensure().articleAssistantWriteGuide },
```

- [ ] **Step 3: Add persisted fields and new actions to store**

Add to `AssistantSession` type in `src/store/index.ts`:

```ts
activeChunkIndex: number | null
```

Add to `AppStore` interface:

```ts
articleAssistantGuideWidth: number
articleAssistantGuideCollapsed: boolean
setArticleAssistantGuideWidth: (width: number) => void
setArticleAssistantGuideCollapsed: (collapsed: boolean) => void
setAssistantActiveChunk: (index: number | null) => void
persistAssistantState: () => Promise<void>
generateAssistantGuide: () => Promise<void>
```

Add defaults in store object:

```ts
articleAssistantGuideWidth: 320,
articleAssistantGuideCollapsed: false,
```

In `init()` where state is loaded, add:

```ts
articleAssistantGuideWidth: state.articleAssistantGuideWidth ?? 320,
articleAssistantGuideCollapsed: state.articleAssistantGuideCollapsed ?? false,
```

- [ ] **Step 4: Sync E2E `BASE_STATE`**

In `e2e/helpers/test-library.ts` add to `BASE_STATE`:

```ts
articleAssistantGuideWidth: 320,
articleAssistantGuideCollapsed: false,
```

- [ ] **Step 5: Run typecheck and commit**

```bash
npx tsc --noEmit
```

Expected: pass (no new runtime code yet).

```bash
git add src/types/index.ts electron/preload.ts src/lib/ipc.ts src/store/index.ts e2e/helpers/test-library.ts
git commit -m "feat(article-assistant): add guide width/collapsed state and IPC contract"
```

---

## Task 1: Main-process guide cache read/write

**Files:**
- Modify: `electron/ipc/article-assistant.ts`
- Test: `tests/article-assistant-guide-ipc.test.ts` (create)

- [ ] **Step 1: Add helper to derive guide cache path**

At top of `electron/ipc/article-assistant.ts`:

```ts
function guidePathFor(parentPath: string): string {
  const parsed = path.parse(parentPath)
  return path.join(parsed.dir, `${parsed.name}.guide.md`)
}
```

- [ ] **Step 2: Serialize guide to markdown**

Add function:

```ts
function serializeGuide(guide: ArticleAssistantGuide): string {
  const chunks = guide.chunks.map((c, i) => {
    const terms = c.terms.length
      ? '\n\n' + c.terms.map((t) => `**上下文（context）**：${t.term}（${t.translation}）— ${t.explanation}`).join('\n\n')
      : ''
    return `## §${i + 1} ${c.heading}\n\n${c.summary}${terms}`
  }).join('\n\n')
  return `# 背景\n\n${guide.background}\n\n${chunks}`
}
```

- [ ] **Step 3: Parse guide from markdown body**

Add function:

```ts
export function parseAssistantGuideBody(body: string): ArticleAssistantGuide | null {
  const lines = body.split('\n')
  let background = ''
  let i = 0
  // consume leading heading if present
  if (lines[0]?.startsWith('# ')) {
    i = 1
    while (i < lines.length && lines[i].trim() === '') i++
    const bgLines: string[] = []
    while (i < lines.length && !lines[i].startsWith('## ')) {
      if (lines[i].trim()) bgLines.push(lines[i].trim())
      i++
    }
    background = bgLines.join(' ')
  }

  const chunks: ArticleAssistantChunk[] = []
  while (i < lines.length) {
    const headingMatch = lines[i].match(/^## §\d+\s+(.+)$/)
    if (!headingMatch) { i++; continue }
    const heading = headingMatch[1].trim()
    i++
    while (i < lines.length && lines[i].trim() === '') i++
    const summaryLines: string[] = []
    const terms: ArticleAssistantTerm[] = []
    while (i < lines.length && !lines[i].startsWith('## ')) {
      const line = lines[i]
      const termMatch = line.match(/^\*\*上下文（context））\*\*：(.+?)（(.+?)）—\s*(.+)$/)
      if (termMatch) {
        terms.push({ term: termMatch[1].trim(), translation: termMatch[2].trim(), explanation: termMatch[3].trim() })
      } else if (line.trim()) {
        summaryLines.push(line.trim())
      }
      i++
    }
    chunks.push({ heading, summary: summaryLines.join(' '), terms })
  }

  if (!background && chunks.length === 0) return null
  return { background, chunks }
}
```

- [ ] **Step 4: Register IPC handlers**

Inside `registerArticleAssistantIpc`:

```ts
ipcMain.handle(
  'articleAssistant:writeGuide',
  async (
    _,
    args: { parentPath: string; parentType: 'briefing' | 'anthropic-article'; guide: ArticleAssistantGuide }
  ): Promise<{ filePath: string }> => {
    const guidePath = guidePathFor(args.parentPath)
    assertInsideLibrary(guidePath, cfg.libraryPath)
    const now = new Date().toISOString()
    const fm = {
      title: '导读',
      type: 'article-assistant' as const,
      created: now,
      created_at: now,
      updated_at: now,
      parent_path: args.parentPath,
      parent_type: args.parentType,
      generated_at: now,
      tags: [] as string[],
    }
    const body = serializeGuide(args.guide)
    try {
      fs.mkdirSync(path.dirname(guidePath), { recursive: true })
      fs.writeFileSync(guidePath, serializeFrontmatter('article-assistant', fm, body), 'utf8')
    } catch (err) {
      const parsed = path.parse(args.parentPath)
      dumpRecovery(`${parsed.name}.guide.md`, body)
      throw typedError('SAVE_ERROR', err instanceof Error ? err.message : String(err))
    }
    return { filePath: guidePath }
  }
)

ipcMain.handle(
  'articleAssistant:readGuide',
  async (_, args: { parentPath: string; parentType: 'briefing' | 'anthropic-article' }): Promise<ArticleAssistantGuideFile | null> => {
    const guidePath = guidePathFor(args.parentPath)
    if (!fs.existsSync(guidePath)) return null
    try {
      const { frontmatter, body } = parseFrontmatter(fs.readFileSync(guidePath, 'utf8'), { filename: path.basename(guidePath) })
      const guide = parseAssistantGuideBody(body)
      if (!guide) return null
      return {
        filePath: guidePath,
        guide,
        generatedAt: (frontmatter.generated_at as string | undefined) ?? frontmatter.created,
      }
    } catch {
      return null
    }
  }
)
```

- [ ] **Step 5: Write unit tests for parse/serialize**

Create `tests/article-assistant-guide-ipc.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { parseAssistantGuideBody, serializeGuide } from '../electron/ipc/article-assistant'

describe('parseAssistantGuideBody', () => {
  it('parses background and chunks with terms', () => {
    const body = `# 背景\n\nThis is background.\n\n## §1 Intro\n\nSummary one.\n\n**上下文（context）**：term（翻译）— explanation.`
    const result = parseAssistantGuideBody(body)
    expect(result).not.toBeNull()
    expect(result!.background).toBe('This is background.')
    expect(result!.chunks).toHaveLength(1)
    expect(result!.chunks[0].heading).toBe('Intro')
    expect(result!.chunks[0].terms[0].term).toBe('term')
  })

  it('returns null for empty body', () => {
    expect(parseAssistantGuideBody('')).toBeNull()
  })
})

describe('serializeGuide', () => {
  it('round-trips through parse', () => {
    const guide = {
      background: 'bg',
      chunks: [{ heading: 'H', summary: 'S', terms: [{ term: 'T', translation: 'X', explanation: 'E' }] }],
    }
    const parsed = parseAssistantGuideBody(serializeGuide(guide))
    expect(parsed).toEqual(guide)
  })
})
```

Run:

```bash
npx vitest run tests/article-assistant-guide-ipc.test.ts
```

Expected: pass.

- [ ] **Step 6: Commit**

```bash
git add electron/ipc/article-assistant.ts tests/article-assistant-guide-ipc.test.ts
git commit -m "feat(article-assistant): add guide cache read/write IPC"
```

---

## Task 2: Store guide persistence and auto-generation

**Files:**
- Modify: `src/store/index.ts`
- Test: `tests/store-article-assistant.test.ts` (create)

- [ ] **Step 1: Add width/collapsed actions with debounced persistence**

Add a helper above store:

```ts
let guideWidthSaveTimer: ReturnType<typeof setTimeout> | null = null
function debounceSaveGuideWidth(patch: Partial<StateJson>) {
  if (guideWidthSaveTimer) clearTimeout(guideWidthSaveTimer)
  guideWidthSaveTimer = setTimeout(() => {
    ipc.patchState(patch)
  }, 300)
}
```

Add actions:

```ts
setArticleAssistantGuideWidth: (width) => {
  const clamped = Math.max(200, Math.min(width, 1200))
  set({ articleAssistantGuideWidth: clamped })
  debounceSaveGuideWidth({ articleAssistantGuideWidth: clamped })
},
setArticleAssistantGuideCollapsed: (collapsed) => {
  set({ articleAssistantGuideCollapsed: collapsed })
  debounceSaveGuideWidth({ articleAssistantGuideCollapsed: collapsed })
},
setAssistantActiveChunk: (index) => {
  const s = get().assistantSession
  if (!s) return
  set({ assistantSession: { ...s, activeChunkIndex: index } })
},
```

- [ ] **Step 2: Split guide loading from generation and add persistence**

Replace `loadAssistantGuide` with:

```ts
loadAssistantGuide: async () => {
  const s = get().assistantSession
  if (!s) return
  set({ assistantSession: { ...s, guideLoading: true, guideError: null } })
  try {
    const file = await ipc.articleAssistantReadGuide({ parentPath: s.contextId, parentType: s.contextType })
    const cur = get().assistantSession
    if (!cur || cur.contextId !== s.contextId) return
    if (file?.guide) {
      set({ assistantSession: { ...cur, guide: file.guide, guideLoading: false } })
    } else {
      set({ assistantSession: { ...cur, guideLoading: false } })
    }
  } catch (err) {
    const cur = get().assistantSession
    if (!cur || cur.contextId !== s.contextId) return
    set({ assistantSession: { ...cur, guideLoading: false } })
  }
},
```

Add:

```ts
generateAssistantGuide: async () => {
  const s = get().assistantSession
  if (!s || s.guideLoading || s.guide) return
  set({ assistantSession: { ...s, guideLoading: true, guideError: null } })
  try {
    const guide = await ipc.articleAssistantGenerateGuide({
      articleContent: s.articleContent,
      articleType: s.contextType,
      articleTitle: s.articleTitle,
    })
    const cur = get().assistantSession
    if (!cur || cur.contextId !== s.contextId) return
    set({ assistantSession: { ...cur, guide, guideLoading: false } })
    try {
      await ipc.articleAssistantWriteGuide({ parentPath: s.contextId, parentType: s.contextType, guide })
    } catch (writeErr) {
      get().showToast('导读已生成但保存失败')
    }
  } catch (err) {
    const code: ArticleAssistantErrorCode = (err as Error & { code?: string })?.code === 'GUIDE_JSON_ERROR' ? 'GUIDE_JSON_ERROR'
      : (err as Error & { code?: string })?.code === 'GUIDE_ABORT' ? 'GUIDE_ABORT'
      : 'GUIDE_LLM_ERROR'
    const cur = get().assistantSession
    if (!cur || cur.contextId !== s.contextId) return
    set({ assistantSession: { ...cur, guideLoading: false, guideError: code } })
  }
},
```

Add:

```ts
persistAssistantState: async () => {
  const s = get().assistantSession
  if (!s) return
  if (s.guide) {
    try {
      await ipc.articleAssistantWriteGuide({ parentPath: s.contextId, parentType: s.contextType, guide: s.guide })
    } catch {
      get().showToast('导读保存失败')
    }
  }
  await get().saveAssistantSession()
},
```

- [ ] **Step 3: Update `openAssistantSession` to load from disk and optionally auto-generate**

Change `openAssistantSession` signature to accept `autoGenerateGuide?: boolean`:

```ts
openAssistantSession: (args) => {
  const prev = get().assistantSession
  if (prev && prev.contextId === args.contextId) return
  set({
    assistantSession: {
      contextId: args.contextId,
      contextType: args.contextType,
      articleTitle: args.articleTitle,
      articleContent: args.articleContent,
      guide: null, guideLoading: false, guideError: null,
      messages: [], streaming: false, abortId: '',
      searchLoading: false, searchError: null, chatError: null,
      retryContext: null, pendingSelection: undefined, isOpen: false,
      activeChunkIndex: null,
    },
  })
  get().loadAssistantGuide().then(() => {
    if (args.autoGenerateGuide) {
      const cur = get().assistantSession
      if (cur && cur.contextId === args.contextId && !cur.guide && !cur.guideLoading) {
        get().generateAssistantGuide()
      }
    }
  })
  get().loadAssistantSession()
},
```

Update interface signature accordingly.

- [ ] **Step 4: Update `closeAssistantSession` to call persistence and remove from panel usage**

`closeAssistantSession` should call `get().persistAssistantState()` before setting null.

- [ ] **Step 5: Write store tests**

Create `tests/store-article-assistant.test.ts` that mocks `window.api` and asserts:
- `articleAssistantReadGuide` is called on `openAssistantSession`.
- When `autoGenerateGuide` true and read returns null, `articleAssistantGenerateGuide` and `articleAssistantWriteGuide` are called.
- Width changes are debounced and clamped.

Use a minimal mock of `window.api`. Run:

```bash
npx vitest run tests/store-article-assistant.test.ts
```

Expected: pass.

- [ ] **Step 6: Commit**

```bash
git add src/store/index.ts tests/store-article-assistant.test.ts
git commit -m "feat(article-assistant): store guide persistence and auto-generation"
```

---

## Task 3: Article chunking algorithm

**Files:**
- Create: `src/lib/article-chunks.ts`
- Test: `tests/article-chunks.test.ts`

- [ ] **Step 1: Implement fuzzy heading matching**

```ts
export interface ArticleChunk {
  heading: string
  body: string
  startIndex: number
}

function normalizeHeading(h: string): string {
  return h.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '').trim()
}

export function splitArticleIntoChunks(body: string, headings: string[]): ArticleChunk[] {
  if (!body || headings.length === 0) {
    return [{ heading: '', body: body ?? '', startIndex: 0 }]
  }
  const targets = headings.map(normalizeHeading)
  const chunks: ArticleChunk[] = []
  let currentStart = 0
  let currentHeading = ''

  const lines = body.split('\n')
  let cursor = 0

  for (let li = 0; li < lines.length; li++) {
    const line = lines[li]
    const normalizedLine = normalizeHeading(line)
    const matchIndex = targets.findIndex((t) => t.length > 0 && normalizedLine.includes(t))
    if (matchIndex !== -1) {
      if (cursor > currentStart) {
        chunks.push({ heading: currentHeading, body: body.slice(currentStart, cursor).trim(), startIndex: currentStart })
      }
      currentHeading = headings[matchIndex]
      currentStart = cursor + line.length + 1
    }
    cursor += line.length + 1
  }

  if (currentStart < body.length) {
    chunks.push({ heading: currentHeading, body: body.slice(currentStart).trim(), startIndex: currentStart })
  }

  // If no headings matched, return single chunk
  if (chunks.length === 0) {
    return [{ heading: '', body: body.trim(), startIndex: 0 }]
  }
  return chunks
}
```

- [ ] **Step 2: Write tests**

Create `tests/article-chunks.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { splitArticleIntoChunks } from '../src/lib/article-chunks'

describe('splitArticleIntoChunks', () => {
  it('splits by headings and preserves order', () => {
    const body = '# Title\n\nIntro.\n\n## Section One\n\nBody one.\n\n## Section Two\n\nBody two.'
    const chunks = splitArticleIntoChunks(body, ['Section One', 'Section Two'])
    expect(chunks).toHaveLength(2)
    expect(chunks[0].heading).toBe('Section One')
    expect(chunks[0].body).toContain('Body one.')
    expect(chunks[1].heading).toBe('Section Two')
  })

  it('ignores case and punctuation', () => {
    const body = '## SECTION-ONE!\n\ncontent'
    const chunks = splitArticleIntoChunks(body, ['section one'])
    expect(chunks).toHaveLength(1)
    expect(chunks[0].heading).toBe('section one')
  })

  it('falls back to single chunk when no headings match', () => {
    const body = 'just content'
    const chunks = splitArticleIntoChunks(body, ['missing'])
    expect(chunks).toHaveLength(1)
    expect(chunks[0].heading).toBe('')
  })
})
```

Run:

```bash
npx vitest run tests/article-chunks.test.ts
```

Expected: pass.

- [ ] **Step 3: Commit**

```bash
git add src/lib/article-chunks.ts tests/article-chunks.test.ts
git commit -m "feat(article-assistant): article chunking algorithm"
```

---

## Task 4: Resizable divider component

**Files:**
- Create: `src/components/article-assistant/ArticleDivider.tsx`
- Test: `tests/ArticleDivider.test.tsx` (create)

- [ ] **Step 1: Implement divider**

```tsx
import { useRef } from 'react'

interface Props {
  collapsed: boolean
  onToggleCollapse: () => void
  onResize: (newWidth: number) => void
  theme?: 'academic' | 'newspaper'
}

export function ArticleDivider({ collapsed, onToggleCollapse, onResize, theme = 'academic' }: Props) {
  const isAcademic = theme !== 'newspaper'
  const dragging = useRef<{ startX: number; containerWidth: number; sidebarWidth: number } | null>(null)

  const handlePointerDown = (e: React.PointerEvent) => {
    const target = e.currentTarget
    target.setPointerCapture(e.pointerId)
    const container = target.parentElement
    const containerWidth = container?.getBoundingClientRect().width ?? window.innerWidth
    const sidebar = container?.lastElementChild as HTMLElement | null
    const sidebarWidth = sidebar?.getBoundingClientRect().width ?? 320
    dragging.current = { startX: e.clientX, containerWidth, sidebarWidth }

    const onMove = (ev: PointerEvent) => {
      if (!dragging.current) return
      const dx = ev.clientX - dragging.current.startX
      // dragging left expands article (shrinks sidebar), so subtract dx
      const nextWidth = dragging.current.sidebarWidth - dx
      onResize(nextWidth)
    }

    const onUp = () => {
      target.releasePointerCapture(e.pointerId)
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      dragging.current = null
    }

    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }

  return (
    <div
      data-testid="article-assistant-divider"
      className={`relative shrink-0 w-1.5 cursor-col-resize flex items-center justify-center transition-colors ${
        isAcademic ? 'bg-parchment/10 hover:bg-parchment/20' : 'bg-[#1a1a1a]/10 hover:bg-[#1a1a1a]/20'
      }`}
      onPointerDown={handlePointerDown}
      title={collapsed ? '展开导读' : '向左拖拽加宽文章'}
    >
      <div className={`w-0.5 h-6 rounded-full ${isAcademic ? 'bg-parchment/25' : 'bg-[#1a1a1a]/25'}`} />
      <button
        data-testid="article-assistant-divider-toggle"
        type="button"
        onClick={(e) => {
          e.stopPropagation()
          onToggleCollapse()
        }}
        className={`absolute top-1/2 -translate-y-1/2 ${collapsed ? '-left-6' : '-left-6'} z-10 flex items-center justify-center w-5 h-8 rounded-l border border-r-0 text-[10px] ${
          isAcademic
            ? 'bg-ink/80 border-parchment/20 text-parchment/70 hover:text-parchment'
            : 'bg-white border-[#1a1a1a]/20 text-[#555] hover:text-[#1a1a1a]'
        }`}
        title={collapsed ? '展开导读' : '折叠导读'}
      >
        {collapsed ? '◀' : '▶'}
      </button>
    </div>
  )
}
```

- [ ] **Step 2: Write minimal component test**

Create `tests/ArticleDivider.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ArticleDivider } from '../src/components/article-assistant/ArticleDivider'

describe('ArticleDivider', () => {
  it('calls onToggleCollapse when button clicked', () => {
    const onToggle = vi.fn()
    render(<ArticleDivider collapsed={false} onToggleCollapse={onToggle} onResize={vi.fn()} />)
    fireEvent.click(screen.getByTestId('article-assistant-divider-toggle'))
    expect(onToggle).toHaveBeenCalled()
  })
})
```

Run:

```bash
npx vitest run tests/ArticleDivider.test.tsx
```

Expected: pass.

- [ ] **Step 3: Commit**

```bash
git add src/components/article-assistant/ArticleDivider.tsx tests/ArticleDivider.test.tsx
git commit -m "feat(article-assistant): add resizable divider component"
```

---

## Task 5: ArticleBodyChunks component

**Files:**
- Create: `src/components/article-assistant/ArticleBodyChunks.tsx`
- Test: `tests/ArticleBodyChunks.test.tsx` (create)

- [ ] **Step 1: Implement component**

```tsx
import { useMemo } from 'react'
import { MarkdownRenderer } from '@/components/md/MarkdownRenderer'
import { splitArticleIntoChunks } from '@/lib/article-chunks'
import type { ArticleAssistantChunk } from '@shared/index'
import type { TermDef } from '@/components/md/rehypeTermHighlight'

interface Props {
  content: string
  chunks: ArticleAssistantChunk[]
  fileName: string
  theme?: 'academic' | 'newspaper'
  terms?: TermDef[]
  activeChunkIndex?: number | null
  onChunkEnter?: (index: number) => void
  onChunkLeave?: () => void
}

export function ArticleBodyChunks({ content, chunks, fileName, theme = 'academic', terms, activeChunkIndex, onChunkEnter, onChunkLeave }: Props) {
  const articleChunks = useMemo(() => splitArticleIntoChunks(content, chunks.map((c) => c.heading)), [content, chunks])
  const isAcademic = theme !== 'newspaper'

  if (articleChunks.length === 1 && !articleChunks[0].heading) {
    return (
      <div className="space-y-4">
        <MarkdownRenderer content={articleChunks[0].body} fileName={fileName} hideHeader briefingStyle={theme} terms={terms} />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {articleChunks.map((chunk, i) => {
        const isActive = activeChunkIndex === i
        const borderColor = isAcademic
          ? isActive ? 'border-ember' : 'border-parchment/20'
          : isActive ? 'border-ember' : 'border-[#1a1a1a]/10'
        return (
          <section
            key={i}
            data-testid="article-body-chunk"
            data-chunk-index={i}
            className={`rounded-r-lg border-l-4 pl-4 py-2 transition-colors ${borderColor} ${isActive ? 'bg-ember/5' : ''}`}
            onMouseEnter={() => onChunkEnter?.(i)}
            onMouseLeave={() => onChunkLeave?.()}
          >
            {chunk.heading && (
              <div className={`text-xs font-medium mb-2 ${isAcademic ? 'text-ember' : 'text-ember'}`}>
                §{i + 1} {chunk.heading}
              </div>
            )}
            <div className={isAcademic ? 'text-parchment/90' : 'text-[#1a1a1a]'}>
              <MarkdownRenderer content={chunk.body} fileName={fileName} hideHeader briefingStyle={theme} terms={terms} />
            </div>
          </section>
        )
      })}
    </div>
  )
}
```

- [ ] **Step 2: Write tests**

Create `tests/ArticleBodyChunks.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ArticleBodyChunks } from '../src/components/article-assistant/ArticleBodyChunks'

describe('ArticleBodyChunks', () => {
  it('renders chunks based on headings', () => {
    const content = '## Intro\n\nHello.\n\n## Details\n\nWorld.'
    const chunks = [{ heading: 'Intro', summary: '', terms: [] }, { heading: 'Details', summary: '', terms: [] }]
    render(<ArticleBodyChunks content={content} chunks={chunks} fileName="x.md" />)
    expect(screen.getAllByTestId('article-body-chunk')).toHaveLength(2)
  })
})
```

Run:

```bash
npx vitest run tests/ArticleBodyChunks.test.tsx
```

Expected: pass.

- [ ] **Step 3: Commit**

```bash
git add src/components/article-assistant/ArticleBodyChunks.tsx tests/ArticleBodyChunks.test.tsx
git commit -m "feat(article-assistant): add article body chunking component"
```

---

## Task 6: GuideSidebar refactor

**Files:**
- Modify: `src/components/article-assistant/GuideSidebar.tsx`
- Test: `tests/GuideSidebar.test.tsx` (create)

- [ ] **Step 1: Remove swap button and add chunk hover/active states**

```tsx
import { useStore } from '@/store'

interface Props {
  theme?: 'academic' | 'newspaper'
}

export function GuideSidebar({ theme = 'academic' }: Props) {
  const session = useStore((s) => s.assistantSession)
  const activeChunkIndex = useStore((s) => s.assistantSession?.activeChunkIndex ?? null)
  const setAssistantActiveChunk = useStore((s) => s.setAssistantActiveChunk)
  const isAcademic = theme !== 'newspaper'

  if (!session) return null

  return (
    <div className={`h-full flex flex-col shrink-0 border-l ${isAcademic ? 'border-parchment/10 bg-ink/40' : 'border-[#1a1a1a]/10 bg-[#f5f2ed]'} `}>
      <div className={`px-4 py-3 text-xs uppercase tracking-widest select-none ${isAcademic ? 'text-parchment/60' : 'text-[#6b5d52]'}`}>导读</div>
      {session.guideLoading && (
        <div className={`px-4 text-sm ${isAcademic ? 'text-parchment/50' : 'text-[#6b5d52]'}`}>生成导读中…</div>
      )}
      {session.guideError && !session.guide && (
        <div className="px-4 text-sm text-ember">未能生成导读，可继续阅读原文。</div>
      )}
      {session.guide && (
        <div className="flex-1 overflow-y-auto px-4 pb-4 space-y-4">
          <div className={`rounded p-3 text-sm leading-relaxed ${isAcademic ? 'bg-ink/60 border border-parchment/10 text-parchment/90' : 'bg-white border border-[#1a1a1a]/10 text-[#1a1a1a]'}`}>
            <strong className="text-ember">背景</strong>：{session.guide.background}
          </div>
          {session.guide.chunks.map((chunk, i) => {
            const isActive = activeChunkIndex === i
            return (
              <div
                key={i}
                data-testid="guide-chunk"
                data-chunk-index={i}
                className={`rounded p-3 text-sm cursor-default transition-colors ${
                  isAcademic
                    ? `bg-ink/60 border ${isActive ? 'border-ember' : 'border-parchment/10'}`
                    : `bg-white border ${isActive ? 'border-ember' : 'border-[#1a1a1a]/10'}`
                }`}
                onMouseEnter={() => setAssistantActiveChunk(i)}
                onMouseLeave={() => setAssistantActiveChunk(null)}
              >
                <div className="text-ember font-medium mb-1">§{i + 1} {chunk.heading}</div>
                <div className={`leading-relaxed mb-2 ${isAcademic ? 'text-parchment/80' : 'text-[#555]'}`}>{chunk.summary}</div>
                {chunk.terms.length > 0 && (
                  <div className={`space-y-1.5 mt-2 pt-2 border-t ${isAcademic ? 'border-parchment/10' : 'border-[#1a1a1a]/10'}`}>
                    {chunk.terms.map((t) => (
                      <div key={t.term} className={`text-xs leading-relaxed ${isAcademic ? 'text-parchment/70' : 'text-[#6b5d52]'}`}>
                        <span className="text-ember font-medium">{t.term}</span>
                        <span className="text-parchment/50 mx-1">·</span>
                        <span>{t.translation}</span>
                        {t.explanation && <div className={`mt-0.5 ${isAcademic ? 'text-parchment/50' : 'text-[#999]'}`}>{t.explanation}</div>}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Write test**

Create `tests/GuideSidebar.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { GuideSidebar } from '../src/components/article-assistant/GuideSidebar'

describe('GuideSidebar', () => {
  it('renders without swap button', () => {
    render(<GuideSidebar />)
    expect(screen.queryByTestId('swap-painting-button')).not.toBeInTheDocument()
  })
})
```

Run:

```bash
npx vitest run tests/GuideSidebar.test.tsx
```

Expected: pass.

- [ ] **Step 3: Commit**

```bash
git add src/components/article-assistant/GuideSidebar.tsx tests/GuideSidebar.test.tsx
git commit -m "feat(article-assistant): refactor guide sidebar with chunk hover states"
```

---

## Task 7: ArticleAssistantPanel refactor

**Files:**
- Modify: `src/components/article-assistant/ArticleAssistantPanel.tsx`

- [ ] **Step 1: Add props and read width/collapsed from store**

```tsx
import { useEffect, useRef } from 'react'
import { useStore } from '@/store'
import { GuideSidebar } from './GuideSidebar'
import { ChatWindow } from './ChatWindow'
import { ArticleDivider } from './ArticleDivider'

interface Props {
  articleType: 'briefing' | 'anthropic-article'
  parentPath: string
  articleTitle?: string
  articleContent: string
  autoGenerateGuide?: boolean
  theme?: 'academic' | 'newspaper'
}

export function ArticleAssistantPanel({ articleType, parentPath, articleTitle, articleContent, autoGenerateGuide, theme = 'academic' }: Props) {
  const session = useStore((s) => s.assistantSession)
  const openAssistantSession = useStore((s) => s.openAssistantSession)
  const persistAssistantState = useStore((s) => s.persistAssistantState)
  const toggleAssistantOpen = useStore((s) => s.toggleAssistantOpen)
  const guideWidth = useStore((s) => s.articleAssistantGuideWidth)
  const guideCollapsed = useStore((s) => s.articleAssistantGuideCollapsed)
  const setArticleAssistantGuideWidth = useStore((s) => s.setArticleAssistantGuideWidth)
  const setArticleAssistantGuideCollapsed = useStore((s) => s.setArticleAssistantGuideCollapsed)
  const containerRef = useRef<HTMLDivElement>(null)
  const prevPath = useRef<string | null>(null)

  useEffect(() => {
    if (prevPath.current !== parentPath) {
      const prev = prevPath.current
      prevPath.current = parentPath
      if (prev && session) {
        persistAssistantState()
      }
      openAssistantSession({ contextId: parentPath, contextType: articleType, articleTitle, articleContent, autoGenerateGuide })
    }
    return () => {
      // Save but do NOT clear session, so switching back restores it from memory + disk.
      persistAssistantState()
    }
  }, [parentPath])

  // Text selection listener remains unchanged.
  useEffect(() => {
    const onMouseUp = () => {
      setTimeout(() => {
        const sel = window.getSelection()?.toString().trim()
        if (sel && sel.length > 0) {
          // keep existing setAssistantSelection logic via store action if needed
        }
      }, 0)
    }
    document.addEventListener('mouseup', onMouseUp)
    return () => document.removeEventListener('mouseup', onMouseUp)
  }, [])

  if (!session || session.contextId !== parentPath) return null

  const sidebarWidth = guideCollapsed ? 0 : Math.max(200, Math.min(guideWidth, (containerRef.current?.clientWidth ?? 1000) * 0.45))

  return (
    <div ref={containerRef} className="relative flex h-full shrink-0">
      <ArticleDivider
        collapsed={guideCollapsed}
        onToggleCollapse={() => setArticleAssistantGuideCollapsed(!guideCollapsed)}
        onResize={(width) => {
          const containerWidth = containerRef.current?.clientWidth ?? window.innerWidth
          const maxWidth = containerWidth * 0.45
          if (width < 40 || containerWidth - width < 20) {
            setArticleAssistantGuideCollapsed(true)
          } else {
            setArticleAssistantGuideCollapsed(false)
            setArticleAssistantGuideWidth(Math.min(width, maxWidth))
          }
        }}
        theme={theme}
      />
      <div
        className="h-full overflow-hidden transition-[width] duration-150 ease-out"
        style={{ width: sidebarWidth }}
      >
        <GuideSidebar theme={theme} />
      </div>
      <button
        data-testid="article-assistant-tab"
        onClick={toggleAssistantOpen}
        className="absolute top-24 z-40 w-6 h-28 bg-ink/80 border border-parchment/20 border-r-0 rounded-l flex items-center justify-center hover:bg-ink/90 transition-colors"
        style={{ right: sidebarWidth }}
        title={session.isOpen ? '关闭旁注' : '打开旁注'}
      >
        <span className="text-[10px] tracking-widest text-parchment/70 select-none" style={{ writingMode: 'vertical-rl' }}>
          旁注
        </span>
        {session.pendingSelection && !session.isOpen && <span className="absolute top-1 right-0.5 w-2 h-2 rounded-full bg-ember" />}
      </button>
      <ChatWindow />
    </div>
  )
}
```

Note: the text selection `setAssistantSelection` action still exists in the store; wire it the same as before.

- [ ] **Step 2: Run typecheck and existing tests**

```bash
npx tsc --noEmit
npx vitest run
```

Expected: pass.

- [ ] **Step 3: Commit**

```bash
git add src/components/article-assistant/ArticleAssistantPanel.tsx
git commit -m "feat(article-assistant): refactor panel with persistence, auto-generate, resize"
```

---

## Task 8: AnthropicArticleReader integration

**Files:**
- Modify: `src/components/anthropic/AnthropicArticleReader.tsx`

- [ ] **Step 1: Move swap button into article body top-right and use ArticleBodyChunks**

Add imports:

```tsx
import { SwapPaintingButton } from '@/components/SwapPaintingButton'
import { ArticleBodyChunks } from '@/components/article-assistant/ArticleBodyChunks'
import type { ArticleAssistantChunk } from '@shared/index'
import type { TermDef } from '@/components/md/rehypeTermHighlight'
```

Inside the inner scroll container (`<div className="w-[90%]...">`), add swap button:

```tsx
<div className="absolute top-4 right-4 z-10">
  <SwapPaintingButton surface="briefing" data-testid="anthropic-swap-painting-button" className="text-parchment/70 hover:text-parchment" />
</div>
```

Replace the existing `<article>` block with:

```tsx
<article className={`prose max-w-none ${isAcademic ? 'prose-invert' : ''} briefing-body-${theme}`}>
  <ArticleBodyChunks
    content={body}
    chunks={terms ? [] : []} // use actual guide chunks below
    fileName={frontmatter.title ?? 'article.md'}
    theme={theme}
    terms={terms}
  />
</article>
```

Actually `terms` is currently derived from `assistantSession?.guide?.chunks.flatMap(...)`. We need the actual chunks too. Read guide chunks from store:

```tsx
const guideChunks = useStore((s) => s.assistantSession?.guide?.chunks ?? [])
const terms = useStore((s) => s.assistantSession?.guide?.chunks.flatMap((c) => c.terms) ?? [])
```

Then:

```tsx
<ArticleBodyChunks
  content={body}
  chunks={guideChunks}
  fileName={frontmatter.title ?? 'article.md'}
  theme={theme}
  terms={terms}
/>
```

- [ ] **Step 2: Pass theme to ArticleAssistantPanel**

Change:

```tsx
<ArticleAssistantPanel
  articleType="anthropic-article"
  parentPath={filePath}
  articleTitle={frontmatter.title}
  articleContent={body}
  theme={theme}
/>
```

- [ ] **Step 3: Verify and commit**

```bash
npx tsc --noEmit
```

```bash
git add src/components/anthropic/AnthropicArticleReader.tsx
git commit -m "feat(article-assistant): integrate chunks and swap button in anthropic reader"
```

---

## Task 9: Briefing integration

**Files:**
- Modify: `src/pages/Briefing.tsx`
- Modify: `src/components/briefing/AcademicBriefingLayout.tsx`
- Modify: `src/components/briefing/NewspaperBriefingLayout.tsx`

- [ ] **Step 1: Pass swap button into layouts and render ArticleBodyChunks**

For both layouts, add props `swapButton?: React.ReactNode` and `chunks: ArticleAssistantChunk[]` and `terms?: TermDef[]`. Replace the per-section loop with `ArticleBodyChunks` using `result.content` as content.

Example for `AcademicBriefingLayout.tsx`:

```tsx
import { ArticleBodyChunks } from '@/components/article-assistant/ArticleBodyChunks'
import type { ArticleAssistantChunk } from '@shared/index'

interface Props {
  result: BriefingResult
  parsed: ParsedBriefing
  displayDate: string
  terms?: TermDef[]
  chunks?: ArticleAssistantChunk[]
  swapButton?: React.ReactNode
}

// inside render:
<div className="w-[90%] max-w-[1250px] min-w-[520px] mx-auto px-4 py-6 relative">
  {swapButton && <div className="absolute top-4 right-4 z-10">{swapButton}</div>}
  <header className="text-center mb-8">...</header>
  <div className="space-y-6">
    <ArticleBodyChunks
      content={result.content}
      chunks={chunks ?? []}
      fileName="briefing.md"
      theme="academic"
      terms={terms}
    />
  </div>
  {/* sources unchanged */}
</div>
```

Do the same for `NewspaperBriefingLayout.tsx` with `theme="newspaper"`.

- [ ] **Step 2: Update Briefing.tsx to pass guide chunks and auto-generate**

In `Briefing.tsx`:

```tsx
const guideChunks = useStore((s) => s.assistantSession?.guide?.chunks ?? [])
```

Remove the absolute `SwapPaintingButton` at `top-24 right-4`.

When rendering layouts:

```tsx
{isAcademic ? (
  <AcademicBriefingLayout
    result={result}
    parsed={parsed}
    displayDate={displayDate}
    terms={terms}
    chunks={guideChunks}
    swapButton={
      <SwapPaintingButton
        surface="briefing"
        data-testid="briefing-swap-painting-button"
        className="text-parchment/70 hover:text-parchment"
      />
    }
  />
) : (
  <NewspaperBriefingLayout
    result={result}
    parsed={parsed}
    displayDate={displayDate}
    terms={terms}
    chunks={guideChunks}
    swapButton={
      <SwapPaintingButton
        surface="briefing"
        data-testid="briefing-swap-painting-button"
        className="text-[#555] hover:text-[#1a1a1a]"
      />
    }
  />
)}
```

And add `autoGenerateGuide theme` to `ArticleAssistantPanel`:

```tsx
<ArticleAssistantPanel
  articleType="briefing"
  parentPath={result.filePath}
  articleTitle={result.title}
  articleContent={result.content ?? ''}
  autoGenerateGuide
  theme={theme}
/>
```

- [ ] **Step 3: Verify typecheck and tests**

```bash
npx tsc --noEmit
npx vitest run
```

Expected: pass.

- [ ] **Step 4: Commit**

```bash
git add src/pages/Briefing.tsx src/components/briefing/AcademicBriefingLayout.tsx src/components/briefing/NewspaperBriefingLayout.tsx
git commit -m "feat(article-assistant): integrate chunks, swap button, and auto-generate in briefing"
```

---

## Task 10: Update selectors and add E2E coverage

**Files:**
- Modify: `e2e/helpers/selectors.ts`
- Create: `e2e/specs/article-assistant-guide.spec.ts`
- Create: `e2e/pages/ArticleAssistantPage.ts`

- [ ] **Step 1: Add selectors**

In `e2e/helpers/selectors.ts` under `articleAssistant`:

```ts
articleAssistant: {
  tab: '[data-testid="article-assistant-tab"]',
  chatWindow: '[data-testid="article-assistant-chat-window"]',
  input: '[data-testid="article-assistant-input"]',
  searchBtn: '[data-testid="article-assistant-search-btn"]',
  sendBtn: '[data-testid="article-assistant-send-btn"]',
  stopBtn: '[data-testid="article-assistant-stop-btn"]',
  divider: '[data-testid="article-assistant-divider"]',
  dividerToggle: '[data-testid="article-assistant-divider-toggle"]',
  guideChunk: '[data-testid="guide-chunk"]',
  bodyChunk: '[data-testid="article-body-chunk"]',
  swapPaintingButton: '[data-testid="briefing-swap-painting-button"]',
  anthropicSwapPaintingButton: '[data-testid="anthropic-swap-painting-button"]',
},
```

- [ ] **Step 2: Create page object**

Create `e2e/pages/ArticleAssistantPage.ts` with methods: `waitForGuideLoaded`, `collapseGuide`, `expandGuide`, `dragDividerTo(width)`, `expectBodyChunks(count)`, `expectGuideChunks(count)`.

- [ ] **Step 3: Create E2E spec**

Create `e2e/specs/article-assistant-guide.spec.ts`:

```ts
import { test, expect } from '@playwright/test'
import { SELECTORS } from '../helpers/selectors'
import { launchApp } from '../fixtures/electron'
import { seedStateJson, createTestLibrary, cleanupTestLibrary, createTestConfigDir, cleanupTestConfigDir } from '../helpers/test-library'
import { ArticleAssistantPage } from '../pages/ArticleAssistantPage'

test.describe('article assistant guide', () => {
  let app, configDir, libPath

  test.beforeEach(async () => {
    libPath = createTestLibrary()
    configDir = createTestConfigDir()
    seedStateJson(configDir, { briefingSource: 'digest' })
    app = await launchApp({ configDir, libraryPath: libPath })
  })

  test.afterEach(async () => {
    await app.close()
    await cleanupTestConfigDir(configDir)
    await cleanupTestLibrary(libPath)
  })

  test('guide persists when switching articles', async () => {
    // navigate to briefing, generate, switch away, switch back
  })

  test('dragging divider collapses and expands guide', async () => {
    // use page object
  })
})
```

For exact E2E steps, use the page object and store-backed guide checks. Since guide generation goes through the E2E mock in `articleAssistant:generateGuide`, it is deterministic.

- [ ] **Step 4: Run E2E**

```bash
npm run test:e2e -- e2e/specs/article-assistant-guide.spec.ts
```

Expected: pass.

- [ ] **Step 5: Commit**

```bash
git add e2e/helpers/selectors.ts e2e/pages/ArticleAssistantPage.ts e2e/specs/article-assistant-guide.spec.ts
git commit -m "test(article-assistant): add E2E coverage for guide persistence and resizer"
```

---

## Task 11: Final verification

- [ ] **Step 1: Run full test suite**

```bash
npm run test
```

Expected: all unit tests pass.

- [ ] **Step 2: Run typecheck**

```bash
npx tsc --noEmit
```

Expected: pass.

- [ ] **Step 3: Run dev smoke test**

Before running dev, ensure `npm run dev` starts cleanly (see pending dev-hang fix). Then:

```bash
npm run dev
```

Manually verify:
1. Open a briefing; guide sidebar appears and auto-generates.
2. Switch articles and back; previous guide is restored.
3. Drag divider left/right; width changes; drag to far right collapses; expand button restores width.
4. Swap painting button only appears in article body top-right.
5. Hovering guide chunk highlights corresponding body chunk.

- [ ] **Step 4: Final commit or summary**

```bash
git log --oneline -10
```

---

## Acceptance checklist

- [ ] 切换文章再切回，已生成导读从 `.guide.md` 恢复，不重新调用 LLM。
- [ ] AI 日报首次生成/打开后，无缓存时自动调用 `generateGuide`，生成后写入同目录 `.guide.md`。
- [ ] 左侧正文按右侧导读 chunk heading 分段，块与块之间左边框颜色区分当前/非当前。
- [ ] 换画按钮仅保留在正文区域右上角；导读左上角无换画按钮。
- [ ] 文章区与导读区间 6px 拖拽条可 resize；拖至最右侧自动折叠；点击展开按钮恢复上次宽度。
- [ ] 导读宽度与折叠状态持久化到 `state.json`，默认值 320px / false。
- [ ] 新增 IPC 四层同步（types / handler / preload / facade / store）。
- [ ] 新增持久化字段有默认值并同步到 `BASE_STATE`。
- [ ] 单元测试覆盖 guide 解析/序列化、正文分块、store 行为；E2E 覆盖持久化、resize、折叠。
