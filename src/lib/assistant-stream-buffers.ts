type StreamBuffer = {
  content: string
  reasoning: string
  flushTimer: ReturnType<typeof setTimeout> | null
}

const DEFAULT_STREAM = '__default__'
const buffers = new Map<string, StreamBuffer>()

function bufferFor(sessionId?: string): StreamBuffer {
  const key = sessionId ?? DEFAULT_STREAM
  let buffer = buffers.get(key)
  if (!buffer) {
    buffer = { content: '', reasoning: '', flushTimer: null }
    buffers.set(key, buffer)
  }
  return buffer
}

export function hasFlushTimer(sessionId?: string): boolean {
  return bufferFor(sessionId).flushTimer !== null
}

export function appendToContentBuffer(text: string, sessionId?: string): void {
  bufferFor(sessionId).content += text
}

export function appendToReasoningBuffer(text: string, sessionId?: string): void {
  bufferFor(sessionId).reasoning += text
}

export function drainContentBuffer(sessionId?: string): string {
  const buffer = bufferFor(sessionId)
  const text = buffer.content
  buffer.content = ''
  return text
}

export function drainReasoningBuffer(sessionId?: string): string {
  const buffer = bufferFor(sessionId)
  const text = buffer.reasoning
  buffer.reasoning = ''
  return text
}

export function setFlushTimer(timer: ReturnType<typeof setTimeout>, sessionId?: string): void {
  bufferFor(sessionId).flushTimer = timer
}

export function clearFlushTimer(sessionId?: string): void {
  const buffer = bufferFor(sessionId)
  if (buffer.flushTimer) {
    clearTimeout(buffer.flushTimer)
    buffer.flushTimer = null
  }
}

export function resetAssistantStreamBuffers(sessionId?: string): void {
  if (sessionId) {
    clearFlushTimer(sessionId)
    buffers.delete(sessionId)
    return
  }
  for (const buffer of buffers.values()) {
    if (buffer.flushTimer) clearTimeout(buffer.flushTimer)
  }
  buffers.clear()
}
