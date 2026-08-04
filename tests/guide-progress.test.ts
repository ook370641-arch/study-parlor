import { describe, it, expect } from 'vitest'
import {
  GUIDE_FORMAT_VERSION,
  countArticleHeadings,
  isGuideCacheCurrent,
  guideProgressText,
  guideProgressFraction,
} from '../src/lib/guide-progress'

describe('countArticleHeadings', () => {
  it('counts H2 and H3 but not H1/H4', () => {
    const md = '# 标题\n\n## 一\nx\n### 二\ny\n#### 三\nz\n## 四\n'
    expect(countArticleHeadings(md)).toBe(3)
  })
  it('returns 0 for headingless content', () => {
    expect(countArticleHeadings('plain text')).toBe(0)
  })
})

describe('isGuideCacheCurrent', () => {
  it('briefing without version is stale', () => {
    expect(isGuideCacheCurrent('briefing', undefined)).toBe(false)
  })
  it('briefing v1 is stale, v2 current', () => {
    expect(isGuideCacheCurrent('briefing', 1)).toBe(false)
    expect(isGuideCacheCurrent('briefing', GUIDE_FORMAT_VERSION)).toBe(true)
  })
  it('non-briefing is always current regardless of version', () => {
    expect(isGuideCacheCurrent('anthropic-article', undefined)).toBe(true)
    expect(isGuideCacheCurrent('web-article', undefined)).toBe(true)
  })
})

describe('guideProgressText', () => {
  it('formats the three stages', () => {
    expect(guideProgressText(null)).toBe('规划检索中…')
    expect(guideProgressText({ stage: 'planning' })).toBe('规划检索中…')
    expect(guideProgressText({ stage: 'searching', done: 3, total: 7 })).toBe('检索背景资料中… 3/7')
    expect(guideProgressText({ stage: 'writing', chars: 860, entriesDone: 2, entriesTotal: 14 }))
      .toBe('撰写导读中… §2/14 · 已写 860 字')
  })
})

describe('guideProgressFraction', () => {
  it('is monotonic across stages and clamps overshoot', () => {
    expect(guideProgressFraction({ stage: 'planning' })).toBeCloseTo(0.05)
    expect(guideProgressFraction({ stage: 'searching', done: 1, total: 2 })).toBeCloseTo(0.175)
    expect(guideProgressFraction({ stage: 'writing', chars: 100, entriesDone: 7, entriesTotal: 14 })).toBeCloseTo(0.65)
    // 超发 clamp：模型多输出 heading 键时不超过 1
    expect(guideProgressFraction({ stage: 'writing', chars: 100, entriesDone: 20, entriesTotal: 14 })).toBe(1)
    // total 为 0 时不产生 NaN
    expect(guideProgressFraction({ stage: 'searching', done: 0, total: 0 })).toBeCloseTo(0.05)
  })
})
