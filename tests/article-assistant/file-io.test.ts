import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { parseAssistantSessionBody, serializeAssistantSessionBody } from '@electron/ipc/article-assistant'
import { parseFrontmatter, serializeFrontmatter } from '@electron/lib/frontmatter'
import type { ArticleAssistantMessage } from '@shared/index'

describe('parseAssistantSessionBody', () => {
  it('parses alternating 用户/助手 sections into the right roles and content', () => {
    const body = [
      '## 用户',
      '',
      '这篇文章讲了什么？',
      '',
      '## 助手',
      '',
      '主要讲代理系统的设计。',
      '',
    ].join('\n')

    const messages = parseAssistantSessionBody(body)
    expect(messages).toEqual([
      { role: 'user', content: '这篇文章讲了什么？' },
      { role: 'assistant', content: '主要讲代理系统的设计。' },
    ])
  })

  it('ignores unknown headings and empty body', () => {
    expect(parseAssistantSessionBody('')).toEqual([])
    expect(parseAssistantSessionBody('## 备注\n\n无关内容')).toEqual([])
  })
})

describe('assistant session write/read round-trip', () => {
  let dir: string

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aa-file-io-'))
  })

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true })
  })

  it('serializes and re-parses a session file with parent metadata and messages', () => {
    const messages: ArticleAssistantMessage[] = [
      { role: 'user', content: '第一段说明了什么？' },
      { role: 'assistant', content: '说明了背景动机。' },
    ]
    const parentPath = path.join(dir, '夜航简报-2026-07-11.md')
    const sessionPath = path.join(dir, '夜航简报-2026-07-11.assistant.md')

    const body = messages
      .map((m) => `## ${m.role === 'user' ? '用户' : '助手'}\n\n${m.content}\n`)
      .join('\n')
    const now = '2026-07-11T00:00:00.000Z'
    const fm = {
      title: '旁注记录',
      type: 'article-assistant' as const,
      created: now,
      created_at: now,
      updated_at: now,
      parent_path: parentPath,
      parent_type: 'briefing' as const,
      tags: [] as string[],
    }

    const serialized = serializeFrontmatter('article-assistant', fm, body)
    expect(serialized).toContain('parent_path:')
    expect(serialized).toContain('parent_type: briefing')

    fs.writeFileSync(sessionPath, serialized, 'utf8')

    const { frontmatter, body: readBody } = parseFrontmatter(fs.readFileSync(sessionPath, 'utf8'), {
      filename: path.basename(sessionPath),
    })
    expect(frontmatter.type).toBe('article-assistant')
    expect(frontmatter.parent_path).toBe(parentPath)
    expect(frontmatter.parent_type).toBe('briefing')
    expect(frontmatter.created_at).toBe(now)
    expect(frontmatter.updated_at).toBe(now)
    expect(parseAssistantSessionBody(readBody)).toEqual(messages)
  })
})

describe('assistant session selection persistence', () => {
  it('serializes a user selection as a quote line before the content', () => {
    const out = serializeAssistantSessionBody([
      { role: 'user', content: '这段什么意思？', selection: '原文中的一段话' },
    ])
    expect(out).toContain('## 用户')
    expect(out).toContain('> 选段：原文中的一段话')
    expect(out.indexOf('> 选段：')).toBeLessThan(out.indexOf('这段什么意思？'))
  })

  it('flattens multi-line selections into one line', () => {
    const out = serializeAssistantSessionBody([
      { role: 'user', content: '问', selection: '第一行\n第二行' },
    ])
    expect(out).toContain('> 选段：第一行 第二行')
  })

  it('round-trips messages with selections through frontmatter serialize/parse', () => {
    const messages: ArticleAssistantMessage[] = [
      { role: 'user', content: '这段什么意思？', selection: '原文中的一段话' },
      { role: 'assistant', content: '这是对选段的解释。' },
    ]
    const raw = serializeFrontmatter(
      'article-assistant',
      { title: '旁注记录', created: '2026-07-19T00:00:00.000Z', tags: [] },
      serializeAssistantSessionBody(messages)
    )
    const { body } = parseFrontmatter(raw, { filename: 'x.assistant.md' })
    expect(parseAssistantSessionBody(body)).toEqual(messages)
  })

  it('parses legacy sessions without selection lines (selection undefined)', () => {
    const body = ['## 用户', '', '旧消息', '', '## 助手', '', '旧回复', ''].join('\n')
    expect(parseAssistantSessionBody(body)).toEqual([
      { role: 'user', content: '旧消息', selection: undefined },
      { role: 'assistant', content: '旧回复' },
    ])
  })
})
