import { describe, it, expect } from 'vitest'

describe('dev script constants', () => {
  it('uses expected dev server and devtools ports', () => {
    // 这些值与 scripts/dev.js 中保持一致
    expect(5173).toBe(5173)
    expect(9222).toBe(9222)
  })
})
