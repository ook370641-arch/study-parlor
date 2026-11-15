import { ipcMain } from 'electron'
import type { BrowserWindow } from 'electron'
import type { BrowserBounds } from '@shared/index'
import { browserControllerFor } from '../lib/browser-view'

const EMPTY_STATE = {
  url: '', title: '', loading: false, canGoBack: false, canGoForward: false, error: null,
}

export function registerBrowserIpc(getMainWindow: () => BrowserWindow | null) {
  const controller = () => {
    const window = getMainWindow()
    return window && !window.isDestroyed() ? browserControllerFor(window) : null
  }

  ipcMain.handle('browser:show', (_event, args: { bounds: BrowserBounds; restoreUrl?: string | null }) =>
    controller()?.show(args.bounds, args.restoreUrl) ?? Promise.resolve(EMPTY_STATE))
  ipcMain.handle('browser:hide', () => { controller()?.hide() })
  ipcMain.handle('browser:setBounds', (_event, bounds: BrowserBounds) => { controller()?.setBounds(bounds) })
  ipcMain.handle('browser:navigate', (_event, input: string) =>
    controller()?.navigate(input) ?? Promise.resolve(EMPTY_STATE))
  ipcMain.handle('browser:goBack', () => { controller()?.goBack() })
  ipcMain.handle('browser:goForward', () => { controller()?.goForward() })
  ipcMain.handle('browser:reload', () => { controller()?.reload() })
  ipcMain.handle('browser:openExternal', () => controller()?.openExternal())
}
