import { test as base, chromium } from '@playwright/test'
import type { BrowserContext, Page } from '@playwright/test'
import { spawn, ChildProcess } from 'node:child_process'
import path from 'node:path'
import {
  createTestLibrary,
  cleanupTestLibrary,
  createTestConfigDir,
  cleanupTestConfigDir,
} from '../helpers/test-library'

type E2EFixtures = {
  electronProcess: { process: ChildProcess; cdpUrl: string }
  window: Page
  testLibraryPath: string
  testConfigDir: string
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

  electronProcess: async ({ testLibraryPath, testConfigDir }, use, testInfo) => {
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
        },
      }
    )

    let cdpUrl: string
    try {
      cdpUrl = await waitForCdpUrl(proc, 60000)
      await waitForCdpPort(cdpUrl, 10000)
    } catch (err) {
      proc.kill()
      throw err
    }

    await use({ process: proc, cdpUrl })

    proc.kill()

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

  window: async ({ electronProcess }, use) => {
    const browser = await chromium.connectOverCDP(electronProcess.cdpUrl)
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
