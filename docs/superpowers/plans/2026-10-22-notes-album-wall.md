# 笔记专辑墙 + 对照逻辑统一 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 笔记 tab 重设计（第二列封面行 + 主区专辑墙 + 阅读室正文页），并统一双向对照逻辑（文章/仓库/笔记互为可挑）。

**Architecture:** 渲染层改动为主，数据流不变（notesList / notesCategory / notesSortBy / writingFile / companionFile 沿用）。封面解析为纯函数 + 共用组件；主区渲染从「按左栏 tab 分支」改为「按打开文件所属根分支」。对照统一 = 一条规则：对照槽 armed 时任何内容列表点击 = 放入对照槽。

**Tech Stack:** React 18 + TypeScript + Zustand + Vitest + Playwright（Electron 30）

**Spec:** `docs/superpowers/specs/2026-10-22-notes-album-wall-design.md`

## Global Constraints

- 单元测试只跑改动对应文件：`npx vitest run tests/<file>`，不跑全量。
- E2E 只跑定向：`node scripts/e2e-changed.js --run`；新建/改动 spec 必须同步 `e2e/source-map.json`。
- 不主动 `git commit`（用户未要求）；每个 Task 以测试通过为检查点，全部完成后由用户决定是否提交。
- 暗色主题调色板：深褐 `#2a1f1a` / 米色 `#e8d5b7` / 暖橙 `#d97757`（ember）。
- 既有 data-testid 尽量不更名；必须更名的（`notes-cat-*` pill → 下拉框）在 Task 8 同步改 E2E。
- 视觉基准以 visual companion 三屏定稿为准：第二列=C（封面行）、正文页=A（阅读室）、主页=B（专辑墙，第二列保留的混合结构）。

---

### Task 1: 对照读写打通 notes 根

笔记路径（`notes/foo.md`）目前被 `isWritingTreePath` 排除，对照槽读取被分流到博客通道的 `ipc.readMd`（相对路径必失败）。主进程 `assertInsideRoots` 允许库内任意路径，把 `notes/` 纳入即可双向打通（写作侧 `selectCompanionFile` 与博客侧 `selectArticleCompanion` 都走这一判断）。

**Files:**
- Modify: `src/lib/writing-tree-utils.ts:15-17`
- Test: `tests/writing-tree-utils.test.ts`（已有，追加用例）

**Interfaces:**
- Produces: `isWritingTreePath(p: string): boolean` —— `writing/`、`repository/`、`notes/` 前缀均返回 true。

- [ ] **Step 1: 写失败测试**

在 `tests/writing-tree-utils.test.ts` 追加：

```ts
it('notes 根路径视为库内可读写路径（对照槽可读笔记）', () => {
  expect(isWritingTreePath('notes/foo.md')).toBe(true)
  expect(isWritingTreePath('notes/子目录/bar.md')).toBe(true)
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run tests/writing-tree-utils.test.ts`
Expected: FAIL（`notes/foo.md` 返回 false）

- [ ] **Step 3: 最小实现**

```ts
export function isWritingTreePath(p: string): boolean {
  return p.startsWith('writing/') || p.startsWith('repository/') || p.startsWith('notes/')
}
```

同步更新函数上方注释：库内三根（writing/repository/notes）均走 writing IPC 通道。

- [ ] **Step 4: 跑测试确认通过**

Run: `npx vitest run tests/writing-tree-utils.test.ts`
Expected: PASS

---

### Task 2: 主区渲染与左栏 tab 解耦

现状 `src/pages/Briefing.tsx:117` 按 `writingListTab` 决定渲染 NoteBoard/WritingBoard——对照 armed 时切左栏 tab 找文章，主区就被换掉。改为按 `writingFile.path` 所属根决定；同时给 WritingListColumn 的「恢复上次文件」effect 加根守卫（`lastWritingFile` 可能是笔记路径，在文章 tab 下不应恢复）。

**Files:**
- Modify: `src/lib/writing-tree-utils.ts`（新增 `writingRootOf`）
- Modify: `src/pages/Briefing.tsx:117` 附近
- Modify: `src/components/writing/WritingListColumn.tsx`（auto-select effect 的根守卫）
- Test: `tests/writing-tree-utils.test.ts`

**Interfaces:**
- Produces: `writingRootOf(p: string): 'writing' | 'repository' | 'notes' | null` —— Task 5/6 的 Briefing 分支与 NotesWall 挂载都依赖它。

- [ ] **Step 1: 写失败测试**

```ts
it('writingRootOf 按前缀归根', () => {
  expect(writingRootOf('notes/foo.md')).toBe('notes')
  expect(writingRootOf('writing/a/b.md')).toBe('writing')
  expect(writingRootOf('repository/x.md')).toBe('repository')
  expect(writingRootOf('其他/abs.md')).toBe(null)
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run tests/writing-tree-utils.test.ts`
Expected: FAIL（writingRootOf 未定义）

- [ ] **Step 3: 实现 + 改 Briefing 分支**

writing-tree-utils.ts:

```ts
/** 按路径前缀归所属根；库外/未知前缀返回 null */
export function writingRootOf(p: string): 'writing' | 'repository' | 'notes' | null {
  if (p.startsWith('writing/')) return 'writing'
  if (p.startsWith('repository/')) return 'repository'
  if (p.startsWith('notes/')) return 'notes'
  return null
}
```

Briefing.tsx（替换 `{writingTab === 'notes' ? <NoteBoard /> : <WritingBoard />}`）：

```tsx
{(() => {
  const openRoot = writingFilePath ? writingRootOf(writingFilePath) : null
  if (openRoot === 'notes') return <NoteBoard />
  if (openRoot) return <WritingBoard />
  // 无打开文件：笔记 tab 落专辑墙（Task 5 挂载 NotesWall，本任务先维持 NoteBoard 空态）
  return writingTab === 'notes' ? <NoteBoard /> : <WritingBoard />
})()}
```

（在 Briefing 组件内取 `const writingFilePath = useStore(s => s.writingFile?.path)`；import `writingRootOf`。）

WritingListColumn.tsx 的 auto-select effect——`last` 恢复前加根守卫：

```ts
const last = useStore.getState().lastWritingFile
// 根守卫：lastWritingFile 可能是笔记路径（notes/），文章/仓库 tab 下不恢复
if (last && writingRootOf(last) !== 'notes' && writingTreeContainsPath(tree, last)) { selectWritingFile(last); return }
```

（import `writingRootOf`；`firstWritingFilePath` 兜底逻辑不变。）

- [ ] **Step 4: 跑测试**

Run: `npx vitest run tests/writing-tree-utils.test.ts tests/writing-list-column.test.tsx`
Expected: PASS

---

### Task 3: NoteCover 封面解析（纯函数 + 共用组件）

封面规则全场景统一：`source === 'anthropic'` 按 `meta.url` 查 `anthropicBlogCache.articleMetaCache` 的 `imageUrl`（精确匹配，失配试 trailing-slash 变体）；其余来源/未命中 → 来源色渐变。SOURCE_COLOR 从 NoteCard.tsx 上移到此共用（Task 4 删 NoteCard 后不留孤儿）。

**Files:**
- Create: `src/lib/note-cover.ts`
- Create: `src/components/notes/NoteCover.tsx`
- Test: `tests/note-cover.test.ts`

**Interfaces:**
- Produces:
  - `noteCoverImageUrl(url: string, cache: Record<string, { imageUrl: string | null }> | undefined): string | null`
  - `NOTE_COVER_COLOR: Record<NoteSource, string>`（值 = 现 NoteCard 的 SOURCE_COLOR）
  - `<NoteCover entry={NoteEntry} className? style? />` —— Task 4（封面行缩略）、Task 5（专辑墙封面）、Task 7（picker 笔记行）共用。

- [ ] **Step 1: 写失败测试**

`tests/note-cover.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { noteCoverImageUrl } from '@/lib/note-cover'

const cache = {
  'https://www.anthropic.com/engineering/foo': { imageUrl: 'https://cdn.example.com/foo.png' },
  'https://www.anthropic.com/engineering/bar/': { imageUrl: 'https://cdn.example.com/bar.png' },
  'https://www.anthropic.com/engineering/none': { imageUrl: null },
}

describe('noteCoverImageUrl', () => {
  it('精确命中返回 imageUrl', () => {
    expect(noteCoverImageUrl('https://www.anthropic.com/engineering/foo', cache)).toBe('https://cdn.example.com/foo.png')
  })
  it('trailing-slash 变体兜底命中', () => {
    expect(noteCoverImageUrl('https://www.anthropic.com/engineering/bar', cache)).toBe('https://cdn.example.com/bar.png')
  })
  it('imageUrl 为 null 或缓存未命中返回 null', () => {
    expect(noteCoverImageUrl('https://www.anthropic.com/engineering/none', cache)).toBe(null)
    expect(noteCoverImageUrl('https://example.com/x', cache)).toBe(null)
    expect(noteCoverImageUrl('https://x.com', undefined)).toBe(null)
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run tests/note-cover.test.ts`
Expected: FAIL（模块不存在）

- [ ] **Step 3: 实现**

`src/lib/note-cover.ts`:

```ts
import type { NoteSource } from '@shared/index'

/** 封面来源色（与旧 NoteCard 的 SOURCE_COLOR 一致，anthropic 另有博客封面优先） */
export const NOTE_COVER_COLOR: Record<NoteSource, string> = {
  anthropic: '#d97757',
  web: '#7a9cc6',
  book: '#8fae8b',
  unknown: '#6b5d52',
}

/** 按笔记 url 查 articleMetaCache 的博客封面；失配试 trailing-slash 变体 */
export function noteCoverImageUrl(
  url: string,
  cache: Record<string, { imageUrl: string | null }> | undefined,
): string | null {
  if (!cache) return null
  const direct = cache[url]?.imageUrl
  if (direct) return direct
  const alt = url.endsWith('/') ? url.slice(0, -1) : url + '/'
  return cache[alt]?.imageUrl ?? null
}
```

`src/components/notes/NoteCover.tsx`:

```tsx
import type { CSSProperties } from 'react'
import { useStore } from '@/store'
import type { NoteEntry } from '@shared/index'
import { NOTE_COVER_COLOR, noteCoverImageUrl } from '@/lib/note-cover'

/** 笔记封面：anthropic 优先博客封面图，其余来源（或未命中）来源色渐变。墙/列/picker 共用。 */
export function NoteCover({ entry, className, style }: { entry: NoteEntry; className?: string; style?: CSSProperties }) {
  const cache = useStore(s => s.anthropicBlogCache.articleMetaCache)
  const img = entry.meta.source === 'anthropic' ? noteCoverImageUrl(entry.meta.url, cache) : null
  if (img) {
    return <img src={img} alt="" loading="lazy" decoding="async" className={className} style={{ objectFit: 'cover', ...style }} />
  }
  const c = NOTE_COVER_COLOR[entry.meta.source]
  return (
    <div
      aria-hidden
      className={className}
      style={{ background: `linear-gradient(135deg, ${c}59, ${c}26 55%, #1a120d)`, ...style }}
    />
  )
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `npx vitest run tests/note-cover.test.ts`
Expected: PASS

---

### Task 4: 第二列笔记页重写（封面行 + 两行工具栏 + 对照分派）

NotesShelf 重写：两行工具栏（行1 分类下拉 + ＋新笔记；行2 ⬆导入图标 + 排序下拉），条目改为封面行（NoteCover 缩略 + 标题一行 + 星标·日期）。点击分派与 WritingTree 同规则：对照 armed（右栏展开且对照 tab）→ `selectCompanionFile`，否则 `selectWritingFile`。删除入口沿用 hover ✕ + ConfirmDialog。过滤/排序逻辑提取为 lib 纯函数（Task 5 NotesWall 复用）。NoteCard.tsx 被取代后删除（本次改动造成的孤儿，随本任务清理）。

**Files:**
- Create: `src/lib/notes-list.ts`
- Create: `src/components/notes/NoteRow.tsx`
- Modify: `src/components/notes/NotesShelf.tsx`（整体重写）
- Delete: `src/components/notes/NoteCard.tsx`
- Test: `tests/notes-list.test.ts`（新建）、`tests/notes-shelf.test.tsx`（新建）

**Interfaces:**
- Consumes: `<NoteCover />`（Task 3）、`selectCompanionFile`（store，已有）
- Produces: `sortNotes(list: NoteEntry[], sortBy: 'time' | 'rating', category: 'all' | NoteSource): NoteEntry[]` —— Task 5 复用。

- [ ] **Step 1: 写失败测试（纯函数 + 分派）**

`tests/notes-list.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { sortNotes } from '@/lib/notes-list'
import type { NoteEntry } from '@shared/index'

const mk = (path: string, source: NoteEntry['meta']['source'], rating: number, collected_at: string): NoteEntry => ({
  path, meta: { title: path, url: '', source, rating, summary: '', highlight: '', collected_at },
})

const list = [
  mk('notes/a.md', 'web', 3, '2026-09-01'),
  mk('notes/b.md', 'anthropic', 5, '2026-09-03'),
  mk('notes/c.md', 'web', 4, '2026-09-02'),
]

describe('sortNotes', () => {
  it('time：按收录时间倒序', () => {
    expect(sortNotes(list, 'time', 'all').map(e => e.path)).toEqual(['notes/b.md', 'notes/c.md', 'notes/a.md'])
  })
  it('rating：星标倒序，同分按时间倒序', () => {
    expect(sortNotes(list, 'rating', 'all').map(e => e.path)).toEqual(['notes/b.md', 'notes/c.md', 'notes/a.md'])
  })
  it('分类过滤', () => {
    expect(sortNotes(list, 'time', 'web').map(e => e.path)).toEqual(['notes/c.md', 'notes/a.md'])
  })
})
```

`tests/notes-shelf.test.tsx`（分派规则；jsdom 组件测试，模式照抄 `tests/writing-tree-companion.test.tsx` 的 store setState 注入）：

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, fireEvent } from '@testing-library/react'
import { useStore } from '@/store'
import { NotesShelf } from '@/components/notes/NotesShelf'
import type { NoteEntry } from '@shared/index'

const entry: NoteEntry = {
  path: 'notes/a.md',
  meta: { title: 'A', url: 'https://x.com/a', source: 'web', rating: 3, summary: '', highlight: '', collected_at: '2026-09-01' },
}

beforeEach(() => {
  useStore.setState({
    notesList: [entry], notesCategory: 'all', notesSortBy: 'time',
    writingAssistantOpen: false, writingPanelMode: 'assistant', writingFile: null,
  })
})

describe('NotesShelf 点击分派', () => {
  it('常态点击打开主文', () => {
    const spy = vi.fn()
    useStore.setState({ selectWritingFile: spy })
    const { getByTestId } = render(<NotesShelf />)
    fireEvent.click(getByTestId('note-card-a'))
    expect(spy).toHaveBeenCalledWith('notes/a.md')
  })
  it('对照 armed 点击放入对照槽', () => {
    const spy = vi.fn()
    useStore.setState({ writingAssistantOpen: true, writingPanelMode: 'companion', selectCompanionFile: spy })
    const { getByTestId } = render(<NotesShelf />)
    fireEvent.click(getByTestId('note-card-a'))
    expect(spy).toHaveBeenCalledWith('notes/a.md')
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run tests/notes-list.test.ts tests/notes-shelf.test.tsx`
Expected: FAIL（模块/组件不存在）

- [ ] **Step 3: 实现**

`src/lib/notes-list.ts`:

```ts
import type { NoteEntry, NoteSource } from '@shared/index'

/** 笔记列表过滤 + 排序（NotesShelf 封面行与 NotesWall 专辑墙共用，保证两侧顺序一致） */
export function sortNotes(list: NoteEntry[], sortBy: 'time' | 'rating', category: 'all' | NoteSource): NoteEntry[] {
  const out = list.filter(e => category === 'all' || e.meta.source === category)
  if (sortBy === 'rating') {
    out.sort((a, b) => b.meta.rating - a.meta.rating || b.meta.collected_at.localeCompare(a.meta.collected_at))
  } else {
    out.sort((a, b) => b.meta.collected_at.localeCompare(a.meta.collected_at))
  }
  return out
}
```

`src/components/notes/NoteRow.tsx`（封面行；testid 沿用 `note-card-<slug>` 减少 E2E churn；SOURCE_LABEL 从旧 NoteCard 迁入）：

```tsx
import { useState } from 'react'
import { useStore } from '@/store'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { NoteCover } from './NoteCover'
import type { NoteEntry, NoteSource } from '@shared/index'

const SOURCE_LABEL: Record<NoteSource, string> = { anthropic: 'Anthropic', web: '网页', book: '书籍', unknown: '未知' }

function urlSlug(url: string): string {
  return url.split('/').pop() || 'note'
}

export function NoteRow({ entry, onOpen }: { entry: NoteEntry; onOpen: (path: string) => void }) {
  const deleteNoteAction = useStore(s => s.deleteNoteAction)
  const selected = useStore(s => s.writingFile?.path === entry.path)
  const [confirming, setConfirming] = useState(false)
  const { title, rating, source, collected_at } = entry.meta
  const slug = urlSlug(entry.meta.url)

  return (
    <>
      <div
        data-testid={`note-card-${slug}`}
        className="group relative flex items-center gap-2 px-1.5 py-1 rounded cursor-pointer"
        style={selected ? { background: 'rgba(217,119,87,.16)', boxShadow: 'inset 2px 0 0 #d97757' } : undefined}
        onClick={() => onOpen(entry.path)}
      >
        <NoteCover entry={entry} className="shrink-0 w-[18px] h-[24px] rounded-[2px]" />
        <div className="min-w-0 flex-1">
          <div className="truncate text-[11.5px] leading-snug text-parchment/90">{title}</div>
          <div className="mt-0.5 text-[9px] text-parchment/45">
            {rating > 0 ? '★'.repeat(rating) : '未评'} · {SOURCE_LABEL[source]} · {collected_at.slice(0, 10)}
          </div>
        </div>
        <button
          data-testid={`note-delete-${slug}`}
          title="删除笔记" aria-label="删除笔记"
          className="absolute top-0.5 right-1 opacity-0 group-hover:opacity-100 transition-opacity text-[11px] leading-none text-parchment/45"
          onClick={(e) => { e.stopPropagation(); setConfirming(true) }}
        >✕</button>
      </div>
      <ConfirmDialog
        open={confirming} title="删除笔记" icon="trash" confirmLabel="删除" confirmVariant="danger"
        onCancel={() => setConfirming(false)}
        onConfirm={() => { setConfirming(false); void deleteNoteAction(entry.path) }}
      >
        <p>确定删除笔记《{title}》？文件将被永久删除，无法恢复。</p>
      </ConfirmDialog>
    </>
  )
}
```

NotesShelf.tsx 重写要点（保留：loadNotes/createNoteManual/importReadNotesAction、两步 PromptDialog、`notes-empty` 空态文案；删 GROUP_SIZE 隔板与 pill 样式）：

```tsx
// 工具栏行 1
<div className="flex items-center gap-2 px-3 pt-2">
  <select
    data-testid="notes-category-select"
    value={notesCategory}
    onChange={(e) => setNotesCategory(e.target.value as 'all' | NoteSource)}
    className="bg-transparent text-[11px] text-parchment/80 border border-parchment/20 rounded px-1.5 py-0.5 outline-none"
  >
    <option value="all">全部</option>
    <option value="anthropic">Anthropic</option>
    <option value="web">网页</option>
    <option value="book">书籍</option>
    <option value="unknown">未知</option>
  </select>
  <button data-testid="notes-new-button" onClick={() => setNewNote({ step: 'title' })}
    className="ml-auto text-[11px] text-parchment border border-ember/50 bg-ember/15 rounded px-2 py-0.5">
    ＋ 新笔记
  </button>
</div>
// 工具栏行 2：导入纯图标在左，排序下拉在右
<div className="flex items-center gap-2 px-3 pt-1.5 pb-1">
  <button data-testid="notes-import-button" title="导入已读" aria-label="导入已读"
    onClick={() => { void importReadNotesAction() }}
    className="text-[11px] text-parchment/60 hover:text-parchment border border-parchment/20 rounded px-1.5 py-0.5">
    ⬆
  </button>
  <select data-testid="notes-sort-select" value={notesSortBy}
    onChange={(e) => setNotesSortBy(e.target.value as 'time' | 'rating')}
    className="bg-transparent text-[11px] text-parchment/60 border border-parchment/20 rounded px-1.5 py-0.5 outline-none">
    <option value="time">时间</option>
    <option value="rating">星标</option>
  </select>
</div>
// 列表
<div className="px-1.5 pb-3">
  {sorted.length === 0 && notesList !== null && (
    <div data-testid="notes-empty" className="px-3 py-6 text-center text-[11px] text-parchment/40">
      {notesCategory === 'all' ? '书架还空着——点「导入已读」把读过的文章放上架' : '该分类下暂无笔记'}
    </div>
  )}
  {sorted.map(entry => <NoteRow key={entry.path} entry={entry} onOpen={handleOpen} />)}
</div>
```

`sorted` 改为 `useMemo(() => sortNotes(notesList ?? [], notesSortBy, notesCategory), [notesList, notesSortBy, notesCategory])`；`handleOpen`：

```ts
const assistantOpen = useStore(s => s.writingAssistantOpen)
const panelMode = useStore(s => s.writingPanelMode)
const selectWritingFile = useStore(s => s.selectWritingFile)
const selectCompanionFile = useStore(s => s.selectCompanionFile)
// 对照 armed 时点击 = 放入对照槽（与 WritingTree 同规则）
const handleOpen = (path: string) => {
  if (assistantOpen && panelMode === 'companion') void selectCompanionFile(path)
  else void selectWritingFile(path)
}
```

theme prop 保留签名但本任务只实现 academic 配色（newspaper 主题下笔记 tab 原本就复用 parchment 色系 pill，保持现状色系即可）。

- [ ] **Step 4: 跑测试确认通过**

Run: `npx vitest run tests/notes-list.test.ts tests/notes-shelf.test.tsx tests/notes.test.ts`
Expected: PASS

- [ ] **Step 5: 删 NoteCard.tsx，全局搜引用确认无残留**

Run: `rg -l "NoteCard" src tests e2e`
Expected: 无输出（如有引用，改完再删）

---

### Task 5: 主区专辑墙 NotesWall

无打开笔记且左栏在笔记 tab 时，主区渲染专辑墙：3:4 专辑卡网格（NoteCover 大封面 + 底部压暗渐变上的标题 + 星标），点击打开正文页。与第二列共享 sortNotes/分类/排序状态，两侧永远一致。空态复用 `notes-empty` 文案。

**Files:**
- Create: `src/components/notes/NotesWall.tsx`
- Modify: `src/pages/Briefing.tsx`（Task 2 的占位分支换 NotesWall）
- Test: `tests/notes-wall.test.tsx`（新建）

**Interfaces:**
- Consumes: `sortNotes`（Task 4）、`<NoteCover />`（Task 3）、`writingRootOf`（Task 2）

- [ ] **Step 1: 写失败测试**

`tests/notes-wall.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, fireEvent } from '@testing-library/react'
import { useStore } from '@/store'
import { NotesWall } from '@/components/notes/NotesWall'
import type { NoteEntry } from '@shared/index'

const mk = (slug: string, source: NoteEntry['meta']['source']): NoteEntry => ({
  path: `notes/${slug}.md`,
  meta: { title: `标题${slug}`, url: `https://x.com/${slug}`, source, rating: 4, summary: '', highlight: '', collected_at: '2026-09-01' },
})

beforeEach(() => {
  useStore.setState({ notesList: [mk('a', 'web'), mk('b', 'book')], notesCategory: 'all', notesSortBy: 'time', writingFile: null })
})

describe('NotesWall', () => {
  it('渲染全部专辑卡', () => {
    const { getByTestId } = render(<NotesWall />)
    expect(getByTestId('wall-album-a')).toBeTruthy()
    expect(getByTestId('wall-album-b')).toBeTruthy()
  })
  it('点专辑打开正文', () => {
    const spy = vi.fn()
    useStore.setState({ selectWritingFile: spy })
    const { getByTestId } = render(<NotesWall />)
    fireEvent.click(getByTestId('wall-album-a'))
    expect(spy).toHaveBeenCalledWith('notes/a.md')
  })
  it('空列表显示空态', () => {
    useStore.setState({ notesList: [] })
    const { getByTestId } = render(<NotesWall />)
    expect(getByTestId('notes-empty')).toBeTruthy()
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run tests/notes-wall.test.tsx`
Expected: FAIL（组件不存在）

- [ ] **Step 3: 实现**

```tsx
import { useMemo } from 'react'
import { useStore } from '@/store'
import { sortNotes } from '@/lib/notes-list'
import { NoteCover } from './NoteCover'

function urlSlug(url: string): string {
  return url.split('/').pop() || 'note'
}

/** 主区专辑墙：无打开笔记时的笔记主页。排序/分类与第二列封面行共享 store 状态。 */
export function NotesWall() {
  const notesList = useStore(s => s.notesList)
  const notesCategory = useStore(s => s.notesCategory)
  const notesSortBy = useStore(s => s.notesSortBy)
  const selectWritingFile = useStore(s => s.selectWritingFile)

  const sorted = useMemo(() => sortNotes(notesList ?? [], notesSortBy, notesCategory), [notesList, notesSortBy, notesCategory])

  if (sorted.length === 0 && notesList !== null) {
    return (
      <div data-testid="notes-empty" className="flex h-full items-center justify-center px-6">
        <p className="text-center text-parchment/40 text-sm">
          {notesCategory === 'all' ? '书架还空着——点左侧「导入已读」把读过的文章放上架' : '该分类下暂无笔记'}
        </p>
      </div>
    )
  }

  return (
    <div data-testid="notes-wall" className="h-full overflow-y-auto px-8 py-6">
      <div className="grid gap-5" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))' }}>
        {sorted.map(entry => (
          <button
            key={entry.path}
            data-testid={`wall-album-${urlSlug(entry.meta.url)}`}
            className="group relative rounded-md overflow-hidden text-left transition-transform hover:-translate-y-0.5"
            style={{ aspectRatio: '3/4', boxShadow: '0 6px 16px rgba(0,0,0,.5)' }}
            onClick={() => { void selectWritingFile(entry.path) }}
          >
            <NoteCover entry={entry} className="absolute inset-0 w-full h-full" />
            <div className="absolute inset-0" style={{ background: 'linear-gradient(180deg, rgba(20,12,8,0) 40%, rgba(20,12,8,.88))' }} />
            <div className="absolute inset-x-0 bottom-0 p-2.5">
              <div className="text-[12px] leading-snug text-[#f0e2c8] line-clamp-2">{entry.meta.title}</div>
              <div className="mt-1 text-[10px] text-parchment/60">
                {entry.meta.rating > 0 ? '★'.repeat(entry.meta.rating) : '未评'}
              </div>
            </div>
          </button>
        ))}
      </div>
    </div>
  )
}
```

Briefing.tsx：Task 2 的兜底分支 `return writingTab === 'notes' ? <NoteBoard /> : <WritingBoard />` 改为 `return writingTab === 'notes' ? <NotesWall /> : <WritingBoard />`（import NotesWall）。

- [ ] **Step 4: 跑测试确认通过**

Run: `npx vitest run tests/notes-wall.test.tsx`
Expected: PASS

---

### Task 6: 阅读室正文页（NoteBoard + NoteMetaHeader 重构）

正文页改阅读室布局：顶条（← 返回笔记墙 + 面包屑 + 保存状态），居中窄栏（约 680px）内依次为大标题、元信息一行（StarRating + 来源徽标 + 日期 + ⓘ）、题辞式摘要输入、正文编辑器。「来源链接 / 核心亮点」收进 ⓘ 弹层（NoteMetaHeader 内的小弹卡，testid 沿用 `note-meta-url` / `note-meta-highlight`）。NoteMetaHeader 重写但保留文件名与 props。

**Files:**
- Modify: `src/components/notes/NoteBoard.tsx`（布局 + 顶条 + 返回）
- Modify: `src/components/notes/NoteMetaHeader.tsx`（整体重写）
- Test: `tests/note-board.test.tsx`（新建）

**Interfaces:**
- Consumes: `selectWritingFile(null)` 语义 = 清当前文件回专辑墙（store 已有，`!filePath` 分支直接 set null）。
- Produces: testid `note-back-to-wall`、`note-meta-info-toggle`（E2E 用）。

- [ ] **Step 1: 写失败测试**

`tests/note-board.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, fireEvent } from '@testing-library/react'
import { useStore } from '@/store'
import { NoteBoard } from '@/components/notes/NoteBoard'
import type { NoteEntry } from '@shared/index'

vi.mock('@/components/writing/WritingEditor', () => ({ WritingEditor: () => null }))

const entry: NoteEntry = {
  path: 'notes/a.md',
  meta: { title: 'A', url: 'https://x.com/a', source: 'anthropic', rating: 4, summary: '摘要', highlight: '亮点', collected_at: '2026-09-01' },
}

beforeEach(() => {
  useStore.setState({
    notesList: [entry],
    writingFile: { path: 'notes/a.md', body: '# 正文', kind: 'md', dirty: false, saving: 'idle' },
    updateWritingBody: vi.fn(), saveWritingFile: vi.fn(),
  })
})

describe('NoteBoard 阅读室', () => {
  it('返回按钮清空当前文件回专辑墙', () => {
    const spy = vi.fn()
    useStore.setState({ selectWritingFile: spy })
    const { getByTestId } = render(<NoteBoard />)
    fireEvent.click(getByTestId('note-back-to-wall'))
    expect(spy).toHaveBeenCalledWith(null)
  })
  it('链接/亮点输入收在 ⓘ 弹层，默认不可见，点 toggle 可见', () => {
    const { getByTestId, queryByTestId } = render(<NoteBoard />)
    expect(queryByTestId('note-meta-url')).toBeNull()
    fireEvent.click(getByTestId('note-meta-info-toggle'))
    expect(getByTestId('note-meta-url')).toBeTruthy()
    expect(getByTestId('note-meta-highlight')).toBeTruthy()
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run tests/note-board.test.tsx`
Expected: FAIL（testid 不存在）

- [ ] **Step 3: 实现**

NoteBoard.tsx（保留 autosave effect 与无文件空态兜底；空态主路径已上移到 NotesWall）：

```tsx
return (
  <div data-testid="note-board" className="flex flex-col h-full">
    <div className="flex items-center gap-2 px-3 h-9 border-b border-parchment/10 shrink-0">
      <button
        data-testid="note-back-to-wall"
        className="text-[11px] text-ember hover:text-ember/80"
        onClick={() => { void selectWritingFile(null) }}
      >
        ← 笔记墙
      </button>
      <span className="text-[10px] text-parchment/35 truncate">笔记 / {entry.meta.title}</span>
      <span className="ml-auto text-[10px]">
        {file.saving === 'saving' ? <span className="text-parchment/50">保存中…</span>
         : file.saving === 'saved' ? <span className="text-emerald-400/70">已保存 ✓</span>
         : file.saving === 'error' ? <span className="text-red-400/70">保存失败</span>
         : null}
      </span>
    </div>
    <div className="flex-1 min-h-0 overflow-y-auto">
      <div className="mx-auto px-6 py-8" style={{ maxWidth: 680 }}>
        <NoteMetaHeader key={entry.path} entry={entry} />
        <WritingEditor key={file.path} initial={file.body} onChange={md => updateWritingBody(md)} theme="academic" filePath={file.path} />
      </div>
    </div>
  </div>
)
```

（组件内补 `const selectWritingFile = useStore(s => s.selectWritingFile)`；原 saving 行删除。）

NoteMetaHeader.tsx 重写（保留全部 onBlur 更新逻辑；布局改：大标题 → 元信息行 → 题辞摘要 → ⓘ 弹层）：

```tsx
import { useState } from 'react'
import { useStore } from '@/store'
import type { NoteEntry } from '@shared/index'
import { StarRating } from './StarRating'

export function NoteMetaHeader({ entry }: { entry: NoteEntry }) {
  const updateNoteMetaAction = useStore(s => s.updateNoteMetaAction)
  const { path, meta } = entry
  const [infoOpen, setInfoOpen] = useState(false)

  const inputCls = 'bg-transparent outline-none border-none min-w-0 placeholder:text-parchment/25'

  return (
    <div className="relative pb-5">
      <input
        data-testid="note-meta-title"
        className={`${inputCls} w-full text-2xl text-[#f0e2c8]`}
        defaultValue={meta.title}
        placeholder="未命名笔记"
        onBlur={e => { if (e.target.value !== meta.title) void updateNoteMetaAction(path, { title: e.target.value }) }}
      />
      <div className="mt-2 flex items-center gap-3 text-[11px] text-parchment/40">
        <StarRating value={meta.rating} size={14} onChange={v => void updateNoteMetaAction(path, { rating: v })} />
        {meta.source === 'anthropic' && (
          <span className="text-[10px] px-2 leading-4 rounded-full bg-[#d97757]/20 text-[#e09a7e] border border-[#d97757]/45">Anthropic</span>
        )}
        <span>{meta.read_at ? `读完于 ${meta.read_at.slice(0, 10)} · ` : ''}收录于 {meta.collected_at.slice(0, 10)}</span>
        <button
          data-testid="note-meta-info-toggle"
          title="链接与亮点" aria-label="链接与亮点"
          className="ml-auto text-parchment/45 hover:text-parchment"
          onClick={() => setInfoOpen(o => !o)}
        >ⓘ</button>
      </div>
      <input
        data-testid="note-meta-summary"
        className={`${inputCls} mt-3 w-full text-[13px] italic text-parchment/75 border-l-2 border-ember/70 pl-3 py-1 bg-ember/5 rounded-r`}
        defaultValue={meta.summary}
        placeholder="尚未评注…"
        onBlur={e => { if (e.target.value !== meta.summary) void updateNoteMetaAction(path, { summary: e.target.value }) }}
      />
      {infoOpen && (
        <div className="absolute right-0 top-full z-20 mt-1 w-72 rounded border border-parchment/15 bg-[#1a1512] p-3 shadow-xl">
          <label className="block">
            <div className="text-[10px] tracking-[0.2em] text-ember/75 mb-1">来源链接</div>
            <input
              data-testid="note-meta-url"
              className={`${inputCls} w-full text-[12px] text-[#b08a6a] border-b border-parchment/10 pb-1`}
              defaultValue={meta.url}
              placeholder="来源链接"
              onBlur={e => { if (e.target.value !== meta.url) void updateNoteMetaAction(path, { url: e.target.value }) }}
            />
          </label>
          <label className="block mt-3">
            <div className="text-[10px] tracking-[0.2em] text-ember/75 mb-1">核心亮点</div>
            <input
              data-testid="note-meta-highlight"
              className={`${inputCls} w-full text-[12px] italic text-parchment/85 border-b border-parchment/10 pb-1`}
              defaultValue={meta.highlight}
              placeholder="尚未评注…"
              onBlur={e => { if (e.target.value !== meta.highlight) void updateNoteMetaAction(path, { highlight: e.target.value }) }}
            />
          </label>
        </div>
      )}
    </div>
  )
}
```

（原 `toDate` helper 不再需要——直接 slice。）

- [ ] **Step 4: 跑测试确认通过**

Run: `npx vitest run tests/note-board.test.tsx`
Expected: PASS

---

### Task 7: 博客侧统一——picker 补笔记区 + 落点统一

两件事：① CompanionWritingPicker 增加「笔记」区（notesList 行，NoteCover 缩略 + 标题），点击走同一 `onPickFile` → `selectArticleCompanion`（Task 1 已打通 notes 读取）。② 落点统一：博客对照 tab 激活时点来源栏「写作」永远开挑选器（放宽 `companionPickerTarget` 对 `articleAssistantGuideCollapsed` 的硬拒绝——collapsed 时先展开右栏再开挑选器），不再整页跳进写作页。

**Files:**
- Modify: `src/components/article-assistant/CompanionWritingPicker.tsx`
- Modify: `src/lib/companion-picker.ts`
- Modify: `src/components/BriefingSourceSidebar.tsx:38-56`（handleNavClick）
- Test: `tests/companion-picker.test.ts`（已有，改断言）、`tests/companion-writing-picker.test.tsx`（新建）

**Interfaces:**
- Consumes: `<NoteCover />`（Task 3）、`sortNotes`（Task 4）、`setArticleAssistantGuideCollapsed`（store，已有）
- Produces: picker 内笔记行 testid `picker-note-<slug>`（E2E 用）。

- [ ] **Step 1: 改/写失败测试**

`tests/companion-picker.test.ts`——把「collapsed 时返回 null」用例改为「collapsed 不拒绝（由调用方展开右栏）」：

```ts
it('博客对照 tab 激活即具备挑选资格（collapsed 不拒绝）', () => {
  expect(companionPickerTarget({
    briefingSource: 'anthropic',
    articlePanelMode: { anthropic: 'companion' },
    articleAssistantGuideCollapsed: true,
    anthropicReaderFilePath: 'foo.md',
  })).toBe('anthropic')
})
```

`tests/companion-writing-picker.test.tsx`：

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, fireEvent } from '@testing-library/react'
import { useStore } from '@/store'
import { CompanionWritingPicker } from '@/components/article-assistant/CompanionWritingPicker'
import type { NoteEntry } from '@shared/index'

const note: NoteEntry = {
  path: 'notes/n1.md',
  meta: { title: '笔记一', url: 'https://x.com/n1', source: 'web', rating: 0, summary: '', highlight: '', collected_at: '2026-09-01' },
}

beforeEach(() => {
  useStore.setState({ notesList: [note], notesCategory: 'all', notesSortBy: 'time', writingTree: null, loadNotes: vi.fn(), loadWritingTree: vi.fn() })
})

describe('CompanionWritingPicker 笔记区', () => {
  it('列出笔记，点击交给 onPickFile', () => {
    const onPick = vi.fn()
    const { getByTestId } = render(<CompanionWritingPicker onPickFile={onPick} />)
    fireEvent.click(getByTestId('picker-note-n1'))
    expect(onPick).toHaveBeenCalledWith('notes/n1.md')
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run tests/companion-picker.test.ts tests/companion-writing-picker.test.tsx`
Expected: FAIL

- [ ] **Step 3: 实现**

companion-picker.ts（放宽 collapsed 硬拒绝，注释同步更新）：

```ts
// 全部满足才可挑选：当前 source 是博客栏目 + 右栏处于对照 tab + 主区有在读文章。
// collapsed 不再拒绝——由调用方（sidebar）先展开右栏再开挑选器（2026-10-22 落点统一）。
export function companionPickerTarget(s: CompanionPickerState): CompanionPickerKey | null {
  if (s.briefingSource === 'anthropic') {
    return s.articlePanelMode.anthropic === 'companion' && s.anthropicReaderFilePath ? 'anthropic' : null
  }
  return null
}
```

BriefingSourceSidebar.tsx handleNavClick，`if (target) { ... }` 分支改为：

```ts
if (target) {
  if (s.articleAssistantGuideCollapsed) s.setArticleAssistantGuideCollapsed(false)
  s.openWritingCompanionPicker(target)
  return
}
```

CompanionWritingPicker.tsx 追加笔记区（仓库树之后；`noop` 复用）：

```tsx
const notesList = useStore(s => s.notesList)
const notesCategory = useStore(s => s.notesCategory)
const notesSortBy = useStore(s => s.notesSortBy)
const loadNotes = useStore(s => s.loadNotes)
useEffect(() => { void loadNotes() }, [loadNotes])
const sortedNotes = useMemo(() => sortNotes(notesList ?? [], notesSortBy, notesCategory), [notesList, notesSortBy, notesCategory])
```

```tsx
<p className={sectionCls}>笔记</p>
{sortedNotes.map(entry => (
  <button
    key={entry.path}
    data-testid={`picker-note-${entry.meta.url.split('/').pop() || 'note'}`}
    className={`w-full flex items-center gap-2 px-3 py-1 text-left text-[11px] ${isAcademic ? 'text-parchment/80 hover:bg-parchment/5' : 'text-[#2a1f1a] hover:bg-black/5'}`}
    onClick={() => onPickFile(entry.path)}
  >
    <NoteCover entry={entry} className="shrink-0 w-[14px] h-[19px] rounded-[2px]" />
    <span className="truncate">{entry.meta.title}</span>
  </button>
))}
```

（import useMemo、sortNotes、NoteCover。）

- [ ] **Step 4: 跑测试确认通过**

Run: `npx vitest run tests/companion-picker.test.ts tests/companion-writing-picker.test.tsx tests/writing-companion.test.ts tests/writing-tree-companion.test.tsx`
Expected: PASS

---

### Task 8: E2E 同步 + source-map + 定向回归

**Files:**
- Modify: `e2e/specs/notes-bookshelf.spec.ts`
- Modify: `e2e/specs/article-companion-writing-picker.spec.ts`
- Modify: `e2e/source-map.json`

- [ ] **Step 1: 更新 notes-bookshelf.spec.ts**

改动点：
- `notes-cat-anthropic` / `notes-cat-unknown` / `notes-cat-all` 三次 pill 点击 → 改用下拉框：`await window.locator('[data-testid="notes-category-select"]').selectOption('anthropic')`（unknown / all 同理）。
- `note-card-*` / `notes-empty` / `notes-import-button` testid 未更名，断言保留。`note-badge-<source>` 已随 NoteCard 删除——封面行不再渲染来源徽标 chip（来源色体现在封面），该行断言改为断言副行文本：`await expect(window.locator('[data-testid="note-card-a"]')).toContainText('Anthropic')`。
- 追加专辑墙断言：切到笔记 tab 且无打开文件时主区可见 `[data-testid="notes-wall"]`；点 `wall-album-a` 打开正文；点 `note-back-to-wall` 回到墙。
- 元信息编辑：`note-meta-summary` 仍在（题辞位置），`note-meta-url` 改在 ⓘ 弹层——如有用到先点 `note-meta-info-toggle`。

- [ ] **Step 2: 更新 article-companion-writing-picker.spec.ts**

追加用例：seed 一条笔记（notes 目录造文件，fixture helpers 参考 notes-bookshelf.spec.ts），打开 picker 后断言 `[data-testid="picker-note-<slug>"]` 可见，点击后 `[data-testid="article-companion-board"]` 显示该笔记文件名。

- [ ] **Step 3: 更新 source-map.json**

`notes` group 的 `files` 追加 `"src/lib/note-cover.ts"` 与 `"src/lib/notes-list.ts"`；companion 相关 group（覆盖 `src/lib/companion-picker.ts` 的 group）确认在列，不新增 spec 文件则不动 specs 列表。

- [ ] **Step 4: 定向回归**

Run: `node scripts/e2e-changed.js --run`
Expected: notes / companion 相关 spec 全绿

---

## Self-Review 记录

- Spec 覆盖：① 主页专辑墙 → Task 5；② 两行工具栏（下拉/排序行/导入图标左置）→ Task 4；③ 直观总览 → Task 5；④ 正文页 → Task 6；⑤ 第二列封面行 → Task 4；⑥ 封面规则（anthropic 博客封面）→ Task 3；⑦ 对照五统一 → Task 1/2/4/7。无缺口。
- 类型一致性：`sortNotes` / `noteCoverImageUrl` / `writingRootOf` / `NoteCover` props 在 Produces/Consumes 与实现块一致。
- 已知取舍：B 方案原稿「整页无第二列」经用户后续要求修正为「第二列保留 + 主区专辑墙」混合结构，spec §页面结构已注明。
