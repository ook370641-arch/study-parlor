import { ipcMain, BrowserWindow } from 'electron'
import type { AppConfig } from '../env'
import { probeModel, chatStream } from '../lib/kimi'
import { generateInspirations, finalizeProgress, finalizeReview } from '../lib/llm-tasks'
import type { Message, Profile } from '@shared/index'

const sessions = new Map<string, AbortController>()

export function registerLlmIpc(cfg: AppConfig, getMainWindow: () => BrowserWindow | null) {
  ipcMain.handle('llm:probe', async () => probeModel(cfg))

  ipcMain.handle('llm:start', async (_, args: {
    sessionId: string; messages: Message[]; temperature: number
  }) => {
    const win = getMainWindow()
    if (!win) return
    const ctl = new AbortController()
    sessions.set(args.sessionId, ctl)

    try {
      await chatStream(
        cfg,
        { messages: args.messages, temperature: args.temperature, signal: ctl.signal },
        chunk => win.webContents.send('llm:chunk', args.sessionId, chunk)
      )
      win.webContents.send('llm:done', args.sessionId)
    } catch (err: any) {
      if (err?.name === 'AbortError') return  // 主动中断,不算错
      win.webContents.send('llm:error', args.sessionId, {
        code: 'STREAM_FAIL',
        message: String(err?.message ?? err)
      })
    } finally {
      sessions.delete(args.sessionId)
    }
  })

  ipcMain.handle('llm:abort', async (_, sessionId: string) => {
    sessions.get(sessionId)?.abort()
    sessions.delete(sessionId)
  })

  ipcMain.handle('llm:inspirations', async (_, args: {
    profile: Profile; existingTitles: string[]
  }) => generateInspirations(cfg, args))

  ipcMain.handle('llm:finalizeProgress', async (_, history: Message[]) =>
    finalizeProgress(cfg, history))

  ipcMain.handle('llm:finalizeReview', async (_, args: {
    history: Message[]; existingBody: string
  }) => finalizeReview(cfg, args))
}
