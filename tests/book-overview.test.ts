import { describe, it, expect } from 'vitest'
import { buildBookOverviewPrompt } from '../electron/lib/llm-tasks'

describe('buildBookOverviewPrompt', () => {
  it('prompt 含书名与全部目录标题，且不含正文占位', () => {
    const p = buildBookOverviewPrompt('JTBD', ['Foreword', 'Introduction'])
    expect(p).toContain('JTBD')
    expect(p).toContain('Foreword')
    expect(p).toContain('Introduction')
    expect(p).not.toContain('{{')
  })
})
