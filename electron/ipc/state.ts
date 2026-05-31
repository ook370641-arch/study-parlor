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
  suggested_new_topics: null,
  groupInspirations: {},
  ui: { session_count: 0 },
  inspirationStrategy: 'v2',
  fableStyleTags: ['科幻', '童话', '历史', '日常生活', '悬疑', '诗意散文'],
  lastFableTags: []
}

let currentState: StateJson | null = null

function loadState(): StateJson {
  if (!currentState) {
    currentState = safeReadJson(STATE_FILE, { fallback: DEFAULT })
  }
  return currentState
}

export function registerStateIpc() {
  loadState()

  ipcMain.handle('state:get', async (): Promise<StateJson> => {
    return loadState()
  })

  ipcMain.handle('state:patch', async (_, patch: Partial<StateJson>) => {
    currentState = { ...loadState(), ...patch }
    safeWriteJson(STATE_FILE, currentState)
  })
}

export function getCurrentState(): StateJson {
  return loadState()
}
