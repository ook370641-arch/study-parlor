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
    // state.json 的激活配置是权威源：与 cfg 不一致时回同步（如重启后 .env 与
    // activeLlmConfigId 分叉），保证所有 IPC 闭包看到的 cfg 即激活配置。
    const active = planned.configs.find(c => c.id === planned.activeId)
    if (active) {
      const creds = credsOf(active)
      if (cfg.apiKey !== creds.apiKey || cfg.baseUrl !== creds.baseUrl || cfg.model !== creds.model) {
        Object.assign(cfg, creds)
      }
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
