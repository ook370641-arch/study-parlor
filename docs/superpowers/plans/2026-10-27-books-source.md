# 书籍来源 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在夜航简报新增第三来源"书籍"：导入本地 PDF，按章拆分后完整复用现有导读/对照/旁注/笔记体系。

**Architecture:** 书 = 来源，章 = "文章"。导入时 pdfjs 抽文本 → 目录三级回退（书签 → 目录页解析 → 单章）→ 切章写 `<学习库>/books/<书名>/chapters/NN-slug.md`。章节是真实 md 文件，导读侧车（`.guide.md`）、旁注侧车（`.annotations.md`）、对照面板全部零改动复用。全书导读只传目录不传正文，缓存进 `book.json`。

**Tech Stack:** Electron 30 主进程（pdfjs-dist 4.10.38 已是依赖）、React 18 + Zustand、Vitest、Playwright E2E。

**Spec:** `docs/superpowers/specs/2026-10-27-books-source-design.md`

## Global Constraints

- 仅支持 PDF；扫描版（无文字层）导入即报错"扫描版 PDF 暂不支持"，不入架。
- 全书导读 prompt 只含书名 + 目录标题列表，**不传正文**。
- 导入即复制原文件到 `<学习库>/books/<清洗书名>/source.pdf`，与源文件解耦。
- 所有库内写操作走 tmp+rename 原子写（照抄 `electron/ipc/annotations.ts` 约定）+ 路径校验（`assertInsideLibrary` 同款）。
- 命名统一用 `'book'`（`BriefingSourceId`、`ArticleSideSource`、`AssistantSession.contextType='book-chapter'`、`parentType='book-chapter'`）。
- 单元测试只跑改动相关文件：`npx vitest run tests/book-parse.test.ts` 等，不跑全量。
- 新建 E2E spec 必须登记 `e2e/source-map.json`（新增 `books` group）。

---

### Task 1: PDF 解析纯逻辑 `electron/lib/book-parse.ts`

**Files:**
- Create: `electron/lib/book-parse.ts`
- Test: `tests/book-parse.test.ts`

**Interfaces:**
- Produces（后续任务依赖这些签名）:
  - `export interface TocEntry { title: string; printedPage: number }`
  - `export function parseTocPage(pageText: string): TocEntry[] | null` — 解析单页文本为目录；不是目录页返回 null
  - `export function calibrateOffset(toc: TocEntry[], pages: string[]): number` — 印刷页码 → 物理页(1-based)偏移
  - `export interface ChapterSlice { title: string; startPage: number; endPage: number }` — 物理页 1-based 闭区间
  - `export function sliceChapters(toc: TocEntry[], offset: number, totalPages: number): ChapterSlice[]`
  - `export function chapterSlug(title: string): string` — 章节文件名 slug

- [ ] **Step 1: Write the failing test**

`tests/book-parse.test.ts`（fixture 来自 2026-10-27 对 JTBD 真实目录页的 spike）：

```ts
import { describe, it, expect } from 'vitest'
import { parseTocPage, calibrateOffset, sliceChapters, chapterSlug } from '../electron/lib/book-parse'

// JTBD 第 3 物理页的真实抽取文本（标题块 + 尾随页码块，pdfjs 双栏读取顺序）
const JTBD_TOC_PAGE = `2
Table of Contents
Foreword
Introduction
Focus on the job
Understanding your real competitors
More than mattresses: using Jobs-to-be-Done research for software
Getting customers to switch
Where one job stops and another starts
A worse product can do a better job
Abandoning personas: the story behind Job Stories
Designing features using Job Stories
Asking why the right way
Conclusion
3
4
5
10
13
19
23
28
32
36
44`

describe('parseTocPage', () => {
  it('解析"标题块 + 页码块"双栏布局（JTBD 真实 fixture）', () => {
    const toc = parseTocPage(JTBD_TOC_PAGE)
    expect(toc).not.toBeNull()
    expect(toc).toHaveLength(11)
    expect(toc![0]).toEqual({ title: 'Foreword', printedPage: 3 })
    expect(toc![10]).toEqual({ title: 'Conclusion', printedPage: 44 })
  })

  it('解析行内"标题 页码"布局', () => {
    const toc = parseTocPage('目录\n第一章 总则 1\n第二章 细则 15\n附录 30')
    expect(toc).toEqual([
      { title: '第一章 总则', printedPage: 1 },
      { title: '第二章 细则', printedPage: 15 },
      { title: '附录', printedPage: 30 },
    ])
  })

  it('非目录页返回 null', () => {
    expect(parseTocPage('It was a bright cold day in April')).toBeNull()
  })

  it('标题数与页码数不匹配时返回 null', () => {
    expect(parseTocPage('Table of Contents\nAlpha\nBeta\n1\n2\n3')).toBeNull()
  })
})

describe('calibrateOffset', () => {
  it('用首章标题定位物理页，算出偏移', () => {
    const toc = [{ title: 'Foreword', printedPage: 3 }]
    const pages = ['cover', 'legal', JTBD_TOC_PAGE, '3\nForeword\nAs one of the earliest architects']
    expect(calibrateOffset(toc, pages)).toBe(1) // 物理页 4 = 印刷页 3
  })

  it('找不到首章标题时返回 0', () => {
    expect(calibrateOffset([{ title: 'Nope', printedPage: 3 }], ['a', 'b'])).toBe(0)
  })
})

describe('sliceChapters', () => {
  it('按偏移切闭区间，末章到 totalPages', () => {
    const toc = [
      { title: 'A', printedPage: 3 },
      { title: 'B', printedPage: 10 },
    ]
    expect(sliceChapters(toc, 1, 51)).toEqual([
      { title: 'A', startPage: 4, endPage: 10 },
      { title: 'B', startPage: 11, endPage: 51 },
    ])
  })
})

describe('chapterSlug', () => {
  it('转小写、空白转连字符、去非法字符、保留中文', () => {
    expect(chapterSlug('Focus on the job')).toBe('focus-on-the-job')
    expect(chapterSlug('第一章: 总则/细则')).toBe('第一章-总则细则')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/book-parse.test.ts`
Expected: FAIL（模块不存在）

- [ ] **Step 3: Write minimal implementation**

`electron/lib/book-parse.ts`（纯函数，无 IO）：

```ts
export interface TocEntry { title: string; printedPage: number }
export interface ChapterSlice { title: string; startPage: number; endPage: number }

const TOC_HEADER = /^(table of contents|contents|目录)$/i
const NUMBER_LINE = /^\d{1,4}$/

export function parseTocPage(pageText: string): TocEntry[] | null {
  const lines = pageText.split('\n').map((l) => l.trim()).filter(Boolean)
  const headerIdx = lines.findIndex((l) => TOC_HEADER.test(l))
  if (headerIdx < 0) return null
  const rest = lines.slice(headerIdx + 1)

  // 模式 A：行内 "标题 页码"
  const inline: TocEntry[] = []
  for (const l of rest) {
    const m = l.match(/^(.+?)\s+(\d{1,4})$/)
    if (m && !NUMBER_LINE.test(m[1])) inline.push({ title: m[1], printedPage: Number(m[2]) })
  }
  if (inline.length >= 2) return inline

  // 模式 B：标题块 + 页码块（pdfjs 双栏抽取顺序）
  const titles: string[] = []
  const numbers: number[] = []
  for (const l of rest) {
    if (NUMBER_LINE.test(l)) numbers.push(Number(l))
    else if (numbers.length === 0) titles.push(l)
  }
  if (titles.length >= 2 && titles.length === numbers.length) {
    return titles.map((title, i) => ({ title, printedPage: numbers[i] }))
  }
  return null
}

export function calibrateOffset(toc: TocEntry[], pages: string[]): number {
  if (toc.length === 0) return 0
  const first = toc[0]
  for (let i = 0; i < pages.length; i++) {
    if (pages[i].slice(0, 200).includes(first.title)) {
      return i + 1 - first.printedPage // 物理页(1-based) - 印刷页
    }
  }
  return 0
}

export function sliceChapters(toc: TocEntry[], offset: number, totalPages: number): ChapterSlice[] {
  return toc.map((entry, i) => {
    const startPage = entry.printedPage + offset
    const endPage = i + 1 < toc.length ? toc[i + 1].printedPage + offset - 1 : totalPages
    return { title: entry.title, startPage, endPage: Math.min(endPage, totalPages) }
  })
}

export function chapterSlug(title: string): string {
  const slug = title
    .replace(/[\\/:*?"<>|]/g, '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .slice(0, 60)
  return slug || 'chapter'
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/book-parse.test.ts`
Expected: PASS（全部断言绿）

- [ ] **Step 5: Commit**

```bash
git add electron/lib/book-parse.ts tests/book-parse.test.ts
git commit -m "feat(books): PDF 目录页解析/页码偏移/章节切分纯逻辑"
```

---

### Task 2: 书籍库 IO `electron/lib/books.ts`

**Files:**
- Create: `electron/lib/books.ts`
- Test: `tests/books.test.ts`

**Interfaces:**
- Consumes: Task 1 的 `parseTocPage / calibrateOffset / sliceChapters / chapterSlug`
- Produces:
  - `export const BOOKS_DIR = 'books'`
  - `export interface BookJson { title: string; importedAt: string; sourceFile: string; hasToc: boolean; toc: { title: string; chapterFile: string; pageStart: number; pageEnd: number }[]; bookGuide?: { content: string; generatedAt: string } }`
  - `export function scanBooks(lib: string)` — 返回 `Array<BookJson & { dir: string; chapterCount: number }>`
  - `export function readBookJson(dirAbs: string): BookJson | null`
  - `export function writeBookJson(dirAbs: string, data: BookJson): void` — tmp+rename
  - `export function buildChapterBody(pages: string[], slice: ChapterSlice): string`
  - `export function assertInsideBooks(lib: string, target: string): void`
  - `export function booksDirAbs(lib: string): string`

- [ ] **Step 1: Write the failing test**

`tests/books.test.ts`（用 `fs.mkdtempSync` 造临时学习库，不碰真实库）：

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { scanBooks, readBookJson, writeBookJson, buildChapterBody, assertInsideBooks, BOOKS_DIR } from '../electron/lib/books'

let lib: string
beforeEach(() => { lib = fs.mkdtempSync(path.join(os.tmpdir(), 'sp-books-')) })
afterEach(() => { fs.rmSync(lib, { recursive: true, force: true }) })

const sampleJson = {
  title: 'Intercom on Jobs-to-be-Done',
  importedAt: '2026-10-27T00:00:00.000Z',
  sourceFile: 'source.pdf',
  hasToc: true,
  toc: [{ title: 'Foreword', chapterFile: 'chapters/01-foreword.md', pageStart: 4, pageEnd: 4 }],
}

describe('writeBookJson / readBookJson', () => {
  it('原子写后可读回；目录不存在时自动创建', () => {
    const dir = path.join(lib, BOOKS_DIR, 'jtbd')
    writeBookJson(dir, sampleJson)
    expect(readBookJson(dir)).toEqual(sampleJson)
  })

  it('book.json 损坏时读回 null', () => {
    const dir = path.join(lib, BOOKS_DIR, 'bad')
    fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(path.join(dir, 'book.json'), '{oops', 'utf8')
    expect(readBookJson(dir)).toBeNull()
  })
})

describe('scanBooks', () => {
  it('扫描 books/*/book.json 并按 importedAt 新到旧排序；坏目录跳过', () => {
    writeBookJson(path.join(lib, BOOKS_DIR, 'a'), sampleJson)
    writeBookJson(path.join(lib, BOOKS_DIR, 'b'), { ...sampleJson, title: 'B', importedAt: '2026-10-28T00:00:00.000Z' })
    fs.mkdirSync(path.join(lib, BOOKS_DIR, 'broken'), { recursive: true })
    const books = scanBooks(lib)
    expect(books.map((b) => b.title)).toEqual(['B', 'Intercom on Jobs-to-be-Done'])
    expect(books[0].chapterCount).toBe(1)
    expect(books[0].hasToc).toBe(true)
  })

  it('books 目录不存在时返回空数组', () => {
    expect(scanBooks(lib)).toEqual([])
  })
})

describe('buildChapterBody', () => {
  it('按闭区间拼页，页间双换行', () => {
    expect(buildChapterBody(['p1', 'p2', 'p3'], { title: 'x', startPage: 2, endPage: 3 })).toBe('p2\n\np3')
  })
})

describe('assertInsideBooks', () => {
  it('库外路径抛错', () => {
    expect(() => assertInsideBooks(lib, 'C:/Windows/evil.pdf')).toThrow(/outside/i)
  })
  it('books 内路径放行', () => {
    expect(() => assertInsideBooks(lib, path.join(lib, BOOKS_DIR, 'a', 'book.json'))).not.toThrow()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/books.test.ts`
Expected: FAIL（模块不存在）

- [ ] **Step 3: Write minimal implementation**

`electron/lib/books.ts`：

```ts
import fs from 'node:fs'
import path from 'node:path'
import type { ChapterSlice } from './book-parse'

export const BOOKS_DIR = 'books'

export interface BookTocItem { title: string; chapterFile: string; pageStart: number; pageEnd: number }
export interface BookJson {
  title: string
  importedAt: string
  sourceFile: string
  hasToc: boolean
  toc: BookTocItem[]
  bookGuide?: { content: string; generatedAt: string }
}

export function booksDirAbs(lib: string): string {
  return path.join(lib, BOOKS_DIR)
}

export function readBookJson(dirAbs: string): BookJson | null {
  try {
    const raw = fs.readFileSync(path.join(dirAbs, 'book.json'), 'utf8')
    const data = JSON.parse(raw) as BookJson
    if (typeof data.title !== 'string' || !Array.isArray(data.toc)) return null
    return data
  } catch {
    return null
  }
}

export function writeBookJson(dirAbs: string, data: BookJson): void {
  fs.mkdirSync(dirAbs, { recursive: true })
  const target = path.join(dirAbs, 'book.json')
  const tmp = target + '.tmp'
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf8')
  fs.renameSync(tmp, target)
}

export function scanBooks(lib: string): Array<BookJson & { dir: string; chapterCount: number }> {
  const root = booksDirAbs(lib)
  if (!fs.existsSync(root)) return []
  const out: Array<BookJson & { dir: string; chapterCount: number }> = []
  for (const name of fs.readdirSync(root)) {
    const dirAbs = path.join(root, name)
    if (!fs.statSync(dirAbs).isDirectory()) continue
    const data = readBookJson(dirAbs)
    if (!data) continue
    out.push({ ...data, dir: dirAbs, chapterCount: data.toc.length })
  }
  return out.sort((a, b) => b.importedAt.localeCompare(a.importedAt))
}

export function buildChapterBody(pages: string[], slice: ChapterSlice): string {
  return pages.slice(slice.startPage - 1, slice.endPage).join('\n\n')
}

export function assertInsideBooks(lib: string, target: string): void {
  const root = path.resolve(booksDirAbs(lib))
  const resolved = path.resolve(target)
  if (resolved !== root && !resolved.startsWith(root + path.sep)) {
    throw new Error(`Refusing to access outside books dir: ${resolved}`)
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/books.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add electron/lib/books.ts tests/books.test.ts
git commit -m "feat(books): book.json 读写与书架扫描"
```

---

### Task 3: 类型 + IPC + preload

**Files:**
- Modify: `src/types/index.ts`（`BriefingSourceId`、`IpcApi`、`NoteMeta`、`parentType` 联合）
- Create: `electron/ipc/books.ts`
- Modify: `electron/ipc/index.ts`（注册）
- Modify: `electron/preload.ts`（暴露）
- Modify: `electron/ipc/article-assistant.ts` 第 318、368、608 行（`parentType` 加 `'book-chapter'`）

**Interfaces:**
- Consumes: Task 2 的 `scanBooks / readBookJson / writeBookJson / assertInsideBooks / BOOKS_DIR / booksDirAbs`
- Produces（渲染侧依赖）:
  - `BookEntry = { dir: string; title: string; importedAt: string; hasToc: boolean; chapterCount: number; bookGuide?: string }`
  - `ChapterMeta = { title: string; chapterIndex: number; pageRange: [number, number] }`
  - `ipc.booksList(): Promise<BookEntry[]>`
  - `ipc.booksChapters(a: { bookDir: string }): Promise<BookTocItem[]>`
  - `ipc.booksReadChapter(a: { chapterPath: string }): Promise<{ content: string; meta: ChapterMeta }>`
  - `ipc.booksDelete(a: { bookDir: string }): Promise<void>`
  - （`books:import` / `books:bookGuide` 在 Task 4 / Task 9 加入）

- [ ] **Step 1: 扩展共享类型 `src/types/index.ts`**

1. 第 468 行：`export type BriefingSourceId = 'writing' | 'anthropic'` → `= 'writing' | 'anthropic' | 'book'`
2. 新增类型：

```ts
export interface BookTocItem { title: string; chapterFile: string; pageStart: number; pageEnd: number }
export interface BookEntry {
  dir: string
  title: string
  importedAt: string
  hasToc: boolean
  chapterCount: number
  bookGuide?: string
}
export interface ChapterMeta { title: string; chapterIndex: number; pageRange: [number, number] }
```

3. `IpcApi` 接口内新增：

```ts
booksList: () => Promise<BookEntry[]>
booksChapters: (a: { bookDir: string }) => Promise<BookTocItem[]>
booksReadChapter: (a: { chapterPath: string }) => Promise<{ content: string; meta: ChapterMeta }>
booksDelete: (a: { bookDir: string }) => Promise<void>
```

4. 第 286 行与第 752/757/763/768 行的 `parentType`（或 `parent_type`）联合 `'anthropic-article' | 'writing'` → 全部加 `| 'book-chapter'`。
5. `NoteMeta` 增加可选字段 `book?: string`（Task 8 使用）。
6. 第 560 行 `articlePanelMode?: Record<'anthropic', 'guide' | 'companion'>` → `Record<'anthropic' | 'book', 'guide' | 'companion'>`。

- [ ] **Step 2: 新建 `electron/ipc/books.ts`**

```ts
import fs from 'node:fs'
import path from 'node:path'
import matter from 'gray-matter'
import { ipcMain } from 'electron'
import type { AppConfig } from '../env'
import type { BookEntry, BookTocItem, ChapterMeta } from '@shared/index'
import { scanBooks, readBookJson, assertInsideBooks, booksDirAbs } from '../lib/books'

export function registerBooksIpc(cfg: AppConfig) {
  ipcMain.handle('books:list', (): BookEntry[] =>
    scanBooks(cfg.libraryPath).map((b) => ({
      dir: b.dir,
      title: b.title,
      importedAt: b.importedAt,
      hasToc: b.hasToc,
      chapterCount: b.chapterCount,
      ...(b.bookGuide ? { bookGuide: b.bookGuide.content } : {}),
    }))
  )

  ipcMain.handle('books:chapters', (_e, a: { bookDir: string }): BookTocItem[] => {
    assertInsideBooks(cfg.libraryPath, a.bookDir)
    return readBookJson(a.bookDir)?.toc ?? []
  })

  ipcMain.handle('books:readChapter', (_e, a: { chapterPath: string }) => {
    assertInsideBooks(cfg.libraryPath, a.chapterPath)
    const raw = fs.readFileSync(a.chapterPath, 'utf8')
    const d = matter(raw)
    const fm = d.data as Record<string, unknown>
    const meta: ChapterMeta = {
      title: typeof fm.title === 'string' ? fm.title : path.basename(a.chapterPath, '.md'),
      chapterIndex: typeof fm.chapter_index === 'number' ? fm.chapter_index : 0,
      pageRange: Array.isArray(fm.page_range) ? (fm.page_range as [number, number]) : [0, 0],
    }
    return { content: d.content.trim(), meta }
  })

  ipcMain.handle('books:delete', (_e, a: { bookDir: string }) => {
    assertInsideBooks(cfg.libraryPath, a.bookDir)
    if (path.dirname(a.bookDir) !== booksDirAbs(cfg.libraryPath)) {
      throw new Error('books:delete only accepts a direct child of books/')
    }
    fs.rmSync(a.bookDir, { recursive: true, force: true })
  })
}
```

- [ ] **Step 3: 注册与暴露**

`electron/ipc/index.ts`：`import { registerBooksIpc } from './books'`，在 `registerAllIpc` 内 `registerNotesIpc(cfg)` 之后加 `registerBooksIpc(cfg)`。

`electron/preload.ts`（照第 141-142 行 notes 同款）：

```ts
booksList: () => ipcRenderer.invoke('books:list'),
booksChapters: (a) => ipcRenderer.invoke('books:chapters', a),
booksReadChapter: (a) => ipcRenderer.invoke('books:readChapter', a),
booksDelete: (a) => ipcRenderer.invoke('books:delete', a),
```

`electron/ipc/article-assistant.ts` 第 318、368、608 行的 `parentType: 'anthropic-article' | 'writing'` → `'anthropic-article' | 'writing' | 'book-chapter'`。

- [ ] **Step 4: 验证编译**

Run: `npx tsc --noEmit`
Expected: 0 errors（若有 parentType 收窄处的类型报错，按编译器指引补齐联合值）

- [ ] **Step 5: Commit**

```bash
git add src/types/index.ts electron/ipc/books.ts electron/ipc/index.ts electron/preload.ts electron/ipc/article-assistant.ts
git commit -m "feat(books): books IPC 面与共享类型"
```

---

### Task 4: 导入管线 `books:import`

**Files:**
- Modify: `electron/lib/books.ts`（追加 pdfjs 抽取与导入编排）
- Modify: `electron/ipc/books.ts`（加 `books:import`）
- Modify: `src/types/index.ts`（`IpcApi` 加 `booksImport`）
- Modify: `electron/preload.ts`
- Test: `tests/books-import.test.ts`

**Interfaces:**
- Consumes: Task 1 全部；Task 2 全部；`dialog.showOpenDialog`（用法参照 `electron/ipc/writing.ts:150`）
- Produces:
  - `export class BookImportError extends Error { code: 'SCANNED_PDF' | 'PDF_READ_ERROR' }`（`electron/lib/books.ts`）
  - `export async function importPdfBook(lib: string, srcPdfPath: string): Promise<BookJson & { dir: string }>`
  - `ipc.booksImport(): Promise<{ book: BookEntry } | { error: string } | null>`（用户取消返回 null）

- [ ] **Step 1: Write the failing test**

`tests/books-import.test.ts` —— 不测真实 pdfjs（慢且脆），测编排逻辑；把页文本抽取作为注入依赖：

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import matter from 'gray-matter'
import { __test__importFromPages, BOOKS_DIR } from '../electron/lib/books'

let lib: string
beforeEach(() => { lib = fs.mkdtempSync(path.join(os.tmpdir(), 'sp-import-')) })
afterEach(() => { fs.rmSync(lib, { recursive: true, force: true }) })

const TOC = `Table of Contents\nAlpha\nBeta\n3\n5`
const pages = ['cover', TOC, '3\nAlpha body', 'alpha more', '5\nBeta body']

describe('__test__importFromPages', () => {
  it('切章写 md（frontmatter 含 title/chapter_index/page_range）并写 book.json', async () => {
    const src = path.join(lib, 'src.pdf')
    fs.writeFileSync(src, 'fake')
    const book = await __test__importFromPages(lib, src, 'My Book', pages)
    expect(book.hasToc).toBe(true)
    expect(book.toc).toHaveLength(2)
    const chapterAbs = path.join(book.dir, book.toc[0].chapterFile)
    const d = matter(fs.readFileSync(chapterAbs, 'utf8'))
    expect(d.data.title).toBe('Alpha')
    expect(d.data.chapter_index).toBe(1)
    expect(d.content).toContain('Alpha body')
    expect(fs.existsSync(path.join(book.dir, 'source.pdf'))).toBe(true)
  })

  it('全书无目录时单章导入且 hasToc=false', async () => {
    const src = path.join(lib, 'src2.pdf')
    fs.writeFileSync(src, 'fake')
    const book = await __test__importFromPages(lib, src, 'No Toc', ['page one text', 'page two text'])
    expect(book.hasToc).toBe(false)
    expect(book.toc).toHaveLength(1)
  })

  it('文字层为空时抛 SCANNED_PDF', async () => {
    const src = path.join(lib, 'src3.pdf')
    fs.writeFileSync(src, 'fake')
    await expect(__test__importFromPages(lib, src, 'Scanned', ['', ' ', ''])).rejects.toMatchObject({ code: 'SCANNED_PDF' })
  })

  it('同名书重复导入时目录加 -HHMM 后缀', async () => {
    const src = path.join(lib, 'src4.pdf')
    fs.writeFileSync(src, 'fake')
    const a = await __test__importFromPages(lib, src, 'Dup', pages)
    const b = await __test__importFromPages(lib, src, 'Dup', pages)
    expect(a.dir).not.toBe(b.dir)
    expect(fs.existsSync(a.dir)).toBe(true)
    expect(fs.existsSync(b.dir)).toBe(true)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/books-import.test.ts`
Expected: FAIL（`__test__importFromPages` 不存在）

- [ ] **Step 3: 实现导入编排**

`electron/lib/books.ts` 追加：

```ts
import matter from 'gray-matter'
import { parseTocPage, calibrateOffset, sliceChapters, chapterSlug } from './book-parse'

export class BookImportError extends Error {
  code: 'SCANNED_PDF' | 'PDF_READ_ERROR'
  constructor(code: 'SCANNED_PDF' | 'PDF_READ_ERROR', message: string) {
    super(message)
    this.code = code
  }
}

const ILLEGAL = /[\\/:*?"<>|]/g

function uniqueBookDir(lib: string, title: string): string {
  const base = title.replace(ILLEGAL, '').trim().slice(0, 60) || 'untitled'
  let candidate = path.join(booksDirAbs(lib), base)
  if (!fs.existsSync(candidate)) return candidate
  const now = new Date()
  const pad = (v: number) => String(v).padStart(2, '0')
  candidate = path.join(booksDirAbs(lib), `${base}-${pad(now.getHours())}${pad(now.getMinutes())}`)
  return candidate
}

// 与 pdfjs 解耦的核心编排；导入入口与单测共用
export async function __test__importFromPages(
  lib: string,
  srcPdfPath: string,
  title: string,
  pages: string[]
): Promise<BookJson & { dir: string }> {
  const totalChars = pages.reduce((n, p) => n + p.replace(/\s/g, '').length, 0)
  if (totalChars < 100) {
    throw new BookImportError('SCANNED_PDF', '扫描版 PDF（无文字层）暂不支持导入')
  }

  const dir = uniqueBookDir(lib, title)
  fs.mkdirSync(path.join(dir, 'chapters'), { recursive: true })
  fs.copyFileSync(srcPdfPath, path.join(dir, 'source.pdf'))

  let tocEntries: { title: string; printedPage: number }[] = []
  for (const p of pages.slice(0, 10)) {
    const toc = parseTocPage(p)
    if (toc) { tocEntries = toc; break }
  }
  const hasToc = tocEntries.length > 0
  const offset = hasToc ? calibrateOffset(tocEntries, pages) : 0
  const slices = hasToc
    ? sliceChapters(tocEntries, offset, pages.length)
    : [{ title, startPage: 1, endPage: pages.length }]

  const toc: BookTocItem[] = slices.map((s, i) => {
    const chapterFile = `chapters/${String(i + 1).padStart(2, '0')}-${chapterSlug(s.title)}.md`
    const body = buildChapterBody(pages, s)
    const md = matter.stringify(`\n${body}\n`, {
      title: s.title,
      chapter_index: i + 1,
      page_range: [s.startPage - offset, s.endPage - offset],
    })
    fs.writeFileSync(path.join(dir, chapterFile), md, 'utf8')
    return { title: s.title, chapterFile, pageStart: s.startPage, pageEnd: s.endPage }
  })

  const json: BookJson = {
    title,
    importedAt: new Date().toISOString(),
    sourceFile: 'source.pdf',
    hasToc,
    toc,
  }
  writeBookJson(dir, json)
  return { ...json, dir }
}

async function extractPagesText(pdfPath: string): Promise<string[]> {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs')
  const doc = await pdfjs.getDocument({ url: pdfPath }).promise
  try {
    const pages: string[] = []
    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i)
      const tc = await page.getTextContent()
      const lines: string[] = []
      let lastY: number | null = null
      for (const item of tc.items as Array<{ str: string; transform: number[] }>) {
        const y = Math.round(item.transform[5])
        if (y !== lastY) { lines.push(''); lastY = y }
        lines[lines.length - 1] += item.str
      }
      pages.push(lines.map((l) => l.trim()).filter(Boolean).join('\n'))
    }
    return pages
  } finally {
    await doc.destroy()
  }
}

export async function importPdfBook(lib: string, srcPdfPath: string): Promise<BookJson & { dir: string }> {
  const title = path.basename(srcPdfPath, path.extname(srcPdfPath)).replace(/_/g, ' ')
  let pages: string[]
  try {
    pages = await extractPagesText(srcPdfPath)
  } catch (err) {
    throw new BookImportError('PDF_READ_ERROR', err instanceof Error ? err.message : String(err))
  }
  return __test__importFromPages(lib, srcPdfPath, title, pages)
}
```

注：书签（`doc.getOutline()`）策略本期跳过——JTBD 实测无书签，目录页解析已覆盖；无目录书走单章。若后续遇到"有书签但无目录页"的书再加（spec §10 已记录此回退）。

- [ ] **Step 4: IPC 接线**

`electron/ipc/books.ts` 追加（dialog 用法参照 `electron/ipc/writing.ts:150`；E2E 用环境变量绕过原生对话框）：

```ts
import { dialog, ipcMain } from 'electron'
import { importPdfBook, BookImportError } from '../lib/books'

// registerBooksIpc 内追加：
ipcMain.handle('books:import', async (e) => {
  let pdfPath = process.env.E2E_BOOK_IMPORT_PATH
  if (!pdfPath) {
    const r = await dialog.showOpenDialog({
      properties: ['openFile'],
      filters: [{ name: 'PDF 书籍', extensions: ['pdf'] }],
    })
    if (r.canceled || r.filePaths.length === 0) return null
    pdfPath = r.filePaths[0]
  }
  try {
    const book = await importPdfBook(cfg.libraryPath, pdfPath)
    return { book: { ...book, chapterCount: book.toc.length } }
  } catch (err) {
    if (err instanceof BookImportError && err.code === 'SCANNED_PDF') {
      return { error: '扫描版 PDF（无文字层）暂不支持导入' }
    }
    return { error: err instanceof Error ? err.message : String(err) }
  }
})
```

`src/types/index.ts` IpcApi 加 `booksImport: () => Promise<{ book: BookEntry } | { error: string } | null>`；`electron/preload.ts` 加 `booksImport: () => ipcRenderer.invoke('books:import')`。

- [ ] **Step 5: Run tests + 编译**

Run: `npx vitest run tests/books-import.test.ts tests/books.test.ts && npx tsc --noEmit`
Expected: PASS + 0 errors

- [ ] **Step 6: Commit**

```bash
git add electron/lib/books.ts electron/ipc/books.ts src/types/index.ts electron/preload.ts tests/books-import.test.ts
git commit -m "feat(books): PDF 导入管线（复制入库+切章+book.json）"
```

---

### Task 5: Store 状态

**Files:**
- Modify: `src/store/index.ts`

**Interfaces:**
- Consumes: `ipc.booksList / booksChapters / booksReadChapter / booksImport / booksDelete`
- Produces（UI 组件依赖）:
  - `booksList: BookEntry[]`、`booksLoading: boolean`
  - `activeBookDir: string | null`、`activeBookToc: BookTocItem[]`
  - `activeChapter: { path: string; content: string; meta: ChapterMeta } | null`
  - `loadBooks(): Promise<void>`
  - `selectBook(dir: string): Promise<void>`
  - `selectChapter(chapterPath: string): Promise<void>`
  - `importBook(): Promise<void>`
  - `removeBook(dir: string): Promise<void>`
  - `articlePanelMode` 键扩展 `'book'`

- [ ] **Step 1: 状态与动作**

`src/store/index.ts`：
1. import 类型追加 `BookEntry, BookTocItem, ChapterMeta`。
2. state 接口加：

```ts
booksList: BookEntry[]
booksLoading: boolean
activeBookDir: string | null
activeBookToc: BookTocItem[]
activeChapter: { path: string; content: string; meta: ChapterMeta } | null
loadBooks: () => Promise<void>
selectBook: (dir: string) => Promise<void>
selectChapter: (chapterPath: string) => Promise<void>
importBook: () => Promise<void>
removeBook: (dir: string) => Promise<void>
```

3. 初始值：`booksList: []`、`booksLoading: false`、`activeBookDir: null`、`activeBookToc: []`、`activeChapter: null`；`articlePanelMode` 初始 `{ anthropic: 'guide', book: 'guide' }`，第 652 行的 state.json 恢复处补 `book: state.articlePanelMode?.book ?? 'guide'`。新增 `booksLastBook: string | null` store 字段：初始值在同一恢复块读 `state.booksLastBook ?? null`。
4. `setArticlePanelMode` 的 `source` 参数类型 `'anthropic'` → `'anthropic' | 'book'`（第 441、2336 行）。
5. 动作实现：

```ts
loadBooks: async () => {
  set({ booksLoading: true })
  try {
    const booksList = await ipc.booksList()
    set({ booksList, booksLoading: false })
    const last = get().booksLastBook
    if (!get().activeBookDir && booksList.length > 0) {
      const target = booksList.find((b) => b.dir === last) ?? booksList[0]
      await get().selectBook(target.dir)
    }
  } catch {
    set({ booksLoading: false })
  }
},

selectBook: async (dir) => {
  set({ activeBookDir: dir, activeChapter: null })
  const toc = await ipc.booksChapters({ bookDir: dir })
  set({ activeBookToc: toc })
  ipc.patchState({ booksLastBook: dir } as Partial<StateJson>)
},

selectChapter: async (chapterPath) => {
  const chapter = await ipc.booksReadChapter({ chapterPath })
  set({ activeChapter: { path: chapterPath, ...chapter } })
},

importBook: async () => {
  const r = await ipc.booksImport()
  if (!r) return
  if ('error' in r) {
    get().showToast(r.error)
    return
  }
  await get().loadBooks()
  await get().selectBook(r.book.dir)
  get().showToast(`已导入《${r.book.title}》`)
},

removeBook: async (dir) => {
  await ipc.booksDelete({ bookDir: dir })
  if (get().activeBookDir === dir) set({ activeBookDir: null, activeBookToc: [], activeChapter: null })
  await get().loadBooks()
},
```

6. state.json：`electron/ipc/state.ts` 的 DEFAULT 加 `booksLastBook: null`；`src/types/index.ts` 的 StateJson 加 `booksLastBook?: string | null`。

- [ ] **Step 2: 验证编译**

Run: `npx tsc --noEmit`
Expected: 0 errors

- [ ] **Step 3: Commit**

```bash
git add src/store/index.ts src/types/index.ts electron/ipc/state.ts
git commit -m "feat(books): store 书籍状态与动作"
```

---

### Task 6: 来源栏图标 + 书籍列 UI

**Files:**
- Modify: `src/components/BriefingSourceSidebar.tsx`
- Create: `src/components/books/BookListColumn.tsx`

**Interfaces:**
- Consumes: store 的 `booksList / booksLoading / activeBookDir / selectBook / importBook`
- Produces: `BookListColumn` 组件（`{ theme }: { theme: BriefingTheme }`），data-testid：`book-list-column`、`book-card-<index>`、`book-import-button`

- [ ] **Step 1: 来源栏加第三项**

`src/components/BriefingSourceSidebar.tsx` 的 `navItems`（约第 91 行）追加：

```ts
{
  id: 'book',
  label: '书籍',
  icon: () => <span>📚</span>,
  testId: 'briefing-source-book',
},
```

（`navItems` 的 `as const` 与 `setSource(id as typeof source)` 已兼容新 id，无需改逻辑。）

- [ ] **Step 2: 书籍列组件**

`src/components/books/BookListColumn.tsx`：

```tsx
import { useStore } from '@/store'
import type { BriefingTheme } from '@shared/index'

export function BookListColumn({ theme }: { theme: BriefingTheme }) {
  const books = useStore((s) => s.booksList)
  const loading = useStore((s) => s.booksLoading)
  const activeDir = useStore((s) => s.activeBookDir)
  const selectBook = useStore((s) => s.selectBook)
  const importBook = useStore((s) => s.importBook)
  const isAcademic = theme !== 'newspaper'

  return (
    <div data-testid="book-list-column" className="flex flex-col h-full min-h-0">
      <div className="flex-1 overflow-y-auto p-2 space-y-2">
        {loading && books.length === 0 && (
          <div className={`text-xs px-2 py-4 ${isAcademic ? 'text-parchment/50' : 'text-[#6b5d52]'}`}>加载中…</div>
        )}
        {!loading && books.length === 0 && (
          <div className={`text-xs px-2 py-4 ${isAcademic ? 'text-parchment/50' : 'text-[#6b5d52]'}`}>
            还没有书籍，点击下方导入一本 PDF。
          </div>
        )}
        {books.map((b, i) => (
          <button
            key={b.dir}
            type="button"
            data-testid={`book-card-${i}`}
            onClick={() => void selectBook(b.dir)}
            className={`w-full text-left rounded px-3 py-2 transition-colors ${
              activeDir === b.dir
                ? isAcademic ? 'bg-ember/15 border border-ember/40' : 'bg-[#1a1a1a]/[0.08]'
                : isAcademic ? 'bg-parchment/5 hover:bg-parchment/10 border border-parchment/10' : 'hover:bg-[#1a1a1a]/[0.04]'
            }`}
          >
            <div className={`text-sm font-serif truncate ${isAcademic ? 'text-parchment' : 'text-[#2a1f1a]'}`}>
              {b.title}
              {!b.hasToc && <span className={`ml-1 text-[10px] ${isAcademic ? 'text-parchment/40' : 'text-[#6b5d52]'}`}>无目录</span>}
            </div>
            <div className={`text-[11px] mt-0.5 ${isAcademic ? 'text-parchment/50' : 'text-[#6b5d52]'}`}>
              {b.chapterCount} 章
            </div>
            {b.bookGuide && (
              <div className={`text-[11px] mt-1 line-clamp-2 ${isAcademic ? 'text-parchment/60' : 'text-[#6b5d52]'}`}>
                {b.bookGuide}
              </div>
            )}
          </button>
        ))}
      </div>
      <div className={`p-2 border-t ${isAcademic ? 'border-parchment/10' : 'border-[#1a1a1a]/10'}`}>
        <button
          type="button"
          data-testid="book-import-button"
          onClick={() => void importBook()}
          className={`w-full text-xs py-2 rounded transition-colors ${
            isAcademic ? 'text-ember hover:bg-ember/10' : 'text-[#b0503c] hover:bg-[#1a1a1a]/[0.04]'
          }`}
        >
          + 导入书籍
        </button>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: 验证编译**

Run: `npx tsc --noEmit`
Expected: 0 errors

- [ ] **Step 4: Commit**

```bash
git add src/components/BriefingSourceSidebar.tsx src/components/books/BookListColumn.tsx
git commit -m "feat(books): 来源栏书籍入口与书架列"
```

---

### Task 7: 章节列 + 章节阅读器

**Files:**
- Create: `src/components/books/ChapterListColumn.tsx`
- Create: `src/components/books/BookReader.tsx`
- Modify: `src/pages/Briefing.tsx`（`source === 'book'` 分支）

**Interfaces:**
- Consumes: store 的 `activeBookToc / activeChapter / selectChapter / activeBookDir`；Task 8 的 `openBookChapterSession`
- Produces:
  - `ChapterListColumn`（`{ theme }: { theme: BriefingTheme }`），data-testid：`chapter-list-column`、`chapter-row-<index>`
  - `BookReader`（`{ theme }`），data-testid：`book-reader`、`book-chapter-body`

- [ ] **Step 1: 章节列**

`src/components/books/ChapterListColumn.tsx`：

```tsx
import { useStore } from '@/store'
import type { BriefingTheme } from '@shared/index'

export function ChapterListColumn({ theme }: { theme: BriefingTheme }) {
  const toc = useStore((s) => s.activeBookToc)
  const activePath = useStore((s) => s.activeChapter?.path ?? null)
  const selectChapter = useStore((s) => s.selectChapter)
  const bookDir = useStore((s) => s.activeBookDir)
  const isAcademic = theme !== 'newspaper'

  return (
    <div data-testid="chapter-list-column" className="flex flex-col h-full min-h-0 overflow-y-auto p-2 space-y-1">
      {toc.length === 0 && (
        <div className={`text-xs px-2 py-4 ${isAcademic ? 'text-parchment/50' : 'text-[#6b5d52]'}`}>先在左侧选一本书</div>
      )}
      {toc.map((c, i) => {
        const abs = bookDir ? `${bookDir}/${c.chapterFile}` : c.chapterFile
        return (
          <button
            key={c.chapterFile}
            type="button"
            data-testid={`chapter-row-${i}`}
            onClick={() => void selectChapter(abs)}
            className={`w-full text-left rounded px-3 py-1.5 text-sm truncate transition-colors ${
              activePath === abs
                ? isAcademic ? 'bg-ember/15 text-ember' : 'bg-[#1a1a1a]/[0.08] text-[#2a1f1a]'
                : isAcademic ? 'text-parchment/80 hover:bg-parchment/10' : 'text-[#2a1f1a]/80 hover:bg-[#1a1a1a]/[0.04]'
            }`}
          >
            {i + 1}. {c.title}
          </button>
        )
      })}
    </div>
  )
}
```

注：Windows 上 `bookDir` 为反斜杠绝对路径，拼 `${bookDir}/${c.chapterFile}` 交给 `path.resolve` 规整即可（`assertInsideBooks` 用 `path.resolve`，混合斜杠安全）。

- [ ] **Step 2: 章节阅读器**

`src/components/books/BookReader.tsx`（导读/对照右栏在 Task 8 接线，本任务先渲染正文）：

```tsx
import { useStore } from '@/store'
import { MarkdownRenderer } from '@/components/md/MarkdownRenderer'
import type { BriefingTheme } from '@shared/index'

export function BookReader({ theme }: { theme: BriefingTheme }) {
  const chapter = useStore((s) => s.activeChapter)
  const isAcademic = theme !== 'newspaper'

  if (!chapter) {
    return (
      <div data-testid="book-reader" className="h-full flex items-center justify-center">
        <span className={`text-sm ${isAcademic ? 'text-parchment/40' : 'text-[#6b5d52]'}`}>选择一个章节开始阅读</span>
      </div>
    )
  }

  return (
    <div data-testid="book-reader" className="h-full overflow-y-auto px-8 py-6">
      <h1 className={`font-serif text-xl mb-1 ${isAcademic ? 'text-parchment' : 'text-[#2a1f1a]'}`}>{chapter.meta.title}</h1>
      <div className={`text-[11px] mb-6 ${isAcademic ? 'text-parchment/40' : 'text-[#6b5d52]'}`}>
        第 {chapter.meta.chapterIndex} 章 · 页 {chapter.meta.pageRange[0]}–{chapter.meta.pageRange[1]}
      </div>
      <div data-testid="book-chapter-body">
        <MarkdownRenderer content={chapter.content} fileName={`${chapter.meta.title}.md`} briefingStyle={isAcademic ? 'academic' : 'newspaper'} hideHeader />
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Briefing 页接线**

`src/pages/Briefing.tsx`：
1. import 三个新组件。
2. 在 `{source === 'writing' && (...)}` 之后加同样式的 `source === 'book'` 分支，渲染**两个** `BriefingListColumn`：

```tsx
{source === 'book' && (
  <>
    <BriefingListColumn collapsed={dateColumnCollapsed} onToggle={() => setDateColumnCollapsed((c) => !c)} theme={theme} width={64} title="书籍">
      <BookListColumn theme={theme} />
    </BriefingListColumn>
    <BriefingListColumn collapsed={false} onToggle={() => {}} theme={theme} width={56} title="章节">
      <ChapterListColumn theme={theme} />
    </BriefingListColumn>
  </>
)}
```

3. 主区 `{source === 'writing' ? (...) : (...)}` 的三元改为按 `source` 分派：`source === 'book'` 渲染 `<BookReader theme={theme} />`，其余保持原样。
4. `source === 'book'` 时主区右上角写字区字号按钮组不渲染（它们属于写作区），换画按钮保持。

- [ ] **Step 4: 手动验证**

Run: `npm run dev`，设 `E2E_BOOK_IMPORT_PATH` 无效（那是 E2E 通道），手动点"导入书籍"选桌面的 `Intercom_on_Jobs-to-be-Done.pdf`。
Expected: 书架出现书卡（11 章）；点书出章节列；点章节出正文；页码区间显示正确（Foreword 页 3–3 左右）。

- [ ] **Step 5: Commit**

```bash
git add src/components/books/ChapterListColumn.tsx src/components/books/BookReader.tsx src/pages/Briefing.tsx
git commit -m "feat(books): 章节列与章节阅读器"
```

---

### Task 8: 章节导读接入 guide-v2

**Files:**
- Create: `electron/prompts/book-guide-v2.md`
- Create: `electron/lib/book-guide.ts`
- Modify: `electron/ipc/article-assistant.ts`（`articleAssistant:generateGuide` 分支）
- Modify: `src/components/books/BookReader.tsx`（挂右栏 `ArticleGuideTabs`）
- Test: `tests/book-guide.test.ts`

**Interfaces:**
- Consumes: `runGuideV2` 的 hooks 机制（`electron/lib/guide-v2-pipeline.ts:39-57` `GuideV2Hooks`）；`electron/prompts/blog-guide-v2.md` 作 prompt 母本；`buildBlogGuidePlanPrompt / buildBlogGuideV2UserPrompt / isValidGuideBlogV2`（均从 `guide-v2-pipeline.ts` export）
- Produces:
  - `export function buildBookContextBlock(book: BookGuideContext, chapterTitle: string): string`（`electron/lib/book-guide.ts`）
  - `export function runGuideV2ForBook(cfg: AppConfig, args: { system: string; articleContent: string; articleTitle?: string; entriesTotal?: number }, onProgress: (p: GuideProgress) => void): Promise<ArticleAssistantGuide>`（`electron/lib/guide-v2-pipeline.ts` 追加导出）

- [ ] **Step 1: Write the failing test**

`tests/book-guide.test.ts` —— 只测 prompt 装配（上下文块注入），不打 LLM：

```ts
import { describe, it, expect } from 'vitest'
import { buildBookContextBlock } from '../electron/lib/book-guide'

describe('buildBookContextBlock', () => {
  it('注入书名+目录+前章摘要', () => {
    const block = buildBookContextBlock({
      bookTitle: 'Intercom on Jobs-to-be-Done',
      tocTitles: ['Foreword', 'Introduction', 'Focus on the job'],
      prevChapterSummary: '前言讲了 JTBD 的缘起。',
    }, 'Focus on the job')
    expect(block).toContain('Intercom on Jobs-to-be-Done')
    expect(block).toContain('Foreword')
    expect(block).toContain('前言讲了 JTBD')
    expect(block).toContain('Focus on the job')
    expect(block).not.toContain('undefined')
  })

  it('无前章摘要时不出现该段', () => {
    const block = buildBookContextBlock({ bookTitle: 'B', tocTitles: ['A'] }, 'A')
    expect(block).not.toContain('上一章')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/book-guide.test.ts`
Expected: FAIL（模块不存在）

- [ ] **Step 3: 实现 `electron/lib/book-guide.ts`**

```ts
import type { BookGuideContext } from '@shared/index'

export function buildBookContextBlock(book: BookGuideContext, chapterTitle: string): string {
  const tocLines = book.tocTitles.map((t, i) => {
    const marker = t === chapterTitle ? ' ←（本章）' : ''
    return `${i + 1}. ${t}${marker}`
  })
  const parts = [
    `本书：《${book.bookTitle}》`,
    `全书目录：\n${tocLines.join('\n')}`,
  ]
  if (book.prevChapterSummary) {
    parts.push(`上一章导读摘要：${book.prevChapterSummary}`)
  }
  return parts.join('\n\n')
}
```

`electron/lib/guide-v2-pipeline.ts` 追加导出（复用既有 hooks 常量与 `runGuideV2`，把上下文块拼进 `articleContent` 头部）：

```ts
export function runGuideV2ForBook(
  cfg: AppConfig,
  args: { system: string; articleContent: string; articleTitle?: string; entriesTotal?: number },
  onProgress: (p: GuideProgress) => void
): Promise<ArticleAssistantGuide> {
  return runGuideV2(cfg, args, {
    buildPlanPrompt: buildBlogGuidePlanPrompt,
    buildUserPrompt: buildBlogGuideV2UserPrompt,
    validate: isValidGuideBlogV2,
  }, onProgress)
}
```

（`buildBlogGuidePlanPrompt / buildBlogGuideV2UserPrompt / isValidGuideBlogV2` 若当前未 export，给它们加 `export`。）

- [ ] **Step 4: 写 prompt `electron/prompts/book-guide-v2.md`**

复制 `blog-guide-v2.md` 全文，做两处改动：
1. 开头角色段把"博客文章"改为"书籍章节"，并加一句："输入开头会给出【本书书名 + 全书目录（标注本章位置）+ 上一章导读摘要（如有）】，撰写导读时必须利用目录说明本章在全书论证链中的位置，并与上一章保持承接。"
2. 文中所有"文章"表述改为"章节"。

- [ ] **Step 5: IPC 分支**

`electron/ipc/article-assistant.ts` 的 `articleAssistant:generateGuide` handler：
1. args 类型扩展：`articleType: 'anthropic-article' | 'book-chapter'`，新增可选 `bookContext?: { bookTitle: string; tocTitles: string[]; prevChapterSummary?: string }`。
2. 现有博客分支保持原样；其后加：

```ts
if (args.articleType === 'book-chapter') {
  const bookPromptPath = path.join(promptsDir(), 'book-guide-v2.md')
  const systemBook = fs.existsSync(bookPromptPath) ? fs.readFileSync(bookPromptPath, 'utf8') : ''
  const ctxBlock = args.bookContext ? buildBookContextBlock(args.bookContext, args.articleTitle ?? '') + '\n\n' : ''
  try {
    return await runGuideV2ForBook(
      cfg,
      {
        system: systemBook,
        articleContent: ctxBlock + args.articleContent,
        articleTitle: args.articleTitle,
        entriesTotal: args.entriesTotal,
      },
      (p) => send('articleAssistant:guideProgress', p)
    )
  } catch (err) {
    const code = (err as Error & { code?: string }).code
    if (code === 'GUIDE_JSON_ERROR' || code === 'GUIDE_ABORT') throw err
    throw typedError('GUIDE_LLM_ERROR', err instanceof Error ? err.message : String(err))
  }
}
```

3. `isE2EMock()` 分支对 `book-chapter` 同样返回固定 mock guide（复用现有 mock 即可，无需新增）。

- [ ] **Step 6: store 打开会话时携带 bookContext**

`src/store/index.ts`：
1. `AssistantSession.contextType` 第 28 行 `'anthropic-article'` → `'anthropic-article' | 'book-chapter'`；`openAssistantSession` 第 309 行 args 的 `contextType` 同步扩展，并加可选 `bookContext?: BookGuideContext`（类型从 `@shared/index` import，Task 3 已加）。
2. `AssistantSession` 加字段 `bookContext?: BookGuideContext`；`openAssistantSession` 内 set 时透传。
3. `generateAssistantGuide` 第 1817 行 `ipc.articleAssistantGenerateGuide({...})` 加 `bookContext: s.bookContext`。
4. `selectChapter`（Task 5 写的）在读完章节后自动开会话：

```ts
selectChapter: async (chapterPath) => {
  const chapter = await ipc.booksReadChapter({ chapterPath })
  set({ activeChapter: { path: chapterPath, ...chapter } })
  const bookDir = get().activeBookDir
  const book = get().booksList.find((b) => b.dir === bookDir)
  const toc = get().activeBookToc
  const idx = toc.findIndex((t) => chapterPath.endsWith(t.chapterFile))
  let prevChapterSummary: string | undefined
  if (idx > 0 && bookDir) {
    const prevPath = `${bookDir}/${toc[idx - 1].chapterFile}`
    const prevGuide = await ipc.articleAssistantReadGuide({ parentPath: prevPath, parentType: 'book-chapter' })
    prevChapterSummary = prevGuide?.guide.background
  }
  get().openAssistantSession({
    contextId: chapterPath,
    contextType: 'book-chapter',
    articleTitle: chapter.meta.title,
    articleContent: chapter.content,
    bookContext: { bookTitle: book?.title ?? '', tocTitles: toc.map((t) => t.title), ...(prevChapterSummary ? { prevChapterSummary } : {}) },
    autoGenerateGuide: true,
  })
},
```

5. `src/types/index.ts` 第 727 行 `articleAssistantGenerateGuide` args 类型：`articleType` 加 `'book-chapter'`，加 `bookContext?: BookGuideContext`；并新增 `export interface BookGuideContext { bookTitle: string; tocTitles: string[]; prevChapterSummary?: string }`。

- [ ] **Step 7: BookReader 挂右栏**

`src/components/books/BookReader.tsx`：参照 `AnthropicBlogPanel.tsx` 的组合方式，在正文右侧渲染：

```tsx
import { ArticleGuideTabs } from '@/components/article-assistant/ArticleGuideTabs'

// BookReader return 的最外层改为 flex：
<div data-testid="book-reader" className="h-full flex min-h-0">
  <div className="flex-1 overflow-y-auto px-8 py-6 min-w-0">
    {/* 原有的标题/元信息/MarkdownRenderer */}
  </div>
  {chapter && (
    <div className="w-80 shrink-0">
      <ArticleGuideTabs source="book" theme={theme} />
    </div>
  )}
</div>
```

`src/components/article-assistant/ArticleGuideTabs.tsx` 第 6 行：`export type ArticleSideSource = 'anthropic'` → `= 'anthropic' | 'book'`。

- [ ] **Step 8: 验证**

Run: `npx vitest run tests/book-guide.test.ts tests/prompts.test.ts && npx tsc --noEmit`
Expected: PASS + 0 errors

- [ ] **Step 9: Commit**

```bash
git add electron/prompts/book-guide-v2.md electron/lib/book-guide.ts electron/lib/guide-v2-pipeline.ts electron/ipc/article-assistant.ts src/store/index.ts src/types/index.ts src/components/books/BookReader.tsx src/components/article-assistant/ArticleGuideTabs.tsx tests/book-guide.test.ts
git commit -m "feat(books): 章节导读接入 guide-v2（目录+前章摘要上下文）"
```

---

### Task 9: 对照 / 旁注 / 存为笔记

**Files:**
- Modify: `src/components/books/BookReader.tsx`
- Modify: `electron/lib/notes.ts`（`createNoteFile` 接受 `book`）
- Modify: `electron/ipc/notes.ts`（透传 `book`）
- Modify: `src/types/index.ts`（`notesCreate` args 加 `book?`）
- Test: `tests/notes-book.test.ts`

**Interfaces:**
- Consumes: `ArticleAnnotations`（`src/components/article-assistant/ArticleAnnotations.tsx`，props 见 `AnthropicArticleReader.tsx:394`：`{ articlePath, articleRef, theme, briefingFontSize }`）；`AnnotationListButton`（同上，`:328`）；`ArticleCompanionBoard`（已由 `ArticleGuideTabs` 内部渲染，Task 8 已接入）
- Produces: `NoteMeta.book?: string` 的实际写入与读取

- [ ] **Step 1: Write the failing test**

`tests/notes-book.test.ts`：

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createNoteFile, scanNotes } from '../electron/lib/notes'

let lib: string
beforeEach(() => { lib = fs.mkdtempSync(path.join(os.tmpdir(), 'sp-notebook-')) })
afterEach(() => { fs.rmSync(lib, { recursive: true, force: true }) })

describe('createNoteFile with book', () => {
  it('frontmatter 写入 source=book 与 book 字段，scan 可读回', () => {
    createNoteFile(lib, { title: 'JTBD · Foreword', url: '', source: 'book', book: 'Intercom on Jobs-to-be-Done' })
    const notes = scanNotes(lib)
    expect(notes).toHaveLength(1)
    expect(notes[0].meta.source).toBe('book')
    expect(notes[0].meta.book).toBe('Intercom on Jobs-to-be-Done')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/notes-book.test.ts`
Expected: FAIL（`book` 不在参数类型中）

- [ ] **Step 3: 实现**

1. `src/types/index.ts`：`notesCreate` args 类型加 `book?: string`（Task 3 已给 `NoteMeta` 加 `book?: string`）。
2. `electron/lib/notes.ts` `createNoteFile`（第 91 行）：参数类型加 `book?: string`；`meta` 组装加 `...(a.book ? { book: a.book } : {})`。`parseNoteFile` 的 meta 组装处加 `...(typeof fm.book === 'string' ? { book: fm.book } : {})`。
3. `electron/ipc/notes.ts` `notes:create`：args 类型加 `book?: string`（直接透传给 `createNoteFile`，无需改逻辑）。

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/notes-book.test.ts`
Expected: PASS

- [ ] **Step 5: BookReader 接线旁注 + 存为笔记**

`src/components/books/BookReader.tsx`：
1. 正文容器加 `ref`：`<article ref={bodyRef} className="prose ...">` 包裹 `MarkdownRenderer`（旁注需要段落 DOM 锚点）。
2. 正文下渲染旁注（props 照抄 `AnthropicArticleReader.tsx:394`）：

```tsx
{chapter && (
  <ArticleAnnotations
    articlePath={chapter.path}
    articleRef={bodyRef}
    theme={theme}
    briefingFontSize={fontSize}
  />
)}
```

`fontSize` 从 `useStore((s) => s.briefingFontSize)` 取。旁注 IPC 按 `articlePath` 存 `<章节>.annotations.md` 边车，章节在库内即合法，无需改 `annotations.ts`。

3. 标题行右侧加"存为笔记"按钮 + `AnnotationListButton`（照抄 `AnthropicArticleReader.tsx:328`）：

```tsx
const [creatingNote, setCreatingNote] = useState(false)
const createChapterNote = async () => {
  if (!chapter) return
  setCreatingNote(true)
  try {
    const book = booksList.find((b) => b.dir === activeBookDir)
    await ipc.notesCreate({
      title: `${book?.title ?? '书籍'} · ${chapter.meta.title}`,
      url: '',
      source: 'book',
      book: book?.title,
    })
    showToast('已存为笔记')
  } finally {
    setCreatingNote(false)
  }
}
```

按钮 `data-testid="book-chapter-note-create"`，文案 `{creatingNote ? '创建中…' : '存为笔记'}`，样式照抄 `AnthropicArticleReader.tsx` 的 `article-note-create` 按钮。

- [ ] **Step 6: 验证**

Run: `npx vitest run tests/notes-book.test.ts && npx tsc --noEmit`
Expected: PASS + 0 errors

- [ ] **Step 7: Commit**

```bash
git add src/components/books/BookReader.tsx electron/lib/notes.ts electron/ipc/notes.ts src/types/index.ts tests/notes-book.test.ts
git commit -m "feat(books): 章节旁注与存为笔记（NoteMeta.book）"
```

---

### Task 10: 全书导读（仅目录）

**Files:**
- Create: `electron/prompts/book-overview.md`
- Modify: `electron/lib/llm-tasks.ts`（`generateBookOverview`）
- Modify: `electron/ipc/books.ts`（`books:bookGuide`）
- Modify: `src/types/index.ts`（`IpcApi.booksBookGuide`）
- Modify: `electron/preload.ts`
- Modify: `src/components/books/BookListColumn.tsx`（无缓存时触发生成）
- Test: `tests/book-overview.test.ts`

**Interfaces:**
- Consumes: `chatNonStream`（`electron/lib/kimi.ts:105`，签名参照 `llm-tasks.ts` 中 `generateGroupInspiration` 的调用）；Task 2 的 `readBookJson / writeBookJson`
- Produces:
  - `export function buildBookOverviewPrompt(bookTitle: string, tocTitles: string[]): string`（纯函数，可测）
  - `export async function generateBookOverview(cfg: AppConfig, bookDir: string): Promise<string>` — 命中缓存直接返回；否则生成并写回 `book.json.bookGuide`
  - `ipc.booksBookGuide(a: { bookDir: string }): Promise<{ content: string }>`

- [ ] **Step 1: Write the failing test**

`tests/book-overview.test.ts`：

```ts
import { describe, it, expect } from 'vitest'
import { buildBookOverviewPrompt } from '../electron/lib/llm-tasks'

describe('buildBookOverviewPrompt', () => {
  it('prompt 含书名与全部目录标题，且不含正文占位', () => {
    const p = buildBookOverviewPrompt('JTBD', ['Foreword', 'Introduction'])
    expect(p).toContain('JTBD')
    expect(p).toContain('Foreword')
    expect(p).toContain('Introduction')
    expect(p).not.toContain('{{')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/book-overview.test.ts`
Expected: FAIL

- [ ] **Step 3: prompt + 生成函数**

`electron/prompts/book-overview.md`：

```text
你是一位严谨的读书人。给你一本书的书名和完整目录（没有正文），请写一段 120 字以内的导览：
这本书大概讲什么、适合什么样的读者、建议按什么顺序/重点读。
不要编造目录之外的具体论点；不确定就明说"从目录看"。直接输出导览正文，不要标题、不要列表、不要寒暄。

书名：《{{book_title}}》
目录：
{{toc_lines}}
```

`electron/lib/llm-tasks.ts` 追加：

```ts
export function buildBookOverviewPrompt(bookTitle: string, tocTitles: string[]): string {
  return read('book-overview.md')
    .replace('{{book_title}}', bookTitle)
    .replace('{{toc_lines}}', tocTitles.map((t, i) => `${i + 1}. ${t}`).join('\n'))
}

export async function generateBookOverview(cfg: AppConfig, bookDir: string): Promise<string> {
  const json = readBookJson(bookDir)
  if (!json) throw new Error(`book.json missing: ${bookDir}`)
  if (json.bookGuide) return json.bookGuide.content
  const prompt = buildBookOverviewPrompt(json.title, json.toc.map((t) => t.title))
  const content = (await chatNonStream(cfg, {
    messages: [{ role: 'user', content: prompt }],
    temperature: 0.7,
  })).trim()
  writeBookJson(bookDir, { ...json, bookGuide: { content, generatedAt: new Date().toISOString() } })
  return content
}
```

（`read` 是 `llm-tasks.ts` 里已有的 prompt 读取 helper；`readBookJson / writeBookJson` 从 `./books` import。E2E mock：`isE2EMock()` 同款判定下返回固定串"这是一本 E2E mock 全书导读。"——判定逻辑照抄 `article-assistant.ts:39`。）

- [ ] **Step 4: IPC + preload + 前端触发**

`electron/ipc/books.ts` 追加：

```ts
ipcMain.handle('books:bookGuide', async (_e, a: { bookDir: string }) => {
  assertInsideBooks(cfg.libraryPath, a.bookDir)
  return { content: await generateBookOverview(cfg, a.bookDir) }
})
```

`src/types/index.ts` IpcApi 加 `booksBookGuide: (a: { bookDir: string }) => Promise<{ content: string }>`；preload 加 `booksBookGuide: (a) => ipcRenderer.invoke('books:bookGuide', a)`。

`BookListColumn.tsx`：书卡无 `bookGuide` 时，选中该书后触发一次生成再刷新（在 `selectBook` 的 store 动作里做更干净——Task 5 的 `selectBook` 末尾追加）：

```ts
const entry = get().booksList.find((b) => b.dir === dir)
if (entry && !entry.bookGuide) {
  void ipc.booksBookGuide({ bookDir: dir }).then(() => get().loadBooks()).catch(() => {})
}
```

注意 `loadBooks` 内不要再自动 selectBook 覆盖当前选择（Task 5 的实现里 `selectBook` 只在 `activeBookDir` 为空时触发，此处安全）。

- [ ] **Step 5: 验证**

Run: `npx vitest run tests/book-overview.test.ts && npx tsc --noEmit`
Expected: PASS + 0 errors

- [ ] **Step 6: Commit**

```bash
git add electron/prompts/book-overview.md electron/lib/llm-tasks.ts electron/ipc/books.ts src/types/index.ts electron/preload.ts src/components/books/BookListColumn.tsx src/store/index.ts tests/book-overview.test.ts
git commit -m "feat(books): 全书导读（仅目录，缓存入 book.json）"
```

---

### Task 11: E2E + source-map 登记

**Files:**
- Create: `e2e/specs/books.spec.ts`
- Modify: `e2e/helpers/test-library.ts`（`seedBook` helper）
- Modify: `e2e/source-map.json`（新增 `books` group）
- Modify: `e2e/helpers/selectors.ts`（若需新增选择器常量）

**Interfaces:**
- Consumes: `createTestLibrary / createTestConfigDir`（`e2e/helpers/test-library.ts`）、E2E mock 导读（Task 8）、`E2E_BOOK_IMPORT_PATH`（Task 4）

- [ ] **Step 1: seedBook helper**

`e2e/helpers/test-library.ts` 追加（照 `seedBlogCollection` 的写法）：

```ts
export function seedBook(
  libraryPath: string,
  book: { title: string; chapters: { title: string; body: string }[] }
): void {
  const dir = path.join(libraryPath, 'books', book.title)
  fs.mkdirSync(path.join(dir, 'chapters'), { recursive: true })
  const toc = book.chapters.map((c, i) => {
    const chapterFile = `chapters/${String(i + 1).padStart(2, '0')}-ch.md`
    const md = `---\ntitle: "${c.title}"\nchapter_index: ${i + 1}\npage_range: [1, 2]\n---\n\n${c.body}\n`
    fs.writeFileSync(path.join(dir, chapterFile), md, 'utf8')
    return { title: c.title, chapterFile, pageStart: 1, pageEnd: 2 }
  })
  fs.writeFileSync(
    path.join(dir, 'book.json'),
    JSON.stringify({ title: book.title, importedAt: new Date().toISOString(), sourceFile: 'source.pdf', hasToc: true, toc }, null, 2),
    'utf8'
  )
}
```

- [ ] **Step 2: E2E spec**

`e2e/specs/books.spec.ts`（骨架参照 `e2e/specs/notes-bookshelf.spec.ts` 的 fixture 用法；导读走 E2E mock）：

```ts
import { test, expect } from '../fixtures/electron'
import { seedBook } from '../helpers/test-library'

test.describe('书籍来源', () => {
  test('书架 → 章节 → 导读 tab → 存为笔记', async ({ window, testLibraryPath }) => {
    seedBook(testLibraryPath, {
      title: 'E2E 测试之书',
      chapters: [
        { title: '第一章 起', body: '## 第一节\n\n正文内容甲。' },
        { title: '第二章 承', body: '## 第二节\n\n正文内容乙。' },
      ],
    })
    // 导航到 briefing 并切到书籍来源（选择器以实现为准）
    await window.getByTestId('briefing-source-book').click()
    await expect(window.getByTestId('book-card-0')).toContainText('E2E 测试之书')
    await window.getByTestId('book-card-0').click()
    await window.getByTestId('chapter-row-0').click()
    await expect(window.getByTestId('book-chapter-body')).toContainText('正文内容甲')
    // 导读（E2E mock 固定返回）
    await expect(window.getByTestId('article-panel-tab-guide-book')).toBeVisible()
    await expect(window.getByTestId('guide-progress')).toBeVisible()
    // 存为笔记
    await window.getByTestId('book-chapter-note-create').click()
    // 笔记书架出现 "E2E 测试之书 · 第一章 起"（导航方式参照 notes-bookshelf.spec.ts）
  })

})

// 导入通道（books:import）由 tests/books-import.test.ts 覆盖编排逻辑；
// E2E_BOOK_IMPORT_PATH 通道供手动冒烟（见 DoD 最后一项），不写占位测试。
```

- [ ] **Step 3: source-map 登记**

`e2e/source-map.json` 新增 group（照现有 group 结构）：

```json
"books": {
  "specs": ["e2e/specs/books.spec.ts"],
  "sources": [
    "electron/lib/book-parse.ts",
    "electron/lib/books.ts",
    "electron/lib/book-guide.ts",
    "electron/ipc/books.ts",
    "src/components/books/",
    "src/pages/Briefing.tsx",
    "src/components/BriefingSourceSidebar.tsx"
  ]
}
```

- [ ] **Step 4: 跑定向 E2E**

Run: `node scripts/e2e-changed.js --run --no-retries`
Expected: books group 的 spec 被执行且通过

- [ ] **Step 5: Commit**

```bash
git add e2e/specs/books.spec.ts e2e/helpers/test-library.ts e2e/source-map.json e2e/helpers/selectors.ts
git commit -m "test(books): 书籍来源 E2E 与 source-map 登记"
```

---

## 完成判定（DoD）

- [ ] `npx vitest run tests/book-parse.test.ts tests/books.test.ts tests/books-import.test.ts tests/book-guide.test.ts tests/notes-book.test.ts tests/book-overview.test.ts` 全绿
- [ ] `npx tsc --noEmit` 0 errors
- [ ] `node scripts/e2e-changed.js --run` books group 通过
- [ ] 手动：导入桌面 JTBD PDF → 11 章 → 章节导读生成 → 旁注 → 存为笔记 → 笔记书架可见 `source=book`
