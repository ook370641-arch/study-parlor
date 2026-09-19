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
