import { ipcMain, BrowserWindow } from 'electron'
import type { AppConfig } from '../env'
import { probeModel, chatStream } from '../lib/kimi'
import { generateInspirations, finalizeProgress, finalizeReview, generateFable, generateGroupInspiration, generateFableFromReport, generateContinueSuggestions } from '../lib/llm-tasks'
import { generateDiagram } from '../lib/diagram'
import fs from 'fs'
import path from 'path'
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
    selectedTopic?: string
    userRequirement?: string
  }) => {
    const win = getMainWindow()
    if (!win) return
    const ctl = new AbortController()
    sessions.set(args.sessionId, ctl)

    try {
      // assemblePrompt 是同步且会抛(例如 review 模式缺 reviewFileBody)。必须进 try,
      // 否则抛出后只在主进程终端 console.error,渲染层永远收不到 llm:error,UI 卡死。
      const system = assemblePrompt({
        mode: args.mode, difficulty: args.difficulty,
        profile: args.profile, reviewFileBody: args.reviewFileBody,
        progressSummary: args.progressSummary,
        selectedTopic: args.selectedTopic,
        userRequirement: args.userRequirement
      })
      const messages: Message[] = [{ role: 'system', content: system }, ...args.history]
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

  ipcMain.handle('llm:groupInspiration', async (_, args: {
    groupName: string
    topics: { dirName: string; title: string }[]
    profile: Profile
    strategy?: 'v1' | 'v2' | 'v3'
  }) => {
    try {
      return await generateGroupInspiration(cfg, args)
    } catch (err: any) {
      const message = String(err?.message ?? err)
      console.error('[llm:groupInspiration] error:', message)
      throw new Error(message)
    }
  })

  ipcMain.handle('llm:finalizeProgress', async (_, history: Message[]) =>
    finalizeProgress(cfg, history))

  ipcMain.handle('llm:finalizeReview', async (_, args: {
    history: Message[]; existingBody: string
  }) => finalizeReview(cfg, args))

  ipcMain.handle('llm:generateFable', async (_, args: {
    history: Message[]; topic: string
  }) => generateFable(cfg, args))

  ipcMain.handle('llm:generateFableFromReport', async (_, args: {
    reportBody: string; topic: string; userPrompt?: string
  }) => generateFableFromReport(cfg, args))

  ipcMain.handle('llm:generateContinueSuggestions', async (_, args: {
    topic: string
    dirName: string
  }) => {
    try {
      return await generateContinueSuggestions(cfg, args)
    } catch (err: any) {
      const message = String(err?.message ?? err)
      console.error('[llm:generateContinueSuggestions] error:', message)
      throw new Error(message)
    }
  })

  ipcMain.handle('llm:generateDiagram', async (_, args: {
    dirName: string
    sessionNumber: number
    reportBody: string
  }) => {
    try {
      const mermaid = await generateDiagram(cfg, args.reportBody)
      if (mermaid) {
        const sessionDir = path.join(cfg.libraryPath, args.dirName, `s${args.sessionNumber}`)
        const diagramPath = path.join(sessionDir, '学习图表.mmd')
        fs.writeFileSync(diagramPath, mermaid, 'utf8')
      }
    } catch (err: any) {
      console.error('[llm:generateDiagram] error:', err?.message ?? err)
    }
  })
}
