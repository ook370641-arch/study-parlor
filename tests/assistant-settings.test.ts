import { describe, expect, it } from 'vitest'
import { nextThinkingEffort } from '@/lib/assistant-settings'

describe('nextThinkingEffort', () => {
  it('cycles off → high → max → off', () => {
    expect(nextThinkingEffort('off')).toBe('high')
    expect(nextThinkingEffort('high')).toBe('max')
    expect(nextThinkingEffort('max')).toBe('off')
  })
})
