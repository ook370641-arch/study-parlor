import type { BriefingSourceId } from '@shared/index'

export const DEFAULT_BRIEFING_SOURCE_ORDER: BriefingSourceId[] = [
  'writing',
  'digest',
  'anthropic',
  'job-briefing',
  'scout',
]

const VALID = new Set<string>(DEFAULT_BRIEFING_SOURCE_ORDER)

/**
 * 归一化持久化的来源顺序：
 * - 缺省/非数组 → 默认顺序（老 state.json 无此字段）
 * - 过滤未知 id；去重（保留首次出现）
 * - 追加遗漏的已知 id（未来新增来源时旧状态自动兼容）
 */
export function normalizeBriefingSourceOrder(raw: unknown): BriefingSourceId[] {
  if (!Array.isArray(raw)) return [...DEFAULT_BRIEFING_SOURCE_ORDER]
  const seen = new Set<string>()
  const picked: BriefingSourceId[] = []
  for (const item of raw) {
    if (typeof item !== 'string' || !VALID.has(item) || seen.has(item)) continue
    seen.add(item)
    picked.push(item as BriefingSourceId)
  }
  for (const id of DEFAULT_BRIEFING_SOURCE_ORDER) {
    if (!seen.has(id)) picked.push(id)
  }
  return picked
}
