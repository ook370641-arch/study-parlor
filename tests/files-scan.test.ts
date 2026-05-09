import { describe, expect, it, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { parseFrontmatter } from '@electron/lib/frontmatter'
import type { TopicMeta, SessionMeta } from '@shared/index'

// Re-implement the helper functions here for testing (since they are not exported)
// We copy the logic from electron/ipc/files.ts to test it independently

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
      const created = frontmatter.created
      date = created instanceof Date ? created.toISOString() : String(created || '')
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

function scanLibrary(root: string): TopicMeta[] {
  if (!fs.existsSync(root)) {
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
      console.error(`[scanLibrary] failed to read topic ${td}:`, err)
    }
  }

  results.sort((a, b) => {
    if (!a.last_studied && !b.last_studied) return 0
    if (!a.last_studied) return 1
    if (!b.last_studied) return -1
    return new Date(b.last_studied).getTime() - new Date(a.last_studied).getTime()
  })

  return results
}

// Helper to write a valid frontmatter markdown file
function writeReport(filePath: string, title: string, created: string) {
  const content = `---
title: ${title}
created: ${created}
review_count: 0
difficulty: mid
tags: []
type: progress
---
正文内容
`
  fs.writeFileSync(filePath, content, 'utf8')
}

describe('getSessionMeta', () => {
  let tmpDir: string

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'scan-test-'))
  })

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  it('reads a complete session with all files', () => {
    const sessionDir = path.join(tmpDir, 's1')
    fs.mkdirSync(sessionDir, { recursive: true })

    writeReport(path.join(sessionDir, '学习报告.md'), '群论基础', '2026-05-01T10:00:00+08:00')
    fs.writeFileSync(path.join(sessionDir, '原始对话.md'), '对话内容', 'utf8')
    fs.writeFileSync(path.join(sessionDir, '复习报告.md'), '复习内容', 'utf8')
    fs.writeFileSync(path.join(sessionDir, '寓言.md'), '寓言内容', 'utf8')
    fs.writeFileSync(path.join(sessionDir, '学习配图.png'), 'png', 'utf8')
    fs.writeFileSync(path.join(sessionDir, '寓言配图.jpg'), 'jpg', 'utf8')

    const meta = getSessionMeta(sessionDir)
    expect(meta.sessionNumber).toBe(1)
    expect(meta.date).toBe('2026-05-01T02:00:00.000Z')
    expect(meta.hasReport).toBe(true)
    expect(meta.hasTranscript).toBe(true)
    expect(meta.hasReview).toBe(true)
    expect(meta.hasFable).toBe(true)
    expect(meta.fableCount).toBe(1)
    expect(meta.hasImage).toBe(true)
    expect(meta.hasFableImage).toBe(true)
  })

  it('counts multiple fable files', () => {
    const sessionDir = path.join(tmpDir, 's2')
    fs.mkdirSync(sessionDir, { recursive: true })

    writeReport(path.join(sessionDir, '学习报告.md'), 'x', '2026-05-01T10:00:00+08:00')
    fs.writeFileSync(path.join(sessionDir, '寓言1.md'), 'f1', 'utf8')
    fs.writeFileSync(path.join(sessionDir, '寓言2.md'), 'f2', 'utf8')
    fs.writeFileSync(path.join(sessionDir, '寓言3.md'), 'f3', 'utf8')

    const meta = getSessionMeta(sessionDir)
    expect(meta.hasFable).toBe(true)
    expect(meta.fableCount).toBe(3)
  })

  it('detects fable-research image variant', () => {
    const sessionDir = path.join(tmpDir, 's1')
    fs.mkdirSync(sessionDir, { recursive: true })

    fs.writeFileSync(path.join(sessionDir, '寓言配图-research.png'), 'img', 'utf8')

    const meta = getSessionMeta(sessionDir)
    expect(meta.hasFableImage).toBe(true)
  })

  it('returns empty date when no 学习报告.md', () => {
    const sessionDir = path.join(tmpDir, 's3')
    fs.mkdirSync(sessionDir, { recursive: true })

    fs.writeFileSync(path.join(sessionDir, '原始对话.md'), '对话', 'utf8')

    const meta = getSessionMeta(sessionDir)
    expect(meta.hasReport).toBe(false)
    expect(meta.date).toBe('')
    expect(meta.sessionNumber).toBe(3)
  })

  it('handles session number from directory name', () => {
    const sessionDir = path.join(tmpDir, 's42')
    fs.mkdirSync(sessionDir, { recursive: true })

    writeReport(path.join(sessionDir, '学习报告.md'), 'x', '2026-05-01T10:00:00+08:00')

    const meta = getSessionMeta(sessionDir)
    expect(meta.sessionNumber).toBe(42)
  })
})

describe('getTopicMeta', () => {
  let tmpDir: string

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'topic-test-'))
  })

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  it('reads a topic with multiple sessions', () => {
    const topicDir = path.join(tmpDir, '群论')
    fs.mkdirSync(topicDir, { recursive: true })

    // s1 - older
    const s1 = path.join(topicDir, 's1')
    fs.mkdirSync(s1, { recursive: true })
    writeReport(path.join(s1, '学习报告.md'), '群论第一次学习', '2026-04-01T10:00:00+08:00')

    // s2 - newer, this title should be used
    const s2 = path.join(topicDir, 's2')
    fs.mkdirSync(s2, { recursive: true })
    writeReport(path.join(s2, '学习报告.md'), '群论进阶', '2026-05-05T10:00:00+08:00')

    const meta = getTopicMeta(topicDir)
    expect(meta).not.toBeNull()
    expect(meta!.dirName).toBe('群论')
    expect(meta!.title).toBe('群论进阶') // from latest session
    expect(meta!.sessionCount).toBe(2)
    expect(meta!.sessions.length).toBe(2)
    expect(meta!.last_studied).toBe('2026-05-05T02:00:00.000Z')
    expect(meta!.sessions[0].sessionNumber).toBe(1)
    expect(meta!.sessions[1].sessionNumber).toBe(2)
  })

  it('returns null for empty topic directory', () => {
    const topicDir = path.join(tmpDir, '空主题')
    fs.mkdirSync(topicDir, { recursive: true })

    const meta = getTopicMeta(topicDir)
    expect(meta).toBeNull()
  })

  it('handles pure image topic (no sessions, only image files)', () => {
    const topicDir = path.join(tmpDir, 'Agent')
    fs.mkdirSync(topicDir, { recursive: true })

    fs.writeFileSync(path.join(topicDir, '学习配图.png'), 'img', 'utf8')
    fs.writeFileSync(path.join(topicDir, '寓言配图-research.jpg'), 'img', 'utf8')

    const meta = getTopicMeta(topicDir)
    expect(meta).not.toBeNull()
    expect(meta!.dirName).toBe('Agent')
    expect(meta!.title).toBe('Agent')
    expect(meta!.sessionCount).toBe(1)
    expect(meta!.sessions[0].hasReport).toBe(false)
    expect(meta!.sessions[0].hasImage).toBe(true)
    expect(meta!.sessions[0].hasFableImage).toBe(true)
  })

  it('uses dirName as title when no 学习报告.md exists', () => {
    const topicDir = path.join(tmpDir, '无报告主题')
    fs.mkdirSync(topicDir, { recursive: true })

    const s1 = path.join(topicDir, 's1')
    fs.mkdirSync(s1, { recursive: true })
    fs.writeFileSync(path.join(s1, '原始对话.md'), '对话', 'utf8')

    const meta = getTopicMeta(topicDir)
    expect(meta).not.toBeNull()
    expect(meta!.title).toBe('无报告主题')
  })

  it('handles session without 学习报告.md', () => {
    const topicDir = path.join(tmpDir, '部分报告')
    fs.mkdirSync(topicDir, { recursive: true })

    const s1 = path.join(topicDir, 's1')
    fs.mkdirSync(s1, { recursive: true })
    writeReport(path.join(s1, '学习报告.md'), '有报告', '2026-05-01T10:00:00+08:00')

    const s2 = path.join(topicDir, 's2')
    fs.mkdirSync(s2, { recursive: true })
    fs.writeFileSync(path.join(s2, '原始对话.md'), '对话', 'utf8')

    const meta = getTopicMeta(topicDir)
    expect(meta).not.toBeNull()
    expect(meta!.sessionCount).toBe(2)
    expect(meta!.sessions[0].hasReport).toBe(true)
    expect(meta!.sessions[1].hasReport).toBe(false)
    expect(meta!.sessions[1].sessionNumber).toBe(2)
  })

  it('sorts sessions numerically not lexicographically', () => {
    const topicDir = path.join(tmpDir, '排序测试')
    fs.mkdirSync(topicDir, { recursive: true })

    // Create s10 before s2 to test numeric sorting
    const s10 = path.join(topicDir, 's10')
    fs.mkdirSync(s10, { recursive: true })
    writeReport(path.join(s10, '学习报告.md'), '第十次', '2026-05-10T10:00:00+08:00')

    const s2 = path.join(topicDir, 's2')
    fs.mkdirSync(s2, { recursive: true })
    writeReport(path.join(s2, '学习报告.md'), '第二次', '2026-05-02T10:00:00+08:00')

    const meta = getTopicMeta(topicDir)
    expect(meta!.sessions.map(s => s.sessionNumber)).toEqual([2, 10])
    expect(meta!.last_studied).toBe('2026-05-10T02:00:00.000Z') // from s10 (latest)
  })
})

describe('scanLibrary', () => {
  let tmpDir: string

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'library-test-'))
  })

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  it('returns empty array for non-existent root', () => {
    const result = scanLibrary(path.join(tmpDir, 'non-existent'))
    expect(result).toEqual([])
  })

  it('scans multiple topics and sorts by last_studied desc', () => {
    // Topic A - studied today
    const topicA = path.join(tmpDir, '主题A')
    fs.mkdirSync(topicA, { recursive: true })
    const s1a = path.join(topicA, 's1')
    fs.mkdirSync(s1a, { recursive: true })
    writeReport(path.join(s1a, '学习报告.md'), '主题A', '2026-05-09T10:00:00+08:00')

    // Topic B - studied yesterday
    const topicB = path.join(tmpDir, '主题B')
    fs.mkdirSync(topicB, { recursive: true })
    const s1b = path.join(topicB, 's1')
    fs.mkdirSync(s1b, { recursive: true })
    writeReport(path.join(s1b, '学习报告.md'), '主题B', '2026-05-08T10:00:00+08:00')

    // Topic C - studied last week
    const topicC = path.join(tmpDir, '主题C')
    fs.mkdirSync(topicC, { recursive: true })
    const s1c = path.join(topicC, 's1')
    fs.mkdirSync(s1c, { recursive: true })
    writeReport(path.join(s1c, '学习报告.md'), '主题C', '2026-05-02T10:00:00+08:00')

    const result = scanLibrary(tmpDir)
    expect(result.length).toBe(3)
    expect(result[0].dirName).toBe('主题A')
    expect(result[1].dirName).toBe('主题B')
    expect(result[2].dirName).toBe('主题C')

    // Verify days calculation
    expect(result[0].last_studied_days).toBe(0)
    expect(result[1].last_studied_days).toBeGreaterThanOrEqual(0)
    expect(result[2].last_studied_days).toBeGreaterThanOrEqual(0)
  })

  it('skips empty topic directories', () => {
    const emptyTopic = path.join(tmpDir, '空主题')
    fs.mkdirSync(emptyTopic, { recursive: true })

    const validTopic = path.join(tmpDir, '有效主题')
    fs.mkdirSync(validTopic, { recursive: true })
    const s1 = path.join(validTopic, 's1')
    fs.mkdirSync(s1, { recursive: true })
    writeReport(path.join(s1, '学习报告.md'), '有效', '2026-05-01T10:00:00+08:00')

    const result = scanLibrary(tmpDir)
    expect(result.length).toBe(1)
    expect(result[0].dirName).toBe('有效主题')
  })

  it('handles topics with no dates (sorted to end)', () => {
    const topicA = path.join(tmpDir, '有日期')
    fs.mkdirSync(topicA, { recursive: true })
    const s1a = path.join(topicA, 's1')
    fs.mkdirSync(s1a, { recursive: true })
    writeReport(path.join(s1a, '学习报告.md'), '有日期', '2026-05-09T10:00:00+08:00')

    const topicB = path.join(tmpDir, '无日期')
    fs.mkdirSync(topicB, { recursive: true })
    const s1b = path.join(topicB, 's1')
    fs.mkdirSync(s1b, { recursive: true })
    fs.writeFileSync(path.join(s1b, '原始对话.md'), '对话', 'utf8')

    const result = scanLibrary(tmpDir)
    expect(result.length).toBe(2)
    expect(result[0].dirName).toBe('有日期')
    expect(result[1].dirName).toBe('无日期')
    expect(result[1].last_studied).toBe('')
    expect(result[1].last_studied_days).toBe(0)
  })
})
