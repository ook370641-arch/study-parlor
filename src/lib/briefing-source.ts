import type { BriefingSourceId } from '@shared/index'

export function normalizeBriefingSource(value: unknown): BriefingSourceId {
  return value === 'study' || value === 'writing' || value === 'anthropic' || value === 'book'
    ? value
    : 'writing'
}
