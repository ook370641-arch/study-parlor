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

  it('requires Chinese output with original English in parentheses for terms', () => {
    expect(digestGuidePrompt).toMatch(/中文/)
    expect(digestGuidePrompt).toContain('上下文（context）')
    expect(digestGuidePrompt).toMatch(/All explanations[\s\S]*must be in Chinese/)
  })

  it('keeps original heading language and does not translate headings', () => {
    expect(digestGuidePrompt).toMatch(/Do not translate headings/)
    expect(digestGuidePrompt).toMatch(/keep the exact original heading text/)
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

describe('buildAssistantSystemPrompt socratic modes', () => {
  it('socratic mode keeps the questioning stance', () => {
    const p = buildAssistantSystemPrompt(true)
    expect(p).toContain('苏格拉底')
    expect(p).toMatch(/引导/)
  })

  it('retrieval mode answers directly without questioning', () => {
    const p = buildAssistantSystemPrompt(false)
    expect(p).not.toContain('苏格拉底')
    expect(p).toContain('直接')
    expect(p).toContain('不要反问')
  })

  it('defaults to socratic when the argument is omitted', () => {
    expect(buildAssistantSystemPrompt()).toContain('苏格拉底')
  })
})

describe('buildAssistantUserPrompt socratic flag', () => {
  const base = { articleContent: '正文内容', guide: null, messages: [] }

  it('ends with the socratic instruction by default', () => {
    expect(buildAssistantUserPrompt(base)).toContain('苏格拉底式回复')
  })

  it('ends with the direct-answer instruction when socratic is false', () => {
    const out = buildAssistantUserPrompt({ ...base, socratic: false })
    expect(out).toContain('直接给出简明回答')
    expect(out).not.toContain('苏格拉底式回复')
  })
})

const digestGuideV2Prompt = fs.readFileSync(
  path.resolve(process.cwd(), 'electron/prompts/digest-guide-v2.md'),
  'utf8'
)

describe('digest-guide-v2.md prompt', () => {
  it('demands JSON-only output with no markdown fences or prose', () => {
    expect(digestGuideV2Prompt).toMatch(/Return ONLY a JSON object|只输出 JSON/)
    expect(digestGuideV2Prompt).toMatch(/Do not wrap it in markdown code blocks|不要 markdown 代码块/)
  })

  it('documents the background/chunks/heading/context/terms schema', () => {
    for (const key of ['"background"', '"chunks"', '"heading"', '"context"', '"terms"']) {
      expect(digestGuideV2Prompt).toContain(key)
    }
  })

  it('reframes the reader assumption: article content is waste, not material', () => {
    expect(digestGuideV2Prompt).toMatch(/读者自己会读正文|WILL read the briefing themselves/)
  })

  it('carries the self-question checklist (故事线/说话者/赞成或挑战/拼图)', () => {
    expect(digestGuideV2Prompt).toContain('故事线')
    expect(digestGuideV2Prompt).toMatch(/说话者|说话的人/)
    expect(digestGuideV2Prompt).toMatch(/支持或挑战|赞成或挑战/)
    expect(digestGuideV2Prompt).toContain('拼图')
  })

  it('anchors the three-tier examples: summary / 掉书袋 / 刻意通俗 forbidden, 前见 expected', () => {
    // 三层反例 + 一层正例
    expect(digestGuideV2Prompt).toContain('❌')
    expect(digestGuideV2Prompt).toContain('✅')
    expect(digestGuideV2Prompt).toContain('掉书袋')
    expect(digestGuideV2Prompt).toContain('刻意通俗')
    expect(digestGuideV2Prompt).toContain('Karpathy')
  })

  it('states the language style: 平实准确, no abstract-noun stacking, no forced colloquialism', () => {
    expect(digestGuideV2Prompt).toContain('平实准确')
    expect(digestGuideV2Prompt).toMatch(/命题|范式|赋能/)
  })

  it('keeps heading language and terms format from v1', () => {
    expect(digestGuideV2Prompt).toMatch(/Do not translate headings|不要翻译.*标题|标题.*不要翻译/)
    expect(digestGuideV2Prompt).toContain('上下文（context）')
  })
})
