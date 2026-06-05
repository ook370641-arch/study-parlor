export function getTemperatureLabel(t: number): string {
  if (t === 0.3) return '坚硬'
  if (t === 1.0) return '活泼'
  return '适中'
}
