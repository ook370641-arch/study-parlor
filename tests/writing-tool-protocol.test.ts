import { describe, expect, it } from 'vitest'
import { parseNativeToolCall, buildToolDefinitions, MAX_TOOL_CALLS } from '../electron/lib/writing-assistant/tool-protocol'

describe('parseNativeToolCall', () => {
  it('parses read_local with ids', () => {
    const raw = { id: 'call_1', name: 'read_local', arguments: '{"ids":["writing:a.md","repository:旧随笔.md"]}' }
    expect(parseNativeToolCall(raw)).toEqual({ id: 'call_1', name: 'read_local', args: { ids: ['writing:a.md', 'repository:旧随笔.md'] } })
  })

  it('parses web_search with query', () => {
    const raw = { id: 'call_2', name: 'web_search', arguments: '{"query":"TypeScript best practices"}' }
    expect(parseNativeToolCall(raw)).toEqual({ id: 'call_2', name: 'web_search', args: { query: 'TypeScript best practices' } })
  })

  it('rejects read_local with missing ids', () => {
    expect(parseNativeToolCall({ name: 'read_local', arguments: '{}' })).toBeNull()
    expect(parseNativeToolCall({ name: 'read_local', arguments: 'not json' })).toBeNull()
  })

  it('rejects web_search with empty query', () => {
    expect(parseNativeToolCall({ name: 'web_search', arguments: '{"query":""}' })).toBeNull()
  })

  it('rejects unknown tool names and missing name', () => {
    expect(parseNativeToolCall({ name: 'insert_into_article', arguments: '{}' })).toBeNull()
    expect(parseNativeToolCall({ arguments: '{}' })).toBeNull()
  })
})

describe('buildToolDefinitions', () => {
  it('always includes read_local', () => {
    const defs = buildToolDefinitions(false)
    expect(defs.map(d => d.function.name)).toContain('read_local')
  })

  it('includes web_search only when enabled', () => {
    expect(buildToolDefinitions(false).map(d => d.function.name)).not.toContain('web_search')
    expect(buildToolDefinitions(true).map(d => d.function.name)).toContain('web_search')
  })

  it('never defines insert_into_article', () => {
    const names = buildToolDefinitions(true).map(d => d.function.name)
    expect(names).not.toContain('insert_into_article')
  })
})

it('MAX_TOOL_CALLS stays 3', () => {
  expect(MAX_TOOL_CALLS).toBe(3)
})
