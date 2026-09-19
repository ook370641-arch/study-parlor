# LLM 多配置切换 + 报纸主题纸白背景 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 设置页 AI 服务卡片支持多份 LLM 配置（key/baseUrl/model）的存储、新增、切换且免重启立即生效；报纸主题下设置/扩展页铺纸白背景。

**Architecture:** 配置存 `state.json`（`llmConfigs[]` + `activeLlmConfigId`），首配置由 `.env` 迁移播种；主进程共享 `cfg` 对象通过 `Object.assign` 突变实现免重启切换；设置页单配置时保持现状 UI，≥2 配置时出现切换器，新增走独立草稿区。`.env` 退为首装种子 + E2E 兜底。

**Tech Stack:** Electron 30 主进程 IPC / React 18 + Zustand / Vitest / Playwright E2E。

**Spec:** `docs/superpowers/specs/2026-09-19-llm-config-switch-design.md`

## Global Constraints

- 测试只跑定向：`npx vitest run tests/<file>`，禁止 `npx vitest run` 全量；E2E 用 `node scripts/e2e-changed.js --run --no-retries`，禁止全量。
- 提交纪律（并行会话）：每个 task 的 commit 只 `git add` 本任务列出的文件，不 add 工作区其他改动（当前工作区有他会话的 `.agents/`、`AGENTS.md`、`tests/fixtures/guide-v2-real-guide.json` 改动，一律不碰）。
- 新 IPC 按 types → handler → preload → facade → store/组件 顺序（ipc-state §1），返回 `{ ok: true, ... } | { ok: false, code }` 结构。
- 组件文件只导出组件（ui-styling §10）；helper 进 `src/lib/`。
- 所有新交互元素带 `data-testid`。
- commit message 不加 Co-Authored-By。

---

### Task 1: env.ts — 抽取 `updateEnvKeys` 并导出 `sanitizeModel`

**Files:**
- Modify: `electron/env.ts`（saveEnv 重构 + 两个导出）
- Test: `tests/env.test.ts`

**Interfaces:**
- Produces: `updateEnvKeys(updates: Record<string, string>): void`（按 key 局部更新 .env，其他行不动）；`sanitizeModel(model: string): string`（原模块私有函数改为导出，行为不变）。Task 3 的 config IPC 消费两者。

- [ ] **Step 1: 写失败测试**

`tests/env.test.ts` 末尾追加：

```ts
describe('updateEnvKeys', () => {
  it('只更新指定 key，其余行原样保留', async () => {
    const { updateEnvKeys } = await import('@electron/env')
    const fs = await import('node:fs')
    const path = await import('node:path')
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'env-'))
    // 通过 setConfigDir 定向到临时目录
    const { setConfigDir } = await import('@electron/env')
    setConfigDir(tmp)
    fs.writeFileSync(path.join(tmp, '.env'), 'KIMI_API_KEY=sk-old\nSTUDY_LIBRARY_PATH=C:/old\nTAVILY_API_KEY=tvly-keep\n')
    updateEnvKeys({ STUDY_LIBRARY_PATH: 'C:/new' })
    const content = fs.readFileSync(path.join(tmp, '.env'), 'utf-8')
    expect(content).toContain('STUDY_LIBRARY_PATH=C:/new')
    expect(content).toContain('KIMI_API_KEY=sk-old')
    expect(content).toContain('TAVILY_API_KEY=tvly-keep')
    expect(content).not.toContain('C:/old')
    setConfigDir(null)
  })

  it('key 不存在时追加到末尾', async () => {
    const { updateEnvKeys, setConfigDir } = await import('@electron/env')
    const fs = await import('node:fs')
    const path = await import('node:path')
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'env-'))
    setConfigDir(tmp)
    fs.writeFileSync(path.join(tmp, '.env'), 'KIMI_API_KEY=sk-old\n')
    updateEnvKeys({ STUDY_LIBRARY_PATH: 'C:/added' })
    expect(fs.readFileSync(path.join(tmp, '.env'), 'utf-8')).toContain('STUDY_LIBRARY_PATH=C:/added')
    setConfigDir(null)
  })
})
```

注意文件顶部若未导入 `os` 需补 `import os from 'node:os'`。若现有测试已用 `setConfigDir`，跟随其写法。

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run tests/env.test.ts`
Expected: FAIL — `updateEnvKeys is not exported`

- [ ] **Step 3: 实现**

`electron/env.ts`：
1. `function sanitizeModel` 改为 `export function sanitizeModel`。
2. `saveEnv` 重构为调用新函数（行为不变）：

```ts
export function updateEnvKeys(updates: Record<string, string>): void {
  const envPath = getEnvPath()
  fs.mkdirSync(path.dirname(envPath), { recursive: true })
  let content = ''
  if (fs.existsSync(envPath)) {
    content = fs.readFileSync(envPath, 'utf-8')
  }
  const lines = content.split(/\r?\n/)
  const updated = new Set<string>()
  const newLines = lines.map((line) => {
    const match = line.match(/^([A-Za-z0-9_]+)=/)
    if (!match || !(match[1] in updates)) return line
    updated.add(match[1])
    return `${match[1]}=${updates[match[1]]}`
  })
  for (const [k, v] of Object.entries(updates)) {
    if (!updated.has(k)) newLines.push(`${k}=${v}`)
  }
  fs.writeFileSync(envPath, newLines.join('\n') + '\n')
}

export function saveEnv(config: AppConfig): void {
  const model = sanitizeModel(config.model.trim() || DEFAULT_MODEL)
  const baseUrl = normalizeBaseUrl(config.baseUrl.trim() || DEFAULT_BASE_URL)
  updateEnvKeys({
    KIMI_API_KEY: config.apiKey.trim(),
    KIMI_BASE_URL: baseUrl,
    KIMI_MODEL: model,
    STUDY_LIBRARY_PATH: config.libraryPath.trim(),
  })
}
```

- [ ] **Step 4: 跑测试确认通过**（含既有 saveEnv 测试不回归）

Run: `npx vitest run tests/env.test.ts`
Expected: 全 PASS

- [ ] **Step 5: Commit**

```bash
git add electron/env.ts tests/env.test.ts
git commit -m "refactor(env): 抽取 updateEnvKeys 支持单 key 更新，导出 sanitizeModel"
```

---

### Task 2: LLM 配置纯逻辑 — `electron/lib/llm-configs.ts`

**Files:**
- Create: `electron/lib/llm-configs.ts`
- Create: `tests/llm-configs.test.ts`
- Modify: `src/types/index.ts`（StateJson 类型区，约 620-668 行段）
- Modify: `electron/ipc/state.ts:24-57`（DEFAULT 加两字段）

**Interfaces:**
- Produces:
  - `type LlmConfig = { id: string; apiKey: string; baseUrl: string; model: string }`（src/types/index.ts 导出）
  - `StateJson.llmConfigs?: LlmConfig[]`、`StateJson.activeLlmConfigId?: string | null`
  - `planLlmConfigs(state: { llmConfigs?: unknown; activeLlmConfigId?: unknown }, envCreds: LlmCreds): { configs: LlmConfig[]; activeId: string; changed: boolean }`
  - `createLlmConfigActions(cfg: AppConfig, io: { getState(): StateJson; patch(p: Partial<StateJson>): void }): { list(); setActive(id); save(id, fields) }` — Task 3 的 IPC handler 直接包装它。

- [ ] **Step 1: 写失败测试**

`tests/llm-configs.test.ts`：

```ts
import { describe, it, expect } from 'vitest'
import { planLlmConfigs, createLlmConfigActions } from '@electron/lib/llm-configs'
import type { LlmConfig } from '@shared/index'

const ENV = { apiKey: 'sk-env', baseUrl: 'https://api.kimi.com/coding/v1', model: 'kimi-k3' }

describe('planLlmConfigs', () => {
  it('state 无配置时从 envCreds 播种，changed=true', () => {
    const r = planLlmConfigs({}, ENV)
    expect(r.configs).toHaveLength(1)
    expect(r.configs[0]).toMatchObject(ENV)
    expect(r.configs[0].id).toMatch(/^cfg-/)
    expect(r.activeId).toBe(r.configs[0].id)
    expect(r.changed).toBe(true)
  })

  it('空数组同样触发播种', () => {
    const r = planLlmConfigs({ llmConfigs: [] }, ENV)
    expect(r.configs).toHaveLength(1)
    expect(r.changed).toBe(true)
  })

  it('已有配置且 activeId 有效 → 原样返回，changed=false', () => {
    const configs: LlmConfig[] = [{ id: 'cfg-a', ...ENV }]
    const r = planLlmConfigs({ llmConfigs: configs, activeLlmConfigId: 'cfg-a' }, ENV)
    expect(r).toEqual({ configs, activeId: 'cfg-a', changed: false })
  })

  it('activeId 悬空 → 归一到第一条，changed=true', () => {
    const configs: LlmConfig[] = [{ id: 'cfg-a', ...ENV }, { id: 'cfg-b', apiKey: 'k2', baseUrl: 'u2', model: 'm2' }]
    const r = planLlmConfigs({ llmConfigs: configs, activeLlmConfigId: 'cfg-gone' }, ENV)
    expect(r.activeId).toBe('cfg-a')
    expect(r.changed).toBe(true)
  })

  it('字段非字符串 → 归一为落空串并标记 changed', () => {
    const r = planLlmConfigs({ llmConfigs: [{ id: 'cfg-a', apiKey: 42, baseUrl: null, model: 'm' }], activeLlmConfigId: 'cfg-a' }, ENV)
    expect(r.configs[0]).toEqual({ id: 'cfg-a', apiKey: '', baseUrl: '', model: 'm' })
    expect(r.changed).toBe(true)
  })

  it('重复 id 去重', () => {
    const r = planLlmConfigs({ llmConfigs: [{ id: 'cfg-a', ...ENV }, { id: 'cfg-a', ...ENV }], activeLlmConfigId: 'cfg-a' }, ENV)
    expect(r.configs).toHaveLength(1)
    expect(r.changed).toBe(true)
  })
})

describe('createLlmConfigActions', () => {
  function makeIO(initial: { llmConfigs?: LlmConfig[]; activeLlmConfigId?: string | null }) {
    let state: any = { ...initial }
    return {
      io: {
        getState: () => state,
        patch: (p: any) => { state = { ...state, ...p } },
      },
      read: () => state,
    }
  }
  const makeCfg = () => ({ apiKey: 'sk-env', baseUrl: 'https://api.kimi.com/coding/v1', model: 'kimi-k3', libraryPath: '/lib' })

  it('list 首次触发播种并持久化', () => {
    const { io, read } = makeIO({})
    const actions = createLlmConfigActions(makeCfg(), io)
    const { configs, activeId } = actions.list()
    expect(configs).toHaveLength(1)
    expect(read().llmConfigs).toHaveLength(1)
    expect(read().activeLlmConfigId).toBe(activeId)
  })

  it('setActive 突变 cfg 三字段并持久化 activeId', () => {
    const cfgs: LlmConfig[] = [
      { id: 'cfg-a', apiKey: 'sk-a', baseUrl: 'u-a', model: 'm-a' },
      { id: 'cfg-b', apiKey: 'sk-b', baseUrl: 'u-b', model: 'm-b' },
    ]
    const { io, read } = makeIO({ llmConfigs: cfgs, activeLlmConfigId: 'cfg-a' })
    const cfg = makeCfg()
    const actions = createLlmConfigActions(cfg, io)
    expect(actions.setActive('cfg-b')).toEqual({ ok: true })
    expect([cfg.apiKey, cfg.baseUrl, cfg.model]).toEqual(['sk-b', 'u-b', 'm-b'])
    expect(cfg.libraryPath).toBe('/lib') // libraryPath 不动
    expect(read().activeLlmConfigId).toBe('cfg-b')
  })

  it('setActive 未知 id → 错误码', () => {
    const { io } = makeIO({ llmConfigs: [{ id: 'cfg-a', ...ENV }], activeLlmConfigId: 'cfg-a' })
    expect(createLlmConfigActions(makeCfg(), io).setActive('nope')).toEqual({ ok: false, code: 'LLM_CONFIG_NOT_FOUND' })
  })

  it('save(null, ...) 新建并返回新 id；保存激活项同步突变 cfg', () => {
    const cfgs: LlmConfig[] = [{ id: 'cfg-a', apiKey: 'sk-a', baseUrl: 'u-a', model: 'm-a' }]
    const { io, read } = makeIO({ llmConfigs: cfgs, activeLlmConfigId: 'cfg-a' })
    const cfg = makeCfg()
    const actions = createLlmConfigActions(cfg, io)

    const created = actions.save(null, { apiKey: 'sk-b', baseUrl: 'u-b', model: 'm-b' })
    expect(created.ok).toBe(true)
    if (!created.ok) return
    expect(read().llmConfigs).toHaveLength(2)
    expect(cfg.model).toBe('m-a') // 新建非激活，不突变

    actions.save('cfg-a', { apiKey: 'sk-a2', baseUrl: 'u-a2', model: 'm-a2' })
    expect([cfg.apiKey, cfg.baseUrl, cfg.model]).toEqual(['sk-a2', 'u-a2', 'm-a2'])
    expect(read().llmConfigs[0].model).toBe('m-a2')
  })

  it('save 未知 id → 错误码', () => {
    const { io } = makeIO({ llmConfigs: [{ id: 'cfg-a', ...ENV }], activeLlmConfigId: 'cfg-a' })
    expect(createLlmConfigActions(makeCfg(), io).save('nope', ENV)).toEqual({ ok: false, code: 'LLM_CONFIG_NOT_FOUND' })
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run tests/llm-configs.test.ts`
Expected: FAIL — 模块不存在

- [ ] **Step 3: 实现**

`src/types/index.ts` — StateJson 前新增类型，StateJson 内加两字段：

```ts
export type LlmConfig = { id: string; apiKey: string; baseUrl: string; model: string }
```

StateJson 中加（紧跟 `archivedTopics` 行后）：

```ts
  /** LLM 多配置：首条由 .env 迁移播种；切换免重启 */
  llmConfigs?: LlmConfig[]
  activeLlmConfigId?: string | null
```

`electron/ipc/state.ts` DEFAULT 对象末尾（`archivedTopics: [],` 后）加：

```ts
  llmConfigs: [],
  activeLlmConfigId: null,
```

`electron/lib/llm-configs.ts`：

```ts
import { randomUUID } from 'node:crypto'
import type { AppConfig } from '../env'
import { sanitizeModel } from '../env'
import type { LlmConfig, StateJson } from '@shared/index'

export type LlmCreds = { apiKey: string; baseUrl: string; model: string }

export function credsOf(c: LlmCreds): LlmCreds {
  return { apiKey: c.apiKey, baseUrl: c.baseUrl, model: c.model }
}

function normalizeConfigs(raw: unknown): { configs: LlmConfig[]; changed: boolean } {
  if (!Array.isArray(raw)) return { configs: [], changed: raw !== undefined }
  let changed = false
  const seen = new Set<string>()
  const configs: LlmConfig[] = []
  for (const item of raw) {
    if (!item || typeof item !== 'object' || typeof (item as any).id !== 'string' || !(item as any).id) {
      changed = true
      continue
    }
    if (seen.has((item as any).id)) { changed = true; continue }
    seen.add((item as any).id)
    const c = item as Record<string, unknown>
    const cfg: LlmConfig = {
      id: c.id as string,
      apiKey: typeof c.apiKey === 'string' ? c.apiKey : '',
      baseUrl: typeof c.baseUrl === 'string' ? c.baseUrl : '',
      model: typeof c.model === 'string' ? c.model : '',
    }
    if (cfg.apiKey !== c.apiKey || cfg.baseUrl !== c.baseUrl || cfg.model !== c.model) changed = true
    configs.push(cfg)
  }
  return { configs, changed }
}

/**
 * 读 state 的 llmConfigs/activeLlmConfigId，返回规范化结果。
 * changed=true 表示调用方应把 configs/activeId 持久化回 state.json。
 */
export function planLlmConfigs(
  state: { llmConfigs?: unknown; activeLlmConfigId?: unknown },
  envCreds: LlmCreds
): { configs: LlmConfig[]; activeId: string; changed: boolean } {
  const { configs, changed } = normalizeConfigs(state.llmConfigs)
  if (configs.length === 0) {
    const seeded: LlmConfig = { id: `cfg-${randomUUID()}`, ...credsOf(envCreds) }
    return { configs: [seeded], activeId: seeded.id, changed: true }
  }
  const rawActive = typeof state.activeLlmConfigId === 'string' ? state.activeLlmConfigId : null
  const activeId = rawActive && configs.some(c => c.id === rawActive) ? rawActive : configs[0].id
  return { configs, activeId, changed: changed || activeId !== rawActive }
}

export type LlmConfigActions = {
  list: () => { configs: LlmConfig[]; activeId: string }
  setActive: (id: string) => { ok: true } | { ok: false; code: 'LLM_CONFIG_NOT_FOUND' }
  save: (id: string | null, fields: LlmCreds) => { ok: true; id: string } | { ok: false; code: 'LLM_CONFIG_NOT_FOUND' }
}

/**
 * cfg 是 registerAllIpc 共享的可变持有者：setActive/保存激活项时 Object.assign
 * 突变三字段，所有 IPC 闭包即时可见 → 免重启切换。libraryPath 不动。
 */
export function createLlmConfigActions(
  cfg: AppConfig,
  io: { getState: () => StateJson; patch: (p: Partial<StateJson>) => void }
): LlmConfigActions {
  const plan = () => {
    const planned = planLlmConfigs(io.getState(), credsOf(cfg))
    if (planned.changed) {
      io.patch({ llmConfigs: planned.configs, activeLlmConfigId: planned.activeId })
    }
    return planned
  }

  return {
    list: () => {
      const { configs, activeId } = plan()
      return { configs, activeId }
    },
    setActive: (id) => {
      const { configs, activeId } = plan()
      const target = configs.find(c => c.id === id)
      if (!target) return { ok: false, code: 'LLM_CONFIG_NOT_FOUND' }
      if (id !== activeId) io.patch({ activeLlmConfigId: id })
      Object.assign(cfg, credsOf(target))
      return { ok: true }
    },
    save: (id, fields) => {
      const { configs, activeId } = plan()
      const clean: LlmCreds = {
        apiKey: (fields.apiKey ?? '').trim(),
        baseUrl: (fields.baseUrl ?? '').trim(),
        model: sanitizeModel((fields.model ?? '').trim()),
      }
      if (id === null) {
        const newId = `cfg-${randomUUID()}`
        io.patch({ llmConfigs: [...configs, { id: newId, ...clean }] })
        if (newId === activeId) Object.assign(cfg, clean) // 防御：理论上不可能
        return { ok: true, id: newId }
      }
      if (!configs.some(c => c.id === id)) return { ok: false, code: 'LLM_CONFIG_NOT_FOUND' }
      io.patch({ llmConfigs: configs.map(c => (c.id === id ? { ...c, ...clean } : c)) })
      if (id === activeId) Object.assign(cfg, clean)
      return { ok: true, id }
    },
  }
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `npx vitest run tests/llm-configs.test.ts tests/env.test.ts`
Expected: 全 PASS

- [ ] **Step 5: Commit**

```bash
git add electron/lib/llm-configs.ts tests/llm-configs.test.ts src/types/index.ts electron/ipc/state.ts
git commit -m "feat(llm-config): 多配置纯逻辑——播种/归一/切换突变持有者"
```

---

### Task 3: 主进程接线 — config IPC + boot 迁移 + preload/facade

**Files:**
- Modify: `electron/ipc/config.ts`（整文件重写）
- Modify: `electron/ipc/index.ts:23`（registerConfigIpc 传 cfg）
- Modify: `electron/main.ts`（runBootSequence 开头，约 329 行）
- Modify: `electron/preload.ts`（约 83-84 行附近）
- Modify: `src/lib/ipc.ts`（约 61-62 行附近）
- Modify: `src/types/index.ts`（IpcApi，约 773-774 行附近）

**Interfaces:**
- Consumes: Task 2 的 `createLlmConfigActions` / `planLlmConfigs` / `credsOf`；Task 1 的 `updateEnvKeys`。
- Produces（IpcApi 新方法，渲染层 Task 4 消费）：
  - `llmConfigList: () => Promise<{ configs: LlmConfig[]; activeId: string }>`
  - `llmConfigSetActive: (id: string) => Promise<{ ok: true } | { ok: false; code: string }>`
  - `llmConfigSave: (id: string | null, fields: { apiKey: string; baseUrl: string; model: string }) => Promise<{ ok: true; id: string } | { ok: false; code: string }>`
  - `configSetLibraryPath: (path: string) => Promise<{ ok: true }>`

- [ ] **Step 1: 审计注册时解构（spec 前置审计）**

Run: `grep -rn "const { .*} = cfg" electron/ipc/ electron/main.ts`
Expected: 无对 `apiKey`/`baseUrl`/`model` 的注册时解构。若发现，改为访问时 `cfg.xxx`（`libraryPath` 快照可容忍，不动）。

- [ ] **Step 2: 重写 `electron/ipc/config.ts`**

```ts
import { ipcMain } from 'electron'
import { loadEnv, saveEnv, updateEnvKeys } from '../env'
import type { AppConfig } from '../env'
import { getCurrentState, patchState } from './state'
import { createLlmConfigActions, type LlmCreds } from '../lib/llm-configs'

export function registerConfigIpc(cfg: AppConfig) {
  const actions = createLlmConfigActions(cfg, { getState: getCurrentState, patch: patchState })

  ipcMain.handle('config:get', async (): Promise<AppConfig> => {
    return loadEnv(process.env)
  })

  ipcMain.handle('config:write', async (_, config: AppConfig): Promise<void> => {
    saveEnv(config)
  })

  ipcMain.handle('llmConfig:list', async () => actions.list())

  ipcMain.handle('llmConfig:setActive', async (_, id: string) => actions.setActive(id))

  ipcMain.handle('llmConfig:save', async (_, id: string | null, fields: LlmCreds) => actions.save(id, fields))

  ipcMain.handle('config:setLibraryPath', async (_, p: string) => {
    updateEnvKeys({ STUDY_LIBRARY_PATH: p.trim() })
    return { ok: true as const }
  })
}
```

`config:write` 暂保留（Task 4 收尾时若确认无渲染层引用再删，见 Task 4 Step 5）。

- [ ] **Step 3: `electron/ipc/index.ts` 第 23 行**

`registerConfigIpc()` → `registerConfigIpc(cfg)`

- [ ] **Step 4: `electron/main.ts` runBootSequence 开头接线**

先确认 main.ts 顶部已 import（`patchState` 已在用，约 283 行；若无 `getCurrentState` 则补 import）。在 `runBootSequence(cfg, win)` 函数体最前面插入：

```ts
  // LLM 多配置：state.json 无配置时从 .env 播种首条；把激活配置套用到共享 cfg 持有者。
  // 必须先于 registerAllIpc/probeModel，保证探活与所有 IPC 用的是激活配置。
  const planned = planLlmConfigs(getCurrentState(), { apiKey: cfg.apiKey, baseUrl: cfg.baseUrl, model: cfg.model })
  if (planned.changed) {
    patchState({ llmConfigs: planned.configs, activeLlmConfigId: planned.activeId })
  }
  const activeLlm = planned.configs.find(c => c.id === planned.activeId)!
  Object.assign(cfg, { apiKey: activeLlm.apiKey, baseUrl: activeLlm.baseUrl, model: activeLlm.model })
```

并补 import：`import { planLlmConfigs } from './lib/llm-configs'`。

- [ ] **Step 5: preload.ts 暴露**

`electron/preload.ts` 在 `writeConfig` 行附近新增：

```ts
  llmConfigList: () => ipcRenderer.invoke('llmConfig:list'),
  llmConfigSetActive: (id: string) => ipcRenderer.invoke('llmConfig:setActive', id),
  llmConfigSave: (id: string | null, fields: { apiKey: string; baseUrl: string; model: string }) =>
    ipcRenderer.invoke('llmConfig:save', id, fields),
  configSetLibraryPath: (p: string) => ipcRenderer.invoke('config:setLibraryPath', p),
```

- [ ] **Step 6: IpcApi 类型**

`src/types/index.ts` IpcApi 中 `writeConfig` 行后新增：

```ts
  llmConfigList: () => Promise<{ configs: LlmConfig[]; activeId: string }>
  llmConfigSetActive: (id: string) => Promise<{ ok: true } | { ok: false; code: string }>
  llmConfigSave: (id: string | null, fields: { apiKey: string; baseUrl: string; model: string }) => Promise<{ ok: true; id: string } | { ok: false; code: string }>
  configSetLibraryPath: (path: string) => Promise<{ ok: true }>
```

- [ ] **Step 7: 渲染 facade**

`src/lib/ipc.ts` 在 `writeConfig` getter 后新增：

```ts
  get llmConfigList() { return ensure().llmConfigList },
  get llmConfigSetActive() { return ensure().llmConfigSetActive },
  get llmConfigSave() { return ensure().llmConfigSave },
  get configSetLibraryPath() { return ensure().configSetLibraryPath },
```

- [ ] **Step 8: 类型检查 + 回归测试**

Run: `npx tsc --noEmit`（若项目分 tsconfig 则用 `npx electron-vite build` 代替验证编译）
Run: `npx vitest run tests/llm-configs.test.ts tests/env.test.ts tests/settings.test.tsx`
Expected: 编译通过；前两个 PASS（settings.test.tsx 此时因 UI 未改仍 PASS——它 mock 的是旧接口，Task 4 才重写）

- [ ] **Step 9: Commit**

```bash
git add electron/ipc/config.ts electron/ipc/index.ts electron/main.ts electron/preload.ts src/types/index.ts src/lib/ipc.ts
git commit -m "feat(llm-config): 主进程接线——config IPC 四方法 + boot 迁移播种 + 共享持有者突变"
```

---

### Task 4: 渲染层 — LlmConfigCard 三态 UI + Settings 集成

**Files:**
- Create: `src/lib/llm-configs.ts`（label 派生，纯函数）
- Create: `src/components/settings/LlmConfigCard.tsx`
- Modify: `src/pages/Settings.tsx`（AI 服务卡片替换为 LlmConfigCard；学习库卡片加独立保存；删底部全局保存区）
- Test: `tests/settings.test.tsx`（整文件重写）
- Create: `tests/llm-config-label.test.ts`

**Interfaces:**
- Consumes: Task 3 的四个 facade 方法 + 既有 `setupProbeKey` / `getConfig`（libraryPath 来源）。
- Produces: `llmConfigLabel(c: LlmConfig, all: LlmConfig[]): string`；`<LlmConfigCard isAcademic showToast onError />`。

- [ ] **Step 1: label 派生失败测试**

`tests/llm-config-label.test.ts`：

```ts
import { describe, it, expect } from 'vitest'
import { llmConfigLabel } from '@/lib/llm-configs'
import type { LlmConfig } from '@shared/index'

const a: LlmConfig = { id: 'cfg-a', apiKey: '', baseUrl: 'https://api.kimi.com/coding/v1', model: 'kimi-k3' }
const b: LlmConfig = { id: 'cfg-b', apiKey: '', baseUrl: 'https://api.deepseek.com/v1', model: 'deepseek-v4-pro' }

describe('llmConfigLabel', () => {
  it('默认用 model 名', () => {
    expect(llmConfigLabel(a, [a, b])).toBe('kimi-k3')
  })
  it('model 为空时用 host', () => {
    const c = { ...a, model: '' }
    expect(llmConfigLabel(c, [c])).toBe('api.kimi.com')
  })
  it('model 重名时追加 @host 区分', () => {
    const d: LlmConfig = { id: 'cfg-d', apiKey: '', baseUrl: 'https://relay.example.com/v1', model: 'kimi-k3' }
    expect(llmConfigLabel(a, [a, d])).toBe('kimi-k3@api.kimi.com')
    expect(llmConfigLabel(d, [a, d])).toBe('kimi-k3@relay.example.com')
  })
  it('model 与 host 都为空 → 未命名配置', () => {
    const c = { ...a, model: '', baseUrl: '' }
    expect(llmConfigLabel(c, [c])).toBe('未命名配置')
  })
})
```

Run: `npx vitest run tests/llm-config-label.test.ts` → FAIL（模块不存在）

- [ ] **Step 2: 实现 label**

`src/lib/llm-configs.ts`：

```ts
import type { LlmConfig } from '@shared/index'

function hostOf(baseUrl: string): string {
  try {
    return new URL(baseUrl).host
  } catch {
    return ''
  }
}

/** 配置条目标识：model 名；重名追加 @host；都空则「未命名配置」 */
export function llmConfigLabel(c: LlmConfig, all: LlmConfig[]): string {
  const base = c.model.trim() || hostOf(c.baseUrl) || '未命名配置'
  const dup = all.some(o => o.id !== c.id && o.model.trim() && o.model.trim() === c.model.trim())
  if (!dup || !c.model.trim()) return base
  const host = hostOf(c.baseUrl)
  return host ? `${base}@${host}` : base
}
```

Run: `npx vitest run tests/llm-config-label.test.ts` → PASS

- [ ] **Step 3: 重写 settings 组件测试（先红）**

`tests/settings.test.tsx` 整文件替换。mock 形状对应新 facade；覆盖三态与交互：

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, cleanup, within } from '@testing-library/react'
import { Settings } from '@/pages/Settings'
import { ipc } from '@/lib/ipc'
import type { LlmConfig } from '@shared/index'

vi.mock('@/lib/ipc', () => ({
  ipc: {
    getConfig: vi.fn(),
    setupProbeKey: vi.fn(),
    setupSelectDirectory: vi.fn(),
    searchCheckConfig: vi.fn(),
    setSearchApiKey: vi.fn(),
    getState: vi.fn().mockResolvedValue({}),
    llmConfigList: vi.fn(),
    llmConfigSetActive: vi.fn(),
    llmConfigSave: vi.fn(),
    configSetLibraryPath: vi.fn(),
  }
}))

const KIMI: LlmConfig = { id: 'cfg-kimi', apiKey: 'sk-kimi-test', baseUrl: 'https://api.kimi.com/coding/v1', model: 'kimi-k3' }
const DS: LlmConfig = { id: 'cfg-ds', apiKey: 'sk-ds-test', baseUrl: 'https://api.deepseek.com/v1', model: 'deepseek-v4-pro' }

function mockConfigs(configs: LlmConfig[], activeId: string) {
  vi.mocked(ipc.llmConfigList).mockResolvedValue({ configs, activeId })
}

describe('Settings · AI 服务', () => {
  beforeEach(() => {
    cleanup()
    vi.clearAllMocks()
    vi.mocked(ipc.getConfig).mockResolvedValue({
      apiKey: 'sk-kimi-test', baseUrl: 'https://api.kimi.com/coding/v1',
      model: 'kimi-k3', libraryPath: 'C:/test-library'
    })
    vi.mocked(ipc.setupProbeKey).mockResolvedValue({ ok: true })
    vi.mocked(ipc.setupSelectDirectory).mockResolvedValue({ canceled: true, path: null })
    vi.mocked(ipc.searchCheckConfig).mockResolvedValue({ configured: false })
    vi.mocked(ipc.setSearchApiKey).mockResolvedValue(undefined)
    vi.mocked(ipc.configSetLibraryPath).mockResolvedValue({ ok: true })
    mockConfigs([KIMI], 'cfg-kimi')
  })

  it('单配置：维持现状——无切换器，字段回填，有新增入口', async () => {
    render(<Settings />)
    await waitFor(() => expect(screen.getByDisplayValue('sk-kimi-test')).toBeInTheDocument())
    expect(screen.getByDisplayValue('https://api.kimi.com/coding/v1')).toBeInTheDocument()
    expect(screen.getByDisplayValue('kimi-k3')).toBeInTheDocument()
    expect(screen.queryByTestId('settings-llm-config-chip')).not.toBeInTheDocument()
    expect(screen.getByTestId('settings-add-llm-config')).toBeInTheDocument()
    expect(screen.queryByTestId('settings-activate-llm-config')).not.toBeInTheDocument()
  })

  it('新增：草稿区出现且原配置摘要可见可展开，取消后还原', async () => {
    render(<Settings />)
    await waitFor(() => screen.getByDisplayValue('sk-kimi-test'))
    fireEvent.click(screen.getByTestId('settings-add-llm-config'))

    const draft = screen.getByTestId('settings-llm-draft')
    expect(draft).toBeInTheDocument()
    // 原配置摘要钉在上方，数据可见（未丢）
    const summary = screen.getByTestId('settings-llm-current-summary')
    expect(summary).toHaveTextContent('kimi-k3')
    expect(summary).toHaveTextContent('使用中')
    // 草稿字段为空
    expect(within(draft).getByTestId('settings-api-key-input')).toHaveValue('')
    // 取消 → 回到原配置表单
    fireEvent.click(screen.getByTestId('settings-llm-draft-cancel'))
    expect(screen.queryByTestId('settings-llm-draft')).not.toBeInTheDocument()
    expect(screen.getByDisplayValue('sk-kimi-test')).toBeInTheDocument()
  })

  it('草稿保存为新配置：llmConfigSave(null, ...) 且出现切换器', async () => {
    mockConfigs([KIMI], 'cfg-kimi')
    vi.mocked(ipc.llmConfigSave).mockResolvedValue({ ok: true, id: 'cfg-ds' })
    render(<Settings />)
    await waitFor(() => screen.getByDisplayValue('sk-kimi-test'))
    fireEvent.click(screen.getByTestId('settings-add-llm-config'))

    const draft = screen.getByTestId('settings-llm-draft')
    fireEvent.change(within(draft).getByTestId('settings-api-key-input'), { target: { value: 'sk-ds-test' } })
    fireEvent.change(within(draft).getByTestId('settings-base-url-input'), { target: { value: 'https://api.deepseek.com/v1' } })
    fireEvent.change(within(draft).getByTestId('settings-model-input'), { target: { value: 'deepseek-v4-pro' } })
    // 保存后 list 返回两条
    mockConfigs([KIMI, DS], 'cfg-kimi')
    fireEvent.click(screen.getByTestId('settings-llm-draft-save'))

    await waitFor(() => {
      expect(ipc.llmConfigSave).toHaveBeenCalledWith(null, {
        apiKey: 'sk-ds-test', baseUrl: 'https://api.deepseek.com/v1', model: 'deepseek-v4-pro'
      })
    })
    await waitFor(() => expect(screen.getAllByTestId('settings-llm-config-chip')).toHaveLength(2))
  })

  it('双配置：chip 切换只换编辑对象，不激活；启用按钮出现', async () => {
    mockConfigs([KIMI, DS], 'cfg-kimi')
    render(<Settings />)
    await waitFor(() => screen.getByDisplayValue('sk-kimi-test'))
    const chips = screen.getAllByTestId('settings-llm-config-chip')
    expect(chips[0]).toHaveTextContent('使用中')
    // 点第二个 chip → 表单回填 DS，但未激活
    fireEvent.click(chips[1])
    await waitFor(() => expect(screen.getByDisplayValue('sk-ds-test')).toBeInTheDocument())
    expect(screen.getByDisplayValue('deepseek-v4-pro')).toBeInTheDocument()
    expect(ipc.llmConfigSetActive).not.toHaveBeenCalled()
    // 启用按钮可见可用
    const activateBtn = screen.getByTestId('settings-activate-llm-config')
    expect(activateBtn).toBeEnabled()
    vi.mocked(ipc.llmConfigSetActive).mockResolvedValue({ ok: true })
    fireEvent.click(activateBtn)
    await waitFor(() => expect(ipc.llmConfigSetActive).toHaveBeenCalledWith('cfg-ds'))
  })

  it('启用按钮对空 key 配置禁用', async () => {
    const empty: LlmConfig = { id: 'cfg-e', apiKey: '', baseUrl: 'https://x/v1', model: 'm' }
    mockConfigs([KIMI, empty], 'cfg-kimi')
    render(<Settings />)
    await waitFor(() => screen.getByDisplayValue('sk-kimi-test'))
    fireEvent.click(screen.getAllByTestId('settings-llm-config-chip')[1])
    await waitFor(() => expect(screen.getByTestId('settings-activate-llm-config')).toBeDisabled())
  })

  it('保存激活配置：llmConfigSave(id, ...) 带当前表单值', async () => {
    vi.mocked(ipc.llmConfigSave).mockResolvedValue({ ok: true, id: 'cfg-kimi' })
    render(<Settings />)
    await waitFor(() => screen.getByDisplayValue('sk-kimi-test'))
    const modelInput = screen.getByTestId('settings-model-input')
    fireEvent.change(modelInput, { target: { value: 'kimi-k3.1' } })
    fireEvent.click(screen.getByTestId('settings-ai-save-button'))
    await waitFor(() => {
      expect(ipc.llmConfigSave).toHaveBeenCalledWith('cfg-kimi', {
        apiKey: 'sk-kimi-test', baseUrl: 'https://api.kimi.com/coding/v1', model: 'kimi-k3.1'
      })
    })
  })

  it('key 为空时验证连接禁用；key 显隐切换保持', async () => {
    render(<Settings />)
    await waitFor(() => screen.getByDisplayValue('sk-kimi-test'))
    const keyInput = screen.getByTestId('settings-api-key-input')
    expect(keyInput).toHaveAttribute('type', 'password')
    fireEvent.click(screen.getByTestId('settings-api-key-toggle'))
    expect(keyInput).toHaveAttribute('type', 'text')
    fireEvent.change(keyInput, { target: { value: '' } })
    expect(screen.getByTestId('settings-verify-button')).toBeDisabled()
  })

  it('学习库独立保存走 configSetLibraryPath', async () => {
    render(<Settings />)
    await waitFor(() => screen.getByDisplayValue('C:/test-library'))
    fireEvent.change(screen.getByTestId('settings-library-path-input'), { target: { value: 'D:/new-lib' } })
    fireEvent.click(screen.getByTestId('settings-library-save-button'))
    await waitFor(() => expect(ipc.configSetLibraryPath).toHaveBeenCalledWith('D:/new-lib'))
  })
})
```

Run: `npx vitest run tests/settings.test.tsx` → FAIL（新 testid 不存在）

- [ ] **Step 4: 实现 LlmConfigCard + Settings 集成**

`src/components/settings/LlmConfigCard.tsx`（只导出组件，ui-styling §10）：

```tsx
import { useEffect, useState } from 'react'
import { ipc } from '@/lib/ipc'
import { Button } from '@/components/Button'
import { llmConfigLabel } from '@/lib/llm-configs'
import type { LlmConfig } from '@shared/index'

type Fields = { apiKey: string; baseUrl: string; model: string }
type VerifyStatus =
  | { kind: 'loading'; message: string }
  | { kind: 'success'; message: string }
  | { kind: 'error'; message: string }

interface Props {
  isAcademic: boolean
  showToast: (msg: string) => void
  onError: (msg: string) => void
}

export function LlmConfigCard({ isAcademic, showToast, onError }: Props) {
  const [configs, setConfigs] = useState<LlmConfig[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<Fields>({ apiKey: '', baseUrl: '', model: '' })
  const [draft, setDraft] = useState<Fields | null>(null)
  const [summaryOpen, setSummaryOpen] = useState(false)
  const [showKey, setShowKey] = useState(false)
  const [verifyStatus, setVerifyStatus] = useState<VerifyStatus | null>(null)

  const toFields = (c: LlmConfig): Fields => ({ apiKey: c.apiKey, baseUrl: c.baseUrl, model: c.model })

  useEffect(() => {
    let mounted = true
    ipc.llmConfigList().then(({ configs, activeId }) => {
      if (!mounted) return
      setConfigs(configs)
      setActiveId(activeId)
      const cur = configs.find(c => c.id === activeId) ?? configs[0]
      if (cur) { setEditingId(cur.id); setForm(toFields(cur)) }
    }).catch(err => onError(err?.message || '读取 LLM 配置失败'))
    return () => { mounted = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const editingConfig = configs.find(c => c.id === editingId) ?? null
  const isEditingActive = editingId !== null && editingId === activeId
  const fields = draft ?? form
  const setFields = (f: Fields) => (draft ? setDraft(f) : setForm(f))

  const selectChip = (id: string) => {
    const c = configs.find(x => x.id === id)
    if (!c) return
    setEditingId(id)
    setForm(toFields(c))
    setVerifyStatus(null)
  }

  const startDraft = () => {
    setDraft({ apiKey: '', baseUrl: '', model: '' })
    setSummaryOpen(false)
    setVerifyStatus(null)
  }

  const cancelDraft = () => {
    setDraft(null)
    setVerifyStatus(null)
    if (editingConfig) setForm(toFields(editingConfig)) // 还原查看中的配置
  }

  const reload = async (selectId?: string) => {
    const { configs: next, activeId: act } = await ipc.llmConfigList()
    setConfigs(next)
    setActiveId(act)
    const target = next.find(c => c.id === (selectId ?? editingId)) ?? next.find(c => c.id === act) ?? next[0]
    if (target) { setEditingId(target.id); setForm(toFields(target)) }
  }

  const saveDraft = async () => {
    if (!draft) return
    const r = await ipc.llmConfigSave(null, draft)
    if (!r.ok) { onError('保存新配置失败'); return }
    setDraft(null)
    await reload(r.id)
    showToast('新配置已保存')
  }

  const saveEditing = async () => {
    if (!editingId) return
    const r = await ipc.llmConfigSave(editingId, form)
    if (!r.ok) { onError('保存配置失败'); return }
    await reload()
    showToast(isEditingActive ? '配置已保存，立即生效' : '配置已保存')
  }

  const activate = async () => {
    if (!editingId) return
    const r = await ipc.llmConfigSetActive(editingId)
    if (!r.ok) { onError('切换失败'); return }
    setActiveId(editingId)
    const c = configs.find(x => x.id === editingId)
    showToast(`已切换到 ${c ? llmConfigLabel(c, configs) : '新配置'}`)
  }

  const verify = async () => {
    setVerifyStatus({ kind: 'loading', message: '验证中...' })
    try {
      const r = await ipc.setupProbeKey({ apiKey: fields.apiKey.trim(), baseUrl: fields.baseUrl.trim(), model: fields.model.trim() })
      setVerifyStatus(r.ok ? { kind: 'success', message: '连接正常' } : { kind: 'error', message: r.reason || '验证失败' })
    } catch (err: any) {
      setVerifyStatus({ kind: 'error', message: err?.message || '验证失败，请检查配置' })
    }
  }

  // 样式基元（与 Settings 现有卡片一致）
  const labelCls = `text-[11px] ${isAcademic ? 'text-parchment/60' : 'text-[#777]'} font-sans mb-1`
  const inputCls = `w-full ${isAcademic ? 'bg-ink/50 border-slate/40 text-parchment placeholder:text-parchment/30 focus:border-ember/60' : 'bg-white border-[#1a1a1a]/15 text-[#1a1a1a] placeholder:text-[#999] focus:border-[#1a1a1a]'} border rounded-md px-3 py-2 text-sm focus:outline-none`
  const ghostBtnCls = `px-3 py-2 border ${isAcademic ? 'border-slate/40 text-parchment/80 hover:text-parchment' : 'border-[#1a1a1a]/15 text-[#555] hover:text-[#1a1a1a]'} rounded-md text-sm transition-colors shrink-0`

  const fieldsBlock = (f: Fields, disabled: boolean) => (
    <div className="space-y-4">
      <div>
        <div className={labelCls}>API Key</div>
        <div className="flex gap-2">
          <input
            data-testid="settings-api-key-input"
            type={showKey ? 'text' : 'password'}
            value={f.apiKey}
            disabled={disabled}
            onChange={e => setFields({ ...f, apiKey: e.target.value })}
            placeholder="sk-..."
            className={`flex-1 ${inputCls}`}
          />
          <button data-testid="settings-api-key-toggle" type="button" onClick={() => setShowKey(!showKey)} className={ghostBtnCls}>
            {showKey ? '隐藏' : '显示'}
          </button>
        </div>
      </div>
      <div>
        <div className={labelCls}>Base URL</div>
        <input data-testid="settings-base-url-input" type="text" value={f.baseUrl} disabled={disabled}
          onChange={e => setFields({ ...f, baseUrl: e.target.value })} className={inputCls} />
      </div>
      <div>
        <div className={labelCls}>Model</div>
        <input data-testid="settings-model-input" type="text" value={f.model} disabled={disabled}
          onChange={e => setFields({ ...f, model: e.target.value })} className={inputCls} />
      </div>
    </div>
  )

  return (
    <div className={`${isAcademic ? 'bg-parchment/5 border-slate/20' : 'bg-white border-[#1a1a1a]/10'} border rounded-lg p-4 mb-4`}>
      <h3 className={`${isAcademic ? 'text-ember' : 'text-[#1a1a1a]'} font-semibold mb-4`}>AI 服务</h3>

      {/* 切换器：≥2 配置且不在草稿态时出现 */}
      {configs.length > 1 && !draft && (
        <div className="mb-4">
          <div className={labelCls}>配置</div>
          <div className="flex flex-wrap gap-2">
            {configs.map(c => {
              const active = c.id === activeId
              const selected = c.id === editingId
              return (
                <button
                  key={c.id}
                  data-testid="settings-llm-config-chip"
                  data-id={c.id}
                  type="button"
                  onClick={() => selectChip(c.id)}
                  className={`px-3 py-1.5 rounded-full text-xs border transition-colors ${
                    selected
                      ? (isAcademic ? 'border-ember/60 text-ember' : 'border-[#1a1a1a] text-[#1a1a1a]')
                      : (isAcademic ? 'border-slate/40 text-parchment/70 hover:text-parchment' : 'border-[#1a1a1a]/15 text-[#555] hover:text-[#1a1a1a]')
                  }`}
                >
                  {llmConfigLabel(c, configs)}
                  {active && <span data-testid="settings-llm-active-badge" className={`ml-1.5 px-1.5 py-0.5 rounded text-[10px] ${isAcademic ? 'bg-ember text-ink' : 'bg-[#1a1a1a] text-white'}`}>使用中</span>}
                  {!c.apiKey && <span className="ml-1.5 text-[10px] text-wine">未配置</span>}
                </button>
              )
            })}
          </div>
        </div>
      )}

      {/* 草稿态：原配置摘要钉在上方（数据可见未丢），草稿区独立视觉 */}
      {draft && editingConfig && (
        <div className={`mb-3 rounded-md border ${isAcademic ? 'border-slate/25' : 'border-[#1a1a1a]/10'}`}>
          <button
            data-testid="settings-llm-current-summary"
            type="button"
            onClick={() => setSummaryOpen(!summaryOpen)}
            className={`w-full flex items-center gap-2 px-3 py-2 text-xs ${isAcademic ? 'text-parchment/70' : 'text-[#555]'}`}
          >
            <span>{summaryOpen ? '▾' : '▸'}</span>
            <span>当前配置：{llmConfigLabel(editingConfig, configs)}</span>
            {editingConfig.id === activeId && (
              <span className={`px-1.5 py-0.5 rounded text-[10px] ${isAcademic ? 'bg-ember text-ink' : 'bg-[#1a1a1a] text-white'}`}>使用中</span>
            )}
          </button>
          {summaryOpen && (
            <div className={`px-3 pb-2 text-xs ${isAcademic ? 'text-parchment/50' : 'text-[#777]'}`}>
              <div>Base URL：{editingConfig.baseUrl || '（空）'}</div>
              <div>API Key：{editingConfig.apiKey ? '••••••••' + editingConfig.apiKey.slice(-4) : '（空）'}</div>
            </div>
          )}
        </div>
      )}

      {draft ? (
        <div data-testid="settings-llm-draft" className={`rounded-md border border-dashed ${isAcademic ? 'border-ember/50' : 'border-[#b08060]'} p-3`}>
          <div className={`text-xs mb-3 ${isAcademic ? 'text-ember' : 'text-[#8a5a30]'}`}>✏️ 新配置（未保存）</div>
          {fieldsBlock(draft, false)}
          <div className="flex items-center gap-3 mt-4">
            <Button data-testid="settings-verify-button" onClick={verify} disabled={!fields.apiKey.trim()}>验证连接</Button>
            <Button data-testid="settings-llm-draft-save" onClick={saveDraft}>保存为新配置</Button>
            <Button data-testid="settings-llm-draft-cancel" variant="ghost" onClick={cancelDraft}>取消</Button>
            {verifyStatus && <VerifyHint status={verifyStatus} isAcademic={isAcademic} />}
          </div>
        </div>
      ) : (
        <>
          {fieldsBlock(form, false)}
          <div className="flex items-center gap-3 mt-4">
            <Button data-testid="settings-verify-button" onClick={verify} disabled={!fields.apiKey.trim()}>验证连接</Button>
            <Button data-testid="settings-ai-save-button" onClick={saveEditing} disabled={!editingId}>保存</Button>
            {!isEditingActive && editingConfig && (
              <Button
                data-testid="settings-activate-llm-config"
                onClick={activate}
                disabled={!editingConfig.apiKey.trim()}
                title={!editingConfig.apiKey.trim() ? '该配置缺少 API Key，无法启用' : undefined}
              >
                启用此配置
              </Button>
            )}
            {verifyStatus && <VerifyHint status={verifyStatus} isAcademic={isAcademic} />}
          </div>
        </>
      )}

      {!draft && (
        <div className="mt-3">
          <button
            data-testid="settings-add-llm-config"
            type="button"
            onClick={startDraft}
            className={`text-xs ${isAcademic ? 'text-parchment/50 hover:text-ember' : 'text-[#777] hover:text-[#1a1a1a]'} bg-transparent border-none cursor-pointer`}
          >
            + 新增模型配置
          </button>
        </div>
      )}
    </div>
  )
}

function VerifyHint({ status, isAcademic }: { status: VerifyStatus; isAcademic: boolean }) {
  return (
    <span data-testid="settings-verify-status" className={`text-xs ${
      status.kind === 'error' ? 'text-wine' :
      status.kind === 'success' ? (isAcademic ? 'text-ember' : 'text-green-700') :
      (isAcademic ? 'text-parchment/40' : 'text-[#888]')
    }`}>
      {status.message}
    </span>
  )
}
```

注意：`VerifyHint` 是同文件内私有组件（不导出，不违反 §10）。若 lint 要求拆分，放进同文件即可。

`src/pages/Settings.tsx` 修改：
1. 删除本地 `DEFAULT_BASE_URL` / `DEFAULT_MODEL` 常量与 `apiKey/baseUrl/model/showKey/verifyStatus` state、`handleVerify`/`handleSave`（AI 部分）、`resetForm`。
2. AI 服务卡片整段（约 203-272 行）替换为：
   ```tsx
   <LlmConfigCard isAcademic={isAcademic} showToast={showToast} onError={setError} />
   ```
   并 import：`import { LlmConfigCard } from '@/components/settings/LlmConfigCard'`。
3. 学习库卡片：目录路径行下方加独立保存按钮与提示：
   ```tsx
   <div className="mt-2 flex items-center justify-between">
     <div className={`text-xs ${isAcademic ? 'text-parchment/40' : 'text-[#888]'}`}>保存后需重启应用生效。</div>
     <Button data-testid="settings-library-save-button" onClick={async () => {
       await ipc.configSetLibraryPath(libraryPath.trim())
       showToast('学习库路径已保存')
     }} disabled={!libraryPath.trim()}>
       保存
     </Button>
   </div>
   ```
4. 删除页面底部全局「保存 / 作废 / 保存后需重启」区块（约 411-424 行）。
5. `useEffect` 里 `ipc.getConfig()` 仍保留（libraryPath 来源），但不再 set apiKey/baseUrl/model。

- [ ] **Step 5: 清理 `writeConfig` 孤儿（本任务产生）**

Run: `grep -rn "writeConfig" src/ --include="*.tsx" --include="*.ts" | grep -v setupWriteConfig`
Expected: 无渲染层调用点（setup 向导用的是 `setup:writeConfig` / facade `setupWriteConfig`，不混）。确认后删除四层残留：
- `electron/ipc/config.ts` 的 `config:write` handler + `saveEnv` import（若不再用）
- `electron/preload.ts` 的 `writeConfig`
- `src/lib/ipc.ts` 的 `writeConfig` getter
- `src/types/index.ts` IpcApi 的 `writeConfig`

注意：`electron/ipc/config.ts` 若因此不再引用 `saveEnv`，同步移除 import；`saveEnv` 本身保留（main.ts 向导路径在用）。

- [ ] **Step 6: 跑测试**

Run: `npx vitest run tests/settings.test.tsx tests/llm-config-label.test.ts`
Expected: 全 PASS

- [ ] **Step 7: Commit**

```bash
git add src/lib/llm-configs.ts src/components/settings/LlmConfigCard.tsx src/pages/Settings.tsx tests/settings.test.tsx tests/llm-config-label.test.ts electron/ipc/config.ts electron/preload.ts src/lib/ipc.ts src/types/index.ts
git commit -m "feat(settings): LLM 多配置三态 UI——现状/草稿区/切换器，编辑与激活分离"
```

---

### Task 5: Part B — 报纸主题纸白背景

**Files:**
- Modify: `src/pages/Settings.tsx`（根 div，约 178 行）
- Modify: `src/pages/Extension.tsx`（根 div，约 44 行）
- Test: `tests/settings.test.tsx` 追加一条

**Interfaces:**
- Consumes: 无前置任务依赖（`briefingTheme` 已在 store）。
- Produces: 无新接口。注：`StudyControlsGroup` 已在报纸主题下隐藏换画按钮（`{isAcademic && <SwapPaintingButton/>}`），无需改动，测试断言覆盖即可。

- [ ] **Step 1: 失败测试**

`tests/settings.test.tsx` 追加（复用既有 mock）：

```tsx
  it('报纸主题：页面根铺纸白背景', async () => {
    const { useStore } = await import('@/store')
    useStore.setState({ briefingTheme: 'newspaper' })
    render(<Settings />)
    await waitFor(() => screen.getByDisplayValue('sk-kimi-test'))
    expect(screen.getByTestId('settings-page').className).toContain('bg-[#f5f2ed]')
    useStore.setState({ briefingTheme: 'academic' })
  })
```

若 store 的 theme 字段名或设置方式不同（如 action `setBriefingTheme`），按 store 实际 API 调整。同时断言换画按钮在报纸主题不出现：

```tsx
    expect(screen.queryByTestId('study-controls-swap-painting')).not.toBeInTheDocument()
```

Run: `npx vitest run tests/settings.test.tsx` → FAIL（bg 类不存在）

- [ ] **Step 2: 实现**

`src/pages/Settings.tsx` 根 div：

```tsx
<div data-testid="settings-page" className={`fixed inset-0 ${isAcademic ? '' : 'bg-[#f5f2ed]'}`}>
```

`src/pages/Extension.tsx` 根 div 同样处理（`isAcademic` 已存在）：

```tsx
<div data-testid="extension-page" className={`fixed inset-0 ${isAcademic ? '' : 'bg-[#f5f2ed]'}`}>
```

- [ ] **Step 3: 跑测试**

Run: `npx vitest run tests/settings.test.tsx`
Expected: 全 PASS

- [ ] **Step 4: Commit**

```bash
git add src/pages/Settings.tsx src/pages/Extension.tsx tests/settings.test.tsx
git commit -m "fix(theme): 报纸主题设置/扩展页铺纸白背景，不再露深褐底色"
```

---

### Task 6: E2E — selectors/POM/spec 更新 + source-map

**Files:**
- Modify: `e2e/helpers/selectors.ts`（settings 区，约 203-221 行）
- Modify: `e2e/pages/SettingsPage.ts`
- Modify: `e2e/specs/settings.spec.ts`
- Check: `e2e/source-map.json`（确认 `src/pages/Settings.tsx`、`src/components/settings/**`、`electron/ipc/config.ts`、`electron/lib/llm-configs.ts` 均落在 settings 相关 group 的 sources 里；缺则补）

**Interfaces:**
- Consumes: Task 4 的 testid（`settings-llm-config-chip` / `settings-add-llm-config` / `settings-llm-draft*` / `settings-activate-llm-config` / `settings-ai-save-button` / `settings-library-save-button`）。

- [ ] **Step 1: selectors 追加**

```ts
    aiSaveButton: '[data-testid="settings-ai-save-button"]',
    librarySaveButton: '[data-testid="settings-library-save-button"]',
    addLlmConfig: '[data-testid="settings-add-llm-config"]',
    llmConfigChip: '[data-testid="settings-llm-config-chip"]',
    llmActiveBadge: '[data-testid="settings-llm-active-badge"]',
    activateLlmConfig: '[data-testid="settings-activate-llm-config"]',
    llmDraft: '[data-testid="settings-llm-draft"]',
    llmDraftSave: '[data-testid="settings-llm-draft-save"]',
    llmDraftCancel: '[data-testid="settings-llm-draft-cancel"]',
    llmCurrentSummary: '[data-testid="settings-llm-current-summary"]',
```

（`saveButton`/`resetButton` 选择器随 UI 删除而移除；检查其他 spec 是否引用它们：`grep -rn "settings.saveButton\|settings.resetButton" e2e/`，有则同步改。）

- [ ] **Step 2: POM 追加方法**

```ts
  async saveAiConfig() { await this.page.locator(SELECTORS.settings.aiSaveButton).click() }
  async saveLibraryPath() { await this.page.locator(SELECTORS.settings.librarySaveButton).click() }
  async addLlmConfig() { await this.page.locator(SELECTORS.settings.addLlmConfig).click() }
  draft() { return this.page.locator(SELECTORS.settings.llmDraft) }
  async saveDraft() { await this.page.locator(SELECTORS.settings.llmDraftSave).click() }
  chips() { return this.page.locator(SELECTORS.settings.llmConfigChip) }
  async activateEditing() { await this.page.locator(SELECTORS.settings.activateLlmConfig).click() }
```

- [ ] **Step 3: 重写 settings.spec.ts 的 'modify and save config' + 新增切换用例**

```ts
test('modify and save config', async ({ window, testConfigDir, testLibraryPath }) => {
  const cover = new CoverPage(window)
  await cover.enterIfNeeded()
  const home = new HomePage(window)
  await home.waitForLoaded()
  await home.goToSettings()
  const settings = new SettingsPage(window)
  await settings.waitForLoaded()

  // AI 字段写 state.json 的 llmConfigs（不再写 .env）
  await settings.fillModel('kimi-k2.6')
  await settings.saveAiConfig()
  const statePath = path.join(testConfigDir, 'state.json')
  await expect.poll(() => {
    const s = JSON.parse(fs.readFileSync(statePath, 'utf-8'))
    return s.llmConfigs?.[0]?.model
  }).toBe('kimi-k2.6')

  // 学习库路径仍写 .env
  await settings.fillLibraryPath(testLibraryPath)
  await settings.saveLibraryPath()
  const envContent = fs.readFileSync(path.join(testConfigDir, '.env'), 'utf-8')
  expect(envContent).toContain(`STUDY_LIBRARY_PATH=${testLibraryPath}`)
})

test('新增第二配置并启用，reload 后保持激活', async ({ window, testConfigDir }) => {
  const cover = new CoverPage(window)
  await cover.enterIfNeeded()
  const home = new HomePage(window)
  await home.waitForLoaded()
  await home.goToSettings()
  const settings = new SettingsPage(window)
  await settings.waitForLoaded()

  await settings.addLlmConfig()
  await expect(settings.draft()).toBeVisible()
  // 草稿区出现时原配置摘要可见（数据未丢）
  await expect(window.locator(SELECTORS.settings.llmCurrentSummary)).toContainText('使用中')

  await settings.draft().locator(SELECTORS.settings.apiKeyInput).fill('sk-second')
  await settings.draft().locator(SELECTORS.settings.baseUrlInput).fill('https://api.deepseek.com/v1')
  await settings.draft().locator(SELECTORS.settings.modelInput).fill('deepseek-v4-pro')
  await settings.saveDraft()

  await expect(settings.chips()).toHaveCount(2)
  await settings.chips().nth(1).click()
  await settings.activateEditing()

  // state.json 记录激活项
  const statePath = path.join(testConfigDir, 'state.json')
  await expect.poll(() => {
    const s = JSON.parse(fs.readFileSync(statePath, 'utf-8'))
    return s.llmConfigs?.find((c: any) => c.id === s.activeLlmConfigId)?.model
  }).toBe('deepseek-v4-pro')

  // reload 后激活态保持（state.json 持久化 + boot 归一不回弹）
  await window.reload()
  const settings2 = new SettingsPage(window)
  await settings2.waitForLoaded()
  await expect(settings2.chips().nth(1)).toContainText('使用中')
})
```

注意：E2E 种子只写 `.env`（test-library.ts:56 的 kimi-k2.6），不写 state.json 的 llmConfigs —— **这是刻意的**，boot 迁移路径因此被每条 E2E 覆盖。`BASE_STATE` 不加 llmConfigs，并在 test-library.ts 的 BASE_STATE 上方加一行注释说明（"llmConfigs 有意缺席：走 .env 播种迁移路径"）。

- [ ] **Step 4: source-map 核查**

Run: `node scripts/e2e-changed.js`
Expected: 无孤儿 spec WARNING 遗漏本特性；settings group 的 sources 覆盖本次全部改动文件。若 `src/components/settings/` 或 `electron/lib/llm-configs.ts` 未被任何 group 的 glob 覆盖，补进 settings group 的 sources。

- [ ] **Step 5: 跑定向 E2E**

Run: `node scripts/e2e-changed.js --run --no-retries`
Expected: settings group + startup-health 全绿

- [ ] **Step 6: Commit**

```bash
git add e2e/helpers/selectors.ts e2e/pages/SettingsPage.ts e2e/specs/settings.spec.ts e2e/helpers/test-library.ts e2e/source-map.json
git commit -m "test(e2e): settings 多配置用例——新增/启用/reload 持久化；AI 字段断言迁移到 state.json"
```

---

### Task 7: 本机 DeepSeek 预置 + 收尾验证

**Files:**
- Modify（本机数据，非仓库文件）: `C:\Users\86468\.studyparlor\state.json`

**Interfaces:**
- Consumes: Task 1-6 全部完成。

- [ ] **Step 1: 预置 DeepSeek 配置到本机 state.json**

确认应用未运行（避免写入竞争）后执行：

```bash
node -e "
const fs = require('fs')
const p = process.env.USERPROFILE + '/.studyparlor/state.json'
const s = JSON.parse(fs.readFileSync(p, 'utf-8'))
if (!Array.isArray(s.llmConfigs) || s.llmConfigs.length === 0) {
  console.log('llmConfigs 尚未播种——先启动一次应用完成迁移，再重跑本步骤')
  process.exit(1)
}
if (s.llmConfigs.some(c => c.model === 'deepseek-v4-pro')) {
  console.log('DeepSeek 配置已存在，跳过')
  process.exit(0)
}
s.llmConfigs.push({
  id: 'cfg-' + crypto.randomUUID(),
  apiKey: 'sk-bbce38039a42465c9f76cfa5b4842fad',
  baseUrl: 'https://api.deepseek.com/v1',
  model: 'deepseek-v4-pro'
})
fs.writeFileSync(p, JSON.stringify(s, null, 2))
console.log('DeepSeek 配置已预置，当前 activeLlmConfigId 不变：', s.activeLlmConfigId)
"
```

备选（更符合产品路径）：直接启动应用，在设置页走一遍「新增模型配置」UI 流程填入 DeepSeek 三字段——同时充当一次真实冒烟。

- [ ] **Step 2: 收尾验证总跑**

```bash
npx vitest run tests/env.test.ts tests/llm-configs.test.ts tests/llm-config-label.test.ts tests/settings.test.tsx tests/kimi.test.ts
node scripts/e2e-changed.js --run --no-retries
```

- [ ] **Step 3: 冒烟（真实应用）**

`npm run dev` → 设置页：单/双配置三态走一遍（新增草稿可见原配置摘要、启用 DeepSeek、回首页发一条消息确认走通、切回 Kimi）。验证后关闭 dev。

## Self-Review 结论

- Spec 覆盖：数据模型/迁移（T2/T3）、立即生效（T2 createLlmConfigActions + T3 接线）、三态 UI 与摘要可见原则（T4）、错误处理（T2 归一/去重/悬空、T4 空 key 禁用启用）、IPC 四层（T3）、E2E（T6）、DeepSeek 预置（T7）、纸白背景（T5）、YAGNI 删除/名称字段不做（全计划无此类步骤）✓
- 类型一致：`LlmConfig`/`LlmCreds`/`planLlmConfigs`/`createLlmConfigActions`/`llmConfigLabel` 签名跨任务一致 ✓
- 已知风险记录：`llmConfig:save` 的 `sanitizeModel` 抛错会经 IPC 包装传到渲染层，LlmConfigCard 的 saveEditing/saveDraft 未单独 catch —— 实现时在两个 save 方法外包 try/catch 走 onError（写码时补上，不改测试语义）。
