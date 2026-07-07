// Workaround for ELECTRON_RUN_AS_NODE being set in the environment,
// which causes require("electron") to return a string path instead of API objects.
if ('ELECTRON_RUN_AS_NODE' in process.env) {
  delete process.env.ELECTRON_RUN_AS_NODE
}

const { spawn } = require('child_process')

const args = process.argv.slice(2)
// shell: true is required on Windows so that electron-vite (a node_modules/.bin
// shim) can be resolved by cmd.exe.  We track the shell PID and kill the whole
// process tree on exit so that orphaned Electron processes cannot hold the Vite
// dev-server port (5173) or the DevTools port (9222) and lock Chromium caches.
const child = spawn('electron-vite', args, { stdio: 'inherit', shell: true })

function killProcessTree(pid) {
  return new Promise((resolve) => {
    if (!pid) {
      resolve()
      return
    }
    if (process.platform === 'win32') {
      // /T kills the process and all descendants; /F forces it.  This mirrors
      // the E2E teardown strategy and avoids leaving electron.exe zombies.
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
    await killProcessTree(child.pid)
  }

  if (forced) process.exit(0)
}

process.on('SIGINT', () => shutdown(true))
process.on('SIGTERM', () => shutdown(true))
process.on('beforeExit', () => shutdown(false))

child.on('exit', (code) => {
  process.exitCode = code ?? 0
})
