import { describe, it, expect } from 'vitest'
import { llmConfigLabel } from '@/lib/llm-configs'
import type { LlmConfig } from '@shared/index'

const a: LlmConfig = { id: 'cfg-a', apiKey: '', baseUrl: 'https://api.kimi.com/coding/v1', model: 'kimi-k3' }
const b: LlmConfig = { id: 'cfg-b', apiKey: '', baseUrl: 'https://api.deepseek.com/v1', model: 'deepseek-v4-pro' }

describe('llmConfigLabel', () => {
  it('默认用厂商名', () => {
    expect(llmConfigLabel(a, [a, b])).toBe('Kimi')
    expect(llmConfigLabel(b, [a, b])).toBe('DeepSeek')
  })
  it('无法识别厂商时用 host', () => {
    const c = { ...a, baseUrl: 'https://relay.example.com/v1', model: '' }
    expect(llmConfigLabel(c, [c])).toBe('relay.example.com')
  })
  it('厂商重名时追加 @host 区分', () => {
    const d: LlmConfig = { id: 'cfg-d', apiKey: '', baseUrl: 'https://relay.example.com/v1', model: 'kimi-k3' }
    expect(llmConfigLabel(a, [a, d])).toBe('Kimi@api.kimi.com')
    expect(llmConfigLabel(d, [a, d])).toBe('Kimi@relay.example.com')
  })
  it('model 与 host 都为空 → 未命名配置', () => {
    const c = { ...a, model: '', baseUrl: '' }
    expect(llmConfigLabel(c, [c])).toBe('未命名配置')
  })
})
