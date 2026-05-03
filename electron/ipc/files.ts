import fs from 'node:fs'
import path from 'node:path'
import { ipcMain } from 'electron'
import { parseFrontmatter, serializeFrontmatter } from '../lib/frontmatter'
import { resolveTitleConflict, buildReviewAppendix, bumpReviewFrontmatter } from '../lib/archive'
import type { AppConfig } from '../env'
import type { FileMeta, Frontmatter } from '@shared/index'

export function registerFilesIpc(cfg: AppConfig) {
  ipcMain.handle('files:scan', async (): Promise<FileMeta[]> => {
    const root = cfg.libraryPath
    if (!fs.existsSync(root)) return []
    const files = fs.readdirSync(root).filter(n => n.endsWith('.md'))
    return files.map(name => {
      const fp = path.join(root, name)
      const raw = fs.readFileSync(fp, 'utf8')
      const { frontmatter } = parseFrontmatter(raw)
      return { ...frontmatter, file_path: fp }
    })
  })

  ipcMain.handle('files:read', async (_, file_path: string) => {
    const raw = fs.readFileSync(file_path, 'utf8')
    return parseFrontmatter(raw)
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
}
