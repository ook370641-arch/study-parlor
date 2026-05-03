import { ipcMain } from 'electron'
import path from 'node:path'
import os from 'node:os'
import { safeReadJson, safeWriteJson } from '../lib/safe-json'
import type { StateJson } from '@shared/index'

const STATE_FILE = path.join(os.homedir(), '.studyparlor', 'state.json')

const DEFAULT: StateJson = {
  version: 1,
  profile: { name: '', profile_text: '', preferred_topics: [] },
  lastUsed: { difficulty: 'mid', temperature: 0.7 },
  recommendation_cache: {},
  suggested_new_topics: null,
  ui: { session_count: 0 }
}

export function registerStateIpc() {
  ipcMain.handle('state:get', async (): Promise<StateJson> => {
    return safeReadJson(STATE_FILE, { fallback: DEFAULT })
  })

  ipcMain.handle('state:patch', async (_, patch: Partial<StateJson>) => {
    const cur = safeReadJson(STATE_FILE, { fallback: DEFAULT })
    const next = { ...cur, ...patch }
    safeWriteJson(STATE_FILE, next)
  })
}

export function getCurrentState(): StateJson {
  return safeReadJson(STATE_FILE, { fallback: DEFAULT })
}
