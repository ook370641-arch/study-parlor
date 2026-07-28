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
      generateExploratoryQueries: vi.fn().mockResolvedValue(['q1', 'q2']),
      searchWeb: vi.fn().mockResolvedValue([{ title: 'T', url: 'https://t', content: 'c' }]),
      identifySubDimensions: vi.fn().mockResolvedValue(['dq1']),
      synthesizeResearchReport: vi.fn().mockResolvedValue('# Research Report\n\nTest content.'),
      generateTutorSupplement: vi.fn().mockResolvedValue({ tutorNotes: 'Tutor notes', questions: 'Questions' })
    }))

    return import('@electron/ipc/search')
  }

  it('registers search:checkConfig, search:setApiKey and search:prepare handlers', async () => {
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

  it('search:prepare returns report + supplement on success (two-round pipeline)', async () => {
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
    expect(result.summary).toContain('# Research Report')
    expect(result.summary).toContain('## 导师备课笔记')
    expect(result.summary).toContain('Tutor notes')
    expect(result.summary).toContain('## 苏格拉底提问方向')
    expect(result.summary).toContain('Questions')
    // Sources aggregated from both search rounds (r1: 2 queries × 1 result, r2: 1 query × 1 result = 3)
    expect(result.sources).toHaveLength(3)
    expect(result.sources[0]).toEqual({
      title: 'T',
      url: 'https://t',
      snippet: 'c'
    })
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
      generateExploratoryQueries: vi.fn().mockResolvedValue(['q1', 'q2']),
      searchWeb: vi.fn().mockRejectedValue(new Error('network down')),
      identifySubDimensions: vi.fn(),
      synthesizeResearchReport: vi.fn(),
      generateTutorSupplement: vi.fn()
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
      generateExploratoryQueries: vi.fn().mockResolvedValue(['q1', 'q2']),
      searchWeb: vi.fn().mockRejectedValue(noResultsErr),
      identifySubDimensions: vi.fn(),
      synthesizeResearchReport: vi.fn(),
      generateTutorSupplement: vi.fn()
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

  it('search:prepare keeps partial results when some queries get no results', async () => {
    // searchWebWithRetry catches individual NO_RESULTS and returns [], so
    // a mix of NO_RESULTS + success still produces results from the successful queries.
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
      generateExploratoryQueries: vi.fn().mockResolvedValue(['q1', 'q2']),
      // Round 1: q1 throws NO_RESULTS → caught → [], q2 succeeds
      // After round 1 success, round 2 runs with dimQueries from identifySubDimensions
      searchWeb: vi.fn()
        .mockRejectedValueOnce(noResultsErr)
        .mockResolvedValueOnce([{ title: 'Partial', url: 'https://p', content: 'c' }])
        // Round 2 (dq1): more calls
        .mockResolvedValue([{ title: 'Deep', url: 'https://d', content: 'dc' }]),
      identifySubDimensions: vi.fn().mockResolvedValue(['dq1']),
      synthesizeResearchReport: vi.fn().mockResolvedValue('# Report from partial results'),
      generateTutorSupplement: vi.fn().mockResolvedValue({ tutorNotes: 'Notes', questions: 'Qs' })
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

    const result = await prepareHandler(null, { topic: 'test' })
    expect(result.summary).toContain('# Report from partial results')
    // Sources: r1 has 1 success + r2 has 1 per query (dq1 × 1 result)
    expect(result.sources.length).toBeGreaterThanOrEqual(1)
  })

  it('search:prepare keeps partial results when some queries hit network errors', async () => {
    const networkErr = new Error('connection refused') as Error & { code: string }
    networkErr.code = 'TAVILY_ERROR'

    vi.doMock('electron', () => ({
      ipcMain: { handle: handleMock }
    }))
    vi.doMock('@electron/lib/credentials', () => ({
      hasSearchApiKey: vi.fn().mockResolvedValue(true),
      getSearchApiKey: vi.fn().mockResolvedValue('key')
    }))
    vi.doMock('@electron/lib/search', () => ({
      generateExploratoryQueries: vi.fn().mockResolvedValue(['q1', 'q2', 'q3']),
      // Round 1: q1 fails with network error, q2 succeeds, q3 fails with network error
      // searchWebWithRetry retries once (2 attempts total), so twice as many calls
      searchWeb: vi.fn()
        // Attempt 1
        .mockRejectedValueOnce(networkErr)
        .mockResolvedValueOnce([{ title: 'Partial', url: 'https://p', content: 'c' }])
        .mockRejectedValueOnce(networkErr)
        // Attempt 2 (retry for failed queries — actually retries all queries as a batch)
        .mockRejectedValueOnce(networkErr)
        .mockResolvedValueOnce([{ title: 'Partial', url: 'https://p', content: 'c' }])
        .mockRejectedValueOnce(networkErr)
        // Round 2 results
        .mockResolvedValue([{ title: 'Deep', url: 'https://d', content: 'dc' }]),
      identifySubDimensions: vi.fn().mockResolvedValue(['dq1']),
      synthesizeResearchReport: vi.fn().mockResolvedValue('# Report from partial results'),
      generateTutorSupplement: vi.fn().mockResolvedValue({ tutorNotes: 'Notes', questions: 'Qs' })
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

    const result = await prepareHandler(null, { topic: 'test' })
    expect(result.summary).toContain('# Report from partial results')
    expect(result.sources.length).toBeGreaterThanOrEqual(1)
  })

  it('search:prepare skips round 2 when identifySubDimensions throws (degradation path)', async () => {
    vi.doMock('electron', () => ({
      ipcMain: { handle: handleMock }
    }))
    vi.doMock('@electron/lib/credentials', () => ({
      hasSearchApiKey: vi.fn().mockResolvedValue(true),
      getSearchApiKey: vi.fn().mockResolvedValue('key')
    }))
    // Track whether round 2 search was attempted
    let round2Attempted = false
    vi.doMock('@electron/lib/search', () => ({
      generateExploratoryQueries: vi.fn().mockResolvedValue(['q1', 'q2']),
      searchWeb: vi.fn().mockImplementation((opts: { query: string }) => {
        if (opts.query === 'dq1') round2Attempted = true
        return Promise.resolve([{ title: 'R', url: 'https://r', content: 'c' }])
      }),
      identifySubDimensions: vi.fn().mockRejectedValue(new Error('LLM call failed')),
      synthesizeResearchReport: vi.fn().mockResolvedValue('# Round-1-only report'),
      generateTutorSupplement: vi.fn().mockResolvedValue({ tutorNotes: 'Notes', questions: 'Qs' })
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

    const result = await prepareHandler(null, { topic: 'test' })
    // Pipeline should still produce results (degradation, not failure)
    expect(result.summary).toContain('# Round-1-only report')
    expect(result.sources.length).toBeGreaterThanOrEqual(1)
    // Round 2 should NOT have been attempted (dimQueries was empty due to error)
    expect(round2Attempted).toBe(false)
  })

  it('search:prepare returns report-only summary when generateTutorSupplement throws', async () => {
    vi.doMock('electron', () => ({
      ipcMain: { handle: handleMock }
    }))
    vi.doMock('@electron/lib/credentials', () => ({
      hasSearchApiKey: vi.fn().mockResolvedValue(true),
      getSearchApiKey: vi.fn().mockResolvedValue('key')
    }))
    vi.doMock('@electron/lib/search', () => ({
      generateExploratoryQueries: vi.fn().mockResolvedValue(['q1']),
      searchWeb: vi.fn().mockResolvedValue([{ title: 'R', url: 'https://r', content: 'c' }]),
      identifySubDimensions: vi.fn().mockResolvedValue(['dq1']),
      synthesizeResearchReport: vi.fn().mockResolvedValue('# Standalone report'),
      generateTutorSupplement: vi.fn().mockRejectedValue(new Error('Supplement generation failed'))
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

    const result = await prepareHandler(null, { topic: 'test' })
    // Should return the report as-is, without tutor notes or questions sections
    expect(result.summary).toBe('# Standalone report')
    expect(result.summary).not.toContain('## 导师备课笔记')
    expect(result.summary).not.toContain('## 苏格拉底提问方向')
    // Sources still populated from both rounds
    expect(result.sources.length).toBeGreaterThanOrEqual(1)
  })
})
