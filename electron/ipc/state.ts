import { ipcMain } from 'electron'
import path from 'node:path'
import { safeReadJson, safeWriteJson } from '../lib/safe-json'
import { getStateDir } from '../env'
import { DEFAULT_JOB_BRIEFING_CONFIG, normalizeJobBriefingConfig } from '../lib/job-briefing'
import { DEFAULT_JOB_PROFILE, normalizeJobProfile } from '../../src/lib/job-briefing-defaults'
import type { StateJson } from '@shared/index'

function getStateFile(): string {
  return path.join(getStateDir(), 'state.json')
}

const DEFAULT: StateJson = {
  version: 1,
  profile: { name: '', profile_text: '', preferred_topics: [] },
  lastUsed: { difficulty: 'mid', temperature: 0.7 },
  groupInspirations: {},
  ui: { session_count: 0 },
  inspirationStrategy: 'v2',
  fableStyleTags: ['科幻', '童话', '历史', '日常生活', '悬疑', '诗意散文'],
  lastFableTags: [],
  topicContinueSuggestions: {},
  briefingSource: 'digest',
  anthropicBlogCache: { lastFetchedAt: null, articles: [], loading: false, error: null, sectionStatus: {} },
  anthropicBlogLastSeenAt: null,
  jobBriefingConfig: DEFAULT_JOB_BRIEFING_CONFIG,
  assistantSearchEnabled: false,
  assistantSocraticMode: true,
  assistantThinkingEffort: 'off',
  jobProfile: DEFAULT_JOB_PROFILE,
  writingFontSize: 'base',
  writingTone: 'parchment',
  writingListTab: 'articles',
  writingAssistantWidth: 320,
  writingAssistantOpen: false,
  lastWritingFile: null,
  writingOrder: {},
  writingUIFontSize: 'base',
  scoutTab: 'chat',
  scoutActiveConversationId: null,
}

let currentState: StateJson | null = null

function loadState(): StateJson {
  if (!currentState) {
    const raw = safeReadJson(getStateFile(), { fallback: DEFAULT })
    currentState = {
      ...DEFAULT,
      ...raw,
      // Deep-normalize nested configs that may have been added after the user's
      // state.json was last saved. A shallow `{...DEFAULT, ...raw}` would let an
      // old-format jobBriefingConfig (missing jobSearchKeywords, etc.) replace
      // the complete default.
      jobBriefingConfig: normalizeJobBriefingConfig(raw.jobBriefingConfig),
      jobProfile: normalizeJobProfile(raw.jobProfile),
    }
  }
  return currentState
}

export function registerStateIpc() {
  loadState()

  ipcMain.handle('state:get', async (): Promise<StateJson> => {
    // Always read from disk so that renderer reloads pick up external state changes (e.g. E2E fixtures).
    const raw = safeReadJson(getStateFile(), { fallback: DEFAULT })
    return {
      ...DEFAULT,
      ...raw,
      jobBriefingConfig: normalizeJobBriefingConfig(raw.jobBriefingConfig),
      jobProfile: normalizeJobProfile(raw.jobProfile),
    }
  })

  ipcMain.handle('state:patch', async (_, patch: Partial<StateJson>) => {
    patchState(patch)
  })
}

export function getCurrentState(): StateJson {
  return loadState()
}

export function patchState(patch: Partial<StateJson>): void {
  // 合并基座从磁盘读（与 state:get 一致），不用启动时缓存的 currentState——
  // 否则 E2E 在 app 启动后 seed 的 state.json 会被过期缓存（默认值）覆盖掉。
  const raw = safeReadJson(getStateFile(), { fallback: DEFAULT })
  let merged = { ...DEFAULT, ...raw, ...patch }

  // 深度合并 ui 字段，防止后续 patch 覆盖已有字段
  if (patch.ui) {
    merged = { ...merged, ui: { ...raw.ui, ...patch.ui } }
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
  safeWriteJson(getStateFile(), currentState)
}
