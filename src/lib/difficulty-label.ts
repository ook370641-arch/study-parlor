export function getDifficultyLabel(d: 'high' | 'mid' | 'low'): string {
  if (d === 'high') return '强'
  if (d === 'low') return '弱'
  return '中'
}
