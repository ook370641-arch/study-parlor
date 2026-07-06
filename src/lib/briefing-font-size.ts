import type { BriefingFontSize } from '@shared/index'

export const BRIEFING_FONT_SIZES = ['sm', 'base', 'lg', 'xl'] as const satisfies readonly BriefingFontSize[]

export const ACADEMIC_BODY_STYLES: Record<BriefingFontSize, { size: string; weight: number }> = {
  sm: { size: '14px', weight: 400 },
  base: { size: '15px', weight: 500 },
  lg: { size: '16px', weight: 600 },
  xl: { size: '17px', weight: 600 },
}

export const NEWSPAPER_BODY_STYLES: Record<BriefingFontSize, { size: string; weight: number }> = {
  sm: { size: '14px', weight: 500 },
  base: { size: '15px', weight: 600 },
  lg: { size: '16px', weight: 600 },
  xl: { size: '17px', weight: 700 },
}

export function nextFontSize(current: BriefingFontSize): BriefingFontSize {
  const idx = BRIEFING_FONT_SIZES.indexOf(current)
  return BRIEFING_FONT_SIZES[Math.min(idx + 1, BRIEFING_FONT_SIZES.length - 1)]
}

export function prevFontSize(current: BriefingFontSize): BriefingFontSize {
  const idx = BRIEFING_FONT_SIZES.indexOf(current)
  return BRIEFING_FONT_SIZES[Math.max(idx - 1, 0)]
}
