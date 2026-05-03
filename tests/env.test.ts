import { describe, expect, it } from 'vitest'
import { loadEnv } from '@electron/env'

describe('loadEnv', () => {
  it('throws when KIMI_API_KEY is missing', () => {
    expect(() => loadEnv({})).toThrow(/KIMI_API_KEY/)
  })

  it('returns config with defaults when minimum env present', () => {
    const cfg = loadEnv({
      KIMI_API_KEY: 'sk-kimi-x',
      STUDY_LIBRARY_PATH: 'C:/foo'
    })
    expect(cfg.apiKey).toBe('sk-kimi-x')
    expect(cfg.baseUrl).toBe('https://api.kimi.com/coding/v1')
    expect(cfg.model).toBe('kimi-k2.6')
    expect(cfg.libraryPath).toBe('C:/foo')
  })

  it('respects KIMI_BASE_URL / KIMI_MODEL overrides', () => {
    const cfg = loadEnv({
      KIMI_API_KEY: 'sk-kimi-x',
      KIMI_BASE_URL: 'https://override.example/v1',
      KIMI_MODEL: 'kimi-other',
      STUDY_LIBRARY_PATH: 'C:/foo'
    })
    expect(cfg.baseUrl).toBe('https://override.example/v1')
    expect(cfg.model).toBe('kimi-other')
  })

  it('throws when STUDY_LIBRARY_PATH is missing', () => {
    expect(() =>
      loadEnv({ KIMI_API_KEY: 'sk-kimi-x' })
    ).toThrow(/STUDY_LIBRARY_PATH/)
  })
})
