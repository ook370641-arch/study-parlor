import { app, BrowserWindow } from 'electron'
import type { BrowserWindow as BrowserWindowType } from 'electron'

let scraperWindow: BrowserWindowType | null = null
let currentReject: ((reason: Error) => void) | null = null

const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36'

function createWindow(): BrowserWindowType {
  const win = new BrowserWindow({
    show: false,
    width: 1280,
    height: 800,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      offscreen: false,
    },
  })
  win.webContents.setUserAgent(USER_AGENT)
  return win
}

export async function ensureScraperWindow(): Promise<BrowserWindowType> {
  if (scraperWindow && !scraperWindow.isDestroyed()) {
    return scraperWindow
  }
  scraperWindow = createWindow()
  return scraperWindow
}

export async function closeScraperWindow(): Promise<void> {
  if (scraperWindow && !scraperWindow.isDestroyed()) {
    const win = scraperWindow
    scraperWindow = null
    win.destroy()
  }
}

export function cancelCurrentOperation(): void {
  if (scraperWindow && !scraperWindow.isDestroyed()) {
    scraperWindow.webContents.stop()
  }
  if (currentReject) {
    currentReject(new Error('cancelled'))
    currentReject = null
  }
}

export interface RunScriptOptions {
  url: string
  waitForSelector?: string
  timeoutMs?: number
}

export async function runScriptInScraperWindow<T>(
  script: string,
  opts: RunScriptOptions
): Promise<T> {
  if (process.env.E2E_ANTHROPIC_OFFLINE === '1') {
    throw new Error('NETWORK_ERROR: Anthropic is not reachable (offline simulation)')
  }

  const win = await ensureScraperWindow()
  const wc = win.webContents

  return new Promise<T>((resolve, reject) => {
    let settled = false
    let timeoutId: NodeJS.Timeout | null = null
    currentReject = reject

    function cleanup() {
      settled = true
      currentReject = null
      if (timeoutId) {
        clearTimeout(timeoutId)
        timeoutId = null
      }
      try {
        wc.removeAllListeners('did-finish-load')
        wc.removeAllListeners('did-fail-load')
      } catch {}
    }

    function fail(err: Error) {
      if (settled) return
      cleanup()
      reject(err)
    }

    function succeed(value: T) {
      if (settled) return
      cleanup()
      resolve(value)
    }

    const timeoutMs = opts.timeoutMs ?? 60000
    timeoutId = setTimeout(() => {
      fail(new Error(`Timeout after ${timeoutMs}ms loading ${opts.url}`))
    }, timeoutMs)

    wc.once('did-fail-load', (_event, _errorCode, errorDescription) => {
      fail(new Error(`Load failed: ${errorDescription || 'unknown'}`))
    })

    async function runOnLoad() {
      try {
        if (opts.waitForSelector) {
          await wc.executeJavaScript(
            `(
              () => {
                return new Promise((resolve, reject) => {
                  const sel = ${JSON.stringify(opts.waitForSelector)};
                  const deadline = Date.now() + 20000;
                  const check = () => {
                    if (document.querySelector(sel)) return resolve(true);
                    if (Date.now() > deadline) return reject(new Error('waitForSelector timeout: ' + sel));
                    setTimeout(check, 100);
                  };
                  check();
                });
              }
            )()`,
            true
          )
        }
        // Small extra pause to let client-side hydration settle.
        await new Promise((r) => setTimeout(r, 500))
        const result = await wc.executeJavaScript(script, true)
        succeed(result as T)
      } catch (err) {
        fail(err instanceof Error ? err : new Error(String(err)))
      }
    }

    wc.once('did-finish-load', () => {
      runOnLoad().catch(fail)
    })

    wc.loadURL(opts.url).catch(fail)
  })
}

app?.on('before-quit', () => {
  closeScraperWindow().catch(() => {})
})
