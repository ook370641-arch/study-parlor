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
