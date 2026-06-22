import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { safeStorage } from 'electron'

const CRED_DIR = path.join(os.homedir(), '.studyparlor')
const CRED_FILE = path.join(CRED_DIR, 'search-key.enc')

async function ensureDir(): Promise<void> {
  try {
    await fs.promises.access(CRED_DIR)
  } catch {
    await fs.promises.mkdir(CRED_DIR, { recursive: true })
  }
}

export async function setSearchApiKey(key: string): Promise<void> {
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error('Encryption is not available on this system')
  }
  await ensureDir()
  try {
    const encrypted = safeStorage.encryptString(key)
    await fs.promises.writeFile(CRED_FILE, encrypted)
  } catch (err) {
    throw new Error(
      `Failed to encrypt and store the API key: ${err instanceof Error ? err.message : String(err)}`
    )
  }
}

export async function getSearchApiKey(): Promise<string | null> {
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error('Encryption is not available on this system')
  }
  try {
    await fs.promises.access(CRED_FILE)
  } catch {
    return null
  }
  const encrypted = await fs.promises.readFile(CRED_FILE)
  try {
    return safeStorage.decryptString(encrypted)
  } catch (err) {
    console.error('[credentials] failed to decrypt search key:', err)
    return null
  }
}

export async function removeSearchApiKey(): Promise<void> {
  if (!fs.existsSync(CRED_FILE)) return
  await fs.promises.unlink(CRED_FILE)
}

export async function hasSearchApiKey(): Promise<boolean> {
  try {
    await fs.promises.access(CRED_FILE)
    return true
  } catch {
    return false
  }
}
