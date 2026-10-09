// src/lib/fitness-theme.ts —— 健身面板双主题色板（学术夜色 / 报纸）
import type { BriefingTheme } from '@shared/index'

export function fitnessColors(theme: BriefingTheme) {
  const dark = theme !== 'newspaper'
  return {
    dark,
    bg: dark ? '#2a1f1a' : '#e8e4de',
    text: dark ? '#e8d5b7' : '#2a1f1a',
    dim: dark ? 'rgba(232,213,183,.45)' : 'rgba(42,31,26,.55)',
    faint: dark ? 'rgba(232,213,183,.28)' : 'rgba(42,31,26,.32)',
    hairline: dark ? 'rgba(232,213,183,.12)' : 'rgba(42,31,26,.16)',
    cellBg: dark ? 'rgba(232,213,183,.05)' : 'rgba(42,31,26,.05)',
    amber: '#d97757',
  }
}

export type FitnessColors = ReturnType<typeof fitnessColors>
