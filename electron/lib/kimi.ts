import type { AppConfig } from '../env'
import type { Message } from '@shared/index'

export async function probeModel(cfg: AppConfig): Promise<{ ok: boolean; reason?: string }> {
  const res = await fetch(`${cfg.baseUrl}/models`, {
    headers: { Authorization: `Bearer ${cfg.apiKey}` }
  })
  if (!res.ok) return { ok: false, reason: `HTTP ${res.status}` }
  const data = await res.json() as { data?: { id: string }[] }
  const ids = (data.data ?? []).map(m => m.id)
  if (!ids.includes(cfg.model)) {
    return { ok: false, reason: `${cfg.model} not in available list (${ids.length} models)` }
  }
  return { ok: true }
}

export async function chatNonStream(
  cfg: AppConfig,
  args: { messages: Message[]; temperature: number }
): Promise<string> {
  const res = await fetch(`${cfg.baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${cfg.apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: cfg.model,
      stream: false,
      temperature: args.temperature,
      messages: args.messages
    })
  })
  if (!res.ok) throw new Error(`Kimi non-stream HTTP ${res.status}`)
  const json = await res.json() as { choices: { message: { content: string } }[] }
  return json.choices[0]?.message?.content ?? ''
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
  const res = await fetch(`${cfg.baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${cfg.apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: cfg.model,
      stream: true,
      temperature: args.temperature,
      messages: args.messages
    }),
    signal: args.signal
  })
  if (!res.ok || !res.body) throw new Error(`Kimi stream HTTP ${res.status}`)

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  while (true) {
    const { done, value } = await reader.read()
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
}
