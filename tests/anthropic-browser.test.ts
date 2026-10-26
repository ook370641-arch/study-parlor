import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { EventEmitter } from 'node:events'
import { BrowserWindow } from 'electron'
import { runScriptInScraperWindow, closeScraperWindow } from '../electron/lib/anthropic-browser'

vi.mock('electron', () => ({
  app: { on: vi.fn() },
  BrowserWindow: vi.fn(),
}))

describe('anthropic browser navigation', () => {
  let webContents: EventEmitter & Record<string, any>

  beforeEach(() => {
    webContents = new EventEmitter() as EventEmitter & Record<string, any>
    Object.assign(webContents, {
      setUserAgent: vi.fn(),
      stop: vi.fn(),
      executeJavaScript: vi.fn(async (script: string) => script === 'window.result' ? { title: 'Loaded' } : true),
    })
    const win = {
      webContents,
      isDestroyed: () => false,
      destroy: vi.fn(),
    }
    vi.mocked(BrowserWindow).mockImplementation(() => win as any)
  })

  afterEach(async () => {
    await closeScraperWindow()
    vi.clearAllMocks()
  })

  it('统计子框架被 CSP 拦截时仍提取主页面', async () => {
    webContents.loadURL = vi.fn(async () => {
      webContents.emit('did-fail-load', {}, -277, 'ERR_BLOCKED_BY_CSP', 'https://a.anthropic.com/isolated-segment.html', false)
      webContents.emit('did-finish-load')
    })

    await expect(runScriptInScraperWindow('window.result', {
      url: 'https://www.anthropic.com/engineering',
      waitForSelector: 'a[href^="/research/"]',
    })).resolves.toEqual({ title: 'Loaded' })
  })

  it('主框架加载失败时仍然报错', async () => {
    webContents.loadURL = vi.fn(async () => {
      webContents.emit('did-fail-load', {}, -105, 'ERR_NAME_NOT_RESOLVED', 'https://www.anthropic.com/engineering', true)
    })

    await expect(runScriptInScraperWindow('window.result', {
      url: 'https://www.anthropic.com/engineering',
    })).rejects.toThrow('Load failed: ERR_NAME_NOT_RESOLVED')
  })
})
