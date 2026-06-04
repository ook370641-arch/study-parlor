import { describe, expect, it } from 'vitest'
import { assemblePrompt } from '@electron/lib/prompts'

const profile = {
  name: '夜读者',
  profile_text: '社科 / 数学跨界,偏直觉理解',
  preferred_topics: ['心理', '数学']
}

describe('assemblePrompt', () => {
  it('progress mode + high difficulty injects high suffix', () => {
    const sys = assemblePrompt({
      mode: 'progress',
      difficulty: 'high',
      profile
    })
    expect(sys.length).toBeGreaterThan(500)
    expect(sys).toContain('夜读者')
    expect(sys).toMatch(/深度追问/)
    expect(sys).toMatch(/不给任何提示/)
  })

  it('progress mode + mid difficulty injects mid suffix', () => {
    const sys = assemblePrompt({ mode: 'progress', difficulty: 'mid', profile })
    expect(sys).toMatch(/难度：中等/)
  })

  it('progress mode + low difficulty injects low suffix', () => {
    const sys = assemblePrompt({ mode: 'progress', difficulty: 'low', profile })
    expect(sys).toMatch(/无答案辅助信息/)
  })

  it('review mode injects file body and 需要存档吗 trigger phrase', () => {
    const sys = assemblePrompt({
      mode: 'review',
      difficulty: 'mid',
      profile,
      reviewFileBody: '## 拓扑公理\n...'
    })
    expect(sys).toMatch(/笔记不足的处理/)
    expect(sys).toContain('## 拓扑公理')
    expect(sys).toMatch(/需要存档吗\?/)
  })

  it('review mode with high difficulty injects high suffix and keeps review block', () => {
    const sys = assemblePrompt({
      mode: 'review',
      difficulty: 'high',
      profile,
      reviewFileBody: 'body'
    })
    expect(sys).toMatch(/笔记不足的处理/)
    expect(sys).toMatch(/深度追问/)
  })

  it('order: base → review → difficulty → profile', () => {
    const sys = assemblePrompt({
      mode: 'review',
      difficulty: 'mid',
      profile,
      reviewFileBody: 'B'
    })
    const iBase = sys.indexOf('苏格拉底式私教')
    const iReview = sys.indexOf('笔记不足的处理')
    const iDiff = sys.indexOf('难度：中等')
    const iProfile = sys.indexOf('夜读者')
    expect(iBase).toBeLessThan(iReview)
    expect(iReview).toBeLessThan(iDiff)
    expect(iDiff).toBeLessThan(iProfile)
  })
})
