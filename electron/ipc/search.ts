import { ipcMain } from 'electron'
import type { AppConfig } from '../env'
import { getSearchApiKey, hasSearchApiKey, setSearchApiKey } from '../lib/credentials'
import { generateSearchQueries, searchWeb, generateTutorBrief } from '../lib/search'
import type { SearchErrorCode } from '@shared/index'

export function registerSearchIpc(cfg: AppConfig) {
  ipcMain.handle('search:checkConfig', async () => {
    const configured = await hasSearchApiKey()
    return { configured }
  })

  ipcMain.handle('search:setApiKey', async (_, key: string) => {
    if (!key || typeof key !== 'string') throw new Error('API key is required')
    await setSearchApiKey(key)
  })

  ipcMain.handle('search:prepare', async (_, args: { topic: string }) => {
    const rawTopic = args?.topic
    if (typeof rawTopic !== 'string' || !rawTopic.trim()) {
      const err = new Error('Topic is required') as Error & { code: SearchErrorCode }
      err.code = 'LLM_ERROR'
      throw err
    }
    const topic = rawTopic.trim()

    const apiKey = await getSearchApiKey()
    if (!apiKey) {
      const err = new Error('Search API key not configured') as Error & { code: SearchErrorCode }
      err.code = 'MISSING_API_KEY'
      throw err
    }

    // Step 1: Generate search queries via LLM
    let queries: string[]
    try {
      queries = await generateSearchQueries(cfg, topic)
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
      const brief = await generateTutorBrief(cfg, topic, results)
      return brief
    } catch (err: any) {
      const wrapped = new Error(err?.message ?? 'Failed to generate tutor brief') as Error & { code: SearchErrorCode }
      wrapped.code = 'LLM_ERROR'
      throw wrapped
    }
  })
}

async function searchWebWithRetry(opts: { queries: string[]; apiKey: string }): Promise<ReturnType<typeof searchWeb>> {
  let lastError: unknown

  for (let attempt = 0; attempt < 2; attempt++) {
    const settled = (await Promise.allSettled(
      opts.queries.map(q =>
        searchWeb({ query: q, apiKey: opts.apiKey, maxResults: 5 }).catch(e => {
          // 单个查询无结果不应导致整批失败；其他查询的结果仍可保留
          if ((e as Error & { code?: string })?.code === 'NO_RESULTS') return []
          throw e
        })
      )
    )) as PromiseSettledResult<Awaited<ReturnType<typeof searchWeb>>>[]

    const successes = settled
      .filter((r): r is PromiseFulfilledResult<Awaited<ReturnType<typeof searchWeb>>> => r.status === 'fulfilled')
      .map(r => r.value)
    const allResults = successes.flat()
    if (allResults.length > 0) return allResults

    // 所有查询都返回空结果（包括显式 NO_RESULTS 或成功但空）
    const allEmpty = successes.length === settled.length
    if (allEmpty) {
      const noResultsErr = new Error('NO_RESULTS') as Error & { code: SearchErrorCode }
      noResultsErr.code = 'NO_RESULTS'
      throw noResultsErr
    }

    // 部分查询因网络错误失败：记录错误，若还有重试机会则整批重试
    const firstRejection = settled.find((r): r is PromiseRejectedResult => r.status === 'rejected')
    if (firstRejection) {
      lastError = firstRejection.reason
      if (attempt === 0) continue
    }
    break
  }

  if (lastError instanceof Error) {
    const code = (lastError as Error & { code?: string })?.code
    if (code === 'NO_RESULTS') throw lastError
    const err = new Error(lastError.message) as Error & { code: SearchErrorCode }
    err.code = 'NETWORK_ERROR'
    throw err
  }

  const err = new Error('Search failed') as Error & { code: SearchErrorCode }
  err.code = 'NETWORK_ERROR'
  throw err
}
