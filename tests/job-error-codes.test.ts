import { describe, it, expect } from 'vitest'
import { toJobErrorCode } from '../electron/lib/job-error-codes'

describe('toJobErrorCode', () => {
  it('maps AbortError (DOMException code 20) to TIMEOUT', () => {
    const err = new DOMException('The operation was aborted', 'AbortError')
    expect(toJobErrorCode(err)).toBe('TIMEOUT')
  })

  it('maps abort-like shapes to TIMEOUT', () => {
    expect(toJobErrorCode({ name: 'AbortError' })).toBe('TIMEOUT')
    expect(toJobErrorCode({ code: 20 })).toBe('TIMEOUT')
    expect(toJobErrorCode({ code: 'TIMEOUT' })).toBe('TIMEOUT')
  })

  it('passes through known domain codes', () => {
    expect(toJobErrorCode(Object.assign(new Error('x'), { code: 'EMPTY_RESULTS' }))).toBe('EMPTY_RESULTS')
    expect(toJobErrorCode(Object.assign(new Error('x'), { code: 'MISSING_SEARCH_KEY' }))).toBe('MISSING_SEARCH_KEY')
    expect(toJobErrorCode(Object.assign(new Error('x'), { code: 'CACHE_WRITE_FAILED' }))).toBe('CACHE_WRITE_FAILED')
  })

  it('falls back to NETWORK_ERROR for unknown shapes', () => {
    expect(toJobErrorCode(new Error('boom'))).toBe('NETWORK_ERROR')
    expect(toJobErrorCode({ code: 500 })).toBe('NETWORK_ERROR')
    expect(toJobErrorCode(null)).toBe('NETWORK_ERROR')
    expect(toJobErrorCode(undefined)).toBe('NETWORK_ERROR')
    expect(toJobErrorCode('plain string')).toBe('NETWORK_ERROR')
  })
})
