import fs from 'node:fs'
import path from 'node:path'
import { parseFrontmatter, serializeFrontmatter } from '../frontmatter'
import { deleteSiblingFiles } from '../sibling-files'
import type { FetchedArticle } from './article-fetcher'
import type { ScoutArticleMeta } from '@shared/index'

export const SCOUT_DIR = '拾贝'
const ARTICLES_SUBDIR = '文章'

export function safeFileName(title: string): string {
  return title.replace(/[\\/:*?"<>|]/g, '_').replace(/\s+/g, ' ').trim().slice(0, 120)
}

function monthFolder(iso: string | null): string {
  const d = iso ? new Date(iso) : new Date()
  const t = Number.isNaN(d.getTime()) ? new Date() : d
  return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}`
}

function walkMdFiles(dir: string, cb: (filePath: string) => void) {
  if (!fs.existsSync(dir)) return
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) walkMdFiles(full, cb)
    else if (entry.isFile() && entry.name.endsWith('.md')) cb(full)
  }
}

export function findSavedByUrl(libraryRoot: string): Map<string, string> {
  const map = new Map<string, string>()
  walkMdFiles(path.join(libraryRoot, SCOUT_DIR, ARTICLES_SUBDIR), (filePath) => {
    try {
      const raw = fs.readFileSync(filePath, 'utf8')
      const { frontmatter } = parseFrontmatter(raw, { filename: path.basename(filePath) })
      if (frontmatter.source_url) map.set(frontmatter.source_url, filePath)
    } catch { /* 跳过损坏文件 */ }
  })
  return map
}

export function saveArticle(
  libraryRoot: string,
  fetched: FetchedArticle
): { filePath: string; wasAlreadySaved: boolean } {
  const saved = findSavedByUrl(libraryRoot)
  const existing = saved.get(fetched.url)
  if (existing && fs.existsSync(existing)) return { filePath: existing, wasAlreadySaved: true }

  const dir = path.join(libraryRoot, SCOUT_DIR, ARTICLES_SUBDIR, monthFolder(fetched.publishedAt))
  fs.mkdirSync(dir, { recursive: true })

  const base = safeFileName(fetched.title) || 'untitled'
  let filePath = path.join(dir, `${base}.md`)
  let counter = 2
  while (fs.existsSync(filePath)) {
    filePath = path.join(dir, `${base}-${counter}.md`)
    counter++
  }

  let sourceName: string | undefined
  try { sourceName = new URL(fetched.url).hostname } catch { /* ignore */ }

  const raw = serializeFrontmatter('web-article', {
    title: fetched.title,
    type: 'web-article',
    created: fetched.publishedAt ?? new Date().toISOString(),
    tags: ['拾贝'],
    source_url: fetched.url,
    source_name: sourceName,
    published_at: fetched.publishedAt ?? undefined,
    imported_at: new Date().toISOString(),
    authors: fetched.authors.length > 0 ? fetched.authors : undefined,
    summary: fetched.summary || undefined,
  }, fetched.markdown)

  fs.writeFileSync(filePath, raw, 'utf8')
  return { filePath, wasAlreadySaved: false }
}

export function listArticles(libraryRoot: string): ScoutArticleMeta[] {
  const articles: ScoutArticleMeta[] = []
  walkMdFiles(path.join(libraryRoot, SCOUT_DIR, ARTICLES_SUBDIR), (filePath) => {
    try {
      const raw = fs.readFileSync(filePath, 'utf8')
      const { frontmatter } = parseFrontmatter(raw, { filename: path.basename(filePath) })
      if (!frontmatter.source_url) return
      articles.push({
        url: frontmatter.source_url,
        title: frontmatter.title,
        summary: frontmatter.summary ?? null,
        publishedAt: frontmatter.published_at ?? null,
        sourceName: frontmatter.source_name ?? null,
        filePath,
      })
    } catch { /* 跳过损坏文件 */ }
  })
  // 新文章在前
  articles.sort((a, b) => (b.publishedAt ?? '').localeCompare(a.publishedAt ?? ''))
  return articles
}

export function deleteArticle(
  libraryRoot: string,
  filePath: string
): { ok: true } | { ok: false; message: string } {
  const dir = path.resolve(libraryRoot, SCOUT_DIR, ARTICLES_SUBDIR)
  const abs = path.resolve(filePath)
  if (!abs.startsWith(dir + path.sep) || !fs.existsSync(abs)) {
    return { ok: false, message: '文件不存在或路径非法' }
  }
  try {
    fs.rmSync(abs)
    deleteSiblingFiles(abs) // 同时删旁注对话/标注/导读（与 Anthropic 删除语义一致）
    return { ok: true }
  } catch (err: any) {
    return { ok: false, message: err?.message || String(err) }
  }
}
