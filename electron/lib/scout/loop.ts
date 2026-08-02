import type { Message } from '@shared/index'
import type { ScoutMessage } from '@shared/index'
import { createToolBuffer, MAX_TOOL_CALLS, type ToolCall } from './tool-protocol'
import { buildScoutSystemPrompt } from './prompt'
import type { FetchedArticle } from './article-fetcher'
import type { ScoutToolDeps } from './tools'

export type ScoutLoopDeps = {
  chatStream: (
    opts: { messages: Message[]; temperature: number; signal: AbortSignal; thinking?: unknown },
    onChunk: (t: string) => void,
    onReasoning: (t: string) => void
  ) => Promise<void>
  executeTool: (call: ToolCall, roundDeps: unknown) => Promise<string>
  buildDeps: (precheckCache: Map<string, FetchedArticle>) => Promise<ScoutToolDeps>
}

export async function runScoutTurn(
  args: {
    messages: ScoutMessage[]
    onChunk: (text: string) => void
    onReasoning: (text: string) => void
    signal: AbortSignal
  },
  deps: ScoutLoopDeps
): Promise<void> {
  const precheckCache = new Map<string, FetchedArticle>()
  const history: Message[] = [
    { role: 'system', content: buildScoutSystemPrompt() },
    // 候选卡片等结构化字段不进 LLM 上下文，只发纯文本
    ...args.messages.map(m => ({ role: m.role as 'user' | 'assistant', content: m.content })),
  ]

  for (let round = 0; round <= MAX_TOOL_CALLS; round++) {
    const buf = createToolBuffer()

    await deps.chatStream(
      { messages: history, temperature: 0.7, signal: args.signal, thinking: { type: 'enabled', reasoning_effort: 'high' } },
      (text: string) => { const out = buf.feed(text); if (out) args.onChunk(out) },
      args.onReasoning
    )

    const tail = buf.flush()
    if (tail) args.onChunk(tail)

    const call = buf.takeTool()
    if (!call) return

    if (round === MAX_TOOL_CALLS) {
      history.push({ role: 'user', content: '工具调用次数已达上限，请直接回答用户的问题。' })
      await deps.chatStream(
        { messages: history, temperature: 0.7, signal: args.signal, thinking: { type: 'disabled' } },
        args.onChunk,
        args.onReasoning
      )
      return
    }

    const toolResult = await deps.executeTool(call, await deps.buildDeps(precheckCache))
    history.push(
      { role: 'assistant', content: `（调用工具：${call.tool}）` },
      { role: 'user', content: `工具结果：\n${toolResult}` }
    )
  }
}
