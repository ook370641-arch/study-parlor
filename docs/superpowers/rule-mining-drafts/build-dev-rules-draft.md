# Study Parlor 构建 / 开发环境 / 进程清理规则候选（草案）

> 来源：对 `package.json`、`electron.vite.config.ts`、`electron-builder.yml`、`electron/main.ts`、`scripts/dev.js`、`scripts/lib/process-cleanup.js`、`electron/env.ts`、`electron/lib/app-paths.ts` 及相关 git 提交（`1515c0f`、`18b0a1e`、`d14a189`、`ecba31f`、`31b2bea`、`0b562fb`、`b6a973b`、`2da5059`、`4a18d32`、`afb4f07`）的规则挖掘。

---

## Rule 1：打包构建必须验证 asar 内的资源路径与非 JS 资源

- **问题现象**：打包后的 exe 运行时失败，原因是 `electron/prompts/` 下的 prompt 文件未被 electron-builder 打包进 asar，且 `undici` 在 asar 中无法解析（`1515c0f`）。
- **Agent 行为偏差**：
  - 默认“开发时能读到文件，打包后也一定能读到”。
  - 只关注 TypeScript/JS 编译产物，忽视静态资源（prompts、图片、配置模板）的打包声明。
  - 没有运行打包后的可执行文件做冒烟验证。
- **规则声明**：
  - 任何主进程依赖的非 JS 资源，都必须在 `electron-builder.yml` 的 `files` 中显式声明。
  - 资源路径解析必须同时处理 dev（文件系统）和 packaged（asar）两种场景，优先用存在性探测而不是硬编码路径。
  - 修改打包配置后，必须至少执行一次 `npm run package` 并启动产物验证核心功能。
- **正例 / 反例**：
  - 正例：`electron-builder.yml` 包含 `- electron/prompts`；`prompts.ts` 使用候选路径数组探测并给出清晰错误信息。
  - 反例：只把 `out/**/*` 和 `package.json` 放进 `files`，然后假设 `__dirname + '/prompts'` 在打包后可用。
- **验证清单**：
  - [ ] `npm run package` 成功。
  - [ ] 检查 `release/` 下 asar/unpacked 内容包含所有非 JS 资源。
  - [ ] 启动打包后的应用并触发一次会调用到该资源的流程。
- **相关提交/文件**：`1515c0f`、`electron-builder.yml`、`electron/lib/prompts.ts`。

---

## Rule 2：区分开发模式与生产模式的可写路径，禁止在打包后写 cwd

- **问题现象**：
  - 打包后首次配置向导无法完成，因为 `.env` 被写到 `process.cwd()`；macOS 启动 `.app` 时 `cwd=/`（只读 → EROFS），Windows 安装目录在 Program Files（EPERM，且卸载/更新会清除）（`d14a189`）。
  - 把 `.env` 与 `state.json` 放在同一目录，导致 dev 与 packaged 共享不便、E2E 隔离困难（`ecba31f`）。
- **Agent 行为偏差**：
  - 假设 `process.cwd()` 总是可写且合适。
  - 把“配置文件”和“运行时状态”混在一个目录里，没有区分 dev/prod/E2E 三种运行形态。
  - 没有在应用启动的早期就根据 `app.isPackaged` / `E2E_CONFIG_DIR` 设置可写目录。
- **规则声明**：
  - 配置文件（`.env`）与运行时状态（`state.json`）必须分目录管理，并通过 `setConfigDir` / `setStateDir` 在 `dotenv.config()` 之前设定。
  - 打包模式下，可写路径必须落在用户目录（如 `~/.studyparlor`）或 Electron 默认 `userData`；dev 模式可以用项目根目录 `.env`，但 `state.json` 仍建议与生产共享。
  - E2E 必须通过单一环境变量（如 `E2E_CONFIG_DIR`）同时覆盖 config/state/cache，实现完全隔离。
- **正例 / 反例**：
  - 正例：`resolveAppPaths` 返回 `{ configDir, stateDir, userData, cache }`，dev/packaged/e2e 三个分支清晰；`saveEnv` 先 `mkdirSync` 目标目录。
  - 反例：在 `env.ts` 里直接 `path.join(process.cwd(), '.env')`，不区分运行模式。
- **验证清单**：
  - [ ] 在 macOS/Windows 打包后首次运行能完成 setup 向导并持久化 `.env`。
  - [ ] dev 模式修改 `.env` 不影响 packaged 配置，但 `state.json` 可共享。
  - [ ] E2E 测试并行运行时互不影响。
- **相关提交/文件**：`d14a189`、`ecba31f`、`electron/env.ts`、`electron/lib/app-paths.ts`、`electron/main.ts`。

---

## Rule 3：Dev 脚本必须做启动前孤儿进程/端口清理，并在 Electron 退出后自动退出

- **问题现象**：
  - `npm run dev` 间歇性卡顿，原因是之前残留的 electron/node 进程占着 5173 / 9222 端口或锁着 Chromium cache（`0b562fb`、`4a18d32`）。
  - 用户点击应用窗口 × 关闭后，dev server 的 `node.exe` 不退出，导致下次启动端口冲突（`0b562fb`、`2da5059`）。
- **Agent 行为偏差**：
  - 认为 SIGINT/SIGTERM 在 Windows 上足够可靠，依赖信号做清理。
  - 假设 electron-vite 退出后父进程（dev.js）会自然结束，没有显式监听子进程 `exit`。
  - 只在退出时清理，不做启动前预检，导致前一次异常退出的残留污染当前启动。
- **规则声明**：
  - `scripts/dev.js` 必须在启动 electron-vite 之前扫描并终止本项目相关的孤儿 electron/node 进程，并释放 dev server / DevTools 端口。
  - 必须监听 electron-vite 子进程的 `exit` 事件，在 Electron 主进程退出后主动结束 dev.js，而不是等待不可靠的 signal。
  - Windows 上需要额外通过 `readline` 监听 `SIGINT` 键事件，作为 Ctrl+C 的兜底。
- **正例 / 反例**：
  - 正例：`preflightCleanup()` + `cleanupProjectOrphans(PROJECT_ROOT, [process.pid])` + `findPortListeners`；`child.on('exit', () => process.exit(...))`。
  - 反例：仅注册 `process.on('SIGINT', ...)`，没有启动前清理，也没有子进程退出监听。
- **验证清单**：
  - [ ] 手动 `taskkill /F /IM electron.exe /T` 后，`npm run dev` 仍能正常启动。
  - [ ] 点击窗口 × 关闭后，终端内的 dev 进程在 1–2 秒内退出。
  - [ ] E2E 测试后立即 `npm run dev` 不卡顿。
- **相关提交/文件**：`0b562fb`、`2da5059`、`scripts/dev.js`、`scripts/lib/process-cleanup.js`。

---

## Rule 4：进程枚举与清理必须可测试、防误杀、防 fragile 解析

- **问题现象**：
  - 最早用 WMIC CSV 解析进程列表，当命令行包含引号和逗号时，按逗号 split 会把命令行内容误判为列，导致解析失败（`4a18d32`）。
  - E2E fixture 曾把 `ChildProcess` 对象传给 `killProcessTree`，而不是 `proc.pid`，导致 Electron 主进程没有被真正终止（`4a18d32`）。
- **Agent 行为偏差**：
  - 用正则或字符串 split 解析系统命令的表格/CSV 输出，而不是结构化数据。
  - 清理函数参数类型不校验，调用方传入对象也不报错。
  - 进程匹配只靠进程名，可能误杀其他项目的 Electron 实例。
- **规则声明**：
  - Windows 进程枚举优先使用 PowerShell `ConvertTo-Json -Compress` 输出，再用 `JSON.parse` 解析；避免手动 split CSV。
  - 进程匹配必须同时校验“进程名（node/electron）”和“命令行包含项目根目录”，必要时再加 pattern 过滤。
  - 清理函数必须校验 `pid` 是正整数；对不存在的 pid 返回成功而非抛错，便于幂等调用。
- **正例 / 反例**：
  - 正例：`parseWin32Json` 用 `JSON.parse`；`isProjectProcess` 同时检查 name + commandLine；`killProcessTree` 对 `pid <= 0` 直接返回 `true`。
  - 反例：`wmic ... /format:csv` 后按 `,` split；调用 `killProcessTree(proc)` 而不是 `killProcessTree(proc.pid)`。
- **验证清单**：
  - [ ] 路径带空格、引号的项目能正确列出进程。
  - [ ] 多项目并行 dev 时，清理脚本不会杀掉其他项目的 electron。
  - [ ] `tests/process-cleanup.test.ts` 通过。
- **相关提交/文件**：`31b2bea`、`4a18d32`、`scripts/lib/process-cleanup.js`、`tests/process-cleanup.test.ts`。

---

## Rule 5：Dev 与 E2E 必须隔离 userData/cache，并避免把缓存放在构建工具的 watch 范围内

- **问题现象**：
  - dev 模式使用默认 `%APPDATA%/study-parlor/` 作为 userData/cache，E2E 强制杀进程后 Chromium cache 处于不一致状态，拖慢下一次 dev/packaged 启动（`d066e71`、`b6a973b`）。
  - 早期把 dev cache 放在项目根目录 `.electron-cache/`，Vite 的 watcher 会扫描到 Chromium 的 locked Code Cache/temp-index，导致崩溃或 EBUSY（`4a18d32`）。
- **Agent 行为偏差**：
  - 接受 Electron 默认 userData/cache，没有针对 dev/E2E/packaged 分别设置。
  - 把缓存目录放在源码树或项目根目录下，被构建工具的 watcher 扫描。
  - 没有把隔离后的缓存目录加入 `.gitignore`。
- **规则声明**：
  - dev 模式必须把 `userData` 和 `cache` 重定向到项目内可删除的隔离目录（如 `node_modules/.electron-cache/`），且该目录应已被 `.gitignore` 覆盖。
  - E2E 必须把 cache 放在 `E2E_CONFIG_DIR` 下，随测试目录一起删除。
  - packaged 模式保留 Electron 默认路径，避免与系统其他应用或历史版本冲突。
- **正例 / 反例**：
  - 正例：`resolveAppPaths` dev 分支返回 `node_modules/.electron-cache/{userData,cache}`；`app.setPath('userData', ...)` 在 `app.whenReady` 之前调用；`.gitignore` 包含 `.electron-cache/` 且 `node_modules/` 已忽略。
  - 反例：dev 与 packaged 共用 `%APPDATA%/study-parlor`；或把 cache 放在项目根目录并被 Vite `server.watch` 扫描。
- **验证清单**：
  - [ ] dev 启动后 `node_modules/.electron-cache/` 出现 Chromium 缓存。
  - [ ] E2E 结束后对应测试目录被删除，无残留 cache 污染默认 userData。
  - [ ] Vite HMR 不会因 cache 文件被锁定而报错。
- **相关提交/文件**：`d066e71`、`b6a973b`、`4a18d32`、`electron/lib/app-paths.ts`、`electron/main.ts`、`electron.vite.config.ts`、`.gitignore`。

---

## Rule 6：启动 / 初始化流程必须采用“拉取”模型并防御 renderer 重载

- **问题现象**：首次配置向导完成后，主进程立刻推送 boot 事件，但 Vite dev server 监听到 `.env` 变化会触发 renderer 全量重载，导致 boot 事件在监听器注册前丢失，应用 hang 在启动画面（`18b0a1e`）。
- **Agent 行为偏差**：
  - 假设“主进程发事件 → renderer 收到”是同步且可靠的，没有考虑 renderer 重载/重建的时序。
  - 在 setup 写 `.env` 后才设置 `needsSetup = false`，导致重载后的 renderer 再次进入向导。
  - 没有把耗时的 boot sequence（IPC 注册、模型探活、扫描库）与窗口创建解耦。
- **规则声明**：
  - 启动序列必须由 renderer 在就绪后调用 `boot:start` 触发（pull-based），而不是主进程在 setup 完成后立即推送（push-based）。
  - 在写入 `.env` 之前先把 setup 状态置为完成，避免 renderer 重载后重新进入向导。
  - 对关键启动阶段加可观测日志（`console.time` / boot timestamp），便于定位 hang 点。
- **正例 / 反例**：
  - 正例：`setup:writeConfig` 中先 `needsSetup = false`，再 `saveEnv`，再 `pendingBootCfg = newCfg`，最后通知 renderer；`boot:start` 由 `LoadingScreen` mount 后调用。
  - 反例：`setup:writeConfig` 写 `.env` 后直接 `runBootSequence(newCfg, mainWindow!)`。
- **验证清单**：
  - [ ] 首次配置完成后不 hang，能进入主界面。
  - [ ] 在 dev 模式下手动触发 renderer reload（Ctrl+R）后，不再回到 setup 向导。
  - [ ] 启动日志能清晰看到每个 boot stage 的耗时。
- **相关提交/文件**：`18b0a1e`、`537e566`、`electron/main.ts`、`src/components/LoadingScreen.tsx`。

---

## Rule 7：E2E / 测试清理必须容忍 Windows 文件锁，采用“重试 + 部分删除 + 老化”策略

- **问题现象**：
  - E2E 测试后 `e2e/.test-config/` 和 `e2e/.test-library/` 下残留大量旧目录，Windows 文件锁导致 cleanup 抛 EPERM，进而让后续测试失败（`afb4f07`、`4a18d32`）。
  - 残留 Electron GPU 进程继续锁定测试配置目录，同步删除直接失败（`4a18d32`）。
- **Agent 行为偏差**：
  - 假设测试 teardown 能一次性、完全地删除临时目录。
  - 只在测试结束时杀一次进程，没有等子进程释放句柄再删目录。
  - 没有老化机制，导致历史失败的测试目录无限堆积。
- **规则声明**：
  - teardown 中删除目录前，必须先杀掉命令行包含该目录的残留进程，并等待数秒让 Windows 释放句柄。
  - `rmSync` 必须带重试；对仍锁定的目录，先尝试“能删多少删多少”，最后把无法删除的目录重命名为 `.stale-<timestamp>`，让后续老化清理处理。
  - 每次创建新测试目录时，顺带清理超过阈值（如 24h）的旧目录。
- **正例 / 反例**：
  - 正例：`cleanupTestConfigDir` 先 `killProjectProcessesByPattern`；`retryRm` 支持 `onRetry` 回调、`removeAsMuchAsPossible`、最后 `renameSync` 为 stale；`createTestConfigDir` 开头调用 `cleanupOldTestDirs`。
  - 反例：teardown 直接用 `fs.rmSync(dir, { recursive: true, force: true })`，失败即抛错。
- **验证清单**：
  - [ ] 测试失败后保留目录供排查，但不阻塞后续测试。
  - [ ] 连续运行 E2E 不出现 EPERM 导致测试失败。
  - [ ] `e2e/.test-config/` 和 `e2e/.test-library/` 下 24h 以上目录被自动清理。
- **相关提交/文件**：`afb4f07`、`4a18d32`、`e2e/helpers/test-library.ts`、`e2e/helpers/process-cleanup.ts`、`e2e/fixtures/electron.ts`。

---

## 汇总

| 规则 | 覆盖主题 | 核心偏差 | 关键动作 |
|------|----------|----------|----------|
| Rule 1 | 打包后资源路径与环境变量 | 默认 dev 路径打包后可用 | 显式声明 `files`、双路径探测、打包冒烟 |
| Rule 2 | 开发模式与生产模式配置差异 | `cwd` 总可写 | 分离 `.env` / `state.json`、按模式选目录 |
| Rule 3 | Electron 进程生命周期与清理 | 依赖 signal、不做预检 | 启动前清理 + 子进程退出监听 |
| Rule 4 | 进程清理工具健壮性 | 脆弱解析、类型不校验 | JSON 解析、项目路径过滤、pid 校验 |
| Rule 5 | userData/cache 隔离 | 默认路径跨模式共享 | dev/E2E 隔离、避开 watcher、gitignore |
| Rule 6 | 启动/退出健壮性 | 推送模型 + 忽视 renderer reload | pull-based boot、状态顺序、日志可观测 |
| Rule 7 | E2E 清理韧性 | 一次性删除假设 | 杀进程 + 重试 + 部分删除 + stale 老化 |
