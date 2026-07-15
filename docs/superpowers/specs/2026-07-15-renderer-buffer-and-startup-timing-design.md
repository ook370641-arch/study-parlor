---
description: 修复渲染进程 gray-matter Buffer 报错 + 添加渲染进程启动性能打点，定位 ~21s did-finish-load 延迟根因。
paths:
  - src/lib/frontmatter-safe.ts
  - src/components/md/MarkdownRenderer.tsx
  - src/components/md/fileType.ts
  - src/types/index.ts
  - electron/preload.ts
  - electron/main.ts
  - src/main.tsx
  - src/App.tsx
---

# 渲染进程 Buffer 报错修复 + 启动性能打点

> 日期：2026-07-15
> 状态：已实现
> 前置 spec：
> - `2026-05-31-loading-screen-design.md`（启动加载屏设计）
> - `.claude/rules/ipc-state.md` §5（渲染进程禁止 import 主进程解析库）

## 1. 问题概述

两个相互关联的问题：

### 1.1 gray-matter Buffer 报错（渲染进程）

渲染进程在 MarkdownRenderer 组件中 import `gray-matter` 和 `@electron/lib/frontmatter`，两者内部使用 Node.js `Buffer`。Vite dev server 将这些模块转译为 ESM 后在浏览器上下文中执行，`Buffer` 未定义，抛出 `ReferenceError: Buffer is not defined`。

错误出现在两条调用链上：
- `MarkdownRenderer → parseFrontmatter (@electron/lib/frontmatter) → matter() → toBuffer()` — 行 86
- `MarkdownRenderer → matter() (gray-matter 直接导入) → toBuffer()` — 行 100

每次 MarkdownRenderer 挂载（查看存档报告、复习记录、寓言故事等）都会触发，日志中重复出现是因为页面同时挂载了多个 MarkdownRenderer 实例或 React StrictMode 双重渲染。

### 1.2 启动慢无法定位瓶颈在渲染进程的哪个阶段

现有 bootstrap 打点（终端输出）精确到主进程的每个阶段，并能定位瓶颈在 `did-start-loading → did-finish-load`（~21s）。**但主进程对渲染进程内部发生的事情完全不可见**——它不知道这 21 秒是消耗在 Vite 模块转换、浏览器请求瀑布、JS 解析求值、还是 React 渲染上。

## 2. 设计目标

- **消除 gray-matter Buffer 报错**：渲染进程中所有 frontmatter 解析使用纯 JS 实现，不依赖 Node.js 内置对象。
- **渲染进程性能可观测**：在 `main.tsx` 和 `App.tsx` 关键路径上添加 `performance.now()` 打点，通过 IPC（fire-and-forget）回传主进程，在终端与 bootstrap 日志合并显示。
- **零破坏性**：不改动 MarkdownRenderer 组件 API、不改动 ReportHeader 前端展示、不改动主进程 `@electron/lib/frontmatter.ts`（主进程继续使用 gray-matter）。

## 3. 非目标

- 不解决 21s 启动延迟本身——本 spec 只添加诊断 instrumentation，定位根因后再单独出修复 spec。
- 不在主进程中替换 gray-matter。
- 不实现完整 YAML 解析器——只覆盖 Study Parlor `serializeFrontmatter()` 实际生成的 YAML 子集。
- 不改变 IPC 通信模式（仍使用 `contextBridge` + `ipcRenderer.send`）。

## 4. 关键决策

| 决策点 | 选择 | 理由 |
|--------|------|------|
| 解析器实现方式 | 正则提取 frontmatter 块 + 行级 YAML 子集解析 | 覆盖 Study Parlor 生成的所有 frontmatter 格式（标量、引号字符串、数字、布尔、块数组 `- item`），不需要完整 YAML 1.2 合规 |
| 文件位置 | `src/lib/frontmatter-safe.ts`（新建） | 与主进程 `electron/lib/frontmatter.ts` 平行命名，路径清晰 |
| detectDocType 修复 | `extractFrontmatterField(content, 'type')` — 单字段正则提取 | 该函数只需 `type` 字段，用轻量级正则而非完整解析 |
| IPC 通信方式 | `ipcRenderer.send`（fire-and-forget）而非 `ipcRenderer.invoke` | timing 日志不需要返回值，send 不阻塞渲染进程关键路径 |
| logTiming 注册时机 | 在 `window created` 之后、`loadURL` 之前注册 | 最早的 timing 调用（`main.tsx` 模块求值阶段）在页面加载期间发生，handler 必须提前就绪 |
| 时间基准 | `performance.now()` — 相对于 `navigationStart` | 渲染进程内部所有时间戳共享同一时间原点，与主进程 `Date.now()` 独立但自洽 |

## 5. 实现架构

### 5.1 frontmatter-safe.ts 解析器

```
raw markdown string
  │
  ├─ /^---\r?\n([\s\S]*?)\r?\n---/ → extract frontmatter block
  │
  ├─ parseSimpleYaml(yaml) → line-by-line state machine
  │     ├─ "key: value"      → parseScalar(value) → string | number | boolean
  │     ├─ "key: 'quoted'"   → strip quotes
  │     ├─ "key:" + "  - item" → block array of scalars
  │     └─ "key:" + empty    → ""
  │
  └─ Returns { data: Record<string, unknown>, content: string }
```

解析器支持的 YAML 子集：
- 标量：`key: value`
- 单/双引号字符串：`key: 'value'` / `key: "value"`
- 整数/浮点数：`key: 42`
- 布尔：`key: true` / `key: false`
- null/空数组：`null`, `~`, `[]`
- 块数组：`key:\n  - item1\n  - item2`

不支持（也不需要）：内联数组 `[a, b]`、嵌套对象数组（如 `sources`）、多行字符串、YAML 锚点/别名。

### 5.2 性能打点数据流

```
渲染进程                           主进程
─────────                         ────────
main.tsx eval
  performance.now() ──send──→  [renderer] main.tsx imports resolved  +320ms
React.render() done
  performance.now() ──send──→  [renderer] main.tsx React.render() done +350ms
App mounted (useEffect)
  performance.now() ──send──→  [renderer] App mounted  +380ms
App boot checks done
  performance.now() ──send──→  [renderer] App boot checks resolved +21080ms
boot:complete received
  performance.now() ──send──→  [renderer] App boot:complete received +23450ms
store.init start
  performance.now() ──send──→  [renderer] App store.init start +23452ms
store.init done
  performance.now() ──send──→  [renderer] App store.init done +23600ms
Cover chunk ready
  performance.now() ──send──→  [renderer] App Cover chunk ready +23800ms
```

## 6. 改动清单

| 文件 | 操作 | 说明 |
|------|------|------|
| `src/lib/frontmatter-safe.ts` | 新建 | 浏览器安全 frontmatter 解析器，导出 `matter()`、`parseFrontmatterSafe()`、`extractFrontmatterField()` |
| `src/components/md/MarkdownRenderer.tsx` | 修改 | 移除 `gray-matter` 和 `@electron/lib/frontmatter` 导入，替换为 `@/lib/frontmatter-safe` |
| `src/components/md/fileType.ts` | 修改 | `gray-matter` → `extractFrontmatterField()`（只需 `type` 字段） |
| `src/types/index.ts` | 修改 | `IpcApi` 新增 `logTiming(label, elapsed): void` |
| `electron/preload.ts` | 修改 | 暴露 `logTiming` 为 `ipcRenderer.send('log:timing', ...)` |
| `electron/main.ts` | 修改 | 注册 `log:timing` IPC handler（window created 后、loadURL 前） |
| `src/main.tsx` | 修改 | 添加 `performance.now()` 打点（imports resolved → React.render done） |
| `src/App.tsx` | 修改 | 添加 `performance.now()` 打点（App mounted → boot checks → boot:complete → store.init → Cover chunk） |

## 7. 验收清单

- [x] `npm run dev` 启动时终端显示 `[renderer]` 前缀的 8 条 timing 日志
- [x] 打开任意存档报告/寓言故事，DevTools Console 中不再出现 `Buffer is not defined`
- [x] `npx tsc --noEmit` 零错误
- [x] `npm run test` 全部 465 测试通过，零回归
- [ ] 观察 timing 日志定位 21s 延迟的具体阶段（首次 `npm run dev` 后分析）

## 8. 风险与后续

- **风险**：`parseSimpleYaml()` 无法解析用户手动编辑的复杂 YAML frontmatter（如嵌套对象、内联数组）。**缓解**：Study Parlor 的所有 frontmatter 均由 `serializeFrontmatter()` 统一生成，格式可控。若用户手动编辑引入复杂 YAML，`ReportHeader` 会优雅降级（fallback 到默认值）。
- **后续**：分析首次 instrumentation 输出后，定位 21s 延迟的精确阶段，出独立修复 spec。可能的修复方向包括：Vite 构建预打包、模块导入依赖扁平化、HTTP/2 服务端推送、或接受 dev 模式慢并优化生产构建即可。
