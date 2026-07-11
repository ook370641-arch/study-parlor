import { describe, it, expect } from 'vitest'
import { extractJsonObject } from '../../electron/lib/extract-json'

// extractJsonObject returns a STRING (the raw JSON slice) or null — never a parsed object.
// The handler passes the result to JSON.parse, so these tests mirror that contract.
describe('extractJsonObject', () => {
  it('strips ```json markdown fences and returns the inner JSON string', () => {
    const raw = '```json\n{"background":"b","chunks":[]}\n```'
    const out = extractJsonObject(raw)
    expect(typeof out).toBe('string')
    expect(out).toBe('{"background":"b","chunks":[]}')
    expect(JSON.parse(out!)).toEqual({ background: 'b', chunks: [] })
  })

  it('strips plain ``` fences without a language tag', () => {
    const raw = '```\n{"a":1}\n```'
    expect(extractJsonObject(raw)).toBe('{"a":1}')
  })

  it('drops leading prose before the opening brace', () => {
    const raw = 'Sure! Here is the reading guide:\n{"background":"x","chunks":[]}'
    const out = extractJsonObject(raw)
    expect(out).toBe('{"background":"x","chunks":[]}')
    expect(JSON.parse(out!)).toEqual({ background: 'x', chunks: [] })
  })

  it('drops trailing prose after the closing brace', () => {
    const raw = '{"a":1}\nHope that helps!'
    expect(extractJsonObject(raw)).toBe('{"a":1}')
  })

  it('balances nested objects rather than stopping at the first brace', () => {
    const raw = 'noise {"a":{"b":2},"c":3} more noise'
    const out = extractJsonObject(raw)
    expect(out).toBe('{"a":{"b":2},"c":3}')
    expect(JSON.parse(out!)).toEqual({ a: { b: 2 }, c: 3 })
  })

  it('is not confused by braces inside string values', () => {
    const raw = '{"text":"a } brace in a string","n":1}'
    const out = extractJsonObject(raw)
    expect(out).toBe('{"text":"a } brace in a string","n":1}')
    expect(JSON.parse(out!)).toEqual({ text: 'a } brace in a string', n: 1 })
  })

  it('returns null when there is no JSON object at all', () => {
    expect(extractJsonObject('there is no json here')).toBeNull()
    expect(extractJsonObject('')).toBeNull()
  })

  it('returns null for an unbalanced / malformed object', () => {
    expect(extractJsonObject('{"a": 1')).toBeNull()
  })

  it('returns null for a JSON array (only objects are extracted)', () => {
    expect(extractJsonObject('[1,2,3]')).toBeNull()
  })
})
