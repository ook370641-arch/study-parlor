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

  const { killed, failed } = await cleanupProjectOrphans(PROJECT_ROOT, [process.pid])
  if (killed.length > 0) {
    console.log(`[dev] killed ${killed.length} orphan project process(es): ${killed.join(', ')}`)
  }
  if (failed.length > 0) {
    console.warn(`[dev] failed to kill ${failed.length} orphan project process(es):`)
    for (const proc of failed) {
      console.warn(`  - pid ${proc.pid} (${proc.name}): ${proc.commandLine}`)
    }
    console.warn('[dev] if startup remains slow, run: npm run dev:clean')
  }

  for (const port of [DEV_SERVER_PORT, DEVTOOLS_PORT]) {
    const listeners = await findPortListeners(port)
    for (const pid of listeners) {
      if (pid === process.pid) continue
      console.warn(`[dev] port ${port} is occupied by pid ${pid}, killing`)
      const success = await killProcessTree(pid, 10000)
      if (!success) {
        console.warn(`[dev] failed to free port ${port}: pid ${pid} survived; run npm run dev:clean`)
      }
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
async function shutdown(forced = false, exitCode = 0) {
  if (shutdownStarted) return
  shutdownStarted = true

  console.log('[dev] shutdown cleanup started')

  // 1. Try to terminate the electron-vite child tree first.
  const stillRunning = child && child.exitCode === null && !child.killed
  if (stillRunning) {
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
  }

  // 2. Catch any surviving orphans (electron.exe, GPU process, etc.).
  const { killed, failed } = await cleanupProjectOrphans(PROJECT_ROOT, [process.pid])
  if (killed.length > 0) {
    console.log(`[dev] shutdown cleanup killed ${killed.length} orphan(s): ${killed.join(', ')}`)
  }
  if (failed.length > 0) {
    console.warn(`[dev] shutdown cleanup failed to kill ${failed.length} orphan(s):`)
    for (const proc of failed) {
      console.warn(`  - pid ${proc.pid} (${proc.name}): ${proc.commandLine}`)
    }
    console.warn('[dev] run npm run dev:clean if the next startup is slow')
  }

  if (forced) process.exit(exitCode)
}

async function main() {
  await preflightCleanup()

  // shell: true is required on Windows so that electron-vite (a node_modules/.bin
  // shim) can be resolved by cmd.exe.  We track the shell PID and kill the whole
  // process tree on exit so that orphaned Electron processes cannot hold the Vite
  // dev-server port (5173) or the DevTools port (9222) and lock Chromium caches.
  // Pass command as a single string to avoid Node DEP0190 (passing args array with
  // shell: true is deprecated since Node 21).
  const cmd = ['electron-vite', ...args].join(' ')
  global.child = spawn(cmd, { stdio: 'inherit', shell: true })

  // 关键改动：当 electron-vite 退出时（例如用户点击应用窗口 ×），
  // 先执行清理再结束 dev.js，避免 electron.exe 孤儿继续占着 5173。
  child.on('exit', (code, signal) => {
    console.log(`[dev] electron-vite exited with code ${code}, signal ${signal}`)
    shutdown(false).then(() => {
      process.exitCode = code ?? 0
      setTimeout(() => process.exit(process.exitCode ?? 0), 500)
    }).catch((err) => {
      console.error('[dev] cleanup during child exit failed:', err)
      process.exit(code ?? 1)
    })
  })

  // Windows 上 SIGINT 不可靠，readline 监听 Ctrl+C 键事件更可靠。
  if (process.platform === 'win32' && process.stdin.isTTY) {
    const readline = require('readline')
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
    rl.on('SIGINT', () => {
      console.log('[dev] Ctrl+C detected via readline')
      shutdown(true, 0)
    })
  }

  process.on('SIGINT', () => shutdown(true, 0))
  process.on('SIGTERM', () => shutdown(true, 0))
  process.on('beforeExit', () => shutdown(false))
  process.on('uncaughtException', (err) => {
    console.error('[dev] uncaughtException:', err)
    shutdown(true, 1)
  })
}

main().catch((err) => {
  console.error('[dev] failed to start:', err)
  shutdown(true, 1).finally(() => process.exit(1))
})
