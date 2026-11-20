import { WebContentsView, session, shell } from 'electron'
import type { BrowserWindow } from 'electron'
import type { BrowserBounds, BrowserFindResult, BrowserViewState } from '@shared/index'
import { browserTargetForInput, isAllowedBrowserUrl } from './browser-url'
import { patchState } from '../ipc/state'

export type BrowserController = {
  show: (bounds: BrowserBounds, restoreUrl?: string | null) => Promise<BrowserViewState>
  hide: () => void
  setBounds: (bounds: BrowserBounds) => void
  navigate: (input: string) => Promise<BrowserViewState>
  goBack: () => void
  goForward: () => void
  reload: () => void
  openExternal: () => Promise<void>
  find: (text: string, forward: boolean, findNext: boolean) => void
  stopFind: () => void
  getState: () => BrowserViewState
}

const controllers = new WeakMap<BrowserWindow, BrowserController>()

function createBrowserController(window: BrowserWindow): BrowserController {
  let view: WebContentsView | null = null
  let attached = false
  let error: string | null = null
  let findText = ''
  let findIndex = 0
  let findRequest = 0
  let restoreBrowserFocus = false

  const alive = () => !window.isDestroyed() && !!view && !view.webContents.isDestroyed()

  window.on('blur', () => {
    restoreBrowserFocus = attached && alive() && view!.webContents.isFocused()
  })
  window.on('focus', () => {
    const shouldRestore = restoreBrowserFocus && attached && alive()
    restoreBrowserFocus = false
    if (shouldRestore) view!.webContents.focus()
  })

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

  const persistLastUrl = () => {
    const url = alive() ? view!.webContents.getURL() : ''
    if (isAllowedBrowserUrl(url)) patchState({ browserLastUrl: url })
  }

  const stopFind = () => {
    findRequest += 1
    findText = ''
    findIndex = 0
    if (alive()) {
      void view!.webContents.executeJavaScript('window.getSelection()?.removeAllRanges()').catch(() => {})
    }
    send('browser:findResult', { activeMatchOrdinal: 0, matches: 0 })
  }

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
      stopFind()
      emitState()
    })
    contents.on('did-stop-loading', () => {
      void contents.session.cookies.flushStore()
      emitState()
    })
    contents.on('did-navigate', () => {
      persistLastUrl()
      emitState()
    })
    contents.on('did-navigate-in-page', () => {
      persistLastUrl()
      emitState()
    })
    contents.on('page-title-updated', emitState)
    contents.on('did-fail-load', (_event, errorCode, _description, _validatedUrl, isMainFrame) => {
      if (!isMainFrame || errorCode === -3) return
      error = '网页加载失败，请检查网址或网络'
      emitState()
    })
    contents.on('before-input-event', (event, input) => {
      if (input.type !== 'keyDown') return
      if (input.control && input.key.toLowerCase() === 'f') {
        event.preventDefault()
        send('browser:shortcut', 'find')
      } else if (input.key === 'Escape') {
        send('browser:shortcut', 'closeFind')
      }
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
      current.setVisible(true)
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
      view?.setVisible(false)
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
    find: (text, forward, findNext) => {
      if (!alive()) return
      if (!text) {
        stopFind()
        return
      }
      const request = ++findRequest
      const continuing = findNext && text === findText
      findText = text
      const script = `(() => {
        const query = ${JSON.stringify(text)}
        const matches = []
        const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
        let node
        while ((node = walker.nextNode())) {
          if (!node.nodeValue || node.parentElement?.closest('script,style,noscript')) continue
          const value = node.nodeValue.toLocaleLowerCase()
          const normalizedQuery = query.toLocaleLowerCase()
          let from = 0
          let at
          while ((at = value.indexOf(normalizedQuery, from)) !== -1) {
            matches.push({ node, start: at, end: at + query.length })
            from = at + query.length
          }
        }
        if (!matches.length) return { activeMatchOrdinal: 0, matches: 0 }
        const index = ${continuing}
          ? (${findIndex} + ${forward ? 1 : -1} + matches.length) % matches.length
          : 0
        const match = matches[index]
        const range = document.createRange()
        range.setStart(match.node, match.start)
        range.setEnd(match.node, match.end)
        const selection = window.getSelection()
        selection?.removeAllRanges()
        selection?.addRange(range)
        match.node.parentElement?.scrollIntoView({ block: 'center' })
        return { activeMatchOrdinal: index + 1, matches: matches.length }
      })()`
      void view!.webContents.executeJavaScript(script).then((result: BrowserFindResult) => {
        if (request !== findRequest) return
        findIndex = Math.max(0, result.activeMatchOrdinal - 1)
        send('browser:findResult', result)
      }).catch(() => {
        if (request === findRequest) send('browser:findResult', { activeMatchOrdinal: 0, matches: 0 })
      })
    },
    stopFind,
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
