import { ipcMain } from 'electron'
import type { AppConfig } from '../env'
import { chatStream } from '../lib/kimi'
import { runScoutTurn } from '../lib/scout/loop'
import { executeScoutTool } from '../lib/scout/tools'
import { makeTavilyExtract, plainFetch, scraperFetch, type FetchedArticle } from '../lib/scout/article-fetcher'
import {
  saveConversation,
  createConversation,
  getConversation,
  listConversations,
  renameConversation,
  deleteConversation,
} from '../lib/scout/conversation-store'
import { listArticles, deleteArticle } from '../lib/scout/article-store'
import { getSearchApiKey } from '../lib/credentials'
import { searchWeb } from '../lib/search'
import type { ScoutMessage, ScoutToolEvent } from '@shared/index'

const scoutSessions = new Map<string, AbortController>()

function isE2EMock(): boolean {
  return process.env.NODE_ENV === 'test' && !!process.env.E2E_CONFIG_DIR
}

export function registerScoutIpc(cfg: AppConfig): void {
  ipcMain.handle(
    'scout:sendMessage',
    async (event, args: { conversationId: string; messages: ScoutMessage[] }): Promise<void> => {
      const send = (channel: string, ...payload: unknown[]) => {
        if (event.sender.isDestroyed()) return
        event.sender.send(channel, ...payload)
      }

      // E2E deterministic mock
      if (isE2EMock()) {
        const ctl = new AbortController()
        scoutSessions.set(args.conversationId, ctl)
        try {
          const lastUser = args.messages.filter(m => m.role === 'user').at(-1)?.content ?? ''
          if (/^抓取/.test(lastUser)) {
            // User confirmed fetch: write two fixture articles
            const { saveArticle } = await import('../lib/scout/article-store')
            for (const [i, title] of ['ReAct 原文', 'The Second Half'].entries()) {
              saveArticle(cfg.libraryPath, {
                url: `https://example.com/article-${i}`,
                title,
                markdown: `# ${title}\n\nE2E 正文`,
                summary: `${title} 摘要`,
                publishedAt: '2026-08-01T00:00:00.000Z',
                authors: [],
                tier: 1,
              })
            }
            send('scout:tool', { conversationId: args.conversationId, phase: 'start', tool: 'fetch_and_save', urls: [] })
            send('scout:tool', { conversationId: args.conversationId, phase: 'done', tool: 'fetch_and_save', urls: [], savedTitles: ['ReAct 原文', 'The Second Half'] })
            send('llm:chunk', args.conversationId, '两篇都已入库，去「文章」Tab 查看。')
          } else {
            send('llm:chunk', args.conversationId, '我找到了两篇候选：')
            send('scout:tool', {
              conversationId: args.conversationId,
              phase: 'candidates',
              candidates: [
                { title: 'ReAct 原文', url: 'https://example.com/article-0', sourceName: 'example.com', reason: '奠基论文', fetchable: true },
                { title: 'The Second Half', url: 'https://example.com/article-1', sourceName: 'example.com', reason: '一手长文', fetchable: true },
              ],
            })
            send('llm:chunk', args.conversationId, '确认后我就抓取。')
          }
          send('llm:done', args.conversationId)
        } finally {
          scoutSessions.delete(args.conversationId)
        }
        return
      }

      // Real branch
      const ctl = new AbortController()
      scoutSessions.set(args.conversationId, ctl)
      try {
        const conv = getConversation(cfg.libraryPath, args.conversationId)
        if (conv) saveConversation(cfg.libraryPath, { ...conv, messages: args.messages })

        await runScoutTurn(
          {
            messages: args.messages,
            onChunk: (t) => send('llm:chunk', args.conversationId, t),
            onReasoning: () => {},
            signal: ctl.signal,
          },
          {
            chatStream: (opts, onChunk, onReasoning) =>
              chatStream(
                cfg,
                { messages: opts.messages, temperature: opts.temperature, signal: opts.signal, thinking: opts.thinking as any },
                onChunk,
                onReasoning,
              ),
            buildDeps: async (precheckCache: Map<string, FetchedArticle>) => {
              const searchKey = await getSearchApiKey()
              return {
                libraryPath: cfg.libraryPath,
                conversationId: args.conversationId,
                signal: ctl.signal,
                send: (e: ScoutToolEvent) => send('scout:tool', e),
                searchWeb: ({ query, signal }: { query: string; signal?: AbortSignal }) =>
                  searchWeb({ query, apiKey: searchKey ?? '', signal }),
                tavilyExtract: makeTavilyExtract(searchKey ?? ''),
                plainFetch,
                scraperFetch,
                precheckCache,
              }
            },
            executeTool: (call, roundDeps) => executeScoutTool(call, roundDeps as any),
          },
        )

        send('llm:done', args.conversationId)
      } catch (err: any) {
        if (err?.name === 'AbortError') return
        send('llm:error', args.conversationId, { code: err?.code ?? 'LLM_ERROR', message: String(err?.message ?? err) })
      } finally {
        scoutSessions.delete(args.conversationId)
      }
    },
  )

  ipcMain.handle('scout:abort', (_, args: { conversationId: string }) => {
    const ctl = scoutSessions.get(args.conversationId)
    if (ctl) {
      ctl.abort()
      scoutSessions.delete(args.conversationId)
    }
  })

  ipcMain.handle('scout:listConversations', () => listConversations(cfg.libraryPath))
  ipcMain.handle('scout:createConversation', () => createConversation(cfg.libraryPath))
  ipcMain.handle('scout:getConversation', (_, args: { id: string }) => getConversation(cfg.libraryPath, args.id))
  ipcMain.handle('scout:renameConversation', (_, args: { id: string; title: string }) =>
    renameConversation(cfg.libraryPath, args.id, args.title),
  )
  ipcMain.handle('scout:deleteConversation', (_, args: { id: string }) => deleteConversation(cfg.libraryPath, args.id))
  ipcMain.handle('scout:listArticles', () => listArticles(cfg.libraryPath))
  ipcMain.handle('scout:deleteArticle', (_, args: { filePath: string }) => deleteArticle(cfg.libraryPath, args.filePath))
}
