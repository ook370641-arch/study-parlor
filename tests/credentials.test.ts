import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'

const TEST_DIR = path.join(os.tmpdir(), 'study-parlor-credentials-test')

vi.mock('electron', () => ({
  safeStorage: {
    encryptString: (s: string) => Buffer.from(`enc:${s}`),
    decryptString: (b: Buffer) => b.toString().replace(/^enc:/, '')
  }
}))

describe('credentials', () => {
  let credentials: typeof import('@electron/lib/credentials')

  beforeEach(async () => {
    vi.resetModules()
    vi.spyOn(os, 'homedir').mockReturnValue(TEST_DIR)
    if (fs.existsSync(TEST_DIR)) fs.rmSync(TEST_DIR, { recursive: true })
    fs.mkdirSync(TEST_DIR, { recursive: true })
    credentials = await import('@electron/lib/credentials')
  })

  afterEach(() => {
    vi.restoreAllMocks()
    if (fs.existsSync(TEST_DIR)) fs.rmSync(TEST_DIR, { recursive: true })
  })

  it('hasSearchApiKey returns false when key not set', async () => {
    expect(await credentials.hasSearchApiKey()).toBe(false)
  })

  it('setSearchApiKey then hasSearchApiKey returns true', async () => {
    await credentials.setSearchApiKey('my-secret-key')
    expect(await credentials.hasSearchApiKey()).toBe(true)
  })

  it('getSearchApiKey decrypts the original key', async () => {
    await credentials.setSearchApiKey('my-secret-key')
    const result = await credentials.getSearchApiKey()
    expect(result).toBe('my-secret-key')
  })

  it('getSearchApiKey returns null after deleting the credential file', async () => {
    await credentials.setSearchApiKey('my-secret-key')
    const credFile = path.join(TEST_DIR, '.studyparlor', 'search-key.enc')
    fs.rmSync(credFile)
    const result = await credentials.getSearchApiKey()
    expect(result).toBeNull()
  })
})
