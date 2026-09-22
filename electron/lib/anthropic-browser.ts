import { app, BrowserWindow } from 'electron'
import type { BrowserWindow as BrowserWindowType } from 'electron'
import { createRunQueue } from './run-queue'

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

// 抓取窗口全局只有一个，所有使用方（discover 列表页、import 正文/图片）经队列串行，
// 否则并发 loadURL 互相顶掉导航、did-finish-load 监听器串台。
const scriptQueue = createRunQueue()

export function cancelCurrentOperation(url?: string): void {
  // 先取消还在队列里等待的任务；url 缺省 = 旧行为（清空等待 + 取消当前）
  scriptQueue.cancelQueued(url)
  if (url && scriptQueue.activeUrl() !== url) return
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
  return scriptQueue.enqueue(opts.url, () => runScriptNow<T>(script, opts))
}

async function runScriptNow<T>(
  script: string,
  opts: RunScriptOptions
): Promise<T> {
  const win = await ensureScraperWindow()
  const wc = win.webContents

  return new Promise<T>((resolve, reject) => {
    let settled = false
    let timeoutId: NodeJS.Timeout | null = null

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
        wc.removeAllListeners('did-navigate')
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

    // 指向 fail（而非裸 reject）：取消时必须清掉本任务的监听器，
    // 否则取消后队列里下一个任务开始，残留的 once 监听器会被新页面加载触发而串台。
    currentReject = fail

    const timeoutMs = opts.timeoutMs ?? 60000
    timeoutId = setTimeout(() => {
      fail(new Error(`Timeout after ${timeoutMs}ms loading ${opts.url}`))
    }, timeoutMs)

    wc.once('did-fail-load', (_event, _errorCode, errorDescription) => {
      fail(new Error(`Load failed: ${errorDescription || 'unknown'}`))
    })

    // HTTP 4xx/5xx 不触发 did-fail-load（错误页照常加载完成），
    // 必须在导航提交时按状态码拦截，否则会把错误页当正文抓下来。
    // did-navigate 给出重定向后的最终响应码。
    wc.once('did-navigate', (_event, _url, httpResponseCode) => {
      if (httpResponseCode >= 400) {
        try {
          wc.stop()
        } catch {}
        fail(new Error(`HTTP_ERROR_${httpResponseCode}`))
      }
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
