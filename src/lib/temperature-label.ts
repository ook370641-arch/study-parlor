import type { Terminology } from '@shared/index'

export function getTemperatureLabel(
  t: number,
  terminology?: Pick<Terminology, 'temperatureCold' | 'temperatureNeutral' | 'temperatureWarm'>
): string {
  if (t === 0.3) return terminology?.temperatureCold ?? '坚硬'
  if (t === 1.0) return terminology?.temperatureWarm ?? '活泼'
  return terminology?.temperatureNeutral ?? '适中'
}
