import { ipcMain, BrowserWindow } from 'electron'
import type { AppConfig } from '../env'
import { probeModel, chatStream } from '../lib/kimi'
import { finalizeProgress, finalizeReview, generateFable, generateGroupInspiration, generateFableFromReport, generateContinueSuggestions, generateWildcardInspiration } from '../lib/llm-tasks'
import { generateDiagram } from '../lib/diagram'
import fs from 'node:fs'
import path from 'node:path'
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
    externalMaterialsSummary?: string
  }) => {
    const win = getMainWindow()
    if (!win) return
    const ctl = new AbortController()
    sessions.set(args.sessionId, ctl)

    const send = (channel: string, ...payload: unknown[]) => {
      if (win.isDestroyed()) return
      win.webContents.send(channel, ...payload)
    }

    try {
      // assemblePrompt 是同步且会抛(例如 review 模式缺 reviewFileBody)。必须进 try,
      // 否则抛出后只在主进程终端 console.error,渲染层永远收不到 llm:error,UI 卡死。
      const system = assemblePrompt({
        mode: args.mode, difficulty: args.difficulty,
        profile: args.profile, reviewFileBody: args.reviewFileBody,
        progressSummary: args.progressSummary,
        selectedTopic: args.selectedTopic,
        userRequirement: args.userRequirement,
        externalMaterialsSummary: args.externalMaterialsSummary
      })
      const messages: Message[] = [{ role: 'system', content: system }, ...args.history]
      await chatStream(cfg, { messages, temperature: args.temperature, signal: ctl.signal },
        chunk => send('llm:chunk', args.sessionId, chunk))
      send('llm:done', args.sessionId)
    } catch (err: any) {
      if (err?.name === 'AbortError') return
      send('llm:error', args.sessionId, {
        code: err?.code ?? 'STREAM_FAIL', message: String(err?.message ?? err)
      })
    } finally { sessions.delete(args.sessionId) }
  })

  ipcMain.handle('llm:abort', async (_, sessionId: string) => {
    sessions.get(sessionId)?.abort()
    sessions.delete(sessionId)
  })

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

  ipcMain.handle('llm:wildcardInspiration', async (_, args: {
    profile: Profile
    topics: { title: string }[]
  }) => {
    try {
      if (process.env.NODE_ENV === 'test') {
        return { title: '量子烹饪学', hook: '当粒子对撞机遇上分子料理', topic: '量子烹饪学' }
      }
      return await generateWildcardInspiration(cfg, args)
    } catch (err: any) {
      const message = String(err?.message ?? err)
      console.error('[llm:wildcardInspiration] error:', message)
      throw new Error(message)
    }
  })

  ipcMain.handle('llm:finalizeProgress', async (_, history: Message[]) => {
    // E2E fast path: avoid real LLM calls that can take minutes and cause timeouts
    if (process.env.NODE_ENV === 'test') {
      const lastUserMsg = history.filter(m => m.role === 'user').pop()
      const topic = lastUserMsg?.content ?? '测试归档'
      return {
        title: topic,
        description: 'E2E 测试归档',
        body: `> E2E 测试生成的学习报告\n\n${history.map(m => `**${m.role}**: ${m.content}`).join('\n\n')}`,
        progress_summary: 'E2E 测试进度总结'
      }
    }
    return finalizeProgress(cfg, history)
  })

  ipcMain.handle('llm:finalizeReview', async (_, args: {
    history: Message[]; existingBody: string
  }) => finalizeReview(cfg, args))

  ipcMain.handle('llm:generateFable', async (_, args: {
    history: Message[]; topic: string
  }) => {
    // E2E fast path: skip real LLM fable generation
    if (process.env.NODE_ENV === 'test') {
      return {
        title: `${args.topic} — 寓言`,
        body: '> E2E 测试生成的寓言\n\n' + args.history.map(m => `**${m.role}**: ${m.content}`).join('\n\n')
      }
    }
    return generateFable(cfg, args)
  })

  ipcMain.handle('llm:generateFableFromReport', async (_, args: {
    reportBody: string; topic: string; userPrompt?: string
  }) => generateFableFromReport(cfg, args))

  ipcMain.handle('llm:generateContinueSuggestions', async (_, args: {
    topic: string
    dirName: string
  }) => {
    try {
      if (process.env.NODE_ENV === 'test') {
        return [
          { title: 'NestJS 中的装饰器模式', context: 'TypeScript 装饰器', rationale: '贴近实际项目', benefit: '提升框架理解' },
          { title: '依赖注入原理', context: 'IoC 容器', rationale: '补全基础', benefit: '理解底层机制' },
        ]
      }
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
      if (mermaid && mermaid.trim().startsWith('<svg')) {
        const sessionDir = path.join(cfg.libraryPath, args.dirName, `s${args.sessionNumber}`)
        const diagramPath = path.join(sessionDir, '学习图表.svg')
        fs.writeFileSync(diagramPath, mermaid, 'utf8')
      } else if (mermaid) {
        console.warn('[llm:generateDiagram] generated content is not valid SVG, skipping save')
      }
    } catch (err: any) {
      console.error('[llm:generateDiagram] error:', err?.message ?? err)
    }
  })
}
