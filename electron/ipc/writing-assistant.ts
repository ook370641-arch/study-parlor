import { ipcMain } from 'electron'
import type { AppConfig } from '../env'
import { runWritingAssistantTurn } from '../lib/writing-assistant/loop'
import { buildWritingIndex, buildWritingSystemPrompt } from '../lib/writing-assistant/prompt'
import type { WritingAssistantMessage } from '../../src/types'

const writingSessions = new Map<string, AbortController>()

// E2E deterministic mock is active only when BOTH the test NODE_ENV and the
// E2E isolation marker are set. Gating on both keeps unit tests (which run with
// NODE_ENV=test but no E2E_CONFIG_DIR) on the real code path. See rule e2e.md §1.
function isE2EMock(): boolean {
  return process.env.NODE_ENV === 'test' && !!process.env.E2E_CONFIG_DIR
}

export function registerWritingAssistantIpc(cfg: AppConfig): void {
  ipcMain.handle('writingAssistant:sendMessage', async (event, args: {
    sessionId: string
    articlePath: string | null
    articleContent: string
    messages: WritingAssistantMessage[]
    useSearch: boolean
    thinkingEffort: 'off' | 'high' | 'max'
  }): Promise<void> => {
    const send = (channel: string, ...payload: unknown[]) => {
      if (event.sender.isDestroyed()) return
      event.sender.send(channel, ...payload)
    }

    // E2E deterministic mock
    if (isE2EMock()) {
      const ctl = new AbortController()
      writingSessions.set(args.sessionId, ctl)
      try {
        send('writingAssistant:tool', {
          sessionId: args.sessionId, phase: 'start', tool: 'read_local' as const,
          ids: ['repository:旧随笔.md']
        })
        send('writingAssistant:tool', {
          sessionId: args.sessionId, phase: 'done', tool: 'read_local' as const,
          ids: ['repository:旧随笔.md']
        })
        for (const chunk of ['这是一段', 'E2E 测试的', '写作助手回复。']) {
          if (ctl.signal.aborted) return
          send('llm:chunk', args.sessionId, chunk)
        }
        send('writingAssistant:tool', {
          sessionId: args.sessionId, phase: 'done', tool: 'insert_into_article' as const,
          markdown: '# 插入标题'
        })
        if (!ctl.signal.aborted) send('llm:done', args.sessionId)
        // Write last-writing-request.json for E2E assertions
        const fs = await import('node:fs')
        const path = await import('node:path')
        const e2eDir = process.env.E2E_CONFIG_DIR
        if (e2eDir) {
          fs.mkdirSync(e2eDir, { recursive: true })
          fs.writeFileSync(path.join(e2eDir, 'last-writing-request.json'), JSON.stringify({
            articlePath: args.articlePath,
            useSearch: args.useSearch,
            thinkingEffort: args.thinkingEffort,
            messageCount: args.messages.length,
          }))
        }
      } finally {
        writingSessions.delete(args.sessionId)
      }
      return
    }

    // Real branch
    const index = await buildWritingIndex(cfg)
    const systemPrompt = buildWritingSystemPrompt(index)

    const ctl = new AbortController()
    writingSessions.set(args.sessionId, ctl)

    try {
      await runWritingAssistantTurn(cfg, {
        sessionId: args.sessionId,
        systemPrompt,
        messages: args.messages,
        useSearch: args.useSearch,
        thinkingEffort: args.thinkingEffort,
        send,
        onChunk: (text) => send('llm:chunk', args.sessionId, text),
        onReasoning: (text) => send('writingAssistant:reasoningChunk', args.sessionId, text),
        signal: ctl.signal,
        index,
      })
      send('llm:done', args.sessionId)
    } catch (err: any) {
      if (err?.name === 'AbortError') return
      const code = err?.code
      const mapped = code === 'TIMEOUT' ? 'CHAT_TIMEOUT' : code === 'NETWORK_ERROR' ? 'CHAT_NETWORK_ERROR' : 'CHAT_LLM_ERROR'
      send('llm:error', args.sessionId, { code: mapped, message: String(err?.message ?? err) })
    } finally {
      writingSessions.delete(args.sessionId)
    }
  })

  ipcMain.handle('writingAssistant:abort', (_, args: { sessionId: string }) => {
    const ctl = writingSessions.get(args.sessionId)
    if (ctl) { ctl.abort(); writingSessions.delete(args.sessionId) }
  })
}
