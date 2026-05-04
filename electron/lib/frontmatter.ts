import matter from 'gray-matter'
import type { Frontmatter } from '@shared/index'

function extractTitleFromFilename(name: string): string {
  return name
    .replace(/\.md$/i, '')
    .replace(/^(\d{4}\.?\d{1,2}\.?-?\d{0,2}-?)/, '')
    .replace(/-/g, ' ')
    .trim()
}

export function parseFrontmatter(
  raw: string,
  opts?: { filename?: string }
): { frontmatter: Frontmatter; body: string } {
  const parsed = matter(raw)
  const data = parsed.data as Partial<Frontmatter>

  const frontmatter: Frontmatter = {
    title:        data.title
      ?? (opts?.filename ? extractTitleFromFilename(opts.filename) : undefined)
      ?? 'untitled',
    created:      data.created ?? new Date().toISOString(),
    last_studied: data.last_studied,
    last_reviewed: data.last_reviewed,
    review_count: typeof data.review_count === 'number' ? data.review_count : 0,
    difficulty:   data.difficulty ?? 'mid',
    tags:         Array.isArray(data.tags) ? data.tags : []
  }

  return { frontmatter, body: parsed.content }
}

export function serializeFrontmatter(fm: Frontmatter, body: string): string {
  // 保留可选字段为 undefined 时不写 key
  const data: Record<string, unknown> = {
    title: fm.title,
    created: fm.created,
    review_count: fm.review_count,
    difficulty: fm.difficulty,
    tags: fm.tags
  }
  if (fm.last_studied) data.last_studied = fm.last_studied
  if (fm.last_reviewed) data.last_reviewed = fm.last_reviewed
  return matter.stringify(body, data)
}
