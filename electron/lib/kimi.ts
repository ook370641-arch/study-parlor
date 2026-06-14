import type { AppConfig } from '../env'
import type { Message } from '@shared/index'

export async function probeModelWithCredentials(
  creds: { apiKey: string; baseUrl: string; model: string }
): Promise<{ ok: boolean; reason?: string }> {
  const res = await fetch(`${creds.baseUrl}/models`, {
    headers: {
      Authorization: `Bearer ${creds.apiKey}`,
      'User-Agent': 'claude-code/0.1.0'
    }
  } as any)
  if (!res.ok) return { ok: false, reason: `HTTP ${res.status}` }
  return { ok: true }
}

export async function probeModel(cfg: AppConfig): Promise<{ ok: boolean; reason?: string }> {
  return probeModelWithCredentials(cfg)
}

export async function chatNonStream(
  cfg: AppConfig,
  args: { messages: Message[]; temperature: number }
): Promise<string> {
  const res = await fetch(`${cfg.baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${cfg.apiKey}`,
      'Content-Type': 'application/json',
      'User-Agent': 'claude-code/0.1.0'
    },
    body: JSON.stringify({
      model: cfg.model,
      stream: false,
      temperature: args.temperature,
      max_tokens: 16384,
      messages: args.messages,
      thinking: { type: 'disabled' }
    })
  } as any)
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    console.error('[kimi] chatNonStream HTTP error:', res.status, body.slice(0, 500))
    throw new Error(`Kimi non-stream HTTP ${res.status}: ${body.slice(0, 200)}`)
  }
  const json = await res.json() as { choices: { message: { content: string } }[] }
  const content = json.choices[0]?.message?.content ?? ''
  if (!content) throw new Error('Kimi returned empty content')
  return content
}

export type SseEvent =
  | { kind: 'chunk'; text: string }
  | { kind: 'done' }
  | { kind: 'noop' }

export function parseSseChunk(line: string): SseEvent {
  const trimmed = line.trim()
  if (!trimmed.startsWith('data:')) return { kind: 'noop' }
  const payload = trimmed.slice(5).trim()
  if (payload === '[DONE]') return { kind: 'done' }
  try {
    const json = JSON.parse(payload) as { choices?: { delta?: { content?: string } }[] }
    const text = json.choices?.[0]?.delta?.content ?? ''
    return { kind: 'chunk', text }
  } catch {
    return { kind: 'noop' }
  }
}

export async function chatStream(
  cfg: AppConfig,
  args: { messages: Message[]; temperature: number; signal: AbortSignal },
  onChunk: (text: string) => void
): Promise<void> {
  const TIMEOUT_MS = 120_000
  const internalCtl = new AbortController()
  let timedOut = false

  const onAbort = () => internalCtl.abort()
  args.signal.addEventListener('abort', onAbort, { once: true })

  const timeoutId = setTimeout(() => {
    timedOut = true
    internalCtl.abort()
  }, TIMEOUT_MS)

  try {
    const res = await fetch(`${cfg.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${cfg.apiKey}`,
        'Content-Type': 'application/json',
        'User-Agent': 'claude-code/0.1.0'
      },
      body: JSON.stringify({
        model: cfg.model,
        stream: true,
        temperature: args.temperature,
        messages: args.messages,
        thinking: { type: 'disabled' }
      }),
      signal: internalCtl.signal
    } as any)
    if (res.status === 429) {
      const e: any = new Error('Rate limited')
      e.code = 'RATE_LIMIT'
      throw e
    }
    if (!res.ok || !res.body) {
      const body = await res.text().catch(() => '')
      console.error('[kimi] chatStream HTTP error:', res.status, body.slice(0, 500))
      const e: any = new Error(`HTTP ${res.status}: ${body.slice(0, 200)}`)
      e.code = res.status === 401 ? 'UNAUTHORIZED' : 'STREAM_FAIL'
      throw e
    }

    clearTimeout(timeoutId)

    const reader = res.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''

    while (true) {
      let timeoutId: ReturnType<typeof setTimeout> | null = null
      let removeAbortListener: (() => void) | null = null

      const timeoutPromise = new Promise((_resolve: (_: never) => void, reject) => {
        timeoutId = setTimeout(() => {
          reader.cancel().catch(() => {})
          const err = new Error(`SSE idle timeout after ${TIMEOUT_MS}ms`)
          ;(err as any).code = 'TIMEOUT'
          reject(err)
        }, TIMEOUT_MS)
        const cleanup = () => { if (timeoutId) { clearTimeout(timeoutId); timeoutId = null } }
        args.signal.addEventListener('abort', cleanup, { once: true })
        removeAbortListener = () => args.signal.removeEventListener('abort', cleanup)
      })

      let done: boolean
      let value: Uint8Array | undefined
      try {
        const result = await Promise.race([
          reader.read(),
          timeoutPromise
        ]) as ReadableStreamReadResult<Uint8Array>
        done = result.done
        value = result.value
      } finally {
        if (timeoutId) clearTimeout(timeoutId)
        const cleanup = removeAbortListener as unknown as (() => void) | null
        if (cleanup) cleanup()
      }
      if (done) break
      buffer += decoder.decode(value, { stream: true })

      let idx
      while ((idx = buffer.indexOf('\n')) !== -1) {
        const line = buffer.slice(0, idx)
        buffer = buffer.slice(idx + 1)
        const ev = parseSseChunk(line)
        if (ev.kind === 'chunk') onChunk(ev.text)
        if (ev.kind === 'done') return
      }
    }
  } catch (err: any) {
    if (err?.code === 'TIMEOUT' || (err?.name === 'AbortError' && timedOut)) {
      const e: any = new Error(`Request timeout after ${TIMEOUT_MS}ms`)
      e.code = 'TIMEOUT'
      throw e
    }
    throw err
  } finally {
    clearTimeout(timeoutId)
    args.signal.removeEventListener('abort', onAbort)
  }
}
