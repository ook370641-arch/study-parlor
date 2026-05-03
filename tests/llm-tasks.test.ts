import { describe, expect, it, vi } from 'vitest'
import {
  generateInspirations,
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
  it('extracts title and body from JSON response', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: '{"title":"拓扑入门","body":"# 笔记\\n核心..."}' } }]
      })
    })) as any)
    const out = await finalizeProgress(cfg, [
      { role: 'user', content: '今夜想学:拓扑' },
      { role: 'assistant', content: '...' }
    ])
    expect(out.title).toBe('拓扑入门')
    expect(out.body).toMatch(/^# 笔记/)
  })

  it('falls back to deterministic title on parse failure', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true, json: async () => ({ choices: [{ message: { content: 'oops' } }] })
    })) as any)
    const out = await finalizeProgress(cfg, [{ role: 'user', content: '今夜想学:拓扑' }])
    expect(out.title).toBe('未命名笔记')
    expect(out.body).toContain('LLM 归档失败')
  })
})

describe('finalizeReview', () => {
  it('returns the raw text response trimmed', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      json: async () => ({ choices: [{ message: { content: '\n本次复习暴露 σ 代数概念混淆。  ' } }] })
    })) as any)
    const out = await finalizeReview(cfg, {
      history: [{ role: 'assistant', content: 'q' }],
      existingBody: 'note body'
    })
    expect(out).toBe('本次复习暴露 σ 代数概念混淆。')
  })
})
