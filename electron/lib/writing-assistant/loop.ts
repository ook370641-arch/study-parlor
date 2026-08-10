import type { AppConfig } from '../../env'
import { chatStream, type ThinkingConfig, type ChatStreamResult } from '../kimi'
import type { WritingAssistantMessage, WritingToolEvent } from '../../../src/types'
import type { Message } from '@shared/index'
import { MAX_TOOL_CALLS, parseNativeToolCall, buildToolDefinitions } from './tool-protocol'
import { executeTool } from './tools'
import type { IndexEntry } from './prompt'
import { getSearchApiKey } from '../credentials'
import { searchWeb } from '../search'

function effortToThinking(effort: 'off' | 'high' | 'max'): ThinkingConfig {
  if (effort === 'off') return { type: 'disabled' }
  return { type: 'enabled', reasoning_effort: effort }
}

export function injectLatestSnapshot(base: string, messages: WritingAssistantMessage[]): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    const snap = messages[i].snapshot
    if (snap && snap.trim()) {
      return `${base}\n\n## 当前文章全文快照\n\n${snap.trim()}`
    }
  }
  return base
}

export type LoopDeps = {
  chat?: typeof chatStream
  executeTool?: typeof executeTool
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
  },
  deps: LoopDeps = {}
): Promise<void> {
  const chat = deps.chat ?? chatStream
  const exec = deps.executeTool ?? executeTool

  const systemPrompt = injectLatestSnapshot(args.systemPrompt, args.messages)
  const history: Message[] = [
    { role: 'system', content: systemPrompt },
    ...args.messages.map(m => ({ role: m.role as 'user' | 'assistant', content: m.content })),
  ]
  const tools = buildToolDefinitions(args.useSearch)

  for (let round = 0; round <= MAX_TOOL_CALLS; round++) {
    const result: ChatStreamResult = await chat(
      cfg,
      { messages: history, temperature: 0.7, signal: args.signal, thinking: effortToThinking(args.thinkingEffort), tools },
      args.onChunk,
      args.onReasoning
    )

    if (result.toolCalls.length === 0) {
      if (!result.content.trim()) {
        args.send('llm:error', args.sessionId, { code: 'CHAT_EMPTY_REPLY', message: '助手未产生回答' })
        return
      }
      return
    }

    if (round === MAX_TOOL_CALLS) {
      history.push({ role: 'user', content: '工具调用已达上限，请直接基于已有信息回答用户的问题。' })
      const forced: ChatStreamResult = await chat(
        cfg,
        { messages: history, temperature: 0.7, signal: args.signal, thinking: { type: 'disabled' } },
        args.onChunk,
        args.onReasoning
      )
      if (!forced.content.trim()) {
        args.send('llm:error', args.sessionId, { code: 'CHAT_EMPTY_REPLY', message: '助手未产生回答' })
      }
      return
    }

    for (const raw of result.toolCalls) {
      const call = parseNativeToolCall(raw)
      if (!call) {
        history.push({ role: 'user', content: '工具调用参数无效，请检查工具参数后重试。' })
        continue
      }
      const toolResult = await exec(cfg, call, {
        send: (e: WritingToolEvent) => args.send('writingAssistant:tool', e),
        sessionId: args.sessionId,
        useSearch: args.useSearch,
        getSearchApiKey,
        searchWeb,
        index: args.index,
      })
      history.push(
        { role: 'assistant', content: `（调用工具：${call.name}）` },
        { role: 'user', content: `工具结果：\n${toolResult}` }
      )
    }
  }
}
