import { Page, chromium, Browser, BrowserContext } from 'playwright'
import { spawn, ChildProcess } from 'node:child_process'
import path from 'node:path'

const DEBUG = process.env.E2E_DEBUG === '1'

function log(...args: unknown[]) {
  if (DEBUG) console.log(...args)
}

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

async function waitForProcessExit(proc: ChildProcess, timeoutMs: number): Promise<void> {
  if (proc.exitCode !== null) return
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(), timeoutMs)
    proc.once('exit', () => {
      clearTimeout(timer)
      resolve()
    })
  })
}

async function killProcessTree(proc: ChildProcess): Promise<void> {
  if (!proc.pid) return
  if (process.platform === 'win32') {
    return new Promise((resolve) => {
      const killer = spawn('taskkill', ['/F', '/T', '/PID', String(proc.pid)], { stdio: 'ignore' })
      killer.on('exit', () => resolve())
      killer.on('error', () => resolve())
      setTimeout(() => resolve(), 5000)
    })
  }
  proc.kill('SIGKILL')
  await waitForProcessExit(proc, 5000)
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

export type StartAppOptions = {
  testLibraryPath: string
  testConfigDir: string
  extraEnv?: Record<string, string | undefined>
}

export async function startAppWithEnv({
  testLibraryPath,
  testConfigDir,
  extraEnv = {},
}: StartAppOptions): Promise<{ electronApp: { close: () => Promise<void> }; window: Page }> {
  const env = { ...process.env }
  delete env.ELECTRON_RUN_AS_NODE

  const proc = spawn(
    path.join(process.cwd(), 'node_modules', 'electron', 'dist', 'electron.exe'),
    ['--remote-debugging-port=0', '--no-sandbox', '.'],
    {
      cwd: process.cwd(),
      env: {
        ...env,
        NODE_ENV: 'test',
        E2E_CONFIG_DIR: testConfigDir,
        E2E_STUDY_LIBRARY_PATH: testLibraryPath,
        E2E_SKIP_PROBE: '1',
        ...extraEnv,
      },
    }
  )

  if (DEBUG) {
    proc.stdout?.on('data', (data: Buffer) => process.stdout.write(`[electron] ${data}`))
    proc.stderr?.on('data', (data: Buffer) => process.stderr.write(`[electron] ${data}`))
  }

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
          await waitForProcessExit(proc, 5000)
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
