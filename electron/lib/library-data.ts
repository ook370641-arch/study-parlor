// electron/lib/library-data.ts
import fs from 'node:fs'
import path from 'node:path'
import { safeReadJson, safeWriteJson } from './safe-json'
import type { Profile, AnthropicBlogCache } from '@shared/index'

export const DEFAULT_PROFILE: Profile = { name: '', profile_text: '', preferred_topics: [] }

/** .cache.json 落盘形状：loading/error 为运行时瞬态，不落盘 */
type BlogCacheFile = {
  lastFetchedAt: string | null
  articles: AnthropicBlogCache['articles']
  sectionStatus: NonNullable<AnthropicBlogCache['sectionStatus']>
  articleMetaCache: NonNullable<AnthropicBlogCache['articleMetaCache']>
  lastSeenAt: string | null
}

export function profilePathFor(lib: string): string {
  return path.join(lib, '.profile.json')
}
export function blogCachePathFor(lib: string): string {
  return path.join(lib, 'Anthropic博客', '.cache.json')
}

export function loadProfile(lib: string): Profile {
  const raw = safeReadJson<Partial<Profile>>(profilePathFor(lib), { fallback: {} })
  return {
    name: typeof raw.name === 'string' ? raw.name : '',
    profile_text: typeof raw.profile_text === 'string' ? raw.profile_text : '',
    preferred_topics: Array.isArray(raw.preferred_topics) ? raw.preferred_topics : [],
  }
}

export function saveProfile(lib: string, profile: Profile): void {
  safeWriteJson(profilePathFor(lib), profile)
}

export function loadBlogCache(lib: string): { cache: AnthropicBlogCache; lastSeenAt: string | null } {
  const raw = safeReadJson<Partial<BlogCacheFile>>(blogCachePathFor(lib), { fallback: {} })
  return {
    cache: {
      lastFetchedAt: raw.lastFetchedAt ?? null,
      articles: Array.isArray(raw.articles) ? raw.articles : [],
      loading: false,
      error: null,
      sectionStatus: raw.sectionStatus ?? {},
      articleMetaCache: raw.articleMetaCache ?? {},
    },
    lastSeenAt: typeof raw.lastSeenAt === 'string' ? raw.lastSeenAt : null,
  }
}

export function saveBlogCache(lib: string, cache: AnthropicBlogCache, lastSeenAt: string | null): void {
  const file: BlogCacheFile = {
    lastFetchedAt: cache.lastFetchedAt ?? null,
    articles: cache.articles ?? [],
    sectionStatus: cache.sectionStatus ?? {},
    articleMetaCache: cache.articleMetaCache ?? {},
    lastSeenAt,
  }
  safeWriteJson(blogCachePathFor(lib), file)
}

// ── 一次性迁移（方案 A：库内为真相源，state.json 导入后剥离） ──

const MIGRATED_KEYS = [
  'profile',
  'anthropicBlogCache',
  'anthropicBlogLastSeenAt',
] as const

function isNonDefaultProfile(p: Profile | undefined): boolean {
  return !!p && (!!p.name || !!p.profile_text || (Array.isArray(p.preferred_topics) && p.preferred_topics.length > 0))
}

function isNonDefaultBlogCache(c: AnthropicBlogCache | undefined, lastSeenAt: unknown): boolean {
  return !!((c && ((c.articles?.length ?? 0) > 0 || c.lastFetchedAt)) || typeof lastSeenAt === 'string')
}

/**
 * 把 state.json 中的三类记忆迁入学习库（仅在库内文件缺失且值非默认时写入），
 * 然后无条件从 state.json 剥离这三个 key。幂等；库内已存在时绝不覆盖。
 */
export function migrateLibraryData(lib: string, stateDir: string): void {
  const statePath = path.join(stateDir, 'state.json')
  const raw = safeReadJson<Record<string, unknown>>(statePath, { fallback: {} })
  if (!MIGRATED_KEYS.some(k => k in raw)) return

  if (!fs.existsSync(profilePathFor(lib))) {
    const p = raw.profile as Profile | undefined
    if (isNonDefaultProfile(p)) saveProfile(lib, p!)
  }

  if (!fs.existsSync(blogCachePathFor(lib))) {
    const c = raw.anthropicBlogCache as AnthropicBlogCache | undefined
    const seen = raw.anthropicBlogLastSeenAt
    if (isNonDefaultBlogCache(c, seen)) {
      saveBlogCache(
        lib,
        {
          lastFetchedAt: c?.lastFetchedAt ?? null,
          articles: c?.articles ?? [],
          loading: false,
          error: null,
          sectionStatus: c?.sectionStatus ?? {},
          articleMetaCache: c?.articleMetaCache ?? {},
        },
        typeof seen === 'string' ? seen : null
      )
    }
  }

  const stripped = { ...raw }
  for (const k of MIGRATED_KEYS) delete stripped[k]
  safeWriteJson(statePath, stripped)
}
