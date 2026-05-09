import fs from 'node:fs'
import path from 'node:path'
import { ipcMain } from 'electron'
import { parseFrontmatter, serializeFrontmatter } from '../lib/frontmatter'
import { resolveTitleConflict, buildReviewAppendix, bumpReviewFrontmatter } from '../lib/archive'
import type { AppConfig } from '../env'
import type { FileMeta, Frontmatter, TopicMeta, SessionMeta } from '@shared/index'

function getSessionMeta(sessionDir: string): SessionMeta {
  const files = fs.readdirSync(sessionDir, { withFileTypes: true })
    .filter(d => d.isFile())
    .map(d => d.name)

  const dirName = path.basename(sessionDir)
  const sessionMatch = dirName.match(/^s(\d+)$/)
  const sessionNumber = sessionMatch ? parseInt(sessionMatch[1], 10) : 1

  const hasReport = files.includes('学习报告.md')
  const hasTranscript = files.includes('原始对话.md')
  const hasReview = files.includes('复习报告.md')

  const fableFiles = files.filter(n => /^寓言(\d+)?\.md$/.test(n))
  const hasFable = fableFiles.length > 0
  const fableCount = fableFiles.length

  const hasImage = files.some(n => /^学习配图\.\w+$/.test(n))
  const hasFableImage = files.some(n => /^寓言配图(-research)?\.\w+$/.test(n))

  let date = ''

  if (hasReport) {
    try {
      const reportPath = path.join(sessionDir, '学习报告.md')
      const raw = fs.readFileSync(reportPath, 'utf8')
      const { frontmatter } = parseFrontmatter(raw, { filename: '学习报告.md' })
      date = frontmatter.created || ''
    } catch (err) {
      console.error(`[getSessionMeta] failed to parse frontmatter in ${sessionDir}:`, err)
    }
  }

  return {
    sessionNumber,
    date,
    hasReport,
    hasTranscript,
    hasReview,
    hasFable,
    fableCount,
    hasImage,
    hasFableImage,
  }
}

function getTopicMeta(topicDir: string): TopicMeta | null {
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

  if (sessionDirs.length > 0) {
    for (const sd of sessionDirs) {
      try {
        const sessionPath = path.join(topicDir, sd)
        sessions.push(getSessionMeta(sessionPath))
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

  // Get title from the latest session's 学习报告.md
  let title = dirName
  const latestSession = sessions[sessions.length - 1]
  if (latestSession?.hasReport) {
    try {
      const reportPath = path.join(topicDir, `s${latestSession.sessionNumber}`, '学习报告.md')
      const raw = fs.readFileSync(reportPath, 'utf8')
      const { frontmatter } = parseFrontmatter(raw, { filename: '学习报告.md' })
      if (frontmatter.title) {
        title = frontmatter.title
      }
    } catch (err) {
      console.error(`[getTopicMeta] failed to read title from latest session in ${topicDir}:`, err)
    }
  }

  // Calculate last_studied from the latest session
  const lastSession = sessions[sessions.length - 1]
  const last_studied = lastSession?.date || ''

  let last_studied_days = 0
  if (last_studied) {
    const now = new Date()
    const lastDate = new Date(last_studied)
    last_studied_days = Math.floor((now.getTime() - lastDate.getTime()) / (1000 * 60 * 60 * 24))
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
    const raw = fs.readFileSync(file_path, 'utf8')
    return parseFrontmatter(raw, { filename: path.basename(file_path) })
  })

  ipcMain.handle('files:writeProgress', async (_, args: {
    title: string; body: string; difficulty: 'high' | 'mid' | 'low'
  }) => {
    const now = new Date()
    const existing = fs.readdirSync(cfg.libraryPath).filter(n => n.endsWith('.md'))
    const fileName = resolveTitleConflict(args.title, existing, now)
    const file_path = path.join(cfg.libraryPath, fileName)
    const fm: Frontmatter = {
      title: args.title,
      created: now.toISOString(),
      last_studied: now.toISOString(),
      review_count: 0,
      difficulty: args.difficulty,
      tags: []
    }
    fs.writeFileSync(file_path, serializeFrontmatter(fm, args.body), 'utf8')
    return { file_path }
  })

  ipcMain.handle('files:appendReview', async (_, args: { file_path: string; summary: string }) => {
    const raw = fs.readFileSync(args.file_path, 'utf8')
    const { frontmatter, body } = parseFrontmatter(raw)
    const now = new Date()
    const newFm = bumpReviewFrontmatter(frontmatter, now)
    const newBody = body.trimEnd() + buildReviewAppendix(now, args.summary)
    fs.writeFileSync(args.file_path, serializeFrontmatter(newFm, newBody), 'utf8')
  })

  ipcMain.handle('files:recoveryDump', async (_, args: { filename: string; content: string }) => {
    const { dumpRecovery } = await import('../lib/recovery')
    dumpRecovery(args.filename, args.content)
  })
}
