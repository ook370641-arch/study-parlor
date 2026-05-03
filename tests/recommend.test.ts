import { describe, expect, it } from 'vitest'
import { pickRecommendations } from '@electron/lib/recommend'
import type { FileMeta } from '@shared/index'

const NOW = new Date('2026-05-03T20:00:00+08:00')

const f = (over: Partial<FileMeta>): FileMeta => ({
  file_path: 'x.md',
  title: 'x',
  created: '2025-01-01',
  review_count: 0,
  difficulty: 'mid',
  tags: [],
  ...over
})

describe('pickRecommendations', () => {
  it('returns null/null on empty library', () => {
    const { left, right } = pickRecommendations([], NOW)
    expect(left).toBeNull()
    expect(right).toBeNull()
  })

  it('selects most recent continue + oldest review', () => {
    const lib: FileMeta[] = [
      f({ file_path: 'a.md', title: 'A', last_studied: '2026-05-01T10:00:00+08:00' }),
      f({ file_path: 'b.md', title: 'B', last_studied: '2026-05-03T10:00:00+08:00' }),
      f({ file_path: 'c.md', title: 'C', last_reviewed: '2026-04-20T10:00:00+08:00', review_count: 1 }),
      f({ file_path: 'd.md', title: 'D', last_reviewed: '2026-04-25T10:00:00+08:00', review_count: 2 })
    ]
    const { left, right } = pickRecommendations(lib, NOW)
    expect(left?.type).toBe('continue')
    expect(left?.file_path).toBe('b.md')
    expect(right?.type).toBe('review')
    expect(right?.file_path).toBe('c.md')
  })

  it('excludes review candidates with review_count >= 3', () => {
    const lib: FileMeta[] = [
      f({ file_path: 'a.md', last_reviewed: '2026-04-01', review_count: 3 })
    ]
    const { right } = pickRecommendations(lib, NOW)
    expect(right).toBeNull()
  })

  it('excludes review candidates whose last_reviewed is < 7 days ago', () => {
    const lib: FileMeta[] = [
      f({ file_path: 'a.md', last_reviewed: '2026-05-01T10:00:00+08:00', review_count: 1 })
    ]
    const { right } = pickRecommendations(lib, NOW)
    expect(right).toBeNull()
  })

  it('excludes continue candidates whose last_studied > 3 days ago', () => {
    const lib: FileMeta[] = [
      f({ file_path: 'a.md', last_studied: '2026-04-25T10:00:00+08:00' })
    ]
    const { left } = pickRecommendations(lib, NOW)
    expect(left).toBeNull()
  })

  it('falls back to two continues when no review candidate exists', () => {
    const lib: FileMeta[] = [
      f({ file_path: 'a.md', title: 'A', last_studied: '2026-05-02T10:00:00+08:00' }),
      f({ file_path: 'b.md', title: 'B', last_studied: '2026-05-03T10:00:00+08:00' })
    ]
    const { left, right } = pickRecommendations(lib, NOW)
    expect(left?.type).toBe('continue')
    expect(right?.type).toBe('continue')
    expect(left?.file_path).not.toBe(right?.file_path)
  })

  it('avoids exclude list (for "换一组")', () => {
    const lib: FileMeta[] = [
      f({ file_path: 'a.md', last_studied: '2026-05-03T10:00:00+08:00' }),
      f({ file_path: 'b.md', last_studied: '2026-05-02T10:00:00+08:00' })
    ]
    const { left } = pickRecommendations(lib, NOW, { exclude: ['a.md'] })
    expect(left?.file_path).toBe('b.md')
  })
})
