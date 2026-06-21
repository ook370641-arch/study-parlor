import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'

const TEST_DIR = path.join(os.tmpdir(), 'study-parlor-credentials-test')

vi.mock('electron', () => ({
  safeStorage: {
    isEncryptionAvailable: () => true,
    encryptString: (s: string) => Buffer.from(`enc:${s}`),
    decryptString: (b: Buffer) => {
      const str = b.toString()
      if (!str.startsWith('enc:')) throw new Error('Invalid encrypted data')
      return str.replace(/^enc:/, '')
    }
  }
}))

describe('credentials', () => {
  let credentials: typeof import('@electron/lib/credentials')

  beforeEach(async () => {
    vi.resetModules()
    vi.spyOn(os, 'homedir').mockReturnValue(TEST_DIR)
    try {
      await fs.promises.access(TEST_DIR)
      await fs.promises.rm(TEST_DIR, { recursive: true })
    } catch {}
    await fs.promises.mkdir(TEST_DIR, { recursive: true })
    credentials = await import('@electron/lib/credentials')
  })

  afterEach(async () => {
    vi.restoreAllMocks()
    try {
      await fs.promises.access(TEST_DIR)
      await fs.promises.rm(TEST_DIR, { recursive: true })
    } catch {}
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
    await fs.promises.rm(credFile)
    const result = await credentials.getSearchApiKey()
    expect(result).toBeNull()
  })

  it('getSearchApiKey returns null when the credential file is corrupted', async () => {
    await credentials.setSearchApiKey('my-secret-key')
    const credFile = path.join(TEST_DIR, '.studyparlor', 'search-key.enc')
    await fs.promises.writeFile(credFile, 'garbage-data')
    const result = await credentials.getSearchApiKey()
    expect(result).toBeNull()
  })

  it('removeSearchApiKey deletes the credential file', async () => {
    await credentials.setSearchApiKey('my-secret-key')
    expect(await credentials.hasSearchApiKey()).toBe(true)
    await credentials.removeSearchApiKey()
    expect(await credentials.hasSearchApiKey()).toBe(false)
  })

  it('removeSearchApiKey is a no-op when no credential file exists', async () => {
    await expect(credentials.removeSearchApiKey()).resolves.toBeUndefined()
    expect(await credentials.hasSearchApiKey()).toBe(false)
  })
})
