import { describe, it, expect } from 'vitest'
import { runScoutTurn, type ScoutLoopDeps } from '../electron/lib/scout/loop'

function textStream(text: string) {
  return async (_opts: any, onChunk: (t: string) => void, _onReasoning?: (t: string) => void) => {
    onChunk(text)
  }
}

function makeDeps(chatStreamImpl: any): ScoutLoopDeps {
  return {
    chatStream: chatStreamImpl,
    executeTool: async () => '工具结果',
    buildDeps: () => ({} as any),
  }
}

describe('runScoutTurn', () => {
  it('无工具调用：单轮流式输出后结束', async () => {
    const chunks: string[] = []
    await runScoutTurn(
      { messages: [{ role: 'user', content: '你好' }], onChunk: (t) => chunks.push(t), onReasoning: () => {}, signal: new AbortController().signal },
      makeDeps(textStream('直接回复'))
    )
    expect(chunks.join('')).toBe('直接回复')
  })

  it('工具调用：执行后带着工具结果再流一轮', async () => {
    let round = 0
    const chunks: string[] = []
    const toolCalls: string[] = []
    const deps: ScoutLoopDeps = {
      chatStream: async (_opts: any, onChunk: (t: string) => void) => {
        round++
        if (round === 1) onChunk('先搜一下\n```tool\n{"tool":"web_search","query":"q"}\n```')
        else onChunk('最终回复')
      },
      executeTool: async (call) => { toolCalls.push(call.tool); return '搜索结果' },
      buildDeps: () => ({} as any),
    }
    await runScoutTurn(
      { messages: [{ role: 'user', content: '找文章' }], onChunk: (t) => chunks.push(t), onReasoning: () => {}, signal: new AbortController().signal },
      deps
    )
    expect(toolCalls).toEqual(['web_search'])
    expect(chunks.join('')).toContain('最终回复')
    expect(chunks.join('')).not.toContain('```tool') // tool 块不外泄
  })

  it('超过 MAX_TOOL_CALLS 轮：强制收尾一轮不再执行工具', async () => {
    let toolRuns = 0
    const deps: ScoutLoopDeps = {
      chatStream: async (_opts: any, onChunk: (t: string) => void) => {
        onChunk('```tool\n{"tool":"web_search","query":"q"}\n```')
      },
      executeTool: async () => { toolRuns++; return 'r' },
      buildDeps: () => ({} as any),
    }
    await runScoutTurn(
      { messages: [], onChunk: () => {}, onReasoning: () => {}, signal: new AbortController().signal },
      deps
    )
    expect(toolRuns).toBe(3) // MAX_TOOL_CALLS = 3
  })
})
