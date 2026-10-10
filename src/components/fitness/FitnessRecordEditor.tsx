// src/components/fitness/FitnessRecordEditor.tsx —— 记录态：一个序列的逐组二维录入
import type { BriefingTheme, FitnessData } from '@shared/index'
import { fitnessColors } from '@/lib/fitness-theme'
import { buildDraft, latestRecordOfRoutine, shortDate, type RecordDraft, type SetCell } from '@/lib/fitness'

export function FitnessRecordEditor({ theme, data, draft, onChange }: {
  theme: BriefingTheme
  data: FitnessData
  draft: RecordDraft
  onChange: (d: RecordDraft) => void
}) {
  const c = fitnessColors(theme)
  const routine = data.routines.find((r) => r.id === draft.routineId)
  if (!routine) return null
  const prev = latestRecordOfRoutine(data, routine.id)

  const setCell = (exId: string, i: number, patch: Partial<SetCell>) => {
    const cells = { ...draft.cells, [exId]: draft.cells[exId].map((cell, j) => (j === i ? { ...cell, ...patch } : cell)) }
    onChange({ ...draft, cells })
  }
  const removeCell = (exId: string, i: number) => {
    onChange({ ...draft, cells: { ...draft.cells, [exId]: draft.cells[exId].filter((_, j) => j !== i) } })
  }
  const addCell = (exId: string) => {
    const arr = draft.cells[exId]
    const last = arr[arr.length - 1] ?? { weight: '', reps: '' }
    onChange({ ...draft, cells: { ...draft.cells, [exId]: [...arr, { ...last }] } })
  }

  const inputStyle: React.CSSProperties = {
    width: 40, background: 'none', border: 'none', outline: 'none', textAlign: 'center',
    color: c.text, fontSize: 12, fontFamily: 'inherit', padding: 0,
  }

  return (
    <div>
      <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
        {data.routines.map((r) => (
          <button key={r.id} type="button" data-testid={`fitness-routine-tab-${r.id}`}
            onClick={() => onChange(buildDraft(data, r.id))}
            style={{
              fontSize: 11, padding: '3px 14px', borderRadius: 12, cursor: 'pointer', background: 'none',
              border: `1px solid ${r.id === routine.id ? c.amber : c.hairline}`,
              color: r.id === routine.id ? c.amber : c.dim,
            }}>{r.name}</button>
        ))}
      </div>
      {routine.exercises.map((ex) => {
        const prevEntry = prev?.entries.find((e) => e.exerciseId === ex.id)
        const prevText = prevEntry
          ? `上次 ${prevEntry.sets.map((s) => `${s.weight}×${s.reps}`).join(' / ')} · ${shortDate(prev!.date)}`
          : '首次记录'
        return (
          <div key={ex.id} style={{ marginBottom: 14 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 5 }}>
              <span style={{ fontSize: 13 }}>{ex.name} <span style={{ color: c.faint, fontSize: 10 }}>{draft.cells[ex.id]?.length ?? ex.sets}组</span></span>
              <span style={{ color: c.faint, fontSize: 9 }}>{prevText}</span>
            </div>
            <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
              {(draft.cells[ex.id] ?? []).map((cell, i) => {
                const prevSet = prevEntry?.sets[i]
                const edited = prevSet ? String(prevSet.weight) !== cell.weight || String(prevSet.reps) !== cell.reps : (cell.weight !== '' || cell.reps !== '')
                return (
                  <div key={i} style={{
                    width: 56, textAlign: 'center', borderRadius: 5, padding: '3px 0', position: 'relative',
                    background: c.cellBg, border: `1px solid ${edited ? c.amber : c.hairline}`,
                  }}>
                    <input data-testid={`fitness-set-weight-${ex.id}-${i}`} style={{ ...inputStyle, borderBottom: `1px dashed ${c.amber}66` }}
                      value={cell.weight} placeholder="—" inputMode="decimal"
                      onChange={(e) => setCell(ex.id, i, { weight: e.target.value })} />
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 1 }}>
                      <span style={{ color: c.faint, fontSize: 10 }}>×</span>
                      <input data-testid={`fitness-set-reps-${ex.id}-${i}`} style={{ ...inputStyle, width: 26, fontSize: 10, color: c.dim }}
                        value={cell.reps} placeholder="—" inputMode="numeric"
                        onChange={(e) => setCell(ex.id, i, { reps: e.target.value })} />
                    </div>
                    <button type="button" data-testid={`fitness-set-remove-${ex.id}-${i}`} onClick={() => removeCell(ex.id, i)}
                      style={{ position: 'absolute', top: -5, right: -3, background: 'none', border: 'none', color: c.faint, fontSize: 9, cursor: 'pointer', padding: 0 }}>×</button>
                  </div>
                )
              })}
              <button type="button" data-testid={`fitness-set-add-${ex.id}`} onClick={() => addCell(ex.id)}
                style={{
                  width: 56, borderRadius: 5, cursor: 'pointer', background: 'none',
                  border: `1px dashed ${c.hairline}`, color: c.faint, fontSize: 14,
                }}>＋</button>
            </div>
          </div>
        )
      })}
    </div>
  )
}
