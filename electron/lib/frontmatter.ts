import matter from 'gray-matter'
import type { Frontmatter } from '@shared/index'

function extractTitleFromFilename(name: string): string | undefined {
  const title = name
    .replace(/\.md$/i, '')
    .replace(/^(\d{4}[.\-]?\d{1,2}[.\-]?\d{0,2}[.\-]?)/, '')
    .replace(/^[.\-_]+/, '')
    .replace(/-/g, ' ')
    .trim()
  return title || undefined
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
    session_number: typeof data.session_number === 'number' ? data.session_number : 0,
    created:      data.created ?? new Date().toISOString(),
    last_studied: data.last_studied,
    last_reviewed: data.last_reviewed,
    review_count: typeof data.review_count === 'number' ? data.review_count : 0,
    difficulty:   data.difficulty ?? 'mid',
    tags:         Array.isArray(data.tags) ? data.tags : [],
    type:         data.type ?? 'progress',
    progress_summary: data.progress_summary
  }

  return { frontmatter, body: parsed.content }
}

export function serializeFrontmatter(fm: Frontmatter, body: string): string {
  const data: Record<string, unknown> = {
    title: fm.title,
    session_number: fm.session_number,
    created: fm.created,
    review_count: fm.review_count,
    difficulty: fm.difficulty,
    tags: fm.tags,
    type: fm.type
  }
  if (fm.last_studied) data.last_studied = fm.last_studied
  if (fm.last_reviewed) data.last_reviewed = fm.last_reviewed
  if (fm.progress_summary) data.progress_summary = fm.progress_summary
  return matter.stringify(body, data)
}
