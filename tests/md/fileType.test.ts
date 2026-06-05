import { describe, it, expect } from 'vitest'
import { detectDocType, type DocType } from '@/components/md/fileType'

describe('detectDocType', () => {
  it('detects report from frontmatter type=progress', () => {
    const content = '---\ntype: progress\n---\n# Hello'
    expect(detectDocType(content, 'whatever.md')).toBe('report')
  })

  it('detects report from frontmatter type=review', () => {
    const content = '---\ntype: review\n---\n# Hello'
    expect(detectDocType(content, 'whatever.md')).toBe('report')
  })

  it('falls back to filename for 学习报告', () => {
    expect(detectDocType('# Hello', '学习报告.md')).toBe('report')
  })

  it('falls back to filename for 复习报告', () => {
    expect(detectDocType('# Hello', '复习报告.md')).toBe('report')
  })

  it('falls back to filename for 寓言', () => {
    expect(detectDocType('# Hello', '寓言.md')).toBe('fable')
  })

  it('falls back to filename for 寓言2', () => {
    expect(detectDocType('# Hello', '寓言2.md')).toBe('fable')
  })

  it('falls back to filename for 原始对话', () => {
    expect(detectDocType('# Hello', '原始对话.md')).toBe('dialogue')
  })

  it('defaults to report when unrecognizable', () => {
    expect(detectDocType('# Hello', 'unknown.md')).toBe('report')
  })

  it('handles content without frontmatter', () => {
    expect(detectDocType('# Just a title\n\nSome text', '学习报告.md')).toBe('report')
  })
})
