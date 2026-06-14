import { describe, expect, it } from 'vitest'
import { loadEnv } from '@electron/env'

function validEnv() {
  return {
    KIMI_API_KEY: 'sk-kimi-real-key-for-test',
    KIMI_BASE_URL: 'https://api.kimi.com/coding/v1',
    KIMI_MODEL: 'kimi-k2.6',
    STUDY_LIBRARY_PATH: 'C:\\tmp\\study-parlor-smoke-library'
  }
}

describe('release env loading', () => {
  it('loads a valid test env object', () => {
    const env = validEnv()
    const cfg = loadEnv(env)
    expect(cfg.apiKey).toBe(env.KIMI_API_KEY)
    expect(cfg.baseUrl).toBe('https://api.kimi.com/coding/v1')
    expect(cfg.model).toBe('kimi-k2.6')
    expect(cfg.libraryPath).toBe(env.STUDY_LIBRARY_PATH)
  })

  it('rejects placeholder api keys', () => {
    expect(() => loadEnv({ ...validEnv(), KIMI_API_KEY: 'sk-kimi-replace-me' })).toThrow()
    expect(() => loadEnv({ ...validEnv(), KIMI_API_KEY: 'sk-kimi-...' })).toThrow()
    expect(() => loadEnv({ ...validEnv(), KIMI_API_KEY: 'your-api-key' })).toThrow()
  })

  it('rejects missing api key', () => {
    expect(() => loadEnv({ ...validEnv(), KIMI_API_KEY: undefined })).toThrow()
  })

  it('rejects missing library path', () => {
    expect(() => loadEnv({ ...validEnv(), STUDY_LIBRARY_PATH: undefined })).toThrow()
  })
})
