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
| 2026-07-19 | 第四次 | Task 11：optimizeDeps 覆盖懒加载链 + warmup 全页面 + 主进程 dev 外部化 + LoadingScreen 守卫 | 消除 re-optimization 整页 reload（棕色闪屏 + 二次加载）；主进程构建 15.5s → 0.4s |
| 2026-07-19 | 第五次 | Task 12：看门狗 HMR 误报修复 + 输出英文化 + Fast Refresh 组件导出规范 | 区分「HMR 原地重挂载」与「异常重复」；GBK 终端不再乱码 |
| 2026-07-19 | 第六次 | Task 13：启动健康 E2E（dev-server 模式断言 + 负向验证） | 启动回归从「人看日志」变为自动化断言，调试闭环 |
| 2026-07-28 | 第七次 | Task 14：消除 `spawn` DEP0190 弃用警告 | dev 日志不再出现 Node 安全警告 |
| 2026-07-30 | 第八次 | Task 15：系统 I/O 导致首次加载偶发 28s，终端提示指向 Windows Defender 排除项 | 再次出现 `ALL resources slow` 时，开发者可自助定位修复 |

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

### Task 11 (2026-07-19) — Vite 运行时 re-optimization 触发整页 reload ⭐

**问题描述：** `npm run dev` 再次出现完整慢启动链：终端慢（主进程构建 15.5s）→ LoadingScreen 持续 14s+ → 加载动画结束后露出棕色背景 → LoadingScreen **第二次出现**（重复加载）。日志关键行：

```
[renderer] main.tsx imports resolved  +14197ms
[renderer] App Cover chunk ready  +29326ms
[vite] ✨ new dependencies optimized: react-dom
[vite] optimized dependencies changed. reloading
[bootstrap] renderer did-start-loading [+45719ms]        ← 第二次
[renderer] App boot:complete received ×2                 ← 以下全部双份
[renderer] App store.init start ×2 / [files:scan] ×2
```

**为什么问题重复出现：** 启动慢不是单一问题，而是**多个独立根因共享同一症状**——orphan 进程（Task 1–8）、watcher 污染（Task 9）、eager 链膨胀 + Babel（Task 10）。每修掉一个，症状消失，下一个随代码增长浮出。本次与 orphan 进程无关（日志中 preflight 未杀到任何进程），是 Task 10 修复的盲区浮出：Task 10 把 eager 链压到 2.9s，但**懒加载链完全没有防御**——07-11～07-15 的 article-assistant / anthropic 功能给懒加载的 Briefing 链引入了新的裸依赖，成为新的瓶颈路径。

**根因分析（三个独立根因）：**

1. **懒加载链上的裸依赖触发运行时 re-optimization**（棕色闪屏 + 重复加载的元凶）：`ArticleAnnotations.tsx` 引用 `flushSync`（裸 `react-dom`，非 `react-dom/client`），只通过 React.lazy 的 Briefing 页可达，Vite 启动扫描（index.html → eager 图）发现不了它。boot 完成后 App 的 idle 预取拉取 Briefing 链 → Vite 才发现 `react-dom` → 重新优化 deps → **整页 reload**。reload 后 `isBooting` 复位 → LoadingScreen 二次出现；刷新间隙只剩棕色 body 背景。**这个失败模式是无界的：任何新增在懒加载页面里的裸依赖都会引爆它。**
2. **主进程 dev 构建随 electron/ 增长变慢**：136 模块全量内联（gray-matter/turndown/dotenv），本次 15.5s。
3. **LoadingScreen 双路径触发 onComplete**：reload 后 `onBootComplete` 事件与 `bootStart()` 返回的 `alreadyCompleted` 同时命中 → `store.init` / `files:scan` 双份执行。

**修复方案：**

- **Step 11.1: optimizeDeps 显式预打包 + 扫描覆盖页面**
  - 文件：`electron.vite.config.ts` (renderer)
  - 改动：`optimizeDeps.include` 加入 `react / react-dom / react-dom/client / zustand / react-markdown / remark-gfm / unified / unist-util-visit`；`entries: ['index.html', 'src/pages/**/*.tsx']`
  - 原因：deps 在 server 启动时一次打包，「运行时发现 → re-optimization → reload」链路被彻底切断；entries 保证未来新增的页面级裸依赖在启动扫描时被发现，而不是运行时引爆

- **Step 11.2: warmup 扩展到全部 7 个页面入口**
  - 文件：`electron.vite.config.ts` (renderer)
  - 改动：`warmup.clientFiles` 从 `main.tsx` 一项扩展到 7 个页面
  - 原因：懒页面（尤其首屏 Cover）不再等浏览器请求才冷转换（Cover chunk 此前 12.6s）

- **Step 11.3: 主进程 dev 构建外部化 node_modules**
  - 文件：`electron.vite.config.ts` (main)
  - 改动：配置改为函数形式，`command === 'serve'` 时启用 `externalizeDepsPlugin()`
  - 原因：dev 下 gray-matter/turndown/dotenv 走运行时 require，构建 136 → 32 模块；打包构建（build）保持全量内联，asar 行为不变（已验证生产构建仍 136 模块）

- **Step 11.4: LoadingScreen 完成路径一次性守卫**
  - 文件：`src/components/LoadingScreen.tsx`
  - 改动：`completed` 标志使 `finish()` 幂等
  - 原因：根治 `store.init` / `files:scan` 双执行——即使未来再出现任何 reload 场景也不会双跑

- **Step 11.5: 启动健康看门狗（可解释性加固）**
  - 文件：`electron/lib/startup-watchdog.ts`（新建）、`electron/main.ts`、`electron.vite.config.ts`、`tests/startup-watchdog.test.ts`（新建，7 个用例）
  - 改动：主进程看门狗把本次排查依赖的三类隐晦信号变成显式检测——第二次 `did-start-loading`（整页 reload）、同一页面加载内 timing 标签重复（init 双执行）、首次加载 >8s（冷转换过慢）、boot 30s 未完成（卡死），异常发生当场报警并附最可能原因 + 修复指引；boot 完成 12s 后输出 `HEALTHY / UNHEALTHY` 启动健康摘要。vite `customLogger` 拦截 `new dependencies optimized` / `Re-optimizing dependencies` 消息并当场附处置指引。dev-only，E2E 静默模式下关闭。
  - 原因：启动慢是多根因共享同一症状的问题类，无法保证不再复发；让日志下次自己说出病因，跳过人工推理环节

**验证：**

```
# 冷启动（含 vite 配置变更导致的 deps 全量重建，最不利情况）
主进程构建:                15.52s  → 0.41s
main.tsx imports resolved: +14197ms → +2022ms
Cover chunk ready:         +29326ms → +5743ms
did-start-loading:         2 次 → 1 次（无 reload）
store.init / files:scan:   ×2 → ×1

# 热缓存第二轮（常态）
主进程构建 0.42s；imports resolved +1560ms；Cover ready +4638ms

# 看门狗（Step 11.5）第三轮
启动健康摘要输出 HEALTHY，零误报；vite customLogger 透传无损

# 回归
npm run test      # 66 files, 488 tests 全过（含 7 个新增看门狗测试 tests/startup-watchdog.test.ts）
npm run build     # 生产构建正常，main 仍 136 模块全量内联
```

**对"每次重启后启动慢"的覆盖说明：** 该问题在 Task 9「已知限制」中已记录（Vite 转换缓存纯内存，每次 dev server 重启都是冷启动），Task 10 用 SWC+warmup 把它压到 2.9s。但 Task 10 只覆盖 eager 链：懒加载页面仍在浏览器请求时才转换，deps 运行时发现在重启后的首次启动**必然**引爆 reload（idle 预取在 boot 完成后立即执行）。本 Task 把 warmup 和 optimizeDeps 扩展到整个懒加载图后，重启冷启动路径被完整覆盖：deps 缓存（`node_modules/.vite`）跨重启持久，源码转换由 warmup 并行预热。重启固有的 OS 磁盘缓存 / esbuild 二进制冷加载成本（秒级）无法消除，但不会再出现 15s+14s+reload 级别的退化。

**防复发机制：**

- `.claude/rules/build-dev.md` §10：新增懒加载裸依赖必须同步 `include`（流程防线）
- 验证信号写入规则：dev 日志出现第二条 `did-start-loading`、`new dependencies optimized` 或重复 `store.init start` 即为复发
- `entries` 用 glob 覆盖页面目录：新增页面自动进入启动扫描，无需手工登记
- `startup-watchdog`（Step 11.5）：上述信号全部自动化检测，异常当场给出原因与修复指引，启动结束输出 HEALTHY / UNHEALTHY 摘要

**相关提交：** 本次工作树改动（electron.vite.config.ts、LoadingScreen.tsx、startup-watchdog.ts、main.ts、tests/startup-watchdog.test.ts、build-dev.md §10）

**对修订历史的影响：** 已追加第四行。Task 9 的「已知限制」（每次 dev 都是冷启动）仍然成立，但冷启动的预热范围从 eager 链扩展到全页面图。

---

### Task 12 (2026-07-19) — 看门狗 HMR 误报 + 输出乱码 + Fast Refresh 导出规范

**问题描述：** Task 11 交付后首次真实使用，启动本身完全健康（1.3s / 0 reload / HEALTHY），但用户连续编辑 `GuideSidebar.tsx` 等文件后终端出现两条看门狗 ⚠ 报警：

```
[vite] hmr invalidate /src/pages/Briefing.tsx Could not Fast Refresh
       ("formatDisplayDate" export is incompatible)
[renderer] App mounted  +3709403ms          ← App 原地重挂载，无 did-start-loading
[startup-watchdog] ⚠ "App mounted" 第 2 次出现——store.init / files:scan 可能重复执行
```

同时发现看门狗的中文/制表符输出在 GBK 代码页的 PowerShell 中全是乱码（`鈹€鈹€ 鍚姩鍋ュ悍鎽樿`）。

**根因分析（三个独立问题，归属不同）：**

**为什么 Task 11 的修复没防住：** Task 11 的看门狗只在「全新启动」路径上验证过（单测 + 一次性 dev run），验证矩阵里没有「启动后继续编辑代码」这个场景——而 HMR 原地重挂载正是第一个真实使用日就踩到的盲区。教训：**观测类代码的验证矩阵必须覆盖被观测系统的全部正常行为**（启动、reload、HMR 重挂载），否则会把正常行为当异常报警，比没有观测更糟（狼来了效应）。

1. **看门狗误报（看门狗自身缺陷）**：重复检测假设「timing 标签在同一页面加载内重复 = 异常」，漏掉了 **React Fast Refresh 原地重挂载**这个合法场景——HMR 失效边界推到 App 时，整棵树重挂载但**没有** `did-start-loading`，`App mounted` 等标签自然重复。这不是 LoadingScreen 守卫被破坏，报警指向了错误病因。
2. **`Briefing.tsx` 非组件导出（代码规范问题，触发源）**：该文件除组件外还 `export function formatDisplayDate`。Fast Refresh 要求组件文件只导出组件，否则无法局部热替换 → `hmr invalidate` 沿 import 链推到 App → 每次编辑 Briefing 链都整树重挂载（所有组件状态丢失）。
3. **看门狗输出乱码（看门狗自身缺陷）**：中文 + `──`/`⚠`/`✓` 在 GBK 控制台变 mojibake。项目现有日志约定（`[bootstrap]`、`[dev]`）为英文正是这个原因；自检日志不可读等于没有。

另注：同一次日志中第二次启动 imports resolved +6.2s、Cover +15.5s 但仍判 HEALTHY——原因为上一轮 Ctrl+C 残留的 5 个 orphan 进程被 preflight 清理时的磁盘/CPU 竞争，属系统级抖动，非代码回归，阈值判定正确。

**修复方案：**

- **Step 12.1: 看门狗区分「HMR 重挂载」与「异常重复」**
  - 文件：`electron/lib/startup-watchdog.ts`、`tests/startup-watchdog.test.ts`
  - 改动：`App mounted` 重复时识别为 Fast Refresh 原地重挂载——输出 `[info]` 级说明、重置标签计数、不计入异常；摘要新增 `in-place remounts (HMR)` 信息行。其余标签的重复检测保持严格。
  - 原因：重挂载后 LoadingScreen/boot 流程会合法地再走一遍，标签必然重复；只有无重挂载前提下的重复才是 Task 11 Step 11.4 要防的异常
  - **为什么这个改动能生效（信号可区分性）**：页面 reload 必然伴随 `did-start-loading`（浏览器重新导航）；没有 `did-start-loading` 而 `App mounted` 重复，只可能是 React 层的原地重挂载（Fast Refresh）——两类事件在信号层面互斥，所以用「`App mounted` 重复」作重挂载标记不会与真异常混淆，也不会漏报 reload。

- **Step 12.2: 看门狗输出英文化**
  - 文件：`electron/lib/startup-watchdog.ts`、`electron.vite.config.ts`（customLogger 提示语）
  - 改动：全部输出改为英文/ASCII（`[WARN]`/`OK`/`FAIL`/`--`）
  - 原因：GBK 控制台渲染 UTF-8 中文与制表符为乱码；与 `[bootstrap]` 日志约定一致

- **Step 12.3: `Briefing.tsx` 移除非组件导出**
  - 文件：`src/lib/format-briefing-date.ts`、`src/pages/Briefing.tsx`、`tests/briefing.test.ts`
  - 改动：`formatDisplayDate` 移入 `src/lib/format-briefing-date.ts`（与 `formatBriefingDate` 同处），页面与测试改为从 lib 导入。注：第一版只去掉 `export`，随即被 `tests/briefing.test.ts` 的引用打脸——**移动导出前必须同时搜 `src/` 和 `tests/`**。
  - 原因：恢复 Fast Refresh 局部热替换，编辑 Briefing 链不再整树重挂载

- **Step 12.4: 代码规范沉淀**
  - 文件：`.claude/rules/ui-styling.md` 新增 §10
  - 改动：组件文件只导出组件；helper/常量移到 `src/lib/`；vite 日志出现 `hmr invalidate ... Could not Fast Refresh` 时按导出名定位移出

**验证：**

```
npx vitest run tests/startup-watchdog.test.ts   # 8/8（新增 HMR 重挂载用例：info 级、不计异常、HEALTHY）
npm run test                                    # 67 files, 491 tests 全过
npx tsc --noEmit                                # 零错误
npm run dev                                     # 摘要英文输出（GBK 终端安全），HEALTHY，无误报
```

**防复发机制：**

- 看门狗现在能区分三类「重复」：页面 reload（`did-start-loading`）、HMR 重挂载（`App mounted` 重复 → info）、真异常（其余标签重复 → WARN）
- 编辑代码后若 vite 日志出现 `hmr invalidate ... Could not Fast Refresh`，即为违反 ui-styling §10 的信号
- 未来新增组件文件时规则 §10 在流程上拦截非组件导出

**相关提交：** 本次工作树改动（startup-watchdog.ts、tests/startup-watchdog.test.ts、electron.vite.config.ts、Briefing.tsx、format-briefing-date.ts、tests/briefing.test.ts、ui-styling.md §10）

**对修订历史的影响：** 已追加第五行。

---

### Task 13 (2026-07-19) — 启动健康 E2E：自动调试闭环

**问题描述：** Task 11/12 的修复效果依赖人工观察 dev 日志确认，没有自动化回归。未来新增懒加载依赖再次引入 re-optimization 时，只能靠用户察觉变慢、贴日志、再排查一轮——Task 11 的「防复发机制」里写着验证信号，但信号靠人盯就不构成回归测试。

**为什么之前的方式没生效：** Task 11 的防复发是「观测」不是「断言」——信号写在日志里，但没有任何机制保证异常出现时有人看、看得懂。本 Task 把全部验证信号固化成 E2E 断言，失败信息自带本文档路径，调试从「读懂日志」变成「点失败链接」。

**方案：** `e2e/specs/startup-health.spec.ts`——唯一一条通过 **dev server 模式**（而非生产构建）启动的 E2E。它守护的失败模式（依赖 re-optimization、warmup 覆盖、重复 init）只存在于 dev server，生产构建路径覆盖不到。断言分两层：

- **结构不变量（确定性）**：`did-start-loading` 恰 1 次；无 `new dependencies optimized`；`store.init start` 恰 1 次；无看门狗四类异常签名；`verdict: HEALTHY`；Cover UI 冒烟可见
- **时间预算（宽容）**：首次加载 < 20s，只拦截灾难级回归，避免机器差异抖动
- **可解释性**：每条断言的失败信息自带本文档路径；失败时自动把 dev server 完整输出作为 `dev-server-output` 附件存进测试报告，排查不需要复现

**为什么这个方案能生效：**

- 断言的信号与 Task 11 看门狗检测的是**同一套**，E2E 只是把人工判读变成机器断言——看门狗继续负责 dev 日常，E2E 负责回归门禁
- **负向验证证明它能抓住 bug**：临时移除 `optimizeDeps.include` 的 `react-dom` + `entries` → 首轮即失败且报出指引；只移除 `include` 保留 `entries` → 通过（顺带证明 `entries` 扫描构成第二道防线，能从页面文件发现 `react-dom`）

**建设过程中踩到的四个坑（对未来 E2E 作者重要）：**

1. **不能 spawn `scripts/dev.js`**：其 preflight `cleanupProjectOrphans` 按「命令行含项目根」匹配 node 进程，Playwright runner 也匹配 → runner 被误杀，测试无声死亡（exit 1、无报告）。改为直接 spawn `node_modules/electron-vite/bin/electron-vite.js`。
2. **preflight 只能按端口清理**：同样因为命令行匹配会杀 runner/worker（worker 的 `process.pid` 不是 runner 主进程 pid，排除不完），只能用 `findPortListeners(5173/9222)` + `killProcessTree` 按端口释放。
3. **`retries` 必须为 0**：vite deps 缓存会「自愈」——首次运行发现缺失依赖后写入缓存，重试时异常不复现，真实回归被误判 flaky。
4. **不能断言「无任何 [WARN]」**：配置变更后 `Re-optimizing dependencies` 是一次性正常事件（customLogger 会提示），只能断言四类具体异常签名 + verdict。

**验证：**

```
npx playwright test --config e2e/playwright.config.ts startup-health
# 连续 3 次通过（~19s/次）；负向验证 2 轮（见上）
npm run test   # 67 files, 491 tests 全过（无回归）
```

**防复发机制：**

- 启动回归门禁自动化：`@p1` 标签，纳入 `test:e2e:core`
- CLAUDE.md 新增「启动问题排查」入口节（看门狗摘要 → 本文档 → E2E → dev:clean），未来会话自动导航到本文档
- `e2e/README.md` 记录 dev-server 路径的两个硬约束（不 spawn dev.js、0 重试）

**相关提交：** 本次工作树改动（startup-health.spec.ts、process-cleanup.ts、main.ts `E2E_STARTUP_WATCHDOG` 开关、CLAUDE.md、e2e/README.md、build-dev.md §10）

**对修订历史的影响：** 已追加第六行。

---

### Task 14 (2026-07-28) — 消除 `spawn` DEP0190 弃用警告

**问题描述：** 每次 `npm run dev` 终端都出现：

```
(node:10932) [DEP0190] DeprecationWarning: Passing args to a child process
with shell option true can lead to security vulnerabilities, as the arguments
are not escaped, only concatenated.
```

**根因分析：** `scripts/dev.js:135` 调用 `spawn('electron-vite', args, { shell: true })`——Node.js 21+ 弃用了在 `shell: true` 时以数组传参的方式。当 `shell: true` 时，Node 将 args 数组直接拼接为字符串传给 shell，不做转义——特殊字符可能被 shell 误解析。此处的 `args`（`process.argv.slice(2)`，即 `['dev']`）来自 CLI，无不可信输入，安全风险低，但警告在每次启动时都会出现。

Task 1–8 中约定 `shell: true` 是 Windows 必需（解析 `node_modules/.bin` shim），不能移除。不会误杀说明 `shell: true` 的进程追踪机制正确。

**修复方案：**

- **Step 14.1: 改用单字符串传参**
  - 文件：`scripts/dev.js`
  - 改动：`spawn('electron-vite', args, { shell: true })` → `spawn(['electron-vite', ...args].join(' '), { shell: true })`
  - 原因：Node 仅在「数组 + `shell: true`」组合时触发 DEP0190；传单字符串不触发。等效功能，零行为变化

**验证：**

```bash
npm run dev
# 预期：终端不再出现 DEP0190 警告；preflight、构建、启动健康摘要均正常
```

**相关提交：** 本次改动（`scripts/dev.js`）

**对修订历史的影响：** 已追加第七行。

---

### Task 15 (2026-07-30) — 系统 I/O 导致首次加载偶发 28s，看门狗提示指向 Windows Defender

**问题描述：** 一次正常 `npm run dev` 中，启动极慢：

```
[bootstrap] renderer did-finish-load [+29079ms]
[startup-watchdog] [WARN] first renderer load took 28.9s (threshold 8s)
[renderer] startup hint: ALL resources slow → likely system I/O (antivirus, disk)
[renderer] startup slow: deps/react.js (6354ms, 1KB)
[renderer] startup slow: deps/react-dom_client.js (7058ms, 1KB)
[renderer] startup slow: src/main.tsx (16363ms, 5KB)
```

同时主进程构建也退化到 9.43s（正常约 0.4s）。

**根因分析：**

1. **Deps 缓存重建（一次性成本）**：日志出现 `Re-optimizing dependencies because vite config has changed`，说明 `electron.vite.config.ts` 有变更，Vite 按设计使 `node_modules/.vite/deps` 失效并重建。
2. **系统 I/O 极慢（主因）**：`startup resources` 显示源文件和 dep chunk **同时**慢，1KB 文件加载 6-7 秒。这是典型的系统级 I/O 瓶颈，最常见于 **Windows Defender 实时保护扫描 Vite 输出的每个文件**；也可能是冷磁盘缓存、CPU 降频。

Task 10/11 的代码层优化（SWC、warmup、optimizeDeps、主进程外部化）已经全部到位；剩下的变量是 OS 层 I/O，代码无法消除，但看门狗可以把它解释清楚。

**修复方案：**

- **Step 15.1: 让终端提示直接 actionable**
  - 文件：`src/lib/startup-diag.ts`
  - 改动：`"ALL resources slow"` 提示从 `likely system I/O (antivirus, disk)` 扩展为显式指出 `"antivirus/Windows Defender"`，并给出最快修复路径 `"add this project folder to Windows Defender exclusions, then rerun npm run dev"`，附本文档 Task 15 链接
  - 原因：下次再遇到同样症状，开发者不需要排查，10 秒内就能看到具体修复动作

- **Step 15.2: 看门狗慢加载警告同步更新**
  - 文件：`electron/lib/startup-watchdog.ts`
  - 改动：慢加载指引中的 `"ALL resources slow"` 行同样指向 Windows Defender 排除项；参考文档链接追加 `Task 15`
  - 原因：保持 `startup-diag.ts` 与 `startup-watchdog.ts` 两处提示一致，避免指引分裂

- **Step 15.3: 将本 failure mode 写入长期跟踪文档**
  - 文件：`docs/superpowers/plans/2026-07-10-fix-dev-hang-and-orphan-processes.md`
  - 改动：追加 Task 15，并更新顶部修订历史表
  - 原因：这是启动优化文档的唯一长期入口，未来任何同类问题都应从这里开始排查

**验证：**

```bash
# 1. 确认代码改动不破坏看门狗行为
npx vitest run tests/startup-watchdog.test.ts

# 2. 正常 dev 启动应恢复快速（<3s 首屏）
npm run dev
# 预期：[bootstrap] renderer did-finish-load [+0000~3000ms]
#      [startup-watchdog] verdict: HEALTHY

# 3. 若不幸再次遇到 ALL resources slow，按终端提示执行：
#    Windows 安全中心 → 病毒和威胁防护 → 管理设置 → 排除项 →
#    添加文件夹 → 选择 study-parlor 项目根目录，然后重新 npm run dev
```

**对"下次是否还会慢"的覆盖说明：**

- **不改 vite 配置的日常 dev**：`node_modules/.vite/deps` 保持温热，启动应保持本次修复后的快速水平（~1s 主进程构建、~1s 首屏加载）。
- **修改 `electron.vite.config.ts` 后**：Vite 仍会重建 deps 缓存（设计如此），但如果系统 I/O 正常，重建只会慢几秒，不会回到 28s。
- **Windows Defender 再次发癫**：仍可能慢，但终端现在会直接告诉你去加排除项，不需要再猜。

**相关提交：** 本次改动（`src/lib/startup-diag.ts`、`electron/lib/startup-watchdog.ts`、本文档 Task 15）

**后续记录：** 2026-08-01 再次出现 `ALL resources slow`（首屏 12s），确认为同一 failure mode；已将 `C:\Users\86468\Desktop\project\study-parlor` 加入 Windows Defender 排除项。

**对修订历史的影响：** 已追加第八行。

---

## 诊断命令速查

```bash
# 首先看启动健康摘要（Task 11 起，boot 完成 12s 后自动输出）
# [startup-watchdog] verdict: HEALTHY / UNHEALTHY — UNHEALTHY 时上方必有 ⚠ 报警说明病因
npm run dev

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
5. **懒加载链与 eager 链同等纳入冷启动防御**（Task 11 起）：`warmup.clientFiles` 覆盖全部页面入口、`optimizeDeps.include` 覆盖懒加载链裸依赖。否则 Vite 运行时发现新依赖会 re-optimize → 整页 reload，比冷转换本身更伤。

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
