# 笔记书架 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在写作分区新增「笔记」第三 tab：书架卡片列表 + 元数据头 + 正文编辑（Milkdown 复用），并一次性导入 A 社博客已读存量。

**Architecture:** `<学习库>/notes/` 顶层目录，每笔记一 .md（frontmatter 元数据 + body 正文）。主进程新增 `electron/lib/notes.ts`（纯函数）+ `electron/ipc/notes.ts`；渲染进程复用 `writingFile`/`selectWritingFile`/`WritingEditor` 机制读改正文，新增 `src/components/notes/` 组件组。写作左栏 tab 联合类型扩为 `'articles' | 'repository' | 'notes'`。

**Tech Stack:** Electron 30 + React 18 + TS + Zustand + gray-matter + Vitest + Playwright

**Spec:** docs/superpowers/specs/2026-10-20-notes-bookshelf-requirements.md + docs/superpowers/specs/2026-10-20-notes-bookshelf-design.md

## Global Constraints

- 每条笔记一个 .md，frontmatter 字段：`title/url/source/rating/summary/highlight/collected_at/read_at`；body 即正文
- `source` 取值仅 `'anthropic' | 'hermes' | 'manual'`
- `rating` 为 0–5 整数，0 = 未评
- 正文读写复用 `writing:read`/`writing:write`（`writeWritingFile` 保留既有 frontmatter，已核实）
- 元数据写必须原子写（tmp + rename，照抄 `electron/ipc/annotations.ts`）
- 路径安全：一切落盘路径过 `assertInsideRoots`（`electron/lib/writing-tree.ts` 已导出）
- 中文 UI 文案；data-testid 用 kebab-case 且以 `note` 开头
- 测试命令粒度：单测只跑 `npx vitest run tests/notes.test.ts`；E2E 只跑 `npx playwright test --config e2e/playwright.config.ts notes-bookshelf`（先构建）

---

### Task 1: 笔记数据层 `electron/lib/notes.ts` + 类型

**Files:**
- Create: `electron/lib/notes.ts`
- Modify: `src/types/index.ts`（在 `BlogReadEntry` 定义附近追加笔记类型）
- Test: `tests/notes.test.ts`

**Interfaces:**
- Consumes: `loadCollection`（`electron/lib/blog-collection.ts`）、`assertInsideRoots`（`electron/lib/writing-tree.ts`）、`gray-matter`
- Produces（后续任务依赖的确切签名）:

```ts
export type NoteSource = 'anthropic' | 'hermes' | 'manual'
export type NoteMeta = {
  title: string
  url: string
  source: NoteSource
  rating: number        // 0-5，0=未评
  summary: string
  highlight: string
  collected_at: string  // ISO
  read_at?: string      // ISO，可空
}
export type NoteEntry = { path: string; meta: NoteMeta; parseError?: boolean }

export const NOTES_DIR = 'notes'
export function sanitizeNoteFilename(title: string): string
export function serializeNote(meta: NoteMeta, body: string): string
export function parseNoteFile(relPath: string, raw: string): NoteEntry
export function scanNotes(lib: string): NoteEntry[]
export function createNoteFile(lib: string, a: { title: string; url: string; source?: NoteSource }): { path: string }
export function updateNoteMeta(lib: string, rel: string, patch: Partial<NoteMeta>): void
export function deleteNoteFile(lib: string, rel: string): void
export function importReadNotes(lib: string): { created: number; skipped: number }
```

注：`path` 一律为库内相对路径（正斜杠），如 `notes/foo.md`——与写作树节点 path 一致。

- [ ] **Step 1: 写失败测试** `tests/notes.test.ts`（tmp 目录模式照抄 `tests/writing-tree.test.ts` 的 mkdtemp 用法）

```ts
import { describe, expect, it, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { sanitizeNoteFilename, serializeNote, parseNoteFile, scanNotes, createNoteFile, updateNoteMeta, importReadNotes } from '@electron/lib/notes'

let lib: string
beforeEach(() => { lib = fs.mkdtempSync(path.join(os.tmpdir(), 'notes-test-')) })
afterEach(() => { fs.rmSync(lib, { recursive: true, force: true }) })

describe('sanitizeNoteFilename', () => {
  it('去除非法字符并截断', () => {
    expect(sanitizeNoteFilename('a/b\\c:d*e?f\"g<h>i|j')).toBe('abcdefghij')
    expect(sanitizeNoteFilename('x'.repeat(100))).toHaveLength(80)
    expect(sanitizeNoteFilename('   ')).toBe('untitled')
  })
})

describe('serializeNote / parseNoteFile 往返', () => {
  it('字段全量往返', () => {
    const meta = { title: 'T', url: 'https://a.b/c', source: 'anthropic' as const, rating: 4, summary: 's', highlight: 'h', collected_at: '2026-10-20T00:00:00.000Z', read_at: '2026-10-18T00:00:00.000Z' }
    const raw = serializeNote(meta, '正文内容')
    const entry = parseNoteFile('notes/t.md', raw)
    expect(entry.meta).toEqual(meta)
    expect(entry.parseError).toBeUndefined()
  })
  it('缺省字段补默认：rating=0，summary/highlight 空串，source=manual', () => {
    const entry = parseNoteFile('notes/x.md', '---\ntitle: X\n---\nbody')
    expect(entry.meta.rating).toBe(0)
    expect(entry.meta.source).toBe('manual')
  })
  it('frontmatter 损坏 → parseError: true，不抛', () => {
    const entry = parseNoteFile('notes/bad.md', '---\n: [broken\n---\nx')
    expect(entry.parseError).toBe(true)
  })
})

describe('createNoteFile / scanNotes', () => {
  it('自动建 notes/ 目录，重名加 -HHMM 后缀，scan 按 collected_at 新→旧', () => {
    const a = createNoteFile(lib, { title: 'Hello', url: 'https://a/1' })
    const bname = createNoteFile(lib, { title: 'Hello', url: 'https://a/2' })
    expect(a.path).toBe('notes/Hello.md')
    expect(bname.path).toMatch(/^notes\/Hello-\d{4}\.md$/)
    const list = scanNotes(lib)
    expect(list).toHaveLength(2)
    expect(list.every(e => e.meta.title === 'Hello')).toBe(true)
  })
})

describe('updateNoteMeta', () => {
  it('只改 frontmatter 指定字段，body 原样保留', () => {
    const { path: p } = createNoteFile(lib, { title: 'A', url: 'https://a' })
    fs.writeFileSync(path.join(lib, p), serializeNote(parseNoteFile(p, fs.readFileSync(path.join(lib, p), 'utf8')).meta, '我的正文'), 'utf8')
    updateNoteMeta(lib, p, { rating: 5, summary: '好文' })
    const raw = fs.readFileSync(path.join(lib, p), 'utf8')
    const entry = parseNoteFile(p, raw)
    expect(entry.meta.rating).toBe(5)
    expect(entry.meta.summary).toBe('好文')
    expect(raw).toContain('我的正文')
  })
})

describe('importReadNotes', () => {
  it('从 .collection.json 导入 read 列表；幂等，第二次全 skip', () => {
    const dir = path.join(lib, 'Anthropic博客')
    fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(path.join(dir, '.collection.json'), JSON.stringify({
      version: 1, entries: [], dismissed: [], history: [],
      read: [
        { sourceUrl: 'https://anthropic.com/a', title: 'Article A', filePath: 'Anthropic博客/a.md', readAt: '2026-10-01T00:00:00.000Z' },
        { sourceUrl: 'https://anthropic.com/b', title: 'Article B', filePath: 'Anthropic博客/b.md', readAt: '2026-10-02T00:00:00.000Z' },
      ],
    }), 'utf8')
    const r1 = importReadNotes(lib)
    expect(r1).toEqual({ created: 2, skipped: 0 })
    const r2 = importReadNotes(lib)
    expect(r2).toEqual({ created: 0, skipped: 2 })
    const list = scanNotes(lib)
    expect(list.map(e => e.meta.url).sort()).toEqual(['https://anthropic.com/a', 'https://anthropic.com/b'])
    expect(list.every(e => e.meta.source === 'anthropic')).toBe(true)
    expect(list.find(e => e.meta.title === 'Article A')?.meta.read_at).toBe('2026-10-01T00:00:00.000Z')
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run tests/notes.test.ts`
Expected: FAIL（`@electron/lib/notes` 模块不存在）

- [ ] **Step 3: 实现 `electron/lib/notes.ts`**

关键实现要点（照此写全量代码）：

```ts
import fs from 'node:fs'
import path from 'node:path'
import matter from 'gray-matter'
import type { NoteEntry, NoteMeta, NoteSource } from '@shared/index'
import { loadCollection } from './blog-collection'
import { assertInsideRoots } from './writing-tree'

export const NOTES_DIR = 'notes'

const ILLEGAL = /[\\/:*?"<>|]/g
export function sanitizeNoteFilename(title: string): string {
  const cleaned = title.replace(ILLEGAL, '').trim().slice(0, 80)
  return cleaned || 'untitled'
}

// serializeNote：matter.stringify(body, meta as unknown as Record<string, unknown>)
// parseNoteFile：matter(raw)，逐字段带默认；try/catch 捕获 matter 抛错 → { path, meta: 默认空 meta, parseError: true }
// scanNotes：ensureDir(notes/) → 读 *.md（跳过 . 开头）→ parseNoteFile → sort collected_at desc
// createNoteFile：ensureDir → sanitize → 存在则加 -HHMM（再冲突 -HHMM-2）→ 写 serializeNote(meta, ``) → 返回 { path: rel }
// updateNoteMeta：abs=assertInsideRoots(lib, rel) → matter 读 → merge patch → tmp=abs+".tmp" 写 matter.stringify(body, merged) → rename（原子）
// deleteNoteFile：assertInsideRoots 后 fs.rmSync
// importReadNotes：loadCollection(lib).read + 现有 scanNotes 的 url 集合 → 逐条：url 已存在 skip++；否则 createNoteFile 后 updateNoteMeta 补 { source:`'anthropic'`, read_at: readAt, collected_at: readAt }（收录时间取读完时间，导入批次的"新→旧"顺序与阅读史一致）→ created++
```

注意：`createNoteFile` 的 meta 里 `collected_at` 用 `new Date().toISOString()`；导入路径用 `readAt` 覆盖。

- [ ] **Step 4: 跑测试确认通过**

Run: `npx vitest run tests/notes.test.ts`
Expected: 全部 PASS

- [ ] **Step 5: Commit**

```bash
git add electron/lib/notes.ts tests/notes.test.ts src/types/index.ts
git commit -m "feat(notes): 笔记数据层（扫描/序列化/元数据更新/已读导入）"
```

### Task 2: IPC `notes:*` + preload + IpcApi 类型

**Files:**
- Create: `electron/ipc/notes.ts`
- Modify: `electron/ipc/index.ts`（注册）
- Modify: `electron/preload.ts`（暴露，挂在 `annotationsWrite` 附近）
- Modify: `src/types/index.ts`（`IpcApi` 接口追加，参考第 720 行 annotations 声明处）

**Interfaces:**
- Consumes: Task 1 的 `scanNotes/createNoteFile/updateNoteMeta/deleteNoteFile/importReadNotes`
- Produces: 渲染进程可调用的 `ipc.notesList/notesCreate/notesUpdateMeta/notesDelete/notesImportRead`：

```ts
notesList: () => Promise<NoteEntry[]>
notesCreate: (a: { title: string; url: string }) => Promise<{ path: string }>
notesUpdateMeta: (a: { path: string; patch: Partial<NoteMeta> }) => Promise<void>
notesDelete: (a: { path: string }) => Promise<void>
notesImportRead: () => Promise<{ created: number; skipped: number }>
```

- [ ] **Step 1: 实现 `electron/ipc/notes.ts`**

```ts
import { ipcMain } from 'electron'
import type { AppConfig } from '../env'
import type { NoteMeta } from '@shared/index'
import { scanNotes, createNoteFile, updateNoteMeta, deleteNoteFile, importReadNotes } from '../lib/notes'

export function registerNotesIpc(cfg: AppConfig) {
  ipcMain.handle('notes:list', () => scanNotes(cfg.libraryPath))
  ipcMain.handle('notes:create', (_e, a: { title: string; url: string }) => createNoteFile(cfg.libraryPath, a))
  ipcMain.handle('notes:updateMeta', (_e, a: { path: string; patch: Partial<NoteMeta> }) => updateNoteMeta(cfg.libraryPath, a.path, a.patch))
  ipcMain.handle('notes:delete', (_e, a: { path: string }) => deleteNoteFile(cfg.libraryPath, a.path))
  ipcMain.handle('notes:importRead', () => importReadNotes(cfg.libraryPath))
}
```

- [ ] **Step 2: 注册 + preload + 类型**

electron/ipc/index.ts：import 并在 `registerAllIpc` 中 `registerAnnotationsIpc(cfg)` 之后加 `registerNotesIpc(cfg)`。

electron/preload.ts 追加（对照现有 `annotationsRead` 行风格）：

```ts
notesList: () => ipcRenderer.invoke('notes:list'),
notesCreate: (a) => ipcRenderer.invoke('notes:create', a),
notesUpdateMeta: (a) => ipcRenderer.invoke('notes:updateMeta', a),
notesDelete: (a) => ipcRenderer.invoke('notes:delete', a),
notesImportRead: () => ipcRenderer.invoke('notes:importRead'),
```

src/types/index.ts 的 `IpcApi` 接口追加上面 5 个签名（参数类型用上面 Produces 块的版本，不依赖 preload 的隐式 any）。

- [ ] **Step 3: 类型检查通过**

Run: `npx tsc --noEmit`
Expected: 0 errors

- [ ] **Step 4: Commit**

```bash
git add electron/ipc/notes.ts electron/ipc/index.ts electron/preload.ts src/types/index.ts
git commit -m "feat(notes): notes IPC 通道与 preload 暴露"
```

### Task 3: Store 增量 + writingListTab 扩第三 tab

**Files:**
- Modify: `src/types/index.ts:519`（`writingListTab` 联合类型）
- Modify: `src/store/index.ts`（state 字段 + actions）
- Modify: `electron/ipc/state.ts`（DEFAULT 加 `notesSortBy`；`writingListTab` 默认不变）

**Interfaces:**
- Consumes: Task 2 的 `ipc.notes*`
- Produces（组件任务依赖）:

```ts
notesList: NoteEntry[] | null
notesSortBy: 'time' | 'rating'
loadNotes: () => Promise<void>
createNoteManual: (a: { title: string; url: string }) => Promise<void>
updateNoteMetaAction: (path: string, patch: Partial<NoteMeta>) => Promise<void>  // 实现名 updateNoteMeta 亦可，避免与类型重名即可
deleteNoteAction: (path: string) => Promise<void>
importReadNotesAction: () => Promise<{ created: number; skipped: number } | null>
setNotesSortBy: (s: 'time' | 'rating') => void
```

以及 `writingListTab` 扩为 `'articles' | 'repository' | 'notes'`（types/index.ts:519、store/index.ts:347、store/index.ts:625 回退处同步）。

- [ ] **Step 1: 改类型与 DEFAULT**

src/types/index.ts：`writingListTab?: 'articles' | 'repository' | 'notes'`；`StateJson` 加 `notesSortBy?: 'time' | 'rating'`。
electron/ipc/state.ts DEFAULT 加一行：`notesSortBy: 'time',`。

- [ ] **Step 2: store 实现**

照抄 `loadFitness`（store/index.ts:1001）一行流风格；`setWritingListTab`（store/index.ts:1815）模式用于 `setNotesSortBy`（`set` + `ipc.patchState`）：

```ts
loadNotes: async () => { set({ notesList: await ipc.notesList() }) },
createNoteManual: async (a) => {
  const r = await ipc.notesCreate(a)
  await get().loadNotes()
  await get().selectWritingFile(r.path)
},
updateNoteMetaAction: async (p, patch) => {
  await ipc.notesUpdateMeta({ path: p, patch })
  set(s => ({ notesList: s.notesList?.map(e => e.path === p ? { ...e, meta: { ...e.meta, ...patch } } : e) ?? null }))
},
deleteNoteAction: async (p) => {
  await ipc.notesDelete({ path: p })
  const cur = get().writingFile
  if (cur?.path === p) await get().selectWritingFile(null)
  await get().loadNotes()
},
importReadNotesAction: async () => {
  const r = await ipc.notesImportRead()
  await get().loadNotes()
  get().showToast(`导入完成：新增 ${r.created} 条，跳过 ${r.skipped} 条`)
  return r
},
setNotesSortBy: (s) => { set({ notesSortBy: s }); void ipc.patchState({ notesSortBy: s } as Partial<StateJson>) },
```

- [ ] **Step 3: 修 WritingListColumn 自动选中效应（防笔记选中态被抢走）**

`src/components/writing/WritingListColumn.tsx` 约 81 行的自动选中 effect 开头加一行守卫：

```ts
if (useStore.getState().writingListTab === 'notes') return
```

- [ ] **Step 4: 类型检查**

Run: `npx tsc --noEmit`
Expected: 0 errors

- [ ] **Step 5: Commit**

```bash
git add src/types/index.ts src/store/index.ts electron/ipc/state.ts src/components/writing/WritingListColumn.tsx
git commit -m "feat(notes): store 增量与写作栏第三 tab 类型"
```

### Task 4: 书架 UI — NotesShelf / NoteCard / StarRating + 左栏接 tab

**Files:**
- Create: `src/components/notes/StarRating.tsx`
- Create: `src/components/notes/NoteCard.tsx`
- Create: `src/components/notes/NotesShelf.tsx`
- Modify: `src/components/writing/WritingListColumn.tsx`（tab 按钮组加第三项；`tab === 'notes'` 时渲染 `<NotesShelf />` 替代树区）

**Interfaces:**
- Consumes: Task 3 的 `notesList/notesSortBy/setNotesSortBy/createNoteManual/importReadNotesAction`、`selectWritingFile`（Task 3 已存在）、`writingFile`
- Produces: data-testid 契约（E2E 任务依赖）：`writing-list-tab-notes`、`notes-shelf`、`notes-empty`、`note-card-<url 末段>`、`note-badge-anthropic`、`notes-sort-time`/`notes-sort-rating`、`notes-new-button`、`notes-import-button`

- [ ] **Step 1: StarRating.tsx**

```tsx
export function StarRating({ value, onChange, size = 12 }: { value: number; onChange?: (v: number) => void; size?: number }) {
  return (
    <span data-testid="star-rating" style={{ letterSpacing: 1, fontSize: size }}>
      {[1, 2, 3, 4, 5].map(n => (
        <span
          key={n}
          data-testid={`star-${n}`}
          onClick={onChange ? () => onChange(n === value ? 0 : n) : undefined}
          style={{ cursor: onChange ? 'pointer' : 'default', color: n <= value ? '#d97757' : 'rgba(232,213,183,.18)' }}
        >{n <= value ? `'★'` : (onChange ? `'☆'` : `'★'`)}</span>
      ))}
    </span>
  )
}
```

- [ ] **Step 2: NoteCard.tsx** —— 书脊卡片：左侧 3px 棱线（选中态 `#d97757`，未选 `#6b4a34`）、标题两行截断、星标 + 徽标行、摘要斜体一行截断。徽标：`source==='anthropic'` 渲染 `<span data-testid="note-badge-anthropic">Anthropic</span>`（暖橙 pill），`hermes` 灰蓝 pill，`manual` 不渲染徽标。点击整卡 → `selectWritingFile(entry.path)`。悬停时右上出现 ✕（`data-testid="note-delete-<url末段>"`）→ 复用全局确认弹窗（`confirm-dialog-confirm`，参照写作树删除做法）→ `deleteNoteAction(entry.path)`。

- [ ] **Step 3: NotesShelf.tsx** —— 结构：

```tsx
// 顶部工具行：
//   <button data-testid="notes-sort-time">时间</button> <button data-testid="notes-sort-rating">星标</button>
//   <button data-testid="notes-import-button">导入已读</button> <button data-testid="notes-new-button">＋ 新笔记</button>
// 列表：sorted = useMemo(notesSortBy===`'rating'` ? by rating desc,collected_at desc : by collected_at desc)
// 空态：<div data-testid="notes-empty">书架还空着——点「导入已读」把读过的文章放上架</div>
// 新笔记：复用 PromptDialog 两次（先文章名后网页）或一个双字段小表单；提交 → createNoteManual({title, url})
// 导入：click → importReadNotesAction()（toast 已在 action 内）
```

视觉照 mockup（`docs/superpowers/specs/2026-10-20-notes-bookshelf-design.md` §6）：隔板线、暗底纸感、academic/newspaper 双主题分支照抄 WritingListColumn 的 `isAcademic` 三元式。

- [ ] **Step 4: WritingListColumn 接 tab**

tab 按钮数组（约 185 行）从 `['articles', 'repository']` 扩为 `['articles', 'repository', 'notes'`]，第三项文案「笔记」，`data-testid="writing-list-tab-notes"`。树区条件改为：`tab === 'notes' ? <NotesShelf theme={theme} /> : tab === 'articles' ? ... : ...`。

- [ ] **Step 5: 构建 + 手动冒烟**

Run: `npx electron-vite build` 后 `npm run dev`，切到笔记 tab 看空态渲染。
Expected: 书架空态可见，无控制台报错。

- [ ] **Step 6: Commit**

```bash
git add src/components/notes/ src/components/writing/WritingListColumn.tsx
git commit -m "feat(notes): 书架左栏（卡片/星标/排序/新建/导入入口）"
```

### Task 5: 笔记主区 — NoteBoard / NoteMetaHeader

**Files:**
- Create: `src/components/notes/NoteMetaHeader.tsx`
- Create: `src/components/notes/NoteBoard.tsx`
- Modify: `src/pages/Briefing.tsx:100-127`（`source === 'writing'` 分支内按 tab 换板）

**Interfaces:**
- Consumes: `writingFile`/`updateWritingBody`/`saveWritingFile`（正文）、`notesList`（按 path 找 meta）、`updateNoteMetaAction`（Task 3）、`WritingEditor` props `{ initial, onChange, theme, filePath, registerToolbarAction? }`
- Produces: data-testid：`note-board`、`note-meta-title`、`note-meta-url`、`note-meta-summary`、`note-meta-highlight`、`note-empty-state`

- [ ] **Step 1: NoteMetaHeader.tsx**

布局照 mockup：标题行（标题 input + StarRating size=18 + 徽标）、URL 行（input + 读完/收录时间只读）、摘要/亮点双字段行。所有 input `defaultValue` + `onBlur` → `updateNoteMetaAction(path, { 字段: e.target.value })`；星标 `onChange` → `updateNoteMetaAction(path, { rating: v })`。组件外层 `key={entry.path}` 由 NoteBoard 传入以在切换笔记时重置 defaultValue。

- [ ] **Step 2: NoteBoard.tsx**

```tsx
// const tab = useStore(s => s.writingListTab)
// const file = useStore(s => s.writingFile)
// const notesList = useStore(s => s.notesList)
// const entry = notesList?.find(e => e.path === file?.path)
// if (!file || !entry) return <div data-testid="note-empty-state">从左侧书架选一篇笔记，或点「＋ 新笔记」</div>
// autosave：照抄 WritingBoard 的 debounce——file.dirty 时 setTimeout(1500) → saveWritingFile()
// 渲染：<div data-testid="note-board">
//   <NoteMetaHeader key={entry.path} entry={entry} />
//   <WritingEditor initial={file.body} onChange={md => updateWritingBody(md)} theme="academic" filePath={file.path} />
// </div>
```

- [ ] **Step 3: Briefing.tsx 主区换板**

`source === `'writing'`` 分支里 `<WritingBoard />` 改为：

```tsx
{useStore(s => s.writingListTab) === 'notes' ? <NoteBoard /> : <WritingBoard />}
```

（提取为局部变量 `const writingTab = useStore(s => s.writingListTab)` 放组件顶部，与其他 useStore 声明同区。）

- [ ] **Step 4: 构建 + 手动冒烟**

Run: `npx electron-vite build` + `npm run dev`：新建笔记 → 改标题/打星/写摘要 → 正文输入 → 等 1.5s 看「已保存」→ 重启 app 验证持久化。

- [ ] **Step 5: Commit**

```bash
git add src/components/notes/NoteBoard.tsx src/components/notes/NoteMetaHeader.tsx src/pages/Briefing.tsx
git commit -m "feat(notes): 笔记主区（元数据头 + 正文编辑闭环）"
```

### Task 6: E2E 回归 + source-map

**Files:**
- Create: `e2e/specs/notes-bookshelf.spec.ts`
- Modify: `e2e/helpers/test-library.ts`（加 `seedBlogCollection` helper）
- Modify: `e2e/source-map.json`（新增 notes group）

**Interfaces:**
- Consumes: Task 4/5 全部 data-testid 契约；`CoverPage`（`e2e/pages/CoverPage.ts`）
- Produces: `seedBlogCollection(libPath, entries)` helper

- [ ] **Step 1: seedBlogCollection helper**

```ts
// e2e/helpers/test-library.ts 追加
export function seedBlogCollection(libPath: string, read: { sourceUrl: string; title: string; filePath: string; readAt: string }[]): void {
  const dir = path.join(libPath, 'Anthropic博客')
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(path.join(dir, '.collection.json'), JSON.stringify({ version: 1, entries: [], dismissed: [], history: [], read }), 'utf8')
}
```

- [ ] **Step 2: E2E spec**

```ts
import { test, expect } from '../fixtures/electron'
import { CoverPage } from '../pages/CoverPage'
import { seedBlogCollection } from '../helpers/test-library'

test.describe('笔记书架', () => {
  test('导入已读 → 卡片上书 → 编辑元数据与正文 → 重进仍在', async ({ window, testLibraryPath }) => {
    seedBlogCollection(testLibraryPath, [
      { sourceUrl: 'https://anthropic.com/a', title: 'E2E Article A', filePath: 'Anthropic博客/a.md', readAt: '2026-10-01T00:00:00.000Z' },
      { sourceUrl: 'https://anthropic.com/b', title: 'E2E Article B', filePath: 'Anthropic博客/b.md', readAt: '2026-10-02T00:00:00.000Z' },
    ])
    const cover = new CoverPage(window)
    await cover.enterName('E2E 测试员')
    await cover.goToBriefing()  // 默认即写作分区
    await window.locator('[data-testid="writing-list-tab-notes"]').click()

    // 导入已读 → 两张卡片，A 社徽标可见
    await window.locator('[data-testid="notes-import-button"]').click()
    await expect(window.locator('[data-testid="note-card-a"]')).toBeVisible()
    await expect(window.locator('[data-testid="note-badge-anthropic"]').first()).toBeVisible()

    // 点开笔记 → 元数据编辑 + 正文
    await window.locator('[data-testid="note-card-a"]').click()
    await expect(window.locator('[data-testid="note-board"]')).toBeVisible()
    await window.locator('[data-testid="star-4"]').click()
    await window.locator('[data-testid="note-meta-summary"]').fill('E2E 一句话摘要')
    await window.locator('[data-testid="note-meta-summary"]').blur()

    // 重进 tab 验证持久化
    await window.locator('[data-testid="writing-list-tab-articles"]').click()
    await window.locator('[data-testid="writing-list-tab-notes"]').click()
    await expect(window.locator('[data-testid="note-card-a"]')).toContainText('E2E 一句话摘要')
  })
})
```

注：fixtures 的库路径参数名以 `e2e/fixtures/electron.ts` 实际导出为准（写 spec 前先 `rg "testLibraryPath" e2e/fixtures/electron.ts` 确认；若未暴露则参照 `seedFitnessJson` 的注入模式调整）。note-card 的 testid 后缀取 url 末段（`note-card-a`），NoteCard 实现里用 `url.split("/").pop()` 生成。

- [ ] **Step 3: source-map.json 加 group**

```json
"notes": {
  "sources": [
    "electron/lib/notes.ts",
    "electron/ipc/notes.ts",
    "src/components/notes/**",
    "src/components/writing/WritingListColumn.tsx"
  ],
  "specs": ["notes-bookshelf.spec.ts"]
}
```

- [ ] **Step 4: 跑 E2E**

Run: `npx electron-vite build` → `npx playwright test --config e2e/playwright.config.ts notes-bookshelf`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add e2e/specs/notes-bookshelf.spec.ts e2e/helpers/test-library.ts e2e/source-map.json
git commit -m "test(notes): 书架 E2E 回归与 source-map 登记"
```

---

## 收尾（全部任务完成后）

- [ ] 记事板归档：把待办「写作笔记分区（书架）」（id `nmvfe8tuiaygp`）从 `notepadItems` 移入 `notepadLog`（`source: 'agent'` + `resolvedAt`）。**先确认 app 已关闭**，再编辑 `~/.studyparlor/state.json`。
- [ ] 视觉精修：对照 mockup 截图迭代书脊质感（实现期按实际效果微调）。
