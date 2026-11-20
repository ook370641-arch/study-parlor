import { EventEmitter } from 'node:events'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { WebContentsView } from 'electron'
import type { BrowserWindow } from 'electron'
import { browserControllerFor } from '../electron/lib/browser-view'

vi.mock('electron', () => ({
  WebContentsView: vi.fn(),
  session: {
    fromPartition: vi.fn(() => ({
      setPermissionRequestHandler: vi.fn(),
      setPermissionCheckHandler: vi.fn(),
      cookies: { flushStore: vi.fn() },
    })),
  },
  shell: { openExternal: vi.fn() },
}))

vi.mock('../electron/ipc/state', () => ({ patchState: vi.fn() }))

describe('embedded browser focus restoration', () => {
  let window: EventEmitter & Record<string, any>
  let contents: EventEmitter & Record<string, any>

  beforeEach(async () => {
    contents = new EventEmitter() as EventEmitter & Record<string, any>
    Object.assign(contents, {
      isDestroyed: vi.fn(() => false),
      isFocused: vi.fn(() => false),
      focus: vi.fn(),
      getURL: vi.fn(() => 'https://example.com'),
      getTitle: vi.fn(() => 'Example'),
      isLoading: vi.fn(() => false),
      canGoBack: vi.fn(() => false),
      canGoForward: vi.fn(() => false),
      setWindowOpenHandler: vi.fn(),
      executeJavaScript: vi.fn(async () => undefined),
      session: { cookies: { flushStore: vi.fn() } },
    })
    const view = {
      webContents: contents,
      setBounds: vi.fn(),
      setVisible: vi.fn(),
    }
    vi.mocked(WebContentsView).mockImplementation(() => view as any)

    window = new EventEmitter() as EventEmitter & Record<string, any>
    Object.assign(window, {
      isDestroyed: vi.fn(() => false),
      webContents: { isDestroyed: vi.fn(() => false), send: vi.fn() },
      contentView: { addChildView: vi.fn(), removeChildView: vi.fn() },
    })

    const controller = browserControllerFor(window as unknown as BrowserWindow)
    await controller.show({ x: 0, y: 0, width: 800, height: 600 })
  })

  it('restores webpage focus when the app regains focus', () => {
    contents.isFocused.mockReturnValue(true)
    window.emit('blur')
    contents.isFocused.mockReturnValue(false)

    window.emit('focus')

    expect(contents.focus).toHaveBeenCalledTimes(1)
    window.emit('focus')
    expect(contents.focus).toHaveBeenCalledTimes(1)
  })

  it('does not steal focus when the toolbar was focused before the app lost focus', () => {
    contents.isFocused.mockReturnValue(false)
    window.emit('blur')

    window.emit('focus')

    expect(contents.focus).not.toHaveBeenCalled()
  })
})
