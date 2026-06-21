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
  await ensureDir()
  const encrypted = safeStorage.encryptString(key)
  await fs.promises.writeFile(CRED_FILE, encrypted)
}

export async function getSearchApiKey(): Promise<string | null> {
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

export async function hasSearchApiKey(): Promise<boolean> {
  try {
    await fs.promises.access(CRED_FILE)
    return true
  } catch {
    return false
  }
}
