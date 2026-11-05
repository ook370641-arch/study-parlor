import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { AppConfig } from '../electron/env'
import type { AiNoteInput } from '../electron/lib/note-ai-source'

vi.mock('../electron/lib/kimi', () => ({ chatNonStream: vi.fn() }))
vi.mock('../electron/lib/search', () => ({ searchWeb: vi.fn() }))
vi.mock('../electron/lib/credentials', () => ({ getSearchApiKey: vi.fn() }))

import { chatNonStream } from '../electron/lib/kimi'
import { searchWeb } from '../electron/lib/search'
import { getSearchApiKey } from '../electron/lib/credentials'
import { generateAiNoteBody } from '../electron/lib/note-ai-generation'

const config: AppConfig = { apiKey: 'kimi', baseUrl: 'https://kimi.test/v1', model: 'kimi-test', libraryPath: '/tmp/library' }
const input: AiNoteInput = {
  notePath: 'notes/test.md', title: '测试文章', sourceText: '全文事实与主论证', guideText: '导读结构', originalNote: '我关注概念边界',
  sourceIdentity: { type: 'blog', url: 'https://example.com/source' },
}
const validBody = `## 核心\n\n${'蒸馏核心思想'.repeat(160)}\n\n[W1-1]`
const defaultCoordinates = [
  { relation: '源流', claim: '策展关系一', contribution: '深化原文', sourceIds: ['W1-1'] },
  { relation: '对照', claim: '策展关系二', contribution: '修正理解', sourceIds: ['W2-1'] },
  { relation: '边界', claim: '策展关系三', contribution: '说明限制', sourceIds: ['W1-2'] },
]

type MockOptions = {
  round1Outputs?: string[]
  writeBodies?: string[]
  coordinates?: typeof defaultCoordinates
}

function mockSuccessfulPipeline(options: MockOptions = {}): void {
  let round1Index = 0
  let writeIndex = 0
  vi.mocked(chatNonStream).mockImplementation(async (_config, args) => {
    const prompt = args.messages[0]?.content ?? ''
    if (prompt.includes('第一轮：思想宽域定位')) {
      const outputs = options.round1Outputs ?? ['["theory origins", "adjacent critique"]']
      return outputs[Math.min(round1Index++, outputs.length - 1)]
    }
    if (prompt.includes('第二轮：思想脉络深钻')) return '["lineage deep dive", "framework boundaries"]'
    if (prompt.includes('资料策展')) return JSON.stringify(options.coordinates ?? defaultCoordinates)
    if (prompt.includes('笔记写作')) {
      const bodies = options.writeBodies ?? [validBody]
      return bodies[Math.min(writeIndex++, bodies.length - 1)]
    }
    throw new Error(`Unexpected prompt: ${prompt.slice(0, 80)}`)
  })
  vi.mocked(searchWeb).mockImplementation(async ({ query }) => [{
    title: `${query} source`, url: `https://example.com/${encodeURIComponent(query)}`, content: `仅供策展的完整原始摘要:${query}`,
  }])
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(getSearchApiKey).mockResolvedValue('tavily-key')
})

describe('AI 笔记两轮生成管线', () => {
  it('执行两轮多查询检索，写作只接收策展素材与紧凑来源表', async () => {
    mockSuccessfulPipeline()
    const stages: string[] = []

    const body = await generateAiNoteBody(config, input, stage => stages.push(stage))

    expect(body).toBe(validBody)
    expect(searchWeb).toHaveBeenCalledTimes(4)
    expect(stages).toEqual(['round1', 'round2', 'curating', 'writing'])
    const calls = vi.mocked(chatNonStream).mock.calls
    expect(calls).toHaveLength(4)
    const round2Prompt = calls[1][1].messages[0].content
    const writePrompt = calls[3][1].messages[0].content
    expect(round2Prompt).toContain('[W1-1]')
    expect(round2Prompt).toContain('仅供策展的完整原始摘要:theory origins')
    expect(writePrompt).toContain('策展关系二')
    expect(writePrompt).toContain('[W2-1]')
    expect(writePrompt).toContain('https://example.com/lineage%20deep%20dive')
    expect(writePrompt).not.toContain('仅供策展的完整原始摘要')
  })

  it('第二轮无独特增益时只策展首轮关系，不向写作堆入第二轮摘要', async () => {
    const coordinates = defaultCoordinates.map(item => ({ ...item, sourceIds: ['W1-1'] }))
    mockSuccessfulPipeline({ coordinates })

    await generateAiNoteBody(config, input, () => {})

    const writePrompt = vi.mocked(chatNonStream).mock.calls[3][1].messages[0].content
    expect(writePrompt).not.toContain('"W2-1"')
    expect(writePrompt).not.toContain('仅供策展的完整原始摘要:lineage deep dive')
  })

  it('容忍单查询失败，但整轮失败时不降级继续', async () => {
    mockSuccessfulPipeline({ coordinates: defaultCoordinates.map(item => ({ ...item, sourceIds: ['W1-1'] })) })
    vi.mocked(searchWeb).mockImplementation(async ({ query }) => {
      if (query === 'theory origins') throw new Error('single query failed')
      return [{ title: query, url: `https://example.com/${encodeURIComponent(query)}`, content: '摘要' }]
    })
    await expect(generateAiNoteBody(config, input, () => {})).resolves.toBe(validBody)
    expect(searchWeb).toHaveBeenCalledTimes(4)

    vi.clearAllMocks()
    vi.mocked(getSearchApiKey).mockResolvedValue('tavily-key')
    mockSuccessfulPipeline()
    vi.mocked(searchWeb).mockRejectedValue(new Error('round failed'))
    await expect(generateAiNoteBody(config, input, () => {})).rejects.toThrow('SEARCH_ROUND_FAILED')
    expect(chatNonStream).toHaveBeenCalledTimes(1)
  })

  it('缺少 Tavily key 时在模型规划前失败', async () => {
    vi.mocked(getSearchApiKey).mockResolvedValue(null)

    await expect(generateAiNoteBody(config, input, () => {})).rejects.toThrow('MISSING_API_KEY')
    expect(chatNonStream).not.toHaveBeenCalled()
    expect(searchWeb).not.toHaveBeenCalled()
  })

  it('规划 JSON 非法时重试一次', async () => {
    mockSuccessfulPipeline({ round1Outputs: ['not json', '["theory origins", "adjacent critique"]'] })

    await expect(generateAiNoteBody(config, input, () => {})).resolves.toBe(validBody)
    expect(chatNonStream).toHaveBeenCalledTimes(5)
  })

  it('长度越界只修订一次，合格则返回', async () => {
    mockSuccessfulPipeline({ writeBodies: ['太短', validBody] })

    await expect(generateAiNoteBody(config, input, () => {})).resolves.toBe(validBody)
    const calls = vi.mocked(chatNonStream).mock.calls
    expect(calls).toHaveLength(5)
    expect(calls[4][1].messages[0].content).toContain('针对性修订')
  })

  it('修订后仍越界则拒绝候选', async () => {
    mockSuccessfulPipeline({ writeBodies: ['太短', '仍然太短'] })

    await expect(generateAiNoteBody(config, input, () => {})).rejects.toThrow('NOTE_GENERATION_INVALID')
    expect(chatNonStream).toHaveBeenCalledTimes(5)
  })
})
