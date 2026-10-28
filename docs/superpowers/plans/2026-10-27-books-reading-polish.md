---
status: historical
note: 已于 2026-10-27 执行完成（全部 7 个任务）；当前事实以代码、AGENTS.md 与 docs/README.md 为准
---

# 书籍来源体验打磨 Implementation Plan

> **For agentic workers:** 按任务顺序执行；每个任务先写失败测试再实现（TDD）。步骤用 `- [ ]` 跟踪。

**Goal:** 修复书籍来源 5 项走查问题：折叠列内容泄露、导读生成无可视化、PDF 正文挤成一坨、书籍对照缺新建笔记入口、长文本截断无出口。

**Architecture:** 折叠修复下沉到 `BriefingListColumn`（一处修复，三处受益）。PDF 文本重建抽成 `book-parse.ts` 的纯函数管线（items → lines → paragraphs → markdown），`books.ts` 只做 IO，旧书通过 `books:reparse` 原地重解析。导读可视化新增纯展示组件 `GuideCompass`，只消费现有 `GuideProgress`（searching 阶段加可选 `queries`/`hits`）。对照笔记入口通过泛化 `CompanionWritingPicker` 的 `currentTarget` + `onCreateNote` 实现。截断用自建 portal Tooltip。

**Tech Stack:** React 18 + Zustand、Electron 30 主进程、pdfjs-dist 4.10.38、Vitest + Testing Library、Playwright。

**Spec:** `docs/superpowers/specs/2026-10-27-books-reading-polish-design.md`

## Global Constraints

- **保留 `data-testid="guide-progress"` 及其文本**：`tests/GuideSidebar.test.tsx`、`e2e/specs/books.spec.ts` 依赖。
- 不改 `GuideProgress` 既有字段语义；新增字段一律可选。
- 不改导入数据模型（`book.json.toc` 结构不动）；只加 `parserVersion?: number`。
- 所有写库操作走 tmp + rename，路径经 `assertInsideBooks` 校验。
- 定向测试：改哪个文件跑哪个测试，不跑全量；`vitest run tests/xxx.test.ts`。
- 新建/修改 E2E spec 后同步 `e2e/source-map.json`。
- 文案、字号沿用 `--briefing-body-size` 锚定（导读侧栏字号体系），不硬编码 px。

---

### Task 1: 折叠列不渲染内容

**Files:**
- Modify: `src/components/BriefingListColumn.tsx`
- Test: `tests/briefing-list-column.test.tsx`（新增）

- [ ] **Step 1: 写失败测试**

```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { BriefingListColumn } from '../src/components/BriefingListColumn'

describe('BriefingListColumn collapse', () => {
  it('折叠时不渲染 children', () => {
    render(
      <BriefingListColumn collapsed theme="academic" title="书籍">
        <div data-testid="inside">内容</div>
      </BriefingListColumn>
    )
    expect(screen.queryByTestId('inside')).toBeNull()
    expect(screen.getByTestId('briefing-list-column-toggle')).toBeTruthy()
  })
  it('展开时渲染 children', () => {
    render(
      <BriefingListColumn collapsed={false} theme="academic" title="书籍">
        <div data-testid="inside">内容</div>
      </BriefingListColumn>
    )
    expect(screen.getByTestId('inside')).toBeTruthy()
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

`npx vitest run tests/briefing-list-column.test.tsx`

- [ ] **Step 3: 实现**

内容区改为：

```tsx
<div className="flex-1 min-h-0 overflow-y-auto overscroll-contain"
  style={{ willChange: 'transform', transform: 'translateZ(0)' }}>
  {collapsed ? null : children}
</div>
```

（`overflow-y-auto` 在折叠态无事可滚，保留亦可；若滚动条有残留，折叠态换成 `overflow-hidden`。）

- [ ] **Step 4: 跑测试 + tsc**

`npx vitest run tests/briefing-list-column.test.tsx`、`npx tsc --noEmit`

- [ ] **Step 5: 手动验证三处调用方**（书籍 / 写作 / 博客），折叠后左侧只有 `▶`。

---

### Task 2: PDF 文本重建纯函数

**Files:**
- Modify: `electron/lib/book-parse.ts`（新增导出，不改已有函数签名）
- Test: `tests/book-text-lines.test.ts`（新增）

- [ ] **Step 1: 写失败测试**（fixture 取自 JTBD 真实文本）

```ts
import { itemsToLines, linesToParagraphs, paragraphsToMarkdown } from '../electron/lib/book-parse'

it('同一行两段文字按间距补空格', () => {
  const lines = itemsToLines([
    { str: 'target', transform: [1, 0, 0, 12, 100, 700], width: 36 },
    { str: 'audience.', transform: [1, 0, 0, 12, 140, 700], width: 50 }, // gap 4 < 0.35*12 → 不加
    { str: 'Next', transform: [1, 0, 0, 12, 300, 700], width: 26 },      // gap 110 → 加
  ])
  expect(lines[0]).toBe('targetaudience. Next')
})

it('去页码孤行并合并折行', () => {
  const paragraphs = linesToParagraphs([
    '5',
    'Personas will always have their place. If you want to create an advertisement that attracts 21-year-',
    'old men or 35-year-old professionals, personas will help create realistic representations of your',
    'target audience.',
    '',
    'But if you want to build a great software product, making crucial decisions',
  ])
  expect(paragraphs).toHaveLength(2)
  expect(paragraphs[0]).toBe('Personas will always have their place. If you want to create an advertisement that attracts 21-year-old men or 35-year-old professionals, personas will help create realistic representations of your target audience.')
  expect(paragraphs[1].startsWith('But if you want')).toBe(true)
})

it('中文段落不加空格拼接', () => {
  expect(linesToParagraphs(['这是第一行的结尾部分', '这是第二行的开始部分']))
    .toEqual(['这是第一行的结尾部分这是第二行的开始部分'])
})

it('段间空行', () => {
  expect(paragraphsToMarkdown(['甲段', '乙段'])).toBe('甲段\n\n乙段')
})
```

- [ ] **Step 2: 跑测试确认失败**

`npx vitest run tests/book-text-lines.test.ts`

- [ ] **Step 3: 实现**（`book-parse.ts`）

```ts
export interface RawTextItem { str?: string; transform?: number[]; width?: number; height?: number }

/** 一页 pdfjs items → 视觉行。按 y 聚类；同 y 按 x 排序；x 间隙 > 0.35×字号补空格；
 *  x 回退超过 0.5×字号（双栏换列）另起一行。 */
export function itemsToLines(items: RawTextItem[]): string[]

/** 行 → 段落：丢纯数字孤行（页码）、行尾连字符还原、未结束句合并（英文补空格、中文不补）、
 *  空行分段；字号显著大于中位数的短行加 `### ` 前缀。 */
export function linesToParagraphs(lines: string[], opts?: { pageNo?: number }): string[]

export function paragraphsToMarkdown(paras: string[]): string
```

关键正则：

- 页码：`/^\d{1,4}$/`
- 连字符：`/([A-Za-z])-$/` 且下一行以 `[a-z]` 开头 → 去掉 `-` 直接拼接
- 句末：`/[。！？.!?:"'”’)）\]】]$/`
- 中文判定：`/[一-鿿]/`

- [ ] **Step 4: 跑测试 + 补边界用例**（空 items、单 item、全数字页）

---

### Task 3: 导入管线接入 + 旧书重解析

**Files:**
- Modify: `electron/lib/books.ts`（`extractPagesText` 改用新管线；`buildChapterBody` 不变；`parserVersion`；`reparseBook`）
- Modify: `electron/ipc/books.ts`（`books:reparse`）
- Modify: `electron/preload.ts`、`src/lib/ipc.ts`、`src/types/index.ts`
- Test: `tests/books-reparse.test.ts`（新增）、`tests/books-import.test.ts`（补断言）

- [ ] **Step 1: 写失败测试**

```ts
// books-reparse.test.ts
it('重解析保留目录结构、清掉导读侧车与 bookGuide', async () => { … })
it('重解析失败不吃掉原 chapters 目录', async () => { … })
```

- [ ] **Step 2: 实现**

```ts
// books.ts
export const BOOK_PARSER_VERSION = 2

export async function extractPagesText(pdfPath: string): Promise<string[]> {
  // …保留现有加载逻辑…
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i)
    const tc = await page.getTextContent()
    const lines = itemsToLines(tc.items as RawTextItem[])
    out.push(paragraphsToMarkdown(linesToParagraphs(lines, { pageNo: i })))
  }
}

export async function reparseBook(lib: string, dirAbs: string): Promise<BookJson & { dir: string }> {
  // 校验 dirAbs ∈ books/；读 book.json + source.pdf
  // 解析到 .tmp-reparse-*；成功则：chapters → chapters.old-<ts>，新 chapters 就位，
  // 删除 chapters.old、所有 *.guide.md、bookGuide 字段；更新 parserVersion；失败回滚
}
```

`scanBooks` 返回值补 `parserVersion`（缺省 1）。

IPC：`books:reparse` 入参 `{ dir }`，错误码复用 `BookImportError`（`SCANNED_PDF` / `PDF_READ_ERROR` / `NOT_FOUND`）。

- [ ] **Step 3: 跑测试**

`npx vitest run tests/books-reparse.test.ts tests/books-import.test.ts tests/book-parse.test.ts book-text-lines.test.ts`

- [ ] **Step 4: 真实书验证**：用 JTBD 的 `source.pdf` 重解析，人工检查 `03-focus-on-the-job.md` 无 `21-year-` 断行、无孤立页码。

---

### Task 4: 导读进度可视化（SVG rosette）

**Files:**
- Create: `src/components/article-assistant/GuideCompass.tsx`
- Modify: `src/components/article-assistant/GuideSidebar.tsx`
- Modify: `src/types/index.ts`（searching 可选字段）
- Modify: `electron/lib/guide-v2-pipeline.ts`（发 queries/hits）
- Modify: `electron/ipc/article-assistant.ts`（E2E mock 带 queries）
- Test: `tests/guide-compass.test.tsx`（新增）

- [ ] **Step 1: 写失败测试**

```tsx
it('planning 阶段渲染扫描动画层，aria-hidden', () => {
  render(<GuideCompass progress={{ stage: 'planning' }} theme="academic" />)
  expect(screen.getByTestId('guide-compass').getAttribute('aria-hidden')).toBe('true')
  expect(screen.getByTestId('guide-compass-planning')).toBeTruthy()
})
it('searching 阶段节点数 = total（上限 8），已完成节点带 data-done', () => { … })
it('writing 阶段点亮的格数 = entriesDone（上限 12）', () => { … })
```

- [ ] **Step 2: 实现 GuideCompass**

- 固定 `viewBox="0 0 220 120"`，`width="100%"`，`className="h-[84px]"`（不撑高侧栏）。
- 三阶段合并为一套 SVG：文档轮廓常驻；planning = 扫描光带 + 旋转虚线环；searching = 右侧节点 + 虚线弧 + 沿弧运动的点；writing = 文档内格点亮。
- 所有 `<animate>` 删除，改用 CSS 类 + `@media (prefers-reduced-motion: reduce)` 关闭。
- `data-testid="guide-compass"`、`aria-hidden="true"`。

- [ ] **Step 3: 接入 GuideSidebar**

```tsx
{guideLoading && (
  <div data-testid="guide-progress" className="px-4">
    <GuideCompass progress={guideProgress} theme={theme} />
    <div role="status" aria-live="polite" …>{/* 现有 label/detail 文本，保留 */}</div>
  </div>
)}
```

删除原 1px 进度条（`guideProgressFraction` 仍被单测覆盖，保留导出）。

- [ ] **Step 4: 主进程带查询**

`runGuideV2` 阶段 2：

```ts
const queriesText = queries.map(q => q.query)
onProgress({ stage: 'searching', done: 0, total, queries: queriesText })
…
onProgress({ stage: 'searching', done, total, queries: queriesText, hits: results.map(r => r?.length ?? 0) })
```

- [ ] **Step 5: 跑测试**

`npx vitest run tests/guide-compass.test.tsx tests/GuideSidebar.test.tsx tests/guide-progress.test.ts`

---

### Task 5: 书籍对照新建笔记入口

**Files:**
- Modify: `src/store/index.ts`（`findOrCreateArticleNote` 泛化）
- Modify: `src/components/article-assistant/CompanionWritingPicker.tsx`
- Modify: `src/components/books/BookPanel.tsx`
- Modify: `src/components/anthropic/AnthropicBlogPanel.tsx`（适配新 props）
- Test: `tests/companion-picker.test.ts`、`tests/notes-book.test.ts`

- [ ] **Step 1: 写失败测试**

```ts
// notes-book.test.ts
it('同一本书下不同章节的笔记不会互相命中', async () => {
  // 两条 source=book、book='书A'、title 不同 → findOrCreateArticleNote 应各建一条
})
```

- [ ] **Step 2: 实现**

```ts
findOrCreateArticleNote: async (a: {
  title: string; url: string; source?: 'anthropic' | 'book'; book?: string
  body?: string
}) => {
  if (get().notesList === null) await get().loadNotes()
  const list = get().notesList ?? []
  const existing = a.source === 'book'
    ? list.find(n => n.meta.source === 'book' && n.meta.book === a.book && n.meta.title === a.title)
    : list.find(n => n.meta.url === a.url)
  if (existing) return { path: existing.path, created: false }
  const r = await ipc.notesCreate({ ...a, source: a.source ?? 'anthropic' })
  await get().loadNotes()
  return { path: r.path, created: true }
}
```

Picker props：

```ts
currentTarget?: { key: string; label: string; noteExists: boolean } | null
onCreateNote?: () => Promise<string | null>
```

「＋ 新建」在 `currentTarget && !currentTarget.noteExists && onCreateNote` 时出现；点击后 `const p = await onCreateNote(); if (p) onPickFile(p)`。笔记段高亮改为 `noteExists`（或按 `currentTarget.key` 与笔记 title 精确匹配）。

BookPanel：

```tsx
<CompanionWritingPicker
  theme={theme}
  currentTarget={chapter ? {
    key: chapter.path,
    label: `${book?.title ?? '书籍'} · ${chapter.meta.title}`,
    noteExists: hasChapterNote,
  } : null}
  onCreateNote={chapter ? () => createChapterNoteForCompanion() : undefined}
  onPickFile={pickCompanion}
/>
```

`createChapterNoteForCompanion` 复用 `BookReader` 的标题规则（`<书名> · <章节标题>`），返回路径并 `selectArticleCompanion('book', chapter.path, path)`。

- [ ] **Step 3: 跑测试**

`npx vitest run tests/companion-picker.test.ts tests/notes-book.test.ts`

---

### Task 6: 长文本 hover 全展示

**Files:**
- Create: `src/components/Tooltip.tsx`
- Modify: `src/components/books/BookListColumn.tsx`、`src/components/books/ChapterListColumn.tsx`
- Test: `tests/tooltip.test.tsx`（新增）

- [ ] **Step 1: 写失败测试**

```tsx
it('未截断时不弹出', () => { /* mock scrollWidth === clientWidth */ })
it('截断时 hover 350ms 后出现 role=tooltip 且内容为全文', () => { /* vi.useFakeTimers */ })
it('Esc 关闭', () => {})
```

- [ ] **Step 2: 实现 Tooltip**

- `useLayoutEffect` + `getBoundingClientRect` 计算位置，`createPortal(…, document.body)`。
- `isTruncated(el)` 判断：`el.scrollWidth > el.clientWidth + 1`（单行）或 `el.scrollHeight > el.clientHeight + 1`（多行 `line-clamp`）。
- hover 350ms / focus 立即；离开或 blur 关闭；滚动父容器时关闭（`scroll` 捕获阶段监听）。
- 无障碍：`role="tooltip"`、触发器 `aria-describedby`。

- [ ] **Step 3: 接入三处**，章节列表项删除 `title={c.title}`。

- [ ] **Step 4: 跑测试** + 手动验证 newspaper/academic 两套主题。

---

### Task 7: 文档与回归

**Files:**
- Modify: `docs/README.md`（域 14 现状一句话 + 历史链）
- Modify: `docs/superpowers/specs/2026-10-27-books-reading-polish-design.md`、本 plan（执行后改 `status: historical`）
- Modify: `e2e/specs/books.spec.ts`（折叠断言 + picker 新建笔记断言）
- Modify: `e2e/source-map.json`（无需新增 group；确认 `books` group 覆盖新组件路径）
- Modify: `宣传文案/合合信息面试Demo准备-功能选型与八问.md`

- [ ] **Step 1:** `docs/README.md` 域 14 追加历史链 `10-27 books-reading-polish`，现状补一句「体验打磨（折叠/可视化/文本重建/对照笔记/截断）见 polish spec」。
- [ ] **Step 2:** `node scripts/docs-status.cjs` 清零。
- [ ] **Step 3:** `node scripts/e2e-changed.js --run --no-retries`。
- [ ] **Step 4:** `npx tsc --noEmit` + 相关 vitest 定向全绿。
- [ ] **Step 5:** 更新宣传文案：将 5 个问题按严重度写入「已知缺口 / 已修复」小节（见该文档新增的第 9 节）。
