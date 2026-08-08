import { describe, expect, it } from 'vitest'
import { clickAllChip, isSourceActive, toggleSourceChip, type BlogFilter } from '../src/lib/section-filter'

const ALL = ['engineering', 'research', 'alignment', 'interpretability', 'product'] as const

describe('blog filter state machine', () => {
  it('初始 All：全源可见', () => {
    const f: BlogFilter = { mode: 'all' }
    for (const k of ALL) expect(isSourceActive(f, k)).toBe(true)
  })
  it('All 态点某源 → 仅该源单选', () => {
    const f = toggleSourceChip({ mode: 'all' }, 'research', ALL)
    expect(f).toEqual({ mode: 'pick', selected: new Set(['research']) })
  })
  it('pick 态多点 → 多选并集', () => {
    let f = toggleSourceChip({ mode: 'all' }, 'research', ALL)
    f = toggleSourceChip(f, 'alignment', ALL)
    expect(isSourceActive(f, 'research')).toBe(true)
    expect(isSourceActive(f, 'alignment')).toBe(true)
    expect(isSourceActive(f, 'engineering')).toBe(false)
  })
  it('点灭最后一个 → 回退 All', () => {
    let f = toggleSourceChip({ mode: 'all' }, 'research', ALL)
    f = toggleSourceChip(f, 'research', ALL)
    expect(f).toEqual({ mode: 'all' })
  })
  it('手动点满五源 → 收编为 All', () => {
    let f = toggleSourceChip({ mode: 'all' }, 'engineering', ALL)
    for (const k of ALL.slice(1)) f = toggleSourceChip(f, k, ALL)
    expect(f).toEqual({ mode: 'all' })
  })
  it('clickAllChip 任意态 → All', () => {
    expect(clickAllChip()).toEqual({ mode: 'all' })
  })
})
