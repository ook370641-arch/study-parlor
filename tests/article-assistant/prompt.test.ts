import fs from 'node:fs'
import path from 'node:path'
import { describe, it, expect } from 'vitest'
import {
  buildAssistantSystemPrompt,
  buildAssistantUserPrompt,
  formatSearchResults,
} from '../../electron/lib/article-assistant-prompt'
import type { ArticleAssistantGuide } from '@shared/index'

const digestGuidePrompt = fs.readFileSync(
  path.resolve(process.cwd(), 'electron/prompts/digest-guide.md'),
  'utf8'
)

describe('formatSearchResults', () => {
  it('produces ordered 来源/链接 blocks for a 2-item array', () => {
    const out = formatSearchResults([
      { title: '标题A', url: 'https://a.example', content: '内容A' },
      { title: '标题B', url: 'https://b.example', content: '内容B' },
    ])
    expect(out).toBe(
      '来源 1：标题A\n内容A\n链接：https://a.example\n\n来源 2：标题B\n内容B\n链接：https://b.example'
    )
    // ordering: 来源 1 appears before 来源 2
    expect(out.indexOf('来源 1')).toBeLessThan(out.indexOf('来源 2'))
  })
})

describe('buildAssistantSystemPrompt', () => {
  it('does not carry the archive-trigger question', () => {
    expect(buildAssistantSystemPrompt()).not.toMatch(/需要存档吗/)
  })
})

describe('digest-guide.md prompt', () => {
  it('demands JSON-only output with no markdown fences or prose', () => {
    expect(digestGuidePrompt).toContain('Return ONLY a JSON object')
    expect(digestGuidePrompt).toContain('Do not wrap it in markdown code blocks or add explanatory prose.')
  })

  it('documents the background/chunks/heading/summary/terms schema', () => {
    expect(digestGuidePrompt).toContain('"background"')
    expect(digestGuidePrompt).toContain('"chunks"')
    expect(digestGuidePrompt).toContain('"heading"')
    expect(digestGuidePrompt).toContain('"summary"')
    expect(digestGuidePrompt).toContain('"terms"')
  })

  it('forbids decorative metadata patterns', () => {
    for (const banned of ['Vol.', 'AI Builders Digest', 'Generated through', '档案编号', '学习卷宗']) {
      expect(digestGuidePrompt).toContain(banned)
    }
    // they appear inside the explicit "Do not output ..." constraint
    expect(digestGuidePrompt).toMatch(/Do not output[\s\S]*档案编号/)
  })
})

describe('buildAssistantUserPrompt', () => {
  const guide: ArticleAssistantGuide = {
    background: '这是文章背景',
    chunks: [{ heading: '第一节', summary: '第一节摘要', terms: [] }],
  }

  it('includes all sections when guide, selection, search, and history present', () => {
    const out = buildAssistantUserPrompt({
      articleContent: '文章正文',
      guide,
      selection: '选中的一段',
      messages: [{ role: 'user', content: '这是什么意思？' }],
      searchResults: '来源 1：X\nY\n链接：https://x.example',
    })
    expect(out).toContain('# 文章全文')
    expect(out).toContain('# 文章背景')
    expect(out).toContain('# 文章摘要')
    expect(out).toContain('# 用户选中文本')
    expect(out).toContain('# 网络搜索结果')
    expect(out).toContain('# 历史对话')
    expect(out).toContain('请针对用户当前问题或选中文本给出苏格拉底式回复。')
  })

  it('omits background/selection/search sections when absent', () => {
    const out = buildAssistantUserPrompt({
      articleContent: '文章正文',
      guide: null,
      messages: [],
    })
    expect(out).toContain('# 文章全文')
    expect(out).toContain('请针对用户当前问题或选中文本给出苏格拉底式回复。')
    expect(out).not.toContain('# 文章背景')
    expect(out).not.toContain('# 用户选中文本')
    expect(out).not.toContain('# 网络搜索结果')
    expect(out).not.toContain('# 历史对话')
  })
})
