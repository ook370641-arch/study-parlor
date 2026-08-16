// electron/ipc/state.ts
import { ipcMain } from 'electron'
import path from 'node:path'
import { safeReadJson, safeWriteJson } from '../lib/safe-json'
import { getStateDir } from '../env'
import type { AppConfig } from '../env'
import { DEFAULT_JOB_BRIEFING_CONFIG, normalizeJobBriefingConfig } from '../lib/job-briefing'
import { DEFAULT_JOB_PROFILE, normalizeJobProfile } from '../../src/lib/job-briefing-defaults'
import {
  loadProfile,
  saveProfile,
  loadBlogCache,
  saveBlogCache,
  loadJobData,
  saveJobData,
  migrateLibraryData,
} from '../lib/library-data'
import type { StateJson, Profile, AnthropicBlogCache, JobProfile, JobBriefingConfig } from '@shared/index'

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
  writingExpandedGroups: {},
  writingUIFontSize: 'base',
  scoutTab: 'chat',
  scoutActiveConversationId: null,
}

/** 迁入学习库的五个 key：库内文件是真相源，state.json 不再持久化它们 */
const LIBRARY_KEYS = new Set([
  'profile',
  'anthropicBlogCache',
  'anthropicBlogLastSeenAt',
  'jobBriefingConfig',
  'jobProfile',
])

let libraryPath: string | null = null

/**
 * 库路径解析：优先 registerStateIpc 注入值，惰性回退环境变量。
 * 回退存在的理由：setup:writeConfig 在 IPC 注册前就会 patchState({profile})，
 * 那时只有 process.env.STUDY_LIBRARY_PATH 可用。返回 null 表示向导前（库未配置）。
 */
function getLibraryPath(): string | null {
  if (libraryPath) return libraryPath
  return process.env.STUDY_LIBRARY_PATH?.trim() || null
}

function readStateJson(): StateJson {
  const raw = safeReadJson(getStateFile(), { fallback: DEFAULT })
  return {
    ...DEFAULT,
    ...raw,
    jobBriefingConfig: normalizeJobBriefingConfig(raw.jobBriefingConfig),
    jobProfile: normalizeJobProfile(raw.jobProfile),
  }
}

/** state.json 基座 + 库内四字段叠加；叠加前做一次兜底迁移（幂等，库内已建则秒退） */
function withLibraryData(base: StateJson): StateJson {
  const lib = getLibraryPath()
  if (!lib) return base
  try {
    migrateLibraryData(lib, getStateDir())
  } catch (err) {
    // 迁移失败时绝不能继续叠加——库内文件可能缺失，load* 会返回全空默认值，
    // 覆盖 base 中 state.json 的真实值，后续写库还会把"库内已存在"坐实。
    // 直接返回 base：state.json 值仍在，下次读取自动重试迁移。
    console.error('[state] library migration failed:', err)
    return base
  }
  const { cache, lastSeenAt } = loadBlogCache(lib)
  const job = loadJobData(lib)
  return {
    ...base,
    profile: loadProfile(lib),
    anthropicBlogCache: cache,
    anthropicBlogLastSeenAt: lastSeenAt,
    jobProfile: job.jobProfile,
    jobBriefingConfig: job.jobBriefingConfig,
  }
}

export function registerStateIpc(cfg?: AppConfig) {
  libraryPath = cfg?.libraryPath ?? null

  const lib = getLibraryPath()
  if (lib) {
    try {
      migrateLibraryData(lib, getStateDir())
    } catch (err) {
      console.error('[state] startup migration failed:', err)
    }
  }

  ipcMain.handle('state:get', async (): Promise<StateJson> => withLibraryData(readStateJson()))

  ipcMain.handle('state:patch', async (_, patch: Partial<StateJson>) => {
    patchState(patch)
  })
}

export function getCurrentState(): StateJson {
  return withLibraryData(readStateJson())
}

export function patchState(patch: Partial<StateJson>): void {
  const lib = getLibraryPath()
  // 写前先兜底迁移（幂等，正常秒退）：堵住"未导入先删除"窗口——
  // 库内文件缺失 + 外部在运行中写入 state.json 五字段 + 首个动作是 patch 而非 read 时，
  // 种子值必须先落库，否则下方 delete LIBRARY_KEYS 会把未迁移的数据直接抹掉。
  let migrationOk = true
  if (lib) {
    try {
      migrateLibraryData(lib, getStateDir())
    } catch (err) {
      console.error('[state] pre-patch migration failed:', err)
      migrationOk = false
    }
  }
  const statePatch: Record<string, unknown> = {}
  const libraryPatch: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(patch)) {
    // 库未配置（向导前）时五 key 退回 state.json，保持旧行为
    if (lib && LIBRARY_KEYS.has(k)) libraryPatch[k] = v
    else statePatch[k] = v
  }

  if (Object.keys(statePatch).length > 0) {
    // 合并基座从磁盘读（与 state:get 一致），不用缓存——
    // 否则 E2E 在 app 启动后 seed 的 state.json 会被过期缓存覆盖掉。
    const raw = safeReadJson(getStateFile(), { fallback: DEFAULT })
    let merged: Record<string, unknown> = { ...DEFAULT, ...raw, ...statePatch }

    // 深度合并 ui 字段，防止后续 patch 覆盖已有字段
    if (statePatch.ui) {
      merged = { ...merged, ui: { ...(raw.ui as object), ...(statePatch.ui as object) } }
    }

    // LRU: 限制 topicContinueSuggestions 条目数
    if ('topicContinueSuggestions' in statePatch) {
      const MAX_CACHE = 20
      const suggestions = merged.topicContinueSuggestions as StateJson['topicContinueSuggestions']
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

    // 关键：基座含 DEFAULT 的五字段默认值，落盘前必须剔除，
    // 否则任何无关 patch 都会把已剥离的 key 重新写回 state.json。
    // 迁移失败（migrationOk=false）时保留 state.json 原值，留待下次重试，绝不抹掉。
    if (lib && migrationOk) {
      for (const k of LIBRARY_KEYS) delete merged[k]
    }

    safeWriteJson(getStateFile(), merged)
  }

  if (Object.keys(libraryPatch).length > 0 && lib) {
    if ('profile' in libraryPatch) {
      saveProfile(lib, libraryPatch.profile as Profile)
    }
    if (libraryPatch.anthropicBlogCache || 'anthropicBlogLastSeenAt' in libraryPatch) {
      const cur = loadBlogCache(lib)
      saveBlogCache(
        lib,
        (libraryPatch.anthropicBlogCache as AnthropicBlogCache) ?? cur.cache,
        'anthropicBlogLastSeenAt' in libraryPatch
          ? (libraryPatch.anthropicBlogLastSeenAt as string | null)
          : cur.lastSeenAt
      )
    }
    if (libraryPatch.jobProfile || libraryPatch.jobBriefingConfig) {
      saveJobData(lib, {
        jobProfile: libraryPatch.jobProfile as JobProfile | undefined,
        jobBriefingConfig: libraryPatch.jobBriefingConfig as JobBriefingConfig | undefined,
      })
    }
  }
}
