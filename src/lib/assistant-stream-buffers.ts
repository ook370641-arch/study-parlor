let contentBuffer = ''
let reasoningBuffer = ''
let flushTimer: ReturnType<typeof setTimeout> | null = null

export function getContentBuffer(): string {
  return contentBuffer
}

export function getReasoningBuffer(): string {
  return reasoningBuffer
}

export function hasFlushTimer(): boolean {
  return flushTimer !== null
}

export function appendToContentBuffer(text: string): void {
  contentBuffer += text
}

export function appendToReasoningBuffer(text: string): void {
  reasoningBuffer += text
}

export function drainContentBuffer(): string {
  const text = contentBuffer
  contentBuffer = ''
  return text
}

export function drainReasoningBuffer(): string {
  const text = reasoningBuffer
  reasoningBuffer = ''
  return text
}

export function setFlushTimer(timer: ReturnType<typeof setTimeout>): void {
  flushTimer = timer
}

export function clearFlushTimer(): void {
  if (flushTimer) {
    clearTimeout(flushTimer)
    flushTimer = null
  }
}

export function resetAssistantStreamBuffers(): void {
  clearFlushTimer()
  contentBuffer = ''
  reasoningBuffer = ''
}
