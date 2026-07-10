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
