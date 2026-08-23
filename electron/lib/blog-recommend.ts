import fs from 'fs'
import path from 'path'
import { loadCatalog } from './writing-catalog'
import { parseFrontmatter } from './frontmatter'

export type LocalBlogArticle = {
  sourceUrl: string
  filePath: string   // 相对学习库
  absPath: string
  title: string
  summary: string | null
  section: string | null
  importedAt: string | null
}

export function collectWritingContext(lib: string): {
  count: number
  summaries: { title: string; summary: string }[]
  recentBodies: string[]
} {
  const cat = loadCatalog(lib, 'writing')
  const items = Object.entries(cat.entries)
    .map(([relPath, e]) => ({ relPath, ...e }))
    .sort((a, b) => (b.mtimeMs ?? b.updatedAt ? Date.parse(b.updatedAt ?? '') : 0) - (a.mtimeMs ?? a.updatedAt ? Date.parse(a.updatedAt ?? '') : 0))

  let total = 0
  const summaries: { title: string; summary: string }[] = []
  for (const it of items) {
    const text = `${it.title}\n${it.summary}`
    if (total + text.length > 8000) break
    summaries.push({ title: it.title, summary: it.summary })
    total += text.length
  }

  const recentBodies: string[] = []
  for (const it of items.slice(0, 5)) {
    const p = path.join(lib, 'writing', it.relPath)
    if (!fs.existsSync(p)) continue
    try {
      const raw = fs.readFileSync(p, 'utf8')
      const { body } = parseFrontmatter(raw, { filename: path.basename(p) })
      recentBodies.push(body.slice(0, 2000))
    } catch { /* skip */ }
  }

  return { count: items.length, summaries, recentBodies }
}

export function collectLocalArticles(lib: string): LocalBlogArticle[] {
  const dir = path.join(lib, 'Anthropic博客')
  const out: LocalBlogArticle[] = []
  const walk = (d: string) => {
    if (!fs.existsSync(d)) return
    for (const ent of fs.readdirSync(d, { withFileTypes: true })) {
      const full = path.join(d, ent.name)
      if (ent.isDirectory()) walk(full)
      else if (ent.isFile() && ent.name.endsWith('.md')) {
        try {
          const raw = fs.readFileSync(full, 'utf8')
          const { frontmatter } = parseFrontmatter(raw, { filename: ent.name })
          if (frontmatter.type !== 'anthropic-article') continue
          if (!frontmatter.source_url) continue
          out.push({
            sourceUrl: frontmatter.source_url,
            filePath: path.relative(lib, full),
            absPath: full,
            title: frontmatter.title ?? ent.name,
            summary: frontmatter.summary ?? null,
            section: frontmatter.section ?? null,
            importedAt: frontmatter.imported_at ?? null,
          })
        } catch { /* skip corrupted */ }
      }
    }
  }
  walk(dir)
  return out
}
