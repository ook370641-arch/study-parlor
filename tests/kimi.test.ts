import { describe, expect, it, vi, beforeEach } from 'vitest'
import { probeModel, chatNonStream, chatStream, parseSseChunk, buildChatBody } from '@electron/lib/kimi'

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
    expect(body.thinking).toEqual({ type: 'disabled' })
  })

  it('respects enabled thinking for Kimi models', async () => {
    const fetchSpy = vi.fn(async () => ({
      ok: true,
      json: async () => ({ choices: [{ message: { content: 'hi' } }] })
    }))
    vi.stubGlobal('fetch', fetchSpy as any)

    await chatNonStream(cfg, {
      messages: [{ role: 'user', content: 'q' }],
      temperature: 0.5,
      thinking: { type: 'enabled', reasoning_effort: 'high' }
    })

    const body = JSON.parse((fetchSpy.mock.calls[0][1] as RequestInit).body as string)
    expect(body.thinking).toEqual({ type: 'enabled' })
    expect(body.reasoning_effort).toBe('high')
    expect(body.temperature).toBe(0.5)
  })

  it('aborts when external signal is triggered', async () => {
    const fetchSpy = vi.fn(async (_url, init) => {
      await new Promise((_resolve, reject) => {
        init.signal?.addEventListener('abort', () => reject(new Error('AbortError')))
      })
      return { ok: true, json: async () => ({ choices: [{ message: { content: 'hi' } }] }) }
    })
    vi.stubGlobal('fetch', fetchSpy as any)

    const ctl = new AbortController()
    const promise = chatNonStream(cfg, {
      messages: [{ role: 'user', content: 'q' }],
      temperature: 0.3,
      signal: ctl.signal
    })
    ctl.abort()

    await expect(promise).rejects.toThrow('AbortError')
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

  it('disables thinking for DeepSeek by default', async () => {
    const fetchSpy = vi.fn(async () => ({
      ok: true,
      json: async () => ({ choices: [{ message: { content: 'hi' } }] })
    }))
    vi.stubGlobal('fetch', fetchSpy as any)

    await chatNonStream({ ...cfg, baseUrl: 'https://api.deepseek.com/v1', model: 'deepseek-v4-pro' }, {
      messages: [{ role: 'user', content: 'q' }],
      temperature: 0.7
    })

    const body = JSON.parse((fetchSpy.mock.calls[0][1] as RequestInit).body as string)
    expect(body.thinking).toEqual({ type: 'disabled' })
    expect(body.reasoning_effort).toBeUndefined()
    expect(body.temperature).toBe(0.7)
  })

  it('enables DeepSeek thinking with high effort when requested', async () => {
    const fetchSpy = vi.fn(async () => ({
      ok: true,
      json: async () => ({ choices: [{ message: { content: 'hi' } }] })
    }))
    vi.stubGlobal('fetch', fetchSpy as any)

    await chatNonStream({ ...cfg, baseUrl: 'https://api.deepseek.com/v1', model: 'deepseek-v4-pro' }, {
      messages: [{ role: 'user', content: 'q' }],
      temperature: 0.3,
      thinking: { type: 'enabled', reasoning_effort: 'high' }
    } as any)

    const body = JSON.parse((fetchSpy.mock.calls[0][1] as RequestInit).body as string)
    expect(body.thinking).toEqual({ type: 'enabled' })
    expect(body.reasoning_effort).toBe('high')
    expect(body.temperature).toBe(0.3)
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

describe('parseSseChunk reasoning', () => {
  it('parses reasoning_content delta into a reasoning event', () => {
    const line = 'data: {"choices":[{"delta":{"reasoning_content":"让我想想"}}]}'
    expect(parseSseChunk(line)).toEqual({ kind: 'reasoning', text: '让我想想' })
  })

  it('still parses content delta into a chunk event', () => {
    const line = 'data: {"choices":[{"delta":{"content":"你好"}}]}'
    expect(parseSseChunk(line)).toEqual({ kind: 'chunk', text: '你好' })
  })

  it('carries content alongside reasoning when both fields present in same delta', () => {
    const line = 'data: {"choices":[{"delta":{"reasoning_content":"思考","content":"回答"}}]}'
    expect(parseSseChunk(line)).toEqual({ kind: 'reasoning', text: '思考', content: '回答' })
  })

  it('ignores [DONE] and malformed lines', () => {
    expect(parseSseChunk('data: [DONE]')).toEqual({ kind: 'done' })
    expect(parseSseChunk('data: {not json')).toEqual({ kind: 'noop' })
  })
})

describe('chatStream reasoning dispatch', () => {
  function sseBody(lines: string[]): ReadableStream<Uint8Array> {
    const encoder = new TextEncoder()
    return new ReadableStream<Uint8Array>({
      start(controller) {
        for (const l of lines) controller.enqueue(encoder.encode(l + '\n'))
        controller.close()
      },
    })
  }

  it('dispatches each reasoning delta exactly once', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      status: 200,
      body: sseBody([
        'data: {"choices":[{"delta":{"reasoning_content":"先想"}}]}',
        'data: {"choices":[{"delta":{"reasoning_content":"再想"}}]}',
        'data: {"choices":[{"delta":{"content":"答"}}]}',
        'data: [DONE]',
      ]),
    })) as any)

    const reasoning: string[] = []
    const chunks: string[] = []
    await chatStream(
      cfg,
      { messages: [{ role: 'user', content: 'q' }], temperature: 0.7, signal: new AbortController().signal },
      (t) => chunks.push(t),
      (t) => reasoning.push(t),
    )
    expect(reasoning).toEqual(['先想', '再想'])
    expect(chunks.join('')).toBe('答')
  })
})

describe('buildChatBody deepseek effort', () => {
  const dsCfg = { apiKey: 'sk-test', baseUrl: 'https://api.deepseek.com', model: 'deepseek-v4-pro', libraryPath: '/' }
  const msgs = [{ role: 'user' as const, content: 'hi' }]

  it('off → thinking disabled, no reasoning_effort', () => {
    const body = buildChatBody(dsCfg, { messages: msgs, temperature: 0.7, stream: true, thinking: { type: 'disabled' } })
    expect(body.thinking).toEqual({ type: 'disabled' })
    expect(body.reasoning_effort).toBeUndefined()
  })

  it('high → enabled + reasoning_effort high', () => {
    const body = buildChatBody(dsCfg, { messages: msgs, temperature: 0.7, stream: true, thinking: { type: 'enabled', reasoning_effort: 'high' } })
    expect(body.thinking).toEqual({ type: 'enabled' })
    expect(body.reasoning_effort).toBe('high')
  })

  it('max → enabled + reasoning_effort max', () => {
    const body = buildChatBody(dsCfg, { messages: msgs, temperature: 0.7, stream: true, thinking: { type: 'enabled', reasoning_effort: 'max' } })
    expect(body.reasoning_effort).toBe('max')
  })

  it('omitting thinking defaults to disabled', () => {
    const body = buildChatBody(dsCfg, { messages: msgs, temperature: 0.7, stream: true })
    expect(body.thinking).toEqual({ type: 'disabled' })
  })
})
