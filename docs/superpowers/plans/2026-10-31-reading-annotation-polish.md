---
status: historical
note: 2026-10-31 三个任务及审查修复均完成；E2E 已编写但未启动 Electron，当前事实以代码、AGENTS.md 与 docs/README.md 为准
---

# 阅读、划词备注与记事板体验打磨 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 完成书籍阅读记忆与排版、共享划词高亮和备注修复、旁注状态下记事板可用性，共 7 项小改造。

**Architecture:** 保留 `ArticleAnnotations` 单一共享实现，以可选标注字段兼容旧伴生文件。书籍复用博客 `useScrollMemory`，共享状态由同一任务独占修改。记事板仅调整入口/面板位置和外点规则。三个任务写集互不重叠，可并行后由控制器集成。

**Tech Stack:** Electron 30 + React 18 + TypeScript + Zustand + Vitest/Testing Library + Playwright（仅编写）。

**Spec:** `docs/superpowers/specs/2026-10-31-reading-annotation-polish-design.md`

## Global Constraints

- 所有改动只在 `codex/reading-annotation-polish` 的独立 worktree；主工作区只读。
- 先写失败测试并运行确认预期失败，再写生产代码；每个任务只运行自己相关的 Vitest 文件。
- 不启动 Electron、不运行 Playwright、不执行进程清理、不占用开发端口。
- 不改博客更新链，不做相邻重构，不新增依赖。
- `ArticleAnnotation.kind` 缺省等于 `note`；旧 `.annotations.md` 无需迁移。
- 当前高亮色字段为 `annotationHighlightColor`，默认 `gold`；书籍字段为 `booksLastChapter` 与 `bookScrollMemory`。
- 备注卡没有保存按钮；外点和 Esc 自动保存并关闭；删除按钮对空备注也可见。

## File Structure

- Task 1：共享划词组件、标注序列化/解析与测试。
- Task 2：共享类型/状态、书籍阅读器/书卡、书籍测试；提供 Task 1 消费的 store 接口。
- Task 3：Notepad 入口/面板与测试。
- 控制器：E2E source-map、文档状态、集成构建和最终审查。

---

### Task 1: 共享划词高亮与备注卡

**Files:**
- Modify: `src/components/article-assistant/ArticleAnnotations.tsx`
- Modify: `electron/ipc/annotations.ts`
- Modify: `tests/article-annotations-markers.test.tsx`
- Create: `tests/article-annotations-io.test.ts`
- Create: `tests/article-annotations-actions.test.tsx`
- Modify: `e2e/specs/article-annotations.spec.ts`

**Interfaces:**
- Consumes: `useStore((s) => s.annotationHighlightColor): AnnotationHighlightColor`；`useStore((s) => s.setAnnotationHighlightColor): (color: AnnotationHighlightColor) => void`。
- Consumes: `ArticleAnnotation { kind?: 'note' | 'highlight'; highlightColor?: 'ember' | 'gold' | 'green' | 'blue' }`，由 Task 2 添加。
- Produces: `annotationsRead/annotationsWrite` 无损往返高亮字段；划词工具 testid 遵循 Spec §2.1。

- [ ] **Step 1: 写标注 IO 失败测试**

通过 `registerAnnotationsIpc` 的现有测试方式或导出到 `__test__` 的纯序列化/解析接口覆盖：旧备注缺省为 note、高亮往返、普通备注不写扩展行、未知颜色回退 gold。核心断言：

```ts
expect(roundTrip(highlight)).toMatchObject({ kind: 'highlight', highlightColor: 'green', note: '' })
expect(serialize(note)).not.toContain('**类型：**')
expect(roundTrip(unknownColor).highlightColor).toBe('gold')
```

- [ ] **Step 2: 运行 IO 测试并确认 RED**

Run: `npx vitest run tests/article-annotations-io.test.ts`

Expected: FAIL，因为高亮字段尚未序列化/解析；若测试直接报语法或 mock 错误，先修测试直至因功能缺失失败。

- [ ] **Step 3: 最小实现标注 IO**

在高亮序列化段加入：

```ts
...(a.kind === 'highlight' ? [
  `**类型：** highlight`,
  `**高亮色：** ${a.highlightColor ?? 'gold'}`,
] : []),
```

解析时保留旧字段，缺省 `kind` 不写死到旧数据；仅高亮规范化颜色。

- [ ] **Step 4: 运行 IO 测试并确认 GREEN**

Run: `npx vitest run tests/article-annotations-io.test.ts`

Expected: PASS。

- [ ] **Step 5: 写共享交互失败测试**

用真实 DOM 选区或现有 `__e2e_triggerGhostPen` 驱动，分别断言：

```ts
expect(screen.getByTestId('anno-highlight-button')).toBeInTheDocument()
expect(screen.queryByTestId('anno-save-button')).toBeNull()
expect(screen.getByTestId('anno-delete-button')).toBeInTheDocument() // note === ''
fireEvent.mouseDown(outside)
expect(annotationsWrite).toHaveBeenCalledWith('/x.md', expect.arrayContaining([
  expect.objectContaining({ note: '自动保存' }),
]))
```

另覆盖高亮主按钮立即写盘、颜色下拉调用 `setAnnotationHighlightColor('blue')`、点击高亮后可换色和删除。

- [ ] **Step 6: 运行交互测试并确认 RED**

Run: `npx vitest run tests/article-annotations-actions.test.tsx tests/article-annotations-markers.test.tsx`

Expected: FAIL，因为高亮工具不存在，且空备注删除/保存按钮行为不符合设计。

- [ ] **Step 7: 最小实现共享交互**

将幽灵 UI 改为同一容器内的 🖊、高亮主按钮、颜色下拉。高亮创建复用新 ID 和 `annotationsWrite`，`kind: 'highlight'`，不打开备注卡。标记渲染按 `anno.kind === 'highlight'` 分支；高亮卡只含四色板和删除。备注卡删除始终渲染，移除保存按钮，保留 `doSaveAndClose` 作为外点/Esc 路径。

- [ ] **Step 8: 运行交互测试并确认 GREEN**

Run: `npx vitest run tests/article-annotations-actions.test.tsx tests/article-annotations-markers.test.tsx tests/article-annotations-io.test.ts`

Expected: PASS。

- [ ] **Step 9: 补 Playwright 场景但不执行**

在现有 spec 增加高亮创建/重启恢复、高亮换色删除、空备注删除与外点自动保存断言；使用稳定 testid，不使用固定 sleep 等待业务状态。

- [ ] **Step 10: 自审并提交**

Run: `git diff --check && git status --short`

确认只改 Task 1 文件后提交：

```bash
git add src/components/article-assistant/ArticleAnnotations.tsx electron/ipc/annotations.ts tests/article-annotations-markers.test.tsx tests/article-annotations-io.test.ts tests/article-annotations-actions.test.tsx e2e/specs/article-annotations.spec.ts
git commit -m "feat(annotations): add persistent highlights and autosave notes"
```

---

### Task 2: 书籍阅读记忆、排版、删除图标与共享状态

**Files:**
- Modify: `src/types/index.ts`
- Modify: `src/store/index.ts`
- Modify: `electron/ipc/state.ts`
- Modify: `src/components/books/BookReader.tsx`
- Modify: `src/components/books/BookListColumn.tsx`
- Modify: `src/styles/globals.css`
- Modify: `tests/books-store.test.ts`
- Create: `tests/book-reader-polish.test.tsx`
- Create: `tests/book-list-column.test.tsx`
- Modify: `e2e/specs/books.spec.ts`

**Interfaces:**
- Produces: `AnnotationHighlightColor` 与 `ArticleAnnotation.kind/highlightColor`，签名严格按 Spec §2.2。
- Produces: `annotationHighlightColor`、`setAnnotationHighlightColor(color)`、`booksLastChapter`、`bookScrollMemory`、`flushBookScrollPosition(filePath, blockIndex)`。
- Consumes: 现有 `useScrollMemory`、`ScrollMemorySlot`、`booksReadChapter` 与 `ConfirmDialog`。

- [ ] **Step 1: 写共享状态与书籍恢复失败测试**

在 `tests/books-store.test.ts` 覆盖：

```ts
await useStore.getState().selectChapter('book-a/chapters/01.md')
expect(ipc.patchState).toHaveBeenCalledWith(expect.objectContaining({ booksLastChapter: 'book-a/chapters/01.md' }))
useStore.getState().flushBookScrollPosition('book-a/chapters/01.md', 7)
expect(ipc.patchStateSync).toHaveBeenCalledWith({ bookScrollMemory: { filePath: 'book-a/chapters/01.md', blockIndex: 7 } })
```

另测 `selectBook` 只恢复属于本书且仍在目录的章节，删除书时清理其持久章节/滚动槽，以及高亮色 setter 写 `annotationHighlightColor`。

- [ ] **Step 2: 运行状态测试并确认 RED**

Run: `npx vitest run tests/books-store.test.ts`

Expected: FAIL，因为字段和动作尚未实现。

- [ ] **Step 3: 最小实现共享状态与恢复**

在类型、默认 state、store 初始值和 `initState` 读取中补齐字段。`selectChapter` 成功设置活动章节后持久化 `booksLastChapter`；`selectBook` 目录就绪后按 Spec 恢复。滚动 flush 复制博客的同步落盘模式：

```ts
flushBookScrollPosition: (filePath, blockIndex) => {
  const mem = { filePath, blockIndex }
  set({ bookScrollMemory: mem })
  ipc.patchStateSync({ bookScrollMemory: mem } as Partial<StateJson>)
},
```

- [ ] **Step 4: 运行状态测试并确认 GREEN**

Run: `npx vitest run tests/books-store.test.ts`

Expected: PASS。

- [ ] **Step 5: 写阅读器和书卡失败测试**

渲染 `BookReader` 与 `BookListColumn`，断言：

```ts
expect(screen.getByTestId('book-reader-scroll')).toBeInTheDocument()
expect(screen.getByTestId('book-chapter-body').parentElement).toHaveClass('relative')
expect(screen.getByTestId('book-chapter-body')).toHaveClass('book-chapter-reader')
expect(screen.getByTestId('book-delete-0').querySelector('svg')).not.toBeNull()
expect(screen.getByTestId('book-delete-0')).not.toHaveTextContent('删除')
```

对 `useScrollMemory` 的参数断言 `memKey` 为章节路径、块选择器为 `.md-body > div > *`、flush 指向 `flushBookScrollPosition`。

- [ ] **Step 6: 运行阅读器测试并确认 RED**

Run: `npx vitest run tests/book-reader-polish.test.tsx tests/book-list-column.test.tsx`

Expected: FAIL，因为滚动 ref/定位类/段落类和 SVG 尚未实现。

- [ ] **Step 7: 最小实现阅读器、排版和图标**

`BookReader` 接入 `useScrollMemory`，滚动容器添加 `ref/onScroll/data-testid`，共同内容层添加 `relative`，正文添加 `book-chapter-reader`。全局 CSS 仅增加：

```css
.book-chapter-reader .md-body p + p {
  margin-top: 1em;
}
```

`BookListColumn` 用内联垃圾桶 SVG 替换文本，保留按钮行为与 testid。

- [ ] **Step 8: 运行书籍测试并确认 GREEN**

Run: `npx vitest run tests/books-store.test.ts tests/book-reader-polish.test.tsx tests/book-list-column.test.tsx`

Expected: PASS。

- [ ] **Step 9: 补 Playwright 场景但不执行**

在 `books.spec.ts` 增加：最后章节和滚动位置跨 reload 恢复、备注卡随正文滚动、相邻段间距大于 0、垃圾桶点击仍出现确认弹窗。复用现有 seed/POM，不启动套件。

- [ ] **Step 10: 自审并提交**

Run: `git diff --check && git status --short`

确认只改 Task 2 文件后提交：

```bash
git add src/types/index.ts src/store/index.ts electron/ipc/state.ts src/components/books/BookReader.tsx src/components/books/BookListColumn.tsx src/styles/globals.css tests/books-store.test.ts tests/book-reader-polish.test.tsx tests/book-list-column.test.tsx e2e/specs/books.spec.ts
git commit -m "feat(books): remember reading position and polish reading UI"
```

---

### Task 3: 旁注状态下保留记事板

**Files:**
- Modify: `src/components/NotepadFab.tsx`
- Modify: `src/components/NotepadPanel.tsx`
- Modify: `tests/notepad-fab.test.tsx`
- Create: `tests/notepad-assistant.test.tsx`
- Create: `e2e/specs/notepad-assistant.spec.ts`

**Interfaces:**
- Consumes: 现有 `assistantSession?.isOpen`、`article-assistant-tab` 与 `article-assistant-chat-window` testid。
- Produces: `NotepadPanel` 新可选 prop `placement?: 'left' | 'right'`，默认 `right`。

- [ ] **Step 1: 写旁注共存失败测试**

更新 NotepadFab 旧预期：聊天打开时入口仍存在且使用左置类；打开面板后，旁注 tab 与聊天窗 mousedown 不调用 `onClose`，普通外部区域仍调用。

```ts
state.chatOpen = true
render(<NotepadFab />)
expect(screen.getByTestId('notepad-fab-button')).toHaveClass('left-5')
fireEvent.mouseDown(screen.getByTestId('article-assistant-tab'))
expect(onClose).not.toHaveBeenCalled()
```

- [ ] **Step 2: 运行测试并确认 RED**

Run: `npx vitest run tests/notepad-fab.test.tsx tests/notepad-assistant.test.tsx`

Expected: FAIL，因为当前实现聊天打开时隐藏入口且所有外点都会关闭。

- [ ] **Step 3: 最小实现共存与左右布局**

移除条件隐藏，按 `chatOpen` 在 `left-5/right-5` 间切换；将 placement 传给面板。NotepadPanel 外点处理增加：

```ts
if (t.closest('[data-testid="article-assistant-tab"], [data-testid="article-assistant-chat-window"]')) return
```

- [ ] **Step 4: 运行测试并确认 GREEN**

Run: `npx vitest run tests/notepad-fab.test.tsx tests/notepad-assistant.test.tsx tests/notepad.test.ts tests/notepad-update.test.ts`

Expected: PASS。

- [ ] **Step 5: 补 Playwright 场景但不执行**

新增 `notepad-assistant.spec.ts`：打开记事板 → 打开旁注 → 记事板仍可见且位于左侧 → 在旁注输入不关闭记事板 → 点击正文外部仍关闭。

- [ ] **Step 6: 自审并提交**

Run: `git diff --check && git status --short`

确认只改 Task 3 文件后提交：

```bash
git add src/components/NotepadFab.tsx src/components/NotepadPanel.tsx tests/notepad-fab.test.tsx tests/notepad-assistant.test.tsx e2e/specs/notepad-assistant.spec.ts
git commit -m "fix(notepad): stay available beside article assistant"
```

---

### Integration: 控制器收尾

- [ ] 审查三个任务 diff，运行所有新增/受影响 Vitest 文件。
- [ ] 将 `notepad-assistant.spec.ts` 加入 `e2e/source-map.json` 的 `cover-home.specs`；现有 books/article-assistant 组已覆盖其余改动，不新增重复组。
- [ ] 更新 `docs/README.md` 域 10/14/15 与本设计/计划状态；必要时更新 AGENTS.md 当前架构描述。
- [ ] Run: `npm run docs:check`，Expected: 0 errors。
- [ ] Run: `npm run build`，Expected: TypeScript 与 electron-vite build 均 exit 0。
- [ ] 运行 `node scripts/e2e-changed.js` 仅列出受影响 spec，不执行 Electron；确认 `notepad-assistant.spec.ts` 非孤儿。
- [ ] 做最终代码审查，修复 Critical/Important 问题并重跑受影响验证。
- [ ] 提交集成与文档更新；不合并 main、不清理 worktree，向用户汇报分支、路径、验证结果和未运行 E2E 的限制。
