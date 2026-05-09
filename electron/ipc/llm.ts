import { ipcMain, BrowserWindow } from 'electron'
import type { AppConfig } from '../env'
import { probeModel, chatStream } from '../lib/kimi'
import { generateInspirations, finalizeProgress, finalizeReview, generateFable } from '../lib/llm-tasks'
import type { Message, Profile, Mode, Difficulty } from '@shared/index'
import { assemblePrompt } from '../lib/prompts'

const sessions = new Map<string, AbortController>()

export function registerLlmIpc(cfg: AppConfig, getMainWindow: () => BrowserWindow | null) {
  ipcMain.handle('llm:probe', async () => probeModel(cfg))

  ipcMain.handle('llm:start', async (_, args: {
    sessionId: string
    mode: Mode
    difficulty: Difficulty
    profile: Profile
    reviewFileBody?: string
    progressSummary?: string
    history: Message[]
    temperature: number
  }) => {
    const win = getMainWindow()
    if (!win) return
    const ctl = new AbortController()
    sessions.set(args.sessionId, ctl)

    const system = assemblePrompt({
      mode: args.mode, difficulty: args.difficulty,
      profile: args.profile, reviewFileBody: args.reviewFileBody,
      progressSummary: args.progressSummary
    })
    const messages: Message[] = [{ role: 'system', content: system }, ...args.history]

    try {
      await chatStream(cfg, { messages, temperature: args.temperature, signal: ctl.signal },
        chunk => win.webContents.send('llm:chunk', args.sessionId, chunk))
      win.webContents.send('llm:done', args.sessionId)
    } catch (err: any) {
      if (err?.name === 'AbortError') return
      win.webContents.send('llm:error', args.sessionId, {
        code: err?.code ?? 'STREAM_FAIL', message: String(err?.message ?? err)
      })
    } finally { sessions.delete(args.sessionId) }
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

  ipcMain.handle('llm:generateFable', async (_, args: {
    history: Message[]; topic: string
  }) => generateFable(cfg, args))
}
