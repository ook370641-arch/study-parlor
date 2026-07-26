import type { JobErrorCode } from '@shared/index'

const KNOWN_JOB_ERROR_CODES: readonly JobErrorCode[] = [
  'MISSING_SEARCH_KEY',
  'NETWORK_ERROR',
  'TAVILY_ERROR',
  'OFFICIAL_PAGE_FAILED',
  'EXTRACTION_ERROR',
  'EMPTY_RESULTS',
  'CACHE_WRITE_FAILED',
  'TIMEOUT',
  'LLM_ERROR',
]

export function toJobErrorCode(err: unknown): JobErrorCode {
  const e = err as { name?: unknown; code?: unknown; message?: unknown } | null | undefined
  if (e?.name === 'AbortError' || e?.code === 20 || e?.code === 'TIMEOUT') return 'TIMEOUT'
  if (typeof e?.code === 'string' && (KNOWN_JOB_ERROR_CODES as readonly string[]).includes(e.code)) {
    return e.code as JobErrorCode
  }
  // Pattern-match common errors before falling back to the generic NETWORK_ERROR
  const msg = typeof e?.message === 'string' ? e.message : ''
  if (msg.includes('TAVILY_ERROR') || msg.includes('Tavily')) return 'TAVILY_ERROR'
  if (msg.includes('LLM_ERROR') || msg.includes('Kimi') || msg.includes('chatNonStream')) return 'LLM_ERROR'
  if (msg.includes('EXTRACTION_ERROR')) return 'EXTRACTION_ERROR'
  // Log the unmapped error so developers can diagnose the real cause
  console.error('[job-error-codes] unmapped error → NETWORK_ERROR:', formatErrorForLog(err))
  // Also write to a persistent debug file so users can report the error
  try {
    const fs = require('node:fs')
    const path = require('node:path')
    const os = require('node:os')
    const dir = path.join(os.homedir(), '.studyparlor', 'debug')
    fs.mkdirSync(dir, { recursive: true })
    const ts = new Date().toISOString().replace(/[:.]/g, '-')
    const dump = {
      ts: new Date().toISOString(),
      fallback: 'NETWORK_ERROR',
      error: formatErrorForLog(err),
    }
    for (const key of ['name', 'code', 'message', 'stack', 'status'] as const) {
      const v = (err as any)?.[key]
      if (v !== undefined && v !== null) dump[key] = typeof v === 'string' ? v.slice(0, 2000) : String(v).slice(0, 2000)
    }
    fs.writeFileSync(
      path.join(dir, `job-error-unmapped-${ts}.json`),
      JSON.stringify(dump, null, 2),
      'utf8',
    )
  } catch { /* best-effort logging, never throw */ }
  return 'NETWORK_ERROR'
}

/** Sanitized one-line error summary for logging (no keys, no URLs). */
function formatErrorForLog(err: unknown): string {
  const e = err as { name?: unknown; message?: unknown; code?: unknown; status?: unknown; stack?: unknown } | null | undefined
  const parts: string[] = []
  if (typeof e?.name === 'string') parts.push(`name=${e.name}`)
  if (typeof e?.code === 'string' || typeof e?.code === 'number') parts.push(`code=${e.code}`)
  if (typeof e?.status === 'number') parts.push(`status=${e.status}`)
  if (typeof e?.message === 'string') parts.push(`msg=${e.message.slice(0, 200)}`)
  return parts.join(' ') || String(err).slice(0, 500)
}
