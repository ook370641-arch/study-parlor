import type { AppConfig } from '../../env'
import { chatStream, type ThinkingConfig } from '../kimi'
import type { WritingAssistantMessage, WritingToolEvent } from '../../../src/types'
import type { Message } from '@shared/index'
import { createToolBuffer, MAX_TOOL_CALLS } from './tool-protocol'
import { executeTool } from './tools'
import type { IndexEntry } from './prompt'
import { getSearchApiKey } from '../credentials'
import { searchWeb } from '../search'

function effortToThinking(effort: 'off' | 'high' | 'max'): ThinkingConfig {
  if (effort === 'off') return { type: 'disabled' }
  return { type: 'enabled', reasoning_effort: effort }
}

export async function runWritingAssistantTurn(
  cfg: AppConfig,
  args: {
    sessionId: string
    systemPrompt: string
    messages: WritingAssistantMessage[]
    useSearch: boolean
    thinkingEffort: 'off' | 'high' | 'max'
    send: (channel: string, ...payload: unknown[]) => void
    onChunk: (text: string) => void
    onReasoning: (text: string) => void
    signal: AbortSignal
    index: IndexEntry[]
  }
): Promise<void> {
  const history: Message[] = [
    { role: 'system', content: args.systemPrompt },
    ...args.messages.map(m => ({ role: m.role as 'user' | 'assistant', content: m.content })),
  ]

  for (let round = 0; round <= MAX_TOOL_CALLS; round++) {
    const buf = createToolBuffer()

    await chatStream(
      cfg,
      {
        messages: history,
        temperature: 0.7,
        signal: args.signal,
        thinking: effortToThinking(args.thinkingEffort),
      },
      (text: string) => {
        const out = buf.feed(text)
        if (out) args.onChunk(out)
      },
      (text: string) => {
        args.onReasoning(text)
      }
    )

    // Flush remaining buffer
    const tail = buf.flush()
    if (tail) args.onChunk(tail)

    const call = buf.takeTool()
    if (!call) return // No tool call, done

    if (round === MAX_TOOL_CALLS) {
      history.push({ role: 'user', content: '工具调用次数已达上限（6次），请直接回答用户的问题。' })
      // One more stream pass without tool detection
      await chatStream(
        cfg,
        { messages: history, temperature: 0.7, signal: args.signal, thinking: { type: 'disabled' } },
        args.onChunk,
        args.onReasoning
      )
      return
    }

    // Execute tool
    const toolResult = await executeTool(cfg, call, {
      send: (e: WritingToolEvent) => args.send('writingAssistant:tool', e),
      sessionId: args.sessionId,
      useSearch: args.useSearch,
      getSearchApiKey,
      searchWeb,
      index: args.index,
    })

    history.push(
      { role: 'assistant', content: `（调用工具：${call.tool}）` },
      { role: 'user', content: `工具结果：\n${toolResult}` }
    )
  }
}
