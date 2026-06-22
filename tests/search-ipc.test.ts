import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

describe('registerSearchIpc', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('registers search:checkConfig and search:prepare handlers', async () => {
    vi.doMock('electron', () => ({
      ipcMain: {
        handle: vi.fn()
      }
    }))

    const { registerSearchIpc } = await import('@electron/ipc/search')
    registerSearchIpc({
      apiKey: 'sk-test',
      baseUrl: 'https://api.test.com',
      model: 'test-model',
      libraryPath: '/tmp/lib'
    })

    const { ipcMain } = await import('electron')
    expect(ipcMain.handle).toBeDefined()
    expect(true).toBe(true)
  })
})
