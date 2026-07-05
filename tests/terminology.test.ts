import { describe, expect, it } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { useStore } from '@/store'
import { getDifficultyLabel } from '@/lib/difficulty-label'
import { getTemperatureLabel } from '@/lib/temperature-label'
import { getTerminology, useTerminology } from '@/lib/terminology'
import { DEFAULT_TERMINOLOGY } from '@/lib/terminology-defaults'

describe('terminology helpers', () => {
  describe('getDifficultyLabel', () => {
    it('returns default labels without custom terminology', () => {
      expect(getDifficultyLabel('high')).toBe('强')
      expect(getDifficultyLabel('mid')).toBe('中')
      expect(getDifficultyLabel('low')).toBe('弱')
    })

    it('returns custom labels when provided', () => {
      const custom = {
        difficultyHigh: '困难',
        difficultyMid: '普通',
        difficultyLow: '简单'
      }
      expect(getDifficultyLabel('high', custom)).toBe('困难')
      expect(getDifficultyLabel('mid', custom)).toBe('普通')
      expect(getDifficultyLabel('low', custom)).toBe('简单')
    })
  })

  describe('getTemperatureLabel', () => {
    it('returns default labels without custom terminology', () => {
      expect(getTemperatureLabel(0.3)).toBe('坚硬')
      expect(getTemperatureLabel(0.7)).toBe('适中')
      expect(getTemperatureLabel(1.0)).toBe('活泼')
    })

    it('returns custom labels when provided', () => {
      const custom = {
        temperatureCold: '严肃',
        temperatureNeutral: '平衡',
        temperatureWarm: '轻松'
      }
      expect(getTemperatureLabel(0.3, custom)).toBe('严肃')
      expect(getTemperatureLabel(0.7, custom)).toBe('平衡')
      expect(getTemperatureLabel(1.0, custom)).toBe('轻松')
    })
  })

  describe('getTerminology', () => {
    it('merges custom overrides with defaults', () => {
      const merged = getTerminology({ sessionName: '炉边谈话' })
      expect(merged.sessionName).toBe('炉边谈话')
      expect(merged.libraryName).toBe(DEFAULT_TERMINOLOGY.libraryName)
    })

    it('returns all defaults when custom is undefined', () => {
      const merged = getTerminology(undefined)
      expect(merged).toEqual(DEFAULT_TERMINOLOGY)
    })
  })

  describe('useTerminology integration', () => {
    it('reflects store terminology overrides', () => {
      act(() => {
        useStore.setState({ terminology: { sessionName: '炉边谈话' } })
      })
      const { result } = renderHook(() => useTerminology())
      expect(result.current.sessionName).toBe('炉边谈话')
      expect(result.current.libraryName).toBe(DEFAULT_TERMINOLOGY.libraryName)
    })
  })
})
