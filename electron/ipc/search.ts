import { ipcMain } from 'electron'
import type { AppConfig } from '../env'
import { getSearchApiKey, hasSearchApiKey } from '../lib/credentials'
import { generateSearchQueries, searchWeb, generateTutorBrief } from '../lib/search'
import type { SearchErrorCode } from '@shared/index'

export function registerSearchIpc(cfg: AppConfig) {
  ipcMain.handle('search:checkConfig', async () => {
    const configured = await hasSearchApiKey()
    return { configured }
  })

  ipcMain.handle('search:prepare', async (_, args: { topic: string }) => {
    const apiKey = await getSearchApiKey()
    if (!apiKey) {
      const err = new Error('Search API key not configured') as Error & { code: SearchErrorCode }
      err.code = 'MISSING_API_KEY'
      throw err
    }

    // Step 1: Generate search queries via LLM
    let queries: string[]
    try {
      queries = await generateSearchQueries(cfg, args.topic)
    } catch (err: any) {
      const wrapped = new Error(err?.message ?? 'Failed to generate search queries') as Error & { code: SearchErrorCode }
      wrapped.code = 'LLM_ERROR'
      throw wrapped
    }

    // Step 2: Search web with 1 retry
    let results: Awaited<ReturnType<typeof searchWeb>>
    try {
      results = await searchWebWithRetry({ queries, apiKey })
    } catch (err: any) {
      const code: SearchErrorCode = err?.code === 'NO_RESULTS' ? 'NO_RESULTS' : 'NETWORK_ERROR'
      const wrapped = new Error(err?.message ?? 'Search failed') as Error & { code: SearchErrorCode }
      wrapped.code = code
      throw wrapped
    }

    // Step 3: Generate tutor brief
    try {
      const brief = await generateTutorBrief(cfg, args.topic, results)
      return brief
    } catch (err: any) {
      const wrapped = new Error(err?.message ?? 'Failed to generate tutor brief') as Error & { code: SearchErrorCode }
      wrapped.code = 'LLM_ERROR'
      throw wrapped
    }
  })
}

async function searchWebWithRetry(opts: { queries: string[]; apiKey: string }): Promise<ReturnType<typeof searchWeb>> {
  const lastError: Error & { code?: string } = new Error('All queries failed') as Error & { code?: string }

  for (const query of opts.queries) {
    try {
      return await searchWeb({ query, apiKey: opts.apiKey, maxResults: 5 })
    } catch (err: any) {
      lastError.message = err?.message ?? 'Unknown search error'
      lastError.code = err?.code
      // Continue to next query
    }
  }

  // If all queries failed, retry once with the first query
  if (opts.queries.length > 0) {
    try {
      return await searchWeb({ query: opts.queries[0], apiKey: opts.apiKey, maxResults: 5 })
    } catch (err: any) {
      lastError.message = err?.message ?? 'Unknown search error'
      lastError.code = err?.code
    }
  }

  throw lastError
}
