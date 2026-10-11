import { describe, it, expect, beforeEach } from 'vitest'
import { useStore } from '../src/store'
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
  it('setBriefingSource 接受 fitness', async () => {
    await useStore.getState().setBriefingSource('fitness')
    expect(useStore.getState().briefingSource).toBe('fitness')
  })
})
