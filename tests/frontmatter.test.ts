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

  it('parses description field', () => {
    const raw = `---
title: Agent
description: Agent 规划方法的对比与实践
type: progress
---
body`
    const { frontmatter } = parseFrontmatter(raw)
    expect(frontmatter.description).toBe('Agent 规划方法的对比与实践')
  })

  it('infers type from filename when missing', () => {
    const raw = `---
title: x
---
body`
    const { frontmatter: p } = parseFrontmatter(raw, { filename: '学习报告.md' })
    expect(p.type).toBe('progress')
    const { frontmatter: r } = parseFrontmatter(raw, { filename: '复习报告.md' })
    expect(r.type).toBe('review')
    const { frontmatter: f } = parseFrontmatter(raw, { filename: '寓言.md' })
    expect(f.type).toBe('fable')
    const { frontmatter: t } = parseFrontmatter(raw, { filename: '原始对话.md' })
    expect(t.type).toBe('transcript')
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
    const out = serializeFrontmatter(frontmatter.type ?? 'progress', frontmatter, body)
    const reparsed = parseFrontmatter(out)
    expect(reparsed.frontmatter.title).toBe('拓扑学基础')
    expect(reparsed.frontmatter.session_number).toBe(7)
    expect(reparsed.frontmatter.review_count).toBe(2)
    expect(reparsed.frontmatter.tags).toEqual(['数学', '几何'])
    expect(reparsed.body.trim()).toBe('正文段落')
  })

  it('round-trips article-assistant parent fields', () => {
    const original = `---
title: 夜航简报助手
type: article-assistant
created: 2026-07-11T00:00:00+08:00
parent_path: notes/briefing-2026-07-11.md
parent_type: briefing
---
助手正文
`
    const { frontmatter, body } = parseFrontmatter(original)
    expect(frontmatter.type).toBe('article-assistant')
    expect(frontmatter.parent_path).toBe('notes/briefing-2026-07-11.md')
    expect(frontmatter.parent_type).toBe('briefing')

    const out = serializeFrontmatter('article-assistant', frontmatter, body)
    const reparsed = parseFrontmatter(out)
    expect(reparsed.frontmatter.parent_path).toBe('notes/briefing-2026-07-11.md')
    expect(reparsed.frontmatter.parent_type).toBe('briefing')
    expect(reparsed.body.trim()).toBe('助手正文')
  })

  it('writes core fields in fixed order for progress', () => {
    const fm = {
      title: 'Agent',
      description: 'Agent 规划方法的对比',
      type: 'progress' as const,
      created: '2026-05-23T00:00:00.000Z',
      tags: ['skill学习'],
      session_number: 1,
      difficulty: 'mid' as const,
      progress_summary: '精读 ReAct',
      review_count: 0,
    }
    const out = serializeFrontmatter('progress', fm, '# Body')
    const lines = out.split('\n')
    // title should appear before type, type before session_number
    const titleIdx = lines.findIndex(l => l.startsWith('title:'))
    const typeIdx = lines.findIndex(l => l.startsWith('type:'))
    const sessionIdx = lines.findIndex(l => l.startsWith('session_number:'))
    expect(titleIdx).toBeLessThan(typeIdx)
    expect(typeIdx).toBeLessThan(sessionIdx)
  })

  it('writes review fields in correct order', () => {
    const fm = {
      title: 'Agent',
      description: 'Agent 规划方法的对比',
      type: 'review' as const,
      created: '2026-05-27T00:00:00.000Z',
      tags: ['skill学习'],
      review_index: 1,
      last_reviewed: '2026-05-27T00:00:00.000Z',
      source_title: 'Agent',
    }
    const out = serializeFrontmatter('review', fm, '# Body')
    expect(out).toContain('review_index: 1')
    expect(out).toContain('last_reviewed:')
    expect(out).toContain('source_title:')
  })

  it('skips undefined and empty values', () => {
    const fm = {
      title: 'Minimal',
      type: 'progress' as const,
      created: '2026-05-23T00:00:00.000Z',
      tags: [],
      session_number: 1,
      difficulty: 'mid' as const,
      review_count: 0,
      // description, progress_summary intentionally omitted
    }
    const out = serializeFrontmatter('progress', fm, 'body')
    expect(out).not.toContain('description:')
    expect(out).not.toContain('progress_summary:')
  })
})

describe('web-article frontmatter', () => {
  it('serializes and parses web-article ext fields', () => {
    const raw = serializeFrontmatter('web-article', {
      title: 'The Second Half',
      type: 'web-article',
      created: '2025-04-10T00:00:00.000Z',
      tags: ['拾贝'],
      source_url: 'https://ysymyth.github.io/The-Second-Half/',
      source_name: 'ysymyth.github.io',
      published_at: '2025-04-10T00:00:00.000Z',
      imported_at: '2026-08-02T00:00:00.000Z',
      authors: ['Shunyu Yao'],
      summary: 'AI 进入下半场',
    }, '# The Second Half\n\n正文')
    const { frontmatter, body } = parseFrontmatter(raw, { filename: 'The Second Half.md' })
    expect(frontmatter.type).toBe('web-article')
    expect(frontmatter.source_url).toBe('https://ysymyth.github.io/The-Second-Half/')
    expect(frontmatter.source_name).toBe('ysymyth.github.io')
    expect(frontmatter.authors).toEqual(['Shunyu Yao'])
    expect(frontmatter.summary).toBe('AI 进入下半场')
    expect(body).toContain('正文')
  })
})
