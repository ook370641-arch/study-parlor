// tests/library-data.test.ts
// 注意：vitest.config.ts 的 mock-electron 插件已在 resolve 层接管 'electron'
// （导出 ipcMain.handle / safeStorage 桩），无需 vi.mock('electron')
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import {
  DEFAULT_PROFILE,
  profilePathFor,
  blogCachePathFor,
  jobDataPathFor,
  loadProfile,
  saveProfile,
  loadBlogCache,
  saveBlogCache,
  loadJobData,
  saveJobData,
  migrateLibraryData,
} from '../electron/lib/library-data'

let lib: string
let stateDir: string

beforeEach(() => {
  lib = fs.mkdtempSync(path.join(os.tmpdir(), 'sp-lib-'))
  stateDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sp-state-'))
})
afterEach(() => {
  fs.rmSync(lib, { recursive: true, force: true })
  fs.rmSync(stateDir, { recursive: true, force: true })
})

function writeState(data: Record<string, unknown>): void {
  fs.writeFileSync(path.join(stateDir, 'state.json'), JSON.stringify(data, null, 2), 'utf8')
}
function readState(): Record<string, unknown> {
  return JSON.parse(fs.readFileSync(path.join(stateDir, 'state.json'), 'utf8'))
}

describe('load 回退', () => {
  it('文件缺失时返回默认值', () => {
    expect(loadProfile(lib)).toEqual(DEFAULT_PROFILE)
    const { cache, lastSeenAt } = loadBlogCache(lib)
    expect(cache).toEqual({ lastFetchedAt: null, articles: [], loading: false, error: null, sectionStatus: {}, articleMetaCache: {} })
    expect(lastSeenAt).toBeNull()
    const job = loadJobData(lib)
    expect(job.jobProfile.targetRoles).toEqual([])
    expect(job.jobBriefingConfig.companies.length).toBeGreaterThan(0)
  })

  it('JSON 损坏时返回默认值不抛错', () => {
    fs.writeFileSync(profilePathFor(lib), '{broken', 'utf8')
    expect(loadProfile(lib)).toEqual(DEFAULT_PROFILE)
  })

  it('默认值不共享引用：mutate 第一次返回不影响第二次', () => {
    const first = loadBlogCache(lib)
    first.cache.articles.push({ url: 'https://x.com/pollute' } as any)
    first.cache.sectionStatus!['news'] = { fetchedAt: 'x', error: null } as any
    first.cache.articleMetaCache!['https://x.com/pollute'] = { title: null, publishedAt: null, summary: null, imageUrl: null }
    const second = loadBlogCache(lib)
    expect(second.cache.articles).toHaveLength(0)
    expect(second.cache.sectionStatus).toEqual({})
    expect(second.cache.articleMetaCache).toEqual({})
  })
})

describe('save/load 往返', () => {
  it('profile 往返', () => {
    const p = { name: '夜话', profile_text: '社科跨界', preferred_topics: ['Agent'] }
    saveProfile(lib, p)
    expect(loadProfile(lib)).toEqual(p)
  })

  it('blogCache 落盘剥离 loading/error，保留 lastSeenAt', () => {
    saveBlogCache(lib, {
      lastFetchedAt: '2026-08-16T00:00:00.000Z',
      articles: [{ url: 'https://x.com/a', title: 'A' } as any],
      loading: true,
      error: { code: 'X', message: 'm' } as any,
      sectionStatus: { news: 'ok' } as any,
      articleMetaCache: { 'https://x.com/a': { title: 'A', publishedAt: null, summary: null, imageUrl: null } },
    }, '2026-08-16T01:00:00.000Z')
    const raw = JSON.parse(fs.readFileSync(blogCachePathFor(lib), 'utf8'))
    expect(raw.loading).toBeUndefined()
    expect(raw.error).toBeUndefined()
    expect(raw.lastSeenAt).toBe('2026-08-16T01:00:00.000Z')
    const { cache, lastSeenAt } = loadBlogCache(lib)
    expect(cache.loading).toBe(false)
    expect(cache.articles).toHaveLength(1)
    expect(lastSeenAt).toBe('2026-08-16T01:00:00.000Z')
  })

  it('saveJobData 只合并传入的 key', () => {
    const first = loadJobData(lib)
    saveJobData(lib, { jobBriefingConfig: { ...first.jobBriefingConfig, cities: ['北京'] } })
    const after = loadJobData(lib)
    expect(after.jobBriefingConfig.cities).toEqual(['北京'])
    expect(after.jobProfile).toEqual(first.jobProfile)
  })
})

describe('migrateLibraryData', () => {
  it('老 state.json 四字段迁入库内并剥离，其余 key 保留', () => {
    writeState({
      version: 1,
      profile: { name: '夜话', profile_text: 'p', preferred_topics: ['t'] },
      anthropicBlogCache: { lastFetchedAt: '2026-08-01T00:00:00.000Z', articles: [{ url: 'u' }], loading: false, error: null, sectionStatus: {} },
      anthropicBlogLastSeenAt: '2026-08-02T00:00:00.000Z',
      jobProfile: { targetRoles: ['PM'], direction: '', skills: [], experience: '', additionalNotes: '', updatedAt: '', keywordsGeneratedAt: '' },
      jobBriefingConfig: { companies: [{ name: '字节跳动', priority: 1, enabled: true }], roleKeywords: ['PM'], cities: [], skillKeywords: [], eventSearchKeywords: [], jobSearchKeywords: [], searchInternship: false, searchFallRecruit: true },
      writingFontSize: 'lg',
    })
    migrateLibraryData(lib, stateDir)
    expect(loadProfile(lib).name).toBe('夜话')
    expect(loadBlogCache(lib).cache.articles).toHaveLength(1)
    expect(loadBlogCache(lib).lastSeenAt).toBe('2026-08-02T00:00:00.000Z')
    expect(loadJobData(lib).jobProfile.targetRoles).toEqual(['PM'])
    expect(loadJobData(lib).jobBriefingConfig.roleKeywords).toEqual(['PM'])
    const state = readState()
    for (const k of ['profile', 'anthropicBlogCache', 'anthropicBlogLastSeenAt', 'jobProfile', 'jobBriefingConfig']) {
      expect(state[k]).toBeUndefined()
    }
    expect(state.writingFontSize).toBe('lg')
  })

  it('幂等：第二次运行文件内容不变', () => {
    writeState({ profile: { name: '夜话', profile_text: '', preferred_topics: [] } })
    migrateLibraryData(lib, stateDir)
    const before = fs.readFileSync(profilePathFor(lib), 'utf8')
    migrateLibraryData(lib, stateDir)
    expect(fs.readFileSync(profilePathFor(lib), 'utf8')).toBe(before)
  })

  it('库内已存在时 state.json 旧值被丢弃，不覆盖库内', () => {
    saveProfile(lib, { name: '库内新值', profile_text: '', preferred_topics: [] })
    writeState({ profile: { name: '旧快照', profile_text: '', preferred_topics: [] } })
    migrateLibraryData(lib, stateDir)
    expect(loadProfile(lib).name).toBe('库内新值')
    expect(readState().profile).toBeUndefined()
  })

  it('全新用户（无四字段）不生成库内文件、不改写 state.json', () => {
    writeState({ version: 1, writingFontSize: 'base' })
    migrateLibraryData(lib, stateDir)
    expect(fs.existsSync(profilePathFor(lib))).toBe(false)
    expect(fs.existsSync(blogCachePathFor(lib))).toBe(false)
    expect(fs.existsSync(jobDataPathFor(lib))).toBe(false)
  })

  it('默认值的四字段不生成库内文件但仍被剥离', () => {
    writeState({
      profile: { name: '', profile_text: '', preferred_topics: [] },
      anthropicBlogCache: { lastFetchedAt: null, articles: [], loading: false, error: null },
      anthropicBlogLastSeenAt: null,
    })
    migrateLibraryData(lib, stateDir)
    expect(fs.existsSync(profilePathFor(lib))).toBe(false)
    expect(fs.existsSync(blogCachePathFor(lib))).toBe(false)
    expect(readState().profile).toBeUndefined()
  })
})
