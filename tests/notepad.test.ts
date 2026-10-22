// tests/notepad.test.ts
// 迭代记事板：分类猜测、旧文本迁移幂等、统计与分组
import { describe, it, expect } from 'vitest'
import {
  deriveTitle,
  guessCategory,
  migrateCoverNotepad,
  computeNotepadStats,
  groupLogByMonth,
} from '@/lib/notepad'
import type { NotepadItem, NotepadLogEntry } from '@shared/index'

describe('deriveTitle', () => {
  it('取首个分句', () => {
    expect(deriveTitle('有一个bug就是旁注功能似乎入参有问题，ai显示批注文字不在全文里')).toBe('有一个bug就是旁注功能似乎入参有问题'.slice(0, 15) + '…')
  })
  it('短句原样返回', () => {
    expect(deriveTitle('封面裁剪')).toBe('封面裁剪')
  })
  it('换行截断', () => {
    expect(deriveTitle('第一条\n第二条')).toBe('第一条')
  })
})

describe('guessCategory', () => {
  it('识别 bug 类', () => {
    expect(guessCategory('有一个bug就是旁注入参有问题')).toBe('bug')
    expect(guessCategory('记事板收起逻辑有问题')).toBe('bug')
    expect(guessCategory('博客和博客内图像不符合')).toBe('bug')
  })
  it('识别功能优化类', () => {
    expect(guessCategory('长期来看需要删减已有功能')).toBe('improvement')
    expect(guessCategory('优化启动速度')).toBe('improvement')
  })
  it('默认新功能类', () => {
    expect(guessCategory('写作里更新一个笔记功能')).toBe('feature')
    expect(guessCategory('新一个健身记事板功能')).toBe('feature')
  })
})

describe('migrateCoverNotepad', () => {
  it('按非空行拆分并去掉行首编号', () => {
    const items = migrateCoverNotepad('1、写作笔记功能\n\n2. 修复收起bug\n- 优化性能', undefined, '2026-10-19T00:00:00.000Z')
    expect(items).toHaveLength(3)
    expect(items[0].text).toBe('写作笔记功能')
    expect(items[0].category).toBe('feature')
    expect(items[1].category).toBe('bug')
    expect(items[2].category).toBe('improvement')
    expect(items[0].createdAt).toBe('2026-10-19T00:00:00.000Z')
  })
  it('已有 notepadItems 时幂等返回', () => {
    const existing: NotepadItem[] = [{ id: 'x', text: 't', category: 'feature', createdAt: '2026-01-01' }]
    expect(migrateCoverNotepad('1、别的文本', existing)).toBe(existing)
  })
  it('空文本迁移为空数组', () => {
    expect(migrateCoverNotepad('', undefined)).toEqual([])
  })
})

const entry = (resolvedAt: string): NotepadLogEntry => ({
  id: resolvedAt, text: 't', category: 'feature', createdAt: resolvedAt, resolvedAt, source: 'user',
})

describe('computeNotepadStats', () => {
  it('统计累计/本月/待办与近 6 月趋势', () => {
    const now = new Date(2026, 9, 19) // 2026-10-19
    const log = [entry('2026-10-01T00:00:00.000Z'), entry('2026-10-19T01:00:00.000Z'), entry('2026-08-05T00:00:00.000Z')]
    const items: NotepadItem[] = [{ id: 'a', text: 't', category: 'bug', createdAt: '2026-10-01' }]
    const stats = computeNotepadStats(items, log, now)
    expect(stats.totalResolved).toBe(3)
    expect(stats.resolvedThisMonth).toBe(2)
    expect(stats.pending).toBe(1)
    expect(stats.monthly).toHaveLength(6)
    expect(stats.monthly[5]).toEqual({ month: '2026-10', count: 2 })
    expect(stats.monthly[3]).toEqual({ month: '2026-08', count: 1 })
  })
})

describe('groupLogByMonth', () => {
  it('按解决月份降序分组', () => {
    const groups = groupLogByMonth([entry('2026-08-05T00:00:00.000Z'), entry('2026-10-01T00:00:00.000Z')])
    expect(groups.map(g => g.month)).toEqual(['2026-10', '2026-08'])
  })
})