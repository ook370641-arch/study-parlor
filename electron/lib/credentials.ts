import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { safeStorage } from 'electron'

const CRED_DIR = path.join(os.homedir(), '.studyparlor')
const CRED_FILE = path.join(CRED_DIR, 'search-key.enc')

function ensureDir() {
  if (!fs.existsSync(CRED_DIR)) {
    fs.mkdirSync(CRED_DIR, { recursive: true })
  }
}

export async function setSearchApiKey(key: string): Promise<void> {
  ensureDir()
  const encrypted = safeStorage.encryptString(key)
  fs.writeFileSync(CRED_FILE, encrypted)
}

export async function getSearchApiKey(): Promise<string | null> {
  if (!fs.existsSync(CRED_FILE)) return null
  const encrypted = fs.readFileSync(CRED_FILE)
  try {
    return safeStorage.decryptString(encrypted)
  } catch (err) {
    console.error('[credentials] failed to decrypt search key:', err)
    return null
  }
}

export async function hasSearchApiKey(): Promise<boolean> {
  return fs.existsSync(CRED_FILE)
}
