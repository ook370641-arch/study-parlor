import { describe, it, expect } from 'vitest'
import { extractToolCall, createToolBuffer, MAX_TOOL_CALLS } from '../electron/lib/writing-assistant/tool-protocol'

describe('extractToolCall', () => {
  it('提取完整 read_local 块', () => {
    const r = extractToolCall('前文\n```tool\n{"tool":"read_local","ids":["writing:a.md"]}\n```\n后文')
    expect(r).toEqual({ tool: 'read_local', ids: ['writing:a.md'] })
  })

  it('提取 web_search 块', () => {
    const r = extractToolCall('```tool\n{"tool":"web_search","query":"深度学习"}\n```')
    expect(r).toEqual({ tool: 'web_search', query: '深度学习' })
  })

  it('提取 insert_into_article 块', () => {
    const r = extractToolCall('```tool\n{"tool":"insert_into_article","markdown":"# 标题"}\n```')
    expect(r).toEqual({ tool: 'insert_into_article', markdown: '# 标题' })
  })

  it('畸形 JSON 返回 null', () => {
    expect(extractToolCall('```tool\n{bad}\n```')).toBeNull()
  })

  it('未知工具名返回 null', () => {
    expect(extractToolCall('```tool\n{"tool":"rm_rf"}\n```')).toBeNull()
  })

  it('缺少必要字段返回 null', () => {
    expect(extractToolCall('```tool\n{"tool":"read_local"}\n```')).toBeNull()  // missing ids
    expect(extractToolCall('```tool\n{"tool":"web_search"}\n```')).toBeNull()  // missing query
  })

  it('MAX_TOOL_CALLS = 6', () => {
    expect(MAX_TOOL_CALLS).toBe(6)
  })
})

describe('createToolBuffer', () => {
  it('流式缓冲：未闭合不透出，闭合后 takeTool 返回', () => {
    const b = createToolBuffer()
    expect(b.feed('你好```tool\n{"tool":')).toBe('你好')
    expect(b.takeTool()).toBeNull()
    expect(b.feed('"read_local","ids":["x"]}\n```世界')).toBe('世界')
    const call = b.takeTool()
    expect(call).toEqual({ tool: 'read_local', ids: ['x'] })
  })

  it('流式缓冲：无 tool 块时全透传', () => {
    const b = createToolBuffer()
    expect(b.feed('普通文本')).toBe('普通文本')
    expect(b.takeTool()).toBeNull()
    expect(b.flush()).toBe('')
  })

  it('flush 返回缓冲中的剩余文本', () => {
    const b = createToolBuffer()
    expect(b.feed('你好```tool\n{"tool":"web_search","query":"测试"}\n```还有')).toBe('你好还有')
    const call = b.takeTool()
    expect(call).toEqual({ tool: 'web_search', query: '测试' })
    // After takeTool, buffer should be empty
    expect(b.flush()).toBe('')
  })

  it('部分匹配的 ```tool 前缀被保留在缓冲区', () => {
    const b = createToolBuffer()
    // "```too" is a partial match for "```tool" — should be buffered
    expect(b.feed('文本```too')).toBe('文本')
    expect(b.takeTool()).toBeNull()
    // Complete the marker and finish the tool block
    expect(b.feed('l\n{"tool":"read_local","ids":["a"]}\n```结束')).toBe('结束')
    const call = b.takeTool()
    expect(call).toEqual({ tool: 'read_local', ids: ['a'] })
  })
})
