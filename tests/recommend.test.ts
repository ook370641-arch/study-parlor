import { describe, expect, it } from 'vitest'
import { pickRecommendations } from '@electron/lib/recommend'
import type { TopicMeta } from '@shared/index'

const NOW = new Date('2026-05-03T20:00:00+08:00')

const t = (over: Partial<TopicMeta>): TopicMeta => ({
  dirName: 'x',
  title: 'x',
  file_path: 'x.md',
  review_count: 0,
  difficulty: 'mid',
  tags: [],
  session_count: 1,
  ...over
})

describe('pickRecommendations', () => {
  it('returns null/null on empty library', () => {
    const { left, right } = pickRecommendations([], NOW)
    expect(left).toBeNull()
    expect(right).toBeNull()
  })

  it('selects most recent continue + oldest review', () => {
    const lib: TopicMeta[] = [
      t({ dirName: 'a', title: 'A', last_studied: '2026-05-01T10:00:00+08:00' }),
      t({ dirName: 'b', title: 'B', last_studied: '2026-05-03T10:00:00+08:00' }),
      t({ dirName: 'c', title: 'C', last_reviewed: '2026-04-20T10:00:00+08:00', review_count: 1 }),
      t({ dirName: 'd', title: 'D', last_reviewed: '2026-04-25T10:00:00+08:00', review_count: 2 })
    ]
    const { left, right } = pickRecommendations(lib, NOW)
    expect(left?.type).toBe('continue')
    expect(left?.dirName).toBe('b')
    expect(right?.type).toBe('review')
    expect(right?.dirName).toBe('c')
  })

  it('excludes review candidates with review_count >= 3', () => {
    const lib: TopicMeta[] = [
      t({ dirName: 'a', last_reviewed: '2026-04-01', review_count: 3 })
    ]
    const { right } = pickRecommendations(lib, NOW)
    expect(right).toBeNull()
  })

  it('excludes review candidates whose last_reviewed is < 7 days ago', () => {
    const lib: TopicMeta[] = [
      t({ dirName: 'a', last_reviewed: '2026-05-01T10:00:00+08:00', review_count: 1 })
    ]
    const { right } = pickRecommendations(lib, NOW)
    expect(right).toBeNull()
  })

  it('includes never-reviewed files in review candidates', () => {
    const lib: TopicMeta[] = [
      t({ dirName: 'a', title: 'A', review_count: 0 })
    ]
    const { left, right } = pickRecommendations(lib, NOW)
    // 唯一候选放 left
    expect(left?.type).toBe('review')
    expect(left?.dirName).toBe('a')
    expect(right).toBeNull()
  })

  it('excludes continue candidates whose last_studied > 3 days ago', () => {
    const lib: TopicMeta[] = [
      t({ dirName: 'a', last_studied: '2026-04-25T10:00:00+08:00', review_count: 3 })
    ]
    const { left, right } = pickRecommendations(lib, NOW)
    expect(left).toBeNull()
    expect(right).toBeNull()
  })

  it('falls back to two continues when no review candidate exists', () => {
    const lib: TopicMeta[] = [
      t({ dirName: 'a', title: 'A', last_studied: '2026-05-02T10:00:00+08:00' }),
      t({ dirName: 'b', title: 'B', last_studied: '2026-05-03T10:00:00+08:00' })
    ]
    const { left, right } = pickRecommendations(lib, NOW)
    expect(left?.type).toBe('continue')
    expect(right?.type).toBe('continue')
    expect(left?.dirName).not.toBe(right?.dirName)
  })

  it('avoids exclude list (for "换一组")', () => {
    const lib: TopicMeta[] = [
      t({ dirName: 'a', last_studied: '2026-05-03T10:00:00+08:00' }),
      t({ dirName: 'b', last_studied: '2026-05-02T10:00:00+08:00' })
    ]
    const { left } = pickRecommendations(lib, NOW, { exclude: ['a'] })
    expect(left?.dirName).toBe('b')
  })
})
