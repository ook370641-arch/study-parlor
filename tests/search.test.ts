import { describe, it, expect, vi } from 'vitest'
import { searchWeb, generateSearchQueries, generateTutorBrief } from '../electron/lib/search'

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
      .rejects.toMatchObject({ code: 'TAVILY_ERROR' })
  })
})

describe('generateSearchQueries', () => {
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
