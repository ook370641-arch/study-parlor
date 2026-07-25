import { describe, expect, it } from 'vitest'
import { computeSealedChunks } from '@/lib/spine-seals'

const CONTENT = '## X / Twitter\nAaron Levie 讨论了 LLM 在企业工作流中的落地。\n\n## Official Blogs\nClaude 的新功能提升了长上下文可靠性。'
const CHUNKS = [
  { heading: 'X / Twitter', summary: '', terms: [] },
  { heading: 'Official Blogs', summary: '', terms: [] },
]
const anno = (selectedText: string) => ({
  id: '1', selectedText, note: '', paragraphIndex: 0, createdAt: '', updatedAt: '',
})

describe('computeSealedChunks', () => {
  it('seals the chunk whose body contains the annotation text', () => {
    const sealed = computeSealedChunks(CONTENT, CHUNKS as never, [anno('长上下文可靠性')])
    expect([...sealed]).toEqual([1])
  })

  it('no match → no seal (宁可少封不可错封)', () => {
    const sealed = computeSealedChunks(CONTENT, CHUNKS as never, [anno('不存在的文本')])
    expect(sealed.size).toBe(0)
  })

  it('skips empty selectedText', () => {
    const sealed = computeSealedChunks(CONTENT, CHUNKS as never, [anno('  ')])
    expect(sealed.size).toBe(0)
  })
})
