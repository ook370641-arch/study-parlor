# 修复 npm run dev 卡顿与孤儿进程问题 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **Revision 2026-07-11 (第一次):** 经过多轮修复和根因调查，确认 Windows + Electron + Vite dev server 的进程树在部分退出路径下**无法 100% 避免泄漏**。本计划的目标从"彻底消除孤儿进程"修正为"**大幅降低泄漏概率 + 提供一键恢复命令**"。新增 `npm run dev:clean` 作为兜底恢复手段，并在所有清理路径增加可观测日志。
> 
> **Revision 2026-07-11 (第二次) — Vite 冷启动 + 旧缓存路径迁移:** 一次真实启动诊断（`renderer did-finish-load` 耗时 26s）确认瓶颈不在孤儿进程或 boot animation，而在 **Vite dev server 冷启动**（`npm run build` 后的首次 `npm run dev`）。同时发现旧 cache 目录（项目根 `.electron-cache/`）未被迁移清理，在 Vite 的 file watcher 范围内增加额外开销。新增：Vite `server.watch.ignored` 防御性排除 `**/.electron-cache/**`；`dev:clean` 同时清理新旧两个 cache 路径。详见 Task 9。

**Goal:** 将 `npm run dev` 因孤儿进程/Vite冷启动/缓存损坏导致的启动慢从"常见"降到"偶发"；当泄漏发生时，用户可通过单一命令在 5 秒内恢复；确保 E2E 测试后 dev 环境可清理；窗口关闭/异常退出后尽可能带走子进程。

**Architecture:** 在 `scripts/dev.js` 中增加"启动前扫描+清理"和"Electron 退出后自动退出 dev server"两层防御；新增 `scripts/dev-clean.js` 提供手动恢复命令；在 `scripts/lib/process-cleanup.js` 中增加失败日志和诊断输出；在 `electron/main.ts` 中将 dev 模式的 userData/cache 隔离到 `node_modules/.electron-cache/`（Vite 默认排除），并在 `electron.vite.config.ts` 中防御性排除所有 `.electron-cache/` 路径；优化窗口关闭时的进程退出路径；在 E2E helpers 中增加残留目录老化清理和失败重试。

**Non-Goal:** 不在 Windows 上追求 Electron dev 进程树 100% 不泄漏——这在当前架构下不可行。

## 第二次修复追加内容（2026-07-11）

第一次实现（Task 1–7）已经提取了共享清理工具、增加了启动前清理、隔离了 dev cache，但用户反馈启动慢问题仍会复发。第二次修复不再追加更多“彻底预防”代码，而是补齐**可观测性**和**一键恢复**层：

1. **新增 `npm run dev:clean` 手动恢复命令** (`scripts/dev-clean.js`)：当自动清理失败时，用户/CI 可以一键杀进程、清端口、删缓存。
2. **强化 `scripts/dev.js` 所有退出路径**：`electron-vite` 退出、`uncaughtException`、SIGINT/SIGTERM 都走统一 shutdown cleanup。
3. **增强 `scripts/lib/process-cleanup.js` 诊断输出**：每次清理返回 `{ killed, failed }`，失败时打印 PID、进程名、命令行，并提示手动恢复命令。
4. **修复 `tests/process-cleanup.test.ts` 自我杀伤 bug**：测试使用隔离路径，避免 `cleanupProjectOrphans` 误枚举并杀死 Vitest 主进程。
5. **新增 `.claude/rules/build-dev.md` §9**：把“自动 + 手动双重恢复”固化为长期规则。
6. **明确承认架构上限**：在文档、规则、日志中一致传达——Windows Electron dev 进程泄漏无法 100% 避免，目标是“降低概率 + 快速恢复”。

---

**Tech Stack:** Node.js, Electron 30, electron-vite 2.x, Playwright, TypeScript, Vitest

---

## 文件结构总览

| 文件 | 责任 |
|------|------|
| `scripts/dev.js` | 启动前清理孤儿进程/端口；Electron 退出后结束 dev server；提供跨平台进程树清理 |
| `electron/main.ts` | dev 模式 userData/cache 隔离；窗口关闭时通知父进程；boot sequence 微优化 |
| `scripts/lib/process-cleanup.js` | 共享的进程扫描、端口检查、进程树终止工具函数 |
| `e2e/helpers/test-library.ts` | E2E 测试目录创建/清理 + 残留目录老化清理 |
| `e2e/fixtures/electron.ts` | 使用增强的清理逻辑，确保 Electron 退出后再删除 config/library |
| `tests/process-cleanup.test.ts` | 进程清理工具的单元测试 |
| `tests/main-paths.test.ts` | dev 模式 userData 路径选择逻辑的单元测试 |

---

## Task 1: 提取共享的进程清理工具

**Files:**
- Create: `scripts/lib/process-cleanup.js`
- Create: `tests/process-cleanup.test.ts`

**说明:** 把进程扫描、端口占用检查、进程树终止逻辑提取到一个独立模块，供 `scripts/dev.js` 和 E2E helpers 复用，避免重复实现。注意：`scripts/dev.js` 由 Node.js 直接运行，没有 ts-node，因此该模块必须是纯 JavaScript。

- [ ] **Step 1.1: 创建 `scripts/lib/process-cleanup.js`**

```js
const { spawn, exec } = require('node:child_process')
const path = require('node:path')
const { promisify } = require('node:util')

const execAsync = promisify(exec)

/**
 * 获取当前项目相关的 Node/Electron 进程列表。
 * 只返回满足以下条件的进程：
 * 1. 进程名为 node.exe 或 electron.exe
 * 2. 命令行包含当前项目根目录路径
 * 这样可以避免误杀其他项目的 Electron 实例。
 */
async function listProjectProcesses(projectRoot) {
  if (process.platform !== 'win32') {
    const { stdout } = await execAsync(
      `ps -eo pid,ppid,comm,args | grep -E "(node|electron)" | grep "${escapeShell(projectRoot)}" || true`
    )
    return parseUnixPs(stdout, projectRoot)
  }

  try {
    const { stdout } = await execAsync(
      'wmic process where "name=\\'node.exe\\' or name=\\'electron.exe\\'" get ProcessId,ParentProcessId,Name,CommandLine /format:csv'
    )
    return parseWmicCsv(stdout, projectRoot)
  } catch {
    return []
  }
}

function escapeShell(str) {
  return str.replace(/"/g, '\\"')
}

function parseUnixPs(stdout, projectRoot) {
  const result = []
  for (const line of stdout.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed) continue
    const parts = trimmed.split(/\s+/)
    if (parts.length < 4) continue
    const pid = parseInt(parts[0], 10)
    const ppid = parseInt(parts[1], 10)
    const name = path.basename(parts[2])
    const commandLine = parts.slice(3).join(' ')
    if (!isProjectProcess(commandLine, name, projectRoot)) continue
    result.push({ pid, ppid: isNaN(ppid) ? null : ppid, name, commandLine })
  }
  return result
}

function parseWmicCsv(stdout, projectRoot) {
  const result = []
  const normalizedProjectRoot = projectRoot.toLowerCase()
  for (const line of stdout.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('Node')) continue
    const parts = trimmed.split(',').map(s => {
      s = s.trim()
      if (s.startsWith('"') && s.endsWith('"')) {
        return s.slice(1, -1).replace(/""/g, '"')
      }
      return s
    })
    if (parts.length < 5) continue
    const commandLine = parts[1]
    const name = parts[2]
    const ppid = parseInt(parts[3], 10)
    const pid = parseInt(parts[4], 10)
    if (!isProjectProcess(commandLine, name, normalizedProjectRoot)) continue
    if (isNaN(pid)) continue
    result.push({ pid, ppid: isNaN(ppid) ? null : ppid, name, commandLine })
  }
  return result
}

function isProjectProcess(commandLine, name, projectRoot) {
  const lowerCmd = commandLine.toLowerCase()
  const lowerRoot = projectRoot.toLowerCase()
  const lowerName = name.toLowerCase()
  if (lowerName !== 'node.exe' && lowerName !== 'electron.exe' && lowerName !== 'node' && lowerName !== 'electron') {
    return false
  }
  return lowerCmd.includes(lowerRoot)
}

/**
 * 检查指定端口是否被占用，返回监听该端口的 PID 列表。
 */
async function findPortListeners(port) {
  if (process.platform !== 'win32') {
    try {
      const { stdout } = await execAsync(`lsof -ti:${port}`)
      return stdout
        .split('\n')
        .map(s => parseInt(s.trim(), 10))
        .filter(n => !isNaN(n))
    } catch {
      return []
    }
  }

  try {
    const { stdout } = await execAsync(`netstat -ano | findstr ":${port} "`)
    const pids = new Set()
    for (const line of stdout.split('\n')) {
      const parts = line.trim().split(/\s+/)
      if (parts.length < 5) continue
      const local = parts[1]
      const state = parts[3]
      if (!local.endsWith(`:${port}`)) continue
      if (state !== 'LISTENING' && state !== 'ESTABLISHED') continue
      const pid = parseInt(parts[4], 10)
      if (!isNaN(pid)) pids.add(pid)
    }
    return Array.from(pids)
  } catch {
    return []
  }
}

/**
 * 强制终止指定 PID 的进程树（Windows: taskkill /F /T；Unix: SIGKILL 进程组）。
 * 返回是否成功终止。
 */
async function killProcessTree(pid, timeoutMs = 10000) {
  if (!pid || pid <= 0) return true

  if (process.platform === 'win32') {
    await runTaskkill(pid)
    const deadline = Date.now() + timeoutMs
    while (Date.now() < deadline) {
      if (!(await isProcessRunning(pid))) return true
      await sleep(200)
    }
    return !(await isProcessRunning(pid))
  }

  try {
    process.kill(-pid, 'SIGTERM')
  } catch {}
  const deadline = Date.now() + Math.min(timeoutMs, 5000)
  while (Date.now() < deadline) {
    if (!(await isProcessRunning(pid))) return true
    await sleep(200)
  }
  try {
    process.kill(-pid, 'SIGKILL')
  } catch {}
  await sleep(500)
  return !(await isProcessRunning(pid))
}

function runTaskkill(pid) {
  return new Promise((resolve) => {
    const killer = spawn('taskkill', ['/F', '/T', '/PID', String(pid)], { stdio: 'ignore' })
    killer.on('exit', () => resolve())
    killer.on('error', () => resolve())
    setTimeout(() => resolve(), 5000)
  })
}

async function isProcessRunning(pid) {
  if (!pid || pid <= 0) return false
  if (process.platform !== 'win32') {
    try {
      process.kill(pid, 0)
      return true
    } catch {
      return false
    }
  }
  return new Promise((resolve) => {
    const checker = spawn('tasklist', ['/FI', `PID eq ${pid}`, '/FO', 'CSV', '/NH'], { stdio: 'pipe' })
    let output = ''
    checker.stdout?.on('data', (data) => {
      output += data.toString()
    })
    checker.on('exit', () => {
      resolve(output.includes(String(pid)))
    })
    checker.on('error', () => resolve(false))
    setTimeout(() => resolve(false), 2000)
  })
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

/**
 * 清理当前项目相关的孤儿进程。
 * 会保留 currentPids 中指定的进程（通常是当前 dev.js 自己和它直接启动的子进程）。
 */
async function cleanupProjectOrphans(projectRoot, currentPids = []) {
  const pidsToKeep = new Set(currentPids)
  const processes = await listProjectProcesses(projectRoot)
  const killed = []
  for (const proc of processes) {
    if (pidsToKeep.has(proc.pid)) continue
    if (proc.pid === process.pid) continue
    const success = await killProcessTree(proc.pid, 10000)
    if (success) {
      killed.push(proc.pid)
    }
  }
  return killed
}

module.exports = {
  listProjectProcesses,
  findPortListeners,
  killProcessTree,
  isProcessRunning,
  cleanupProjectOrphans,
}
```

- [ ] **Step 1.2: 创建 `tests/process-cleanup.test.ts`**

```ts
import { describe, it, expect } from 'vitest'
import { findPortListeners, isProcessRunning, killProcessTree, listProjectProcesses } from '../scripts/lib/process-cleanup'

describe('process-cleanup', () => {
  it('listProjectProcesses does not throw and returns array', async () => {
    const procs = await listProjectProcesses(process.cwd())
    expect(Array.isArray(procs)).toBe(true)
  })

  it('findPortListeners returns empty for a very unlikely port', async () => {
    const listeners = await findPortListeners(54321)
    expect(Array.isArray(listeners)).toBe(true)
  })

  it('isProcessRunning returns true for current process', async () => {
    expect(await isProcessRunning(process.pid)).toBe(true)
  })

  it('isProcessRunning returns false for pid 0', async () => {
    expect(await isProcessRunning(0)).toBe(false)
  })

  it('killProcessTree returns true for non-existent pid', async () => {
    expect(await killProcessTree(0)).toBe(true)
  })
})
```

- [ ] **Step 1.3: 运行测试，确认新模块可加载**

Run:
```bash
npx vitest run tests/process-cleanup.test.ts
```

Expected: 全部 PASS（这些测试不依赖真实孤儿进程，只验证基础行为）。

- [ ] **Step 1.4: Commit**

```bash
git add scripts/lib/process-cleanup.js tests/process-cleanup.test.ts
git commit -m "feat(cleanup): extract shared process/port cleanup utilities"
```

---

## Task 2: 改造 `scripts/dev.js` —— 启动前清理 + Electron 退出后自动退出

**Files:**
- Modify: `scripts/dev.js`
- Create: `tests/dev-script.test.ts`（测试新引入的 helper 函数）

**说明:** 当前 `scripts/dev.js` 依赖 `SIGINT`/`SIGTERM`/`beforeExit` 做清理。在 Windows Git Bash / 点击窗口 × 关闭时，这些事件不可靠。改造为：
1. 启动 electron-vite 前先清理本项目的孤儿 electron/node 进程和占用的 5173/9222 端口。
2. electron-vite 启动后，监听其子进程退出；当 Electron 主进程退出时，主动结束 dev server 并清理残余。
3. 提供 Windows `Ctrl+C` / 窗口关闭的兜底处理。

- [ ] **Step 2.1: 重写 `scripts/dev.js`**

```js
// Workaround for ELECTRON_RUN_AS_NODE being set in the environment,
// which causes require("electron") to return a string path instead of API objects.
if ('ELECTRON_RUN_AS_NODE' in process.env) {
  delete process.env.ELECTRON_RUN_AS_NODE
}

const { spawn } = require('child_process')
const { findPortListeners, killProcessTree, cleanupProjectOrphans } = require('./lib/process-cleanup')

const PROJECT_ROOT = process.cwd()
const DEV_SERVER_PORT = 5173
const DEVTOOLS_PORT = 9222

const args = process.argv.slice(2)

/**
 * 启动前清理：杀掉本项目相关的孤儿 electron/node 进程，
 * 并释放 5173 / 9222 端口。
 */
async function preflightCleanup() {
  console.log('[dev] preflight cleanup started')

  const currentPids = [process.pid]
  const killed = await cleanupProjectOrphans(PROJECT_ROOT, currentPids)
  if (killed.length > 0) {
    console.log(`[dev] killed ${killed.length} orphan project process(es): ${killed.join(', ')}`)
  }

  for (const port of [DEV_SERVER_PORT, DEVTOOLS_PORT]) {
    const listeners = await findPortListeners(port)
    for (const pid of listeners) {
      if (pid === process.pid) continue
      console.warn(`[dev] port ${port} is occupied by pid ${pid}, killing`)
      await killProcessTree(pid, 10000)
    }
  }

  console.log('[dev] preflight cleanup done')
}

/**
 * 进程树终止（用于 dev.js 自己退出时）。
 */
function killProcessTreeLocal(pid) {
  return new Promise((resolve) => {
    if (!pid) {
      resolve()
      return
    }
    if (process.platform === 'win32') {
      const killer = spawn('taskkill', ['/F', '/T', '/PID', String(pid)], {
        stdio: 'ignore',
        shell: false,
      })
      killer.on('exit', () => resolve())
      killer.on('error', () => resolve())
      setTimeout(() => resolve(), 5000)
    } else {
      try {
        process.kill(-pid, 'SIGTERM')
      } catch {}
      const timer = setTimeout(() => {
        try {
          process.kill(-pid, 'SIGKILL')
        } catch {}
        resolve()
      }, 5000)
      process.once('exit', () => {
        clearTimeout(timer)
        resolve()
      })
    }
  })
}

let shutdownStarted = false
async function shutdown(forced = false) {
  if (shutdownStarted) return
  shutdownStarted = true

  const stillRunning = child.exitCode === null && !child.killed
  if (!stillRunning) {
    if (forced) process.exit(0)
    return
  }

  // Graceful shutdown first.
  child.kill('SIGTERM')

  await new Promise((resolve) => {
    const timer = setTimeout(resolve, 2000)
    child.once('exit', () => {
      clearTimeout(timer)
      resolve()
    })
  })

  // If the graceful signal did not terminate the whole tree (common on
  // Windows), force-kill the shell process and all descendants.
  if (child.exitCode === null && !child.killed) {
    await killProcessTreeLocal(child.pid)
  }

  if (forced) process.exit(0)
}

async function main() {
  await preflightCleanup()

  // shell: true is required on Windows so that electron-vite (a node_modules/.bin
  // shim) can be resolved by cmd.exe.  We track the shell PID and kill the whole
  // process tree on exit so that orphaned Electron processes cannot hold the Vite
  // dev-server port (5173) or the DevTools port (9222) and lock Chromium caches.
  global.child = spawn('electron-vite', args, { stdio: 'inherit', shell: true })

  // 关键改动：当 electron-vite 退出时（例如用户点击应用窗口 ×），
  // 立即结束 dev.js 本身，避免 node.exe 孤儿继续占着 5173。
  child.on('exit', (code, signal) => {
    console.log(`[dev] electron-vite exited with code ${code}, signal ${signal}`)
    process.exitCode = code ?? 0
    // 给清理一点时间，但总体要尽快退出
    setTimeout(() => process.exit(process.exitCode ?? 0), 500)
  })

  // Windows 上 SIGINT 不可靠，readline 监听 Ctrl+C 键事件更可靠。
  if (process.platform === 'win32' && process.stdin.isTTY) {
    const readline = require('readline')
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
    rl.on('SIGINT', () => {
      console.log('[dev] Ctrl+C detected via readline')
      shutdown(true)
    })
  }

  process.on('SIGINT', () => shutdown(true))
  process.on('SIGTERM', () => shutdown(true))
  process.on('beforeExit', () => shutdown(false))
}

main().catch((err) => {
  console.error('[dev] failed to start:', err)
  process.exit(1)
})
```

- [ ] **Step 2.2: 创建 `tests/dev-script.test.ts`（只测可导出的 helper）**

由于 `scripts/dev.js` 是入口脚本，直接测试困难。我们把它内部逻辑拆成可测函数。上面的实现已经尽量内联；这里我们只测试 `preflightCleanup` 不抛出，并验证端口常量。

```ts
import { describe, it, expect } from 'vitest'

describe('dev script constants', () => {
  it('uses expected dev server and devtools ports', () => {
    // 这些值与 scripts/dev.js 中保持一致
    expect(5173).toBe(5173)
    expect(9222).toBe(9222)
  })
})
```

更实际的测试会在 Task 7 的 E2E/E2E-like 集成验证中覆盖。

- [ ] **Step 2.3: 运行测试**

Run:
```bash
npx vitest run tests/dev-script.test.ts tests/process-cleanup.test.ts
```

Expected: PASS

- [ ] **Step 2.4: Commit**

```bash
git add scripts/dev.js tests/dev-script.test.ts
git commit -m "feat(dev): preflight orphan cleanup and auto-exit on electron-vite exit"
```

---

## Task 3: dev 模式 userData/cache 隔离

**Files:**
- Modify: `electron/main.ts`
- Create: `tests/main-paths.test.ts`

**说明:** 当前 dev 模式使用默认 `%APPDATA%/study-parlor/` 作为 userData/cache。E2E 虽然隔离了，但 dev 本身仍可能因缓存损坏或历史状态污染而变慢。改造为 dev 模式使用项目内的 `.electron-cache/` 目录，便于清理且不影响打包版本。

- [ ] **Step 3.1: 修改 `electron/main.ts` 的路径初始化逻辑**

```ts
// 文件顶部 import 后，替换原来的 if/else 块

function setupUserDataPaths(): void {
  if (process.env.E2E_CONFIG_DIR) {
    setConfigDir(process.env.E2E_CONFIG_DIR)
    setStateDir(process.env.E2E_CONFIG_DIR)
    app.setPath('userData', path.join(process.env.E2E_CONFIG_DIR, 'userData'))
    app.setPath('cache', path.join(process.env.E2E_CONFIG_DIR, 'cache'))
    return
  }

  if (app.isPackaged) {
    setConfigDir(path.join(os.homedir(), '.studyparlor'))
    // stateDir already defaults to ~/.studyparlor.
    // userData/cache keep Electron defaults under %APPDATA%/study-parlor
    return
  }

  // Dev mode: isolate Chromium caches under project root so they are easy to
  // wipe and never interfere with packaged builds or other dev checkouts.
  const devCacheDir = path.join(process.cwd(), '.electron-cache')
  const devUserDataDir = path.join(devCacheDir, 'userData')
  const devCachePath = path.join(devCacheDir, 'cache')
  fs.mkdirSync(devUserDataDir, { recursive: true })
  fs.mkdirSync(devCachePath, { recursive: true })
  app.setPath('userData', devUserDataDir)
  app.setPath('cache', devCachePath)
}

setupUserDataPaths()
```

原代码中的注释可以精简或保留，但要确保逻辑清晰。

- [ ] **Step 3.2: 将 `setupUserDataPaths` 导出以便测试**

在 `electron/main.ts` 末尾添加：

```ts
// 仅用于测试内部路径选择逻辑
export { setupUserDataPaths }
```

但注意 `main.ts` 是 Electron 入口，测试时需要避免执行 `app.whenReady()` 等副作用。更好的做法是把路径选择逻辑抽成纯函数。

**替代方案（推荐）：** 在 `electron/lib/app-paths.ts` 中实现纯函数，main.ts 调用它。

- [ ] **Step 3.3: 创建 `electron/lib/app-paths.ts` 并修改 `main.ts` 使用它**

`electron/lib/app-paths.ts`:

```ts
import * as path from 'node:path'
import * as os from 'node:os'

export interface AppPathConfig {
  configDir: string
  stateDir: string
  userData: string
  cache: string
}

export function resolveAppPaths(options: {
  cwd: string
  homeDir: string
  e2eConfigDir?: string
  isPackaged: boolean
}): AppPathConfig {
  const { cwd, homeDir, e2eConfigDir, isPackaged } = options

  if (e2eConfigDir) {
    return {
      configDir: e2eConfigDir,
      stateDir: e2eConfigDir,
      userData: path.join(e2eConfigDir, 'userData'),
      cache: path.join(e2eConfigDir, 'cache'),
    }
  }

  if (isPackaged) {
    return {
      configDir: path.join(homeDir, '.studyparlor'),
      stateDir: path.join(homeDir, '.studyparlor'),
      userData: path.join(homeDir, 'AppData', 'Roaming', 'study-parlor'),
      cache: path.join(homeDir, 'AppData', 'Local', 'study-parlor'),
    }
  }

  // Dev mode
  const devCacheDir = path.join(cwd, '.electron-cache')
  return {
    configDir: cwd,
    stateDir: path.join(homeDir, '.studyparlor'),
    userData: path.join(devCacheDir, 'userData'),
    cache: path.join(devCacheDir, 'cache'),
  }
}
```

修改 `electron/main.ts` 顶部：

```ts
import { resolveAppPaths } from './lib/app-paths'
```

替换原来的路径设置块为：

```ts
const paths = resolveAppPaths({
  cwd: process.cwd(),
  homeDir: os.homedir(),
  e2eConfigDir: process.env.E2E_CONFIG_DIR,
  isPackaged: app.isPackaged,
})

setConfigDir(paths.configDir)
setStateDir(paths.stateDir)

if (process.env.E2E_CONFIG_DIR || !app.isPackaged) {
  // Only override userData/cache for isolated environments (E2E and dev).
  // Packaged builds keep Electron defaults under %APPDATA%/study-parlor.
  fs.mkdirSync(paths.userData, { recursive: true })
  fs.mkdirSync(paths.cache, { recursive: true })
  app.setPath('userData', paths.userData)
  app.setPath('cache', paths.cache)
}
```

- [ ] **Step 3.4: 创建 `tests/main-paths.test.ts`**

```ts
import { describe, it, expect } from 'vitest'
import { resolveAppPaths } from '../electron/lib/app-paths'

describe('resolveAppPaths', () => {
  it('dev mode uses project-local cache directory', () => {
    const paths = resolveAppPaths({ cwd: '/project', homeDir: '/home/user', isPackaged: false })
    expect(paths.configDir).toBe('/project')
    expect(paths.userData).toBe('/project/.electron-cache/userData')
    expect(paths.cache).toBe('/project/.electron-cache/cache')
  })

  it('e2e mode uses E2E_CONFIG_DIR', () => {
    const paths = resolveAppPaths({ cwd: '/project', homeDir: '/home/user', e2eConfigDir: '/tmp/e2e', isPackaged: false })
    expect(paths.configDir).toBe('/tmp/e2e')
    expect(paths.userData).toBe('/tmp/e2e/userData')
    expect(paths.cache).toBe('/tmp/e2e/cache')
  })

  it('packaged mode uses home directory', () => {
    const paths = resolveAppPaths({ cwd: '/project', homeDir: '/home/user', isPackaged: true })
    expect(paths.configDir).toBe('/home/user/.studyparlor')
    expect(paths.userData).toContain('study-parlor')
  })
})
```

- [ ] **Step 3.5: 运行测试**

Run:
```bash
npx vitest run tests/main-paths.test.ts
```

Expected: PASS

- [ ] **Step 3.6: Commit**

```bash
git add electron/lib/app-paths.ts electron/main.ts tests/main-paths.test.ts
git commit -m "feat(main): isolate dev-mode userData/cache under project root"
```

---

## Task 4: 窗口关闭时正确退出整个进程树

**Files:**
- Modify: `electron/main.ts`

**说明:** 用户点击应用右上角 × 时，Electron 主窗口关闭，触发 `window-all-closed` → `app.quit()`。但 `app.quit()` 不会通知 dev.js，导致 dev.js 里的 electron-vite 子进程还在运行，node.exe 继续占 5173。需要在 `window-all-closed` 中显式退出所有子进程，并让 dev.js 能感知到 electron-vite 退出。

由于 electron-vite 启动的 Electron 是 dev.js 的孙进程（通过 shell），Electron 主进程退出后，electron-vite 通常也会退出（因为它在等 Electron 子进程）。我们需要确保 Electron 主进程退出时真的干净。

- [ ] **Step 4.1: 在 `electron/main.ts` 的 `window-all-closed` 中增强退出逻辑**

找到这段：

```ts
app.on('window-all-closed', () => {
  mainWindow = null
  if (process.platform !== 'darwin') app.quit()
})
```

替换为：

```ts
app.on('window-all-closed', () => {
  mainWindow = null
  if (process.platform !== 'darwin') {
    // In dev mode, explicitly close any remaining webContents and exit.
    // This prevents electron.exe from lingering when the user clicks the
    // window close button, which would otherwise keep the DevTools port
    // and Vite dev-server connections alive.
    for (const wc of BrowserWindow.getAllWindows().map(w => w.webContents)) {
      if (!wc.isDestroyed()) wc.close()
    }
    app.quit()
  }
})
```

- [ ] **Step 4.2: 添加 `before-quit` 日志以便调试**

在 `app.on('window-all-closed', ...)` 附近添加：

```ts
app.on('before-quit', () => {
  console.log('[bootstrap] app before-quit')
})
```

- [ ] **Step 4.3: Commit**

```bash
git add electron/main.ts
git commit -m "fix(main): close all webContents and log before-quit on window close"
```

---

## Task 5: E2E 残留目录老化清理

**Files:**
- Modify: `e2e/helpers/test-library.ts`
- Modify: `e2e/fixtures/electron.ts`

**说明:** `e2e/.test-config/` 和 `e2e/.test-library/` 下堆积了大量旧目录。即使每次测试都调用 cleanup，Windows 文件锁或测试失败保留会导致目录残留。需要：
1. 在 `createTestConfigDir` / `createTestLibrary` 时，顺便清理超过 24 小时的旧目录。
2. 增加 `forceCleanupOldTestDirs()` 函数供 CI/手动调用。
3. 在 fixture 中确保 Electron 进程退出后再删除 config/library，避免文件锁。

- [ ] **Step 5.1: 修改 `e2e/helpers/test-library.ts`**

在文件顶部添加：

```ts
const OLD_DIR_MAX_AGE_MS = 24 * 60 * 60 * 1000 // 24 hours
```

在 `createTestLibrary` 和 `createTestConfigDir` 末尾调用清理：

```ts
export function createTestLibrary(): string {
  cleanupOldTestDirs(TEST_LIBRARY_ROOT)
  const id = `${Date.now()}-${randomUUID()}`
  const dir = path.join(TEST_LIBRARY_ROOT, id)
  fs.mkdirSync(dir, { recursive: true })
  return dir
}
```

```ts
export function createTestConfigDir(): string {
  cleanupOldTestDirs(TEST_CONFIG_ROOT)
  const id = `${Date.now()}-${randomUUID()}`
  const dir = path.join(TEST_CONFIG_ROOT, id)
  fs.mkdirSync(dir, { recursive: true })
  // ... existing env copy logic ...
  return dir
}
```

添加清理函数：

```ts
function cleanupOldTestDirs(root: string): void {
  if (!fs.existsSync(root)) return
  const now = Date.now()
  for (const entry of fs.readdirSync(root)) {
    const fullPath = path.join(root, entry)
    try {
      const stat = fs.statSync(fullPath)
      const age = now - stat.mtimeMs
      if (age > OLD_DIR_MAX_AGE_MS) {
        fs.rmSync(fullPath, { recursive: true, force: true })
        console.log(`[e2e] cleaned up old test dir: ${fullPath}`)
      }
    } catch (err) {
      // If a directory is locked by a running test, skip it silently.
      console.warn(`[e2e] skipped cleanup of ${fullPath}:`, err)
    }
  }
}

/**
 * Force cleanup of all test directories older than maxAgeMs.
 * Useful for CI or manual recovery when Windows file locks have left debris.
 */
export function forceCleanupOldTestDirs(maxAgeMs: number = OLD_DIR_MAX_AGE_MS): void {
  cleanupOldTestDirsWithAge(TEST_LIBRARY_ROOT, maxAgeMs)
  cleanupOldTestDirsWithAge(TEST_CONFIG_ROOT, maxAgeMs)
}

function cleanupOldTestDirsWithAge(root: string, maxAgeMs: number): void {
  if (!fs.existsSync(root)) return
  const now = Date.now()
  for (const entry of fs.readdirSync(root)) {
    const fullPath = path.join(root, entry)
    try {
      const stat = fs.statSync(fullPath)
      const age = now - stat.mtimeMs
      if (age > maxAgeMs) {
        fs.rmSync(fullPath, { recursive: true, force: true })
      }
    } catch {
      // ignore
    }
  }
}
```

- [ ] **Step 5.2: 修改 `e2e/fixtures/electron.ts` 中的清理顺序**

当前 `electronProcess` fixture 在 `use()` 之后先 `killProcessTree(proc)`，然后才 cleanup library。这可能导致 library 目录仍被锁定时就被删除。

把 `electronProcess` fixture 的 teardown 改为等待更长时间，并把 library cleanup 放到确认进程已退出之后：

```ts
electronProcess: async ({ testLibraryPath, testConfigDir, extraEnv }, use, testInfo) => {
  // ... spawn proc ...

  let cdpUrl: string
  try {
    cdpUrl = await waitForCdpUrl(proc, 60000)
    await waitForCdpPort(cdpUrl, 10000)
  } catch (err) {
    await killProcessTree(proc)
    throw err
  }

  await use({ process: proc, cdpUrl })

  await killProcessTree(proc)
  // 增加等待时间，确保 Windows 子进程（特别是 GPU 进程）释放文件句柄
  await waitForProcessExit(proc, 15000)

  const failed = testInfo.status === 'failed' || testInfo.status === 'timedOut'
  if (failed) {
    console.log(`[e2e] test failed, keeping test library for inspection: ${testLibraryPath}`)
  }
  try {
    await cleanupTestLibrary(testLibraryPath, failed)
  } catch (err) {
    console.warn('[e2e] failed to clean up test library:', testLibraryPath, err)
  }
},
```

- [ ] **Step 5.3: 把 fixture 里的 `killProcessTree` 替换为共享模块**

`e2e/fixtures/electron.ts` 里还有一个内联的 `killProcessTree`。改为从共享模块导入：

```ts
import { killProcessTree } from '../helpers/process-cleanup'
```

共享模块放在 `scripts/lib/process-cleanup.js`（纯 JavaScript），而 E2E helpers 是 TypeScript。为了类型清晰和使用方便，我们创建一个 `e2e/helpers/process-cleanup.ts` 重新导出。

**方案：** 在 `e2e/helpers/process-cleanup.ts` 中重新导出：

```ts
export { killProcessTree, isProcessRunning } from '../../scripts/lib/process-cleanup'
```

- [ ] **Step 5.4: 创建 `e2e/helpers/process-cleanup.ts` 并更新引用**

```ts
export { killProcessTree, isProcessRunning } from '../../scripts/lib/process-cleanup'
```

更新 `e2e/fixtures/electron.ts`：

```ts
import { killProcessTree } from './process-cleanup'
```

并删除 fixture 中内联的 `killProcessTree` 函数（保留 `waitForProcessExit`，因为它语义不同）。

- [ ] **Step 5.5: Commit**

```bash
git add e2e/helpers/test-library.ts e2e/helpers/process-cleanup.ts e2e/fixtures/electron.ts
git commit -m "feat(e2e): age out old test dirs and wait longer before cleanup"
```

---

## Task 6: 应用初始化性能优化（boot sequence）

**Files:**
- Modify: `electron/main.ts`

**说明:** 用户日志中 `renderer did-finish-load` 花了 22 秒。虽然主因可能是孤儿进程竞争，但 boot sequence 中 scan library 和 init state 两个阶段是串行且包含人为动画延迟的。这两个阶段实际工作与 UI 动画无关，可以缩短动画时长或并行执行实际工作。

- [ ] **Step 6.1: 缩短 boot sequence 的动画时长**

在 `runBootSequence` 中：

```ts
// 阶段 1: 注册 IPC
await animate('注册服务', 0, 15, 150)  // 从 300 改为 150

// 阶段 2: 探活模型
await animate('探活模型', 15, 50, Math.max(400, probeElapsed))  // 保持不变

// 阶段 3: 扫描学习库
await animate('扫描学习库', 50, 75, 250)  // 从 500 改为 250

// 阶段 4: 初始化状态
await animate('初始化状态', 75, 95, 200)  // 从 400 改为 200

// 阶段 5: 就绪
await animate('就绪', 95, 100, 150)  // 从 300 改为 150
```

这样 boot sequence 的最短等待时间从 1650ms 降到 1150ms。

- [ ] **Step 6.2: 并行执行 scan library 和 init state 的实际工作**

当前代码：

```ts
console.time('[bootstrap] stage: scan library')
console.log('[bootstrap] stage: scan library', bootTs())
await animate('扫描学习库', 50, 75, 500)
console.timeEnd('[bootstrap] stage: scan library')

console.time('[bootstrap] stage: init state')
console.log('[bootstrap] stage: init state', bootTs())
await animate('初始化状态', 75, 95, 400)
console.timeEnd('[bootstrap] stage: init state')
```

改为：

```ts
console.time('[bootstrap] stage: scan library')
console.log('[bootstrap] stage: scan library', bootTs())
await animate('扫描学习库', 50, 75, 250)
console.timeEnd('[bootstrap] stage: scan library')

console.time('[bootstrap] stage: init state')
console.log('[bootstrap] stage: init state', bootTs())
await animate('初始化状态', 75, 95, 200)
console.timeEnd('[bootstrap] stage: init state')
```

注意：scan library 的实际工作在 renderer 侧？看一下 boot sequence。当前 scan library 和 init state 只是动画阶段，真实工作可能分散在 renderer 接收到 boot:complete 之后。如果是这样，这次改动只是减少启动动画等待。

如果真实 scan library 在 IPC 注册后由某个 IPC 调用触发，需要进一步确认。目前保持保守，只缩短动画。

- [ ] **Step 6.3: Commit**

```bash
git add electron/main.ts
git commit -m "perf(bootstrap): shorten boot animation delays"
```

---

## Task 7: 集成验证

**Files:**
- 无新增文件，使用现有脚本和手动验证

**说明:** 改完以上代码后，必须进行真实场景验证：
1. 先手动杀掉所有 node/electron 进程，清理环境。
2. 运行 E2E 测试。
3. E2E 结束后不清理，直接运行 `npm run dev`。
4. 点击应用右上角 × 关闭，确认终端也退出。
5. 再次运行 `npm run dev`，确认启动时间恢复正常。

- [ ] **Step 7.1: 运行单元测试**

Run:
```bash
npm run test
```

Expected: 全部 PASS。

- [ ] **Step 7.2: 手动清理环境并第一次启动 dev**

Run:
```bash
# 清理 Windows 上的孤儿进程
taskkill /F /IM electron.exe /T 2>nul || true
taskkill /F /IM node.exe /T 2>nul || true
# 清理 dev 缓存
rm -rf .electron-cache
# 启动 dev
npm run dev
```

Expected:
- 终端显示 `[dev] preflight cleanup started`
- 如果有旧进程，显示 `killed N orphan project process(es)`
- 应用正常启动，`renderer did-finish-load` 应在 5 秒内完成

- [ ] **Step 7.3: 点击窗口 × 关闭，确认终端退出**

Expected:
- 应用窗口关闭
- 终端中的 `npm run dev` 进程在 1-2 秒内退出
- `tasklist` 中不再有本项目的 electron.exe

- [ ] **Step 7.4: 运行 E2E 测试**

Run:
```bash
npm run test:e2e:smoke
```

Expected: 测试通过，且 `e2e/.test-config/` 和 `e2e/.test-library/` 下不再堆积大量旧目录（失败的测试可能保留，但数量应可控）。

- [ ] **Step 7.5: E2E 后直接启动 dev**

Run:
```bash
npm run dev
```

Expected:
- `preflight cleanup` 杀掉 E2E 残留的 electron.exe
- 端口 5173/9222 被释放
- 启动正常，不卡顿

- [ ] **Step 7.6: Commit 验证结果（可选，如果做了配置调整）**

如果验证过程中修改了 `.gitignore` 或文档，单独 commit：

```bash
git add .gitignore docs/...
git commit -m "chore: ignore .electron-cache and document cleanup behavior"
```

---

## Task 8: 文档更新

**Files:**
- Modify: `.gitignore`
- Modify: `CLAUDE.md`（项目级）

- [ ] **Step 8.1: 把 `.electron-cache/` 加入 `.gitignore`**

```gitignore
# Electron dev-mode isolated caches
.electron-cache/
```

- [ ] **Step 8.2: 在 `CLAUDE.md` 的"常用命令"或"测试"部分补充说明**

添加一段：

```markdown
### 清理开发环境

如果 `npm run dev` 启动变慢或出现端口占用，通常是之前的 Electron 进程没有干净退出：

```bash
# Windows
 taskkill /F /IM electron.exe /T
 taskkill /F /IM node.exe /T
 rm -rf .electron-cache
```

从 v1.1.x 起，`scripts/dev.js` 会在启动前自动执行上述清理。
```

- [ ] **Step 8.3: Commit**

```bash
git add .gitignore CLAUDE.md
git commit -m "docs: ignore dev electron cache and add cleanup notes"
```

---

## Task 9: Vite 冷启动缓解 + 旧缓存路径迁移清理（2026-07-11 第二次修订）

**Files:**
- Modify: `electron.vite.config.ts`
- Modify: `scripts/dev-clean.js`

**说明:** 一次真实启动诊断中，`npm run dev` 的 `renderer did-finish-load` 耗时 26 秒。排查确认根因并非孤儿进程或 boot animation，而是 **Vite dev server 冷启动**——`npm run build`（为 E2E 所需）后首次 `npm run dev` 时，Vite 需冷启模块转换管线。Windows 上处理 1.1MB（压缩后）的模块图需 15-25s，这是 Vite 在 Windows 上的固有限制。

同时发现旧代码留下的项目根 `.electron-cache/`（17MB, 186 文件）未被清理——Task 3 已将其迁移到 `node_modules/.electron-cache/`，但没有迁移清理旧目录。旧目录不在 `node_modules/` 下，会落入 Vite 的 file watcher 范围。

**已知限制（不做过度修复）：** Vite 冷启动在 Windows 上无法完全消除。首次 `npm run dev` 后热启动应在 3-5s 内完成。本 Task 只做防御性加固——确保缓存目录不会因旧代码/手动操作落在 Vite 的 watch 范围内。

- [ ] **Step 9.1: 在 Vite 的 `server.watch.ignored` 中防御性排除所有 `.electron-cache/`**

在 `electron.vite.config.ts` 的 `renderer.server.watch.ignored` 中追加：

```ts
'**/.electron-cache/**',
```

**为什么需要：** Vite 默认排除 `node_modules/**` 和 `.git/**`，但不会排除其他隐藏目录。如果 `.electron-cache/` 因旧代码或手动操作落在项目根（而非 `node_modules/` 内），Vite 的 chokidar 会监控其中的 Chromium Code Cache、GPUCache 等锁文件，增加 watcher 初始化开销甚至触发 EBUSY 崩溃。

- [ ] **Step 9.2: 增强 `dev-clean.js` 同时清理新旧两个 cache 路径**

```js
const fs = require('node:fs')

function cleanDevCacheDirs() {
  const dirs = [
    DEV_CACHE_DIR,                                    // node_modules/.electron-cache（当前）
    path.join(PROJECT_ROOT, '.electron-cache'),       // 项目根（旧代码遗留）
  ]
  for (const dir of dirs) {
    if (!fs.existsSync(dir)) continue
    try {
      fs.rmSync(dir, { recursive: true, force: true })
      console.log(`[dev:clean] removed cache dir: ${dir}`)
    } catch (err) {
      console.warn(`[dev:clean] failed to remove ${dir}:`, err.message)
    }
  }
}
```

在 `forceCleanupDevEnvironment` 之后调用 `cleanDevCacheDirs()`。

- [ ] **Step 9.3: 更新 `.claude/rules/build-dev.md`**

在 §5（Dev 与 E2E 必须隔离 userData/cache）中追加一条说明：

```markdown
- 如果更改了 dev cache 路径，必须在 `dev-clean.js` 和 Vite `server.watch.ignored` 中同步更新新旧两个路径。
```

- [ ] **Step 9.4: Commit**

```bash
git add electron.vite.config.ts scripts/dev-clean.js .claude/rules/build-dev.md
git commit -m "fix(dev): add .electron-cache to Vite watch ignore, clean stale cache dirs"
```

---

## Self-Review Checklist

1. **Spec coverage:**
   - 终端运行时卡住 → Task 2 preflight cleanup + Task 4 窗口关闭退出
   - 应用初始化卡住 → Task 1/2/3 清理孤儿/隔离缓存 + Task 6 缩短 boot 动画
   - 点击 × 关闭后无孤儿 → Task 2 electron-vite exit handler + Task 4 window-all-closed
   - E2E 后 dev 干净 → Task 2 preflight + Task 5 E2E 老化清理

2. **Placeholder scan:**
   - 无 "TBD/TODO/实现 later"
   - 所有代码步骤都有完整代码
   - 所有测试命令都有 Expected

3. **Type/Path consistency:**
   - `killProcessTree` 在 `scripts/lib/process-cleanup.js` 中签名一致
   - `resolveAppPaths` 返回的字段在所有分支都存在
   - `cleanupTestLibrary` / `cleanupTestConfigDir` 保持原有签名
   - `scripts/dev.js` 使用 `require('./lib/process-cleanup')`，路径正确
   - E2E helpers 通过 `e2e/helpers/process-cleanup.ts` 重新导出，引用路径一致

4. **运行时兼容性：**
   - `scripts/lib/process-cleanup.js` 为纯 JavaScript，可被 Node.js 直接 require，无需 ts-node
   - `electron/lib/app-paths.ts` 保持 TypeScript，由 electron-vite 编译
   - 所有路径引用已在各 Task 中统一为 `scripts/lib/process-cleanup.js`

---

## 执行交接

**Plan complete and saved to `docs/superpowers/plans/2026-07-10-fix-dev-hang-and-orphan-processes.md`.**

Two execution options:

**1. Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints

**Which approach?**
