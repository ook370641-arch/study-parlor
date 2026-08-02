import { describe, it, expect } from 'vitest'
import { extractToolCall, createToolBuffer } from '../electron/lib/scout/tool-protocol'

describe('scout tool-protocol', () => {
  it('解析 web_search', () => {
    expect(extractToolCall('```tool\n{"tool":"web_search","query":"AI agent"}\n```'))
      .toEqual({ tool: 'web_search', query: 'AI agent' })
  })

  it('解析 propose_candidates 并校验候选结构', () => {
    const text = '```tool\n' + JSON.stringify({
      tool: 'propose_candidates',
      candidates: [{ title: 'A', url: 'https://a.com', sourceName: 'a.com', reason: '好' }],
    }) + '\n```'
    expect(extractToolCall(text)).toEqual({
      tool: 'propose_candidates',
      candidates: [{ title: 'A', url: 'https://a.com', sourceName: 'a.com', reason: '好' }],
    })
  })

  it('propose_candidates 缺字段 → null', () => {
    const text = '```tool\n{"tool":"propose_candidates","candidates":[{"title":"A"}]}\n```'
    expect(extractToolCall(text)).toBeNull()
  })

  it('解析 fetch_and_save / read_article', () => {
    expect(extractToolCall('```tool\n{"tool":"fetch_and_save","urls":["https://a.com"]}\n```'))
      .toEqual({ tool: 'fetch_and_save', urls: ['https://a.com'] })
    expect(extractToolCall('```tool\n{"tool":"read_article","url":"https://a.com"}\n```'))
      .toEqual({ tool: 'read_article', url: 'https://a.com' })
  })

  it('非法 JSON / 未知工具 → null', () => {
    expect(extractToolCall('```tool\n{bad\n```')).toBeNull()
    expect(extractToolCall('```tool\n{"tool":"hack"}\n```')).toBeNull()
  })

  it('流式 buffer：tool 块不外泄到正文，尾部半截 ```to 不吞字', () => {
    const buf = createToolBuffer()
    let out = ''
    out += buf.feed('前言 ')
    out += buf.feed('```to')
    out += buf.feed('ol\n{"tool":"web_search","query":"q"}\n```')
    out += buf.feed('后文')
    out += buf.flush()
    expect(out).toBe('前言 后文')
    expect(buf.takeTool()).toEqual({ tool: 'web_search', query: 'q' })
  })
})
