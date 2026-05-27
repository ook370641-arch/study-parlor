import fs from 'node:fs'
import path from 'node:path'
import { ipcMain } from 'electron'
import { parseFrontmatter, serializeFrontmatter } from '../lib/frontmatter'
import type { AppConfig } from '../env'
import type { Frontmatter, TopicMeta, SessionMeta, Group, GroupMapping } from '@shared/index'

export function getSessionMeta(sessionDir: string): SessionMeta {
  const files = fs.readdirSync(sessionDir, { withFileTypes: true })
    .filter(d => d.isFile())
    .map(d => d.name)

  const dirName = path.basename(sessionDir)
  const sessionMatch = dirName.match(/^s(\d+)$/)
  let sessionNumber = sessionMatch ? parseInt(sessionMatch[1], 10) : 1

  const reportFile = files.find(n => n === '学习报告.md')
  const transcriptFile = files.find(n => n === '原始对话.md')
  const reviewFile = files.find(n => n === '复习报告.md')
  const hasReport = !!reportFile
  const hasTranscript = !!transcriptFile
  const hasReview = !!reviewFile

  const fableFiles = files.filter(n => /^寓言(\d+)?\.md$/.test(n))
  const hasFable = fableFiles.length > 0
  const fableCount = fableFiles.length
  const fableFile = fableFiles[0]

  const imageFile = files.find(n => /^学习配图\.\w+$/.test(n))
  const fableImageFile = files.find(n => /^寓言配图(-research)?\.\w+$/.test(n))
  const hasImage = !!imageFile
  const hasFableImage = !!fableImageFile

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
    reportFile,
    transcriptFile,
    reviewFile,
    fableFile,
    imageFile,
    fableImageFile,
  }
}

function loadGroupFile(filePath: string): { version: number; groups: Group[]; mapping: GroupMapping } {
  if (fs.existsSync(filePath)) {
    try {
      return JSON.parse(fs.readFileSync(filePath, 'utf8'))
    } catch {
      console.error('[groups] .study-groups.json corrupted, falling back to default')
    }
  }
  return { version: 1, groups: [{ id: 'default', name: '默认', color: '#d97757' }], mapping: {} }
}

function validateDirName(dirName: string): void {
  if (!dirName || dirName.includes('..') || dirName.includes('/') || dirName.includes('\\')) {
    throw new Error('Invalid dirName')
  }
}

function getSortedSessionDirs(topicDir: string): string[] {
  const entries = fs.readdirSync(topicDir, { withFileTypes: true })
  return entries
    .filter(e => e.isDirectory() && /^s\d+$/.test(e.name))
    .map(e => e.name)
    .sort((a, b) => {
      const na = parseInt(a.slice(1), 10)
      const nb = parseInt(b.slice(1), 10)
      return na - nb
    })
}

export function getTopicMeta(topicDir: string): TopicMeta | null {
  const dirName = path.basename(topicDir)

  const sessionDirs = getSortedSessionDirs(topicDir)

  const allFiles = fs.readdirSync(topicDir, { withFileTypes: true })
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

  // Title 始终用 dirName,与本地文件夹名对齐
  // (frontmatter.title 仍由 getSessionMeta 读出,保留在 SessionMeta.title 中,
  //  仅用于不希望污染 topic 标题的场合,比如某次具体 session 的元信息展示)
  const title = dirName

  // Calculate last_studied from the latest session
  const lastSession = sessions[sessions.length - 1]
  const last_studied = lastSession?.date || ''

  let last_studied_days = 0
  if (last_studied) {
    const now = new Date()
    const lastDate = new Date(last_studied)
    last_studied_days = Math.max(0, Math.floor((now.getTime() - lastDate.getTime()) / (1000 * 60 * 60 * 24)))
  }

  // Load group mapping
  const groupFile = path.join(path.dirname(topicDir), '.study-groups.json')
  const groupData = loadGroupFile(groupFile)
  const groupId = groupData.mapping[dirName] || 'default'

  return {
    dirName,
    title,
    sessionCount: sessions.length,
    sessions,
    last_studied,
    last_studied_days,
    groupId,
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
          // Debug: log first session file names to verify field population
          if (meta.sessions[0]) {
            console.log(`[files:scan] ${td}/s${meta.sessions[0].sessionNumber} files:`, {
              reportFile: meta.sessions[0].reportFile,
              fableFile: meta.sessions[0].fableFile,
            })
          }
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
    title: string; description?: string; body: string; difficulty: 'high' | 'mid' | 'low'
    dirName: string; session_number: number; progress_summary?: string
  }) => {
    validateDirName(args.dirName)
    const now = new Date()
    const topicDir = path.join(cfg.libraryPath, args.dirName)
    const sessionDir = path.join(topicDir, `s${args.session_number}`)
    fs.mkdirSync(sessionDir, { recursive: true })
    const filePath = path.join(sessionDir, '学习报告.md')
    const fm = {
      title: args.title,
      description: args.description,
      type: 'progress' as const,
      created: now.toISOString(),
      tags: [] as string[],
      session_number: args.session_number,
      difficulty: args.difficulty,
      progress_summary: args.progress_summary,
      last_studied: now.toISOString(),
      review_count: 0,
    }
    fs.writeFileSync(filePath, serializeFrontmatter('progress', fm, args.body), 'utf8')
    return { file_path: filePath }
  })

  ipcMain.handle('files:readAnchor', async (_, dirName: string) => {
    validateDirName(dirName)
    const topicDir = path.join(cfg.libraryPath, dirName)
    const sessionDirs = getSortedSessionDirs(topicDir)
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
    topic: string; dirName: string; summary: string; gaps: string[]; review_index: number
  }) => {
    validateDirName(args.dirName)
    const now = new Date()
    const topicDir = path.join(cfg.libraryPath, args.dirName)
    const sessionDirs = getSortedSessionDirs(topicDir)
    if (sessionDirs.length === 0) {
      throw new Error(`No sessions found for topic: ${args.dirName}`)
    }
    const targetSession = sessionDirs[sessionDirs.length - 1]
    const sessionDir = path.join(topicDir, targetSession)
    const filePath = path.join(sessionDir, '复习报告.md')
    const gapsList = args.gaps.map((g, i) => `${i + 1}. ${g.trim()}`).join('\n')
    const body = `## 复习摘要\n${args.summary.trim()}\n\n## 知识缺口\n${gapsList}\n`
    if (fs.existsSync(filePath)) {
      // Existing file: append body without frontmatter
      fs.appendFileSync(filePath, '\n\n---\n\n' + body, 'utf8')
    } else {
      // New file: write with frontmatter
      const fm = {
        title: `${args.topic} — 复习报告 ${args.review_index}`,
        type: 'review' as const,
        created: now.toISOString(),
        tags: [] as string[],
        review_index: args.review_index,
        last_reviewed: now.toISOString(),
        source_title: args.topic,
      }
      fs.writeFileSync(filePath, serializeFrontmatter('review', fm, body), 'utf8')
    }
  })

function getMimeType(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase()
  const map: Record<string, string> = {
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.webp': 'image/webp'
  }
  return map[ext] || 'application/octet-stream'
}

  ipcMain.handle('files:writeTranscript', async (_, args: {
    dirName: string; sessionNumber: number; content: string
  }) => {
    validateDirName(args.dirName)
    const now = new Date()
    const topicDir = path.join(cfg.libraryPath, args.dirName)
    const sessionDir = path.join(topicDir, `s${args.sessionNumber}`)
    fs.mkdirSync(sessionDir, { recursive: true })
    const filePath = path.join(sessionDir, '原始对话.md')
    const fm = {
      title: '原始对话',
      type: 'transcript' as const,
      created: now.toISOString(),
      tags: [] as string[],
      session_number: args.sessionNumber,
    }
    fs.writeFileSync(filePath, serializeFrontmatter('transcript', fm, args.content), 'utf8')
  })

  ipcMain.handle('files:writeFable', async (_, args: {
    dirName: string; sessionNumber: number; title: string; body: string
  }) => {
    validateDirName(args.dirName)
    const now = new Date()
    const topicDir = path.join(cfg.libraryPath, args.dirName)
    const sessionDir = path.join(topicDir, `s${args.sessionNumber}`)
    fs.mkdirSync(sessionDir, { recursive: true })
    const filePath = path.join(sessionDir, '寓言.md')
    const fm = {
      title: args.title,
      type: 'fable' as const,
      created: now.toISOString(),
      tags: [] as string[],
      source_topic: args.title,
    }
    fs.writeFileSync(filePath, serializeFrontmatter('fable', fm, args.body), 'utf8')
  })

  ipcMain.handle('files:readSessionFile', async (_, args: {
    dirName: string; sessionNumber: number; fileName: string
  }) => {
    validateDirName(args.dirName)
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
      return { content: buffer.toString('base64'), mimeType: getMimeType(resolved) }
    }
    const content = fs.readFileSync(resolved, 'utf8')
    return { content, mimeType: 'text/markdown' }
  })

  ipcMain.handle('files:recoveryDump', async (_, args: { filename: string; content: string }) => {
    const { dumpRecovery } = await import('../lib/recovery')
    dumpRecovery(args.filename, args.content)
  })

  // Group management IPC
  ipcMain.handle('groups:load', async (): Promise<{ groups: Group[]; mapping: GroupMapping }> => {
    const groupFile = path.join(cfg.libraryPath, '.study-groups.json')
    return loadGroupFile(groupFile)
  })

  ipcMain.handle('groups:updateMapping', async (_, mapping: GroupMapping): Promise<void> => {
    const groupFile = path.join(cfg.libraryPath, '.study-groups.json')
    const data = loadGroupFile(groupFile)
    data.mapping = mapping
    fs.writeFileSync(groupFile, JSON.stringify(data, null, 2), 'utf8')
  })

  ipcMain.handle('groups:create', async (_, name: string, color: string): Promise<Group> => {
    const groupFile = path.join(cfg.libraryPath, '.study-groups.json')
    const data = loadGroupFile(groupFile)
    const id = `group-${Date.now()}`
    const group: Group = { id, name, color }
    data.groups.push(group)
    fs.writeFileSync(groupFile, JSON.stringify(data, null, 2), 'utf8')
    return group
  })

  ipcMain.handle('groups:rename', async (_, id: string, name: string): Promise<void> => {
    const groupFile = path.join(cfg.libraryPath, '.study-groups.json')
    const data = loadGroupFile(groupFile)
    const g = data.groups.find(g => g.id === id)
    if (g) g.name = name
    fs.writeFileSync(groupFile, JSON.stringify(data, null, 2), 'utf8')
  })

  ipcMain.handle('groups:delete', async (_, id: string, fallbackId: string): Promise<void> => {
    const groupFile = path.join(cfg.libraryPath, '.study-groups.json')
    const data = loadGroupFile(groupFile)
    data.groups = data.groups.filter(g => g.id !== id)
    for (const [dirName, gid] of Object.entries(data.mapping)) {
      if (gid === id) data.mapping[dirName] = fallbackId
    }
    fs.writeFileSync(groupFile, JSON.stringify(data, null, 2), 'utf8')
  })

  ipcMain.handle('files:deleteArchivedSession', async (_, args: {
    dirName: string
    sessionNumber: number
  }): Promise<void> => {
    validateDirName(args.dirName)
    const sessionDir = path.join(cfg.libraryPath, args.dirName, `s${args.sessionNumber}`)
    if (!fs.existsSync(sessionDir)) {
      throw new Error(`Session directory not found: ${sessionDir}`)
    }
    fs.rmSync(sessionDir, { recursive: true, force: true })
  })
}
