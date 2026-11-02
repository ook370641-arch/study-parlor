# Notes Annotations and Covers Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修复标注真实点击，按书聚合章节笔记，并交付正文驱动的三版 SVG 符号封面。

**Architecture:** 共享标注组件只做一次根因修复；书籍聚合通过纯函数派生视图，不迁移用户文件；封面在主进程完成 Kimi 设计生成、安全校验与 SVG 装配，渲染进程只展示候选和选择结果。

**Tech Stack:** Electron 30、React 18、TypeScript、Zustand、Vitest、Playwright、现有 Kimi OpenAI-compatible API。

**Spec:** `docs/superpowers/specs/2026-11-02-notes-annotations-and-covers-design.md`

## Global Constraints

- 所有改动只在 `codex/note-polish` worktree，主工作区现有改动不触碰。
- 无新增运行时依赖、图片 API、固定封面模板或任意 SVG 注入。
- 旧笔记和旧标注保持可读；聚合不重命名、不移动文件。
- 每个生产行为先写失败测试并确认失败原因，再写最小实现。
- 定向 E2E 使用隔离实例；真实标注点击不使用 `force: true`。

---

### Task 1: 标注真实点击与亮黄色

**Files:**
- Modify: `e2e/specs/article-annotations.spec.ts`
- Modify: `tests/article-annotations-actions.test.tsx`
- Modify: `tests/article-annotations-io.test.ts`
- Modify: `src/components/article-assistant/ArticleAnnotations.tsx`
- Modify: `electron/ipc/annotations.ts`
- Modify: `src/types/index.ts`

**Interfaces:**
- Produces: `AnnotationHighlightColor = 'ember' | 'gold' | 'yellow' | 'green' | 'blue'`。

- [ ] **Step 1: 写真实点击失败回归**

把持久标记 reopen 测试改为普通 `marker.click()`，分别覆盖 note 与 highlight，并断言 `anno-note-card` 可见。不得通过 detached DOM、force click 或 `__e2e_saveAnnotation` 让测试通过。

- [ ] **Step 2: 运行定向 E2E 并记录失效事件链**

Run: `npx electron-vite build; npx playwright test --config e2e/playwright.config.ts article-annotations --grep "E2E-A1|E2E-A7" --no-retries`

Expected: 在标记点击或卡片可见断言失败；若测试通过，增加 pointer hit-target 与 mutation 记录继续复现，不直接改实现。

- [ ] **Step 3: 写黄色解析与 UI 失败测试**

```ts
expect(parseAnnotationsBody(rawWithYellow)[0].highlightColor).toBe('yellow')
expect(screen.getByTestId('anno-highlight-color-yellow')).toBeInTheDocument()
```

Run: `npx vitest run tests/article-annotations-actions.test.tsx tests/article-annotations-io.test.ts`

Expected: `yellow` 不在颜色集合中。

- [ ] **Step 4: 实施单一根因修复与五色支持**

只修改测试证明的事件链；保留 marker 延迟重放、自动保存和定位行为。新增 `yellow: 'rgba(255, 225, 74, 0.48)'`，解析器接受 `yellow`，默认仍为 `gold`。

- [ ] **Step 5: 验证并提交**

Run: 上述 Vitest 与定向 E2E。Expected: 全部通过，普通点击可打开两类卡片。

Commit: `fix(annotations): restore marker clicks and add yellow highlight`

---

### Task 2: 书籍章节元数据与聚合纯逻辑

**Files:**
- Modify: `src/types/index.ts`
- Modify: `electron/lib/notes.ts`
- Modify: `electron/ipc/notes.ts`
- Modify: `electron/preload.ts`
- Modify: `src/store/index.ts`
- Modify: `src/components/books/BookReader.tsx`
- Modify: `src/components/books/BookPanel.tsx`
- Modify: `src/lib/notes-list.ts`
- Test: `tests/notes-list.test.ts`
- Test: `tests/notes-book.test.ts`

**Interfaces:**
- Produces: `NoteMeta.chapter?: string`。
- Produces: `groupNotesForDisplay(list, sortBy, category): NoteDisplayItem[]`；书组包含 `kind: 'book'`, `book`, `entries`, `latest`, `rating`, `collectedAt`，单项包含 `kind: 'note'`, `entry`。
- Produces: `noteChapter(entry): string`，只从新字段或旧标题推导。

- [ ] **Step 1: 写聚合与旧数据失败测试**

```ts
const groups = groupNotesForDisplay([chapterOne, chapterTwo, annotation], 'time', 'all')
expect(groups).toHaveLength(1)
expect(groups[0].entries.map(item => item.meta.chapter)).toEqual(['第一章', '第二章'])
expect(groups[0].latest.path).toBe(annotation.path)
```

覆盖同章多旁注、不同书同章名、未分章、筛选和三种排序。

- [ ] **Step 2: 运行测试确认 RED**

Run: `npx vitest run tests/notes-list.test.ts tests/notes-book.test.ts`

Expected: 缺少聚合函数及 `chapter` 元数据。

- [ ] **Step 3: 实现元数据透传和纯聚合**

`createNoteFile` / `findOrCreateArticleNote` 接收 `chapter`；书籍章节笔记去重使用 `(book, chapter, kind)`，其中旁注直接创建不查重，章节正文笔记仍查重。`BookReader` 与 `BookPanel` 传入 `chapter.meta.title`。

- [ ] **Step 4: 验证并提交**

Run: 上述 Vitest。Expected: 全部通过，旧测试无需改变语义。

Commit: `feat(notes): group book chapters with compatible metadata`

---

### Task 3: 三处书籍章节选择 UI

**Files:**
- Create: `src/components/notes/BookChapterSelect.tsx`
- Modify: `src/components/notes/NotesWall.tsx`
- Modify: `src/components/notes/NotesShelf.tsx`
- Modify: `src/components/notes/NoteRow.tsx`
- Modify: `src/components/article-assistant/CompanionWritingPicker.tsx`
- Test: `tests/notes-wall.test.tsx`
- Test: `tests/notes-shelf.test.tsx`
- Test: `tests/companion-writing-picker.test.tsx`

**Interfaces:**
- Consumes: `groupNotesForDisplay` 和 `NoteDisplayItem`。
- Produces: `BookChapterSelect({ group, currentPath?, onPick, testId })`，下拉值恒为原始笔记路径。

- [ ] **Step 1: 写三处交互失败测试**

```ts
fireEvent.change(screen.getByTestId('book-chapter-select'), { target: { value: 'notes/ch2.md' } })
expect(selectWritingFile).toHaveBeenCalledWith('notes/ch2.md')
expect(selectCompanionFile).toHaveBeenCalledWith('notes/ch2.md')
```

验证下拉 change 不触发卡片 click，当前章节标记仍匹配原始路径。

- [ ] **Step 2: 运行组件测试确认 RED**

Run: `npx vitest run tests/notes-wall.test.tsx tests/notes-shelf.test.tsx tests/companion-writing-picker.test.tsx`

- [ ] **Step 3: 实现共享下拉并接入三视图**

非书笔记沿用现有卡片/行；书组只渲染一个卡片或行。下拉 `onClick` / `onMouseDown` 阻止冒泡，`onChange` 只调用对应打开或对照回调。旁注选项显示章节与「标注」后缀。

- [ ] **Step 4: 验证并提交**

Run: 上述组件测试。Expected: 全部通过。

Commit: `feat(notes): add shared book chapter selectors`

---

### Task 4: 内容专属封面生成后端与 IPC

**Files:**
- Create: `electron/prompts/note-cover.md`
- Create: `electron/lib/note-covers.ts`
- Modify: `electron/lib/llm-tasks.ts`
- Modify: `electron/lib/notes.ts`
- Modify: `electron/ipc/notes.ts`
- Modify: `electron/preload.ts`
- Modify: `src/types/index.ts`
- Test: `tests/note-covers.test.ts`
- Test: `tests/notes.test.ts`

**Interfaces:**
- Produces: `NoteCoverDesign { concept, palette, background, grain, elements }`。
- Produces: `parseNoteCoverDesigns(raw): NoteCoverDesign[]`，严格要求三个有效候选。
- Produces: `renderNoteCoverSvg(design): string`，只装配白名单图元。
- Produces: `notesGenerateCovers({ path }): Promise<{ candidates: { design, svgDataUrl }[] }>`。
- Produces: `notesSaveCover({ path, design }): Promise<{ cover, coverUrl }>`。
- Produces: `NoteEntry.coverUrl?: string` 与 `NoteMeta.cover?: string`。

- [ ] **Step 1: 写设计协议与安全失败测试**

```ts
expect(parseNoteCoverDesigns(validRaw)).toHaveLength(3)
expect(() => parseNoteCoverDesigns(rawWithScriptPath)).toThrow()
expect(renderNoteCoverSvg(design)).toContain('viewBox="0 0 600 800"')
expect(renderNoteCoverSvg(design)).not.toContain('<text')
expect(renderNoteCoverSvg(design)).toBe(renderNoteCoverSvg(design))
```

另测缺候选、少于三个有效图元、非法颜色、越界数值、代码围栏和任意 `url(...)` 输入。

- [ ] **Step 2: 运行测试确认 RED**

Run: `npx vitest run tests/note-covers.test.ts tests/notes.test.ts`

Expected: 模块与封面持久化能力不存在。

- [ ] **Step 3: 实现提示词、校验、渲染和安全落盘**

提示词使用 spec §4.2 的正文驱动版本。`generateNoteCoverCandidates` 读取当前笔记 frontmatter 与开头 12000 字符正文，调用 `chatNonStream`，不写文件。保存时重新校验单个 design，先写新 SVG，再更新 frontmatter；元数据失败删除新文件，成功后清理旧生成封面。

`scanNotes` 仅对 `notes/covers/` 内已存在的 SVG 生成 base64 data URL；其他路径忽略并回退渐变。

- [ ] **Step 4: 接通类型安全 IPC 并验证**

Run: `npx vitest run tests/note-covers.test.ts tests/notes.test.ts tests/llm-tasks.test.ts; npx tsc --noEmit; npx tsc --noEmit -p tsconfig.node.json`

Expected: 全部通过。

Commit: `feat(notes): generate content-specific svg cover symbols`

---

### Task 5: 封面候选 UI、视觉回归与交付门禁

**Files:**
- Create: `src/components/notes/NoteCoverGenerator.tsx`
- Modify: `src/components/notes/NoteCover.tsx`
- Modify: `src/components/notes/NotesWall.tsx`
- Modify: `src/components/notes/NoteMetaHeader.tsx`
- Modify: `src/lib/note-cover.ts`
- Modify: `tests/note-cover.test.ts`
- Modify: `tests/notes-wall.test.tsx`
- Create: `tests/note-cover-generator.test.tsx`
- Modify: `e2e/specs/notes-bookshelf.spec.ts`
- Modify: `e2e/source-map.json`
- Modify: `docs/README.md`
- Modify: `AGENTS.md`

**Interfaces:**
- Consumes: Task 4 的两个 IPC 与 `NoteEntry.coverUrl`。
- Produces: `NoteCoverGenerator({ entry, className? })`，内部管理生成、三版预览、选择和保存。

- [ ] **Step 1: 写封面优先级与候选交互失败测试**

```ts
expect(noteCoverImage(entry, cache)).toBe(entry.coverUrl)
fireEvent.click(screen.getByTestId('note-cover-generate'))
expect(await screen.findAllByTestId('note-cover-candidate')).toHaveLength(3)
fireEvent.click(screen.getAllByTestId('note-cover-select')[1])
expect(mockIpc.notesSaveCover).toHaveBeenCalledWith({ path: entry.path, design: candidates[1].design })
```

验证无封面才显示墙入口、生成中防重复、失败保留旧图、保存后刷新列表。

- [ ] **Step 2: 运行组件测试确认 RED**

Run: `npx vitest run tests/note-cover.test.ts tests/note-cover-generator.test.tsx tests/notes-wall.test.tsx`

- [ ] **Step 3: 实现封面优先级与三版预览**

`NoteCover` 使用 `coverUrl → Anthropic 原图 → 渐变`。生成按钮阻止卡片冒泡；对话框展示 3:4 图片、创作意图与选择按钮，选中保存后关闭并刷新 `notesList`。已有生成封面在信息区提供「重新生成」。

- [ ] **Step 4: 增加定向 E2E 与映射**

在 `notes-bookshelf.spec.ts` 覆盖同书两章只显示一个书组、下拉切换打开对应笔记、种子 SVG 在墙/列/对照一致显示。把新增后端和组件 glob 纳入 `notes` group；不新增孤儿 spec。

- [ ] **Step 5: 运行定向验证**

Run: `npx vitest run tests/article-annotations-actions.test.tsx tests/article-annotations-io.test.ts tests/notes-list.test.ts tests/notes-book.test.ts tests/notes-wall.test.tsx tests/notes-shelf.test.tsx tests/companion-writing-picker.test.tsx tests/note-covers.test.ts tests/note-cover-generator.test.tsx tests/note-cover.test.ts tests/notes.test.ts`

Run: `node scripts/e2e-changed.js --run --no-retries`

Run: `npm run build; npm run docs:check; git diff --check`

Expected: 全部通过；浏览器实际渲染无空白 SVG、脚本或外部资源。

- [ ] **Step 6: 更新现状文档并提交**

把 spec 改为 `status: current` 并写验证日期；更新 `docs/README.md` 域 10/13/14 与 `AGENTS.md` 笔记/高亮现状。记录真实 Kimi 九符号实验和最终测试结果。

Commit: `feat(notes): deliver chapter browsing and cover previews`
