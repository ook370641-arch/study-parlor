import { describe, expect, it } from 'vitest'
import { clickAllChip, isSourceActive, toggleMineChip, toggleSourceChip, type BlogFilter } from '../src/lib/section-filter'

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

  it('Mine 与源 chip 互斥：mine 态所有源 chip 均不激活', () => {
    const f: BlogFilter = { mode: 'mine' }
    for (const k of ALL) expect(isSourceActive(f, k)).toBe(false)
  })
  it('pick 态点 Mine → 前序源选择清零，仅 mine', () => {
    let f = toggleSourceChip({ mode: 'all' }, 'research', ALL)
    f = toggleMineChip(f)
    expect(f).toEqual({ mode: 'mine' })
  })
  it('mine 态点源 chip → mine 清零，仅该源单选', () => {
    const f = toggleSourceChip({ mode: 'mine' }, 'product', ALL)
    expect(f).toEqual({ mode: 'pick', selected: new Set(['product']) })
  })
  it('mine 态再点 Mine → 回退 All', () => {
    const f = toggleMineChip({ mode: 'mine' })
    expect(f).toEqual({ mode: 'all' })
  })
  it('mine 态点 All → All', () => {
    expect(clickAllChip()).toEqual({ mode: 'all' })
  })
})
