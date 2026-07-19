# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 项目概述

学者夜话 (Study Parlor) —— 本地 Electron 学习助手，用 Kimi API 做苏格拉底式辅导。管理用户本地的 `.md` 学习笔记。

- **技术栈**: Electron 30 + React 18 + TypeScript + Tailwind CSS + Zustand
- **构建**: electron-vite (无独立 vite.config.ts)
- **测试**: Vitest
- **打包**: electron-builder (Windows nsis)

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

### 文件系统 (`electron/ipc/files.ts`)

- `files:scan` — 扫描 `STUDY_LIBRARY_PATH/*.md`，解析 frontmatter，返回 `FileMeta[]`
- `files:writeProgress` — 写新 `.md`，自动处理重名（后缀加 `-HHMM`）
- `files:appendReview` — 在原文件末尾追加复习记录段，更新 frontmatter 的 `review_count` 和 `last_reviewed`
- `files:recoveryDump` — IO 失败时把会话内容暂存到 `~/.studyparlor/recovery/`

### 推荐逻辑 (`electron/lib/llm-tasks.ts`)

- `generateContinueSuggestions` — 根据主题历史生成续谈推荐
- `generateGroupInspiration` — 根据分组内主题生成分组灵感

### 写作功能 (`electron/lib/writing-tree.ts`, `electron/lib/writing-catalog.ts`, `electron/lib/writing-assistant/`)

夜航简报的第四来源。Typora 式 WYSIWYG Markdown 编辑 + 分组目录树管理 + AI 写作助手。

- **存储**: `<学习库>/writing/` (新写作) + `<学习库>/repository/` (过去积累)，分组 = 嵌套子目录
- **编辑器**: Milkdown v7 (ProseMirror)，所见即所得，产出纯 `.md`
- **AI 助手**: 停靠式右栏面板，渐进式披露（`read_local` 单一本地读取工具），网络搜索 + 思考深度开关
- **主进程模块**: `electron/lib/writing-tree.ts` (CRUD)、`electron/lib/writing-catalog.ts` (摘要)、`electron/lib/writing-assistant/` (工具协议/循环)
- **IPC**: `electron/ipc/writing.ts` (文件树)、`electron/ipc/writing-assistant.ts` (AI 对话)
- **渲染组件**: `src/components/writing/` (编辑器/树/工具栏)、`src/components/writing-assistant/` (助手面板)
- **持久化**: `state.json` 字段 `writingFontSize`/`writingTone`/`assistantSearchEnabled`/`assistantThinkingEffort` 等

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
