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
  lastFableTags: [],
  topicContinueSuggestions: {}
}

let currentState: StateJson | null = null

function loadState(): StateJson {
  if (!currentState) {
    const raw = safeReadJson(STATE_FILE, { fallback: DEFAULT })
    currentState = { ...DEFAULT, ...raw }
  }
  return currentState
}

export function registerStateIpc() {
  loadState()

  ipcMain.handle('state:get', async (): Promise<StateJson> => {
    return loadState()
  })

  ipcMain.handle('state:patch', async (_, patch: Partial<StateJson>) => {
    patchState(patch)
  })
}

export function getCurrentState(): StateJson {
  return loadState()
}

export function patchState(patch: Partial<StateJson>): void {
  let merged = { ...loadState(), ...patch }

  // 深度合并 ui 字段，防止后续 patch 覆盖已有字段
  if (patch.ui) {
    merged = { ...merged, ui: { ...loadState().ui, ...patch.ui } }
  }

  // LRU: 限制 topicContinueSuggestions 条目数
  if ('topicContinueSuggestions' in patch) {
    const MAX_CACHE = 20
    const suggestions = merged.topicContinueSuggestions
    const keys = Object.keys(suggestions)
    if (keys.length > MAX_CACHE) {
      const sorted = keys
        .map(k => ({ key: k, generatedAt: suggestions[k].generatedAt }))
        .sort((a, b) => new Date(b.generatedAt).getTime() - new Date(a.generatedAt).getTime())
      const toKeep = new Set(sorted.slice(0, MAX_CACHE).map(x => x.key))
      merged = {
        ...merged,
        topicContinueSuggestions: Object.fromEntries(
          keys.filter(k => toKeep.has(k)).map(k => [k, suggestions[k]])
        )
      }
    }
  }

  currentState = merged
  safeWriteJson(STATE_FILE, currentState)
}
