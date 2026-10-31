# AGENTS.md

This file provides guidance to Codex (Codex.ai/code) when working with code in this repository.

## 项目概述

学者夜话 (Study Parlor) —— 本地 Electron 学习助手，用 Kimi API 做苏格拉底式辅导。管理用户本地的 `.md` 学习笔记。

- **技术栈**: Electron 30 + React 18 + TypeScript + Tailwind CSS + Zustand
- **构建**: electron-vite (无独立 vite.config.ts)
- **测试**: Vitest
- **打包**: electron-builder (Windows nsis)

## Codex 默认开发隔离流程

为保护用户正在主工作区通过 `npm run dev` 使用的应用，所有代码修改默认采用独立 branch + worktree。

1. 开始修改前，从用户当前集成分支创建 `codex/<任务名>` 分支。
2. worktree 必须放在主工作区之外的兄弟目录，例如 `../study-parlor-worktrees/<任务名>`；禁止放在主仓库内部，避免被 Vite 监听。
3. 所有源码编辑、依赖安装、单元测试和构建均只在独立 worktree 中进行。此流程明确授权在该分支提交代码；未经用户另行要求，不推送远程。
4. 主工作区视为受保护区域：开发期间不得直接编辑其中文件，也不得合并、rebase、切换分支或重启其开发服务。
5. 未经用户明确确认，不得启动第二个应用实例，也不得运行可能启动 Electron、占用开发端口或执行进程清理的 E2E 测试。
6. 完成后汇报修改内容、测试结果、分支及 worktree 路径，并询问是否合并。
7. 只有用户明确表示可以合并后，才合并到用户当前集成分支。合并可能触发应用刷新或重启，应提醒用户先保存工作。
8. 合并并验证后再清理 worktree；有未提交改动、测试失败或合并冲突时停止并汇报。
9. 纯阅读、解释、文档问答不创建 worktree；用户明确要求直接在当前工作区修改时，以用户要求为准。

执行时还需检查：

- 主工作区已有未提交改动时，不得贸然合并；先说明情况并采取保留措施。
- worktree 首次使用时需要安装独立的 `node_modules`，否则无法独立构建和测试。

## 常用命令

```bash
# 开发模式（需要保持终端运行）
npm run dev

# 构建生产版本
npm run build

# 打包 Windows 安装包 → release/ 目录
npm run package

# 运行所有测试
npm run test

# 测试监视模式
npm run test:watch

# 运行单个测试文件
npx vitest run tests/prompts.test.ts
```

### 清理开发环境

如果 `npm run dev` 启动变慢或出现端口占用，通常是之前的 Electron 进程没有干净退出：

```bash
# Windows
taskkill /F /IM electron.exe /T
taskkill /F /IM node.exe /T
rm -rf .electron-cache
```

从 v1.1.x 起，`scripts/dev.js` 会在启动前自动执行上述清理。

## E2E 定向测试

功能迭代后跑定向测试（按 git diff 匹配 `e2e/source-map.json`），**不跑全量**。全量是合并前门禁。

```bash
node scripts/e2e-changed.js --run             # 执行受影响 spec（自动先构建 out/）
node scripts/e2e-changed.js --run --no-retries # 本地迭代加速（失败不翻倍）
node scripts/e2e-changed.js                    # 仅列出（不执行）
npm run test:e2e                               # 全量（合并前）
```

> E2E 跑 `out/` 构建产物：`e2e-changed.js --run` 自动先构建；手动 `npx playwright test` 前须先 `npx electron-vite build`（详见 `.claude/rules/e2e.md` §11）。并行 workers 已配置。

**单元测试同理**：改哪个文件就跑哪个测试，不跑 `npx vitest run`。改 3 个以内文件时手动指定路径。

**source-map 维护**：新建 E2E spec 或新增页面/组件/IPC 模块时，必须同步更新 `e2e/source-map.json` ——在对应 group 的 `specs` 中添加新 spec，或新建 group（全新功能域）。`e2e-changed.js` 运行时会自动检测未被任何 group 覆盖的孤儿 spec 并输出 WARNING。

## 路径别名 (tsconfig)

- `@/*` → `src/*`
- `@shared/*` → `src/types/*`
- `@electron/*` → `electron/*`

## 架构总览

### 进程隔离与通信

三层结构：**主进程** (`electron/main.ts`) → **Preload** (`electron/preload.ts`) → **渲染进程** (`src/`)

- 严格 `contextIsolation: true`, `nodeIntegration: false`
- IPC API 定义在 `src/types/index.ts` 的 `IpcApi` 类型中
- IPC 处理器按域拆分在 `electron/ipc/{files,llm,state}.ts`

### LLM 层 (`electron/lib/`)

`kimi.ts` 封装 Kimi Coding API (OpenAI 兼容端点)。**关键约束**：该 API 要求特定 User-Agent (`'claude-code/0.1.0'`)，否则返回 403。使用 undici Agent 做连接池 keep-alive。

`prompts.ts` 负责系统 prompt 装配链，这是一个**顺序拼接**过程：

1. `learner-base.md` (基座)
2. `mode-review.md` (仅 review 模式，注入文件 body)
3. `difficulty-mid.md` 或 `difficulty-low.md` (条件注入)
4. 用户 profile 段

`llm-tasks.ts` 封装非流式调用（灵感生成、归档 finalization）。

### 会话生命周期 (`src/lib/`)

渲染进程侧的会话驱动逻辑分散在两个文件中，需配合阅读：

- **`session-runtime.ts`**: 注册 SSE 监听器 (`onLlmChunk`/`onLlmDone`/`onLlmError`)，管理 `sendOrInterrupt`（用户中途发消息时 abort 旧请求并立即发新请求）。会话历史截断策略：`history.slice(-MAX_PAIRS * 2)`，当前 `MAX_PAIRS = 30`。
- **`finalize.ts`**: 结束会话时调用。`progress` 模式 → 调 LLM 提取标题+正文 → 写新 `.md`；`review` 模式 → 在原 `.md` 末尾追加复习记录段 + 更新 frontmatter。

### 状态与持久化

- **运行时状态**: Zustand 单 store (`src/store/index.ts`)
- **持久化状态**: `~/.studyparlor/state.json` (profile / lastUsed / groupInspirations / topicContinueSuggestions / session_count 等)
- **环境配置 (`.env`)**:
  - `npm run dev` 时读取项目根目录的 `.env`
  - 打包安装后读取 `~/.studyparlor/.env`
  - E2E 测试时读取临时配置目录的 `.env`
- **学习库**: 用户指定的 `.md` 目录（通过 `.env` 的 `STUDY_LIBRARY_PATH`），应用只读/写，不锁定格式。frontmatter 用 gray-matter 解析，schema 见 `src/types/index.ts` 的 `Frontmatter`。

> 为什么 `state.json` 和 `.env` 分开：`.env` 在开发时放在项目根目录方便编辑；`state.json` 统一放在 `~/.studyparlor`，这样 `npm run dev` 和打包版共享同一份用户状态，E2E 测试通过 `E2E_CONFIG_DIR` 完全隔离。

### 迭代记事板

封面右上角铅笔按钮打开的记事板面板，用户随手记录对应用的迭代需求。**2026-10-19 起条目化**：每条需求三分类（bug / 新功能 / 功能优化），面板 ✓ 完成后自动归档到档案页。

**当用户说"看看我最近的迭代需求"（或类似表述）时**：直接读 `~/.studyparlor/state.json` 的 `notepadItems` 字段并回应。该文件在工作区外，沙箱读取可能需要提权。

**关键字段（state.json）**：

- `notepadItems: [{ id, title?, text, category, createdAt }]` — 待办条目；`category` 为 `'bug' | 'feature' | 'improvement'`；`title` 短标题创建时自动生成兜底
- `notepadLog: [{ id, title?, text, category, createdAt, resolvedAt, source: 'user' | 'agent' }]` — 迭代档案（已解决），面板「已完成」时间线数据源；`title` 短标题 ≤15 字，skill 归档时由 agent 总结
- `notepadFontSize: 'sm' | 'base' | 'lg'`、`notepadPanelSize: { w, h } | null` — 面板字号与自定义尺寸
- `coverNotepad`（纯字符串）已废弃，仅作一次性迁移源（非空且 notepadItems 为空时按行迁入后清空）

**归档约定**：agent 完成某条需求后，须把该条目从 `notepadItems` 移入 `notepadLog`（写 `resolvedAt` + `source: 'agent'`）。**app 运行中不要直接改 state.json**（内存旧值会覆盖），应让用户在面板点 ✓ 或先关闭 app。详见 `.agents/skills/notepad-triage/SKILL.md`。

相关代码：`src/components/NotepadPanel.tsx`（双 tab 面板：待完成 / 已完成时间线；旁注打开时与入口一起左移）、`src/lib/notepad.ts`（分类猜测/迁移/统计/短标题纯逻辑）、`src/store/index.ts`（`notepadItems` / `notepadLog` / `addNotepadItem` / `resolveNotepadItem`）、`electron/ipc/state.ts`（DEFAULT 字段）。

**接单时按 category 自动区分打法**（看到条目先识别类型，不要用同一套流程套所有需求）：

- `bug`：先定位根因再修，优先跑/写一个能复现的测试；禁止只糊表面症状。
- `feature`：动手前先用一两句话跟用户确认交互方案（给默认建议 + 1 个备选），避免大返工。
- `improvement`：对照现状与用户预期，做能达成预期的最小改动；不顺手重构、不扩大范围。

### 文件系统 (`electron/ipc/files.ts`)

- `files:scan` — 扫描 `STUDY_LIBRARY_PATH/*.md`，解析 frontmatter，返回 `FileMeta[]`
- `files:writeProgress` — 写新 `.md`，自动处理重名（后缀加 `-HHMM`）
- `files:appendReview` — 在原文件末尾追加复习记录段，更新 frontmatter 的 `review_count` 和 `last_reviewed`
- `files:recoveryDump` — IO 失败时把会话内容暂存到 `~/.studyparlor/recovery/`

### 推荐逻辑 (`electron/lib/llm-tasks.ts`)

- `generateContinueSuggestions` — 根据主题历史生成续谈推荐
- `generateGroupInspiration` — 根据分组内主题生成分组灵感

### 写作功能 (`electron/lib/writing-tree.ts`, `electron/lib/writing-catalog.ts`, `electron/lib/writing-assistant/`)

夜航简报来源之一（写作；当前三来源 = 写作 / Anthropic 博客 / 书籍，书籍见下节）。Typora 式 WYSIWYG Markdown 编辑 + 分组目录树管理 + AI 写作助手。

- **存储**: `<学习库>/writing/` (新写作) + `<学习库>/repository/` (过去积累)，分组 = 嵌套子目录
- **编辑器**: Milkdown v7 (ProseMirror)，所见即所得，产出纯 `.md`
- **AI 助手**: 停靠式右栏面板，渐进式披露（`read_local` 单一本地读取工具），网络搜索 + 思考深度开关
- **主进程模块**: `electron/lib/writing-tree.ts` (CRUD)、`electron/lib/writing-catalog.ts` (摘要)、`electron/lib/writing-assistant/` (工具协议/循环)
- **IPC**: `electron/ipc/writing.ts` (文件树)、`electron/ipc/writing-assistant.ts` (AI 对话)
- **渲染组件**: `src/components/writing/` (编辑器/树/工具栏)、`src/components/writing-assistant/` (助手面板)
- **持久化**: `state.json` 字段 `writingFontSize`/`writingTone`/`assistantSearchEnabled`/`assistantThinkingEffort` 等
- **设计基准**: 编辑器行为改动前先读 `docs/superpowers/specs/2026-08-11-writing-paste-and-formatting-design.md`

### 书籍来源（简报第三来源，2026-10-27 上线）

导入本地 PDF（仅 PDF；扫描版明确报错不入架）→ 复制到 `<学习库>/books/<书名>/source.pdf` → 按目录页解析切章为 `chapters/*.md`。核心映射：**书 = 来源，章 = "文章"**，章节完整复用导读/对照/旁注/笔记体系。

- **主进程**: `electron/lib/book-parse.ts`（目录页解析/页码偏移/章节切分 + 版面重建纯逻辑）+ `electron/lib/books.ts`（库 IO）+ `electron/lib/book-guide.ts`（章节导读）+ `electron/ipc/books.ts`（`books:list / import / chapters / readChapter / bookGuide / delete` 六通道）
- **正文重建（parserVersion 3）**: `itemsToRows` 保留每行的 `y/h/x0/x1` → `rowsToBlocks` 按行距（1.4× 常规行距）/字号（1.45×、1.2× 正文）/首行缩进判段与标题层级 → `blocksToMarkdown` 输出 `##`/`###`；页眉页脚按页顶页底 6% 区域过滤。目录页支持「标题 页码」「页码 标题」「标题块 + 页码块」三种布局。表格仍会被拍平，双栏段落顺序可能不等于阅读顺序。
- **重解析**: `books:reparse` 原子替换 `chapters/`；旧章节导读按「章节文件同名 → 标题同名」保留，目录未变时保留全书导读。`parserVersion < 3` 的旧书在书架显示「重新解析」。
- **渲染**: `src/components/books/`（BookPanel / BookListColumn / ChapterListColumn / BookReader）；store 字段 `booksList` / `activeBookDir` / `activeBookToc` / `activeChapter`；`booksLastChapter` + `bookScrollMemory` 复用博客滚动记忆，划词备注/四色高亮与博客共用 `ArticleAnnotations`
- **导读**: 全书导读只传目录不传正文（prompt `electron/prompts/book-overview.md`，装配在 `llm-tasks.ts` 的 `buildBookOverviewPrompt`，缓存进 `book.json`）；章节导读 prompt `electron/prompts/book-guide-v2.md`
- **类型**: `BriefingSourceId` 含 `'book'`；`NoteSource` 含 `'book'`，`NoteMeta.book` 记书名（笔记按书聚合）
- **记录**: `docs/superpowers/specs/2026-10-27-books-source-design.md` + 同名 plan（historical，索引见 `docs/README.md` 域 14）

## 画作策展（Pictures 画库）

事实源 `docs/superpowers/plans/paintings-collection-draft-2026-09-28.md`（图源坑/批次史/风格总结），规则 `.claude/rules/paintings-curation.md`；脚本序列：`curation-fetch.cjs`（唯一下载通道）→ `wikiart-batchN.cjs`/`dl-tmdb.cjs` → `assemble-bN.cjs` → `curation-gallery.cjs` → 用户导出 selection.json → `curation-merge.cjs`。

## 文档库（docs/）阅读与维护协议

文档分三层：**现状层**（本文件 + `.claude/rules/`）→ **索引层**（`docs/README.md`）→ **历史层**（`docs/superpowers/{plans,specs}/`，220+ 份时间点快照）。

- **默认历史原则**：无 `status` frontmatter 的文档一律是历史快照，禁止当作当前状态引用；当前状态唯一权威 = 本文件 + `.claude/rules/` + 代码。
- **入口是 `docs/README.md`**：按功能域定位（现状一句话 + current/removed/planned/superseded 指针 + 历史链），只精读 `status: current` 或域内最新文档，不通读。
- **维护义务（功能交付的一部分）**：功能落地/设计推翻/功能移除后，必须同步更新 `docs/README.md` 对应功能域与相关 frontmatter（状态标记规则见该文件「维护协议」一节；强制条目 `.claude/rules/feature-development.md` §14）。移除功能时保留移除计划文档作**墓碑**，禁止裸删 spec。
- 提交前跑 `npm run docs:check`（frontmatter 合法性 / 指针存在性 / 索引可达性 / 文档引用完整性），错误清零才算交付。

## 关键配置

### `.env` 必需字段

```
KIMI_API_KEY=sk-kimi-...          # 不能是占位符，否则启动阻断
KIMI_BASE_URL=https://api.kimi.com/coding/v1
KIMI_MODEL=kimi-k2.6
STUDY_LIBRARY_PATH=...            # 学习库根目录
```

`electron/env.ts` 加载并校验 `.env`。占位符白名单：`['sk-kimi-replace-me', 'sk-kimi-...', 'your-api-key']`。

### 启动顺序

`main.ts` bootstrap：加载 `.env` → 若配置缺失则进入 setup wizard → 创建窗口 → `registerAllIpc()` → 探活模型 → 扫描学习库 → 初始化状态。

**注意**：如果 `loadEnv()` 抛出（如 API key 是占位符），应用进入首次配置向导而非 fatal error。配置完成后通过 `setup:writeConfig` IPC 触发正常启动序列。

## 视觉与 UI

- 暗色主题，调色板：深褐 `#2a1f1a` / 米色 `#e8d5b7` / 暖橙 `#d97757`
- Tailwind 自定义颜色在 `tailwind.config.ts` 中定义（`parchment`, `ember`, `wine`, `ink`, `slate` 等）
- 页面路由：`cover` → `home` → (`study` | `profile`)，`preStudy` 是模态层

## 启动问题排查

遇到启动慢 / 二次加载 / 棕色闪屏 / 端口占用，入口顺序：

1. `npm run dev` 看 `[startup-watchdog]` 健康摘要（HEALTHY / UNHEALTHY），⚠ 报警行自带病因与修复指引
2. 长期跟踪文档（历次启动问题的根因、修复与诊断命令）：`docs/superpowers/plans/2026-07-10-fix-dev-hang-and-orphan-processes.md`
3. 自动化回归：`npx playwright test --config e2e/playwright.config.ts startup-health`
4. 一键恢复：`npm run dev:clean`

## 测试

测试文件在 `tests/` 目录，覆盖：
- `env.test.ts` — `.env` 加载与校验
- `frontmatter.test.ts` — gray-matter 解析与序列化
- `prompts.test.ts` — 系统 prompt 装配链
- `recommend.test.ts` — 推荐算法
- `archive.test.ts` — 重名冲突、复习记录追加
- `kimi.test.ts` — SSE chunk 解析
- `llm-tasks.test.ts` — 灵感生成、归档提取
- `safe-json.test.ts` — state.json 读写与备份
