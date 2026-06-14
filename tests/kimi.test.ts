import { describe, expect, it, vi, beforeEach } from 'vitest'
import { probeModel, chatNonStream, parseSseChunk } from '@electron/lib/kimi'

const cfg = {
  apiKey: 'sk-test',
  baseUrl: 'https://api.kimi.com/coding/v1',
  model: 'kimi-k2.6',
  libraryPath: '/'
}

describe('probeModel', () => {
  beforeEach(() => { vi.restoreAllMocks() })

  it('returns ok=true on HTTP 200', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      json: async () => ({ data: [{ id: 'kimi-k2.6' }, { id: 'kimi-other' }] })
    })) as any)
    const r = await probeModel(cfg)
    expect(r.ok).toBe(true)
  })

  it('returns ok=true even when configured model is missing from /v1/models list', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      json: async () => ({ data: [{ id: 'kimi-other' }] })
    })) as any)
    const r = await probeModel(cfg)
    expect(r.ok).toBe(true)
  })

  it('returns ok=false with HTTP reason on non-2xx', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: false,
      status: 401,
      json: async () => ({})
    })) as any)
    const r = await probeModel(cfg)
    expect(r.ok).toBe(false)
    expect(r.reason).toMatch(/401/)
  })

  it('uses Bearer auth header', async () => {
    const fetchSpy = vi.fn(async () => ({ ok: true, json: async () => ({ data: [{ id: 'kimi-k2.6' }] }) }))
    vi.stubGlobal('fetch', fetchSpy as any)
    await probeModel(cfg)
    const headers = (fetchSpy.mock.calls[0][1] as RequestInit).headers as Record<string, string>
    expect(headers.Authorization).toBe('Bearer sk-test')
  })
})

describe('chatNonStream', () => {
  it('posts to chat/completions with stream:false', async () => {
    const fetchSpy = vi.fn(async () => ({
      ok: true,
      json: async () => ({ choices: [{ message: { content: 'hi' } }] })
    }))
    vi.stubGlobal('fetch', fetchSpy as any)

    const r = await chatNonStream(cfg, {
      messages: [{ role: 'user', content: 'q' }],
      temperature: 0.3
    })
    expect(r).toBe('hi')

    const url = fetchSpy.mock.calls[0][0] as string
    expect(url).toBe('https://api.kimi.com/coding/v1/chat/completions')
    const body = JSON.parse((fetchSpy.mock.calls[0][1] as RequestInit).body as string)
    expect(body.stream).toBe(false)
    expect(body.model).toBe('kimi-k2.6')
    expect(body.temperature).toBe(0.6)
  })

  it('keeps temperature for non-kimi models', async () => {
    const fetchSpy = vi.fn(async () => ({
      ok: true,
      json: async () => ({ choices: [{ message: { content: 'hi' } }] })
    }))
    vi.stubGlobal('fetch', fetchSpy as any)

    await chatNonStream({ ...cfg, model: 'deepseek-chat' }, {
      messages: [{ role: 'user', content: 'q' }],
      temperature: 0.7
    })

    const body = JSON.parse((fetchSpy.mock.calls[0][1] as RequestInit).body as string)
    expect(body.temperature).toBe(0.7)
  })
})

describe('parseSseChunk', () => {
  it('extracts delta content from data line', () => {
    const out = parseSseChunk('data: {"choices":[{"delta":{"content":"你好"}}]}\n')
    expect(out).toEqual({ kind: 'chunk', text: '你好' })
  })

  it('detects [DONE]', () => {
    expect(parseSseChunk('data: [DONE]\n')).toEqual({ kind: 'done' })
  })

  it('ignores empty / non-data lines', () => {
    expect(parseSseChunk(': keepalive\n')).toEqual({ kind: 'noop' })
    expect(parseSseChunk('\n')).toEqual({ kind: 'noop' })
  })
})
