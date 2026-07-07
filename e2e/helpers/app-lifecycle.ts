import { Page, chromium, Browser, BrowserContext } from 'playwright'
import { spawn, ChildProcess } from 'node:child_process'
import path from 'node:path'

function waitForCdpUrl(proc: ChildProcess, timeoutMs: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      cleanup()
      reject(new Error(`Timed out waiting for Electron CDP URL (${timeoutMs}ms)`))
    }, timeoutMs)

    const onData = (data: Buffer) => {
      const line = data.toString()
      const match = line.match(/DevTools listening on (ws:\/\/\S+)/)
      if (match) {
        cleanup()
        resolve(match[1])
      }
    }

    const cleanup = () => {
      clearTimeout(timer)
      proc.stdout?.off('data', onData)
      proc.stderr?.off('data', onData)
    }

    proc.stdout?.on('data', onData)
    proc.stderr?.on('data', onData)
  })
}

async function waitForCdpPort(url: string, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs
  const portMatch = url.match(/ws:\/\/127\.0\.0\.1:(\d+)/)
  if (!portMatch) throw new Error(`Could not extract port from CDP URL: ${url}`)
  const port = parseInt(portMatch[1], 10)

  while (Date.now() < deadline) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/json/version`)
      if (response.ok) return
    } catch {
      // port not ready yet
    }
    await new Promise(r => setTimeout(r, 100))
  }
  throw new Error(`CDP port ${port} did not become ready within ${timeoutMs}ms`)
}

async function getAppPage(context: BrowserContext, timeoutMs: number): Promise<Page> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    for (const page of context.pages()) {
      const url = page.url()
      if (url !== 'about:blank' && url !== '') {
        return page
      }
    }
    await new Promise(r => setTimeout(r, 100))
  }
  throw new Error(`No app page found within ${timeoutMs}ms`)
}

async function waitForProcessExit(proc: ChildProcess, timeoutMs: number): Promise<boolean> {
  if (proc.exitCode !== null) return true
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(false), timeoutMs)
    proc.once('exit', () => {
      clearTimeout(timer)
      resolve(true)
    })
  })
}

async function isProcessRunning(pid: number): Promise<boolean> {
  if (process.platform !== 'win32' || pid <= 0) return false
  return new Promise((resolve) => {
    const checker = spawn('tasklist', ['/FI', `PID eq ${pid}`, '/FO', 'CSV', '/NH'], { stdio: 'pipe' })
    let output = ''
    checker.stdout?.on('data', (data: Buffer) => {
      output += data.toString()
    })
    checker.on('exit', () => {
      resolve(output.includes(String(pid)))
    })
    checker.on('error', () => resolve(false))
    setTimeout(() => resolve(false), 2000)
  })
}

async function killProcessTree(proc: ChildProcess): Promise<void> {
  if (!proc.pid) return

  if (process.platform === 'win32') {
    // First attempt: graceful-but-firm process-tree termination.
    await runTaskkill(proc.pid)
    let exited = await waitForProcessExit(proc, 10000)

    // Verify the PID is actually gone; the 'exit' event can fire before all
    // child electron.exe processes release handles.
    if (!exited && (await isProcessRunning(proc.pid))) {
      console.warn(`[e2e] process ${proc.pid} still running after taskkill, retrying`)
      await runTaskkill(proc.pid)
      exited = await waitForProcessExit(proc, 10000)
    }

    if (!exited) {
      console.warn(`[e2e] process ${proc.pid} did not exit cleanly`)
    }
    return
  }

  proc.kill('SIGKILL')
  await waitForProcessExit(proc, 15000)
}

function runTaskkill(pid: number): Promise<void> {
  return new Promise((resolve) => {
    const killer = spawn('taskkill', ['/F', '/T', '/PID', String(pid)], { stdio: 'ignore' })
    killer.on('exit', () => resolve())
    killer.on('error', () => resolve())
    setTimeout(() => resolve(), 5000)
  })
}

export async function startApp({
  testLibraryPath,
  testConfigDir,
}: {
  testLibraryPath: string
  testConfigDir: string
}): Promise<{ electronApp: { close: () => Promise<void> }; window: Page }> {
  const env = { ...process.env }
  delete env.ELECTRON_RUN_AS_NODE

  const proc = spawn(
    process.env.ELECTRON_OVERRIDE_DIST_PATH
      ? path.join(process.env.ELECTRON_OVERRIDE_DIST_PATH, 'electron.exe')
      : path.join(process.cwd(), 'node_modules', 'electron', 'dist', 'electron.exe'),
    ['--remote-debugging-port=0', '--no-sandbox', '.'],
    {
      cwd: process.cwd(),
      env: {
        ...env,
        NODE_ENV: 'test',
        E2E_CONFIG_DIR: testConfigDir,
        E2E_STUDY_LIBRARY_PATH: testLibraryPath,
        E2E_SKIP_PROBE: '1',
      },
    }
  )

  let browser: Browser | undefined
  try {
    const cdpUrl = await waitForCdpUrl(proc, 60000)
    await waitForCdpPort(cdpUrl, 10000)
    const portMatch = cdpUrl.match(/ws:\/\/127\.0\.0\.1:(\d+)/)
    const port = portMatch ? parseInt(portMatch[1], 10) : 9222
    browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`, { timeout: 60000 })
    const context = browser.contexts()[0]
    if (!context) throw new Error('No browser context available')
    const window = await getAppPage(context, 30000)
    await window.waitForLoadState('domcontentloaded')

    return {
      electronApp: {
        close: async () => {
          try {
            await browser?.close()
          } catch (err) {
            console.warn('[e2e] failed to close browser:', err)
          }
          await killProcessTree(proc)
        },
      },
      window,
    }
  } catch (err) {
    await killProcessTree(proc)
    throw err
  }
}

export async function stopApp(electronApp: { close: () => Promise<void> } | undefined) {
  if (electronApp) {
    await electronApp.close()
  }
}
