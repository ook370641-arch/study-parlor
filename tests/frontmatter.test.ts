import { describe, expect, it } from 'vitest'
import { parseFrontmatter, serializeFrontmatter } from '@electron/lib/frontmatter'

describe('parseFrontmatter', () => {
  it('parses minimal frontmatter', () => {
    const raw = `---
title: 测试
created: 2025-12-15T20:00:00+08:00
review_count: 0
difficulty: mid
tags: [数学]
---
正文 hello`
    const { frontmatter, body } = parseFrontmatter(raw)
    expect(frontmatter.title).toBe('测试')
    expect(frontmatter.review_count).toBe(0)
    expect(frontmatter.tags).toEqual(['数学'])
    expect(body.trim()).toBe('正文 hello')
  })

  it('fills sensible defaults for missing fields', () => {
    const raw = `---
title: x
---
y`
    const { frontmatter } = parseFrontmatter(raw)
    expect(frontmatter.review_count).toBe(0)
    expect(frontmatter.difficulty).toBe('mid')
    expect(frontmatter.tags).toEqual([])
    expect(frontmatter.session_number).toBe(0)
    expect(frontmatter.type).toBe('progress')
    expect(frontmatter.created).toMatch(/\d{4}-\d{2}-\d{2}/)
  })

  it('parses type and progress_summary', () => {
    const raw = `---
title: x
type: research
progress_summary: 已掌握群论基础
---
body`
    const { frontmatter } = parseFrontmatter(raw)
    expect(frontmatter.type).toBe('research')
    expect(frontmatter.progress_summary).toBe('已掌握群论基础')
  })

  it('falls back to filename-derived title when no frontmatter', () => {
    const raw = '# hello\n\nworld'
    const { frontmatter } = parseFrontmatter(raw, { filename: '20260424-hello-world.md' })
    expect(frontmatter.title).toBe('hello world')
  })

  it('uses frontmatter title over filename when both present', () => {
    const raw = `---
title: 嵌入标题
---
正文`
    const { frontmatter } = parseFrontmatter(raw, { filename: 'file-name.md' })
    expect(frontmatter.title).toBe('嵌入标题')
  })

  it('handles dotted date prefix in filename', () => {
    const raw = 'no frontmatter'
    const { frontmatter } = parseFrontmatter(raw, { filename: '2026.04.24.hello-world.md' })
    expect(frontmatter.title).toBe('hello world')
  })

  it('falls back to untitled when filename is only date prefix', () => {
    const raw = 'no frontmatter'
    const { frontmatter } = parseFrontmatter(raw, { filename: '2026-04-24.md' })
    expect(frontmatter.title).toBe('untitled')
  })
})

describe('serializeFrontmatter', () => {
  it('round-trips a parsed file', () => {
    const original = `---
title: 拓扑学基础
session_number: 7
created: 2025-12-15T20:00:00+08:00
last_studied: 2026-04-28T22:13:00+08:00
review_count: 2
difficulty: mid
tags: [数学, 几何]
---
正文段落
`
    const { frontmatter, body } = parseFrontmatter(original)
    const out = serializeFrontmatter(frontmatter, body)
    const reparsed = parseFrontmatter(out)
    expect(reparsed.frontmatter.title).toBe('拓扑学基础')
    expect(reparsed.frontmatter.session_number).toBe(7)
    expect(reparsed.frontmatter.review_count).toBe(2)
    expect(reparsed.frontmatter.tags).toEqual(['数学', '几何'])
    expect(reparsed.body.trim()).toBe('正文段落')
  })
})
