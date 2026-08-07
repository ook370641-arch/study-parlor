import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../electron/lib/kimi', () => ({
  chatNonStream: vi.fn(),
  chatStream: vi.fn(),
}))
vi.mock('../../electron/lib/search', () => ({ searchWeb: vi.fn() }))
vi.mock('../../electron/lib/credentials', () => ({ getSearchApiKey: vi.fn() }))

import { chatNonStream, chatStream } from '../../electron/lib/kimi'
import { searchWeb } from '../../electron/lib/search'
import { getSearchApiKey } from '../../electron/lib/credentials'
import { runDigestGuideV2, runBlogGuideV2 } from '../../electron/lib/guide-v2-pipeline'
import type { AppConfig } from '../../electron/env'

const CFG = { libraryPath: '/tmp' } as unknown as AppConfig
const ARTICLE = '## 一\nx\n\n## 二\ny'
const VALID_GUIDE = JSON.stringify({
  background: 'bg',
  chunks: [
    { heading: '一', context: 'c1', terms: [] },
    { heading: '二', context: 'c2', terms: [] },
  ],
})
const ARGS = { system: 'sys', articleContent: ARTICLE, entriesTotal: 2 }

function mockStreamOnce() {
  vi.mocked(chatStream).mockImplementation(async (_c, _a, onChunk) => {
    onChunk(VALID_GUIDE)
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(getSearchApiKey).mockResolvedValue('test-key')
  mockStreamOnce()
})

describe('runDigestGuideV2 编排', () => {
  it('规划两次畸形 JSON → 重试 1 次后降级无搜索照常生成', async () => {
    vi.mocked(chatNonStream).mockResolvedValue('not json at all')
    const guide = await runDigestGuideV2(CFG, ARGS, () => {})
    expect(vi.mocked(chatNonStream).mock.calls.length).toBe(2)
    expect(searchWeb).not.toHaveBeenCalled()
    expect(guide.chunks).toHaveLength(2)
    const userContent = vi.mocked(chatStream).mock.calls[0][1].messages[1].content as string
    expect(userContent).toContain('无外部资料')
  })

  it('单查询失败仅置空对应条目的资料夹', async () => {
    vi.mocked(chatNonStream).mockResolvedValue(JSON.stringify({
      queries: [
        { query: 'q1', entries: [1], reason: 'r' },
        { query: 'q2', entries: [2], reason: 'r' },
      ],
    }))
    vi.mocked(searchWeb)
      .mockRejectedValueOnce(new Error('timeout'))
      .mockResolvedValueOnce([{ title: 't', url: 'u', content: 'snippet' }] as never)
    await runDigestGuideV2(CFG, ARGS, () => {})
    expect(searchWeb).toHaveBeenCalledTimes(2)
    const userContent = vi.mocked(chatStream).mock.calls[0][1].messages[1].content as string
    expect(userContent).toContain('无外部资料')
    expect(userContent).toContain('snippet')
  })

  it('无 API key 时全部资料夹为空照常产出', async () => {
    vi.mocked(getSearchApiKey).mockResolvedValue(null as never)
    vi.mocked(chatNonStream).mockResolvedValue(JSON.stringify({
      queries: [{ query: 'q1', entries: [1], reason: 'r' }],
    }))
    const guide = await runDigestGuideV2(CFG, ARGS, () => {})
    expect(searchWeb).not.toHaveBeenCalled()
    expect(guide.chunks).toHaveLength(2)
  })
})

const VALID_BLOG_GUIDE = JSON.stringify({
  background: 'bg',
  chunks: [
    { heading: '一', summary: '第一章总结', terms: [] },
    { heading: '二', summary: '第二章总结', terms: [] },
  ],
})

describe('runBlogGuideV2 编排', () => {
  beforeEach(() => {
    vi.mocked(chatStream).mockImplementation(async (_c, _a, onChunk) => {
      onChunk(VALID_BLOG_GUIDE)
    })
  })

  it('产出 summary 形状的博客导读', async () => {
    vi.mocked(chatNonStream).mockResolvedValue('not json at all')
    const guide = await runBlogGuideV2(CFG, ARGS, () => {})
    expect(guide.chunks).toHaveLength(2)
    expect(guide.chunks[0].summary).toBe('第一章总结')
  })

  it('规划两次畸形 JSON → 重试 1 次后降级无搜索照常生成', async () => {
    vi.mocked(chatNonStream).mockResolvedValue('not json at all')
    await runBlogGuideV2(CFG, ARGS, () => {})
    expect(vi.mocked(chatNonStream).mock.calls.length).toBe(2)
    expect(searchWeb).not.toHaveBeenCalled()
    const userContent = vi.mocked(chatStream).mock.calls[0][1].messages[1].content as string
    expect(userContent).toContain('无外部资料')
  })

  it('digest context 形状在博客管线被判非法 → GUIDE_JSON_ERROR', async () => {
    vi.mocked(chatStream).mockImplementation(async (_c, _a, onChunk) => {
      onChunk(VALID_GUIDE) // digest 形状（context 而非 summary）
    })
    await expect(runBlogGuideV2(CFG, ARGS, () => {})).rejects.toMatchObject({ code: 'GUIDE_JSON_ERROR' })
  })
})
