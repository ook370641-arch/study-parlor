import { WebContentsView, session, shell } from 'electron'
import type { BrowserWindow } from 'electron'
import type { BrowserBounds, BrowserViewState } from '@shared/index'
import { browserTargetForInput, isAllowedBrowserUrl } from './browser-url'

export type BrowserController = {
  show: (bounds: BrowserBounds, restoreUrl?: string | null) => Promise<BrowserViewState>
  hide: () => void
  setBounds: (bounds: BrowserBounds) => void
  navigate: (input: string) => Promise<BrowserViewState>
  goBack: () => void
  goForward: () => void
  reload: () => void
  openExternal: () => Promise<void>
  getState: () => BrowserViewState
}

const controllers = new WeakMap<BrowserWindow, BrowserController>()

function createBrowserController(window: BrowserWindow): BrowserController {
  let view: WebContentsView | null = null
  let attached = false
  let error: string | null = null

  const alive = () => !window.isDestroyed() && !!view && !view.webContents.isDestroyed()

  const send = (channel: string, payload: unknown) => {
    if (!window.isDestroyed() && !window.webContents.isDestroyed()) {
      window.webContents.send(channel, payload)
    }
  }

  const getState = (): BrowserViewState => {
    if (!alive()) {
      return { url: '', title: '', loading: false, canGoBack: false, canGoForward: false, error }
    }
    const contents = view!.webContents
    return {
      url: contents.getURL(),
      title: contents.getTitle(),
      loading: contents.isLoading(),
      canGoBack: contents.canGoBack(),
      canGoForward: contents.canGoForward(),
      error,
    }
  }

  const emitState = () => send('browser:state', getState())

  const applyBounds = (bounds: BrowserBounds) => {
    if (!view || window.isDestroyed()) return
    view.setBounds({
      x: Math.round(Number.isFinite(bounds.x) ? bounds.x : 0),
      y: Math.round(Number.isFinite(bounds.y) ? bounds.y : 0),
      width: Math.max(1, Math.round(Number.isFinite(bounds.width) ? bounds.width : 1)),
      height: Math.max(1, Math.round(Number.isFinite(bounds.height) ? bounds.height : 1)),
    })
  }

  const load = async (url: string): Promise<BrowserViewState> => {
    const current = ensure()
    error = null
    try {
      await current.webContents.loadURL(url)
    } catch (cause) {
      if (!(cause instanceof Error) || !cause.message.includes('ERR_ABORTED')) {
        error = '网页加载失败，请检查网址或网络'
      }
    }
    emitState()
    return getState()
  }

  function ensure(): WebContentsView {
    if (view && !view.webContents.isDestroyed()) return view
    const browserSession = session.fromPartition('persist:study-parlor-browser')
    browserSession.setPermissionRequestHandler((_webContents, _permission, callback) => callback(false))
    browserSession.setPermissionCheckHandler(() => false)
    view = new WebContentsView({
      webPreferences: {
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false,
        session: browserSession,
      },
    })
    const contents = view.webContents
    contents.setWindowOpenHandler(({ url }) => {
      if (isAllowedBrowserUrl(url)) void load(url)
      return { action: 'deny' }
    })
    contents.on('will-navigate', (event, url) => {
      if (!isAllowedBrowserUrl(url)) event.preventDefault()
    })
    contents.on('will-redirect', (event, url) => {
      if (!isAllowedBrowserUrl(url)) event.preventDefault()
    })
    contents.on('did-start-loading', () => {
      error = null
      emitState()
    })
    contents.on('did-stop-loading', emitState)
    contents.on('did-navigate', emitState)
    contents.on('did-navigate-in-page', emitState)
    contents.on('page-title-updated', emitState)
    contents.on('did-fail-load', (_event, errorCode, _description, _validatedUrl, isMainFrame) => {
      if (!isMainFrame || errorCode === -3) return
      error = '网页加载失败，请检查网址或网络'
      emitState()
    })
    window.once('closed', () => {
      attached = false
      view = null
      controllers.delete(window)
    })
    return view
  }

  return {
    show: async (bounds, restoreUrl) => {
      const current = ensure()
      applyBounds(bounds)
      if (!attached) {
        window.contentView.addChildView(current)
        attached = true
      }
      if (!current.webContents.getURL() && restoreUrl && isAllowedBrowserUrl(restoreUrl)) {
        await load(restoreUrl)
      }
      emitState()
      return getState()
    },
    hide: () => {
      if (view && attached && !window.isDestroyed()) {
        window.contentView.removeChildView(view)
      }
      attached = false
    },
    setBounds: applyBounds,
    navigate: (input) => {
      const target = browserTargetForInput(input)
      return target ? load(target) : Promise.resolve(getState())
    },
    goBack: () => {
      if (alive() && view!.webContents.canGoBack()) view!.webContents.goBack()
    },
    goForward: () => {
      if (alive() && view!.webContents.canGoForward()) view!.webContents.goForward()
    },
    reload: () => {
      if (alive()) view!.webContents.reload()
    },
    openExternal: async () => {
      if (alive() && isAllowedBrowserUrl(view!.webContents.getURL())) {
        await shell.openExternal(view!.webContents.getURL())
      }
    },
    getState,
  }
}

export function browserControllerFor(window: BrowserWindow): BrowserController {
  const existing = controllers.get(window)
  if (existing) return existing
  const created = createBrowserController(window)
  controllers.set(window, created)
  return created
}
