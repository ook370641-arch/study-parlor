import fs from 'node:fs'
import path from 'node:path'
import { app, ipcMain } from 'electron'
import { parseFrontmatter, serializeFrontmatter } from '../lib/frontmatter'
import { generateContinueSuggestions, readTopicReportSummaries } from '../lib/llm-tasks'
import { patchState } from './state'
import type { AppConfig } from '../env'
import type { TopicMeta, SessionMeta, Group, GroupMapping, TopicContinueCache, SearchSource } from '@shared/index'

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

  const diagramFile = files.find(n => n === '学习图表.svg')
  const hasDiagram = !!diagramFile

  let date = ''
  let title: string | undefined

  if (hasReport) {
    try {
      const reportPath = path.join(sessionDir, '学习报告.md')
      const raw = fs.readFileSync(reportPath, 'utf8')
      const { frontmatter } = parseFrontmatter(raw, { filename: '学习报告.md' })
      const created = frontmatter.created as string | Date
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
    hasDiagram,
    reportFile,
    transcriptFile,
    reviewFile,
    fableFile,
    diagramFile,
  }
}

function loadGroupFile(filePath: string): { version: number; groups: Group[]; mapping: GroupMapping } {
  const fallback = { version: 1, groups: [{ id: 'default', name: '默认', color: '#d97757' }], mapping: {} }
  if (fs.existsSync(filePath)) {
    try {
      const data = JSON.parse(fs.readFileSync(filePath, 'utf8'))
      if (data && Array.isArray(data.groups)) return data
      console.error('[groups] .study-groups.json has invalid structure, falling back to default')
    } catch {
      console.error('[groups] .study-groups.json corrupted, falling back to default')
    }
  }
  return fallback
}

function validateDirName(dirName: string): void {
  if (!dirName || dirName.includes('..') || dirName.includes('/') || dirName.includes('\\')) {
    throw new Error('Invalid dirName')
  }
}

export function getSortedSessionDirs(topicDir: string): string[] {
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
    const hasDiagram = allFiles.some(n => /^学习配图\.\w+$/.test(n))
    sessions = [{
      sessionNumber: 1,
      date: '',
      hasReport: false,
      hasTranscript: false,
      hasReview: false,
      hasFable: false,
      fableCount: 0,
      hasDiagram,
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
    if (!isNaN(lastDate.getTime())) {
      last_studied_days = Math.max(0, Math.floor((now.getTime() - lastDate.getTime()) / (1000 * 60 * 60 * 24)))
    }
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

function parseExternalMaterialsBody(body: string): { summary: string; sources: SearchSource[] } {
  const summaryMatch = body.match(/## 摘要\s*\n([\s\S]*?)(?=\n## |$)/)
  const summary = summaryMatch ? summaryMatch[1].trim() : ''
  const sourcesMatch = body.match(/## 来源\s*\n([\s\S]*?)(?=\n## |$)/)
  const sources: SearchSource[] = []
  if (sourcesMatch) {
    const lines = sourcesMatch[1].trim().split('\n')
    for (const line of lines) {
      const match = line.match(/^\d+\.\s*\[([^\]]+)\]\(([^)]+)\)(?:\s*—\s*(.*))?$/)
      if (match) {
        sources.push({ title: match[1], url: match[2], snippet: match[3] })
      }
    }
  }
  return { summary, sources }
}

export { parseExternalMaterialsBody }

export function registerFilesIpc(cfg: AppConfig) {
  // Promise 队列：串行化 updateContinueSuggestions 调用，避免并发覆盖
  let _suggestionQueue: Promise<void> = Promise.resolve()
  function enqueueSuggestion(task: () => Promise<void>): void {
    _suggestionQueue = _suggestionQueue.then(task).catch(() => {})
  }

  async function updateContinueSuggestions(dirName: string, topic?: string) {
    try {
      const summaries = readTopicReportSummaries(cfg.libraryPath, dirName)
      if (summaries.length === 0) {
        // 没有报告，删除缓存
        const { getCurrentState } = await import('./state')
        const current = getCurrentState()
        const next = { ...current.topicContinueSuggestions }
        delete next[dirName]
        patchState({ topicContinueSuggestions: next })
        return
      }

      // 如果没有传入 topic，尝试从最新报告 frontmatter 读取
      let resolvedTopic = topic
      if (!resolvedTopic) {
        const topicDir = path.join(cfg.libraryPath, dirName)
        const sessionDirs = getSortedSessionDirs(topicDir)
        if (sessionDirs.length > 0) {
          const latestReport = path.join(topicDir, sessionDirs[sessionDirs.length - 1], '学习报告.md')
          if (fs.existsSync(latestReport)) {
            try {
              const raw = fs.readFileSync(latestReport, 'utf8')
              const { frontmatter } = parseFrontmatter(raw, { filename: '学习报告.md' })
              if (frontmatter.title) {
                resolvedTopic = frontmatter.title
              }
            } catch {}
          }
        }
      }
      if (!resolvedTopic) {
        resolvedTopic = dirName
      }

      const suggestions = await generateContinueSuggestions(cfg, {
        topic: resolvedTopic,
        dirName
      })

      // 计算当前会话数
      const topicDir = path.join(cfg.libraryPath, dirName)
      const sessionDirs = getSortedSessionDirs(topicDir)
      const sessionCount = sessionDirs.length

      const cache: TopicContinueCache = {
        generatedAt: new Date().toISOString(),
        sessionCount,
        suggestions: suggestions.length > 0 ? suggestions : []
      }

      const { getCurrentState } = await import('./state')
      const current = getCurrentState()
      patchState({
        topicContinueSuggestions: {
          ...current.topicContinueSuggestions,
          [dirName]: cache
        }
      })
    } catch (err) {
      console.error(`[updateContinueSuggestions] failed for ${dirName}:`, err)
      // 静默失败，保留旧缓存
    }
  }

  ipcMain.handle('files:scan', async (): Promise<TopicMeta[]> => {
    const scanStart = Date.now()
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

    console.log(`[files:scan] ${topicDirs.length} topics scanned in ${Date.now() - scanStart}ms`)
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

  function resolveMimeType(filePath: string): string {
    const ext = path.extname(filePath).toLowerCase()
    switch (ext) {
      case '.png': return 'image/png'
      case '.gif': return 'image/gif'
      case '.webp': return 'image/webp'
      case '.svg': return 'image/svg+xml'
      case '.jpg':
      case '.jpeg':
      default: return 'image/jpeg'
    }
  }

  ipcMain.handle('files:readAssetAsDataUrl', async (_, mdFilePath: string, relativePath: string) => {
    const resolvedMd = path.resolve(mdFilePath)
    const rootResolved = path.resolve(cfg.libraryPath)
    if (!resolvedMd.startsWith(rootResolved + path.sep) && resolvedMd !== rootResolved) {
      throw new Error('Access denied: markdown file outside library path')
    }
    const assetPath = path.resolve(path.dirname(resolvedMd), relativePath)
    if (!assetPath.startsWith(rootResolved + path.sep) && assetPath !== rootResolved) {
      throw new Error('Access denied: asset outside library path')
    }
    if (!fs.existsSync(assetPath)) {
      throw new Error(`Asset not found: ${assetPath}`)
    }
    const buffer = fs.readFileSync(assetPath)
    const mime = resolveMimeType(assetPath)
    return `data:${mime};base64,${buffer.toString('base64')}`
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
    if (fs.existsSync(filePath)) {
      throw new Error(`学习报告已存在: ${filePath}`)
    }
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

    // 异步更新续谈推荐（不阻塞返回）
    enqueueSuggestion(() => updateContinueSuggestions(args.dirName, args.title))

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

  ipcMain.handle('files:readExternalMaterials', async (_, dirName: string) => {
    validateDirName(dirName)
    const topicDir = path.join(cfg.libraryPath, dirName)
    const sessionDirs = getSortedSessionDirs(topicDir)
    if (sessionDirs.length === 0) return null
    const latestDir = path.join(topicDir, sessionDirs[sessionDirs.length - 1])
    const filePath = path.join(latestDir, '外部资料.md')
    if (!fs.existsSync(filePath)) return null
    try {
      const raw = fs.readFileSync(filePath, 'utf8')
      const { frontmatter, body } = parseFrontmatter(raw, { filename: '外部资料.md' })
      const { summary, sources } = parseExternalMaterialsBody(body)
      return {
        summary,
        sources,
        topic: frontmatter.topic as string | undefined
      }
    } catch (err) {
      console.warn(`[files:readExternalMaterials] failed to read ${filePath}:`, err)
      return null
    }
  })

  ipcMain.handle('files:writeReviewReport', async (_, args: {
    topic: string; dirName: string; summary: string; gaps: string[]; review_index: number
    mastery_checklist?: string[]; future_advice?: string[]
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
    const checklist = args.mastery_checklist && args.mastery_checklist.length > 0
      ? args.mastery_checklist.map(c => `- [ ] ${c.trim()}`).join('\n')
      : ''
    const advice = args.future_advice && args.future_advice.length > 0
      ? args.future_advice.map((a, i) => `${i + 1}. ${a.trim()}`).join('\n')
      : ''
    const sections = [
      `## 复习摘要\n${args.summary.trim()}`,
      args.gaps.length > 0 ? `## 知识缺口\n${gapsList}` : '',
      checklist ? `## 掌握检验\n${checklist}` : '',
      advice ? `## 未来发展建议\n${advice}` : ''
    ].filter(Boolean)
    const body = sections.join('\n\n') + '\n'
    if (fs.existsSync(filePath)) {
      // Existing file: read → update frontmatter → rewrite
      const existing = fs.readFileSync(filePath, 'utf8')
      const { frontmatter, body: existingBody } = parseFrontmatter(existing, { filename: '复习报告.md' })
      const updatedFm = {
        ...frontmatter,
        review_index: args.review_index,
        last_reviewed: now.toISOString(),
      }
      const combinedBody = existingBody + '\n\n---\n\n' + body
      fs.writeFileSync(filePath, serializeFrontmatter('review', updatedFm, combinedBody), 'utf8')
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
    const isSvg = resolved.endsWith('.svg')
    if (isImage) {
      const buffer = fs.readFileSync(resolved)
      return { content: buffer.toString('base64'), mimeType: getMimeType(resolved) }
    }
    const content = fs.readFileSync(resolved, 'utf8')
    return { content, mimeType: isSvg ? 'image/svg+xml' : 'text/markdown' }
  })

  ipcMain.handle('files:writeExternalMaterials', async (_, args: {
    dirName: string
    sessionNumber: number
    topic: string
    summary: string
    sources: SearchSource[]
  }) => {
    validateDirName(args.dirName)
    const now = new Date()
    const topicDir = path.join(cfg.libraryPath, args.dirName)
    const sessionDir = path.join(topicDir, `s${args.sessionNumber}`)
    fs.mkdirSync(sessionDir, { recursive: true })
    const filePath = path.join(sessionDir, '外部资料.md')
    if (fs.existsSync(filePath)) {
      throw new Error(`外部资料已存在: ${filePath}`)
    }
    const fm = {
      title: '外部资料',
      type: 'external-materials' as const,
      created: now.toISOString(),
      session_number: args.sessionNumber,
      topic: args.topic,
    }
    const sourceLines = args.sources.map((s, i) =>
      `${i + 1}. [${s.title}](${s.url})${s.snippet ? ` — ${s.snippet}` : ''}`
    ).join('\n')
    const body = `## 摘要\n${args.summary.trim()}\n\n## 来源\n${sourceLines}\n`
    fs.writeFileSync(filePath, serializeFrontmatter('external-materials', fm, body), 'utf8')
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

    // 异步更新续谈推荐（不阻塞返回）
    enqueueSuggestion(() => updateContinueSuggestions(args.dirName))
  })

  ipcMain.handle('files:getExtensionInfo', async () => {
    const basePath = app.isPackaged
      ? path.dirname(app.getPath('exe'))
      : app.getAppPath()
    const picturesDir = path.join(basePath, 'Pictures')
    const indexPath = path.join(picturesDir, 'index.json')
    let paintingCount = 0
    try {
      const raw = fs.readFileSync(indexPath, 'utf8')
      const arr = JSON.parse(raw)
      if (Array.isArray(arr)) paintingCount = arr.length
    } catch {
      // Pictures/index.json may not exist; default to 0
    }
    return {
      libraryPath: cfg.libraryPath,
      paintingCount
    }
  })
}
