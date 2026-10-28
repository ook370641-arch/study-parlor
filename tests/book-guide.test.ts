import { describe, it, expect, vi, beforeEach } from 'vitest'
import { buildBookContextBlock } from '../electron/lib/book-guide'
import { buildBookGuidePlanPrompt, buildBookGuideV2UserPrompt } from '../electron/lib/guide-v2'

vi.mock('../electron/lib/kimi', () => ({
  chatNonStream: vi.fn(),
  chatStream: vi.fn(),
}))
vi.mock('../electron/lib/search', () => ({ searchWeb: vi.fn() }))
vi.mock('../electron/lib/credentials', () => ({ getSearchApiKey: vi.fn() }))

import { chatNonStream, chatStream } from '../electron/lib/kimi'
import { getSearchApiKey } from '../electron/lib/credentials'
import { runGuideV2ForBook } from '../electron/lib/guide-v2-pipeline'

describe('buildBookContextBlock', () => {
  it('注入书名+目录+前章摘要', () => {
    const block = buildBookContextBlock(
      {
        bookTitle: 'Intercom on Jobs-to-be-Done',
        tocTitles: ['Foreword', 'Introduction', 'Focus on the job'],
        prevChapterSummary: '前言讲了 JTBD 的缘起。',
      },
      'Focus on the job'
    )
    expect(block).toContain('Intercom on Jobs-to-be-Done')
    expect(block).toContain('Foreword')
    expect(block).toContain('前言讲了 JTBD')
    expect(block).toContain('Focus on the job')
    expect(block).toContain('←（本章）')
    expect(block).not.toContain('undefined')
  })

  it('无前章摘要时不出现该段', () => {
    const block = buildBookContextBlock({ bookTitle: 'B', tocTitles: ['A'] }, 'A')
    expect(block).not.toContain('上一章')
  })
})

describe('书籍导读 prompt 变体', () => {
  const content = '## 第一节\n\n正文甲\n\n## 第二节\n\n正文乙'

  it('规划 prompt 使用书籍/小节语义，含标题、正文与 JSON 示例', () => {
    const p = buildBookGuidePlanPrompt(content, '第一章 起')
    expect(p).toContain('书籍章节')
    expect(p).toContain('小节')
    expect(p).toContain('第一章 起')
    expect(p).toContain('正文甲')
    expect(p).toContain('§1–§2')
    expect(p).toContain('{"queries":[{"query"')
    expect(p).not.toContain('AI 领域长文')
  })

  it('撰写 prompt 标注 Book chapter 并给出逐节资料夹', () => {
    const p = buildBookGuideV2UserPrompt({
      articleContent: content,
      articleTitle: '第一章 起',
      materials: new Map([[1, [{ title: '材料', url: 'https://x', snippet: '摘要' }]]]),
      entryCount: 2,
    })
    expect(p).toContain('Book chapter: 第一章 起')
    expect(p).toContain('### §1')
    expect(p).toContain('材料')
    expect(p).toContain('### §2')
    expect(p).toContain('无外部资料')
    expect(p).not.toContain('Article title:')
  })

  it('entryCount 为 0 时仍按 1 个小节/资料夹生成', () => {
    const plan = buildBookGuidePlanPrompt('没有标题的正文', '序')
    expect(plan).toContain('§1–§1')

    const user = buildBookGuideV2UserPrompt({
      articleContent: '没有标题的正文',
      articleTitle: '序',
      materials: new Map(),
      entryCount: 0,
    })
    expect(user).toContain('### §1')
    expect(user).toContain('无外部资料')
    expect(user).not.toContain('### §2')
  })
})

describe('runGuideV2ForBook', () => {
  const cfg = { apiKey: 'k', baseUrl: 'https://x', model: 'm', libraryPath: '/' } as never
  const content = '## 第一节\n\n正文甲\n\n## 第二节\n\n正文乙'

  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(getSearchApiKey).mockResolvedValue(null)
    vi.mocked(chatNonStream).mockResolvedValue('{"queries":[]}')
    vi.mocked(chatStream).mockImplementation((async (
      _cfg: unknown,
      _args: unknown,
      onChunk: (text: string) => void
    ) => {
      onChunk('{"background":"背景","chunks":[{"heading":"第一节","summary":"总结","terms":[]}]}')
      return { content: '', toolCalls: [], finishReason: 'stop' }
    }) as never)
  })

  it('规划与撰写阶段都使用书籍 builder，而非博客措辞', async () => {
    const guide = await runGuideV2ForBook(
      cfg,
      { system: 'book-system-prompt', articleContent: content, articleTitle: '第一章 起' },
      () => {}
    )
    expect(guide.chunks).toHaveLength(1)

    // 阶段 1：检索规划 prompt
    const planPrompt = vi.mocked(chatNonStream).mock.calls[0][1].messages[0].content
    expect(planPrompt).toContain('书籍章节')
    expect(planPrompt).toContain('章节标题：第一章 起')
    expect(planPrompt).not.toContain('AI 领域长文')

    // 阶段 3：撰写 prompt
    const writeArgs = vi.mocked(chatStream).mock.calls[0][1]
    expect(writeArgs.messages[0]).toEqual({ role: 'system', content: 'book-system-prompt' })
    const userPrompt = writeArgs.messages[1].content
    expect(userPrompt).toContain('Book chapter: 第一章 起')
    expect(userPrompt).toContain('### §1')
    expect(userPrompt).not.toContain('Article title:')
  })
})
