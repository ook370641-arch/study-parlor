export function getTemperatureLabel(t: number): string {
  if (t === 0.3) return '静水深流'
  if (t === 1.0) return '即将沸腾'
  return '不紧不慢'
}
