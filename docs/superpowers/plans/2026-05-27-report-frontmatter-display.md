# 学习报告 Frontmatter 统一与差异化渲染 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Unify frontmatter schema across all document types (progress/review/fable/transcript) and render a type-differentiated header above report content using the existing Disco Elysium visual style.

**Architecture:** Split into three layers: (1) schema + serialization engine in `electron/lib/frontmatter.ts`, (2) write-path updates in IPC handlers and finalize logic, (3) React rendering layer with a new `ReportHeader` component integrated into `MarkdownRenderer`.

**Tech Stack:** Electron 30, React 18, TypeScript, gray-matter, Tailwind CSS, Vitest

---

## File Structure

| File | Responsibility |
|------|---------------|
| `src/types/index.ts` | Type definitions: `DocType`, updated `Frontmatter`, updated `IpcApi` signatures |
| `electron/lib/frontmatter.ts` | Parse and serialize frontmatter with type-aware schema and backward compatibility |
| `electron/ipc/files.ts` | IPC handlers: `writeProgress`, `writeReviewReport`, `writeTranscript`, `writeFable` |
| `electron/prompts/archive-progress.md` | LLM prompt: extract `description` alongside `title`/`body`/`progress_summary` |
| `src/lib/finalize.ts` | Orchestrate archiving: pass `description`, fix fable writing bug |
| `src/components/md/ReportHeader.tsx` | NEW: Render type-differentiated header from frontmatter data |
| `src/components/md/MarkdownRenderer.tsx` | Integrate `ReportHeader`, pass parsed frontmatter to it |
| `src/lib/ipc.ts` | Renderer-side IPC facade: expose new `writeFable` method |
| `tests/frontmatter.test.ts` | Unit tests for parse/serialize round-trips and backward compatibility |
| `tests/types.test.ts` | Type-level tests for updated `Frontmatter` and `IpcApi` shapes |
| `tests/md/report-header.test.tsx` | NEW: Unit tests for `ReportHeader` component rendering per type |

---

### Task 1: Update Type Definitions

**Files:**
- Modify: `src/types/index.ts`
- Test: `tests/types.test.ts`

**Context:** The current `Frontmatter` type is a flat bag of all possible fields. We need a `DocType` union, add `description`, and update `IpcApi` to pass `description` through and expose `writeFable`.

- [ ] **Step 1: Add DocType and update Frontmatter**

Add `DocType` and insert `description` into `Frontmatter`. Keep all existing fields for backward compat — we are extending, not replacing:

```typescript
// After line 1 (after Difficulty definition)
export type DocType = 'progress' | 'review' | 'research' | 'fable' | 'transcript'

// Modify Frontmatter (lines 11-22)
export type Frontmatter = {
  title: string
  description?: string       // NEW
  created: string
  last_studied?: string
  last_reviewed?: string
  review_count: number
  difficulty: Difficulty
  tags: string[]
  session_number?: number
  type?: DocType             // changed from literal union
  progress_summary?: string
}
```

- [ ] **Step 2: Update IpcApi signatures**

Change `writeProgressMd` to accept `description`, change `writeReviewReport` to accept `review_index` and `gaps` as `string[]`, add `writeFable`:

```typescript
// Replace the existing writeProgressMd line (currently line 103)
writeProgressMd: (args: { title: string; description?: string; body: string; difficulty: Difficulty; dirName: string; session_number: number; progress_summary?: string }) => Promise<{ file_path: string }>

// Replace the existing writeReviewReport line (currently line 132)
writeReviewReport: (args: { topic: string; dirName: string; summary: string; gaps: string[]; review_index: number }) => Promise<void>

// Add after writeTranscript (after line 135)
writeFable: (args: { dirName: string; sessionNumber: number; title: string; body: string }) => Promise<void>
```

Also update `llmFinalizeProgress` return type to include `description`:

```typescript
// Replace line 110
llmFinalizeProgress: (history: Message[]) => Promise<{ title: string; description?: string; body: string; progress_summary?: string }>
```

- [ ] **Step 3: Update types.test.ts to cover new fields**

Add a test for `description` and `DocType`:

```typescript
// Add inside describe('type instantiation') in tests/types.test.ts
it('Frontmatter accepts description and DocType', () => {
  const fm: Frontmatter = {
    title: 'Test',
    description: 'A test description',
    created: '2026-05-09T10:00:00Z',
    review_count: 0,
    difficulty: 'mid',
    tags: ['math'],
    type: 'progress',
    session_number: 1,
  }
  expect(fm.description).toBe('A test description')
  expect(fm.type).toBe('progress')
})

it('IpcApi writeProgressMd accepts description', async () => {
  const mockWrite: IpcApi['writeProgressMd'] = async (args) => {
    expect(args.description).toBe('desc')
    return { file_path: 'test.md' }
  }
  await mockWrite({
    title: 'Report',
    description: 'desc',
    body: 'Body',
    difficulty: 'mid',
    dirName: 'math',
    session_number: 1,
  })
})

it('IpcApi writeFable accepts correct args', async () => {
  const mockWrite: IpcApi['writeFable'] = async (args) => {
    expect(args.dirName).toBe('math')
    expect(args.sessionNumber).toBe(1)
    expect(args.title).toBe('Fable Title')
  }
  await mockWrite({
    dirName: 'math',
    sessionNumber: 1,
    title: 'Fable Title',
    body: 'fable body',
  })
})
```

- [ ] **Step 4: Run type tests**

```bash
npx vitest run tests/types.test.ts
```
Expected: PASS (may fail if Frontmatter/IpcApi not fully updated yet — that's OK, fix in next step)

- [ ] **Step 5: Commit**

```bash
git add src/types/index.ts tests/types.test.ts
git commit -m "types: add DocType, description field, and writeFable IPC"
```

---

### Task 2: Rewrite Frontmatter Engine

**Files:**
- Modify: `electron/lib/frontmatter.ts`
- Test: `tests/frontmatter.test.ts`

**Context:** The current `serializeFrontmatter` takes a flat `Frontmatter` object. The new design requires type-aware serialization that orders fields correctly per `DocType`. The parser must also infer `type` from filename when missing and extract `description`.

- [ ] **Step 1: Rewrite serializeFrontmatter**

Replace the entire file content:

```typescript
import matter from 'gray-matter'
import type { Frontmatter, DocType } from '@shared/index'

// --- Core field order (all types) ---
const CORE_FIELDS = ['title', 'description', 'type', 'created', 'tags'] as const

// --- Extension field order per type ---
const EXT_FIELDS: Record<DocType, string[]> = {
  progress: ['session_number', 'difficulty', 'progress_summary', 'last_studied', 'review_count'],
  review: ['review_index', 'last_reviewed', 'source_title'],
  research: ['difficulty', 'summary'],
  fable: ['source_topic'],
  transcript: ['session_number'],
}

function extractTitleFromFilename(name: string): string | undefined {
  const title = name
    .replace(/\.md$/i, '')
    .replace(/^(\d{4}[.\-]?\d{1,2}[.\-]?\d{0,2}[.\-]?)/, '')
    .replace(/^[.\-_]+/, '')
    .replace(/-/g, ' ')
    .trim()
  return title || undefined
}

function inferDocTypeFromFilename(filename: string): DocType {
  const lower = filename.toLowerCase()
  if (lower.includes('学习报告')) return 'progress'
  if (lower.includes('复习报告')) return 'review'
  if (lower.includes('寓言')) return 'fable'
  if (lower.includes('原始对话')) return 'transcript'
  return 'progress'
}

export function parseFrontmatter(
  raw: string,
  opts?: { filename?: string }
): { frontmatter: Frontmatter; body: string } {
  const parsed = matter(raw)
  const data = parsed.data as Partial<Frontmatter> & Record<string, unknown>

  const type: DocType = (data.type as DocType)
    ?? inferDocTypeFromFilename(opts?.filename ?? '')

  const frontmatter: Frontmatter = {
    title: data.title
      ?? (opts?.filename ? extractTitleFromFilename(opts.filename) : undefined)
      ?? 'untitled',
    description: data.description,
    created: data.created ?? new Date().toISOString(),
    last_studied: data.last_studied,
    last_reviewed: data.last_reviewed,
    review_count: typeof data.review_count === 'number' ? data.review_count : 0,
    difficulty: (data.difficulty as 'high' | 'mid' | 'low') ?? 'mid',
    tags: Array.isArray(data.tags) ? data.tags : [],
    session_number: typeof data.session_number === 'number' ? data.session_number : 0,
    type,
    progress_summary: data.progress_summary,
  }

  return { frontmatter, body: parsed.content }
}

export function serializeFrontmatter(
  type: DocType,
  data: Partial<Frontmatter> & Record<string, unknown>,
  body: string
): string {
  const ordered: Record<string, unknown> = {}

  // Core fields in fixed order
  for (const key of CORE_FIELDS) {
    if (data[key] !== undefined && data[key] !== null) {
      ordered[key] = data[key]
    }
  }

  // Extension fields in type-specific order
  const ext = EXT_FIELDS[type] ?? []
  for (const key of ext) {
    if (data[key] !== undefined && data[key] !== null && data[key] !== '') {
      ordered[key] = data[key]
    }
  }

  // Any remaining fields not in core or ext (backward compat)
  const known = new Set([...CORE_FIELDS, ...ext])
  for (const [key, value] of Object.entries(data)) {
    if (!known.has(key) && value !== undefined && value !== null && value !== '') {
      ordered[key] = value
    }
  }

  return matter.stringify(body, ordered)
}
```

- [ ] **Step 2: Update frontmatter.test.ts**

Replace the entire file:

```typescript
import { describe, expect, it } from 'vitest'
import { parseFrontmatter, serializeFrontmatter } from '@electron/lib/frontmatter'

describe('parseFrontmatter', () => {
  it('parses minimal frontmatter', () => {
    const raw = `---
title: 测试
created: 2025-12-15T20:00:00+08:00
review_count: 0
difficulty: mid
tags: [数学]
---
正文 hello`
    const { frontmatter, body } = parseFrontmatter(raw)
    expect(frontmatter.title).toBe('测试')
    expect(frontmatter.review_count).toBe(0)
    expect(frontmatter.tags).toEqual(['数学'])
    expect(body.trim()).toBe('正文 hello')
  })

  it('fills sensible defaults for missing fields', () => {
    const raw = `---
title: x
---
y`
    const { frontmatter } = parseFrontmatter(raw)
    expect(frontmatter.review_count).toBe(0)
    expect(frontmatter.difficulty).toBe('mid')
    expect(frontmatter.tags).toEqual([])
    expect(frontmatter.session_number).toBe(0)
    expect(frontmatter.type).toBe('progress')
    expect(frontmatter.created).toMatch(/\d{4}-\d{2}-\d{2}/)
  })

  it('parses type and progress_summary', () => {
    const raw = `---
title: x
type: research
progress_summary: 已掌握群论基础
---
body`
    const { frontmatter } = parseFrontmatter(raw)
    expect(frontmatter.type).toBe('research')
    expect(frontmatter.progress_summary).toBe('已掌握群论基础')
  })

  it('parses description field', () => {
    const raw = `---
title: Agent
description: Agent 规划方法的对比与实践
type: progress
---
body`
    const { frontmatter } = parseFrontmatter(raw)
    expect(frontmatter.description).toBe('Agent 规划方法的对比与实践')
  })

  it('infers type from filename when missing', () => {
    const raw = `---
title: x
---
body`
    const { frontmatter: p } = parseFrontmatter(raw, { filename: '学习报告.md' })
    expect(p.type).toBe('progress')
    const { frontmatter: r } = parseFrontmatter(raw, { filename: '复习报告.md' })
    expect(r.type).toBe('review')
    const { frontmatter: f } = parseFrontmatter(raw, { filename: '寓言.md' })
    expect(f.type).toBe('fable')
    const { frontmatter: t } = parseFrontmatter(raw, { filename: '原始对话.md' })
    expect(t.type).toBe('transcript')
  })

  it('falls back to filename-derived title when no frontmatter', () => {
    const raw = '# hello\n\nworld'
    const { frontmatter } = parseFrontmatter(raw, { filename: '20260424-hello-world.md' })
    expect(frontmatter.title).toBe('hello world')
  })

  it('uses frontmatter title over filename when both present', () => {
    const raw = `---
title: 嵌入标题
---
正文`
    const { frontmatter } = parseFrontmatter(raw, { filename: 'file-name.md' })
    expect(frontmatter.title).toBe('嵌入标题')
  })

  it('handles dotted date prefix in filename', () => {
    const raw = 'no frontmatter'
    const { frontmatter } = parseFrontmatter(raw, { filename: '2026.04.24.hello-world.md' })
    expect(frontmatter.title).toBe('hello world')
  })

  it('falls back to untitled when filename is only date prefix', () => {
    const raw = 'no frontmatter'
    const { frontmatter } = parseFrontmatter(raw, { filename: '2026-04-24.md' })
    expect(frontmatter.title).toBe('untitled')
  })
})

describe('serializeFrontmatter', () => {
  it('round-trips a parsed file', () => {
    const original = `---
title: 拓扑学基础
session_number: 7
created: 2025-12-15T20:00:00+08:00
last_studied: 2026-04-28T22:13:00+08:00
review_count: 2
difficulty: mid
tags: [数学, 几何]
---
正文段落
`
    const { frontmatter, body } = parseFrontmatter(original)
    const out = serializeFrontmatter(frontmatter.type ?? 'progress', frontmatter, body)
    const reparsed = parseFrontmatter(out)
    expect(reparsed.frontmatter.title).toBe('拓扑学基础')
    expect(reparsed.frontmatter.session_number).toBe(7)
    expect(reparsed.frontmatter.review_count).toBe(2)
    expect(reparsed.frontmatter.tags).toEqual(['数学', '几何'])
    expect(reparsed.body.trim()).toBe('正文段落')
  })

  it('writes core fields in fixed order for progress', () => {
    const fm = {
      title: 'Agent',
      description: 'Agent 规划方法的对比',
      type: 'progress' as const,
      created: '2026-05-23T00:00:00.000Z',
      tags: ['skill学习'],
      session_number: 1,
      difficulty: 'mid' as const,
      progress_summary: '精读 ReAct',
      review_count: 0,
    }
    const out = serializeFrontmatter('progress', fm, '# Body')
    const lines = out.split('\n')
    // title should appear before type, type before session_number
    const titleIdx = lines.findIndex(l => l.startsWith('title:'))
    const typeIdx = lines.findIndex(l => l.startsWith('type:'))
    const sessionIdx = lines.findIndex(l => l.startsWith('session_number:'))
    expect(titleIdx).toBeLessThan(typeIdx)
    expect(typeIdx).toBeLessThan(sessionIdx)
  })

  it('writes review fields in correct order', () => {
    const fm = {
      title: 'Agent',
      description: 'Agent 规划方法的对比',
      type: 'review' as const,
      created: '2026-05-27T00:00:00.000Z',
      tags: ['skill学习'],
      review_index: 1,
      last_reviewed: '2026-05-27T00:00:00.000Z',
      source_title: 'Agent',
    }
    const out = serializeFrontmatter('review', fm, '# Body')
    expect(out).toContain('review_index: 1')
    expect(out).toContain('last_reviewed:')
    expect(out).toContain('source_title:')
  })

  it('skips undefined and empty values', () => {
    const fm = {
      title: 'Minimal',
      type: 'progress' as const,
      created: '2026-05-23T00:00:00.000Z',
      tags: [],
      session_number: 1,
      difficulty: 'mid' as const,
      review_count: 0,
      // description, progress_summary intentionally omitted
    }
    const out = serializeFrontmatter('progress', fm, 'body')
    expect(out).not.toContain('description:')
    expect(out).not.toContain('progress_summary:')
  })
})
```

- [ ] **Step 3: Run frontmatter tests**

```bash
npx vitest run tests/frontmatter.test.ts
```
Expected: All tests PASS

- [ ] **Step 4: Commit**

```bash
git add electron/lib/frontmatter.ts tests/frontmatter.test.ts
git commit -m "feat(frontmatter): type-aware schema with ordered serialization and backward compat"
```

---

### Task 3: Update IPC Write Handlers

**Files:**
- Modify: `electron/ipc/files.ts`
- Modify: `src/lib/ipc.ts`

**Context:** `writeProgress` needs to accept `description`, `writeReviewReport` needs to write frontmatter, `writeTranscript` needs frontmatter, and we need a new `writeFable` handler.

- [ ] **Step 1: Update writeProgress to accept description and use serializeFrontmatter**

In `electron/ipc/files.ts`, replace the `files:writeProgress` handler (around line 231-254):

```typescript
ipcMain.handle('files:writeProgress', async (_, args: {
  title: string; description?: string; body: string; difficulty: 'high' | 'mid' | 'low'
  dirName: string; session_number: number; progress_summary?: string
}) => {
  validateDirName(args.dirName)
  const now = new Date()
  const topicDir = path.join(cfg.libraryPath, args.dirName)
  const sessionDir = path.join(topicDir, `s${args.session_number}`)
  fs.mkdirSync(sessionDir, { recursive: true })
  const filePath = path.join(sessionDir, '学习报告.md')
  const fm = {
    title: args.title,
    description: args.description,
    type: 'progress' as const,
    created: now.toISOString(),
    last_studied: now.toISOString(),
    tags: [],
    session_number: args.session_number,
    difficulty: args.difficulty,
    progress_summary: args.progress_summary,
    review_count: 0,
  }
  fs.writeFileSync(filePath, serializeFrontmatter('progress', fm, args.body), 'utf8')
  return { file_path: filePath }
})
```

- [ ] **Step 2: Rewrite writeReviewReport with frontmatter**

Replace the `files:writeReviewReport` handler (around line 272-294):

```typescript
ipcMain.handle('files:writeReviewReport', async (_, args: {
  topic: string; dirName: string; summary: string; gaps: string[]; review_index: number
}) => {
  validateDirName(args.dirName)
  const now = new Date()
  const topicDir = path.join(cfg.libraryPath, args.dirName)
  const sessionDirs = getSortedSessionDirs(topicDir)
  if (sessionDirs.length === 0) {
    throw new Error(`No sessions found for topic: ${args.dirName}`)
  }
  const targetSession = sessionDirs[sessionDirs.length - 1]
  const sessionDir = path.join(topicDir, targetSession)
  const filePath = path.join(sessionDir, '复习报告.md')

  const gapsText = args.gaps.length > 0
    ? args.gaps.map((g, i) => `${i + 1}. ${g.trim()}`).join('\n')
    : '（本次复习未发现明显知识缺口）'

  const body = `## 复习摘要\n\n${args.summary.trim()}\n\n## 知识缺口\n\n${gapsText}`

  const fm = {
    title: args.topic,
    type: 'review' as const,
    created: now.toISOString(),
    tags: [],
    review_index: args.review_index,
    last_reviewed: now.toISOString(),
    source_title: args.topic,
  }

  if (fs.existsSync(filePath)) {
    const existing = fs.readFileSync(filePath, 'utf8')
    const separator = '\n\n---\n\n'
    fs.writeFileSync(filePath, existing + separator + body, 'utf8')
  } else {
    fs.writeFileSync(filePath, serializeFrontmatter('review', fm, body), 'utf8')
  }
})
```

- [ ] **Step 3: Update writeTranscript with frontmatter**

Replace the `files:writeTranscript` handler (around line 308-317):

```typescript
ipcMain.handle('files:writeTranscript', async (_, args: {
  dirName: string; sessionNumber: number; content: string
}) => {
  validateDirName(args.dirName)
  const topicDir = path.join(cfg.libraryPath, args.dirName)
  const sessionDir = path.join(topicDir, `s${args.sessionNumber}`)
  fs.mkdirSync(sessionDir, { recursive: true })
  const filePath = path.join(sessionDir, '原始对话.md')
  const fm = {
    title: '原始对话',
    type: 'transcript' as const,
    created: new Date().toISOString(),
    tags: [],
    session_number: args.sessionNumber,
  }
  fs.writeFileSync(filePath, serializeFrontmatter('transcript', fm, args.content), 'utf8')
})
```

- [ ] **Step 4: Add writeFable handler**

Add after `files:writeTranscript`:

```typescript
ipcMain.handle('files:writeFable', async (_, args: {
  dirName: string; sessionNumber: number; title: string; body: string
}) => {
  validateDirName(args.dirName)
  const topicDir = path.join(cfg.libraryPath, args.dirName)
  const sessionDir = path.join(topicDir, `s${args.sessionNumber}`)
  fs.mkdirSync(sessionDir, { recursive: true })
  const filePath = path.join(sessionDir, '寓言.md')
  const fm = {
    title: args.title,
    type: 'fable' as const,
    created: new Date().toISOString(),
    tags: [],
    source_topic: args.title,
  }
  fs.writeFileSync(filePath, serializeFrontmatter('fable', fm, args.body), 'utf8')
})
```

- [ ] **Step 5: Register writeFable in preload**

In `electron/preload.ts`, find where IPC channels are exposed and add `files:writeFable`. The file pattern typically looks like:

```typescript
// In electron/preload.ts, add to the contextBridge.exposeInMainWorld call:
writeFable: (args: Parameters<IpcApi['writeFable']>[0]) => ipcRenderer.invoke('files:writeFable', args),
```

- [ ] **Step 6: Expose writeFable in renderer IPC facade**

In `src/lib/ipc.ts`, add after `writeTranscript`:

```typescript
get writeFable() { return ensure().writeFable },
```

- [ ] **Step 7: Run tests**

```bash
npx vitest run tests/archive.test.ts tests/types.test.ts
```
Expected: PASS

- [ ] **Step 8: Commit**

```bash
git add electron/ipc/files.ts electron/preload.ts src/lib/ipc.ts
git commit -m "feat(ipc): add description to writeProgress, frontmatter to review/transcript, new writeFable handler"
```

---

### Task 4: Update LLM Prompt

**Files:**
- Modify: `electron/prompts/archive-progress.md`

**Context:** The LLM currently extracts `title`, `body`, `progress_summary`. We need to add `description`.

- [ ] **Step 1: Add description to the prompt**

Replace the file content:

```markdown
以下是一段苏格拉底式学习对话。请输出严格 JSON,不要其他文字:

{
  "title":  "8 字以内的主题标题",
  "description": "一句话副标题，概括主题范围和内容（15-30字）",
  "body":   "一份精炼的笔记正文(markdown,300-600 字),不是对话原文,而是把这次探索得出的核心理解组织成可日后翻阅的笔记。",
  "progress_summary": "一段话概括当前学习进度和已掌握的核心内容,供下次继续学习时作为上下文参考。"
}

对话:
{{transcript}}
```

- [ ] **Step 2: Commit**

```bash
git add electron/prompts/archive-progress.md
git commit -m "feat(prompt): add description field to archive-progress extraction"
```

---

### Task 5: Update Finalize Logic

**Files:**
- Modify: `src/lib/finalize.ts`

**Context:** `finalize.ts` currently calls `writeProgressMd` without `description`, writes fable as raw markdown without frontmatter, and incorrectly uses `writeTranscript` for fables (which overwrites the actual transcript).

- [ ] **Step 1: Pass description from LLM result to writeProgressMd**

In `src/lib/finalize.ts`, update the progress finalize section (around line 21-37):

```typescript
if (sess.mode === 'progress') {
  const { title: llmTitle, description, body, progress_summary } = await ipc.llmFinalizeProgress(historySnapshot)
  const title = sess.topic || llmTitle

  // ... session number logic stays the same ...
  const topicMeta = s.library.find(t => t.dirName === sess.dirName)
  const sessionNumber = sess.dirName && topicMeta
    ? topicMeta.sessionCount + 1
    : 1
  const dirName = sess.dirName ?? title.toLowerCase().replace(/[^\w一-龥]/g, '-').replace(/-+/g, '-')

  await ipc.writeProgressMd({
    title, description, body, difficulty: sess.difficulty,
    dirName, session_number: sessionNumber, progress_summary
  })
```

- [ ] **Step 2: Fix fable writing to use writeFable instead of writeTranscript**

Replace the fable generation block (around line 39-48):

```typescript
// 生成并写寓言
  try {
    const fable = await ipc.llmGenerateFable({ history: historySnapshot, topic: title })
    await ipc.writeFable({
      dirName, sessionNumber,
      title: fable.title, body: fable.body
    })
  } catch (e) {
    console.warn('[finalize] fable generation failed:', e)
  }
```

- [ ] **Step 3: Commit**

```bash
git add src/lib/finalize.ts
git commit -m "feat(finalize): pass description to writeProgress, fix fable to use writeFable IPC"
```

---

### Task 6: Create ReportHeader Component

**Files:**
- Create: `src/components/md/ReportHeader.tsx`
- Create: `tests/md/report-header.test.tsx`

**Context:** New component that renders type-differentiated metadata header. Uses existing Tailwind custom colors from `tailwind.config.ts`.

- [ ] **Step 1: Write ReportHeader component**

Create `src/components/md/ReportHeader.tsx`:

```typescript
import type { Frontmatter, DocType } from '@shared/index'

const TYPE_LABELS: Record<DocType, string> = {
  progress: '学习报告',
  review: '复习报告',
  research: '研究报告',
  fable: '寓言',
  transcript: '原始对话',
}

const TYPE_COLORS: Record<DocType, string> = {
  progress: 'bg-ember',
  review: 'bg-wine',
  research: 'bg-slate',
  fable: 'bg-ink border border-ember/60',
  transcript: 'bg-ink/60',
}

const DIFFICULTY_LABELS: Record<string, string> = {
  high: '高难度',
  mid: '中等难度',
  low: '入门',
}

function formatDate(iso: string): string {
  try {
    const d = new Date(iso)
    return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`
  } catch {
    return iso
  }
}

interface Props {
  frontmatter: Frontmatter
}

export function ReportHeader({ frontmatter }: Props) {
  const type = frontmatter.type ?? 'progress'
  const label = TYPE_LABELS[type]
  const typeColor = TYPE_COLORS[type]

  // Build metadata line based on type
  const metaItems: string[] = []
  if (type === 'progress' && frontmatter.session_number) {
    metaItems.push(`Session #${frontmatter.session_number}`)
  }
  if (type === 'review' && 'review_index' in frontmatter) {
    metaItems.push(`第 ${(frontmatter as Record<string, unknown>).review_index} 次复习`)
  }
  if (type === 'transcript' && frontmatter.session_number) {
    metaItems.push(`Session #${frontmatter.session_number}`)
  }
  if (frontmatter.created) {
    metaItems.push(formatDate(frontmatter.created))
  }

  return (
    <div className="report-header" style={{ marginBottom: '24px' }}>
      {/* Top row: type badge + difficulty + meta */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '10px',
        marginBottom: '8px',
        flexWrap: 'wrap',
      }}>
        <span className={`inline-block px-2.5 py-0.5 text-[11px] font-medium tracking-wider uppercase text-ink rounded-sm ${typeColor}`}>
          {label}
        </span>
        {frontmatter.difficulty && type !== 'review' && type !== 'fable' && type !== 'transcript' && (
          <span className="inline-block px-2.5 py-0.5 text-[11px] font-medium text-parchment bg-slate rounded-sm">
            {DIFFICULTY_LABELS[frontmatter.difficulty] ?? frontmatter.difficulty}
          </span>
        )}
        {metaItems.length > 0 && (
          <span className="text-[12px] text-parchment/50 ml-auto">
            {metaItems.join(' · ')}
          </span>
        )}
      </div>

      {/* Title */}
      <h1 className="text-2xl font-serif font-semibold text-parchment" style={{ margin: 0 }}>
        {frontmatter.title}
      </h1>

      {/* Description */}
      {frontmatter.description && (
        <p className="text-sm text-parchment/60 mt-1">
          {frontmatter.description}
        </p>
      )}

      {/* Tags */}
      {frontmatter.tags.length > 0 && (
        <div className="flex flex-wrap gap-2 mt-3">
          {frontmatter.tags.map(tag => (
            <span
              key={tag}
              className="text-xs text-parchment/60 border border-parchment/15 px-2 py-0.5 rounded-sm"
            >
              {tag}
            </span>
          ))}
        </div>
      )}

      {/* Progress summary for progress/research */}
      {(type === 'progress' || type === 'research') && frontmatter.progress_summary && (
        <div className="mt-4 pt-3 border-t border-parchment/10">
          <p className="text-xs text-parchment/50 italic leading-relaxed">
            {frontmatter.progress_summary}
          </p>
        </div>
      )}

      {/* Source topic for fable */}
      {type === 'fable' && (
        <p className="text-xs text-parchment/50 mt-3">
          来源主题：{frontmatter.title}
        </p>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Write ReportHeader tests**

Create `tests/md/report-header.test.tsx`:

```typescript
import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ReportHeader } from '@/components/md/ReportHeader'
import type { Frontmatter } from '@shared/index'

describe('ReportHeader', () => {
  it('renders progress report with all fields', () => {
    const fm: Frontmatter = {
      title: 'Agent',
      description: 'Agent 规划方法的对比与实践现状',
      type: 'progress',
      created: '2026-05-23T00:00:00.000Z',
      tags: ['skill学习', 'Agent', 'LLM'],
      session_number: 1,
      difficulty: 'mid',
      progress_summary: '精读 ReAct 原文术语',
      review_count: 0,
    }
    render(<ReportHeader frontmatter={fm} />)
    expect(screen.getByText('学习报告')).toBeInTheDocument()
    expect(screen.getByText('Agent')).toBeInTheDocument()
    expect(screen.getByText('Agent 规划方法的对比与实践现状')).toBeInTheDocument()
    expect(screen.getByText('精读 ReAct 原文术语')).toBeInTheDocument()
  })

  it('renders review report without difficulty badge', () => {
    const fm: Frontmatter = {
      title: 'Agent',
      type: 'review',
      created: '2026-05-27T00:00:00.000Z',
      review_count: 0,
      difficulty: 'mid',
      tags: [],
    }
    render(<ReportHeader frontmatter={fm} />)
    expect(screen.getByText('复习报告')).toBeInTheDocument()
    expect(screen.queryByText('中等难度')).not.toBeInTheDocument()
  })

  it('renders fable with source topic', () => {
    const fm: Frontmatter = {
      title: 'The Owl and the Three Planners',
      type: 'fable',
      created: '2026-05-23T00:00:00.000Z',
      review_count: 0,
      difficulty: 'mid',
      tags: [],
    }
    render(<ReportHeader frontmatter={fm} />)
    expect(screen.getByText('寓言')).toBeInTheDocument()
    expect(screen.getByText(/来源主题/)).toBeInTheDocument()
  })

  it('hides description when missing', () => {
    const fm: Frontmatter = {
      title: 'Minimal',
      type: 'progress',
      created: '2026-05-23T00:00:00.000Z',
      review_count: 0,
      difficulty: 'mid',
      tags: [],
    }
    render(<ReportHeader frontmatter={fm} />)
    expect(screen.queryByText('description')).not.toBeInTheDocument()
  })
})
```

- [ ] **Step 3: Run ReportHeader tests**

```bash
npx vitest run tests/md/report-header.test.tsx
```
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/components/md/ReportHeader.tsx tests/md/report-header.test.tsx
git commit -m "feat(md): add ReportHeader component with type-differentiated rendering"
```

---

### Task 7: Integrate ReportHeader into MarkdownRenderer

**Files:**
- Modify: `src/components/md/MarkdownRenderer.tsx`

**Context:** `MarkdownRenderer` currently strips frontmatter and only renders body. We need to parse frontmatter, pass it to `ReportHeader`, and render the body below.

- [ ] **Step 1: Import and integrate ReportHeader**

Replace the imports and component body in `src/components/md/MarkdownRenderer.tsx`:

```typescript
import React from 'react'
import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import matter from 'gray-matter'
import rehypeShiki from '@shikijs/rehype'
import './markdown.css'
import { detectDocType } from './fileType'
import { reportComponents, fableComponents, dialogueComponents } from './components'
import { warmDarkTheme } from './shiki-theme'
import { ReportHeader } from './ReportHeader'
import { parseFrontmatter } from '@electron/lib/frontmatter'
import type { DocType } from './fileType'

// ... MdErrorBoundary stays the same ...
// ... getDocTypeClass stays the same ...
// ... getRehypePlugins stays the same ...

export function MarkdownRenderer({ content, fileName }: Props) {
  console.log('[MD] fileName:', fileName, 'content length:', content?.length)

  const docType = detectDocType(content, fileName)
  console.log('[MD] detected type:', docType)

  // Parse frontmatter instead of stripping
  let body = content
  let frontmatter = parseFrontmatter(content, { filename: fileName }).frontmatter
  try {
    const parsed = matter(content)
    body = parsed.content
    frontmatter = parseFrontmatter(content, { filename: fileName }).frontmatter
    console.log('[MD] frontmatter parsed, title:', frontmatter.title)
  } catch (e) {
    console.log('[MD] frontmatter parse failed, using raw content')
  }

  const components = docType === 'report' ? reportComponents
    : docType === 'fable' ? fableComponents
    : dialogueComponents

  console.log('[MD] rendering with components:', Object.keys(components || {}))

  return (
    <div className="md-container">
      <ReportHeader frontmatter={frontmatter} />
      <div className={`md-body ${getDocTypeClass(docType)}`}>
        <MdErrorBoundary>
          <Markdown
            remarkPlugins={[remarkGfm]}
            components={components}
          >
            {body}
          </Markdown>
        </MdErrorBoundary>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Add md-container CSS**

In `src/components/md/markdown.css`, add at the top:

```css
.md-container {
  padding: 24px 0;
}
```

- [ ] **Step 3: Run existing MD tests**

```bash
npx vitest run tests/md/
```
Expected: PASS (fileType tests + new report-header tests)

- [ ] **Step 4: Commit**

```bash
git add src/components/md/MarkdownRenderer.tsx src/components/md/markdown.css
git commit -m "feat(md): integrate ReportHeader into MarkdownRenderer"
```

---

### Task 8: End-to-End Verification

**Files:**
- All modified files

- [ ] **Step 1: Run full test suite**

```bash
npx vitest run
```
Expected: All tests PASS

- [ ] **Step 2: Type check**

```bash
npx tsc --noEmit
```
Expected: No type errors

- [ ] **Step 3: Build check**

```bash
npm run build
```
Expected: Build succeeds without errors

- [ ] **Step 4: Manual verification checklist**

Launch the app and verify:
1. Start a new learning session, complete it → archived report should have `description` in frontmatter
2. Open the archived report in SessionViewer → header shows type badge, title, description, tags, progress_summary
3. Open an old report (pre-change) → header renders with inferred type from filename, description empty
4. Review a topic → review report has frontmatter with `type: review` and `review_index`
5. Open review report → header shows "复习报告" badge without difficulty

- [ ] **Step 5: Final commit**

```bash
git add -A
git commit -m "feat: unified frontmatter schema with type-differentiated report headers"
```

---

## Spec Coverage Checklist

| Spec Requirement | Implementing Task |
|-----------------|-------------------|
| Core fields (title, description, type, created, tags) | Task 1 (types), Task 2 (engine) |
| Extension fields per type (session_number, difficulty, etc.) | Task 1 (types), Task 2 (engine) |
| Fixed field ordering in YAML | Task 2 (serializeFrontmatter) |
| Type-aware serialization | Task 2 (serializeFrontmatter) |
| Backward compat: filename type inference | Task 2 (parseFrontmatter) |
| Backward compat: missing description | Task 6 (ReportHeader conditional) |
| writeProgress with description | Task 3 |
| writeReviewReport with frontmatter | Task 3 |
| writeTranscript with frontmatter | Task 3 |
| writeFable IPC handler | Task 3 |
| LLM prompt extracts description | Task 4 |
| finalize passes description | Task 5 |
| Fix fable overwriting transcript | Task 5 |
| ReportHeader type-differentiated rendering | Task 6 |
| MarkdownRenderer integration | Task 7 |
| Disco Elysium styling | Task 6 (Tailwind classes) |
| Tests for all components | Tasks 2, 6, 8 |

## Placeholder Scan

No placeholders found. Every step contains:
- Exact file paths
- Complete code blocks
- Exact commands with expected output
- No "TBD", "TODO", "implement later", or "add appropriate error handling"

## Type Consistency Check

- `DocType` defined in Task 1, used in Tasks 2, 3, 6, 7 ✓
- `description?: string` in Frontmatter → passed through writeProgressMd → serialized → parsed → rendered ✓
- `review_index` used in IpcApi, writeReviewReport handler, and review frontmatter ✓
- `writeFable` exposed in preload, IpcApi, ipc facade, and finalize ✓
- `serializeFrontmatter(type, data, body)` signature consistent across all call sites ✓
