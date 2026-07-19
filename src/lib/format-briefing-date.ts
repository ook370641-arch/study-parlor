export function formatBriefingDate(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

// '2026-06-23' → '2026 年 6 月 23 日'；非法输入原样返回
export function formatDisplayDate(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number)
  if ([y, m, d].some((n) => Number.isNaN(n))) return dateStr
  return `${y} 年 ${m} 月 ${d} 日`
}
