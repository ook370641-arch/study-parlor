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
      getSearchApiKey: vi.fn().mockResolvedValue(searchKey),
      setSearchApiKey: vi.fn().mockResolvedValue(undefined)
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

    expect(handleMock).toHaveBeenCalledTimes(3)
    expect(handleMock).toHaveBeenCalledWith('search:checkConfig', expect.any(Function))
    expect(handleMock).toHaveBeenCalledWith('search:prepare', expect.any(Function))
    expect(handleMock).toHaveBeenCalledWith('search:setApiKey', expect.any(Function))
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

  it('search:setApiKey saves the key', async () => {
    const { registerSearchIpc } = await importSearchIpc(true, 'key')
    registerSearchIpc({
      apiKey: 'sk-test',
      baseUrl: 'https://api.test.com',
      model: 'test-model',
      libraryPath: '/tmp/lib'
    })

    const setApiKeyHandler = handleMock.mock.calls.find(
      ([name]) => name === 'search:setApiKey'
    )[1]

    await expect(setApiKeyHandler(null, 'tvly-new-key')).resolves.toBeUndefined()
  })

  it('search:setApiKey rejects empty key', async () => {
    const { registerSearchIpc } = await importSearchIpc(true, 'key')
    registerSearchIpc({
      apiKey: 'sk-test',
      baseUrl: 'https://api.test.com',
      model: 'test-model',
      libraryPath: '/tmp/lib'
    })

    const setApiKeyHandler = handleMock.mock.calls.find(
      ([name]) => name === 'search:setApiKey'
    )[1]

    await expect(setApiKeyHandler(null, '')).rejects.toThrow('API key is required')
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

  it('search:prepare throws LLM_ERROR when topic is missing', async () => {
    const { registerSearchIpc } = await importSearchIpc(true, 'key')
    registerSearchIpc({
      apiKey: 'sk-test',
      baseUrl: 'https://api.test.com',
      model: 'test-model',
      libraryPath: '/tmp/lib'
    })

    const prepareHandler = handleMock.mock.calls.find(
      ([name]) => name === 'search:prepare'
    )[1]

    await expect(prepareHandler(null, {}))
      .rejects.toMatchObject({ code: 'LLM_ERROR', message: 'Topic is required' })
    await expect(prepareHandler(null, { topic: 123 }))
      .rejects.toMatchObject({ code: 'LLM_ERROR', message: 'Topic is required' })
    await expect(prepareHandler(null, { topic: '' }))
      .rejects.toMatchObject({ code: 'LLM_ERROR', message: 'Topic is required' })
  })

  it('search:prepare returns brief on success', async () => {
    const { registerSearchIpc } = await importSearchIpc(true, 'key')
    registerSearchIpc({
      apiKey: 'sk-test',
      baseUrl: 'https://api.test.com',
      model: 'test-model',
      libraryPath: '/tmp/lib'
    })

    const prepareHandler = handleMock.mock.calls.find(
      ([name]) => name === 'search:prepare'
    )[1]

    const result = await prepareHandler(null, { topic: 'test topic' })
    expect(result).toEqual({ summary: 's', sources: [] })
  })

  it('search:prepare throws NETWORK_ERROR when all searches fail', async () => {
    vi.doMock('electron', () => ({
      ipcMain: { handle: handleMock }
    }))
    vi.doMock('@electron/lib/credentials', () => ({
      hasSearchApiKey: vi.fn().mockResolvedValue(true),
      getSearchApiKey: vi.fn().mockResolvedValue('key')
    }))
    vi.doMock('@electron/lib/search', () => ({
      generateSearchQueries: vi.fn().mockResolvedValue(['q1', 'q2']),
      searchWeb: vi.fn().mockRejectedValue(new Error('network down')),
      generateTutorBrief: vi.fn()
    }))

    const { registerSearchIpc } = await import('@electron/ipc/search')
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
      .rejects.toMatchObject({ code: 'NETWORK_ERROR' })
  })

  it('search:prepare throws NO_RESULTS when search returns empty', async () => {
    const noResultsErr = new Error('NO_RESULTS') as Error & { code: string }
    noResultsErr.code = 'NO_RESULTS'

    vi.doMock('electron', () => ({
      ipcMain: { handle: handleMock }
    }))
    vi.doMock('@electron/lib/credentials', () => ({
      hasSearchApiKey: vi.fn().mockResolvedValue(true),
      getSearchApiKey: vi.fn().mockResolvedValue('key')
    }))
    vi.doMock('@electron/lib/search', () => ({
      generateSearchQueries: vi.fn().mockResolvedValue(['q1', 'q2']),
      searchWeb: vi.fn().mockRejectedValue(noResultsErr),
      generateTutorBrief: vi.fn()
    }))

    const { registerSearchIpc } = await import('@electron/ipc/search')
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
      .rejects.toMatchObject({ code: 'NO_RESULTS' })
  })
})
