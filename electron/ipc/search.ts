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
  let allResults: Awaited<ReturnType<typeof searchWeb>> = []
  let lastError: unknown

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const results = await Promise.all(
        opts.queries.map(q => searchWeb({ query: q, apiKey: opts.apiKey, maxResults: 5 }))
      )
      allResults = results.flat()
      break
    } catch (e) {
      lastError = e
      if (attempt === 0) continue
    }
  }

  if (allResults.length === 0) {
    const message = lastError instanceof Error ? lastError.message : 'Unknown error'
    const err = new Error(message) as Error & { code: SearchErrorCode }
    err.code = message === 'NO_RESULTS' ? 'NO_RESULTS' : 'NETWORK_ERROR'
    throw err
  }

  return allResults
}
