---
status: planned
---

# AI Note Generation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为博客与书籍章节笔记提供一次性 AI 生成能力，以两轮 Tavily 检索和资料策展生成结构化正文，并把原笔迹逐字保留在同一文件末尾。

**Architecture:** 主进程负责来源装配、两轮检索、候选会话、路径锁与原子写回；渲染进程只负责入口资格、进度预览和确认。AI 正文与原笔迹只在用户确认后合并，`ai_generated_at` 是跨入口、跨重启的永久防重标记。

**Tech Stack:** Electron 30、React 18、TypeScript、Zustand、gray-matter、Kimi OpenAI 兼容 API、Tavily、Vitest、Playwright。

**Spec:** `docs/superpowers/specs/2026-11-05-ai-note-generation-design.md`

## Global Constraints

- 管线固定为：来源正文 + 导读 + 原笔迹 → 2–3 个宽域查询 → 2–3 个结果驱动深钻查询 → 资料策展 → 笔记写作。
- 写作提示词只接收策展素材与紧凑来源表，不接收原始搜索结果堆；任一整轮完全失败都终止，不静默降级。
- AI 正文目标约 1000–1400 中文字，900–1600 为验收区间，自然组织 3–5 个部分，不复制来源正文，不详细展开案例。
- 只保留一个物理笔记文件；非空原笔迹追加在 `---` 与 `## 原笔迹` 后，附录使用 gray-matter 原始 `content`，禁止 trim 或规范化。
- `ai_generated_at` 只在成功原子写回后出现；不提供重新生成、批量生成、多版本或独立 AI 文件。
- 两个入口均使用 Sparkles SVG，无障碍名与悬停提示为“生成笔记”；对照入口还要求与当前博客 URL 或书籍章节精确匹配。
- 所有修改只在当前隔离 worktree；单测只跑受影响文件，E2E 只跑定向 spec，不启动第二个应用实例。

---

### Task 0: 隔离环境准备

- [ ] **Step 1: 安装独立 worktree 依赖**

Run: `npm install`
Expected: worktree 获得独立 `node_modules`，主工作区不被修改。

- [ ] **Step 2: 运行相关基线测试**

Run: `npx vitest run tests/notes.test.ts tests/notes-list.test.ts tests/store-article-assistant.test.ts tests/note-cover-generator.test.tsx`
Expected: 记录基线；不修改与本功能无关的既有失败。

---

### Task 1: 元数据与单文件原笔迹合并

**Files:**
- Modify: `src/types/index.ts`
- Modify: `electron/lib/notes.ts`
- Test: `tests/notes.test.ts`

**Interfaces:**
- Produces: `NoteMeta.ai_generated_at?: string`、`hashNoteRaw(raw)`、`composeAiNoteBody(aiBody, originalContent)`。
- Produces: `applyAiNote(lib, rel, { aiBody, baseRawHash, aiGeneratedAt }): { body: string }`。

- [ ] **Step 1: 写失败测试**

覆盖字段往返、空原笔迹不加附录、非空原笔迹逐字保留、未知 frontmatter 保留、hash 变化抛 `NOTE_CHANGED`。原始正文须含首尾空行和 Base64 图片，证明没有 trim/清洗。

```ts
expect(composeAiNoteBody('AI 正文', '\n原始 Base64\n')).toBe('AI 正文\n\n---\n\n## 原笔迹\n\n\n原始 Base64\n')
```

- [ ] **Step 2: 确认测试因功能缺失而失败**

Run: `npx vitest run tests/notes.test.ts`

- [ ] **Step 3: 实现元数据、合并与原子写回**

`applyAiNote` 保留 gray-matter `data` 的未知字段，加入标记，经同目录临时文件 + rename 一次写入；已有标记抛 `ALREADY_GENERATED`，hash 用 SHA-256。

- [ ] **Step 4: 确认通过并提交**

Run: `npx vitest run tests/notes.test.ts`
Run: `git add src/types/index.ts electron/lib/notes.ts tests/notes.test.ts && git commit -m "feat(notes): preserve original body during ai apply"`

---

### Task 2: 博客、章节与导读来源装配

**Files:**
- Create: `electron/lib/note-ai-source.ts`
- Test: `tests/note-ai-source.test.ts`

**Interfaces:**
- Produces: `AiNoteInput`（字段与 spec §3.2 一致）、`normalizeSourceUrl(url)`。
- Produces: `readAiNoteSnapshot(lib, rel): { raw, rawHash, entry, originalContent }`。
- Produces: `assembleAiNoteInput(lib, snapshot): AiNoteInput`。

- [ ] **Step 1: 写来源与清洗失败测试**

覆盖 collection `entries/read` 定位、URL 规范化、`Anthropic博客/**/*.md` 的 `source_url` 兜底、书名 + 章节定位、guide 存在/损坏/缺失，以及 Base64 图片仅在模型入参中变为 `[内嵌图片]`。

- [ ] **Step 2: 确认失败**

Run: `npx vitest run tests/note-ai-source.test.ts`
Expected: FAIL，模块尚不存在。

- [ ] **Step 3: 实现来源装配**

所有读写限制在学习库内，笔记仅接受 `notes/*.md`。博客优先读 `.collection.json`，书籍通过 `scanBooks` + `chapterFile` 定位；空正文抛 `SOURCE_INVALID`，无法定位抛 `SOURCE_NOT_FOUND`。导读只读同名 `.guide.md` 的 gray-matter `content`，失败返回 `null`。

- [ ] **Step 4: 确认通过并提交**

Run: `npx vitest run tests/note-ai-source.test.ts tests/notes.test.ts`
Run: `git add electron/lib/note-ai-source.ts tests/note-ai-source.test.ts && git commit -m "feat(notes): assemble ai source and guide inputs"`

---

### Task 3: 两轮检索、资料策展与写作提示词

**Files:**
- Create: `electron/lib/note-ai-generation.ts`
- Create: `electron/prompts/note-ai-round1.md`
- Create: `electron/prompts/note-ai-round2.md`
- Create: `electron/prompts/note-ai-curate.md`
- Create: `electron/prompts/note-ai-write.md`
- Test: `tests/note-ai-generation.test.ts`

**Interfaces:**
- Consumes: `AiNoteInput`、`chatNonStream`、`searchWeb`、`getSearchApiKey`、`TavilyResult`。
- Produces: `generateAiNoteBody(cfg, input, onStage): Promise<string>`。

- [ ] **Step 1: 用 mock 写管线失败测试**

验证每轮 2–3 个并行搜索，第二轮 prompt 含首轮结果；策展保留有效 W2 关系，无增益不伪造引用；写作 prompt 含策展素材与 compact source map，不含原始结果堆。覆盖单查询失败容忍、整轮失败、缺少 key、非法 JSON 重试一次和长度只修订一次。

```ts
expect(searchWeb).toHaveBeenCalledTimes(4)
expect(writePrompt).toContain('策展关系')
expect(writePrompt).not.toContain('仅供策展的完整原始摘要')
```

- [ ] **Step 2: 确认失败**

Run: `npx vitest run tests/note-ai-generation.test.ts`
Expected: FAIL，生成模块尚不存在。

- [ ] **Step 3: 写提示词并实现最小编排**

规划/策展 JSON 非法时重试一次；查询只接受 2–3 个非空英文字符串，按 URL 去重。策展输出 3–5 条 `{ relation, claim, contribution, sourceIds }`；写作用 `[W1-1]` / `[W2-1]` 引用，正文汉字数越界时明确修订一次，仍不合格抛 `NOTE_GENERATION_INVALID`。

- [ ] **Step 4: 确认通过并提交**

Run: `npx vitest run tests/note-ai-generation.test.ts`
Run: `git add electron/lib/note-ai-generation.ts electron/prompts/note-ai-*.md tests/note-ai-generation.test.ts && git commit -m "feat(notes): add two-round ai distillation pipeline"`

---

### Task 4: IPC 候选会话、路径锁与类型安全 API

**Files:**
- Modify: `electron/ipc/notes.ts`
- Modify: `electron/preload.ts`
- Modify: `src/types/index.ts`
- Modify: `src/lib/ipc.ts`
- Test: `tests/notes-ai-ipc.test.ts`

**Interfaces:**
- Produces: `AiNoteStage`、`AiNoteProgress`、`AiNoteCandidate`、`AiNoteApplied`。
- Produces: `notesGenerateAi({ path })`、`notesApplyAi({ generationId })`、`notesAbortAi({ generationId })`、`onNotesAiProgress(callback)`。
- Produces: 可注入生成器的 `createNotesAiHandlers(cfg, deps)`，供单测不访问真实模型。

- [ ] **Step 1: 写 IPC 失败测试**

覆盖已生成在搜索前拒绝、同路径并发只运行一次、进度顺序、失败/取消释放锁、候选不写文件、`NOTE_CHANGED` 不覆盖新编辑，以及成功 apply 同时写 AI 正文、附录和标记。

- [ ] **Step 2: 确认失败**

Run: `npx vitest run tests/notes-ai-ipc.test.ts`

- [ ] **Step 3: 实现会话和 API**

保存 `generationId → { path, baseRawHash, aiBody }`；锁从 generate 持有到 apply/abort/失败。依次发送 `reading/round1/round2/curating/writing`。apply 先校验候选，再调用原子写回，所有结束路径清理候选与锁。

- [ ] **Step 4: 确认通过并提交**

Run: `npx vitest run tests/notes-ai-ipc.test.ts tests/notes.test.ts tests/note-ai-generation.test.ts`
Run: `git add electron/ipc/notes.ts electron/preload.ts src/types/index.ts src/lib/ipc.ts tests/notes-ai-ipc.test.ts && git commit -m "feat(notes): add preview and atomic apply ipc"`

---

### Task 5: 主笔记 Sparkles 入口与共享生成状态

**Files:**
- Create: `src/lib/note-ai.ts`
- Create: `src/components/notes/AiNoteGenerator.tsx`
- Modify: `src/components/notes/NoteMetaHeader.tsx`
- Modify: `src/store/index.ts`
- Test: `tests/note-ai.test.ts`
- Test: `tests/ai-note-generator.test.tsx`
- Test: `tests/notes-ai-store.test.ts`

**Interfaces:**
- Produces: `canGenerateAiNote(entry): boolean`。
- Produces: `aiNoteGeneration: { path; stage; candidate } | null`、`generateAiNote(path)`、`applyAiNote()`、`cancelAiNote()`。

- [ ] **Step 1: 写资格、组件和 store 失败测试**

覆盖未知来源、parseError、已生成无入口；点击前等待 dirty 保存；Sparkles → 进度 → 预览；取消可重试；确认后 notesList、主编辑器正文/dirty/saving 同步，旧自动保存不得回写。

- [ ] **Step 2: 确认失败**

Run: `npx vitest run tests/note-ai.test.ts tests/ai-note-generator.test.tsx tests/notes-ai-store.test.ts`

- [ ] **Step 3: 实现入口、预览和 store 动作**

`AiNoteGenerator` 用 portal 显示候选与“写入笔记”/“取消”。生成前只保存目标主编辑器或目标对照的 dirty 内容；apply 后刷新 `notesList`，同步目标 `writingFile` 与 `articleCompanion`，设 `dirty: false`、`saving: 'saved'`。

- [ ] **Step 4: 确认通过并提交**

Run: `npx vitest run tests/note-ai.test.ts tests/ai-note-generator.test.tsx tests/notes-ai-store.test.ts`
Run: `git add src/lib/note-ai.ts src/components/notes/AiNoteGenerator.tsx src/components/notes/NoteMetaHeader.tsx src/store/index.ts tests/note-ai.test.ts tests/ai-note-generator.test.tsx tests/notes-ai-store.test.ts && git commit -m "feat(notes): add sparkles generation preview"`

---

### Task 6: 对照页精确匹配入口与双编辑器同步

**Files:**
- Modify: `src/lib/note-ai.ts`
- Modify: `src/components/article-assistant/ArticleCompanionBoard.tsx`
- Modify: `src/store/index.ts`（仅补测试暴露的同步缺口）
- Test: `tests/note-ai.test.ts`、`tests/notes-ai-store.test.ts`、`tests/article-companion-ai.test.tsx`

**Interfaces:**
- Produces: `AiNoteSourceTarget = { type: 'blog'; url } | { type: 'book'; book; chapter }`。
- Produces: `canGenerateCompanionAiNote(entry, target, file): boolean`。

- [ ] **Step 1: 写对照匹配失败测试**

覆盖博客规范化 URL 相等、书籍 `book + noteChapter(entry)` 相等；错配、空槽、普通文章、repository、只读、已生成均无入口。生成后保持当前主文与对照槽，不跳页。

- [ ] **Step 2: 确认失败**

Run: `npx vitest run tests/note-ai.test.ts tests/notes-ai-store.test.ts tests/article-companion-ai.test.tsx`

- [ ] **Step 3: 接入对照入口**

`ArticleCompanionBoard` 从 `notesList` 找当前 entry，从当前 Anthropic article 或 active book/chapter 构造 target；仅当 `articleCompanion.key` 仍是当前主文 key 时显示。复用 `AiNoteGenerator`，不新增第二条管线。

- [ ] **Step 4: 确认通过并提交**

Run: `npx vitest run tests/note-ai.test.ts tests/notes-ai-store.test.ts tests/article-companion-ai.test.tsx`
Run: `git add src/lib/note-ai.ts src/components/article-assistant/ArticleCompanionBoard.tsx src/store/index.ts tests/note-ai.test.ts tests/notes-ai-store.test.ts tests/article-companion-ai.test.tsx && git commit -m "feat(notes): add exact-match companion generation"`

---

### Task 7: 定向 E2E、文档与整体验收

**Files:**
- Create: `e2e/specs/notes-ai-generation.spec.ts`
- Modify: `e2e/source-map.json`
- Modify: `docs/README.md`、本 spec 与本 plan。

- [ ] **Step 1: 写本地 Kimi/Tavily mock E2E**

复用 `external-materials-real-search.spec.ts` 的 mock server，不访问真实 API。覆盖主笔记生成与原笔迹保留、匹配对照不跳页、错配/已生成无入口、重复 IPC 不重复调用、整轮搜索失败与预览期间编辑不写坏原文件。

- [ ] **Step 2: 登记 source map 并运行定向 E2E**

把新模块和 `notes-ai-generation.spec.ts` 加入 notes group。

Run: `node scripts/e2e-changed.js`
Expected: 新 spec 被覆盖，无 orphan WARNING。

Run: `npx electron-vite build && npx playwright test --config e2e/playwright.config.ts e2e/specs/notes-ai-generation.spec.ts`
Expected: PASS；如用户应用占用资源则停止，不清理进程、不启动第二实例，并记录待运行。

- [ ] **Step 3: 更新文档状态与实施记录**

完成后将 spec/plan 改为 `status: current`，记录实现偏差与真实验证结果；`docs/README.md` 笔记域增加 AI 两轮蒸馏现状与 current 指针，不伪造未运行结果。

- [ ] **Step 4: 运行最终定向验证**

Run: `npx vitest run tests/notes.test.ts tests/note-ai-source.test.ts tests/note-ai-generation.test.ts tests/notes-ai-ipc.test.ts tests/note-ai.test.ts tests/ai-note-generator.test.tsx tests/notes-ai-store.test.ts tests/article-companion-ai.test.tsx`
Run: `npm run build`
Run: `npm run docs:check && git diff --check`
Expected: 全部 PASS。

- [ ] **Step 5: 提交**

Run: `git add e2e/specs/notes-ai-generation.spec.ts e2e/source-map.json docs/README.md docs/superpowers/specs/2026-11-05-ai-note-generation-design.md docs/superpowers/plans/2026-11-05-ai-note-generation.md && git commit -m "test(notes): verify one-time ai note generation"`

