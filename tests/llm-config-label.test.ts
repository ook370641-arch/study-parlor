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
