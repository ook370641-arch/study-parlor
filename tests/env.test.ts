import { describe, expect, it, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { loadEnv, saveEnv } from '@electron/env'

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

  it('throws when KIMI_MODEL contains ANSI bracket artifacts', () => {
    expect(() =>
      loadEnv({
        KIMI_API_KEY: 'sk-kimi-x',
        KIMI_MODEL: 'deepseek-v4-pro[1m]',
        STUDY_LIBRARY_PATH: 'C:/foo'
      })
    ).toThrow(/KIMI_MODEL 包含非法字符/)
  })

  it('strips actual ANSI escape sequences from KIMI_MODEL', () => {
    const cfg = loadEnv({
      KIMI_API_KEY: 'sk-kimi-x',
      KIMI_MODEL: '\x1b[1mdeepseek-v4-pro\x1b[0m',
      STUDY_LIBRARY_PATH: 'C:/foo'
    })
    expect(cfg.model).toBe('deepseek-v4-pro')
  })

  it('throws when STUDY_LIBRARY_PATH is missing', () => {
    expect(() =>
      loadEnv({ KIMI_API_KEY: 'sk-kimi-x' })
    ).toThrow(/STUDY_LIBRARY_PATH/)
  })
})

describe('saveEnv', () => {
  let tmpDir: string
  let envPath: string
  const originalCwd = process.cwd()

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sp-env-'))
    envPath = path.join(tmpDir, '.env')
    process.chdir(tmpDir)
  })

  afterEach(() => {
    process.chdir(originalCwd)
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  it('writes four config keys to .env', () => {
    saveEnv({
      apiKey: 'sk-kimi-new',
      baseUrl: 'https://api.kimi.com/coding/v1',
      model: 'kimi-k2.6',
      libraryPath: 'C:/new-library'
    })
    const content = fs.readFileSync(envPath, 'utf-8')
    expect(content).toContain('KIMI_API_KEY=sk-kimi-new')
    expect(content).toContain('STUDY_LIBRARY_PATH=C:/new-library')
    expect(content).toContain('KIMI_BASE_URL=https://api.kimi.com/coding/v1')
    expect(content).toContain('KIMI_MODEL=kimi-k2.6')
  })

  it('updates existing keys and preserves unknown lines', () => {
    fs.writeFileSync(envPath, '# comment\nKIMI_API_KEY=old\nUNKNOWN=value\n')
    saveEnv({
      apiKey: 'sk-kimi-new',
      baseUrl: 'https://api.kimi.com/coding/v1',
      model: 'kimi-k2.6',
      libraryPath: 'C:/new-library'
    })
    const content = fs.readFileSync(envPath, 'utf-8')
    expect(content).toContain('KIMI_API_KEY=sk-kimi-new')
    expect(content).toContain('# comment')
    expect(content).toContain('UNKNOWN=value')
    expect(content).not.toContain('KIMI_API_KEY=old')
  })

  it('appends keys that do not exist', () => {
    fs.writeFileSync(envPath, 'KIMI_API_KEY=only\n')
    saveEnv({
      apiKey: 'only',
      baseUrl: 'https://api.kimi.com/coding/v1',
      model: 'kimi-k2.6',
      libraryPath: 'C:/new-library'
    })
    const content = fs.readFileSync(envPath, 'utf-8')
    expect(content).toContain('KIMI_BASE_URL=https://api.kimi.com/coding/v1')
    expect(content).toContain('KIMI_MODEL=kimi-k2.6')
    expect(content).toContain('STUDY_LIBRARY_PATH=C:/new-library')
  })

  it('sanitizes model before writing', () => {
    saveEnv({
      apiKey: 'sk-kimi-x',
      baseUrl: 'https://api.kimi.com/coding/v1',
      model: '\x1b[1mkimi-k2.6\x1b[0m',
      libraryPath: 'C:/foo'
    })
    const content = fs.readFileSync(envPath, 'utf-8')
    expect(content).toContain('KIMI_MODEL=kimi-k2.6')
  })

  it('normalizes baseUrl so loadEnv round-trip is consistent', () => {
    saveEnv({
      apiKey: 'sk-kimi-x',
      baseUrl: 'https://api.kimi.com/coding',
      model: 'kimi-k2.6',
      libraryPath: 'C:/foo'
    })
    const cfg = loadEnv({
      KIMI_API_KEY: 'sk-kimi-x',
      KIMI_BASE_URL: 'https://api.kimi.com/coding',
      KIMI_MODEL: 'kimi-k2.6',
      STUDY_LIBRARY_PATH: 'C:/foo'
    })
    expect(cfg.baseUrl).toBe('https://api.kimi.com/coding/v1')
  })
})
