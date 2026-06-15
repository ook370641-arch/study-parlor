import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import {
  generateGroupInspiration,
  finalizeProgress,
  finalizeReview,
  generateFableFromReport,
  generateContinueSuggestions,
  readTopicReportSummaries
} from '@electron/lib/llm-tasks'

const cfg = { apiKey: 'k', baseUrl: 'https://x', model: 'm', libraryPath: '/' }
const profile = { name: '张三', profile_text: 'p', preferred_topics: ['a', 'b'] }

describe('finalizeProgress', () => {
  it('extracts title, body and progress_summary from XML response', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: '<title>拓扑入门</title>\n<body># 笔记\n核心...</body>\n<progress_summary>已掌握拓扑基础概念</progress_summary>' } }]
      })
    })) as any)
    const out = await finalizeProgress(cfg, [
      { role: 'user', content: '今夜想学:拓扑' },
      { role: 'assistant', content: '...' }
    ])
    expect(out.title).toBe('拓扑入门')
    expect(out.body).toMatch(/^# 笔记/)
    expect(out.progress_summary).toBe('已掌握拓扑基础概念')
  })

  it('extracts XML surrounded by extra text', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: '好的，这是归档内容：\n<title>前后文字</title>\n<body># B</body>\n<progress_summary>S</progress_summary>\n希望对您有帮助！' } }]
      })
    })) as any)
    const out = await finalizeProgress(cfg, [{ role: 'user', content: '今夜想学:拓扑' }])
    expect(out.title).toBe('前后文字')
    expect(out.body).toBe('# B')
    expect(out.progress_summary).toBe('S')
  })

  it('extracts XML with multiline body', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: '<title>多行标题</title>\n<description>副标题</description>\n<body># 诊断\n\n一段内容\n\n# 学习\n\n更多内容</body>\n<progress_summary>已掌握</progress_summary>' } }]
      })
    })) as any)
    const out = await finalizeProgress(cfg, [{ role: 'user', content: '今夜想学:拓扑' }])
    expect(out.title).toBe('多行标题')
    expect(out.description).toBe('副标题')
    expect(out.body).toBe('# 诊断\n\n一段内容\n\n# 学习\n\n更多内容')
    expect(out.progress_summary).toBe('已掌握')
  })

  it('falls back to deterministic title on parse failure', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true, json: async () => ({ choices: [{ message: { content: 'oops' } }] })
    })) as any)
    const out = await finalizeProgress(cfg, [{ role: 'user', content: '今夜想学:拓扑' }])
    expect(out.title).toBe('未命名笔记')
    expect(out.body).toContain('LLM 归档失败')
    expect(out.progress_summary).toBe('')
  })
})

describe('generateGroupInspiration', () => {
  it('parses valid JSON object', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: '{"topic":"MCP协议","hook":"你已熟悉各类AI工具..."}' } }]
      })
    })) as any)
    const out = await generateGroupInspiration(cfg, {
      groupName: 'AI Tools',
      topics: [{ dirName: 'claude-code', title: 'Claude Code' }],
      profile
    })
    expect(out.topic).toBe('MCP协议')
    expect(out.hook).toBe('你已熟悉各类AI工具...')
  })

  it('strips markdown code block before parsing', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: '```json\n{"topic":"X","hook":"hx"}\n```' } }]
      })
    })) as any)
    const out = await generateGroupInspiration(cfg, {
      groupName: 'G',
      topics: [{ dirName: 'a', title: 'A' }],
      profile
    })
    expect(out.topic).toBe('X')
    expect(out.hook).toBe('hx')
  })

  it('extracts JSON surrounded by extra text', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: '好的，我为您推荐：\n{"topic":"嵌套JSON","hook":"带前后文字"}\n希望对您有帮助！' } }]
      })
    })) as any)
    const out = await generateGroupInspiration(cfg, {
      groupName: 'G',
      topics: [{ dirName: 'a', title: 'A' }],
      profile
    })
    expect(out.topic).toBe('嵌套JSON')
    expect(out.hook).toBe('带前后文字')
  })

  it('throws on parse failure instead of fallback', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      json: async () => ({ choices: [{ message: { content: 'not json' } }] })
    })) as any)
    await expect(generateGroupInspiration(cfg, {
      groupName: 'TestGroup',
      topics: [],
      profile
    })).rejects.toThrow()
  })

  it('passes group data into prompt', async () => {
    const fetchSpy = vi.fn(async () => ({
      ok: true,
      json: async () => ({ choices: [{ message: { content: '{"topic":"T","hook":"h"}' } }] })
    }))
    vi.stubGlobal('fetch', fetchSpy as any)
    await generateGroupInspiration(cfg, {
      groupName: 'Philosophy',
      topics: [{ dirName: 'kant', title: '康德' }, { dirName: 'nietzsche', title: '尼采' }],
      profile
    })
    const body = JSON.parse((fetchSpy.mock.calls[0][1] as RequestInit).body as string)
    expect(body.messages[0].content).toContain('Philosophy')
    expect(body.messages[0].content).toContain('康德')
    expect(body.messages[0].content).toContain('尼采')
  })

  it('passes strategy to select prompt file', async () => {
    const fetchSpy = vi.fn(async () => ({
      ok: true,
      json: async () => ({ choices: [{ message: { content: '{"topic":"T","hook":"h"}' } }] })
    }))
    vi.stubGlobal('fetch', fetchSpy as any)
    await generateGroupInspiration(cfg, {
      groupName: 'AI PM',
      topics: [{ dirName: 'agent', title: 'Agent' }],
      profile,
      strategy: 'v3'
    })
    const body = JSON.parse((fetchSpy.mock.calls[0][1] as RequestInit).body as string)
    // The v3 prompt contains "缺口" which is not in v1 or v2
    expect(body.messages[0].content).toContain('缺口')
  })

  it('enables DeepSeek thinking with max effort', async () => {
    const fetchSpy = vi.fn(async () => ({
      ok: true,
      json: async () => ({ choices: [{ message: { content: '{"topic":"T","hook":"h"}' } }] })
    }))
    vi.stubGlobal('fetch', fetchSpy as any)
    await generateGroupInspiration({ ...cfg, model: 'deepseek-v4-pro' }, {
      groupName: 'AI PM',
      topics: [{ dirName: 'agent', title: 'Agent' }],
      profile
    })
    const body = JSON.parse((fetchSpy.mock.calls[0][1] as RequestInit).body as string)
    expect(body.thinking).toEqual({ type: 'enabled' })
    expect(body.reasoning_effort).toBe('max')
  })
})

describe('finalizeReview', () => {
  it('returns summary and gaps from XML response', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: '<summary>本次复习暴露 σ 代数概念混淆。</summary>\n<gap>σ 代数</gap>\n<gap>测度论基础</gap>' } }]
      })
    })) as any)
    const out = await finalizeReview(cfg, {
      history: [{ role: 'assistant', content: 'q' }],
      existingBody: 'note body'
    })
    expect(out.summary).toBe('本次复习暴露 σ 代数概念混淆。')
    expect(out.gaps).toEqual(['σ 代数', '测度论基础'])
  })

  it('returns empty gaps on non-XML response', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      json: async () => ({ choices: [{ message: { content: '本次复习暴露 σ 代数概念混淆。' } }] })
    })) as any)
    const out = await finalizeReview(cfg, {
      history: [{ role: 'assistant', content: 'q' }],
      existingBody: 'note body'
    })
    expect(out.summary).toBe('本次复习暴露 σ 代数概念混淆。')
    expect(out.gaps).toEqual([])
  })
})

describe('generateFableFromReport', () => {
  it('parses valid JSON response with title and body', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: '{"title":"熵增的旅人","body":"从前有一个旅人...\\n\\n---\\n\\n这个故事中的旅人代表了系统中能量的流动..."}' } }]
      })
    })) as any)
    const out = await generateFableFromReport(cfg, {
      reportBody: '# 学习报告\n\n今天我们学习了熵增原理...',
      topic: '熵增原理'
    })
    expect(out.title).toBe('熵增的旅人')
    expect(out.body).toContain('从前有一个旅人')
    expect(out.body).toContain('这个故事中的旅人')
  })

  it('strips markdown code block before parsing', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: '```json\n{"title":"代码块标题","body":"# B"}\n```' } }]
      })
    })) as any)
    const out = await generateFableFromReport(cfg, {
      reportBody: 'report',
      topic: 'topic'
    })
    expect(out.title).toBe('代码块标题')
    expect(out.body).toBe('# B')
  })

  it('falls back to deterministic title on parse failure', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      json: async () => ({ choices: [{ message: { content: 'oops' } }] })
    })) as any)
    const out = await generateFableFromReport(cfg, {
      reportBody: 'report body',
      topic: '测试主题'
    })
    expect(out.title).toBe('测试主题 — 寓言')
    expect(out.body).toContain('report body')
  })

  it('passes reportBody and topic into prompt', async () => {
    const fetchSpy = vi.fn(async () => ({
      ok: true,
      json: async () => ({ choices: [{ message: { content: '{"title":"T","body":"B"}' } }] })
    }))
    vi.stubGlobal('fetch', fetchSpy as any)
    await generateFableFromReport(cfg, {
      reportBody: '这是学习报告的内容',
      topic: '贝叶斯推断'
    })
    const body = JSON.parse((fetchSpy.mock.calls[0][1] as RequestInit).body as string)
    expect(body.messages[0].content).toContain('这是学习报告的内容')
    expect(body.messages[0].content).toContain('贝叶斯推断')
  })
})

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

describe('readTopicReportSummaries', () => {
  let tmpDir: string

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'llm-tasks-test-'))
  })

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  it('reads report summaries from topic directory', () => {
    const topicDir = path.join(tmpDir, 'topic-a')
    const sessionDir = path.join(topicDir, 's1')
    fs.mkdirSync(sessionDir, { recursive: true })
    fs.writeFileSync(
      path.join(sessionDir, '学习报告.md'),
      '---\nprogress_summary: 已掌握基础\n---\n\n# 笔记\n内容',
      'utf8'
    )

    const out = readTopicReportSummaries(tmpDir, 'topic-a')
    expect(out).toEqual(['已掌握基础'])
  })

  it('returns empty array when no reports', () => {
    const topicDir = path.join(tmpDir, 'empty-topic')
    fs.mkdirSync(topicDir, { recursive: true })

    const out = readTopicReportSummaries(tmpDir, 'empty-topic')
    expect(out).toEqual([])
  })
})

describe('generateContinueSuggestions', () => {
  it('parses valid JSON response', async () => {
    const mod = await import('@electron/lib/llm-tasks')
    const summariesSpy = vi.spyOn(mod, 'readTopicReportSummaries')
      .mockReturnValue(['已掌握拓扑基础概念'])

    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: '[{"title":"深入同伦论","context":"已掌握拓扑基础","rationale":"下一步探索连续形变","benefit":"建立几何直觉"}]' } }]
      })
    })) as any)

    const out = await generateContinueSuggestions(cfg, { topic: '拓扑学', dirName: '拓扑学' })
    expect(out).toHaveLength(1)
    expect(out[0].title).toBe('深入同伦论')

    summariesSpy.mockRestore()
  })

  it('returns empty array on invalid JSON', async () => {
    const mod = await import('@electron/lib/llm-tasks')
    const summariesSpy = vi.spyOn(mod, 'readTopicReportSummaries')
      .mockReturnValue(['已掌握拓扑基础概念'])

    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      json: async () => ({ choices: [{ message: { content: 'not json at all' } }] })
    })) as any)

    const out = await generateContinueSuggestions(cfg, { topic: '拓扑学', dirName: '拓扑学' })
    expect(out).toEqual([])

    summariesSpy.mockRestore()
  })

  it('filters out items missing title', async () => {
    const mod = await import('@electron/lib/llm-tasks')
    const summariesSpy = vi.spyOn(mod, 'readTopicReportSummaries')
      .mockReturnValue(['已掌握拓扑基础概念'])

    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: '[{"title":"有效项","context":"现状","rationale":"理由","benefit":"收益"},{"title":"","context":"","rationale":"","benefit":""},{"context":"无标题","rationale":"","benefit":""},{"title":"","context":"","rationale":"","benefit":""},{"title":"另一有效项","context":"现状","rationale":"理由","benefit":"收益"}]' } }]
      })
    })) as any)

    const out = await generateContinueSuggestions(cfg, { topic: '拓扑学', dirName: '拓扑学' })
    expect(out).toHaveLength(2)
    expect(out[0].title).toBe('有效项')
    expect(out[1].title).toBe('另一有效项')

    summariesSpy.mockRestore()
  })

  it('enables DeepSeek thinking with max effort', async () => {
    const mod = await import('@electron/lib/llm-tasks')
    const summariesSpy = vi.spyOn(mod, 'readTopicReportSummaries')
      .mockReturnValue(['已掌握拓扑基础概念'])

    const fetchSpy = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: '[]' } }]
      })
    }))
    vi.stubGlobal('fetch', fetchSpy as any)

    await generateContinueSuggestions({ ...cfg, model: 'deepseek-v4-pro' }, { topic: '拓扑学', dirName: '拓扑学' })
    const body = JSON.parse((fetchSpy.mock.calls[0][1] as RequestInit).body as string)
    expect(body.thinking).toEqual({ type: 'enabled' })
    expect(body.reasoning_effort).toBe('max')

    summariesSpy.mockRestore()
  })
})
