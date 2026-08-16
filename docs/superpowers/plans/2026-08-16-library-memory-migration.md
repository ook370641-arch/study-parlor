# 四类记忆迁入学习库 + writing 创建时间戳 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 profile / anthropicBlogCache+lastSeenAt / jobProfile / jobBriefingConfig 从 `~/.studyparlor/state.json` 迁入学习库内三个按域就近的文件，并给新建 writing 文章写入 `created` 时间戳。

**Architecture:** 新增 `electron/lib/library-data.ts` 作为库内三文件的唯一读写入口 + 一次性迁移函数；`electron/ipc/state.ts` 改为"读叠加、写路由"——`StateJson` 形状与 IPC 契约不变，渲染进程零改动。迁移语义为方案 A：库内是真相源，state.json 旧值仅作一次性导入来源，导入后剥离。

**Tech Stack:** Electron 30 主进程（Node fs）、Vitest、Playwright E2E。

**Spec:** `docs/superpowers/specs/2026-08-16-library-memory-migration-design.md`

## Global Constraints

- **红线**：不丢失任何文件/缓存/记忆；不改变现有应用使用体验（IPC 契约、UI 行为、E2E 语义不变）。
- 布局（逐字来自 spec）：profile → `<学习库>/.profile.json`；博客缓存 → `<学习库>/Anthropic博客/.cache.json`；求职 → `<学习库>/求职简报/.config.json`。
- 迁移 = 方案 A：库内文件存在时 state.json 旧值**直接丢弃**，绝不覆盖库内。
- `loading`/`error` 是运行时瞬态，不落盘；读取时补 `loading: false, error: null`。
- writing 时间戳：**只记新文章**；旧文章不回填；改名/移动/保存不得改动 `created`；本次不做 UI 展示。
- 测试纪律（rules/general.md §9）：只跑受影响测试文件，禁止 `npx vitest run` 全量；E2E 用 `node scripts/e2e-changed.js --run --no-retries`。
- 单元测试 import 主进程模块无需 mock `electron`：`vitest.config.ts` 的 `mock-electron` 插件已在 resolve 层提供 `ipcMain.handle`/`safeStorage` 桩。
- 提交信息遵循仓库中文 conventional commits 风格（如 `feat(state): ...`）。

---

### Task 1: `electron/lib/library-data.ts` —— 库内三文件读写 + 迁移函数

**Files:**
- Create: `electron/lib/library-data.ts`
- Test: `tests/library-data.test.ts`

**Interfaces:**
- Consumes: `safeReadJson/safeWriteJson`（`electron/lib/safe-json.ts`）；`normalizeJobBriefingConfig`+`DEFAULT_JOB_BRIEFING_CONFIG`（`electron/lib/job-briefing.ts`）；`normalizeJobProfile`+`DEFAULT_JOB_PROFILE`（`src/lib/job-briefing-defaults.ts`）；类型 `Profile, AnthropicBlogCache, JobProfile, JobBriefingConfig`（`@shared/index`）。
- Produces（Task 2 依赖这些确切签名）:
  - `DEFAULT_PROFILE: Profile`
  - `profilePathFor(lib: string): string` → `<lib>/.profile.json`
  - `blogCachePathFor(lib: string): string` → `<lib>/Anthropic博客/.cache.json`
  - `jobDataPathFor(lib: string): string` → `<lib>/求职简报/.config.json`
  - `loadProfile(lib: string): Profile`
  - `saveProfile(lib: string, profile: Profile): void`
  - `loadBlogCache(lib: string): { cache: AnthropicBlogCache; lastSeenAt: string | null }`
  - `saveBlogCache(lib: string, cache: AnthropicBlogCache, lastSeenAt: string | null): void`（落盘时剥离 `loading`/`error`）
  - `loadJobData(lib: string): { jobProfile: JobProfile; jobBriefingConfig: JobBriefingConfig }`
  - `saveJobData(lib: string, patch: { jobProfile?: JobProfile; jobBriefingConfig?: JobBriefingConfig }): void`（读-合并-写，只更新传入的 key）
  - `migrateLibraryData(lib: string, stateDir: string): void`（幂等）

- [ ] **Step 1: 写失败测试 `tests/library-data.test.ts`**

```ts
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
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run tests/library-data.test.ts`
Expected: FAIL（`Cannot find module '../electron/lib/library-data'`）

- [ ] **Step 3: 实现 `electron/lib/library-data.ts`**

```ts
// electron/lib/library-data.ts
import fs from 'node:fs'
import path from 'node:path'
import { safeReadJson, safeWriteJson } from './safe-json'
import { normalizeJobBriefingConfig, DEFAULT_JOB_BRIEFING_CONFIG } from './job-briefing'
import { normalizeJobProfile, DEFAULT_JOB_PROFILE } from '../../src/lib/job-briefing-defaults'
import type { Profile, AnthropicBlogCache, JobProfile, JobBriefingConfig } from '@shared/index'

export const DEFAULT_PROFILE: Profile = { name: '', profile_text: '', preferred_topics: [] }

/** .cache.json 落盘形状：loading/error 为运行时瞬态，不落盘 */
type BlogCacheFile = {
  lastFetchedAt: string | null
  articles: AnthropicBlogCache['articles']
  sectionStatus: NonNullable<AnthropicBlogCache['sectionStatus']>
  articleMetaCache: NonNullable<AnthropicBlogCache['articleMetaCache']>
  lastSeenAt: string | null
}

const DEFAULT_BLOG_CACHE_FILE: BlogCacheFile = {
  lastFetchedAt: null,
  articles: [],
  sectionStatus: {},
  articleMetaCache: {},
  lastSeenAt: null,
}

export function profilePathFor(lib: string): string {
  return path.join(lib, '.profile.json')
}
export function blogCachePathFor(lib: string): string {
  return path.join(lib, 'Anthropic博客', '.cache.json')
}
export function jobDataPathFor(lib: string): string {
  return path.join(lib, '求职简报', '.config.json')
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

export function loadJobData(lib: string): { jobProfile: JobProfile; jobBriefingConfig: JobBriefingConfig } {
  const raw = safeReadJson<{ jobProfile?: unknown; jobBriefingConfig?: unknown }>(jobDataPathFor(lib), { fallback: {} })
  return {
    jobProfile: normalizeJobProfile(raw.jobProfile as JobProfile | undefined),
    jobBriefingConfig: normalizeJobBriefingConfig(raw.jobBriefingConfig as JobBriefingConfig | undefined),
  }
}

export function saveJobData(
  lib: string,
  patch: { jobProfile?: JobProfile; jobBriefingConfig?: JobBriefingConfig }
): void {
  const cur = loadJobData(lib)
  safeWriteJson(jobDataPathFor(lib), {
    jobProfile: patch.jobProfile ?? cur.jobProfile,
    jobBriefingConfig: patch.jobBriefingConfig ?? cur.jobBriefingConfig,
  })
}

// ── 一次性迁移（方案 A：库内为真相源，state.json 导入后剥离） ──

const MIGRATED_KEYS = [
  'profile',
  'anthropicBlogCache',
  'anthropicBlogLastSeenAt',
  'jobProfile',
  'jobBriefingConfig',
] as const

function isNonDefaultProfile(p: Profile | undefined): boolean {
  return !!p && (!!p.name || !!p.profile_text || (Array.isArray(p.preferred_topics) && p.preferred_topics.length > 0))
}

function isNonDefaultBlogCache(c: AnthropicBlogCache | undefined, lastSeenAt: unknown): boolean {
  return !!((c && ((c.articles?.length ?? 0) > 0 || c.lastFetchedAt)) || typeof lastSeenAt === 'string')
}

function isNonDefaultJobData(jp: unknown, jc: unknown): boolean {
  return (
    JSON.stringify(normalizeJobProfile(jp as JobProfile | undefined)) !== JSON.stringify(normalizeJobProfile(undefined)) ||
    JSON.stringify(normalizeJobBriefingConfig(jc as JobBriefingConfig | undefined)) !== JSON.stringify(DEFAULT_JOB_BRIEFING_CONFIG)
  )
}

/**
 * 把 state.json 中的四类记忆迁入学习库（仅在库内文件缺失且值非默认时写入），
 * 然后无条件从 state.json 剥离这五个 key。幂等；库内已存在时绝不覆盖。
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

  if (!fs.existsSync(jobDataPathFor(lib))) {
    const jp = raw.jobProfile
    const jc = raw.jobBriefingConfig
    if (jp !== undefined || jc !== undefined) {
      if (isNonDefaultJobData(jp, jc)) {
        saveJobData(lib, {
          jobProfile: normalizeJobProfile(jp as JobProfile | undefined),
          jobBriefingConfig: normalizeJobBriefingConfig(jc as JobBriefingConfig | undefined),
        })
      }
    }
  }

  const stripped = { ...raw }
  for (const k of MIGRATED_KEYS) delete stripped[k]
  safeWriteJson(statePath, stripped)
}
```

注意：`DEFAULT_JOB_PROFILE` import 后在当前实现中可能未被直接引用（默认值判定用 `normalizeJobProfile(undefined)`），若 TS 报未使用则删掉该 import，不要留着。

- [ ] **Step 4: 跑测试确认通过**

Run: `npx vitest run tests/library-data.test.ts`
Expected: PASS（9 个用例）

- [ ] **Step 5: Commit**

```bash
git add electron/lib/library-data.ts tests/library-data.test.ts
git commit -m "feat(state): library-data 模块——库内三文件读写 + state.json 一次性迁移（方案A）"
```

---

### Task 2: `state.ts` 读叠加 + 写路由 + 启动/读路径迁移接线

**Files:**
- Modify: `electron/ipc/state.ts`（整体重写，见 Step 3）
- Modify: `electron/ipc/index.ts:25`（`registerStateIpc()` → `registerStateIpc(cfg)`）
- Test: `tests/state-library.test.ts`（新建）

**Interfaces:**
- Consumes: Task 1 的全部 load/save/migrate 函数 + `DEFAULT_PROFILE`；`getStateDir`（`electron/env.ts`）；`AppConfig`（`electron/env.ts`）。
- Produces: `registerStateIpc(cfg?: AppConfig): void`（签名变化，ipc/index.ts 同步）；`getCurrentState(): StateJson`、`patchState(patch: Partial<StateJson>): void` 签名不变——所有消费方（anthropic.ts / job-briefing.ts / llm-tasks.ts / briefing.ts / files.ts）零改动。

关键行为约束（实现必须与之一致）：

1. `getCurrentState()` / `state:get` = 读 state.json（fresh，无缓存）+ 叠加三个库内文件；叠加前执行一次 `migrateLibraryData`（读路径兜底，覆盖 E2E 启动后 seed / 降级再升级路径）。
2. `patchState` 按 key 分流：五个库内 key（`profile`/`anthropicBlogCache`/`anthropicBlogLastSeenAt`/`jobBriefingConfig`/`jobProfile`）写库内文件，其余写 state.json。
3. **陷阱**：写 state.json 的合并基座含 `DEFAULT`（其中有五字段默认值），落盘前必须显式 `delete`，否则任何无关 patch 都会把刚剥离的 key 重新写回 state.json。
4. `libraryPath` 解析：模块级变量（`registerStateIpc(cfg)` 注入）+ 惰性回退 `process.env.STUDY_LIBRARY_PATH`（`setup:writeConfig` 在 IPC 注册前 patch profile 的路径依赖此回退）。解析为 null 时（向导前）：五 key 退回写 state.json（旧行为），不跑迁移。
5. 删除现有 `currentState` 缓存与 `loadState()`——fresh 读取代之（`state:get` 本就是 fresh 读，此为对齐；删除的理由是本改动使其成为死代码）。

- [ ] **Step 1: 写失败测试 `tests/state-library.test.ts`**

```ts
// tests/state-library.test.ts
// vitest.config.ts 的 mock-electron 插件已提供 ipcMain.handle 桩，无需 vi.mock
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
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
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run tests/state-library.test.ts`
Expected: FAIL（`registerStateIpc` 不接受参数 / 路由未实现，多个断言挂）

- [ ] **Step 3: 重写 `electron/ipc/state.ts`**

完整替换为：

```ts
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
    console.error('[state] library migration failed:', err)
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
    // 否则任何无关 patch 都会把已剥离的 key 重新写回 state.json
    if (lib) {
      for (const k of LIBRARY_KEYS) delete merged[k]
    }

    safeWriteJson(getStateFile(), merged)
  }

  if (Object.keys(libraryPatch).length > 0 && lib) {
    if (libraryPatch.profile) {
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
```

并修改 `electron/ipc/index.ts:25`：`registerStateIpc()` → `registerStateIpc(cfg)`。

- [ ] **Step 4: 跑测试确认通过**

Run: `npx vitest run tests/state-library.test.ts tests/library-data.test.ts`
Expected: PASS

- [ ] **Step 5: 跑消费方既有测试，确认零回归**

Run: `npx vitest run tests/anthropic.test.ts tests/job-briefing.test.ts tests/store.test.ts tests/assistant-settings.test.ts`
Expected: PASS（这些覆盖 `getCurrentState`/`patchState` 的消费方；若某文件不存在或与本改动无关的失败，先确认失败在 main 上可复现再判断归属）

- [ ] **Step 6: Commit**

```bash
git add electron/ipc/state.ts electron/ipc/index.ts tests/state-library.test.ts
git commit -m "feat(state): 四类记忆读写路由到学习库——state.json 只留 UI 偏好与推荐缓存"
```

---

### Task 3: writing `createFile` 写入 `created` 时间戳

**Files:**
- Modify: `electron/lib/writing-tree.ts:147`
- Test: `tests/writing-created.test.ts`（新建）

**Interfaces:**
- Consumes: `createFile(lib, root, dir, name): string`、`writeWritingFile(lib, rel, body): void`、`renameNode(lib, rel, newName): string`、`moveNode(lib, rel, targetDir): string`、`readWritingFile(lib, rel)`（均在 `electron/lib/writing-tree.ts`，已存在）。
- Produces: 无新接口；新建 writing 文件 frontmatter 变为 `{ type: 'writing', created: <ISO 8601> }`。

- [ ] **Step 1: 写失败测试 `tests/writing-created.test.ts`**

```ts
// tests/writing-created.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import matter from 'gray-matter'
import { createFile, writeWritingFile, renameNode, moveNode } from '../electron/lib/writing-tree'

let lib: string

beforeEach(() => {
  lib = fs.mkdtempSync(path.join(os.tmpdir(), 'sp-writing-'))
})
afterEach(() => {
  fs.rmSync(lib, { recursive: true, force: true })
})

function readFm(rel: string): Record<string, unknown> {
  return matter(fs.readFileSync(path.join(lib, rel), 'utf-8')).data
}

describe('writing created 时间戳', () => {
  it('新建文章 frontmatter 含 ISO created', () => {
    const rel = createFile(lib, 'writing', '', '测试文章')
    const fm = readFm(rel)
    expect(fm.type).toBe('writing')
    expect(typeof fm.created).toBe('string')
    expect(Number.isNaN(Date.parse(fm.created as string))).toBe(false)
  })

  it('保存（writeWritingFile）后 created 不变', () => {
    const rel = createFile(lib, 'writing', '', '测试文章')
    const created = readFm(rel).created
    writeWritingFile(lib, rel, '正文内容')
    expect(readFm(rel).created).toBe(created)
  })

  it('改名与移动后 created 不变', () => {
    const rel = createFile(lib, 'writing', '', '测试文章')
    const created = readFm(rel).created
    const renamed = renameNode(lib, rel, '新名字.md')
    const moved = moveNode(lib, renamed, 'writing/分组A')
    expect(readFm(moved).created).toBe(created)
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run tests/writing-created.test.ts`
Expected: FAIL（第一个用例：`fm.created` 为 undefined）

- [ ] **Step 3: 修改 `electron/lib/writing-tree.ts:147`**

```ts
// 改前
const frontmatter = { type: 'writing' as const }
// 改后
const frontmatter = { type: 'writing' as const, created: new Date().toISOString() }
```

（`writeWritingFile` 走 `...existingFm` 合并路径，`created` 天然保留；`renameNode`/`moveNode` 是 `fs.rename`，不动内容。均无需改。）

- [ ] **Step 4: 跑测试确认通过**

Run: `npx vitest run tests/writing-created.test.ts`
Expected: PASS（3 个用例）

- [ ] **Step 5: 跑 writing 域既有测试确认零回归**

Run: `npx vitest run tests/writing-tree-utils.test.ts tests/writing-ipc.test.ts tests/writing-roundtrip.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add electron/lib/writing-tree.ts tests/writing-created.test.ts
git commit -m "feat(writing): 新建文章 frontmatter 写入 created 时间戳（改名/移动/保存不改动）"
```

---

### Task 4: E2E 定向验证与修复

**Files:**
- Modify: `e2e/helpers/test-library.ts`（新增 `seedLibraryData` helper）
- Modify（按需，仅当定向跑挂掉时）: 受影响的 spec 文件
- Modify: `e2e/source-map.json`（把新源码 `electron/lib/library-data.ts` 登记进覆盖 anthropic 博客 / 求职简报 / state 的 groups）
- Modify（按需）: `e2e/README.md`（若 helpers 清单存在，补 `seedLibraryData` 一行）

**Interfaces:**
- Consumes: Task 1-3 的全部产物。
- Produces: `seedLibraryData(libPath: string, data: { profile?: Profile; blogCache?: Record<string, unknown>; jobData?: { jobProfile?: Record<string, unknown>; jobBriefingConfig?: Record<string, unknown> } }): void`——直写库内三文件的 seed helper，供"启动后 re-seed"场景的 spec 使用。

- [ ] **Step 1: 在 `e2e/helpers/test-library.ts` 末尾追加 helper**

```ts
/**
 * 直写学习库内的记忆文件（.profile.json / Anthropic博客/.cache.json / 求职简报/.config.json）。
 * 用途：state.json 五字段已迁入库内——启动前 seed 可靠迁移兜底生效，
 * 但"app 运行中 re-seed 覆盖已有库内文件"的场景必须用本 helper 直写库内。
 */
export function seedLibraryData(
  libPath: string,
  data: {
    profile?: { name: string; profile_text: string; preferred_topics: string[] }
    blogCache?: Record<string, unknown>
    jobData?: { jobProfile?: Record<string, unknown>; jobBriefingConfig?: Record<string, unknown> }
  }
): void {
  if (data.profile) {
    fs.writeFileSync(path.join(libPath, '.profile.json'), JSON.stringify(data.profile, null, 2))
  }
  if (data.blogCache) {
    const dir = path.join(libPath, 'Anthropic博客')
    fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(
      path.join(dir, '.cache.json'),
      JSON.stringify(
        { lastFetchedAt: null, articles: [], sectionStatus: {}, articleMetaCache: {}, lastSeenAt: null, ...data.blogCache },
        null,
        2
      )
    )
  }
  if (data.jobData) {
    const dir = path.join(libPath, '求职简报')
    fs.mkdirSync(dir, { recursive: true })
    const file = path.join(dir, '.config.json')
    const cur = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : {}
    fs.writeFileSync(file, JSON.stringify({ ...cur, ...data.jobData }, null, 2))
  }
}
```

- [ ] **Step 2: 登记 source-map**

在 `e2e/source-map.json` 中找到覆盖 `electron/ipc/state.ts` 与 `electron/ipc/anthropic.ts` 的 groups，把 `electron/lib/library-data.ts` 加进这些 group 的 sources（若 group 用目录 glob 覆盖 `electron/lib/**` 则无需改，先检查再动）。

- [ ] **Step 3: 构建并定向跑 E2E**

Run: `node scripts/e2e-changed.js --run --no-retries`
Expected: 全绿。`startup-health`（always 列表）必须通过。

- [ ] **Step 4: 若有失败，按根因修复**

判定规则：
- spec 在 **app 启动前** seed state.json（`seedStateJson`）→ 应通过迁移兜底自动生效；若仍失败，查迁移是否真跑（日志 `[state] startup migration failed`）。
- spec 在 **app 启动后** re-seed state.json 的五字段 → 库内文件已存在，seed 被忽略是**预期行为**；把该 spec 的这次 re-seed 改调 `seedLibraryData`。
- 禁止为了让测试通过而改生产代码的迁移语义（rules/e2e.md §1c：先查根因）。

- [ ] **Step 5: 若有 spec/helper/README/source-map 改动，commit**

```bash
git add e2e/
git commit -m "test(e2e): seedLibraryData 直写库内记忆文件 + source-map 登记 library-data"
```

- [ ] **Step 6: 全量单元测试以外的最终核对（人工 checklist 逐项过 spec 验收清单）**

对照 `docs/superpowers/specs/2026-08-16-library-memory-migration-design.md` 验收清单逐项确认（老用户迁移/新用户/写入落点/重启保留/created 戳/定向 E2E 绿）。
