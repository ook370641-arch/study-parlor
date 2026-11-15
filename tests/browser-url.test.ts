import { describe, expect, it } from 'vitest'
import { browserTargetForInput, isAllowedBrowserUrl } from '@electron/lib/browser-url'

describe('browser URL policy', () => {
  it.each([
    ['https://example.com/a', 'https://example.com/a'],
    ['example.com/a', 'https://example.com/a'],
    ['localhost:3000', 'http://localhost:3000/'],
  ])('normalizes %s', (input, expected) => {
    expect(browserTargetForInput(input)).toBe(expected)
  })

  it('turns keywords into a Bing search', () => {
    expect(browserTargetForInput('苏格拉底 提问')).toBe(
      'https://www.bing.com/search?q=%E8%8B%8F%E6%A0%BC%E6%8B%89%E5%BA%95%20%E6%8F%90%E9%97%AE',
    )
  })

  it('returns empty input unchanged and never executes unsafe schemes', () => {
    expect(browserTargetForInput('  ')).toBe('')
    expect(isAllowedBrowserUrl('file:///C:/private.txt')).toBe(false)
    expect(isAllowedBrowserUrl('javascript:alert(1)')).toBe(false)
    expect(isAllowedBrowserUrl('data:text/html,hello')).toBe(false)
    expect(isAllowedBrowserUrl('https://example.com')).toBe(true)
  })
})
