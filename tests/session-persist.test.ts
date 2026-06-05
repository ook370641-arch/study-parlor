import { describe, expect, it } from 'vitest'
import { sessionFileName } from '@electron/lib/session-persist'

describe('sessionFileName', () => {
  it('includes id suffix to avoid collisions', () => {
    const a = sessionFileName({ topic: 'Hello World', id: 'sess-a-123' })
    const b = sessionFileName({ topic: 'Hello-World', id: 'sess-b-456' })

    expect(a).not.toBe(b)
    expect(a).toBe('Hello_World_sess-a-1.json')
    expect(b).toBe('Hello_World_sess-b-4.json')
  })

  it('sanitizes special characters to underscore', () => {
    const name = sessionFileName({ topic: 'A/B + C-D', id: 'x' })
    expect(name).toBe('A_B___C_D_x.json')
  })

  it('preserves Chinese characters', () => {
    const name = sessionFileName({ topic: 'Python 基础', id: 'abc123' })
    expect(name).toBe('Python_基础_abc123.json')
  })
})
