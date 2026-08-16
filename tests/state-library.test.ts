// tests/state-library.test.ts
// vitest.config.ts 的 mock-electron 插件已提供 ipcMain.handle 桩，无需 vi.mock
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { setStateDir } from '../electron/env'
import { registerStateIpc, getCurrentState, patchState } from '../electron/ipc/state'
import { profilePathFor, blogCachePathFor, loadProfile } from '../electron/lib/library-data'
import type { AppConfig } from '../electron/env'

let lib: string
let stateDir: string
const OLD_ENV = process.env.STUDY_LIBRARY_PATH

beforeEach(() => {
  lib = fs.mkdtempSync(path.join(os.tmpdir(), 'sp-lib-'))
  stateDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sp-state-'))
  setStateDir(stateDir)
  process.env.STUDY_LIBRARY_PATH = lib
  // 每个用例显式重置模块级 libraryPath（registerStateIpc 每次调用都会重设）
  registerStateIpc({ libraryPath: lib } as AppConfig)
})
afterEach(() => {
  fs.rmSync(lib, { recursive: true, force: true })
  fs.rmSync(stateDir, { recursive: true, force: true })
  if (OLD_ENV === undefined) delete process.env.STUDY_LIBRARY_PATH
  else process.env.STUDY_LIBRARY_PATH = OLD_ENV
})

function readStateRaw(): Record<string, unknown> {
  const p = path.join(stateDir, 'state.json')
  return fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf8')) : {}
}

describe('patchState 路由', () => {
  it('patch profile 写库内文件，state.json 不含 profile', () => {
    patchState({ profile: { name: '夜话', profile_text: 'p', preferred_topics: [] } })
    expect(loadProfile(lib).name).toBe('夜话')
    expect(readStateRaw().profile).toBeUndefined()
  })

  it('patch UI 字段只写 state.json，且不会把五字段默认值带回 state.json', () => {
    patchState({ profile: { name: '夜话', profile_text: '', preferred_topics: [] } })
    patchState({ writingFontSize: 'lg' })
    const raw = readStateRaw()
    expect(raw.writingFontSize).toBe('lg')
    for (const k of ['profile', 'anthropicBlogCache', 'anthropicBlogLastSeenAt', 'jobProfile', 'jobBriefingConfig']) {
      expect(raw[k]).toBeUndefined()
    }
  })

  it('patch anthropicBlogCache 落盘剥离 loading/error；单独 patch lastSeenAt 不清空已有缓存', () => {
    patchState({
      anthropicBlogCache: {
        lastFetchedAt: '2026-08-16T00:00:00.000Z',
        articles: [{ url: 'u1' } as any],
        loading: true,
        error: null,
        sectionStatus: {},
        articleMetaCache: {},
      },
    })
    patchState({ anthropicBlogLastSeenAt: '2026-08-16T02:00:00.000Z' })
    const raw = JSON.parse(fs.readFileSync(blogCachePathFor(lib), 'utf8'))
    expect(raw.loading).toBeUndefined()
    expect(raw.lastSeenAt).toBe('2026-08-16T02:00:00.000Z')
    expect(raw.articles).toHaveLength(1)
  })

  it('patch jobBriefingConfig 与 jobProfile 合并进同一文件', () => {
    const before = getCurrentState()
    patchState({ jobProfile: { ...before.jobProfile!, direction: 'AI 产品' } })
    patchState({ jobBriefingConfig: { ...before.jobBriefingConfig!, cities: ['上海'] } })
    const after = getCurrentState()
    expect(after.jobProfile!.direction).toBe('AI 产品')
    expect(after.jobBriefingConfig!.cities).toEqual(['上海'])
  })
})

describe('getCurrentState 叠加', () => {
  it('库内值覆盖 state.json 残留旧值', () => {
    patchState({ profile: { name: '库内值', profile_text: '', preferred_topics: [] } })
    // 模拟外部直接写 state.json（绕过 patchState）
    fs.writeFileSync(path.join(stateDir, 'state.json'), JSON.stringify({
      profile: { name: '旧残留', profile_text: '', preferred_topics: [] },
    }), 'utf8')
    expect(getCurrentState().profile.name).toBe('库内值')
  })
})

describe('读路径兜底迁移', () => {
  it('库内文件缺失且 state.json 有值时，getCurrentState 触发迁移并剥离', () => {
    // registerStateIpc 已在 beforeEach 跑过迁移（此时 state.json 为空，无操作）。
    // 模拟 E2E 启动后 seed：直接写 state.json
    fs.writeFileSync(path.join(stateDir, 'state.json'), JSON.stringify({
      profile: { name: 'seed 画像', profile_text: '', preferred_topics: [] },
    }), 'utf8')
    expect(fs.existsSync(profilePathFor(lib))).toBe(false)
    expect(getCurrentState().profile.name).toBe('seed 画像')
    expect(fs.existsSync(profilePathFor(lib))).toBe(true)
    expect(readStateRaw().profile).toBeUndefined()
  })

  it('迁移抛错时回退 state.json 真实值，不用库内空默认值覆盖，也不剥离 state.json', () => {
    // 制造迁移失败：.profile.json.tmp 占为目录 → saveProfile 的 writeFileSync(tmp) 必抛错。
    // （不能直接把 .profile.json 建成目录——existsSync 对目录为 true，迁移会跳过保存。）
    fs.mkdirSync(profilePathFor(lib) + '.tmp')
    fs.writeFileSync(path.join(stateDir, 'state.json'), JSON.stringify({
      profile: { name: '真实画像', profile_text: 'text', preferred_topics: ['x'] },
    }), 'utf8')
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const state = getCurrentState()
    errSpy.mockRestore()
    // 返回 state.json 中的真实 profile，而非库内空默认值
    expect(state.profile.name).toBe('真实画像')
    expect(state.profile.preferred_topics).toEqual(['x'])
    // 库内文件未建成、state.json 未剥离，留待下次读取重试迁移
    expect(fs.existsSync(profilePathFor(lib))).toBe(false)
    expect((readStateRaw().profile as { name?: string })?.name).toBe('真实画像')
  })
})

describe('写路径兜底迁移', () => {
  it('首个动作是 patchState（无任何 read）时先迁移，state.json 种子值不被抹掉', () => {
    // 库内文件缺失 + 外部在运行中直接写 state.json 五字段
    fs.writeFileSync(path.join(stateDir, 'state.json'), JSON.stringify({
      profile: { name: 'seed 画像', profile_text: '', preferred_topics: [] },
    }), 'utf8')
    expect(fs.existsSync(profilePathFor(lib))).toBe(false)
    // 不先调任何 read，直接 patch 无关字段
    patchState({ writingFontSize: 'lg' })
    // profile 被迁移进库内文件，而不是随 delete LIBRARY_KEYS 被抹掉
    expect(loadProfile(lib).name).toBe('seed 画像')
    const raw = readStateRaw()
    expect(raw.writingFontSize).toBe('lg')
    for (const k of ['profile', 'anthropicBlogCache', 'anthropicBlogLastSeenAt', 'jobProfile', 'jobBriefingConfig']) {
      expect(raw[k]).toBeUndefined()
    }
  })
})
