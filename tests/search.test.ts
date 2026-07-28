import { describe, it, expect, vi, afterEach } from 'vitest'
import {
  searchWeb,
  generateSearchQueries,
  generateTutorBrief,
  generateExploratoryQueries,
  identifySubDimensions,
  synthesizeResearchReport,
  generateTutorSupplement
} from '../electron/lib/search'

vi.stubGlobal('fetch', vi.fn())

const mockCfg = {
  apiKey: 'sk-test',
  baseUrl: 'https://api.test.com',
  model: 'test-model',
  libraryPath: '/tmp/lib'
}

describe('searchWeb', () => {
  it('returns results on success', async () => {
    const mockFetch = vi.mocked(fetch)
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        results: [
          { title: 'Test', url: 'https://example.com', content: 'snippet' }
        ]
      })
    } as Response)

    const results = await searchWeb({
      query: 'test',
      apiKey: 'key',
      maxResults: 3
    })

    expect(results).toHaveLength(1)
    expect(results[0].title).toBe('Test')
  })

  it('throws NO_RESULTS when empty', async () => {
    const mockFetch = vi.mocked(fetch)
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ results: [] })
    } as Response)

    await expect(searchWeb({ query: 'test', apiKey: 'key' }))
      .rejects.toThrow('NO_RESULTS')
  })

  it('throws TAVILY_ERROR on HTTP non-2xx', async () => {
    const mockFetch = vi.mocked(fetch)
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      text: async () => 'Internal Server Error'
    } as Response)

    await expect(searchWeb({ query: 'test', apiKey: 'key' }))
      .rejects.toMatchObject({ code: 'TAVILY_ERROR', message: /HTTP 500/ })
  })

  it('accepts external abort signal', async () => {
    const mockFetch = vi.fn(async (_url, init) => {
      await new Promise((_resolve, reject) => {
        init.signal?.addEventListener('abort', () => reject(new Error('AbortError')))
      })
      return { ok: true, json: async () => ({ results: [] }) }
    })
    vi.stubGlobal('fetch', mockFetch as any)

    const ctl = new AbortController()
    const promise = searchWeb({ query: 'test', apiKey: 'key', signal: ctl.signal })
    ctl.abort()

    await expect(promise).rejects.toThrow('AbortError')
  })
})

describe('generateSearchQueries', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('returns parsed array on success', async () => {
    const mockFetch = vi.mocked(fetch)
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: '```json\n["query1", "query2", "query3"]\n```' } }]
      })
    } as Response)

    const queries = await generateSearchQueries(mockCfg, '量子力学')

    expect(queries).toEqual(['query1', 'query2', 'query3'])
    const lastCall = mockFetch.mock.calls[mockFetch.mock.calls.length - 1]
    const body = JSON.parse((lastCall[1] as RequestInit).body as string)
    expect(body.temperature).toBe(0.3)
    expect(body.messages[0].content).toContain('量子力学')
  })

  it('throws on non-string array items', async () => {
    const mockFetch = vi.mocked(fetch)
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: '```json\n[1, 2, 3]\n```' } }]
      })
    } as Response)

    await expect(generateSearchQueries(mockCfg, 'test'))
      .rejects.toThrow('No valid search queries generated')
  })

  it('throws when extracted JSON is not an array', async () => {
    const extractJsonModule = await import('@electron/lib/extract-json')
    vi.spyOn(extractJsonModule, 'extractJsonArray').mockReturnValue('{"query": "test"}')

    const mockFetch = vi.mocked(fetch)
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: 'not important' } }]
      })
    } as Response)

    await expect(generateSearchQueries(mockCfg, 'test'))
      .rejects.toThrow('not an array')
  })
})

describe('generateTutorBrief', () => {
  it('returns summary and sources on success', async () => {
    const mockFetch = vi.mocked(fetch)
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: '  This is a tutor brief.  ' } }]
      })
    } as Response)

    const results = [
      { title: 'Title A', url: 'https://a.com', content: 'Content A' },
      { title: 'Title B', url: 'https://b.com', content: 'Content B' }
    ]

    const brief = await generateTutorBrief(mockCfg, '相对论', results)

    expect(brief.summary).toBe('This is a tutor brief.')
    expect(brief.sources).toHaveLength(2)
    expect(brief.sources[0]).toEqual({
      title: 'Title A',
      url: 'https://a.com',
      snippet: 'Content A'.slice(0, 200)
    })
    const lastCall = mockFetch.mock.calls[mockFetch.mock.calls.length - 1]
    const body = JSON.parse((lastCall[1] as RequestInit).body as string)
    expect(body.temperature).toBe(0.3)
    expect(body.messages[0].content).toContain('[1]')
    expect(body.messages[0].content).toContain('https://a.com')
  })
})

describe('generateExploratoryQueries', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('returns parsed array on success', async () => {
    const mockFetch = vi.mocked(fetch)
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: '```json\n["角度A", "角度B"]\n```' } }]
      })
    } as Response)

    const queries = await generateExploratoryQueries(mockCfg, 'test topic')
    expect(queries).toEqual(['角度A', '角度B'])
  })

  it('throws on non-array output', async () => {
    const extractJsonModule = await import('@electron/lib/extract-json')
    vi.spyOn(extractJsonModule, 'extractJsonArray').mockReturnValue('{"key": "value"}')

    const mockFetch = vi.mocked(fetch)
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: 'not important' } }]
      })
    } as Response)

    await expect(generateExploratoryQueries(mockCfg, 'test'))
      .rejects.toThrow('not an array')
  })

  it('throws on all non-string items', async () => {
    const mockFetch = vi.mocked(fetch)
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: '```json\n[1, 2, 3]\n```' } }]
      })
    } as Response)

    await expect(generateExploratoryQueries(mockCfg, 'test'))
      .rejects.toThrow('No valid search queries generated')
  })
})

describe('identifySubDimensions', () => {
  const sampleResults = [
    { title: 'T1', url: 'https://a.com', content: 'Content about A' },
    { title: 'T2', url: 'https://b.com', content: 'Content about B' },
  ]

  it('returns parsed array on success', async () => {
    const mockFetch = vi.mocked(fetch)
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: '["维度1搜索词", "维度2搜索词"]' } }]
      })
    } as Response)

    const queries = await identifySubDimensions(mockCfg, 'topic', sampleResults)
    expect(queries).toEqual(['维度1搜索词', '维度2搜索词'])
    // Verify round 1 results are passed in the prompt
    const lastCall = mockFetch.mock.calls[mockFetch.mock.calls.length - 1]
    const body = JSON.parse((lastCall[1] as RequestInit).body as string)
    expect(body.messages[0].content).toContain('[R1-1]')
    expect(body.messages[0].content).toContain('https://a.com')
  })

  it('throws on JSON extraction failure', async () => {
    const mockFetch = vi.mocked(fetch)
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: 'sorry I cannot do that' } }]
      })
    } as Response)

    await expect(identifySubDimensions(mockCfg, 'topic', sampleResults))
      .rejects.toThrow('JSON extraction failed')
  })
})

describe('synthesizeResearchReport', () => {
  const sampleResults = [
    { title: 'T1', url: 'https://a.com', content: 'Content' },
  ]

  it('returns markdown report on success', async () => {
    const mockFetch = vi.mocked(fetch)
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: '  # Research Report\n\nContent here.  ' } }]
      })
    } as Response)

    const report = await synthesizeResearchReport(mockCfg, 'topic', sampleResults, [])
    expect(report).toBe('# Research Report\n\nContent here.')
    // Verify request body includes topic and temperature
    const lastCall = mockFetch.mock.calls[mockFetch.mock.calls.length - 1]
    const body = JSON.parse((lastCall[1] as RequestInit).body as string)
    expect(body.temperature).toBe(0.5)
    expect(body.messages[0].content).toContain('topic')
  })

  it('handles empty round 2 results', async () => {
    const mockFetch = vi.mocked(fetch)
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: '# Report' } }]
      })
    } as Response)

    const report = await synthesizeResearchReport(mockCfg, 'topic', sampleResults, [])
    expect(report).toBe('# Report')
  })
})

describe('generateTutorSupplement', () => {
  it('returns tutorNotes and questions when both sections present', async () => {
    const mockFetch = vi.mocked(fetch)
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: '### 导师备课笔记\n\nSome notes here.\n\n---\n\n### 提问方向\n\nQuestions here.' } }]
      })
    } as Response)

    const result = await generateTutorSupplement(mockCfg, 'topic', '# Report content')
    expect(result.tutorNotes).toContain('Some notes here')
    expect(result.questions).toContain('Questions here')
  })

  it('falls back to tutorNotes only when no separator found', async () => {
    const mockFetch = vi.mocked(fetch)
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: 'Just some notes without separator.' } }]
      })
    } as Response)

    const result = await generateTutorSupplement(mockCfg, 'topic', '# Report')
    expect(result.tutorNotes).toBe('Just some notes without separator.')
    expect(result.questions).toBe('')
  })
})

function mockFetchOk() {
  return vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ results: [{ title: 't', url: 'https://a.com', content: 'c' }] }),
  })
}

describe('searchWeb options', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.stubGlobal('fetch', vi.fn())
  })

  it('includes days and include_domains in request body when provided', async () => {
    const fetchMock = mockFetchOk()
    vi.stubGlobal('fetch', fetchMock)
    await searchWeb({ query: 'q', apiKey: 'k', days: 7, includeDomains: ['nowcoder.com'] })
    const body = JSON.parse(fetchMock.mock.calls[0][1].body)
    expect(body.days).toBe(7)
    expect(body.include_domains).toEqual(['nowcoder.com'])
  })

  it('omits days/include_domains when not provided', async () => {
    const fetchMock = mockFetchOk()
    vi.stubGlobal('fetch', fetchMock)
    await searchWeb({ query: 'q', apiKey: 'k' })
    const body = JSON.parse(fetchMock.mock.calls[0][1].body)
    expect('days' in body).toBe(false)
    expect('include_domains' in body).toBe(false)
  })

  it('omits include_domains for empty array', async () => {
    const fetchMock = mockFetchOk()
    vi.stubGlobal('fetch', fetchMock)
    await searchWeb({ query: 'q', apiKey: 'k', includeDomains: [] })
    const body = JSON.parse(fetchMock.mock.calls[0][1].body)
    expect('include_domains' in body).toBe(false)
  })
})
