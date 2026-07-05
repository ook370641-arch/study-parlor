import { describe, expect, it } from 'vitest'
import { parseExternalMaterialsBody } from '@electron/ipc/files'
import { parseFrontmatter, serializeFrontmatter } from '@electron/lib/frontmatter'

describe('parseExternalMaterialsBody', () => {
  it('extracts summary and sources from valid body', () => {
    const body = `## 摘要
React 19 引入了 use hook。

## 来源
1. [React 19 官方博客](https://react.dev/blog) — 新特性概述
2. [MDN](https://developer.mozilla.org) — use 文档
`
    const result = parseExternalMaterialsBody(body)
    expect(result.summary).toBe('React 19 引入了 use hook。')
    expect(result.sources).toHaveLength(2)
    expect(result.sources[0]).toEqual({
      title: 'React 19 官方博客',
      url: 'https://react.dev/blog',
      snippet: '新特性概述'
    })
    expect(result.sources[1]).toEqual({
      title: 'MDN',
      url: 'https://developer.mozilla.org',
      snippet: 'use 文档'
    })
  })

  it('handles sources without snippets', () => {
    const body = `## 摘要
摘要内容

## 来源
1. [Only Title](https://example.com)
`
    const result = parseExternalMaterialsBody(body)
    expect(result.sources[0].snippet).toBeUndefined()
  })

  it('returns empty summary and sources when sections are missing', () => {
    const result = parseExternalMaterialsBody('no sections')
    expect(result.summary).toBe('')
    expect(result.sources).toEqual([])
  })
})

describe('external-materials frontmatter', () => {
  it('serializes and parses external-materials frontmatter', () => {
    const fm = {
      title: '外部资料',
      type: 'external-materials' as const,
      created: '2026-06-22T12:00:00.000Z',
      session_number: 3,
      topic: '导数的链式法则'
    }
    const body = '## 摘要\n摘要内容\n\n## 来源\n1. [Title](https://example.com)\n'
    const serialized = serializeFrontmatter('external-materials', fm, body)
    const parsed = parseFrontmatter(serialized, { filename: '外部资料.md' })
    expect(parsed.frontmatter.type).toBe('external-materials')
    expect(parsed.frontmatter.title).toBe('外部资料')
    expect(parsed.frontmatter.session_number).toBe(3)
    expect(parsed.frontmatter.topic).toBe('导数的链式法则')
    expect(parsed.frontmatter.review_count).toBe(0)
    expect(parsed.body).toContain('摘要内容')
  })

  it('infers external-materials type from filename', () => {
    const raw = `---
title: 外部资料
---
body
`
    const parsed = parseFrontmatter(raw, { filename: '外部资料.md' })
    expect(parsed.frontmatter.type).toBe('external-materials')
  })
})
