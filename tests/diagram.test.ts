import { describe, expect, it, vi } from 'vitest'
import { generateDiagram } from '@electron/lib/diagram'

const cfg = { apiKey: 'k', baseUrl: 'https://x', model: 'm', libraryPath: '/' }

describe('generateDiagram', () => {
  it('returns undefined when report body is empty', async () => {
    const out = await generateDiagram(cfg, '')
    expect(out).toBeUndefined()
  })

  it('returns undefined when report body is too short (< 50 chars)', async () => {
    const out = await generateDiagram(cfg, 'short text')
    expect(out).toBeUndefined()
  })

  it('returns undefined on API failure', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: false,
      status: 500
    })) as any)

    const out = await generateDiagram(cfg, 'a'.repeat(100))
    expect(out).toBeUndefined()
  })

  it('returns mermaid string on valid JSON response', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: '{"chartType":"flow","title":"测试","rationale":"理由","svg":"<svg><text>flowchart</text></svg>"}' } }]
      })
    })) as any)

    const out = await generateDiagram(cfg, 'a'.repeat(100))
    expect(out).toBe('<svg><text>flowchart</text></svg>')
  })

  it('strips markdown code block before parsing', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: '```json\n{"chartType":"mindmap","title":"代码块","rationale":"r","svg":"<svg><text>mindmap</text></svg>"}\n```' } }]
      })
    })) as any)

    const out = await generateDiagram(cfg, 'a'.repeat(100))
    expect(out).toBe('<svg><text>mindmap</text></svg>')
  })

  it('returns undefined when response lacks mermaid field', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: '{"chartType":"flow","title":"测试","rationale":"理由"}' } }]
      })
    })) as any)

    const out = await generateDiagram(cfg, 'a'.repeat(100))
    expect(out).toBeUndefined()
  })

  it('returns undefined when mermaid is empty string', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: '{"chartType":"flow","title":"测试","rationale":"理由","mermaid":""}' } }]
      })
    })) as any)

    const out = await generateDiagram(cfg, 'a'.repeat(100))
    expect(out).toBeUndefined()
  })

  it('passes temperature 0.3 to API', async () => {
    const fetchSpy = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: '{"mermaid":"A"}' } }]
      })
    }))
    vi.stubGlobal('fetch', fetchSpy as any)

    await generateDiagram(cfg, 'a'.repeat(100))
    const body = JSON.parse((fetchSpy.mock.calls[0][1] as RequestInit).body as string)
    expect(body.temperature).toBe(0.3)
  })
})
