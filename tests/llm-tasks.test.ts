import { describe, expect, it, vi } from 'vitest'
import {
  generateInspirations,
  generateGroupInspiration,
  finalizeProgress,
  finalizeReview
} from '@electron/lib/llm-tasks'

const cfg = { apiKey: 'k', baseUrl: 'https://x', model: 'm', libraryPath: '/' }
const profile = { name: '张三', profile_text: 'p', preferred_topics: ['a', 'b'] }

describe('generateInspirations', () => {
  it('parses valid JSON array', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: '[{"topic":"X","hook":"hx"},{"topic":"Y","hook":"hy"}]' } }]
      })
    })) as any)
    const out = await generateInspirations(cfg, { profile, existingTitles: ['a.md'] })
    expect(out).toHaveLength(2)
    expect(out[0].topic).toBe('X')
  })

  it('returns empty array on parse failure (graceful)', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      json: async () => ({ choices: [{ message: { content: 'not json at all' } }] })
    })) as any)
    const out = await generateInspirations(cfg, { profile, existingTitles: [] })
    expect(out).toEqual([])
  })

  it('passes existingTitles into prompt', async () => {
    const fetchSpy = vi.fn(async () => ({
      ok: true, json: async () => ({ choices: [{ message: { content: '[]' } }] })
    }))
    vi.stubGlobal('fetch', fetchSpy as any)
    await generateInspirations(cfg, { profile, existingTitles: ['拓扑学基础', '贝叶斯入门'] })
    const body = JSON.parse((fetchSpy.mock.calls[0][1] as RequestInit).body as string)
    expect(body.messages[0].content).toContain('拓扑学基础')
    expect(body.messages[0].content).toContain('贝叶斯入门')
  })
})

describe('finalizeProgress', () => {
  it('extracts title, body and progress_summary from JSON response', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: '{"title":"拓扑入门","body":"# 笔记\\n核心...","progress_summary":"已掌握拓扑基础概念"}' } }]
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

  it('strips markdown code block before parsing', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: '```json\n{"title":"代码块标题","body":"# B","progress_summary":"S"}\n```' } }]
      })
    })) as any)
    const out = await finalizeProgress(cfg, [{ role: 'user', content: '今夜想学:拓扑' }])
    expect(out.title).toBe('代码块标题')
    expect(out.body).toBe('# B')
    expect(out.progress_summary).toBe('S')
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
})

describe('finalizeReview', () => {
  it('returns summary and gaps from JSON response', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      json: async () => ({ choices: [{ message: { content: '{"summary":"本次复习暴露 σ 代数概念混淆。","gaps":["σ 代数","测度论基础"]}' } }] })
    })) as any)
    const out = await finalizeReview(cfg, {
      history: [{ role: 'assistant', content: 'q' }],
      existingBody: 'note body'
    })
    expect(out.summary).toBe('本次复习暴露 σ 代数概念混淆。')
    expect(out.gaps).toEqual(['σ 代数', '测度论基础'])
  })

  it('returns empty gaps on non-JSON response', async () => {
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
