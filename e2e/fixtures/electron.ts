import { test as base, chromium } from '@playwright/test'
import type { BrowserContext, Page } from '@playwright/test'
import { spawn, ChildProcess } from 'node:child_process'
import path from 'node:path'
import fs from 'node:fs'
import {
  createTestLibrary,
  cleanupTestLibrary,
  createTestConfigDir,
  cleanupTestConfigDir,
} from '../helpers/test-library'
import { killProcessTree, killProjectProcessesByPattern } from '../helpers/process-cleanup'

type E2EFixtures = {
  electronProcess: { process: ChildProcess; cdpUrl: string }
  window: Page
  testLibraryPath: string
  testConfigDir: string
  extraEnv: Record<string, string>
}

function waitForCdpUrl(proc: ChildProcess, timeoutMs: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`Timed out waiting for Electron CDP URL (${timeoutMs}ms)`))
    }, timeoutMs)

    const onData = (data: Buffer) => {
      const line = data.toString()
      // Stream Electron logs to test output for debugging startup issues.
      process.stdout.write(line)
      const match = line.match(/DevTools listening on (ws:\/\/\S+)/)
      if (match && timer) {
        clearTimeout(timer)
        resolve(match[1])
      }
    }

    // Keep streams flowing so Electron does not block once the internal buffer fills up.
    proc.stdout?.on('data', onData)
    proc.stderr?.on('data', onData)
  })
}

async function waitForProcessExit(proc: ChildProcess, timeoutMs: number): Promise<void> {
  if (proc.exitCode !== null) return
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      resolve()
    }, timeoutMs)
    proc.once('exit', () => {
      clearTimeout(timer)
      resolve()
    })
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

export const test = base.extend<E2EFixtures>({
  testLibraryPath: async ({}, use) => {
    const dir = createTestLibrary()
    await use(dir)
  },

  testConfigDir: async ({}, use, testInfo) => {
    const dir = createTestConfigDir()
    await use(dir)

    const failed = testInfo.status === 'failed' || testInfo.status === 'timedOut'
    try {
      await cleanupTestConfigDir(dir, failed)
    } catch (err) {
      console.warn('[e2e] failed to clean up test config dir:', dir, err)
    }
  },

  extraEnv: async ({}, use) => {
    await use({})
  },

  electronProcess: async ({ testLibraryPath, testConfigDir, extraEnv }, use, testInfo) => {
    const env = { ...process.env }
    delete env.ELECTRON_RUN_AS_NODE

    // Ensure TAVILY_API_KEY is loaded from project .env so E2E real-API
    // tests use the same key regardless of process.env inheritance quirks.
    const tavilyKey = (() => {
      const envPath = path.join(process.cwd(), '.env')
      try {
        const content = fs.readFileSync(envPath, 'utf8')
        const match = content.match(/^TAVILY_API_KEY=(.+?)\s*$/m)
        return match ? match[1].trim() : ''
      } catch {
        return ''
      }
    })()

    const proc = spawn(
      path.join(process.cwd(), 'node_modules', 'electron', 'dist', 'electron.exe'),
      ['--remote-debugging-port=0', '--no-sandbox', '--disable-gpu', '.'],
      {
        cwd: process.cwd(),
        env: {
          ...env,
          NODE_ENV: 'test',
          E2E_CONFIG_DIR: testConfigDir,
          E2E_STUDY_LIBRARY_PATH: testLibraryPath,
          E2E_SKIP_PROBE: '1',
          E2E_SILENT: '1',
          TAVILY_API_KEY: tavilyKey || process.env.TAVILY_API_KEY || '',
          ...extraEnv,
        },
      }
    )

    let cdpUrl: string
    try {
      cdpUrl = await waitForCdpUrl(proc, 60000)
      await waitForCdpPort(cdpUrl, 10000)
    } catch (err) {
      await killProcessTree(proc.pid)
      throw err
    }

    await use({ process: proc, cdpUrl })

    await killProcessTree(proc.pid)
    // 增加等待时间，确保 Windows 子进程（特别是 GPU 进程）释放文件句柄
    await waitForProcessExit(proc, 15000)

    // 强行终止命令行仍包含该测试配置目录的残留进程，避免 Windows
    // 文件锁导致 cleanupTestConfigDir 出现 EPERM。
    const { killed, failed } = await killProjectProcessesByPattern(process.cwd(), testConfigDir)
    if (killed.length) {
      console.log('[e2e] killed residual processes for config dir:', killed.join(', '))
    }
    if (failed.length) {
      console.warn('[e2e] failed to kill residual processes for config dir:', failed.map(f => f.pid).join(', '))
    }
    if (killed.length || failed.length) {
      // 给 WMIC/句柄释放留一点缓冲
      await new Promise(r => setTimeout(r, 1000))
    }

    const testFailed = testInfo.status === 'failed' || testInfo.status === 'timedOut'
    if (testFailed) {
      console.log(`[e2e] test failed, keeping test library for inspection: ${testLibraryPath}`)
    }
    try {
      await cleanupTestLibrary(testLibraryPath, testFailed)
    } catch (err) {
      console.warn('[e2e] failed to clean up test library:', testLibraryPath, err)
    }
  },

  window: async ({ electronProcess }, use) => {
    const portMatch = electronProcess.cdpUrl.match(/ws:\/\/127\.0\.0\.1:(\d+)/)
    const port = portMatch ? parseInt(portMatch[1], 10) : 9222
    const browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`, { timeout: 60000 })
    try {
      const context = browser.contexts()[0]
      if (!context) throw new Error('No browser context available')

      const page = await getAppPage(context, 30000)
      await page.waitForLoadState('domcontentloaded')
      await use(page)
    } finally {
      await browser.close()
    }
  },
})

export { expect } from '@playwright/test'
