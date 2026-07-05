import type { Terminology } from '@shared/index'

export function getDifficultyLabel(
  d: 'high' | 'mid' | 'low',
  terminology?: Pick<Terminology, 'difficultyHigh' | 'difficultyMid' | 'difficultyLow'>
): string {
  if (d === 'high') return terminology?.difficultyHigh ?? '强'
  if (d === 'low') return terminology?.difficultyLow ?? '弱'
  return terminology?.difficultyMid ?? '中'
}
