import type { AnthropicSectionKey } from '@shared/index'
import { ANTHROPIC_SOURCES } from './anthropic-sections'

export type BlogFilter =
  | { mode: 'all' }
  /** 我的：仅已导入文章。与源 chip 互斥单选（点 Mine 清零源选择，点源 chip 清零 Mine） */
  | { mode: 'mine' }
  | { mode: 'pick'; selected: ReadonlySet<AnthropicSectionKey> }

/** 五源 chip 的固定 key 列表（All 之外的全部可选项），与 ANTHROPIC_SOURCES 保持一致 */
export const ALL_SOURCE_KEYS: readonly AnthropicSectionKey[] = Object.freeze(
  ANTHROPIC_SOURCES.map((s) => s.key)
)

export function clickAllChip(): BlogFilter {
  return { mode: 'all' }
}

export function toggleMineChip(filter: BlogFilter): BlogFilter {
  return filter.mode === 'mine' ? { mode: 'all' } : { mode: 'mine' }
}

export function toggleSourceChip(
  filter: BlogFilter,
  key: AnthropicSectionKey,
  allKeys: readonly AnthropicSectionKey[]
): BlogFilter {
  // all / mine 态点源 chip → 该源单选（mine 自动清零）
  if (filter.mode !== 'pick') return { mode: 'pick', selected: new Set([key]) }
  const next = new Set(filter.selected)
  if (next.has(key)) next.delete(key)
  else next.add(key)
  // 空选择回退 All；手动点满全部收编为 All
  if (next.size === 0 || next.size >= allKeys.length) return { mode: 'all' }
  return { mode: 'pick', selected: next }
}

export function isSourceActive(filter: BlogFilter, key: AnthropicSectionKey): boolean {
  return filter.mode === 'all' || (filter.mode === 'pick' && filter.selected.has(key))
}
