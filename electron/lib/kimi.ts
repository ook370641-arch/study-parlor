import type { AppConfig } from '../env'
import type { Message } from '@shared/index'

export type ToolDef = { type: 'function'; function: { name: string; description: string; parameters: Record<string, unknown> } }
export type NativeToolCallRaw = { id?: string; name?: string; arguments?: string }
export type ChatStreamResult = { content: string; toolCalls: NativeToolCallRaw[]; finishReason: string | null }

export async function probeModelWithCredentials(
  creds: { apiKey: string; baseUrl: string; model: string }
): Promise<{ ok: boolean; reason?: string }> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 10000)
  try {
    const res = await fetch(`${creds.baseUrl}/models`, {
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${creds.apiKey}`,
        'User-Agent': 'claude-code/0.1.0'
      }
    } as any)
    if (!res.ok) return { ok: false, reason: `HTTP ${res.status}` }
    return { ok: true }
  } catch (err: any) {
    return { ok: false, reason: err.name === 'AbortError' ? 'probe timeout' : err.message }
  } finally {
    clearTimeout(timeout)
  }
}

export async function probeModel(cfg: AppConfig): Promise<{ ok: boolean; reason?: string }> {
  return probeModelWithCredentials(cfg)
}

export type ThinkingConfig =
  | { type: 'enabled'; reasoning_effort?: 'high' | 'max' }
  | { type: 'disabled' }

function isKimiModel(model: string): boolean {
  return model.toLowerCase().startsWith('kimi-')
}

function isDeepSeekModel(model: string): boolean {
  return model.toLowerCase().startsWith('deepseek-')
}

export function buildChatBody(
  cfg: AppConfig,
  args: {
    messages: Message[]
    temperature: number
    stream: boolean
    maxTokens?: number
    thinking?: ThinkingConfig
    tools?: ToolDef[]
  }
): Record<string, any> {
  const body: Record<string, any> = {
    model: cfg.model,
    stream: args.stream,
    messages: args.messages,
  }

  if (isKimiModel(cfg.model)) {
    const thinking = args.thinking ?? { type: 'disabled' }
    body.thinking = { type: thinking.type }
    if (thinking.type === 'enabled') {
      body.reasoning_effort = thinking.reasoning_effort ?? 'high'
      body.temperature = args.temperature
    } else {
      // Kimi k2.x / kimi-for-coding 在 thinking disabled 模式下只允许 temperature=0.6
      body.temperature = 0.6
    }
  } else if (isDeepSeekModel(cfg.model)) {
    const thinking = args.thinking ?? { type: 'disabled' }
    body.thinking = { type: thinking.type }
    if (thinking.type === 'enabled') {
      body.reasoning_effort = thinking.reasoning_effort ?? 'high'
    }
    body.temperature = args.temperature
  } else {
    body.temperature = args.temperature
  }

  if (args.maxTokens) {
    body.max_tokens = args.maxTokens
  }

  if (args.tools && args.tools.length > 0) body.tools = args.tools

  return body
}

export async function chatNonStream(
  cfg: AppConfig,
  args: { messages: Message[]; temperature: number; thinking?: ThinkingConfig; signal?: AbortSignal }
): Promise<string> {
  const TIMEOUT_MS = 300_000
  const ctl = new AbortController()
  let timedOut = false
  const timeoutId = setTimeout(() => {
    timedOut = true
    ctl.abort()
  }, TIMEOUT_MS)
  let externalListenerAdded = false
  const onExternalAbort = () => ctl.abort()
  if (args.signal) {
    if (args.signal.aborted) {
      ctl.abort()
    } else {
      args.signal.addEventListener('abort', onExternalAbort, { once: true })
      externalListenerAdded = true
    }
  }

  try {
    const res = await fetch(`${cfg.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${cfg.apiKey}`,
        'Content-Type': 'application/json',
        'User-Agent': 'claude-code/0.1.0'
      },
      body: JSON.stringify(buildChatBody(cfg, {
        messages: args.messages,
        temperature: args.temperature,
        stream: false,
        maxTokens: 16384,
        thinking: args.thinking,
      })),
      signal: ctl.signal,
    } as any)
    if (!res.ok) {
      const body = await res.text().catch(() => '')
      console.error('[kimi] chatNonStream HTTP error:', res.status, body.slice(0, 500))
      const e: any = new Error(`Kimi non-stream HTTP ${res.status}: ${body.slice(0, 200)}`)
      e.code = res.status === 401 || res.status === 403 ? 'LLM_ERROR'
        : res.status === 429 ? 'LLM_ERROR'
        : res.status >= 500 ? 'LLM_ERROR'
        : 'LLM_ERROR'
      e.status = res.status
      throw e
    }
    const json = await res.json() as { choices: { message: { content: string } }[] }
    const content = json.choices[0]?.message?.content ?? ''
    if (!content) {
      const e: any = new Error('Kimi returned empty content')
      e.code = 'LLM_ERROR'
      throw e
    }
    return content
  } catch (err: any) {
    if (timedOut) {
      const e: any = new Error(`Request timeout after ${TIMEOUT_MS}ms`)
      e.code = 'TIMEOUT'
      throw e
    }
    // Connection-level errors (TypeError, etc.) have no .code — mark them so
    // toJobErrorCode can classify them as LLM_ERROR instead of NETWORK_ERROR.
    if (!err.code && err.name !== 'AbortError') {
      err.code = 'LLM_ERROR'
    }
    throw err
  } finally {
    clearTimeout(timeoutId)
    if (externalListenerAdded) {
      args.signal!.removeEventListener('abort', onExternalAbort)
    }
  }
}

export type SseEvent =
  | { kind: 'chunk'; text: string; finishReason?: string }
  | { kind: 'reasoning'; text: string; content?: string }
  | { kind: 'tool_call'; index: number; id?: string; name?: string; args?: string }
  | { kind: 'done' }
  | { kind: 'noop' }

export function parseSseChunk(line: string): SseEvent {
  const trimmed = line.trim()
  if (!trimmed.startsWith('data:')) return { kind: 'noop' }
  const payload = trimmed.slice(5).trim()
  if (payload === '[DONE]') return { kind: 'done' }
  try {
    const json = JSON.parse(payload) as { choices?: { delta?: { content?: string; reasoning_content?: string; tool_calls?: Array<{ index?: number; id?: string; function?: { name?: string; arguments?: string } }> }; finish_reason?: string }[] }
    const delta = json.choices?.[0]?.delta
    const finishReason = json.choices?.[0]?.finish_reason ?? null
    if (delta?.reasoning_content) {
      const ev: SseEvent = { kind: 'reasoning', text: delta.reasoning_content }
      if (delta.content) ev.content = delta.content
      return ev
    }
    if (delta?.tool_calls && Array.isArray(delta.tool_calls) && delta.tool_calls.length > 0) {
      const tc = delta.tool_calls[0]
      const ev: SseEvent = { kind: 'tool_call', index: tc.index ?? 0 }
      if (tc.id) ev.id = tc.id
      if (tc.function?.name) ev.name = tc.function.name
      if (tc.function?.arguments) ev.args = tc.function.arguments
      return ev
    }
    const text = delta?.content ?? ''
    if (finishReason) return { kind: 'chunk', text, finishReason }
    return { kind: 'chunk', text }
  } catch {
    return { kind: 'noop' }
  }
}

export async function chatStream(
  cfg: AppConfig,
  args: { messages: Message[]; temperature: number; signal: AbortSignal; thinking?: ThinkingConfig; tools?: ToolDef[] },
  onChunk: (text: string) => void,
  onReasoning?: (text: string) => void
): Promise<ChatStreamResult> {
  const TIMEOUT_MS = 120_000
  const internalCtl = new AbortController()
  let timedOut = false

  const onAbort = () => internalCtl.abort()
  args.signal.addEventListener('abort', onAbort, { once: true })

  const timeoutId = setTimeout(() => {
    timedOut = true
    internalCtl.abort()
  }, TIMEOUT_MS)

  const toolCallMap = new Map<number, { id: string; name: string; args: string }>()
  let finishReason: string | null = null
  let contentAcc = ''

  try {
    const res = await fetch(`${cfg.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${cfg.apiKey}`,
        'Content-Type': 'application/json',
        'User-Agent': 'claude-code/0.1.0'
      },
      body: JSON.stringify(buildChatBody(cfg, {
        messages: args.messages,
        temperature: args.temperature,
        stream: true,
        thinking: args.thinking ?? { type: 'disabled' },
        ...(args.tools ? { tools: args.tools } : {}),
      })),
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
        if (ev.kind === 'chunk') { onChunk(ev.text); contentAcc += ev.text; if (ev.finishReason) finishReason = ev.finishReason }
        else if (ev.kind === 'reasoning') { onReasoning?.(ev.text); if (ev.content) { onChunk(ev.content); contentAcc += ev.content } }
        else if (ev.kind === 'tool_call') {
          const cur = toolCallMap.get(ev.index) ?? { id: '', name: '', args: '' }
          if (ev.id) cur.id = ev.id
          if (ev.name) cur.name = ev.name
          if (ev.args) cur.args += ev.args
          toolCallMap.set(ev.index, cur)
        }
        else if (ev.kind === 'done') break
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

  return {
    content: contentAcc,
    toolCalls: [...toolCallMap.values()].map(tc => ({ id: tc.id, name: tc.name, arguments: tc.args })),
    finishReason,
  }
}
