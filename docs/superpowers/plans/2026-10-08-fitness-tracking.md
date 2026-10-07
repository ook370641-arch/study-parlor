# 健身跟踪（夜航简报第三来源）实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在夜航简报新增「健身」来源：计划管理（序列+动作+组数）、逐组重量快照记录、身体尺寸记录、手写 SVG 趋势图。

**Architecture:** 数据落 `~/.studyparlor/fitness.json`（safe-json 读写，version 字段，损坏回退 .bak/默认）。纯逻辑（默认值/归一化/派生/变换）全部在 `src/lib/fitness.ts`，主进程 `electron/lib/fitness-store.ts` 只做 fs 包装，IPC 薄壳。渲染侧 `src/components/fitness/` 三个面（重量/尺寸/计划）+ 共用 `TrendChart`。

**Tech Stack:** Electron 30 + React 18 + TypeScript + Zustand + Vitest(jsdom + @testing-library/react) + Playwright e2e。

**Spec:** `docs/superpowers/specs/2026-10-08-fitness-tracking-design.md`

## Global Constraints

- **并行会话警告**：另一窗口可能正在删除三个简报来源（写作/前沿/拾贝），涉及 `src/pages/Briefing.tsx`、`src/components/BriefingSourceSidebar.tsx`、`src/types/index.ts`、`src/store/index.ts`。修改这四个文件前先看 `git status` / `git diff`，只加自己的 hunk，不格式化、不动他人改动。
- 只跑定向测试（general §9）：`npx vitest run tests/<file>`；禁止全量。
- 组件文件只导出组件（ui-styling §10）：helper/常量/类型放 `src/lib/`。
- 色彩只用 `#2a1f1a` / `#e8d5b7` / `#d97757`（ui-styling §11）；动效为零（纯静态渲染）。
- 不引入任何新依赖。
- 所有可交互元素带 `data-testid`（feature-development §12）。
- 健身数据文件在 `getStateDir()` 下（E2E 时 = 临时 configDir，天然隔离）。

---

### Task 1: 共享类型 + 纯逻辑库 `src/lib/fitness.ts`

**Files:**
- Modify: `src/types/index.ts`（在 `BriefingSourceId` 附近追加健身类型；`BriefingSourceId` 联合加 `'fitness'`）
- Create: `src/lib/fitness.ts`
- Test: `tests/fitness.test.ts`

**Interfaces:**
- Produces（后续所有 task 依赖）:
  - 类型：`FitnessSet / FitnessExercise / FitnessRoutine / FitnessScheduleEntry / FitnessRecordEntry / FitnessRecord / BodyMetric / FitnessData`
  - `DEFAULT_FITNESS_DATA: FitnessData`
  - `normalizeFitnessData(raw: unknown): FitnessData`
  - `sortRecords(records: FitnessRecord[]): FitnessRecord[]`（date 升序，同日期按 id）
  - `latestRecord(data): FitnessRecord | null` / `latestRecordOfRoutine(data, routineId): FitnessRecord | null`
  - `routineNameOf(data, routineId): string`
  - `recordedExerciseNames(data): string[]`（按首次出现去重）
  - `exerciseTrendPoints(data, exerciseName): TrendPoint[]`（每笔记录取该动作第一组重量）
  - `bodyTrendPoints(data, key): TrendPoint[]`
  - `upsertRecord(data, rec) / removeRecord(data, id) / upsertBodyMetric(data, m) / removeBodyMetric(data, date) / replacePlan(data, routines, schedule): FitnessData`
  - `defaultRoutineForToday(data, weekday?): string`（schedule 命中 → 最近记录的序列 → 第一个序列）
  - `makeId(prefix): string` / `todayStr(): string` / `shortDate('2026-09-28') → '9/28'`
  - `type TrendPoint = { date: string; value: number; label: string }`
  - `BODY_METRIC_DEFS: readonly { key: 'weight'|'chest'|'waist'|'hip'|'arm'|'thigh'; label: string; unit: string }[]`

- [ ] **Step 1: 写类型**

在 `src/types/index.ts` 中：

```ts
// BriefingSourceId 行改为：
export type BriefingSourceId = 'writing' | 'digest' | 'anthropic' | 'job-briefing' | 'scout' | 'fitness'

// 紧随其后新增：
export type FitnessSet = { weight: number; reps: number }
export type FitnessExercise = { id: string; name: string; sets: number }
export type FitnessRoutine = { id: string; name: string; exercises: FitnessExercise[] }
export type FitnessScheduleEntry = { weekday: number; routineId: string }
export type FitnessRecordEntry = { exerciseId: string; name: string; sets: FitnessSet[] }
export type FitnessRecord = { id: string; date: string; routineId: string; entries: FitnessRecordEntry[] }
export type BodyMetric = {
  date: string
  weight?: number; chest?: number; waist?: number; hip?: number; arm?: number; thigh?: number
}
export type FitnessData = {
  version: 1
  routines: FitnessRoutine[]
  schedule: FitnessScheduleEntry[]
  records: FitnessRecord[]
  bodyMetrics: BodyMetric[]
}
```

- [ ] **Step 2: 写失败测试 `tests/fitness.test.ts`**

```ts
import { describe, it, expect } from 'vitest'
import {
  DEFAULT_FITNESS_DATA, normalizeFitnessData, sortRecords, latestRecord, latestRecordOfRoutine,
  routineNameOf, recordedExerciseNames, exerciseTrendPoints, bodyTrendPoints,
  upsertRecord, removeRecord, upsertBodyMetric, removeBodyMetric, replacePlan,
  defaultRoutineForToday, shortDate, makeId,
} from '../src/lib/fitness'
import type { FitnessData, FitnessRecord, BodyMetric } from '@shared/index'

const REC1: FitnessRecord = {
  id: 'r1', date: '2026-09-03', routineId: 'push',
  entries: [{ exerciseId: 'ex-bench', name: '平板卧推', sets: [{ weight: 55, reps: 8 }, { weight: 55, reps: 8 }] }],
}
const REC2: FitnessRecord = {
  id: 'r2', date: '2026-09-28', routineId: 'push',
  entries: [{ exerciseId: 'ex-bench', name: '平板卧推', sets: [{ weight: 60, reps: 8 }] }],
}

function seed(): FitnessData {
  return { ...structuredClone(DEFAULT_FITNESS_DATA), records: [REC2, REC1] } // 故意乱序
}

describe('normalizeFitnessData', () => {
  it('null/非对象 → 默认数据', () => {
    expect(normalizeFitnessData(null).routines.length).toBe(3)
    expect(normalizeFitnessData('junk').records).toEqual([])
  })
  it('过滤非法 record / bodyMetric，保留合法字段', () => {
    const d = normalizeFitnessData({
      version: 1, routines: DEFAULT_FITNESS_DATA.routines, schedule: DEFAULT_FITNESS_DATA.schedule,
      records: [REC1, { id: 1 }, { id: 'x', date: 'bad', routineId: 'push', entries: 'no' }],
      bodyMetrics: [{ date: '2026-09-01', weight: 72 }, { weight: 1 }, { date: '2026-09-02', weight: 'abc' }],
    })
    expect(d.records).toEqual([REC1])
    expect(d.bodyMetrics).toEqual([{ date: '2026-09-01', weight: 72 }])
  })
  it('缺 routines/schedule → 用默认', () => {
    const d = normalizeFitnessData({ version: 1, records: [], bodyMetrics: [] })
    expect(d.routines.map((r) => r.id)).toEqual(['push', 'pull', 'legs'])
    expect(d.schedule.length).toBe(3)
  })
})

describe('records 派生', () => {
  it('sortRecords 按日期升序', () => {
    expect(sortRecords(seed().records).map((r) => r.id)).toEqual(['r1', 'r2'])
  })
  it('latestRecord / latestRecordOfRoutine', () => {
    expect(latestRecord(seed())?.id).toBe('r2')
    expect(latestRecordOfRoutine(seed(), 'push')?.id).toBe('r2')
    expect(latestRecordOfRoutine(seed(), 'legs')).toBeNull()
  })
  it('routineNameOf 活查当前名，序列被删回退 routineId', () => {
    expect(routineNameOf(seed(), 'push')).toBe('推')
    expect(routineNameOf(seed(), 'deleted')).toBe('deleted')
  })
  it('recordedExerciseNames 去重且含已从计划删除的动作', () => {
    const d = seed()
    d.routines[0].exercises = [] // 卧推从计划删除
    expect(recordedExerciseNames(d)).toContain('平板卧推')
  })
  it('exerciseTrendPoints 取每笔第一组重量，按日期升序', () => {
    const pts = exerciseTrendPoints(seed(), '平板卧推')
    expect(pts.map((p) => p.value)).toEqual([55, 60])
    expect(pts[0]).toEqual({ date: '2026-09-03', value: 55, label: '55 × 8' })
  })
})

describe('bodyMetrics', () => {
  it('bodyTrendPoints 跳过缺该项的记录', () => {
    const d = seed()
    d.bodyMetrics = [
      { date: '2026-09-01', weight: 72 },
      { date: '2026-09-10', waist: 84 },
      { date: '2026-09-20', weight: 71.5 },
    ]
    expect(bodyTrendPoints(d, 'weight').map((p) => p.value)).toEqual([72, 71.5])
  })
  it('upsertBodyMetric 同日期覆盖', () => {
    const d = upsertBodyMetric(seed(), { date: '2026-09-01', weight: 72 })
    const d2 = upsertBodyMetric(d, { date: '2026-09-01', waist: 84 })
    expect(d2.bodyMetrics.length).toBe(1)
    expect(d2.bodyMetrics[0]).toEqual({ date: '2026-09-01', waist: 84 })
  })
  it('removeBodyMetric 按日期删', () => {
    const d = removeBodyMetric(upsertBodyMetric(seed(), { date: '2026-09-01', weight: 72 }), '2026-09-01')
    expect(d.bodyMetrics).toEqual([])
  })
})

describe('record 变换', () => {
  it('upsertRecord 同 id 幂等（覆盖不追加）', () => {
    const d = upsertRecord(seed(), { ...REC1, entries: [] })
    expect(d.records.filter((r) => r.id === 'r1').length).toBe(1)
    expect(d.records.find((r) => r.id === 'r1')?.entries).toEqual([])
  })
  it('removeRecord', () => {
    expect(removeRecord(seed(), 'r1').records.map((r) => r.id)).toEqual(['r2'])
  })
})

describe('defaultRoutineForToday', () => {
  it('schedule 命中优先', () => {
    expect(defaultRoutineForToday(seed(), 1)).toBe('push') // 周一
    expect(defaultRoutineForToday(seed(), 3)).toBe('pull')
  })
  it('休息日回退最近记录的序列，再回退第一个', () => {
    expect(defaultRoutineForToday(seed(), 7)).toBe('push') // 最近记录是 push
    const empty = { ...seed(), records: [] }
    expect(defaultRoutineForToday(empty, 7)).toBe('push')  // routines[0]
  })
})

describe('杂项', () => {
  it('shortDate', () => expect(shortDate('2026-09-28')).toBe('9/28'))
  it('makeId 不重复', () => expect(makeId('rec')).not.toBe(makeId('rec')))
  it('replacePlan 只换 routines/schedule，records 不动', () => {
    const d = replacePlan(seed(), [], [])
    expect(d.routines).toEqual([])
    expect(d.records.length).toBe(2)
  })
})
```

- [ ] **Step 3: 跑测试确认失败**

Run: `npx vitest run tests/fitness.test.ts`
Expected: FAIL（模块不存在）

- [ ] **Step 4: 实现 `src/lib/fitness.ts`**

```ts
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
```

- [ ] **Step 5: 跑测试确认通过**

Run: `npx vitest run tests/fitness.test.ts`
Expected: PASS（全部）

- [ ] **Step 6: Commit**

```bash
git add src/types/index.ts src/lib/fitness.ts tests/fitness.test.ts
git commit -m "feat(fitness): 数据模型与纯逻辑库——默认值/归一化/趋势派生/记录变换"
```

---

### Task 2: 主进程存储 `electron/lib/fitness-store.ts`

**Files:**
- Create: `electron/lib/fitness-store.ts`
- Test: `tests/fitness-store.test.ts`

**Interfaces:**
- Consumes: Task 1 的 `normalizeFitnessData / DEFAULT_FITNESS_DATA`；现有 `electron/lib/safe-json.ts` 的 `safeReadJson/safeWriteJson`
- Produces: `fitnessFile(dir): string`、`loadFitness(dir): FitnessData`（缺文件→写默认；损坏→.bak/默认）、`writeFitness(dir, data): void`

- [ ] **Step 1: 写失败测试 `tests/fitness-store.test.ts`**

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { loadFitness, writeFitness, fitnessFile } from '../electron/lib/fitness-store'

let dir: string
beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fitness-test-')) })
afterEach(() => { fs.rmSync(dir, { recursive: true, force: true }) })

describe('fitness-store', () => {
  it('文件缺失 → 初始化默认并落盘', () => {
    const d = loadFitness(dir)
    expect(d.routines.map((r) => r.id)).toEqual(['push', 'pull', 'legs'])
    expect(fs.existsSync(fitnessFile(dir))).toBe(true)
  })
  it('写入 → 读取 roundtrip', () => {
    const d = loadFitness(dir)
    d.records.push({ id: 'r1', date: '2026-10-08', routineId: 'push', entries: [] })
    writeFitness(dir, d)
    expect(loadFitness(dir).records.length).toBe(1)
  })
  it('JSON 损坏 → 回退默认不抛异常', () => {
    fs.writeFileSync(fitnessFile(dir), '{not json', 'utf8')
    const d = loadFitness(dir)
    expect(d.version).toBe(1)
    expect(d.records).toEqual([])
  })
  it('字段非法 → normalize 兜底', () => {
    fs.writeFileSync(fitnessFile(dir), JSON.stringify({ version: 1, records: [{ bad: 1 }], routines: 42 }), 'utf8')
    const d = loadFitness(dir)
    expect(d.records).toEqual([])
    expect(d.routines.length).toBe(3)
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run tests/fitness-store.test.ts`
Expected: FAIL（模块不存在）

- [ ] **Step 3: 实现**

```ts
// electron/lib/fitness-store.ts —— fitness.json 的 fs 包装；逻辑全在 src/lib/fitness.ts
import fs from 'node:fs'
import path from 'node:path'
import { safeReadJson, safeWriteJson } from './safe-json'
import { normalizeFitnessData, DEFAULT_FITNESS_DATA } from '../../src/lib/fitness'
import type { FitnessData } from '@shared/index'

export function fitnessFile(dir: string): string {
  return path.join(dir, 'fitness.json')
}

export function loadFitness(dir: string): FitnessData {
  const file = fitnessFile(dir)
  if (!fs.existsSync(file)) {
    const data = structuredClone(DEFAULT_FITNESS_DATA)
    safeWriteJson(file, data)
    return data
  }
  // safeReadJson 内部已处理损坏 → .bak → fallback；normalize 兜底形状
  return normalizeFitnessData(safeReadJson<unknown>(file, { fallback: null }))
}

export function writeFitness(dir: string, data: FitnessData): void {
  safeWriteJson(fitnessFile(dir), data)
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `npx vitest run tests/fitness-store.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add electron/lib/fitness-store.ts tests/fitness-store.test.ts
git commit -m "feat(fitness): 主进程存储——fitness.json 读写、缺失初始化、损坏回退"
```

---

### Task 3: IPC 五层接线

**Files:**
- Create: `electron/ipc/fitness.ts`
- Modify: `electron/ipc/index.ts`（registerAllIpc 加一行）
- Modify: `src/types/index.ts`（`IpcApi` 加 6 个方法）
- Modify: `electron/preload.ts`（api 对象加 6 个方法）
- Modify: `src/lib/ipc.ts`（facade 加 6 个 getter）
- Test: `tests/fitness-ipc-shape.test.ts`（形状断言：preload 无法脱离 electron 单测，改为断言 IpcApi 键存在于 facade——轻量编译期保障 + e2e 运行时验证）

**Interfaces:**
- Produces（store/UI 依赖）:`ipc.fitnessLoad(): Promise<FitnessData>`、`ipc.fitnessSaveRecord(rec): Promise<FitnessData>`、`ipc.fitnessDeleteRecord(id): Promise<FitnessData>`、`ipc.fitnessSaveBodyMetric(m): Promise<FitnessData>`、`ipc.fitnessDeleteBodyMetric(date): Promise<FitnessData>`、`ipc.fitnessSavePlan({routines, schedule}): Promise<FitnessData>`

- [ ] **Step 1: `src/types/index.ts` 的 `IpcApi` 接口加方法**（放在 `patchStateSync` 之后）

```ts
  fitnessLoad: () => Promise<FitnessData>
  fitnessSaveRecord: (r: FitnessRecord) => Promise<FitnessData>
  fitnessDeleteRecord: (id: string) => Promise<FitnessData>
  fitnessSaveBodyMetric: (m: BodyMetric) => Promise<FitnessData>
  fitnessDeleteBodyMetric: (date: string) => Promise<FitnessData>
  fitnessSavePlan: (p: { routines: FitnessRoutine[]; schedule: FitnessScheduleEntry[] }) => Promise<FitnessData>
```

- [ ] **Step 2: 创建 `electron/ipc/fitness.ts`**

```ts
// electron/ipc/fitness.ts
import { ipcMain } from 'electron'
import { getStateDir } from '../env'
import { loadFitness, writeFitness } from '../lib/fitness-store'
import { upsertRecord, removeRecord, upsertBodyMetric, removeBodyMetric, replacePlan } from '../../src/lib/fitness'
import type { FitnessData, FitnessRecord, BodyMetric, FitnessRoutine, FitnessScheduleEntry } from '@shared/index'

export function registerFitnessIpc() {
  ipcMain.handle('fitness:load', async (): Promise<FitnessData> => loadFitness(getStateDir()))

  ipcMain.handle('fitness:saveRecord', async (_, rec: FitnessRecord): Promise<FitnessData> => {
    const dir = getStateDir()
    const data = upsertRecord(loadFitness(dir), rec)
    writeFitness(dir, data)
    return data
  })

  ipcMain.handle('fitness:deleteRecord', async (_, id: string): Promise<FitnessData> => {
    const dir = getStateDir()
    const data = removeRecord(loadFitness(dir), id)
    writeFitness(dir, data)
    return data
  })

  ipcMain.handle('fitness:saveBodyMetric', async (_, m: BodyMetric): Promise<FitnessData> => {
    const dir = getStateDir()
    const data = upsertBodyMetric(loadFitness(dir), m)
    writeFitness(dir, data)
    return data
  })

  ipcMain.handle('fitness:deleteBodyMetric', async (_, date: string): Promise<FitnessData> => {
    const dir = getStateDir()
    const data = removeBodyMetric(loadFitness(dir), date)
    writeFitness(dir, data)
    return data
  })

  ipcMain.handle('fitness:savePlan', async (_, p: { routines: FitnessRoutine[]; schedule: FitnessScheduleEntry[] }): Promise<FitnessData> => {
    const dir = getStateDir()
    const data = replacePlan(loadFitness(dir), p.routines, p.schedule)
    writeFitness(dir, data)
    return data
  })
}
```

- [ ] **Step 3: 注册 + preload + facade**

`electron/ipc/index.ts`：
```ts
import { registerFitnessIpc } from './fitness'
// registerAllIpc 内 registerCollectionIpc(cfg) 之后加：
  registerFitnessIpc()
```

`electron/preload.ts`（`patchStateSync` 之后）：
```ts
  fitnessLoad: () => ipcRenderer.invoke('fitness:load'),
  fitnessSaveRecord: (r) => ipcRenderer.invoke('fitness:saveRecord', r),
  fitnessDeleteRecord: (id) => ipcRenderer.invoke('fitness:deleteRecord', id),
  fitnessSaveBodyMetric: (m) => ipcRenderer.invoke('fitness:saveBodyMetric', m),
  fitnessDeleteBodyMetric: (date) => ipcRenderer.invoke('fitness:deleteBodyMetric', date),
  fitnessSavePlan: (p) => ipcRenderer.invoke('fitness:savePlan', p),
```

`src/lib/ipc.ts`（`patchStateSync` getter 之后）：
```ts
  get fitnessLoad() { return ensure().fitnessLoad },
  get fitnessSaveRecord() { return ensure().fitnessSaveRecord },
  get fitnessDeleteRecord() { return ensure().fitnessDeleteRecord },
  get fitnessSaveBodyMetric() { return ensure().fitnessSaveBodyMetric },
  get fitnessDeleteBodyMetric() { return ensure().fitnessDeleteBodyMetric },
  get fitnessSavePlan() { return ensure().fitnessSavePlan },
```

- [ ] **Step 4: 编译验证 + 轻量形状测试**

Run: `npx tsc --noEmit`
Expected: 通过（类型链完整即五层对齐；若 IpcApi 缺方法，preload 的 `const api: IpcApi` 会报错）

`tests/fitness-ipc-shape.test.ts`：
```ts
import { describe, it, expect } from 'vitest'
import { ipc } from '../src/lib/ipc'

describe('fitness ipc facade', () => {
  it('六个方法都已暴露', () => {
    for (const k of ['fitnessLoad', 'fitnessSaveRecord', 'fitnessDeleteRecord', 'fitnessSaveBodyMetric', 'fitnessDeleteBodyMetric', 'fitnessSavePlan'] as const) {
      // facade getter 在未注入 window.api 时会 throw，证明键存在即可
      expect(() => void ipc[k]).toThrow('window.api missing')
    }
  })
})
```

Run: `npx vitest run tests/fitness-ipc-shape.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add electron/ipc/fitness.ts electron/ipc/index.ts electron/preload.ts src/types/index.ts src/lib/ipc.ts tests/fitness-ipc-shape.test.ts
git commit -m "feat(fitness): IPC 五层接线——load/saveRecord/saveBodyMetric/savePlan"
```

---

### Task 4: store slice + 来源注册

**Files:**
- Modify: `src/store/index.ts`
- Modify: `src/lib/briefing-source-order.ts`
- Test: `tests/fitness-store-slice.test.ts`

**Interfaces:**
- Produces: `useStore(s => s.fitnessData): FitnessData | null`、`s.loadFitness()`、`s.saveFitnessRecord(rec)`、`s.deleteFitnessRecord(id)`、`s.saveBodyMetric(m)`、`s.deleteBodyMetric(date)`、`s.saveFitnessPlan(routines, schedule)`；`'fitness'` 成为合法来源且默认顺序第三位

- [ ] **Step 1: 写失败测试 `tests/fitness-store-slice.test.ts`**

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { useStore } from '../src/store'
import { DEFAULT_BRIEFING_SOURCE_ORDER, normalizeBriefingSourceOrder } from '../src/lib/briefing-source-order'
import { DEFAULT_FITNESS_DATA } from '../src/lib/fitness'
import type { FitnessData } from '@shared/index'

const SEED: FitnessData = structuredClone(DEFAULT_FITNESS_DATA)

beforeEach(() => {
  // 每个用例重置 facade  stub
  ;(window as unknown as { api: unknown }).api = {
    fitnessLoad: async () => structuredClone(SEED),
    fitnessSaveRecord: async (r: never) => ({ ...structuredClone(SEED), records: [r] }),
  }
  useStore.setState({ fitnessData: null })
})

describe('fitness store slice', () => {
  it('loadFitness 写入 fitnessData', async () => {
    await useStore.getState().loadFitness()
    expect(useStore.getState().fitnessData?.routines.length).toBe(3)
  })
  it('saveFitnessRecord 用返回值覆盖', async () => {
    await useStore.getState().saveFitnessRecord({ id: 'r1', date: '2026-10-08', routineId: 'push', entries: [] })
    expect(useStore.getState().fitnessData?.records.length).toBe(1)
  })
})

describe('来源注册', () => {
  it('fitness 在默认顺序第三位', () => {
    expect(DEFAULT_BRIEFING_SOURCE_ORDER).toEqual(['writing', 'digest', 'fitness', 'anthropic', 'job-briefing', 'scout'])
  })
  it('旧持久化顺序缺 fitness → 归一化后含 fitness', () => {
    const n = normalizeBriefingSourceOrder(['writing', 'digest'])
    expect(n).toContain('fitness')
  })
  it('持久化 briefingSource=fitness 被接受', async () => {
    // store 初始化白名单（index.ts:729 附近）接受 'fitness'
    const s = useStore.getState()
    await s.setBriefingSource('fitness')
    expect(useStore.getState().briefingSource).toBe('fitness')
  })
})
```

注意：`setBriefingSource` 会调 `ipc.patchState` —— beforeEach 的 stub 里补 `patchState: async () => {}`。

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run tests/fitness-store-slice.test.ts`
Expected: FAIL（fitnessData / loadFitness 不存在；顺序数组不含 fitness）

- [ ] **Step 3: 实现**

`src/lib/briefing-source-order.ts`：
```ts
export const DEFAULT_BRIEFING_SOURCE_ORDER: BriefingSourceId[] = [
  'writing',
  'digest',
  'fitness',
  'anthropic',
  'job-briefing',
  'scout',
]
```

`src/store/index.ts`：
1. import 类型：`FitnessData, FitnessRecord, BodyMetric, FitnessRoutine, FitnessScheduleEntry` 加入既有 `@shared/index` import
2. Store 接口（`briefingSource: BriefingSourceId` 附近）加：
```ts
  fitnessData: FitnessData | null
  loadFitness: () => Promise<void>
  saveFitnessRecord: (rec: FitnessRecord) => Promise<void>
  deleteFitnessRecord: (id: string) => Promise<void>
  saveBodyMetric: (m: BodyMetric) => Promise<void>
  deleteBodyMetric: (date: string) => Promise<void>
  saveFitnessPlan: (routines: FitnessRoutine[], schedule: FitnessScheduleEntry[]) => Promise<void>
```
3. 初始值（`briefingSource: 'digest'` 附近）加：`fitnessData: null,`
4. actions（`setBriefingSource` 实现附近）加：
```ts
    loadFitness: async () => { set({ fitnessData: await ipc.fitnessLoad() }) },
    saveFitnessRecord: async (rec) => { set({ fitnessData: await ipc.fitnessSaveRecord(rec) }) },
    deleteFitnessRecord: async (id) => { set({ fitnessData: await ipc.fitnessDeleteRecord(id) }) },
    saveBodyMetric: async (m) => { set({ fitnessData: await ipc.fitnessSaveBodyMetric(m) }) },
    deleteBodyMetric: async (date) => { set({ fitnessData: await ipc.fitnessDeleteBodyMetric(date) }) },
    saveFitnessPlan: async (routines, schedule) => { set({ fitnessData: await ipc.fitnessSavePlan({ routines, schedule }) }) },
```
5. 第 729 行附近的持久化来源白名单加 `'fitness'`：
```ts
      briefingSource: state.briefingSource === 'anthropic' || state.briefingSource === 'job-briefing' || state.briefingSource === 'writing' || state.briefingSource === 'scout' || state.briefingSource === 'fitness' ? state.briefingSource : 'digest',
```

- [ ] **Step 4: 跑测试确认通过**

Run: `npx vitest run tests/fitness-store-slice.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/store/index.ts src/lib/briefing-source-order.ts tests/fitness-store-slice.test.ts
git commit -m "feat(fitness): store slice 与来源注册——默认顺序第三位"
```

---

### Task 5: 主题工具 + TrendChart 组件

**Files:**
- Create: `src/lib/fitness-theme.ts`
- Create: `src/components/fitness/TrendChart.tsx`
- Test: `tests/fitness-trend-chart.test.tsx`

**Interfaces:**
- Produces: `fitnessColors(theme: BriefingTheme)` 返回 `{ dark, bg, text, dim, faint, hairline, amber, cellBg }`；`<TrendChart points={TrendPoint[]} activeDate? unit? onSelectDate? />`（0 点渲染 `data-testid="fitness-trend-empty"`；1 点只画圆点；≥2 点画 polyline；点可点，`data-testid="fitness-trend-point-{date}"`）

- [ ] **Step 1: 写失败测试 `tests/fitness-trend-chart.test.tsx`**

```tsx
import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { TrendChart } from '../src/components/fitness/TrendChart'
import { fitnessColors } from '../src/lib/fitness-theme'

const PTS = [
  { date: '2026-09-03', value: 55, label: '55 × 8' },
  { date: '2026-09-28', value: 60, label: '60 × 8' },
  { date: '2026-10-27', value: 62.5, label: '62.5 × 8' },
]

describe('TrendChart', () => {
  it('0 点 → 空态文案', () => {
    render(<TrendChart points={[]} colors={fitnessColors('academic')} />)
    expect(screen.getByTestId('fitness-trend-empty')).toBeTruthy()
  })
  it('1 点 → 有圆点无折线', () => {
    const { container } = render(<TrendChart points={[PTS[0]]} colors={fitnessColors('academic')} />)
    expect(container.querySelectorAll('circle').length).toBe(1)
    expect(container.querySelectorAll('polyline').length).toBe(0)
  })
  it('3 点 → 折线 + 3 圆点 + 日期标注', () => {
    const { container } = render(<TrendChart points={PTS} colors={fitnessColors('academic')} />)
    expect(container.querySelectorAll('polyline').length).toBe(1)
    expect(container.querySelectorAll('circle').length).toBe(3)
    expect(screen.getByText('9/28')).toBeTruthy()
  })
  it('点可点击回调日期；activeDate 点带光晕', () => {
    let picked = ''
    render(<TrendChart points={PTS} colors={fitnessColors('academic')} activeDate="2026-09-28" onSelectDate={(d) => { picked = d }} />)
    fireEvent.click(screen.getByTestId('fitness-trend-point-2026-10-27'))
    expect(picked).toBe('2026-10-27')
    const active = screen.getByTestId('fitness-trend-point-2026-09-28')
    expect(active.getAttribute('stroke')).toBeTruthy()
  })
  it('min==max 不除零', () => {
    const { container } = render(<TrendChart points={[{ date: '2026-09-03', value: 60, label: '60' }, { date: '2026-09-04', value: 60, label: '60' }]} colors={fitnessColors('academic')} />)
    expect(container.querySelectorAll('circle').length).toBe(2)
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run tests/fitness-trend-chart.test.tsx`
Expected: FAIL

- [ ] **Step 3: 实现 `src/lib/fitness-theme.ts`**

```ts
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
```

- [ ] **Step 4: 实现 `src/components/fitness/TrendChart.tsx`**

```tsx
// src/components/fitness/TrendChart.tsx —— 手写 SVG 折线；数据稀疏是常态（2 点也画线）
import type { TrendPoint } from '@/lib/fitness'
import { shortDate } from '@/lib/fitness'
import type { FitnessColors } from '@/lib/fitness-theme'

const W = 720, H = 150, PL = 46, PR = 24, PT = 20, PB = 26

export function TrendChart({ points, colors, activeDate, unit, onSelectDate }: {
  points: TrendPoint[]
  colors: FitnessColors
  activeDate?: string | null
  unit?: string
  onSelectDate?: (date: string) => void
}) {
  if (points.length === 0) {
    return (
      <div data-testid="fitness-trend-empty" style={{ color: colors.faint, fontSize: 11, padding: '18px 0', textAlign: 'center' }}>
        还没有记录，记一笔之后这里会长出折线
      </div>
    )
  }

  const values = points.map((p) => p.value)
  let min = Math.min(...values)
  let max = Math.max(...values)
  if (min === max) { min -= 1; max += 1 }
  const span = max - min
  min -= span * 0.15
  max += span * 0.15

  const x = (i: number) => (points.length === 1 ? (PL + W - PR) / 2 : PL + (i * (W - PL - PR)) / (points.length - 1))
  const y = (v: number) => PT + ((max - v) * (H - PT - PB)) / (max - min)
  const fmtTick = (v: number) => (Math.abs(v) >= 100 ? String(Math.round(v)) : String(Math.round(v * 10) / 10))
  const mid = (min + max) / 2

  return (
    <svg data-testid="fitness-trend-chart" viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 130, display: 'block' }}>
      {[min + span * 0.15, mid, max - span * 0.15].map((v, i) => (
        <g key={i}>
          <line x1={PL} y1={y(v)} x2={W - PR} y2={y(v)} stroke={colors.hairline} strokeWidth={i === 1 ? 0.6 : 1} />
          <text x={PL - 6} y={y(v) + 3} fill={colors.faint} fontSize={9} textAnchor="end">{fmtTick(v)}</text>
        </g>
      ))}
      {unit && <text x={PL - 6} y={10} fill={colors.faint} fontSize={9} textAnchor="end">{unit}</text>}
      {points.length >= 2 && (
        <polyline
          points={points.map((p, i) => `${x(i)},${y(p.value)}`).join(' ')}
          fill="none" stroke={colors.text} strokeWidth={1.2} opacity={0.75}
        />
      )}
      {points.map((p, i) => {
        const active = activeDate === p.date
        return (
          <g key={`${p.date}-${i}`} style={{ cursor: onSelectDate ? 'pointer' : 'default' }}
             onClick={() => onSelectDate?.(p.date)}>
            <circle
              data-testid={`fitness-trend-point-${p.date}`}
              cx={x(i)} cy={y(p.value)} r={active ? 3.6 : 3}
              fill={colors.amber}
              stroke={active ? colors.bg : 'none'} strokeWidth={active ? 2 : 0}
            />
            <text x={x(i)} y={y(p.value) - 9} fill={colors.text} fontSize={9.5} textAnchor="middle">{p.label}</text>
            <text x={x(i)} y={H - 8} fill={active ? colors.text : colors.dim} fontSize={9} textAnchor="middle">{shortDate(p.date)}</text>
          </g>
        )
      })}
    </svg>
  )
}
```

（`type Colors` 的 import type 写法若别扭，直接在 fitness-theme.ts 里 `export type FitnessColors = ReturnType<typeof fitnessColors>`，组件 import 该类型。采用后者。）

- [ ] **Step 5: 跑测试确认通过**

Run: `npx vitest run tests/fitness-trend-chart.test.tsx`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/lib/fitness-theme.ts src/components/fitness/TrendChart.tsx tests/fitness-trend-chart.test.tsx
git commit -m "feat(fitness): 手写 SVG 趋势图组件——0/1/N 点、可点选、双主题色板"
```

---

### Task 6: 重量面（落地态 + 记录态）

**Files:**
- Create: `src/components/fitness/FitnessFaceHeader.tsx`（seg 切换 + ⚙计划 + 右侧插槽）
- Create: `src/components/fitness/FitnessRecordEditor.tsx`（记录态）
- Create: `src/components/fitness/FitnessWeightView.tsx`（落地态 + 记录态编排）
- Create: `src/components/fitness/FitnessPanel.tsx`（面板根，face 状态）
- Test: `tests/fitness-weight-view.test.tsx`

**Interfaces:**
- Consumes: Task 4 store slice；Task 5 TrendChart/fitnessColors；Task 1 lib
- Produces: `<FitnessPanel theme={theme} />`（Task 8 接入 Briefing）；`data-testid`: `fitness-panel` / `fitness-face-weight` / `fitness-face-body` / `fitness-plan-button` / `fitness-record-button` / `fitness-record-save` / `fitness-record-cancel` / `fitness-record-chip-{id}` / `fitness-prev-record` / `fitness-next-record` / `fitness-routine-tab-{id}` / `fitness-set-weight-{exerciseId}-{i}` / `fitness-set-reps-{exerciseId}-{i}` / `fitness-set-remove-{exerciseId}-{i}` / `fitness-set-add-{exerciseId}`

- [ ] **Step 1: 写失败测试 `tests/fitness-weight-view.test.tsx`**

```tsx
import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { useStore } from '../src/store'
import { FitnessWeightView } from '../src/components/fitness/FitnessWeightView'
import { DEFAULT_FITNESS_DATA } from '../src/lib/fitness'
import type { FitnessData } from '@shared/index'

function seed(): FitnessData {
  const d = structuredClone(DEFAULT_FITNESS_DATA)
  d.records = [
    { id: 'r1', date: '2026-09-03', routineId: 'push', entries: [
      { exerciseId: 'ex-bench', name: '平板卧推', sets: [{ weight: 55, reps: 8 }, { weight: 55, reps: 8 }, { weight: 55, reps: 8 }, { weight: 55, reps: 8 }] },
    ] },
    { id: 'r2', date: '2026-09-28', routineId: 'push', entries: [
      { exerciseId: 'ex-bench', name: '平板卧推', sets: [{ weight: 60, reps: 8 }, { weight: 60, reps: 8 }, { weight: 57.5, reps: 9 }, { weight: 55, reps: 10 }] },
    ] },
    { id: 'r3', date: '2026-09-30', routineId: 'pull', entries: [
      { exerciseId: 'ex-row', name: '杠铃划船', sets: [{ weight: 50, reps: 10 }] },
    ] },
  ]
  return d
}

beforeEach(() => { useStore.setState({ fitnessData: seed() }) })

describe('FitnessWeightView 落地态', () => {
  it('默认显示最新一笔记录（pull 9/30），其余序列淡显最近一次', () => {
    render(<FitnessWeightView theme="academic" onSwitch={() => {}} />)
    expect(screen.getByText('9月30日')).toBeTruthy()
    expect(screen.getAllByText('杠铃划船').length).toBeGreaterThan(0)
    // 推序列对照列显示其最近一次
    expect(screen.getAllByText('平板卧推').length).toBeGreaterThan(0)
  })
  it('快照标签列渲染全部记录，点击切换查看', () => {
    render(<FitnessWeightView theme="academic" onSwitch={() => {}} />)
    fireEvent.click(screen.getByTestId('fitness-record-chip-r1'))
    expect(screen.getByText('9月3日')).toBeTruthy()
  })
  it('空记录 → 空态引导', () => {
    useStore.setState({ fitnessData: structuredClone(DEFAULT_FITNESS_DATA) })
    render(<FitnessWeightView theme="academic" onSwitch={() => {}} />)
    expect(screen.getByTestId('fitness-empty')).toBeTruthy()
  })
})

describe('FitnessWeightView 记录态', () => {
  it('点记录当下 → 进入记录态并预填上次值', () => {
    render(<FitnessWeightView theme="academic" onSwitch={() => {}} />)
    fireEvent.click(screen.getByTestId('fitness-record-button'))
    // 今天无 schedule 命中时回退最近记录序列（pull）；切到 push 看预填
    fireEvent.click(screen.getByTestId('fitness-routine-tab-push'))
    const w0 = screen.getByTestId('fitness-set-weight-ex-bench-0') as HTMLInputElement
    expect(w0.value).toBe('60')
    // 4 组 = 4 格
    expect(screen.getByTestId('fitness-set-weight-ex-bench-3')).toBeTruthy()
  })
  it('取消回到落地态', () => {
    render(<FitnessWeightView theme="academic" onSwitch={() => {}} />)
    fireEvent.click(screen.getByTestId('fitness-record-button'))
    fireEvent.click(screen.getByTestId('fitness-record-cancel'))
    expect(screen.getByTestId('fitness-record-button')).toBeTruthy()
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run tests/fitness-weight-view.test.tsx`
Expected: FAIL

- [ ] **Step 3: 实现 `FitnessFaceHeader.tsx`**

```tsx
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
```

- [ ] **Step 4: 实现 `FitnessRecordEditor.tsx`**

```tsx
// src/components/fitness/FitnessRecordEditor.tsx —— 记录态：一个序列的逐组二维录入
import type { BriefingTheme, FitnessRoutine } from '@shared/index'
import { fitnessColors } from '@/lib/fitness-theme'
import { latestRecordOfRoutine, shortDate } from '@/lib/fitness'
import type { FitnessData } from '@shared/index'

export type SetCell = { weight: string; reps: string }
export type RecordDraft = { routineId: string; cells: Record<string, SetCell[]> }

/** 预填：该序列上一笔记录的同动作同组值，无则空 */
export function buildDraft(data: FitnessData, routineId: string): RecordDraft {
  const routine = data.routines.find((r) => r.id === routineId)
  const prev = latestRecordOfRoutine(data, routineId)
  const cells: Record<string, SetCell[]> = {}
  for (const ex of routine?.exercises ?? []) {
    const prevEntry = prev?.entries.find((e) => e.exerciseId === ex.id)
    cells[ex.id] = Array.from({ length: ex.sets }, (_, i) => {
      const s = prevEntry?.sets[i]
      return { weight: s ? String(s.weight) : '', reps: s ? String(s.reps) : '' }
    })
  }
  return { routineId, cells }
}

export function FitnessRecordEditor({ theme, data, draft, onChange, onSave, onCancel }: {
  theme: BriefingTheme
  data: FitnessData
  draft: RecordDraft
  onChange: (d: RecordDraft) => void
  onSave: () => void
  onCancel: () => void
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
```

- [ ] **Step 5: 实现 `FitnessWeightView.tsx`**

```tsx
// src/components/fitness/FitnessWeightView.tsx —— 落地态(最新/历史记录) + 记录态编排
import { useMemo, useState } from 'react'
import { useStore } from '@/store'
import type { BriefingTheme, FitnessRecord } from '@shared/index'
import { fitnessColors } from '@/lib/fitness-theme'
import {
  sortRecords, latestRecordOfRoutine, routineNameOf, recordedExerciseNames,
  exerciseTrendPoints, shortDate, todayStr, makeId, defaultRoutineForToday,
} from '@/lib/fitness'
import { TrendChart } from './TrendChart'
import { FitnessFaceHeader, type FitnessFace } from './FitnessFaceHeader'
import { FitnessRecordEditor, buildDraft, type RecordDraft } from './FitnessRecordEditor'

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
  const [viewingId, setViewingId] = useState<string | null>(null)
  const [draft, setDraft] = useState<RecordDraft | null>(null)
  const [trendName, setTrendName] = useState<string | null>(null)

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
          <FitnessRecordEditor theme={theme} data={data} draft={draft} onChange={setDraft}
            onSave={() => void saveRecording()} onCancel={() => setDraft(null)} />
        </div>
      ) : sorted.length === 0 ? (
        <div data-testid="fitness-empty" style={{ padding: '60px 0', textAlign: 'center', color: c.faint, fontSize: 12 }}>
          还没有训练记录 —— 右上角「✎ 记录当下」记第一笔
        </div>
      ) : viewing ? (
        <>
          <div style={{ padding: '6px 18px', borderBottom: `1px solid ${c.hairline}`, display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ color: c.dim, fontSize: 11 }}>{cnDate(viewing.date)} · {routineNameOf(data, viewing.routineId)}日</span>
            {viewingIdx > 0 && <span style={{ color: c.faint, fontSize: 10 }}>距上一笔 {daysBetween(sorted[viewingIdx - 1].date, viewing.date)} 天</span>}
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
    </div>
  )
}
```

- [ ] **Step 6: 实现 `FitnessPanel.tsx`（面板根）**

```tsx
// src/components/fitness/FitnessPanel.tsx —— 健身面板根：重量/尺寸/计划 三面切换
import { useState } from 'react'
import type { BriefingTheme } from '@shared/index'
import { fitnessColors } from '@/lib/fitness-theme'
import { FitnessWeightView } from './FitnessWeightView'
import type { FitnessFace } from './FitnessFaceHeader'
// Task 7 产物，本 task 先引占位再于 Task 7 替换为真实组件 —— 见 Step 7 说明
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
```

注意：`FitnessPanel` 引用了 Task 7 的两个组件。为让本 task 可独立编译测试，本 task 先创建最小占位（Task 7 替换）：

`src/components/fitness/FitnessBodyView.tsx` / `FitnessPlanView.tsx` 占位：
```tsx
// 占位，Task 7 实现
import type { BriefingTheme } from '@shared/index'
import type { FitnessFace } from './FitnessFaceHeader'
export function FitnessBodyView({ theme, onSwitch }: { theme: BriefingTheme; onSwitch: (f: FitnessFace) => void }) {
  return <div data-testid="fitness-body-view" />
}
```
```tsx
// 占位，Task 7 实现
import type { BriefingTheme } from '@shared/index'
export function FitnessPlanView({ theme, onBack }: { theme: BriefingTheme; onBack: () => void }) {
  return <div data-testid="fitness-plan-view" />
}
```

- [ ] **Step 7: 跑测试确认通过 + 编译**

Run: `npx vitest run tests/fitness-weight-view.test.tsx && npx tsc --noEmit`
Expected: PASS

- [ ] **Step 8: Commit**

```bash
git add src/components/fitness/ tests/fitness-weight-view.test.tsx
git commit -m "feat(fitness): 重量面——落地态三栏/快照标签/记录态逐组格子/趋势联动"
```

---

### Task 7: 尺寸面 + 计划管理面

**Files:**
- Modify: `src/components/fitness/FitnessBodyView.tsx`（替换占位）
- Modify: `src/components/fitness/FitnessPlanView.tsx`（替换占位）
- Test: `tests/fitness-body-plan.test.tsx`

**Interfaces:**
- Consumes: 前序全部
- Produces: 尺寸面 `data-testid`: `fitness-body-input-{key}` / `fitness-body-save` / `fitness-body-row-{date}` / `fitness-body-delete-{date}` / `fitness-body-metric-{key}`；计划面 `fitness-plan-save` / `fitness-plan-back` / `fitness-plan-weekday-{1..7}` / `fitness-plan-sets-{routineId}-{exerciseId}` / `fitness-plan-exname-{routineId}-{exerciseId}` / `fitness-plan-remove-exercise-{routineId}-{exerciseId}` / `fitness-plan-add-exercise-{routineId}` / `fitness-plan-add-routine`

- [ ] **Step 1: 写失败测试 `tests/fitness-body-plan.test.tsx`**

```tsx
import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { useStore } from '../src/store'
import { FitnessBodyView } from '../src/components/fitness/FitnessBodyView'
import { FitnessPlanView } from '../src/components/fitness/FitnessPlanView'
import { DEFAULT_FITNESS_DATA } from '../src/lib/fitness'
import type { FitnessData, BodyMetric } from '@shared/index'

let savedMetric: BodyMetric | null = null
let savedPlan: { routines: unknown; schedule: unknown } | null = null

beforeEach(() => {
  savedMetric = null
  savedPlan = null
  const data: FitnessData = structuredClone(DEFAULT_FITNESS_DATA)
  data.bodyMetrics = [
    { date: '2026-09-03', weight: 72 },
    { date: '2026-09-28', weight: 72.5, waist: 84 },
  ]
  useStore.setState({
    fitnessData: data,
    saveBodyMetric: async (m: BodyMetric) => { savedMetric = m },
    deleteBodyMetric: async () => {},
    saveFitnessPlan: async (routines: never, schedule: never) => { savedPlan = { routines, schedule } },
  } as never)
})

describe('FitnessBodyView', () => {
  it('历史表格按日期倒序，缺项显 —', () => {
    render(<FitnessBodyView theme="academic" onSwitch={() => {}} />)
    const rows = screen.getAllByTestId(/^fitness-body-row-/)
    expect(rows[0].getAttribute('data-testid')).toContain('2026-09-28')
    expect(screen.getAllByText('—').length).toBeGreaterThan(0)
  })
  it('填体重保存 → 调 saveBodyMetric 带今天日期', async () => {
    render(<FitnessBodyView theme="academic" onSwitch={() => {}} />)
    fireEvent.change(screen.getByTestId('fitness-body-input-weight'), { target: { value: '73' } })
    fireEvent.click(screen.getByTestId('fitness-body-save'))
    expect(savedMetric?.weight).toBe(73)
    expect(savedMetric?.date).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })
  it('全空不保存', () => {
    render(<FitnessBodyView theme="academic" onSwitch={() => {}} />)
    fireEvent.click(screen.getByTestId('fitness-body-save'))
    expect(savedMetric).toBeNull()
  })
})

describe('FitnessPlanView', () => {
  it('渲染三序列与组数；保存调 saveFitnessPlan', async () => {
    render(<FitnessPlanView theme="academic" onBack={() => {}} />)
    expect(screen.getByText('推')).toBeTruthy()
    fireEvent.change(screen.getByTestId('fitness-plan-sets-push-ex-bench'), { target: { value: '5' } })
    fireEvent.click(screen.getByTestId('fitness-plan-save'))
    expect(savedPlan).not.toBeNull()
  })
  it('周安排格子点击循环 休→推→拉→腿→休', () => {
    render(<FitnessPlanView theme="academic" onBack={() => {}} />)
    const cell = screen.getByTestId('fitness-plan-weekday-7') // 周日默认休
    expect(cell.textContent).toContain('休')
    fireEvent.click(cell)
    expect(cell.textContent).toContain('推')
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run tests/fitness-body-plan.test.tsx`
Expected: FAIL（占位组件无这些 testid）

- [ ] **Step 3: 实现 `FitnessBodyView.tsx`**

```tsx
// src/components/fitness/FitnessBodyView.tsx —— 尺寸面：记一次表单 + 历史表格 + 趋势
import { useMemo, useState } from 'react'
import { useStore } from '@/store'
import type { BriefingTheme, BodyMetric } from '@shared/index'
import { fitnessColors } from '@/lib/fitness-theme'
import { BODY_METRIC_DEFS, bodyTrendPoints, todayStr, type BodyMetricKey } from '@/lib/fitness'
import { TrendChart } from './TrendChart'
import { FitnessFaceHeader, type FitnessFace } from './FitnessFaceHeader'

export function FitnessBodyView({ theme, onSwitch }: {
  theme: BriefingTheme
  onSwitch: (f: FitnessFace) => void
}) {
  const c = fitnessColors(theme)
  const data = useStore((s) => s.fitnessData)
  const saveBodyMetric = useStore((s) => s.saveBodyMetric)
  const deleteBodyMetric = useStore((s) => s.deleteBodyMetric)
  const [form, setForm] = useState<Record<string, string>>({})
  const [metric, setMetric] = useState<BodyMetricKey>('weight')

  const sorted = useMemo(
    () => [...(data?.bodyMetrics ?? [])].sort((a, b) => (a.date > b.date ? -1 : 1)),
    [data],
  )
  const availableMetrics = BODY_METRIC_DEFS.filter((d) => sorted.some((m) => typeof m[d.key] === 'number'))
  const activeMetric = availableMetrics.some((d) => d.key === metric) ? metric : (availableMetrics[0]?.key ?? 'weight')
  const points = useMemo(() => (data ? bodyTrendPoints(data, activeMetric) : []), [data, activeMetric])

  if (!data) return null

  const save = async () => {
    const m: BodyMetric = { date: todayStr() }
    for (const def of BODY_METRIC_DEFS) {
      const v = parseFloat(form[def.key] ?? '')
      if (Number.isFinite(v) && v > 0) m[def.key] = v
    }
    if (Object.keys(m).length === 1) return // 只有 date = 全空
    await saveBodyMetric(m)
    setForm({})
  }

  return (
    <div style={{ color: c.text, fontFamily: 'Georgia, "Songti SC", "SimSun", serif', fontSize: 12 }}>
      <FitnessFaceHeader theme={theme} face="body" onSwitch={onSwitch} right={
        <span style={{ color: c.faint, fontSize: 10 }}>全部选填 · 同日再记覆盖</span>
      } />
      <div style={{ display: 'grid', gridTemplateColumns: '230px 1fr' }}>
        <div style={{ padding: '12px 16px', borderRight: `1px solid ${c.hairline}` }}>
          <div style={{ color: c.dim, fontSize: 11, letterSpacing: 2, marginBottom: 8 }}>记一次 · {todayStr().slice(5).replace('-', '/')}</div>
          {BODY_METRIC_DEFS.map((def) => (
            <div key={def.key} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 7, fontSize: 11 }}>
              <span style={{ color: c.dim, width: 40 }}>{def.label}</span>
              <input data-testid={`fitness-body-input-${def.key}`} value={form[def.key] ?? ''}
                inputMode="decimal" placeholder="—"
                onChange={(e) => setForm({ ...form, [def.key]: e.target.value })}
                style={{
                  width: 56, background: c.cellBg, border: `1px solid ${c.hairline}`, borderRadius: 4,
                  color: c.text, textAlign: 'center', padding: '3px 0', fontSize: 11, outline: 'none', fontFamily: 'inherit',
                }} />
              <span style={{ color: c.faint }}>{def.unit}</span>
            </div>
          ))}
          <button type="button" data-testid="fitness-body-save" onClick={() => void save()}
            style={{ marginTop: 6, border: `1px solid ${c.amber}`, color: c.amber, borderRadius: 14, padding: '4px 16px', fontSize: 11, background: 'none', cursor: 'pointer' }}>存</button>
        </div>
        <div style={{ padding: '12px 16px' }}>
          {sorted.length === 0 ? (
            <div data-testid="fitness-body-empty" style={{ color: c.faint, fontSize: 11, padding: '20px 0' }}>还没有尺寸记录</div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 10.5 }}>
              <thead>
                <tr>
                  {['日期', ...BODY_METRIC_DEFS.map((d) => d.label), ''].map((h, i) => (
                    <th key={i} style={{ padding: '3px 6px', textAlign: i === 0 ? 'left' : 'right', color: c.faint, fontWeight: 'normal', fontSize: 9.5, borderBottom: `1px solid ${c.hairline}` }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sorted.map((m) => (
                  <tr key={m.date} data-testid={`fitness-body-row-${m.date}`}>
                    <td style={{ padding: '3px 6px', color: c.dim, borderBottom: `1px solid ${c.hairline}` }}>{m.date.slice(5).replace('-', '/')}</td>
                    {BODY_METRIC_DEFS.map((d) => (
                      <td key={d.key} style={{ padding: '3px 6px', textAlign: 'right', borderBottom: `1px solid ${c.hairline}` }}>
                        {typeof m[d.key] === 'number' ? m[d.key] : <span style={{ color: c.faint }}>—</span>}
                      </td>
                    ))}
                    <td style={{ padding: '3px 6px', textAlign: 'right', borderBottom: `1px solid ${c.hairline}` }}>
                      <button type="button" data-testid={`fitness-body-delete-${m.date}`} onClick={() => void deleteBodyMetric(m.date)}
                        style={{ background: 'none', border: 'none', color: c.faint, cursor: 'pointer', fontSize: 10, padding: 0 }}>×</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, margin: '10px 0 4px', flexWrap: 'wrap' }}>
            <span style={{ color: c.faint, fontSize: 10 }}>趋势</span>
            {availableMetrics.map((d) => (
              <button key={d.key} type="button" data-testid={`fitness-body-metric-${d.key}`} onClick={() => setMetric(d.key)}
                style={{
                  fontSize: 10, padding: '2px 10px', borderRadius: 10, cursor: 'pointer', background: 'none',
                  border: `1px solid ${d.key === activeMetric ? c.amber : c.hairline}`,
                  color: d.key === activeMetric ? c.amber : c.dim,
                }}>{d.label}</button>
            ))}
          </div>
          <TrendChart points={points} colors={c} unit={BODY_METRIC_DEFS.find((d) => d.key === activeMetric)?.unit} />
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: 实现 `FitnessPlanView.tsx`**

```tsx
// src/components/fitness/FitnessPlanView.tsx —— 计划管理：周安排 + 序列/动作/组数；唯一改计划的地方
import { useState } from 'react'
import { useStore } from '@/store'
import type { BriefingTheme, FitnessRoutine, FitnessScheduleEntry } from '@shared/index'
import { fitnessColors } from '@/lib/fitness-theme'
import { makeId } from '@/lib/fitness'

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
        <div style={{ display: 'flex', gap: 10 }}>
          <button type="button" data-testid="fitness-plan-save" onClick={() => void save()}
            style={{ border: `1px solid ${c.amber}`, color: c.amber, borderRadius: 14, padding: '4px 14px', fontSize: 11, background: 'none', cursor: 'pointer' }}>保存计划</button>
          <button type="button" data-testid="fitness-plan-back" onClick={onBack}
            style={{ background: 'none', border: 'none', color: c.dim, fontSize: 11, cursor: 'pointer' }}>← 返回记录</button>
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
                }}>{WD_LABEL[wd - 1]} · {name ?? '休'}</button>
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
```

- [ ] **Step 5: 跑测试确认通过 + 编译**

Run: `npx vitest run tests/fitness-body-plan.test.tsx && npx tsc --noEmit`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/components/fitness/FitnessBodyView.tsx src/components/fitness/FitnessPlanView.tsx tests/fitness-body-plan.test.tsx
git commit -m "feat(fitness): 尺寸面(表单+历史表格+趋势)与计划管理面(周安排+序列编辑)"
```

---

### Task 8: 接入 Briefing 页 + 来源竖栏 + e2e

**Files:**
- Modify: `src/components/BriefingSourceSidebar.tsx`（图标组件 + navItems 项）
- Modify: `src/pages/Briefing.tsx`（import、load effect、渲染分支）
- Modify: `e2e/source-map.json`（新 group）
- Modify: `e2e/helpers/test-library.ts`（`seedFitnessJson` helper）
- Modify: `e2e/helpers/selectors.ts`（fitness selectors）
- Create: `e2e/specs/fitness.spec.ts`

**Interfaces:**
- Consumes: `<FitnessPanel theme />`（Task 6/7）
- Produces: 来源竖栏「健身」入口（`data-testid="briefing-source-fitness"`，图标 `data-testid="briefing-source-icon-fitness"`）；e2e 组 `fitness`

**注意（并行会话）**：本 task 触碰 `Briefing.tsx` / `BriefingSourceSidebar.tsx`，先 `git status && git diff` 确认另一会话的删除工作是否已落盘；若这两文件有未提交改动，等用户确认或与该会话错开。

- [ ] **Step 1: 竖栏入口**

`src/components/BriefingSourceSidebar.tsx`，在其他图标组件旁加：

```tsx
const FitnessIcon = () => (
  <svg data-testid="briefing-source-icon-fitness" width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round">
    <path d="M4.5 5.5v5M2.5 6.5v3M11.5 5.5v5M13.5 6.5v3M4.5 8h7" />
  </svg>
)
```

navItems 数组在 `digest` 项之后插入：

```tsx
    {
      id: 'fitness',
      label: '健身',
      icon: FitnessIcon,
      testId: 'briefing-source-fitness',
    },
```

- [ ] **Step 2: Briefing.tsx 接入**

import 区加：
```tsx
import { FitnessPanel } from '@/components/fitness/FitnessPanel'
```

store 选择器区（`loadJobBriefingHistory` 附近）加：
```tsx
  const loadFitness = useStore((s) => s.loadFitness)
```

history load effect（现 `if (source === 'digest') ... else if (source === 'job-briefing') ...`）改为：
```tsx
    if (source === 'digest') loadBriefingHistory()
    else if (source === 'job-briefing') loadJobBriefingHistory()
    else if (source === 'fitness') void loadFitness()
```
依赖数组加 `loadFitness`。

主内容分支链（现 `source === 'scout' ? (<ScoutPanel ... />) : isJob ? ...`）在 scout 分支后插入：
```tsx
            ) : source === 'fitness' ? (
              <FitnessPanel theme={theme} />
            ) : isJob ? (
```

- [ ] **Step 3: 手动验证 dev 渲染**

Run: `npm run dev`，进入夜航简报 → 点竖栏「健身」→ 看到空态引导与「✎ 记录当下」；记一笔 → 刷新仍在。
（若本会话不便起 dev，跳过，由 e2e 兜底。）

- [ ] **Step 4: e2e helper + selectors + source-map**

`e2e/helpers/test-library.ts`（仿 `seedStateJson`）加：
```ts
export function seedFitnessJson(configDir: string, data: unknown): string {
  const file = path.join(configDir, 'fitness.json')
  fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf8')
  return file
}
```

`e2e/helpers/selectors.ts` 加：
```ts
  fitness: {
    sourceButton: '[data-testid="briefing-source-fitness"]',
    panel: '[data-testid="fitness-panel"]',
    recordButton: '[data-testid="fitness-record-button"]',
    recordSave: '[data-testid="fitness-record-save"]',
    bodySave: '[data-testid="fitness-body-save"]',
    faceBody: '[data-testid="fitness-face-body"]',
  },
```

`e2e/source-map.json` 的 `groups` 加：
```json
    "fitness": {
      "sources": [
        "src/components/fitness/**",
        "src/lib/fitness.ts",
        "src/lib/fitness-theme.ts",
        "electron/ipc/fitness.ts",
        "electron/lib/fitness-store.ts"
      ],
      "specs": [
        "fitness.spec.ts"
      ]
    }
```

- [ ] **Step 5: 写 `e2e/specs/fitness.spec.ts`**

```ts
import { test, expect } from '../fixtures/electron'
import { CoverPage } from '../pages/CoverPage'
import { SELECTORS } from '../helpers/selectors'
import { seedStateJson, seedFitnessJson } from '../helpers/test-library'

const SEED_FITNESS = {
  version: 1,
  routines: [
    { id: 'push', name: '推', exercises: [{ id: 'ex-bench', name: '平板卧推', sets: 2 }] },
  ],
  schedule: [{ weekday: 1, routineId: 'push' }],
  records: [
    { id: 'r1', date: '2026-09-28', routineId: 'push', entries: [
      { exerciseId: 'ex-bench', name: '平板卧推', sets: [{ weight: 60, reps: 8 }, { weight: 60, reps: 8 }] },
    ] },
  ],
  bodyMetrics: [{ date: '2026-09-28', weight: 72.5 }],
}

test.describe('健身来源', () => {
  test('E2E-FIT-1: 入口可见，落地态显示种子记录', async ({ window, testConfigDir }) => {
    seedStateJson(testConfigDir, {
      profile: { name: 'E2E 测试员', profile_text: '', preferred_topics: [] },
      briefingSource: 'fitness',
    })
    seedFitnessJson(testConfigDir, SEED_FITNESS)

    const cover = new CoverPage(window)
    await cover.goToBriefing()
    await window.locator(SELECTORS.fitness.sourceButton).click()

    await expect(window.locator(SELECTORS.fitness.panel)).toBeVisible({ timeout: 5000 })
    await expect(window.locator('[data-testid="fitness-routine-col-push"]')).toContainText('平板卧推')
    await expect(window.locator('[data-testid="fitness-routine-col-push"]')).toContainText('60')
    await expect(window.locator('[data-testid="fitness-trend-chart"]')).toBeVisible()
  })

  test('E2E-FIT-2: 记录当下 → 保存 → 重载后仍在', async ({ window, testConfigDir }) => {
    seedStateJson(testConfigDir, {
      profile: { name: 'E2E 测试员', profile_text: '', preferred_topics: [] },
      briefingSource: 'fitness',
    })
    seedFitnessJson(testConfigDir, SEED_FITNESS)

    const cover = new CoverPage(window)
    await cover.goToBriefing()
    await window.locator(SELECTORS.fitness.sourceButton).click()
    await window.locator(SELECTORS.fitness.recordButton).click()

    // 预填 60，改成 62.5
    const w0 = window.locator('[data-testid="fitness-set-weight-ex-bench-0"]')
    await w0.fill('62.5')
    await window.locator(SELECTORS.fitness.recordSave).click()

    // 新快照标签出现（今天）
    const today = new Date()
    const chipLabel = `${today.getMonth() + 1}/${today.getDate()}`
    await expect(window.locator('[data-testid^="fitness-record-chip-"]', { hasText: chipLabel })).toBeVisible()

    // 重载持久化
    await window.reload()
    await window.locator(SELECTORS.fitness.sourceButton).click()
    await expect(window.locator('[data-testid^="fitness-record-chip-"]', { hasText: chipLabel })).toBeVisible({ timeout: 5000 })
  })

  test('E2E-FIT-3: 尺寸记一次 → 表格新行 → 重载持久化', async ({ window, testConfigDir }) => {
    seedStateJson(testConfigDir, {
      profile: { name: 'E2E 测试员', profile_text: '', preferred_topics: [] },
      briefingSource: 'fitness',
    })
    seedFitnessJson(testConfigDir, SEED_FITNESS)

    const cover = new CoverPage(window)
    await cover.goToBriefing()
    await window.locator(SELECTORS.fitness.sourceButton).click()
    await window.locator(SELECTORS.fitness.faceBody).click()

    await window.locator('[data-testid="fitness-body-input-weight"]').fill('73')
    await window.locator(SELECTORS.fitness.bodySave).click()

    const today = new Date()
    const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
    await expect(window.locator(`[data-testid="fitness-body-row-${todayStr}"]`)).toBeVisible()

    await window.reload()
    await window.locator(SELECTORS.fitness.sourceButton).click()
    await window.locator(SELECTORS.fitness.faceBody).click()
    await expect(window.locator(`[data-testid="fitness-body-row-${todayStr}"]`)).toBeVisible({ timeout: 5000 })
  })
})
```

- [ ] **Step 6: 构建并跑定向 e2e**

Run: `node scripts/e2e-changed.js --run --no-retries`
Expected: fitness.spec.ts 被选中并全绿（e2e 跑 `out/` 产物，脚本自动先构建）

- [ ] **Step 7: Commit**

```bash
git add src/components/BriefingSourceSidebar.tsx src/pages/Briefing.tsx e2e/source-map.json e2e/helpers/test-library.ts e2e/helpers/selectors.ts e2e/specs/fitness.spec.ts
git commit -m "feat(fitness): 接入夜航简报第三来源——竖栏入口/Briefing 分支/e2e 三条链路"
```

---

## Self-Review 记录

- Spec 覆盖：§2 数据模型→Task 1/2；§3.1/3.2 重量面→Task 6；§3.3 尺寸面→Task 7；§3.4 计划面→Task 7；§3.5 视觉→fitnessColors 双主题；§4 折线→Task 5；§5 IPC→Task 3；§6 验收→各 task 测试 + Task 8 e2e。来源竖栏第三位→Task 4 默认顺序 + Task 8 入口。
- 偏差声明：spec §3.1 顶栏「记录」标签列在本计划中带 `fitness-prev/next-record` 箭头与 chip，与 spec 一致；spec §1 的 `data-testid="briefing-source-icon-fitness"` 落在图标 svg 上（与既有 DigestIcon 等模式一致）。
- 类型一致性：TrendChart 的 `colors` prop 类型由 `fitness-theme.ts` 导出 `FitnessColors = ReturnType<typeof fitnessColors>`（Task 5 Step 4 括注要求采用该导出）；`FitnessFace` 类型从 `FitnessFaceHeader` 导出（属组件文件导出类型——类型擦除不影响 Fast Refresh，与 ui-styling §10 不冲突）。
