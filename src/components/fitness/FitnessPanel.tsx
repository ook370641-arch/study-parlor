// src/components/fitness/FitnessPanel.tsx —— 健身面板根：重量/尺寸/计划 三面切换
import { useState } from 'react'
import type { BriefingTheme } from '@shared/index'
import { fitnessColors } from '@/lib/fitness-theme'
import { FitnessWeightView } from './FitnessWeightView'
import type { FitnessFace } from './FitnessFaceHeader'
// Task 7 产物，本 task 先引占位再于 Task 7 替换为真实组件
import { FitnessBodyView } from './FitnessBodyView'
import { FitnessPlanView } from './FitnessPlanView'

export function FitnessPanel({ theme }: { theme: BriefingTheme }) {
  const c = fitnessColors(theme)
  const [face, setFace] = useState<FitnessFace>('weight')
  return (
    <main data-testid="fitness-panel" className="relative z-[5] flex-1 min-h-0 overflow-y-auto"
      style={{ background: c.bg }}>
      {face === 'plan' ? (
        <FitnessPlanView theme={theme} onBack={() => setFace('weight')} />
      ) : face === 'body' ? (
        <FitnessBodyView theme={theme} onSwitch={setFace} />
      ) : (
        <FitnessWeightView theme={theme} onSwitch={setFace} />
      )}
    </main>
  )
}
