import type { JobErrorCode } from '@shared/index'

const KNOWN_JOB_ERROR_CODES: readonly JobErrorCode[] = [
  'MISSING_SEARCH_KEY',
  'NETWORK_ERROR',
  'OFFICIAL_PAGE_FAILED',
  'EXTRACTION_ERROR',
  'EMPTY_RESULTS',
  'CACHE_WRITE_FAILED',
  'TIMEOUT',
]

export function toJobErrorCode(err: unknown): JobErrorCode {
  const e = err as { name?: unknown; code?: unknown } | null | undefined
  if (e?.name === 'AbortError' || e?.code === 20 || e?.code === 'TIMEOUT') return 'TIMEOUT'
  if (typeof e?.code === 'string' && (KNOWN_JOB_ERROR_CODES as readonly string[]).includes(e.code)) {
    return e.code as JobErrorCode
  }
  return 'NETWORK_ERROR'
}
