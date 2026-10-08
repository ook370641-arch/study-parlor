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
