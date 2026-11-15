import { describe, expect, it } from 'vitest'
import { countTextWords } from '@electron/lib/text-stats'
import { parseNoteFile } from '@electron/lib/notes'

describe('countTextWords', () => {
  it('中文按汉字、英文数字按词，忽略 URL', () => {
    expect(countTextWords('中文 two words\n42 https://example.com')).toBe(5)
  })

  it('笔记字数只统计正文，不统计 frontmatter', () => {
    const entry = parseNoteFile('notes/a.md', '---\ntitle: 标题不计入\n---\n中文 two')
    expect(entry.wordCount).toBe(3)
  })
})
