import { describe, it, expect } from 'vitest'
import {
  buildAssistantSystemPrompt,
  buildAssistantUserPrompt,
  formatSearchResults,
} from '../../electron/lib/article-assistant-prompt'
import type { ArticleAssistantGuide } from '@shared/index'

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
