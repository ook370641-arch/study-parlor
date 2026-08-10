import { describe, expect, it } from 'vitest'
import { runWritingAssistantTurn, injectLatestSnapshot } from '../electron/lib/writing-assistant/loop'
import { MAX_TOOL_CALLS } from '../electron/lib/writing-assistant/tool-protocol'
import type { ChatStreamResult } from '../electron/lib/kimi'
import type { AppConfig } from '../electron/env'
import type { WritingAssistantMessage } from '../src/types'

const cfg = { apiKey: 'sk-test', baseUrl: 'https://x', model: 'm', libraryPath: '/tmp' } as AppConfig

function fakeChat(script: Array<{ toolCalls: ChatStreamResult['toolCalls']; content?: string; finishReason?: string | null }>) {
  let i = 0
  return async () => {
    const s = script[Math.min(i++, script.length - 1)]
    return { content: s.content ?? '', toolCalls: s.toolCalls, finishReason: s.finishReason ?? 'stop' } as ChatStreamResult
  }
}

const noop = () => {}

describe('injectLatestSnapshot', () => {
  it('appends the most recent snapshot to the system prompt', () => {
    const msgs: WritingAssistantMessage[] = [
      { role: 'user', content: 'a', snapshot: '# 旧版' },
      { role: 'assistant', content: 'r' },
      { role: 'user', content: 'b' },
    ]
    const out = injectLatestSnapshot('system', msgs)
    expect(out).toContain('## 当前文章全文快照')
    expect(out).toContain('# 旧版')
  })

  it('returns base unchanged when no snapshot', () => {
    const msgs: WritingAssistantMessage[] = [{ role: 'user', content: 'a' }]
    expect(injectLatestSnapshot('system', msgs)).toBe('system')
  })
})

describe('runWritingAssistantTurn loop', () => {
  function baseArgs(overrides: { chat?: any; executeTool?: any } = {}) {
    const sent: Array<{ channel: string; payload: unknown[] }> = []
    const done = runWritingAssistantTurn(cfg, {
      sessionId: 'wa-1',
      systemPrompt: 'system',
      messages: [{ role: 'user', content: 'q', snapshot: '# 正文' }],
      useSearch: false,
      thinkingEffort: 'off',
      send: (channel: string, ...payload: unknown[]) => sent.push({ channel, payload }),
      onChunk: noop as any,
      onReasoning: noop as any,
      signal: new AbortController().signal,
      index: [],
    } as any, overrides)
    return { sent, done }
  }

  it('returns normally when model answers without tools', async () => {
    const chat = fakeChat([{ toolCalls: [], content: '直接回答' }])
    const { sent, done } = baseArgs({ chat: chat as any })
    await done
    expect(sent).toEqual([]) // 未发送任何 llm:error
  })

  it('sends CHAT_EMPTY_REPLY when final content is empty', async () => {
    const chat = fakeChat([{ toolCalls: [], content: '' }])
    const { sent, done } = baseArgs({ chat: chat as any })
    await done
    expect(sent).toContainEqual({
      channel: 'llm:error',
      payload: ['wa-1', { code: 'CHAT_EMPTY_REPLY', message: '助手未产生回答' }],
    })
  })

  it('executes tool call then answers (rounds: tool_calls -> stop)', async () => {
    const calls: string[] = []
    const chat = fakeChat([
      { toolCalls: [{ id: 'c1', name: 'read_local', arguments: '{"ids":["writing:a.md"]}' }] },
      { toolCalls: [], content: '基于文件回答' },
    ])
    const executeTool = async (_cfg: unknown, call: { name: string }) => { calls.push(call.name); return '内容' }
    const { done } = baseArgs({ chat: chat as any, executeTool: executeTool as any })
    await done
    expect(calls).toEqual(['read_local'])
  })

  it('forces a final answer without tools when tool calls exhaust the cap', async () => {
    const toolsSeen: Array<unknown[] | undefined> = []
    let n = 0
    const chat = async (_c: unknown, args: { tools?: unknown[] }) => {
      toolsSeen.push(args.tools)
      n++
      // n=1..4 全返回 tool_calls,第 5 次(强制逼答轮)才 stop —— 让 round==MAX 分支真实触发
      if (n <= MAX_TOOL_CALLS + 1) {
        return { content: '', toolCalls: [{ id: `c${n}`, name: 'read_local', arguments: '{"ids":["writing:a.md"]}' }], finishReason: 'tool_calls' }
      }
      return { content: '最终回答', toolCalls: [], finishReason: 'stop' }
    }
    const { done } = baseArgs({ chat: chat as any, executeTool: (async () => 'ok') as any })
    await done
    expect(toolsSeen[toolsSeen.length - 1]).toBeUndefined() // 最后一次逼答不带 tools
  })
})
