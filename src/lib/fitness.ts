// src/lib/fitness.ts —— 健身域纯逻辑：默认值 / 归一化 / 派生 / 变换。无 IO，无 React。
import type {
  FitnessData, FitnessRecord, FitnessRoutine, FitnessScheduleEntry, BodyMetric,
} from '@shared/index'

export type TrendPoint = { date: string; value: number; label: string }

export const BODY_METRIC_DEFS = [
  { key: 'weight', label: '体重', unit: 'kg' },
  { key: 'chest', label: '胸围', unit: 'cm' },
  { key: 'waist', label: '腰围', unit: 'cm' },
  { key: 'hip', label: '臀围', unit: 'cm' },
  { key: 'arm', label: '臂围', unit: 'cm' },
  { key: 'thigh', label: '大腿围', unit: 'cm' },
] as const
export type BodyMetricKey = (typeof BODY_METRIC_DEFS)[number]['key']

let idSeq = 0
export function makeId(prefix: string): string {
  idSeq += 1
  return `${prefix}-${Date.now().toString(36)}-${idSeq}-${Math.random().toString(36).slice(2, 6)}`
}

export function todayStr(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function shortDate(date: string): string {
  const [, m, d] = date.split('-')
  return `${Number(m)}/${Number(d)}`
}

export const DEFAULT_FITNESS_DATA: FitnessData = {
  version: 1,
  routines: [
    { id: 'push', name: '推', exercises: [
      { id: 'ex-bench', name: '平板卧推', sets: 4 },
      { id: 'ex-incline-db', name: '上斜哑铃卧推', sets: 3 },
      { id: 'ex-shoulder-press', name: '坐姿哑铃推肩', sets: 3 },
      { id: 'ex-pushdown', name: '绳索下压', sets: 3 },
    ] },
    { id: 'pull', name: '拉', exercises: [
      { id: 'ex-pullup', name: '引体向上', sets: 4 },
      { id: 'ex-row', name: '杠铃划船', sets: 4 },
      { id: 'ex-seated-row', name: '坐姿划船', sets: 3 },
      { id: 'ex-curl', name: '哑铃弯举', sets: 3 },
    ] },
    { id: 'legs', name: '腿', exercises: [
      { id: 'ex-squat', name: '深蹲', sets: 4 },
      { id: 'ex-rdl', name: '罗马尼亚硬拉', sets: 3 },
      { id: 'ex-leg-press', name: '腿举', sets: 3 },
      { id: 'ex-calf', name: '站姿提踵', sets: 3 },
    ] },
  ],
  schedule: [
    { weekday: 1, routineId: 'push' },
    { weekday: 3, routineId: 'pull' },
    { weekday: 5, routineId: 'legs' },
  ],
  records: [],
  bodyMetrics: [],
}

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)
const isDateStr = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)

export function normalizeFitnessData(raw: unknown): FitnessData {
  if (!raw || typeof raw !== 'object') return structuredClone(DEFAULT_FITNESS_DATA)
  const r = raw as Partial<FitnessData>

  const routines: FitnessRoutine[] = Array.isArray(r.routines)
    ? r.routines
        .filter((x): x is FitnessRoutine => !!x && typeof x.id === 'string' && typeof x.name === 'string')
        .map((x) => ({
          id: x.id,
          name: x.name,
          exercises: (Array.isArray(x.exercises) ? x.exercises : [])
            .filter((e) => e && typeof e.id === 'string' && typeof e.name === 'string')
            .map((e) => ({ id: e.id, name: e.name, sets: isNum(e.sets) && e.sets >= 1 ? Math.round(e.sets) : 3 })),
        }))
    : structuredClone(DEFAULT_FITNESS_DATA.routines)

  const schedule: FitnessScheduleEntry[] = Array.isArray(r.schedule)
    ? r.schedule.filter(
        (s): s is FitnessScheduleEntry => !!s && isNum(s.weekday) && s.weekday >= 1 && s.weekday <= 7 && typeof s.routineId === 'string',
      )
    : structuredClone(DEFAULT_FITNESS_DATA.schedule)

  const records: FitnessRecord[] = Array.isArray(r.records)
    ? r.records
        .filter((x): x is FitnessRecord => !!x && typeof x.id === 'string' && isDateStr(x.date) && typeof x.routineId === 'string' && Array.isArray(x.entries))
        .map((x) => ({
          id: x.id, date: x.date, routineId: x.routineId,
          entries: x.entries
            .filter((e) => e && typeof e.exerciseId === 'string' && Array.isArray(e.sets))
            .map((e) => ({
              exerciseId: e.exerciseId,
              name: typeof e.name === 'string' ? e.name : e.exerciseId,
              sets: e.sets.filter((s) => s && isNum(s.weight) && isNum(s.reps)),
            })),
        }))
    : []

  const bodyMetrics: BodyMetric[] = Array.isArray(r.bodyMetrics)
    ? r.bodyMetrics
        .filter((m): m is BodyMetric => !!m && isDateStr(m.date))
        .map((m) => {
          const out: BodyMetric = { date: m.date }
          for (const def of BODY_METRIC_DEFS) {
            const v = m[def.key]
            if (isNum(v) && v > 0) out[def.key] = v
          }
          return out
        })
        .filter((m) => BODY_METRIC_DEFS.some((def) => m[def.key] !== undefined))
    : []

  return { version: 1, routines, schedule, records, bodyMetrics }
}

// ---------- 派生 ----------

export function sortRecords(records: FitnessRecord[]): FitnessRecord[] {
  return [...records].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.id < b.id ? -1 : 1))
}

export function latestRecord(data: FitnessData): FitnessRecord | null {
  const s = sortRecords(data.records)
  return s.length ? s[s.length - 1] : null
}

export function latestRecordOfRoutine(data: FitnessData, routineId: string): FitnessRecord | null {
  const s = sortRecords(data.records.filter((r) => r.routineId === routineId))
  return s.length ? s[s.length - 1] : null
}

export function routineNameOf(data: FitnessData, routineId: string): string {
  return data.routines.find((r) => r.id === routineId)?.name ?? routineId
}

export function recordedExerciseNames(data: FitnessData): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const rec of sortRecords(data.records)) {
    for (const e of rec.entries) {
      if (!seen.has(e.name)) { seen.add(e.name); out.push(e.name) }
    }
  }
  return out
}

/** 每笔记录取该动作第一组（做组）重量 */
export function exerciseTrendPoints(data: FitnessData, exerciseName: string): TrendPoint[] {
  const pts: TrendPoint[] = []
  for (const rec of sortRecords(data.records)) {
    const entry = rec.entries.find((e) => e.name === exerciseName)
    const first = entry?.sets[0]
    if (first) pts.push({ date: rec.date, value: first.weight, label: `${first.weight} × ${first.reps}` })
  }
  return pts
}

export function bodyTrendPoints(data: FitnessData, key: BodyMetricKey): TrendPoint[] {
  return [...data.bodyMetrics]
    .filter((m) => isNum(m[key]))
    .sort((a, b) => (a.date < b.date ? -1 : 1))
    .map((m) => ({ date: m.date, value: m[key] as number, label: `${m[key]}` }))
}

// ---------- 变换（纯函数，返回新对象） ----------

export function upsertRecord(data: FitnessData, rec: FitnessRecord): FitnessData {
  const rest = data.records.filter((r) => r.id !== rec.id)
  return { ...data, records: [...rest, rec] }
}

export function removeRecord(data: FitnessData, id: string): FitnessData {
  return { ...data, records: data.records.filter((r) => r.id !== id) }
}

export function upsertBodyMetric(data: FitnessData, m: BodyMetric): FitnessData {
  return { ...data, bodyMetrics: [...data.bodyMetrics.filter((x) => x.date !== m.date), m] }
}

export function removeBodyMetric(data: FitnessData, date: string): FitnessData {
  return { ...data, bodyMetrics: data.bodyMetrics.filter((x) => x.date !== date) }
}

export function replacePlan(data: FitnessData, routines: FitnessRoutine[], schedule: FitnessScheduleEntry[]): FitnessData {
  return { ...data, routines, schedule }
}

/** 今天练什么：schedule 命中 → 最近记录的序列 → routines[0] */
export function defaultRoutineForToday(data: FitnessData, weekday?: number): string {
  const wd = weekday ?? ((new Date().getDay() + 6) % 7) + 1 // JS 周日=0 → 7
  const hit = data.schedule.find((s) => s.weekday === wd)
  if (hit && data.routines.some((r) => r.id === hit.routineId)) return hit.routineId
  const latest = latestRecord(data)
  if (latest && data.routines.some((r) => r.id === latest.routineId)) return latest.routineId
  return data.routines[0]?.id ?? ''
}
