import { describe, it, expect, vi } from 'vitest'
import { searchWeb, generateSearchQueries, generateTutorBrief } from '../electron/lib/search'

vi.stubGlobal('fetch', vi.fn())

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
})

describe('generateSearchQueries', () => {
  it('placeholder', () => {
    expect(true).toBe(true)
  })
})

describe('generateTutorBrief', () => {
  it('placeholder', () => {
    expect(true).toBe(true)
  })
})
