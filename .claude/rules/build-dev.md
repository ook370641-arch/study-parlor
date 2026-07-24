---
description: "Use when modifying build scripts, electron-builder config, dev environment, process cleanup, or app paths."
paths:
  - "scripts/**"
  - "electron-builder.yml"
  - "electron/main.ts"
  - "electron/env.ts"
  - "electron/lib/app-paths.ts"
  - "electron.vite.config.ts"
  - ".gitignore"
---

# 构建 / 开发环境规则

## 1. 打包构建必须验证 asar 内的资源路径与非 JS 资源

**Why:** 开发时能读到的路径在 asar 中不一定存在，undici 等资源在 asar 中也可能无法解析。

- 主进程依赖的非 JS 资源必须在 `electron-builder.yml` 的 `files` 中显式声明。
- 资源路径解析必须同时处理 dev（文件系统）和 packaged（asar）两种场景，优先用存在性探测。
- 修改打包配置后，必须至少执行一次 `npm run package` 并启动产物验证核心功能。
- Source: build-dev.md §1

## 2. 区分开发模式与生产模式的可写路径

**Why:** 打包后 `process.cwd()` 在 macOS 可能是 `/`（只读），在 Windows 安装目录写 `.env` 会 EPERM 且卸载时丢失。

- 配置文件（`.env`）与运行时状态（`state.json`）分目录管理，并通过 `setConfigDir` / `setStateDir` 在 `dotenv.config()` 之前设定。
- 打包模式下可写路径必须落在用户目录或 Electron 默认 `userData`；dev 模式可用项目根目录 `.env`。
- E2E 通过单一环境变量 `E2E_CONFIG_DIR` 同时覆盖 config/state/cache。
- Source: build-dev.md §2

## 3. Dev 脚本必须做启动前孤儿进程/端口清理

**Why:** 残留 electron/node 进程占着 5173 / 9222 端口或锁着 Chromium cache 会让 `npm run dev` 卡顿或失败。

- `scripts/dev.js` 在启动 electron-vite 前扫描并终止本项目相关的孤儿 electron/node 进程，释放 dev server / DevTools 端口。
- 监听 electron-vite 子进程的 `exit` 事件，Electron 退出后主动结束 dev.js。
- Windows 上通过 `readline` 监听 `SIGINT` 键事件，作为 Ctrl+C 兜底。
- Source: build-dev.md §3

## 4. 进程枚举与清理必须可测试、防误杀

**Why:** 手动 split CSV 会列错位，只按进程名匹配会误杀其他项目的 Electron。

- Windows 进程枚举优先使用 PowerShell JSON / CIM 输出，再用 `JSON.parse` 解析。
- 进程匹配必须同时校验进程名与命令行包含项目根目录，必要时再加 pattern 过滤。
- 清理函数必须校验 `pid` 是正整数；对不存在的 pid 返回成功而非抛错。
- 所有进程/端口枚举工具都要有单元测试。
- Source: build-dev.md §4

## 5. Dev 与 E2E 必须隔离 userData/cache

**Why:** 共享默认 userData/cache 会让 E2E 强制杀进程后的不一致状态拖慢下一次 dev/packaged 启动。

- dev 模式把 `userData` 和 `cache` 重定向到项目内隔离目录（如 `node_modules/.electron-cache/`），且被 `.gitignore` 覆盖。
- E2E 把 cache 放在 `E2E_CONFIG_DIR` 下，随测试目录一起删除。
- packaged 模式保留 Electron 默认路径。
- 如果更改了 dev cache 路径，必须在 `dev-clean.js`（新旧路径都清理）和 Vite `server.watch.ignored`（防御性排除 `**/.electron-cache/**`）中同步更新。
- Source: build-dev.md §5

## 6. 启动/初始化流程必须采用“拉取”模型

**Why:** Vite dev server 监听 `.env` 变化会触发 renderer 全量重载，主进程 push 的 boot 事件可能在监听器注册前丢失。

- 启动序列由 renderer 在就绪后调用 `boot:start` 触发，而不是主进程在 setup 完成后立即推送。
- 在写入 `.env` 之前先把 setup 状态置为完成，避免 renderer 重载后重新进入向导。
- 对关键启动阶段加可观测日志（`console.time` / boot timestamp）。
- Source: build-dev.md §6

## 7. E2E/测试清理必须容忍 Windows 文件锁

**Why:** Windows 文件锁会让一次性删除临时目录抛 EPERM，残留 GPU 进程继续锁定目录。

- teardown 删除目录前先杀掉命令行包含该目录的残留进程，并等待数秒让 Windows 释放句柄。
- `rmSync` 必须带重试；对仍锁定的目录先尝试“能删多少删多少”，最后重命名为 `.stale-<timestamp>`。
- 每次创建新测试目录时顺带清理超过阈值（如 24h）的旧目录。
- Source: build-dev.md §7

## 8. E2E 跑完后必须验证 dev 启动时间未退化

**Why:** E2E 全绿不代表 cleanup 没问题；残留 orphan 进程/cache 会让 dev 启动变慢或端口占用。

- 修改 E2E fixture 或进程清理逻辑后，跑完 `npm run test:e2e` 再立即跑 `npm run dev`，记录启动耗时。
- teardown 中验证：临时目录已被删除或重命名为 `.stale-<timestamp>`；`tasklist` 中无命令行包含测试目录的残留进程。
- 如果 dev 启动时间退化超过 20% 或出现端口占用，优先检查 E2E 残留。
- Source: build-dev.md §8

## 9. Dev 清理必须具备自动 + 手动双重恢复手段

**Why:** 自动清理无法覆盖所有退出路径（尤其是 Windows 信号不可靠、终端被强制关闭、子进程异常等场景），必须给用户和 CI 一个确定性的手动恢复命令。

- 修改 dev 脚本或进程清理逻辑时，必须同步保留或增强一个独立的手动恢复命令（如 `npm run dev:clean`），不能只有自动清理。
- 手动恢复命令应能重置整个 dev 环境：终止项目相关进程、释放关键端口、删除可重建的临时目录/缓存。
- 清理路径必须输出可操作日志：列出被杀 PID、杀失败的 PID 与命令行、建议的下一步命令。
- 当自动清理失败或检测到残留时，日志中必须提示用户运行手动恢复命令。
- Source: build-dev.md §9

## 10. 懒加载链上的裸依赖必须纳入 optimizeDeps

**Why:** 只在 React.lazy 页面可达的裸依赖会被 Vite 运行时发现，触发 re-optimization → 整页 reload（棕色闪屏 + 二次加载 + init 重复执行）。

- 新增懒加载页面/组件引入裸依赖（非 `@/`、`./`）时，同步加入 renderer 的 `optimizeDeps.include`。
- `optimizeDeps.entries` 保持覆盖 `src/pages/**/*.tsx`；页面入口保持列在 `warmup.clientFiles`。
- 主进程 `externalizeDepsPlugin()` 仅限 dev（`command === 'serve'`），打包保持全量内联。
- 验证信号：dev 日志无第二条 `did-start-loading`、无 `new dependencies optimized`、无重复 `store.init start`；`e2e/specs/startup-health.spec.ts` 已将这些信号自动化（0 重试，见 e2e/README）。
- Source: docs/superpowers/plans/2026-07-10-fix-dev-hang-and-orphan-processes.md Task 11

## Example: dev vs packaged paths

- ❌ `path.join(process.cwd(), '.env')` in packaged mode
- ✅ `resolveAppPaths()` 根据 `app.isPackaged` / `E2E_CONFIG_DIR` 返回 `configDir` 与 `stateDir`，`saveEnv()` 先 `mkdirSync` 目标目录

## Example: cleanup observability

- ❌ 清理失败静默吞掉，用户只看到 `npm run dev` 启动慢
- ✅ 日志打印 `[dev] failed to kill orphan 12345 (electron.exe): ...; run npm run dev:clean`
