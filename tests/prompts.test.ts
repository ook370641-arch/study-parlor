import { describe, expect, it } from 'vitest'
import { assemblePrompt } from '@electron/lib/prompts'

const profile = {
  name: '夜读者',
  profile_text: '社科 / 数学跨界,偏直觉理解',
  preferred_topics: ['心理', '数学']
}

describe('assemblePrompt', () => {
  it('progress mode + high difficulty = base + profile only', () => {
    const sys = assemblePrompt({
      mode: 'progress',
      difficulty: 'high',
      profile
    })
    expect(sys.length).toBeGreaterThan(500)
    expect(sys).toContain('夜读者')
    expect(sys).not.toMatch(/降低探索深度/)
    expect(sys).not.toMatch(/无答案辅助信息/)
    expect(sys).not.toMatch(/掌握度检测/)
  })

  it('progress mode + mid difficulty injects mid suffix', () => {
    const sys = assemblePrompt({ mode: 'progress', difficulty: 'mid', profile })
    expect(sys).toMatch(/降低探索深度/)
  })

  it('progress mode + low difficulty injects low suffix', () => {
    const sys = assemblePrompt({ mode: 'progress', difficulty: 'low', profile })
    expect(sys).toMatch(/无答案辅助信息/)
  })

  it('review mode injects file body and SUGGEST_END marker rule', () => {
    const sys = assemblePrompt({
      mode: 'review',
      difficulty: 'mid',
      profile,
      reviewFileBody: '## 拓扑公理\n...'
    })
    expect(sys).toMatch(/掌握度检测/)
    expect(sys).toContain('## 拓扑公理')
    expect(sys).toMatch(/SUGGEST_END/)
  })

  it('review mode with high difficulty omits mid/low suffix but keeps review block', () => {
    const sys = assemblePrompt({
      mode: 'review',
      difficulty: 'high',
      profile,
      reviewFileBody: 'body'
    })
    expect(sys).toMatch(/掌握度检测/)
    expect(sys).not.toMatch(/降低探索深度/)
  })

  it('order: base → review → difficulty → profile', () => {
    const sys = assemblePrompt({
      mode: 'review',
      difficulty: 'mid',
      profile,
      reviewFileBody: 'B'
    })
    const iBase = sys.indexOf('LEARNER_BASE_PLACEHOLDER')
    const iReview = sys.indexOf('掌握度检测')
    const iDiff = sys.indexOf('降低探索深度')
    const iProfile = sys.indexOf('夜读者')
    expect(iBase).toBeLessThan(iReview)
    expect(iReview).toBeLessThan(iDiff)
    expect(iDiff).toBeLessThan(iProfile)
  })
})
