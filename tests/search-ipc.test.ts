import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

describe('registerSearchIpc', () => {
  let handleMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    handleMock = vi.fn()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  async function importSearchIpc(hasKey: boolean, searchKey: string | null = null) {
    vi.doMock('electron', () => ({
      ipcMain: {
        handle: handleMock
      }
    }))

    vi.doMock('@electron/lib/credentials', () => ({
      hasSearchApiKey: vi.fn().mockResolvedValue(hasKey),
      getSearchApiKey: vi.fn().mockResolvedValue(searchKey)
    }))

    vi.doMock('@electron/lib/search', () => ({
      generateSearchQueries: vi.fn().mockResolvedValue(['q1', 'q2']),
      searchWeb: vi.fn().mockResolvedValue([{ title: 'T', url: 'https://t', content: 'c' }]),
      generateTutorBrief: vi.fn().mockResolvedValue({ summary: 's', sources: [] })
    }))

    return import('@electron/ipc/search')
  }

  it('registers search:checkConfig and search:prepare handlers', async () => {
    const { registerSearchIpc } = await importSearchIpc(true, 'key')
    registerSearchIpc({
      apiKey: 'sk-test',
      baseUrl: 'https://api.test.com',
      model: 'test-model',
      libraryPath: '/tmp/lib'
    })

    expect(handleMock).toHaveBeenCalledTimes(2)
    expect(handleMock).toHaveBeenCalledWith('search:checkConfig', expect.any(Function))
    expect(handleMock).toHaveBeenCalledWith('search:prepare', expect.any(Function))
  })

  it('search:checkConfig returns true when key exists', async () => {
    const { registerSearchIpc } = await importSearchIpc(true, 'key')
    registerSearchIpc({
      apiKey: 'sk-test',
      baseUrl: 'https://api.test.com',
      model: 'test-model',
      libraryPath: '/tmp/lib'
    })

    const checkConfigHandler = handleMock.mock.calls.find(
      ([name]) => name === 'search:checkConfig'
    )[1]

    const result = await checkConfigHandler()
    expect(result).toEqual({ configured: true })
  })

  it('search:checkConfig returns false when key is missing', async () => {
    const { registerSearchIpc } = await importSearchIpc(false)
    registerSearchIpc({
      apiKey: 'sk-test',
      baseUrl: 'https://api.test.com',
      model: 'test-model',
      libraryPath: '/tmp/lib'
    })

    const checkConfigHandler = handleMock.mock.calls.find(
      ([name]) => name === 'search:checkConfig'
    )[1]

    const result = await checkConfigHandler()
    expect(result).toEqual({ configured: false })
  })

  it('search:prepare throws MISSING_API_KEY when key is not configured', async () => {
    const { registerSearchIpc } = await importSearchIpc(false)
    registerSearchIpc({
      apiKey: 'sk-test',
      baseUrl: 'https://api.test.com',
      model: 'test-model',
      libraryPath: '/tmp/lib'
    })

    const prepareHandler = handleMock.mock.calls.find(
      ([name]) => name === 'search:prepare'
    )[1]

    await expect(prepareHandler(null, { topic: 'test' }))
      .rejects.toMatchObject({ code: 'MISSING_API_KEY' })
  })
})
