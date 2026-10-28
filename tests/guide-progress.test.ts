import { describe, it, expect } from 'vitest'
import {
  GUIDE_FORMAT_VERSION,
  countArticleHeadings,
  isGuideCacheCurrent,
  guideProgressText,
  guideProgressFraction,
  guideProgressParts,
} from '../src/lib/guide-progress'

describe('countArticleHeadings', () => {
  it('counts H2 and H3 but not H1/H4', () => {
    const md = '# 标题\n\n## 一\nx\n### 二\ny\n#### 三\nz\n## 四\n'
    expect(countArticleHeadings(md)).toBe(3)
  })
  it('returns 0 for headingless content', () => {
    expect(countArticleHeadings('plain text')).toBe(0)
  })
  it('excludes the 原始来源 section and its ### source groups', () => {
    // 回归：来源分组曾被计入分母，进度永远到不了 N/N（16 条目 + 16 来源组显示 §x/§32）
    const md = '## 一\nx\n## 二\ny\n## 原始来源\n### Anthropic\n- [a](https://a)\n### 机器之心\n- [b](https://b)'
    expect(countArticleHeadings(md)).toBe(2)
  })
  it('excludes a Sources section case-insensitively', () => {
    const md = '## 一\nx\n## Sources\n### Blog\n- [a](https://a)'
    expect(countArticleHeadings(md)).toBe(1)
  })
  it('still counts ### subsections inside content sections', () => {
    const md = '## 一\nx\n### 子节\ny\n## 原始来源\n### 来源组\nz'
    expect(countArticleHeadings(md)).toBe(2)
  })
})

describe('isGuideCacheCurrent', () => {
  it('旧 v1 导读（无版本）失效', () => {
    expect(isGuideCacheCurrent(undefined)).toBe(false)
    expect(isGuideCacheCurrent(1)).toBe(false)
  })
  it('v2 导读命中', () => {
    expect(isGuideCacheCurrent(GUIDE_FORMAT_VERSION)).toBe(true)
  })
})

describe('guideProgressText', () => {
  it('formats the three stages', () => {
    expect(guideProgressText(null)).toBe('展卷定章…')
    expect(guideProgressText({ stage: 'planning' })).toBe('展卷定章…')
    expect(guideProgressText({ stage: 'searching', done: 3, total: 7 })).toBe('循迹访书… 3 / 7 处')
    expect(guideProgressText({ stage: 'writing', chars: 860, entriesDone: 2, entriesTotal: 14 }))
      .toBe('落笔成文… 第 3 节，共 14 节 · 已落 860 字')
  })

  it('撰写阶段零进度时不显示「第 1 节」占位溢出，字数未起时不显示', () => {
    expect(guideProgressParts({ stage: 'writing', chars: 0, entriesDone: 0, entriesTotal: 0 }))
      .toEqual({ label: '落笔成文…', detail: '' })
    expect(guideProgressParts({ stage: 'writing', chars: 0, entriesDone: 0, entriesTotal: 3 }))
      .toEqual({ label: '落笔成文…', detail: '第 1 节，共 3 节' })
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

describe('guideProgressParts', () => {
  it('拆分 label 与 detail', () => {
    expect(guideProgressParts(null)).toEqual({ label: '展卷定章…', detail: '' })
    expect(guideProgressParts({ stage: 'searching', done: 3, total: 7 }))
      .toEqual({ label: '循迹访书…', detail: '3 / 7 处' })
    expect(guideProgressParts({ stage: 'writing', chars: 860, entriesDone: 2, entriesTotal: 14 }))
      .toEqual({ label: '落笔成文…', detail: '第 3 节，共 14 节 · 已落 860 字' })
  })
})
