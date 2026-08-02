import type { BriefingFontSize } from '@shared/index'

export const STUDY_FONT_SIZES = [
  'sm',
  'base',
  'lg',
  'xl',
  '2xl',
  '3xl',
] as const satisfies readonly BriefingFontSize[]

export type StudyFontSize = typeof STUDY_FONT_SIZES[number]

export const STUDY_FONT_STYLES: Record<StudyFontSize, string> = {
  sm: '14px',
  base: '16px',
  lg: '18px',
  xl: '20px',
  '2xl': '22px',
  '3xl': '24px',
}

export function nextStudyFontSize(current: StudyFontSize): StudyFontSize {
  const idx = STUDY_FONT_SIZES.indexOf(current)
  return STUDY_FONT_SIZES[Math.min(idx + 1, STUDY_FONT_SIZES.length - 1)]
}

export function prevStudyFontSize(current: StudyFontSize): StudyFontSize {
  const idx = STUDY_FONT_SIZES.indexOf(current)
  return STUDY_FONT_SIZES[Math.max(idx - 1, 0)]
}

export function normalizeStudyFontSize(value: string | undefined): StudyFontSize {
  if (value && STUDY_FONT_SIZES.includes(value as StudyFontSize)) {
    return value as StudyFontSize
  }
  return 'lg'
}
