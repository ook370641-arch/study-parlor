import { describe, expect, it } from 'vitest'
import { assemblePrompt } from '@electron/lib/prompts'

describe('assemblePrompt', () => {
  it('progress mode + high difficulty injects high suffix', () => {
    const sys = assemblePrompt({
      mode: 'progress',
      difficulty: 'high'
    })
    expect(sys.length).toBeGreaterThan(500)
    expect(sys).not.toContain('# 学习者画像')
    expect(sys).toMatch(/深度追问/)
    expect(sys).toMatch(/不给任何提示/)
  })

  it('progress mode + mid difficulty injects mid suffix', () => {
    const sys = assemblePrompt({ mode: 'progress', difficulty: 'mid' })
    expect(sys).toMatch(/难度：中等/)
  })

  it('progress mode + low difficulty injects low suffix', () => {
    const sys = assemblePrompt({ mode: 'progress', difficulty: 'low' })
    expect(sys).toMatch(/无答案辅助信息/)
  })

  it('review mode injects file body and 需要存档吗 trigger phrase', () => {
    const sys = assemblePrompt({
      mode: 'review',
      difficulty: 'mid',
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
      reviewFileBody: 'body'
    })
    expect(sys).toMatch(/笔记不足的处理/)
    expect(sys).toMatch(/深度追问/)
  })

  it('order: base → review → difficulty', () => {
    const sys = assemblePrompt({
      mode: 'review',
      difficulty: 'mid',
      reviewFileBody: 'B'
    })
    const iBase = sys.indexOf('苏格拉底式私教')
    const iReview = sys.indexOf('笔记不足的处理')
    const iDiff = sys.indexOf('难度：中等')
    expect(iBase).toBeLessThan(iReview)
    expect(iReview).toBeLessThan(iDiff)
  })

  it('injects external materials summary when provided', () => {
    const sys = assemblePrompt({
      mode: 'progress',
      difficulty: 'mid',
      externalMaterialsSummary: 'React 19 引入了 use hook，允许在条件分支中读取 Context。'
    })
    expect(sys).toContain('【外部参考资料】')
    expect(sys).toContain('React 19 引入了 use hook')
    expect(sys).toMatch(/以上资料仅供你作为背景知识使用/)
    expect(sys).toMatch(/不要直接引用资料给出答案/)
  })

  it('injects local materials when provided', () => {
    const sys = assemblePrompt({
      mode: 'progress',
      difficulty: 'mid',
      localMaterials: [
        { name: '笔记.md', content: '# 我的笔记\n关键概念 A 与 B 的关系。' },
        { name: '摘录.txt', content: '一段摘录文字。' }
      ]
    })
    expect(sys).toContain('【本地资料】')
    expect(sys).toContain('### 笔记.md')
    expect(sys).toContain('关键概念 A 与 B 的关系。')
    expect(sys).toContain('### 摘录.txt')
    expect(sys).toMatch(/不要直接照读资料给出答案/)
  })

  it('omits local materials section when empty', () => {
    const sys = assemblePrompt({
      mode: 'progress',
      difficulty: 'mid',
      localMaterials: []
    })
    expect(sys).not.toContain('【本地资料】')
  })
})
