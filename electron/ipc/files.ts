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
    if (!fs.existsSync(root)) {
      console.error(`[files:scan] library path does not exist: ${root}`)
      return []
    }
    const files = fs.readdirSync(root).filter(n => n.toLowerCase().endsWith('.md'))
    const results: FileMeta[] = []
    for (const name of files) {
      const fp = path.join(root, name)
      try {
        const raw = fs.readFileSync(fp, 'utf8')
        const { frontmatter } = parseFrontmatter(raw, { filename: name })
        results.push({ ...frontmatter, file_path: fp })
      } catch (err) {
        console.error(`[files:scan] failed to read ${fp}:`, err)
      }
    }
    return results
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

  ipcMain.handle('files:recoveryDump', async (_, args: { filename: string; content: string }) => {
    const { dumpRecovery } = await import('../lib/recovery')
    dumpRecovery(args.filename, args.content)
  })
}
