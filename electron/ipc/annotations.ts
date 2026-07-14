import fs from 'node:fs'
import path from 'node:path'
import { ipcMain } from 'electron'
import { parseFrontmatter, serializeFrontmatter } from '../lib/frontmatter'
import type { AppConfig } from '../env'
import type { ArticleAnnotation } from '@shared/index'

function annotationsPathFor(articlePath: string): string {
  const parsed = path.parse(articlePath)
  return path.join(parsed.dir, `${parsed.name}.annotations.md`)
}

function assertInsideLibrary(targetPath: string, libraryPath: string): void {
  const root = path.resolve(libraryPath)
  const resolved = path.resolve(targetPath)
  if (resolved !== root && !resolved.startsWith(root + path.sep)) {
    throw new Error(`Refusing to write outside library: ${resolved}`)
  }
}

function serializeAnnotations(annotations: ArticleAnnotation[]): string {
  const sections = annotations.map((a) => {
    return [
      `## ${a.id}`,
      '',
      `**选中文字：** ${a.selectedText}`,
      `**备注：** ${a.note}`,
      `**段落：** §${a.paragraphIndex}`,
      `**创建：** ${a.createdAt}`,
      `**更新：** ${a.updatedAt}`,
    ].join('\n')
  })
  return sections.join('\n\n---\n\n')
}

function parseAnnotationsBody(body: string): ArticleAnnotation[] {
  const sections = body.split(/^## /m).slice(1)
  return sections.map((section) => {
    const lines = section.split('\n')
    const id = lines[0]?.trim() ?? ''
    let selectedText = ''
    let note = ''
    let paragraphIndex = 1
    let createdAt = ''
    let updatedAt = ''

    for (const line of lines) {
      if (line.startsWith('**选中文字：**')) {
        selectedText = line.replace('**选中文字：**', '').trim()
      } else if (line.startsWith('**备注：**')) {
        note = line.replace('**备注：**', '').trim()
      } else if (line.startsWith('**段落：**')) {
        const raw = line.replace('**段落：**', '').trim().replace('§', '')
        paragraphIndex = parseInt(raw, 10) || 1
      } else if (line.startsWith('**创建：**')) {
        createdAt = line.replace('**创建：**', '').trim()
      } else if (line.startsWith('**更新：**')) {
        updatedAt = line.replace('**更新：**', '').trim()
      }
    }

    return {
      id,
      selectedText,
      note,
      paragraphIndex,
      createdAt,
      updatedAt: updatedAt || createdAt,
    }
  }).filter((a) => a.id && a.selectedText)
}

export function registerAnnotationsIpc(cfg: AppConfig) {
  ipcMain.handle('annotations:read', async (_event, articlePath: string) => {
    const annoPath = annotationsPathFor(articlePath)
    if (!fs.existsSync(annoPath)) return []

    try {
      const raw = fs.readFileSync(annoPath, 'utf8')
      const { body } = parseFrontmatter(raw, { filename: path.basename(annoPath) })
      return parseAnnotationsBody(body)
    } catch (err) {
      console.error('[annotations] read error:', err)
      return []
    }
  })

  ipcMain.handle('annotations:write', async (_event, articlePath: string, annotations: ArticleAnnotation[]) => {
    const annoPath = annotationsPathFor(articlePath)
    assertInsideLibrary(annoPath, cfg.libraryPath)

    const now = new Date().toISOString()
    let createdAt = now
    if (fs.existsSync(annoPath)) {
      try {
        const existing = parseFrontmatter(fs.readFileSync(annoPath, 'utf8'), {
          filename: path.basename(annoPath),
        })
        createdAt = (existing.frontmatter as unknown as Record<string, unknown>).created_at as string ?? now
      } catch {
        // use now
      }
    }

    const fm = {
      title: 'Article Annotations',
      type: 'article-assistant' as const,
      created: createdAt,
      created_at: createdAt,
      updated_at: now,
      parent_path: articlePath,
      tags: [] as string[],
    }

    const body = serializeAnnotations(annotations)

    try {
      fs.mkdirSync(path.dirname(annoPath), { recursive: true })
      // Atomic write: temp file then rename
      const tmpPath = annoPath + '.tmp'
      fs.writeFileSync(tmpPath, serializeFrontmatter('article-assistant', fm, body), 'utf8')
      fs.renameSync(tmpPath, annoPath)
    } catch (err) {
      console.error('[annotations] write error:', err)
      throw new Error(err instanceof Error ? err.message : String(err))
    }
  })
}
