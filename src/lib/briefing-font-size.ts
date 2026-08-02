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

export const BRIEFING_LIST_STYLES: Record<BriefingFontSize, { title: string; meta: string }> = {
  sm: { title: '13px', meta: '10px' },
  base: { title: '14px', meta: '11px' },
  lg: { title: '15px', meta: '12px' },
  xl: { title: '16px', meta: '12px' },
  '2xl': { title: '17px', meta: '13px' },
  '3xl': { title: '18px', meta: '14px' },
  '4xl': { title: '19px', meta: '15px' },
  '5xl': { title: '20px', meta: '16px' },
  '6xl': { title: '21px', meta: '17px' },
  '7xl': { title: '22px', meta: '18px' },
}

export const BRIEFING_QUOTE_SIZES: Record<BriefingFontSize, string> = {
  sm: '12px', base: '13px', lg: '14px', xl: '15px', '2xl': '16px',
  '3xl': '17px', '4xl': '18px', '5xl': '19px', '6xl': '20px', '7xl': '21px',
}

export const WRITING_UI_STYLES: Record<BriefingFontSize, string> = {
  sm: '11px', base: '12px', lg: '13px', xl: '14px', '2xl': '15px',
  '3xl': '16px', '4xl': '17px', '5xl': '18px', '6xl': '19px', '7xl': '20px',
}

export const WRITING_UI_QUOTE_SIZES: Record<BriefingFontSize, string> = { ...BRIEFING_QUOTE_SIZES }

/**
 * 旁注正文字号：与页面正文大小相同。
 * 随 briefingFontSize 全局调配。
 */
export const ANNOTATION_NOTE_SIZES: Record<BriefingFontSize, string> = {
  sm: '17px', base: '19px', lg: '21px', xl: '23px', '2xl': '25px',
  '3xl': '27px', '4xl': '29px', '5xl': '31px', '6xl': '33px', '7xl': '35px',
}

/** 旁注 UI 元素（笔图标、按钮、标签）：比旁注正文再小一档，温和缩放。 */
export const ANNOTATION_UI_SIZES: Record<BriefingFontSize, { pen: string; small: string }> = {
  sm: { pen: '10px', small: '9px' },
  base: { pen: '12px', small: '10px' },
  lg: { pen: '13px', small: '11px' },
  xl: { pen: '14px', small: '12px' },
  '2xl': { pen: '15px', small: '13px' },
  '3xl': { pen: '16px', small: '14px' },
  '4xl': { pen: '17px', small: '15px' },
  '5xl': { pen: '18px', small: '16px' },
  '6xl': { pen: '19px', small: '17px' },
  '7xl': { pen: '20px', small: '18px' },
}

export function nextFontSize(current: BriefingFontSize): BriefingFontSize {
  const idx = BRIEFING_FONT_SIZES.indexOf(current)
  return BRIEFING_FONT_SIZES[Math.min(idx + 1, BRIEFING_FONT_SIZES.length - 1)]
}

export function prevFontSize(current: BriefingFontSize): BriefingFontSize {
  const idx = BRIEFING_FONT_SIZES.indexOf(current)
  return BRIEFING_FONT_SIZES[Math.max(idx - 1, 0)]
}
