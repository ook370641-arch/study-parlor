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
