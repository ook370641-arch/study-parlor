import { describe, expect, it } from 'vitest'
import {
  resolveTitleConflict,
  buildReviewAppendix,
  bumpReviewFrontmatter
} from '@electron/lib/archive'
import type { Frontmatter } from '@shared/index'

describe('resolveTitleConflict', () => {
  it('returns title.md when no conflict', () => {
    expect(resolveTitleConflict('拓扑学基础', [], new Date('2026-05-03T20:30:00+08:00')))
      .toBe('拓扑学基础.md')
  })

  it('appends -HHMM suffix when title.md already exists', () => {
    expect(resolveTitleConflict('拓扑学基础', ['拓扑学基础.md'], new Date('2026-05-03T22:13:00+08:00')))
      .toBe('拓扑学基础-2213.md')
  })
})

describe('buildReviewAppendix', () => {
  it('formats append block with date and summary', () => {
    const out = buildReviewAppendix(new Date('2026-05-03'), '本次重点考察 σ 代数...')
    expect(out).toContain('## 复习记录 2026-05-03')
    expect(out).toContain('本次重点考察 σ 代数')
  })
})

describe('bumpReviewFrontmatter', () => {
  it('increments review_count and updates last_reviewed', () => {
    const before: Frontmatter = {
      title: 't', created: '2025-01-01', review_count: 1,
      difficulty: 'mid', tags: []
    }
    const after = bumpReviewFrontmatter(before, new Date('2026-05-03T22:00:00+08:00'))
    expect(after.review_count).toBe(2)
    expect(after.last_reviewed).toBe('2026-05-03T14:00:00.000Z')
  })
})
