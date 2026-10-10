// src/components/fitness/FitnessFaceHeader.tsx
import type { ReactNode } from 'react'
import type { BriefingTheme } from '@shared/index'
import { fitnessColors } from '@/lib/fitness-theme'

export type FitnessFace = 'weight' | 'body' | 'plan'

export function FitnessFaceHeader({ theme, face, onSwitch, right }: {
  theme: BriefingTheme
  face: FitnessFace
  onSwitch: (f: FitnessFace) => void
  right?: ReactNode
}) {
  const c = fitnessColors(theme)
  const seg = (f: 'weight' | 'body', label: string, testId: string) => (
    <button
      type="button" data-testid={testId} onClick={() => onSwitch(f)}
      style={{
        fontSize: 11, padding: '3px 14px', borderRadius: 12, cursor: 'pointer', background: 'none',
        border: `1px solid ${face === f ? c.amber : c.hairline}`,
        color: face === f ? c.amber : c.faint,
      }}
    >{label}</button>
  )
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 18px', borderBottom: `1px solid ${c.hairline}` }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        {seg('weight', '重量', 'fitness-face-weight')}
        {seg('body', '尺寸', 'fitness-face-body')}
        <button type="button" data-testid="fitness-plan-button" onClick={() => onSwitch('plan')}
          style={{ fontSize: 10, background: 'none', border: 'none', color: c.faint, cursor: 'pointer', marginLeft: 6 }}>
          ⚙ 计划
        </button>
      </div>
      {right}
    </div>
  )
}
