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
    patchState: async () => {},
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
