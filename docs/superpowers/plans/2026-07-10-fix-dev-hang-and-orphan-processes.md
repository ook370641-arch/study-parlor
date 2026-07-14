# 启动优化 · 长期跟踪文档

> **目的：** 这是 Study Parlor 启动体验优化的**唯一长期文档**。所有与启动相关的问题——冷启动慢、白屏/闪屏、LoadingScreen 动画卡顿、进程泄漏导致端口占用、boot sequence 超时——都在这份文档中记录诊断过程、根因分析和修复方案。
>
> **使用方式：** 每次发现新的启动问题，在文档末尾追加一个新的 `## Task N` 区块（格式见底部模板）。不要另开新 spec。

---

## 修订历史

| 日期 | 版本 | 关键变更 | 效果 |
|------|------|----------|------|
| 2026-07-10 | 初版 | Task 1–8：进程清理基础设施、dev cache 隔离、boot 动画缩短、E2E 残留清理 | 孤儿进程泄漏大幅降低，有 `dev:clean` 一键恢复 |
| 2026-07-11 | 第二次 | Task 9：Vite watch 排除 `.electron-cache`、`dev:clean` 同时清理新旧缓存路径 | 防御性加固，避免旧缓存目录落入 watcher |
| 2026-07-14 | 第三次 | Task 10：SWC 替代 Babel + Vite warmup + Cover 预加载 | **冷启动 21s → 2.9s**，消除 boot 后棕色闪屏 |

---

## 架构概述

**启动链路（按时间顺序）：**

```
npm run dev
  → scripts/dev.js (preflight cleanup → spawn electron-vite)
    → Vite dev server 冷启动 (构建 main/preload SSR → 启动 renderer dev server)
      → Electron 主进程启动 (app.whenReady → 创建窗口 → 加载 localhost:5173)
        → 浏览器请求 main.tsx → Vite transform + serve
          → React 渲染 → LoadingScreen → boot:start IPC
            → boot sequence (IPC 注册 → 探活模型 → 扫描学习库 → 初始化状态)
              → boot:complete → handleBootComplete → Cover 渲染
```

**关键文件职责：**

| 文件 | 职责 |
|------|------|
| `scripts/dev.js` | 启动前清理孤儿进程/端口；Electron 退出后自动结束 dev server |
| `scripts/dev-clean.js` | 手动一键恢复：杀进程、清端口、删缓存 |
| `scripts/lib/process-cleanup.js` | 共享的进程扫描、端口检查、进程树终止工具 |
| `electron.vite.config.ts` | Vite 配置：SWC 插件、warmup 预转换、watch ignore |
| `electron/main.ts` | dev cache 隔离、boot sequence、窗口关闭退出 |
| `electron/lib/app-paths.ts` | dev / E2E / packaged 三种模式的路径解析 |
| `src/App.tsx` | React.lazy 页面 + Cover 预加载 + idle 预热 |
| `src/main.tsx` | 入口：挂载 React 根节点 |
| `src/store/index.ts` | 最重的 eager 模块（~1200 行，6 个传递依赖） |
| `e2e/helpers/test-library.ts` | E2E 目录老化清理 |
| `package.json` | `@vitejs/plugin-react-swc` 替代 Babel |

---

## 已完成任务

### Task 1–8 (2026-07-10) — 进程清理与缓存隔离基础设施

**问题：** `npm run dev` 启动慢（~26s），点击窗口 × 关闭后 electron/node 进程残留，下次启动端口占用。

**修复内容：**

1. **提取共享清理工具** (`scripts/lib/process-cleanup.js`)：`listProjectProcesses` / `findPortListeners` / `killProcessTree` / `cleanupProjectOrphans`。项目路径匹配 + wmic CSV 解析，避免误杀其他项目的 Electron。

2. **改造 `scripts/dev.js`**：启动前调用 `preflightCleanup()` 杀孤儿进程 + 释放 5173/9222 端口；`electron-vite` 子进程 `exit` 时自动退出 dev.js；Windows 上用 `readline` 监听 Ctrl+C。

3. **dev 模式 userData/cache 隔离** (`electron/lib/app-paths.ts`)：dev 模式下 cache 重定向到 `node_modules/.electron-cache/`（Vite 默认排除），与 packaged 版本隔离。

4. **窗口关闭退出增强**：`window-all-closed` 中关闭所有 webContents 后再 `app.quit()`。

5. **E2E 残留目录老化清理**：每次创建测试目录时清理超过 24h 的旧目录；teardown 等待更长时间确保 Windows 释放文件句柄。

6. **boot 动画缩短**：阶段动画延迟从 1650ms 降到 1150ms。

7. **新增 `npm run dev:clean`** 一键恢复命令。

**相关提交：** `feat(cleanup): extract shared process/port cleanup utilities`, `feat(dev): preflight orphan cleanup and auto-exit`, `feat(main): isolate dev-mode userData/cache`, `fix(main): close all webContents`, `feat(e2e): age out old test dirs`, `perf(bootstrap): shorten boot animation delays`

---

### Task 9 (2026-07-11) — Vite 冷启动防御性加固

**问题：** 一次真实启动中 `renderer did-finish-load` 耗时 26s。排查确认根因是 Vite dev server 冷启动（Windows 上 esbuild 管线慢 3–5×），同时发现旧代码留下的项目根 `.electron-cache/`（17MB, 186 文件）未被清理——该目录不在 `node_modules/` 下，落入 Vite file watcher 范围。

**修复：**
- `electron.vite.config.ts` 的 `server.watch.ignored` 追加 `**/.electron-cache/**`（防御性排除：缓存路径因旧代码/手动操作落在项目根时不会被 chokidar 监控）
- `dev-clean.js` 同时清理 `node_modules/.electron-cache/`（当前）和 `.electron-cache/`（旧代码遗留）

**已知限制：** Vite 源码转换缓存是纯内存的，dev server 进程重启即丢失——**每次 `npm run dev` 都是冷启动**。此 Task 只做防御性加固，不做过度修复。

**相关提交：** `fix(dev): add .electron-cache to Vite watch ignore, clean stale cache dirs`

---

### Task 10 (2026-07-14) — SWC + warmup + Cover 预加载 ⭐

**这是目前最重要的一次修复，将冷启动从 21s 降到 2.9s。**

#### 根因分析

Task 9 将 Vite 冷启动标记为"固有限制"，但实践中每次 `npm run dev` 都是冷启动（缓存纯内存，重启即丢失）。原 React.lazy 优化（`af262d1`）已被新增 eager import 部分抵消：

- `assistant-session-runtime.ts` — 31 行，注册 4 个 IPC 监听器，import store + ipc
- `store/index.ts` — 从 ~800 行增长到 ~1200 行（job-briefing、article-assistant state slice）
- `preloadPaintings` 等新 eager import

**冷启动慢的三个独立根因：**

1. **Babel 转换慢**：`@vitejs/plugin-react` 用 Babel 做 React Refresh 代码注入，Windows 上单模块 80–150ms，而 SWC (Rust) 只需 15–25ms
2. **串行模块发现**：浏览器请求 `main.tsx` → Vite 转换 → 浏览器发现 import → 再请求 → 再转换… 级联延迟
3. **Cover 首屏闪屏**：`React.lazy` + `<Suspense fallback={null}>` 在 chunk 加载期间渲染空白

#### 修复方案

**Step 10.1–10.2: SWC 替代 Babel + warmup**

```ts
// electron.vite.config.ts
- import react from '@vitejs/plugin-react'
+ import react from '@vitejs/plugin-react-swc'

// renderer.server 新增
warmup: {
  clientFiles: ['./src/main.tsx'],
},
```

- **SWC**：Rust 实现，drop-in 替换，React Fast Refresh 行为完全一致。单模块转换从 80–150ms → 15–25ms（3–5× 提升）
- **warmup**：dev server 启动后立即**并行**预转换 `main.tsx` 及其全部 eager import 依赖链（23 个源文件 + 3 个 npm 包），消除串行请求的级联延迟

**为什么不会退化：** SWC + warmup 的转换成本是 O(1) 常数级——每个模块的转换时间固定，不随项目增长而线性变慢。而之前的 React.lazy 优化是 O(N) 的——每新增一个 eager import 直接加到启动时间上。

**Step 10.5: Cover 首屏预加载**

此前 `630fab6` 提交在 boot 完成后用 `requestIdleCallback` 预热 Home/Study/Briefing，但存在两个缺陷：
1. 漏掉了 Cover——启动后第一个渲染的页面
2. `requestIdleCallback` 在 Cover 渲染完成后才触发，对首屏闪屏无帮助

修复（`src/App.tsx` `handleBootComplete` 开头）：

```tsx
const handleBootComplete = async () => {
  // 预加载首屏页面，利用 ES module 同 URL 同 promise 特性，
  // 让 React.lazy 在重渲染时命中已缓存模块
  import('@/pages/Cover')

  await init()
  ipc.llmProbe()...
  setIsBooting(false)  // 此时 Cover chunk 已就绪，Suspense 不触发 fallback
}
```

ES module 规范保证同一 URL 的 `import()` 返回同一个 promise——裸 `import()` 和 `React.lazy` 工厂共享底层模块缓存。boot 期间 ~1s 的 init+probe 足够 Cover chunk 完成加载。

#### 验证结果

```
# 单元测试：66 files, 462 tests — 全部通过
npm run test

# 冷启动（清除 deps 缓存后）
rm -rf node_modules/.vite/deps
npm run dev
# renderer did-finish-load: 21001ms → 2882ms (7.2×)
# 总启动: ~23s → ~5s
# Cover 首屏: 即时渲染，无棕色闪屏
```

**相关提交：** `630fab6` (prefetch), `ed10ca2`→…→ 本次 SWC + warmup + Cover preload

---

## 诊断命令速查

```bash
# 冷启动计时（清除 Vite 缓存）
rm -rf node_modules/.vite/deps && npm run dev
# 观察日志: [bootstrap] renderer did-finish-load [+XXXXXms]

# 一键恢复（启动慢/端口占用时）
npm run dev:clean

# 手动杀进程
taskkill /F /IM electron.exe /T
taskkill /F /IM node.exe /T

# 查看当前项目相关进程
wmic process where "name='node.exe' or name='electron.exe'" get ProcessId,CommandLine /format:csv | findstr /i "study-parlor"

# 查看 eager import 依赖链（评估冷启动成本）
# 从 src/main.tsx 出发，追踪所有非 lazy 的 import
```

## 关键设计决策

1. **不追求 100% 进程清理**：Windows + Electron + Vite 的进程树在部分退出路径下无法完全避免泄漏。目标是"大幅降低概率 + 一键恢复"。
2. **Vite 转换缓存不持久化**：这是 Vite 的设计决定，我们不绕过它。通过 SWC + warmup 让每次冷启动足够快（<3s）来容忍它。
3. **React.lazy 页面只减首次加载，不减冷启动**：Vite 仍需转换 `main.tsx` → `App.tsx` → `store` → … 的 eager 依赖链。减少 eager import 数量才能降冷启动成本。
4. **Cover 预热时机必须在 `setIsBooting(false)` 之前**：之后才发 `import()` 已经晚了——React 已经开始渲染，Suspense 会触发 fallback。

---

## 添加新 Task 的格式

追加新问题时，复制以下模板到文档末尾：

```markdown
---

## Task N: [简短标题]（YYYY-MM-DD 第X次修订）

**问题描述：** [用户看到的症状，附日志/截图]

**根因分析：** [Phase 1 调查结论 —— 为什么会发生]

**修复方案：**

- [ ] **Step N.1: [步骤标题]**
  - 文件：`path/to/file.ts`
  - 改动：[简述]
  - 原因：[为什么这样改]

- [ ] **Step N.2: [步骤标题]**
  …

**验证：**
```bash
# 验证命令
npm run test
npm run dev  # 观察启动耗时
```

**相关提交：** `commit-hash` (描述)

**对修订历史的影响：** [如果改变了架构假设或已知限制，更新顶部修订历史表]
```

---

## 相关规则文件

- `.claude/rules/build-dev.md` — 构建/开发环境规则（§3 启动前清理、§5 cache 隔离、§9 双重恢复）
- `.claude/rules/general.md` — 通用规则（§7 异步生命周期管理）
