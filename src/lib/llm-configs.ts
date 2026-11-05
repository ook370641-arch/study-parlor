import type { LlmConfig } from '@shared/index'

function hostOf(baseUrl: string): string {
  try {
    return new URL(baseUrl).host
  } catch {
    return ''
  }
}

/** 配置条目标识：厂商名；重名追加 @host；无法识别则用 host */
export function llmConfigLabel(c: LlmConfig, all: LlmConfig[]): string {
  const providerOf = (config: LlmConfig): string => {
    const host = hostOf(config.baseUrl).toLowerCase()
    const model = config.model.trim().toLowerCase()
    if (host.includes('kimi') || model.startsWith('kimi-')) return 'Kimi'
    if (host.includes('deepseek') || model.startsWith('deepseek-')) return 'DeepSeek'
    return hostOf(config.baseUrl) || '未命名配置'
  }
  const base = providerOf(c)
  const dup = all.some(o => o.id !== c.id && providerOf(o) === base)
  if (!dup) return base
  const host = hostOf(c.baseUrl)
  return host ? `${base}@${host}` : base
}
