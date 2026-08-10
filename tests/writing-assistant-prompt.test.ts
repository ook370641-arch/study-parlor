import { describe, expect, it } from 'vitest'
import { buildWritingSystemPrompt } from '../electron/lib/writing-assistant/prompt'
import type { IndexEntry } from '../electron/lib/writing-assistant/prompt'

describe('buildWritingSystemPrompt', () => {
  const index: IndexEntry[] = [
    { id: 'writing:日记/8.9.md', type: 'writing', title: '8.9', summary: '决策' },
    { id: 'repository:旧随笔.md', type: 'repository', title: '旧随笔', summary: '' },
  ]

  it('removes insert_into_article and fence syntax entirely', () => {
    const p = buildWritingSystemPrompt(index, false)
    expect(p).not.toContain('insert_into_article')
    expect(p).not.toContain('```tool')
  })

  it('mentions read_local as available tool', () => {
    expect(buildWritingSystemPrompt(index, false)).toContain('read_local')
  })

  it('mentions web_search only when search enabled', () => {
    expect(buildWritingSystemPrompt(index, false)).not.toContain('web_search')
    expect(buildWritingSystemPrompt(index, true)).toContain('web_search')
  })

  it('includes S3 no-fabrication rule on read failure', () => {
    const p = buildWritingSystemPrompt(index, false)
    expect(p).toContain('请勿引用')
    expect(p).toContain('重试')
  })

  it('lists catalog ids verbatim (clean, no double prefix)', () => {
    const p = buildWritingSystemPrompt(index, false)
    expect(p).toContain('writing:日记/8.9.md')
    expect(p).toContain('repository:旧随笔.md')
    expect(p).not.toContain('writing:writing/')
    expect(p).not.toContain('repository:repository/')
  })
})
