import type { BriefingFontSize } from '@shared/index'

export const SUMMARY_FONT_SIZES = [
  'sm',
  'base',
  'lg',
  'xl',
  '2xl',
  '3xl',
  '4xl',
] as const satisfies readonly BriefingFontSize[]

export const SUMMARY_BASE_STYLES: Record<SummaryFontSize, { size: string }> = {
  sm: { size: '12px' },
  base: { size: '13px' },
  lg: { size: '14px' },
  xl: { size: '15px' },
  '2xl': { size: '16px' },
  '3xl': { size: '17px' },
  '4xl': { size: '18px' },
}

export type SummaryFontSize = typeof SUMMARY_FONT_SIZES[number]

export function nextSummaryFontSize(current: SummaryFontSize): SummaryFontSize {
  const idx = SUMMARY_FONT_SIZES.indexOf(current)
  return SUMMARY_FONT_SIZES[Math.min(idx + 1, SUMMARY_FONT_SIZES.length - 1)]
}

export function prevSummaryFontSize(current: SummaryFontSize): SummaryFontSize {
  const idx = SUMMARY_FONT_SIZES.indexOf(current)
  return SUMMARY_FONT_SIZES[Math.max(idx - 1, 0)]
}

export function normalizeSummaryFontSize(value: string | undefined): SummaryFontSize {
  if (value && SUMMARY_FONT_SIZES.includes(value as SummaryFontSize)) {
    return value as SummaryFontSize
  }
  return 'base'
}
