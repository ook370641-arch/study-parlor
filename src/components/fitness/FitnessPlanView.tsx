// src/components/fitness/FitnessPlanView.tsx —— 计划管理：周安排 + 序列/动作/组数；唯一改计划的地方
import { useState } from 'react'
import { useStore } from '@/store'
import type { BriefingTheme, FitnessRoutine, FitnessScheduleEntry } from '@shared/index'
import { fitnessColors } from '@/lib/fitness-theme'
import { makeId } from '@/lib/fitness'
import { SwapPaintingButton } from '@/components/SwapPaintingButton'

const WEEKDAYS = [1, 2, 3, 4, 5, 6, 7] as const
const WD_LABEL = ['一', '二', '三', '四', '五', '六', '日']

export function FitnessPlanView({ theme, onBack }: { theme: BriefingTheme; onBack: () => void }) {
  const c = fitnessColors(theme)
  const data = useStore((s) => s.fitnessData)
  const saveFitnessPlan = useStore((s) => s.saveFitnessPlan)
  const [routines, setRoutines] = useState<FitnessRoutine[]>(() => structuredClone(data?.routines ?? []))
  const [schedule, setSchedule] = useState<FitnessScheduleEntry[]>(() => structuredClone(data?.schedule ?? []))

  if (!data) return null

  const routineOf = (weekday: number) => schedule.find((s) => s.weekday === weekday)?.routineId ?? null

  const cycleWeekday = (weekday: number) => {
    const order: (string | null)[] = [null, ...routines.map((r) => r.id)]
    const cur = routineOf(weekday)
    const next = order[(order.indexOf(cur) + 1) % order.length]
    const rest = schedule.filter((s) => s.weekday !== weekday)
    setSchedule(next ? [...rest, { weekday, routineId: next }] : rest)
  }

  const patchExercise = (routineId: string, exId: string, patch: Partial<{ name: string; sets: number }>) => {
    setRoutines(routines.map((r) => r.id !== routineId ? r : {
      ...r, exercises: r.exercises.map((e) => (e.id === exId ? { ...e, ...patch } : e)),
    }))
  }

  const save = async () => {
    await saveFitnessPlan(
      routines.map((r) => ({ ...r, exercises: r.exercises.filter((e) => e.name.trim() !== '') })),
      schedule.filter((s) => routines.some((r) => r.id === s.routineId)),
    )
    onBack()
  }

  const inputBase: React.CSSProperties = {
    background: 'none', border: 'none', outline: 'none', color: c.text, fontFamily: 'inherit', fontSize: 12, padding: 0,
  }

  return (
    <div style={{ color: c.text, fontFamily: 'Georgia, "Songti SC", "SimSun", serif', fontSize: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 18px', borderBottom: `1px solid ${c.hairline}` }}>
        <span style={{ fontSize: 13, letterSpacing: 3 }}>计划管理</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button type="button" data-testid="fitness-plan-save" onClick={() => void save()}
            style={{ border: `1px solid ${c.amber}`, color: c.amber, borderRadius: 14, padding: '4px 14px', fontSize: 11, background: 'none', cursor: 'pointer' }}>保存计划</button>
          <button type="button" data-testid="fitness-plan-back" onClick={onBack}
            style={{ background: 'none', border: 'none', color: c.dim, fontSize: 11, cursor: 'pointer' }}>← 返回记录</button>
          {theme !== 'newspaper' && (
            <SwapPaintingButton surface="briefing" data-testid="briefing-swap-painting-button" className="text-parchment/70 hover:text-parchment" />
          )}
        </div>
      </div>

      <div style={{ padding: '12px 18px', borderBottom: `1px solid ${c.hairline}` }}>
        <div style={{ color: c.dim, fontSize: 11, letterSpacing: 2, marginBottom: 8 }}>一周{schedule.length}练 · 点哪天换哪个序列</div>
        <div style={{ display: 'flex', gap: 6 }}>
          {WEEKDAYS.map((wd) => {
            const rid = routineOf(wd)
            const name = rid ? routines.find((r) => r.id === rid)?.name ?? rid : null
            return (
              <button key={wd} type="button" data-testid={`fitness-plan-weekday-${wd}`} onClick={() => cycleWeekday(wd)}
                style={{
                  border: `1px solid ${name ? `${c.amber}88` : c.hairline}`, borderRadius: 6, padding: '5px 12px',
                  fontSize: 11, cursor: 'pointer', background: 'none',
                  color: name ? c.amber : c.faint,
                }}>{WD_LABEL[wd - 1]} · <span>{name ?? '休'}</span></button>
            )
          })}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${routines.length}, 1fr)` }}>
        {routines.map((routine, ri) => (
          <div key={routine.id} style={{ padding: '10px 16px', borderRight: ri < routines.length - 1 ? `1px solid ${c.hairline}` : 'none' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 }}>
              <input value={routine.name} aria-label={`序列名-${routine.id}`}
                onChange={(e) => setRoutines(routines.map((r) => (r.id === routine.id ? { ...r, name: e.target.value } : r)))}
                style={{ ...inputBase, fontSize: 13, letterSpacing: 3, width: 60, borderBottom: `1px dashed ${c.amber}66` }} />
              <button type="button" data-testid={`fitness-plan-add-exercise-${routine.id}`}
                onClick={() => setRoutines(routines.map((r) => r.id === routine.id ? { ...r, exercises: [...r.exercises, { id: makeId('ex'), name: '新动作', sets: 3 }] } : r))}
                style={{ background: 'none', border: 'none', color: c.faint, fontSize: 10, cursor: 'pointer' }}>＋动作</button>
            </div>
            {routine.exercises.map((ex) => (
              <div key={ex.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', lineHeight: 2.1 }}>
                <input data-testid={`fitness-plan-exname-${routine.id}-${ex.id}`} value={ex.name}
                  onChange={(e) => patchExercise(routine.id, ex.id, { name: e.target.value })}
                  style={{ ...inputBase, width: 110 }} />
                <span style={{ color: c.dim, display: 'flex', alignItems: 'center', gap: 4 }}>
                  <input data-testid={`fitness-plan-sets-${routine.id}-${ex.id}`} value={ex.sets} inputMode="numeric"
                    onChange={(e) => {
                      const v = parseInt(e.target.value, 10)
                      if (Number.isFinite(v) && v >= 1 && v <= 20) patchExercise(routine.id, ex.id, { sets: v })
                    }}
                    style={{ ...inputBase, width: 24, textAlign: 'center', borderBottom: `1px dashed ${c.amber}66` }} />
                  组
                  <button type="button" data-testid={`fitness-plan-remove-exercise-${routine.id}-${ex.id}`}
                    onClick={() => setRoutines(routines.map((r) => r.id === routine.id ? { ...r, exercises: r.exercises.filter((e) => e.id !== ex.id) } : r))}
                    style={{ background: 'none', border: 'none', color: c.faint, cursor: 'pointer', fontSize: 10, padding: 0 }}>×</button>
                </span>
              </div>
            ))}
          </div>
        ))}
      </div>
      <div style={{ padding: '8px 18px', borderTop: `1px solid ${c.hairline}`, display: 'flex', justifyContent: 'space-between' }}>
        <button type="button" data-testid="fitness-plan-add-routine"
          onClick={() => setRoutines([...routines, { id: makeId('routine'), name: '新序列', exercises: [] }])}
          style={{ background: 'none', border: 'none', color: c.faint, fontSize: 10, cursor: 'pointer' }}>＋ 新序列</button>
        <span style={{ color: c.faint, fontSize: 10 }}>改组数/动作/序列只影响以后的记录格子，已存的历史记录永远保持原样</span>
      </div>
    </div>
  )
}
