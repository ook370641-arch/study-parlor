# Blog/Notes Album Walls and Article Notes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为博客和笔记补齐统一专辑墙、排序筛选、可靠返回状态，以及当前博客一键创建/复用对应笔记。

**Architecture:** 保留现有三栏布局和文章/笔记数据源。博客墙作为主区空态组件复用面板过滤和打开逻辑；笔记排序继续由纯函数处理；显式返回由 store 同步清理运行时与持久化选中态；正文和对照入口共享一个查找或创建笔记的 store action。

**Tech Stack:** Electron 30、React 18、TypeScript、Zustand、Tailwind CSS、Vitest、Playwright。

**Spec:** `docs/superpowers/specs/2026-10-26-blog-notes-album-wall-and-note-creation-design.md`

## Global Constraints

- 不实现书籍新来源、电子书阅读器、AI 笔记正文或摘要生成。
- 保留当前工作区已有未提交修改，不重置、不覆盖无关改动。
- 不创建分支、不提交代码；在当前目录逐任务执行。
- 先写失败测试并确认失败原因，再写最小实现。
- 只运行受影响单测和定向 E2E，不跑全量测试。
- 新增 E2E spec 或未被映射的模块时同步维护 `e2e/source-map.json`。

## File Structure

- `src/components/anthropic/BlogWall.tsx`：新建，负责博客卡片墙和首行工具栏。
- `src/components/anthropic/AnthropicBlogPanel.tsx`：提供过滤后的文章、排序状态和打开回调。
- `src/components/anthropic/AnthropicArticleReader.tsx`：提供返回墙与正文创建笔记入口。
- `src/components/notes/NotesWall.tsx`：提供笔记墙首行工具栏。
- `src/lib/notes-list.ts`：提供来源分组排序纯逻辑。
- `src/store/index.ts`：提供返回清理和查找/创建对应笔记动作。
- `src/types/index.ts`、`electron/ipc/state.ts`、`electron/ipc/notes.ts`：同步状态与 IPC 类型。

---

### Task 1: 笔记类型排序与专辑墙工具栏

**Files:**
- Modify: `src/lib/notes-list.ts`
- Modify: `src/components/notes/NotesWall.tsx`
- Modify: `src/components/notes/NotesShelf.tsx`
- Modify: `src/store/index.ts`
- Modify: `src/types/index.ts`
- Modify: `electron/ipc/state.ts`
- Test: `tests/notes-list.test.ts`
- Test: `tests/notes-wall.test.tsx`

**Interfaces:**
- Produces: `NoteSortBy = 'source' | 'time' | 'rating'`。
- Produces: `sortNotes(list, sortBy, category)` 支持来源顺序 `anthropic → web → book → unknown`，组内时间倒序。

- [ ] **Step 1: 写类型排序和墙工具栏失败测试**

增加来源排序、组内时间、筛选后工具栏保留、类型选项和共享状态更新测试。

- [ ] **Step 2: 验证测试按预期失败**

Run: `npx vitest run tests/notes-list.test.ts tests/notes-wall.test.tsx`
Expected: 新类型排序断言失败，墙工具栏测试找不到控件。

- [ ] **Step 3: 实现最小排序与工具栏**

扩展排序联合类型和默认值；在墙首行加入来源/排序 select，与第二列共享 store；空态不卸载工具栏。

- [ ] **Step 4: 验证 Task 1**

Run: `npx vitest run tests/notes-list.test.ts tests/notes-wall.test.tsx tests/notes-shelf.test.tsx`
Expected: PASS。

### Task 2: 博客专辑墙

**Files:**
- Create: `src/components/anthropic/BlogWall.tsx`
- Modify: `src/components/anthropic/AnthropicBlogPanel.tsx`
- Modify: `src/lib/anthropic-articles.ts`
- Test: `tests/anthropic-articles.test.ts`
- Test: `tests/blog-wall.test.tsx`

**Interfaces:**
- Consumes: 现有 `BlogFilter`、`displayArticles`、`filtered`、`openOrImportArticle`。
- Produces: `sortBlogArticles(articles, direction)`，本地条目置顶，其余按日期排序且缺失日期排尾。
- Produces: `BlogWall` 接收文章、筛选、排序、加载状态和打开/清空回调。

- [ ] **Step 1: 写排序和博客墙失败测试**

覆盖最新/最早、缺失日期、无图卡片、已导入标记、筛选/排序事件、空态和点击打开。

- [ ] **Step 2: 验证测试按预期失败**

Run: `npx vitest run tests/anthropic-articles.test.ts tests/blog-wall.test.tsx`
Expected: 新排序导出或 `BlogWall` 模块不存在。

- [ ] **Step 3: 实现博客墙并接入主区空态**

实现 3:4 卡片、图片失败回退、首行筛选和排序；面板复用现有过滤与打开函数，保留字号/换画控件。

- [ ] **Step 4: 验证 Task 2**

Run: `npx vitest run tests/anthropic-articles.test.ts tests/blog-wall.test.tsx tests/anthropic-blog-panel.test.tsx`
Expected: PASS。

### Task 3: 返回专辑墙并清理选中态

**Files:**
- Modify: `src/store/index.ts`
- Modify: `src/components/anthropic/AnthropicArticleReader.tsx`
- Modify: `src/components/notes/NoteBoard.tsx`
- Test: `tests/store.test.ts`
- Test: `tests/anthropic-reader-theme.test.tsx`
- Test: `tests/note-board.test.tsx`

**Interfaces:**
- Produces: 博客显式返回同步清空 `lastAnthropicReaderFile` 并持久化 null。
- Produces: `closeNoteToWall(): Promise<void>`，先保存 dirty 笔记，再清当前文件和笔记的 `lastWritingFile`。

- [ ] **Step 1: 写返回行为失败测试**

覆盖博客返回按钮、持久化清理、笔记 dirty 保存、返回墙和 lastWritingFile 清理。

- [ ] **Step 2: 验证测试按预期失败**

Run: `npx vitest run tests/store.test.ts tests/anthropic-reader-theme.test.tsx tests/note-board.test.tsx`
Expected: 返回按钮或新 store action 不存在，清理断言失败。

- [ ] **Step 3: 实现最小返回动作和按钮**

博客使用现有 reader close 入口补齐持久化清理；笔记新增显式返回 action；不改变收藏、已读或阅读位置。

- [ ] **Step 4: 验证 Task 3**

Run: `npx vitest run tests/store.test.ts tests/anthropic-reader-theme.test.tsx tests/note-board.test.tsx`
Expected: PASS。

### Task 4: 当前博客查找或创建对应笔记

**Files:**
- Modify: `src/store/index.ts`
- Modify: `src/types/index.ts`
- Modify: `electron/ipc/notes.ts`
- Modify: `src/components/article-assistant/CompanionWritingPicker.tsx`
- Modify: `src/components/anthropic/AnthropicArticleReader.tsx`
- Test: `tests/article-note.test.ts`
- Test: `tests/companion-writing-picker.test.tsx`
- Test: `tests/anthropic-reader-theme.test.tsx`

**Interfaces:**
- Produces: `findOrCreateArticleNote(article: { title: string; url: string }): Promise<{ path: string; created: boolean }>`。
- Consumes: 正文入口切换 `briefingSource='writing'`、`writingListTab='notes'` 并打开返回路径；对照入口仅调用 `onPickFile(path)`。

- [ ] **Step 1: 写创建、去重和两入口失败测试**

验证空笔记元数据、已有 URL 不重复创建、正文打开笔记、对照槽行为及 busy 防重复。

- [ ] **Step 2: 验证测试按预期失败**

Run: `npx vitest run tests/article-note.test.ts tests/companion-writing-picker.test.tsx tests/anthropic-reader-theme.test.tsx`
Expected: 新 action 或正文入口不存在，去重断言失败。

- [ ] **Step 3: 实现共享 action 与两个入口**

完整传递 `source: 'anthropic'`；创建后刷新笔记；已有匹配直接复用；错误 toast 并留在当前页面。

- [ ] **Step 4: 验证 Task 4**

Run: `npx vitest run tests/article-note.test.ts tests/companion-writing-picker.test.tsx tests/anthropic-reader-theme.test.tsx`
Expected: PASS。

### Task 5: 定向集成验证与交付

**Files:**
- Modify: `e2e/specs/notes-bookshelf.spec.ts`
- Modify: `e2e/specs/anthropic-blog-ui.spec.ts`
- Modify if needed: `e2e/source-map.json`

**Interfaces:**
- Consumes: Tasks 1–4 的用户可见行为。

- [ ] **Step 1: 补充关键 E2E 场景并更新映射**

覆盖墙首行控件、打开/返回、返回后不恢复，以及一键建笔记去重；优先扩展现有 spec。

- [ ] **Step 2: 运行所有受影响单测**

Run: 手动列出 Tasks 1–4 的测试文件，不运行全量 Vitest。
Expected: PASS，无新增错误。

- [ ] **Step 3: 运行定向 E2E**

Run: `node scripts/e2e-changed.js --run --no-retries`
Expected: 受影响 spec PASS；若出现既有环境故障，记录原始失败并不修改无关代码。

- [ ] **Step 4: 检查差异与需求覆盖**

Run: `git diff --check` 和 `git status --short`。
Expected: 无空白错误；所有改动可追溯到 spec，未包含书籍新来源。

- [ ] **Step 5: 归档已完成记事板条目**

先检查 Electron 是否运行；未运行才将四个已完成条目移入 `notepadLog`，保留「新来源」待办。运行中则请用户在面板点 ✓。
