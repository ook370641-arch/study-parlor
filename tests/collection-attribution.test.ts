import { describe, it, expect } from 'vitest'
import { attributeMessages } from '@/lib/collection-attribution'
import type { ArticleAssistantChunk, ArticleAssistantMessage } from '@shared/index'

const GUIDE: ArticleAssistantChunk[] = [
  { heading: 'AI Safety', summary: '', terms: [] },
  { heading: 'Training Data', summary: '', terms: [] },
]

const ARTICLE = [
  '前言段落，无标题。',
  '',
  '## AI Safety',
  '宪法式 AI 用书面原则约束模型行为。',
  '',
  '## Training Data',
  '训练数据的去重与过滤决定模型质量。',
].join('\n')

const user = (content: string, selection?: string): ArticleAssistantMessage =>
  ({ role: 'user', content, ...(selection ? { selection } : {}) })
const asst = (content: string): ArticleAssistantMessage => ({ role: 'assistant', content })

describe('attributeMessages', () => {
  it('带 selection 的消息及其后续问答归属对应块（向前填充）', () => {
    const msgs = [
      user('这是什么', '宪法式 AI'),   // 落在 chunk 0
      asst('回答一'),
      user('追问不带选段'),
      asst('回答二'),
    ]
    const map = attributeMessages(msgs, ARTICLE, GUIDE)
    expect(map.get(0)).toHaveLength(4)
    expect(map.get(1)).toBeUndefined()
  })

  it('新 selection 切换归属', () => {
    const msgs = [
      user('问 A', '宪法式 AI'),
      asst('答 A'),
      user('问 B', '去重与过滤'),       // 落在 chunk 1
      asst('答 B'),
    ]
    const map = attributeMessages(msgs, ARTICLE, GUIDE)
    expect(map.get(0)?.map((m) => m.index)).toEqual([0, 1])
    expect(map.get(1)?.map((m) => m.index)).toEqual([2, 3])
  })

  it('从未带 selection 的消息不归属任何块', () => {
    const map = attributeMessages([user('hi'), asst('hello')], ARTICLE, GUIDE)
    expect(map.size).toBe(0)
  })

  it('selection 匹配不到任何块时丢弃该段', () => {
    const msgs = [user('问', '不存在的内容'), asst('答')]
    expect(attributeMessages(msgs, ARTICLE, GUIDE).size).toBe(0)
  })

  it('selection 跨 markdown 格式时按去格式文本匹配', () => {
    const article = '## AI Safety\n这是 **宪法式** AI 的介绍。'
    const msgs = [user('问', '这是 宪法式 AI 的介绍')] // DOM 选段不含 **
    const map = attributeMessages(msgs, article, [GUIDE[0]])
    expect(map.get(0)).toHaveLength(1)
  })

  it('空消息流返回空 Map', () => {
    expect(attributeMessages([], ARTICLE, GUIDE).size).toBe(0)
  })

  it('guideChunks 为空时返回空 Map', () => {
    expect(attributeMessages([user('a', '宪法式 AI')], ARTICLE, []).size).toBe(0)
  })
})
