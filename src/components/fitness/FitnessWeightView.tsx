// src/components/fitness/FitnessWeightView.tsx —— 落地态(最新/历史记录) + 记录态编排
import { useMemo, useState } from 'react'
import { useStore } from '@/store'
import type { BriefingTheme, FitnessRecord } from '@shared/index'
import { fitnessColors } from '@/lib/fitness-theme'
import {
  sortRecords, latestRecordOfRoutine, routineNameOf, recordedExerciseNames,
  exerciseTrendPoints, shortDate, todayStr, makeId, defaultRoutineForToday,
  buildDraft, type RecordDraft,
} from '@/lib/fitness'
import { TrendChart } from './TrendChart'
import { FitnessFaceHeader, type FitnessFace } from './FitnessFaceHeader'
import { FitnessRecordEditor } from './FitnessRecordEditor'
import { ConfirmDialog } from '@/components/ConfirmDialog'

function cnDate(date: string): string {
  const [, m, d] = date.split('-')
  return `${Number(m)}月${Number(d)}日`
}

function daysBetween(a: string, b: string): number {
  return Math.round((new Date(b).getTime() - new Date(a).getTime()) / 86400000)
}

export function FitnessWeightView({ theme, onSwitch }: {
  theme: BriefingTheme
  onSwitch: (f: FitnessFace) => void
}) {
  const c = fitnessColors(theme)
  const data = useStore((s) => s.fitnessData)
  const saveRecord = useStore((s) => s.saveFitnessRecord)
  const deleteRecord = useStore((s) => s.deleteFitnessRecord)
  const [viewingId, setViewingId] = useState<string | null>(null)
  const [draft, setDraft] = useState<RecordDraft | null>(null)
  const [trendName, setTrendName] = useState<string | null>(null)
  const [confirmingDelete, setConfirmingDelete] = useState(false)

  const sorted = useMemo(() => (data ? sortRecords(data.records) : []), [data])
  const viewing = useMemo(() => {
    if (!sorted.length) return null
    return (viewingId && sorted.find((r) => r.id === viewingId)) || sorted[sorted.length - 1]
  }, [sorted, viewingId])

  const names = useMemo(() => (data ? recordedExerciseNames(data) : []), [data])
  const activeTrend = trendName && names.includes(trendName) ? trendName : names[0]
  const trendPoints = useMemo(
    () => (data && activeTrend ? exerciseTrendPoints(data, activeTrend) : []),
    [data, activeTrend],
  )

  if (!data) return null

  const startRecording = () => {
    const routineId = defaultRoutineForToday(data)
    if (!routineId) return
    setDraft(buildDraft(data, routineId))
  }

  const saveRecording = async () => {
    if (!draft) return
    const routine = data.routines.find((r) => r.id === draft.routineId)
    if (!routine) return
    const entries = routine.exercises
      .map((ex) => ({
        exerciseId: ex.id,
        name: ex.name,
        sets: (draft.cells[ex.id] ?? [])
          .map((cell) => ({ weight: parseFloat(cell.weight), reps: parseInt(cell.reps, 10) }))
          .filter((s) => Number.isFinite(s.weight) && Number.isFinite(s.reps) && s.weight > 0 && s.reps > 0),
      }))
      .filter((e) => e.sets.length > 0)
    if (entries.length === 0) return
    const rec: FitnessRecord = { id: makeId('rec'), date: todayStr(), routineId: draft.routineId, entries }
    await saveRecord(rec)
    setViewingId(rec.id)
    setDraft(null)
  }

  const viewingIdx = viewing ? sorted.findIndex((r) => r.id === viewing.id) : -1

  const confirmDelete = async () => {
    if (!viewing) return
    const id = viewing.id
    setConfirmingDelete(false)
    await deleteRecord(id)
    setViewingId(null)
  }
  const chipStyle = (active: boolean): React.CSSProperties => ({
    fontSize: 11, padding: '3px 11px', borderRadius: 12, cursor: 'pointer', background: 'none',
    border: `1px solid ${active ? c.amber : c.hairline}`,
    color: active ? c.amber : c.dim,
  })

  return (
    <div style={{ color: c.text, fontFamily: 'Georgia, "Songti SC", "SimSun", serif', fontSize: 12 }}>
      <FitnessFaceHeader theme={theme} face="weight" onSwitch={onSwitch} right={
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {!draft && sorted.length > 0 && (
            <>
              <span style={{ color: c.faint, fontSize: 10, marginRight: 2 }}>记录</span>
              <button type="button" data-testid="fitness-prev-record" disabled={viewingIdx <= 0}
                onClick={() => setViewingId(sorted[viewingIdx - 1].id)}
                style={{ background: 'none', border: 'none', color: viewingIdx <= 0 ? c.faint : c.dim, cursor: 'pointer', fontSize: 11 }}>‹</button>
              {sorted.map((r) => (
                <button key={r.id} type="button" data-testid={`fitness-record-chip-${r.id}`}
                  onClick={() => setViewingId(r.id)} style={chipStyle(viewing?.id === r.id)}>
                  {shortDate(r.date)}
                </button>
              ))}
              <button type="button" data-testid="fitness-next-record" disabled={viewingIdx >= sorted.length - 1}
                onClick={() => setViewingId(sorted[viewingIdx + 1].id)}
                style={{ background: 'none', border: 'none', color: viewingIdx >= sorted.length - 1 ? c.faint : c.dim, cursor: 'pointer', fontSize: 11 }}>›</button>
            </>
          )}
          {draft ? (
            <>
              <span data-testid="fitness-recording-hint" style={{ color: c.amber, fontSize: 11 }}>● 正在记录 {cnDate(todayStr())}</span>
              <button type="button" data-testid="fitness-record-save" onClick={() => void saveRecording()}
                style={{ border: `1px solid ${c.amber}`, color: c.amber, borderRadius: 14, padding: '4px 14px', fontSize: 11, background: 'none', cursor: 'pointer' }}>保存快照</button>
              <button type="button" data-testid="fitness-record-cancel" onClick={() => setDraft(null)}
                style={{ background: 'none', border: 'none', color: c.faint, fontSize: 11, cursor: 'pointer' }}>取消</button>
            </>
          ) : (
            <button type="button" data-testid="fitness-record-button" onClick={startRecording}
              style={{ border: `1px solid ${c.amber}`, color: c.amber, borderRadius: 14, padding: '4px 14px', fontSize: 11, background: 'none', cursor: 'pointer', marginLeft: 8 }}>✎ 记录当下</button>
          )}
        </div>
      } />

      {draft ? (
        <div style={{ padding: '12px 18px' }}>
          <FitnessRecordEditor theme={theme} data={data} draft={draft} onChange={setDraft} />
        </div>
      ) : sorted.length === 0 ? (
        <div data-testid="fitness-empty" style={{ padding: '60px 0', textAlign: 'center', color: c.faint, fontSize: 12 }}>
          还没有训练记录 —— 右上角「✎ 记录当下」记第一笔
        </div>
      ) : viewing ? (
        <>
          <div style={{ padding: '6px 18px', borderBottom: `1px solid ${c.hairline}`, display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ color: c.dim, fontSize: 11 }}><span>{cnDate(viewing.date)}</span>{' · '}{routineNameOf(data, viewing.routineId)}日</span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              {viewingIdx > 0 && <span style={{ color: c.faint, fontSize: 10 }}>距上一笔 {daysBetween(sorted[viewingIdx - 1].date, viewing.date)} 天</span>}
              <button type="button" data-testid="fitness-record-delete" onClick={() => setConfirmingDelete(true)}
                style={{ background: 'none', border: 'none', color: c.faint, fontSize: 10, cursor: 'pointer', padding: 0 }}
                onMouseEnter={(e) => { e.currentTarget.style.color = c.amber }}
                onMouseLeave={(e) => { e.currentTarget.style.color = c.faint }}
              >× 删除此记录</button>
            </span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.max(data.routines.length, 1)}, 1fr)` }}>
            {data.routines.map((routine, ri) => {
              const isViewing = viewing.routineId === routine.id
              const rec = isViewing ? viewing : latestRecordOfRoutine(data, routine.id)
              return (
                <div key={routine.id} data-testid={`fitness-routine-col-${routine.id}`}
                  onClick={() => { if (!isViewing && rec) setViewingId(rec.id) }}
                  style={{
                    padding: '10px 14px', cursor: isViewing || !rec ? 'default' : 'pointer',
                    borderRight: ri < data.routines.length - 1 ? `1px solid ${c.hairline}` : 'none',
                    opacity: isViewing ? 1 : 0.55,
                  }}>
                  <div style={{ fontSize: 13, letterSpacing: 3, marginBottom: 6, color: isViewing ? c.amber : c.text }}>
                    {routine.name}{isViewing && <span style={{ color: c.faint, fontSize: 9, letterSpacing: 0 }}> ← 本笔记录</span>}
                  </div>
                  {rec ? rec.entries.map((entry) => (
                    <div key={entry.exerciseId} style={{ marginBottom: 11 }}>
                      <div style={{ marginBottom: 5 }}>{entry.name}</div>
                      <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                        {entry.sets.map((s, i) => (
                          <div key={i} style={{ width: 46, textAlign: 'center', background: c.cellBg, border: `1px solid ${c.hairline}`, borderRadius: 5, padding: '3px 0' }}>
                            <div style={{ fontSize: 12 }}>{s.weight}</div>
                            <div style={{ fontSize: 9.5, color: c.dim, marginTop: 1 }}>×{s.reps}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )) : <div style={{ color: c.faint, fontSize: 10 }}>尚无记录</div>}
                  {!isViewing && rec && <div style={{ color: c.faint, fontSize: 9 }}>最近一次 · {shortDate(rec.date)}</div>}
                </div>
              )
            })}
          </div>
        </>
      ) : null}

      {/* 趋势 */}
      <div style={{ borderTop: `1px solid ${c.hairline}`, padding: '8px 18px 10px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4, flexWrap: 'wrap' }}>
          <span style={{ color: c.faint, fontSize: 10 }}>趋势</span>
          {names.map((n) => (
            <button key={n} type="button" data-testid={`fitness-trend-chip-${n}`} onClick={() => setTrendName(n)}
              style={{
                fontSize: 10, padding: '2px 10px', borderRadius: 10, cursor: 'pointer', background: 'none',
                border: `1px solid ${n === activeTrend ? c.amber : c.hairline}`,
                color: n === activeTrend ? c.amber : c.dim,
              }}>{n}</button>
          ))}
        </div>
        <TrendChart points={trendPoints} colors={c} unit="kg"
          activeDate={viewing?.date}
          onSelectDate={(date) => {
            const hit = sorted.find((r) => r.date === date)
            if (hit) setViewingId(hit.id)
          }} />
      </div>

      <ConfirmDialog
        open={confirmingDelete}
        title="删除训练记录"
        icon="trash"
        confirmLabel="删除"
        confirmVariant="danger"
        onCancel={() => setConfirmingDelete(false)}
        onConfirm={() => void confirmDelete()}
      >
        <p>即将删除 {viewing ? `${cnDate(viewing.date)} · ${routineNameOf(data, viewing.routineId)}日` : ''} 的训练记录，此操作不可恢复。</p>
      </ConfirmDialog>
    </div>
  )
}
