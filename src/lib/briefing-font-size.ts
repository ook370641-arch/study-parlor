import type { BriefingFontSize } from '@shared/index'

export const BRIEFING_FONT_SIZES = [
  'sm',
  'base',
  'lg',
  'xl',
  '2xl',
  '3xl',
  '4xl',
  '5xl',
  '6xl',
  '7xl',
] as const satisfies readonly BriefingFontSize[]

export const ACADEMIC_BODY_STYLES: Record<BriefingFontSize, { size: string; weight: number }> = {
  sm: { size: '17px', weight: 400 },
  base: { size: '19px', weight: 400 },
  lg: { size: '21px', weight: 500 },
  xl: { size: '23px', weight: 500 },
  '2xl': { size: '25px', weight: 600 },
  '3xl': { size: '27px', weight: 600 },
  '4xl': { size: '29px', weight: 600 },
  '5xl': { size: '31px', weight: 700 },
  '6xl': { size: '33px', weight: 700 },
  '7xl': { size: '35px', weight: 700 },
}

export const NEWSPAPER_BODY_STYLES: Record<BriefingFontSize, { size: string; weight: number }> = {
  sm: { size: '17px', weight: 500 },
  base: { size: '19px', weight: 500 },
  lg: { size: '21px', weight: 600 },
  xl: { size: '23px', weight: 600 },
  '2xl': { size: '25px', weight: 600 },
  '3xl': { size: '27px', weight: 700 },
  '4xl': { size: '29px', weight: 700 },
  '5xl': { size: '31px', weight: 700 },
  '6xl': { size: '33px', weight: 800 },
  '7xl': { size: '35px', weight: 800 },
}

export const ACADEMIC_HEADING_STYLES: Record<BriefingFontSize, { size: string; weight: number }> = {
  sm: { size: '22px', weight: 600 },
  base: { size: '24px', weight: 600 },
  lg: { size: '26px', weight: 700 },
  xl: { size: '28px', weight: 700 },
  '2xl': { size: '30px', weight: 700 },
  '3xl': { size: '32px', weight: 700 },
  '4xl': { size: '34px', weight: 700 },
  '5xl': { size: '36px', weight: 700 },
  '6xl': { size: '38px', weight: 700 },
  '7xl': { size: '40px', weight: 700 },
}

export const NEWSPAPER_HEADING_STYLES: Record<BriefingFontSize, { size: string; weight: number }> = {
  sm: { size: '22px', weight: 700 },
  base: { size: '24px', weight: 700 },
  lg: { size: '26px', weight: 800 },
  xl: { size: '28px', weight: 800 },
  '2xl': { size: '30px', weight: 800 },
  '3xl': { size: '32px', weight: 800 },
  '4xl': { size: '34px', weight: 800 },
  '5xl': { size: '36px', weight: 900 },
  '6xl': { size: '38px', weight: 900 },
  '7xl': { size: '40px', weight: 900 },
}

export function nextFontSize(current: BriefingFontSize): BriefingFontSize {
  const idx = BRIEFING_FONT_SIZES.indexOf(current)
  return BRIEFING_FONT_SIZES[Math.min(idx + 1, BRIEFING_FONT_SIZES.length - 1)]
}

export function prevFontSize(current: BriefingFontSize): BriefingFontSize {
  const idx = BRIEFING_FONT_SIZES.indexOf(current)
  return BRIEFING_FONT_SIZES[Math.max(idx - 1, 0)]
}
