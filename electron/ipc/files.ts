import fs from 'node:fs'
import path from 'node:path'
import { ipcMain } from 'electron'
import { parseFrontmatter, serializeFrontmatter } from '../lib/frontmatter'
import type { AppConfig } from '../env'
import type { Frontmatter, TopicMeta, SessionMeta } from '@shared/index'

export function getSessionMeta(sessionDir: string): SessionMeta {
  const files = fs.readdirSync(sessionDir, { withFileTypes: true })
    .filter(d => d.isFile())
    .map(d => d.name)

  const dirName = path.basename(sessionDir)
  const sessionMatch = dirName.match(/^s(\d+)$/)
  let sessionNumber = sessionMatch ? parseInt(sessionMatch[1], 10) : 1

  const hasReport = files.includes('学习报告.md')
  const hasTranscript = files.includes('原始对话.md')
  const hasReview = files.includes('复习报告.md')

  const fableFiles = files.filter(n => /^寓言(\d+)?\.md$/.test(n))
  const hasFable = fableFiles.length > 0
  const fableCount = fableFiles.length

  const hasImage = files.some(n => /^学习配图\.\w+$/.test(n))
  const hasFableImage = files.some(n => /^寓言配图(-research)?\.\w+$/.test(n))

  let date = ''
  let title: string | undefined

  if (hasReport) {
    try {
      const reportPath = path.join(sessionDir, '学习报告.md')
      const raw = fs.readFileSync(reportPath, 'utf8')
      const { frontmatter } = parseFrontmatter(raw, { filename: '学习报告.md' })
      const created = frontmatter.created
      date = created instanceof Date ? created.toISOString() : String(created || '')
      if (frontmatter.session_number != null && frontmatter.session_number > 0) {
        sessionNumber = frontmatter.session_number
      }
      if (frontmatter.title) {
        title = frontmatter.title
      }
    } catch (err) {
      console.error(`[getSessionMeta] failed to parse frontmatter in ${sessionDir}:`, err)
    }
  }

  return {
    sessionNumber,
    date,
    title,
    hasReport,
    hasTranscript,
    hasReview,
    hasFable,
    fableCount,
    hasImage,
    hasFableImage,
  }
}

export function getTopicMeta(topicDir: string): TopicMeta | null {
  const dirName = path.basename(topicDir)

  const entries = fs.readdirSync(topicDir, { withFileTypes: true })

  const sessionDirs = entries
    .filter(d => d.isDirectory() && /^s\d+$/.test(d.name))
    .map(d => d.name)
    .sort((a, b) => {
      const na = parseInt(a.slice(1), 10)
      const nb = parseInt(b.slice(1), 10)
      return na - nb
    })

  const allFiles = entries
    .filter(d => d.isFile())
    .map(d => d.name)

  let sessions: SessionMeta[] = []
  const sessionDirMap: Record<number, string> = {}

  if (sessionDirs.length > 0) {
    for (const sd of sessionDirs) {
      try {
        const sessionPath = path.join(topicDir, sd)
        const meta = getSessionMeta(sessionPath)
        sessions.push(meta)
        sessionDirMap[meta.sessionNumber] = sd
      } catch (err) {
        console.error(`[getTopicMeta] failed to read session ${sd} in ${topicDir}:`, err)
      }
    }
  } else if (allFiles.length > 0) {
    // Pure image topic: no session dirs but has files
    const hasImage = allFiles.some(n => /^学习配图\.\w+$/.test(n))
    const hasFableImage = allFiles.some(n => /^寓言配图(-research)?\.\w+$/.test(n))
    sessions = [{
      sessionNumber: 1,
      date: '',
      hasReport: false,
      hasTranscript: false,
      hasReview: false,
      hasFable: false,
      fableCount: 0,
      hasImage,
      hasFableImage,
    }]
  } else {
    // Empty topic directory — skip
    return null
  }

  // Get title from the latest session's frontmatter (already read by getSessionMeta)
  let title = dirName
  const latestSession = sessions[sessions.length - 1]
  if (latestSession?.title) {
    title = latestSession.title
  }

  // Calculate last_studied from the latest session
  const lastSession = sessions[sessions.length - 1]
  const last_studied = lastSession?.date || ''

  let last_studied_days = 0
  if (last_studied) {
    const now = new Date()
    const lastDate = new Date(last_studied)
    last_studied_days = Math.max(0, Math.floor((now.getTime() - lastDate.getTime()) / (1000 * 60 * 60 * 24)))
  }

  return {
    dirName,
    title,
    sessionCount: sessions.length,
    sessions,
    last_studied,
    last_studied_days,
  }
}

export function registerFilesIpc(cfg: AppConfig) {
  ipcMain.handle('files:scan', async (): Promise<TopicMeta[]> => {
    const root = cfg.libraryPath
    if (!fs.existsSync(root)) {
      console.error(`[files:scan] library path does not exist: ${root}`)
      return []
    }

    const entries = fs.readdirSync(root, { withFileTypes: true })
    const topicDirs = entries.filter(d => d.isDirectory()).map(d => d.name)

    const results: TopicMeta[] = []
    for (const td of topicDirs) {
      const topicPath = path.join(root, td)
      try {
        const meta = getTopicMeta(topicPath)
        if (meta) {
          results.push(meta)
        }
      } catch (err) {
        console.error(`[files:scan] failed to read topic ${td}:`, err)
      }
    }

    // Sort by last_studied descending (newest first)
    results.sort((a, b) => {
      if (!a.last_studied && !b.last_studied) return 0
      if (!a.last_studied) return 1
      if (!b.last_studied) return -1
      return new Date(b.last_studied).getTime() - new Date(a.last_studied).getTime()
    })

    return results
  })

  ipcMain.handle('files:read', async (_, file_path: string) => {
    const resolved = path.resolve(file_path)
    const rootResolved = path.resolve(cfg.libraryPath)
    if (!resolved.startsWith(rootResolved + path.sep) && resolved !== rootResolved) {
      throw new Error('Access denied: file outside library path')
    }
    const raw = fs.readFileSync(resolved, 'utf8')
    return parseFrontmatter(raw, { filename: path.basename(resolved) })
  })

  ipcMain.handle('files:writeProgress', async (_, args: {
    title: string; body: string; difficulty: 'high' | 'mid' | 'low'
    dirName: string; session_number: number; progress_summary?: string
  }) => {
    const now = new Date()
    const topicDir = path.join(cfg.libraryPath, args.dirName)
    const sessionDir = path.join(topicDir, `s${args.session_number}`)
    fs.mkdirSync(sessionDir, { recursive: true })
    const filePath = path.join(sessionDir, '学习报告.md')
    const fm: Frontmatter = {
      title: args.title,
      session_number: args.session_number,
      created: now.toISOString(),
      last_studied: now.toISOString(),
      review_count: 0,
      difficulty: args.difficulty,
      tags: [],
      type: 'progress',
      progress_summary: args.progress_summary
    }
    fs.writeFileSync(filePath, serializeFrontmatter(fm, args.body), 'utf8')
    return { file_path: filePath }
  })

  ipcMain.handle('files:readAnchor', async (_, dirName: string) => {
    const topicDir = path.join(cfg.libraryPath, dirName)
    const entries = fs.readdirSync(topicDir, { withFileTypes: true })
    const sessionDirs = entries
      .filter(e => e.isDirectory() && /^s\d+$/.test(e.name))
      .map(e => e.name)
      .sort((a, b) => {
        const na = parseInt(a.replace('s', ''), 10)
        const nb = parseInt(b.replace('s', ''), 10)
        return na - nb
      })
    if (sessionDirs.length === 0) {
      throw new Error(`No sessions found for topic: ${dirName}`)
    }
    const latestDir = path.join(topicDir, sessionDirs[sessionDirs.length - 1])
    const reportPath = path.join(latestDir, '学习报告.md')
    if (!fs.existsSync(reportPath)) {
      throw new Error(`No report found in ${latestDir}`)
    }
    const raw = fs.readFileSync(reportPath, 'utf8')
    return parseFrontmatter(raw, { filename: path.basename(reportPath) })
  })

  ipcMain.handle('files:writeReviewReport', async (_, args: {
    topic: string; dirName: string; summary: string; gaps: string; review_index: number
  }) => {
    const now = new Date()
    const topicDir = path.join(cfg.libraryPath, args.dirName)
    const entries = fs.readdirSync(topicDir, { withFileTypes: true })
    const sessionDirs = entries
      .filter(e => e.isDirectory() && /^s\d+$/.test(e.name))
      .map(e => e.name)
      .sort((a, b) => {
        const na = parseInt(a.replace('s', ''), 10)
        const nb = parseInt(b.replace('s', ''), 10)
        return na - nb
      })
    if (sessionDirs.length === 0) {
      throw new Error(`No sessions found for topic: ${args.dirName}`)
    }
    const targetSession = sessionDirs[sessionDirs.length - 1]
    const sessionDir = path.join(topicDir, targetSession)
    const filePath = path.join(sessionDir, '复习报告.md')
    const yyyy = now.getFullYear()
    const mm = String(now.getMonth() + 1).padStart(2, '0')
    const dd = String(now.getDate()).padStart(2, '0')
    const content = `# ${args.topic} — 复习报告 ${args.review_index}\n\n**日期**: ${yyyy}-${mm}-${dd}\n\n## 复习摘要\n${args.summary.trim()}\n\n## 知识缺口\n${args.gaps.trim()}\n`
    if (fs.existsSync(filePath)) {
      fs.appendFileSync(filePath, '\n\n---\n\n' + content.replace(/^# .*\n/, `## 复习报告 ${args.review_index}\n`), 'utf8')
    } else {
      fs.writeFileSync(filePath, content, 'utf8')
    }
  })

  ipcMain.handle('files:writeTranscript', async (_, args: {
    dirName: string; sessionNumber: number; content: string
  }) => {
    const topicDir = path.join(cfg.libraryPath, args.dirName)
    const sessionDir = path.join(topicDir, `s${args.sessionNumber}`)
    fs.mkdirSync(sessionDir, { recursive: true })
    const filePath = path.join(sessionDir, '原始对话.md')
    fs.writeFileSync(filePath, args.content, 'utf8')
  })

  ipcMain.handle('files:readSessionFile', async (_, args: {
    dirName: string; sessionNumber: number; fileName: string
  }) => {
    const filePath = path.join(cfg.libraryPath, args.dirName, `s${args.sessionNumber}`, args.fileName)
    const resolved = path.resolve(filePath)
    const rootResolved = path.resolve(cfg.libraryPath)
    if (!resolved.startsWith(rootResolved + path.sep) && resolved !== rootResolved) {
      throw new Error('Access denied: file outside library path')
    }
    if (!fs.existsSync(resolved)) {
      throw new Error(`File not found: ${resolved}`)
    }
    const isImage = /\.(png|jpe?g|gif|webp)$/i.test(resolved)
    if (isImage) {
      const buffer = fs.readFileSync(resolved)
      return { content: buffer.toString('base64'), mimeType: 'image/png' }
    }
    const content = fs.readFileSync(resolved, 'utf8')
    return { content, mimeType: 'text/markdown' }
  })

  ipcMain.handle('files:recoveryDump', async (_, args: { filename: string; content: string }) => {
    const { dumpRecovery } = await import('../lib/recovery')
    dumpRecovery(args.filename, args.content)
  })
}
