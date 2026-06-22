import matter from 'gray-matter'
import type { Frontmatter, DocType } from '@shared/index'

// --- Core field order (all types) ---
const CORE_FIELDS = ['title', 'description', 'type', 'created', 'tags'] as const

// --- Extension field order per type ---
const EXT_FIELDS: Record<DocType, string[]> = {
  progress: ['session_number', 'difficulty', 'progress_summary', 'last_studied', 'review_count'],
  review: ['review_index', 'last_reviewed', 'source_title'],
  fable: ['source_topic'],
  transcript: ['session_number'],
  briefing: [],
  'external-materials': ['session_number', 'topic', 'summary', 'sources'],
}

function extractTitleFromFilename(name: string): string | undefined {
  const title = name
    .replace(/\.md$/i, '')
    .replace(/^(\d{4}[.\-]?\d{1,2}[.\-]?\d{0,2}[.\-]?)/, '')
    .replace(/^[.\-_]+/, '')
    .replace(/-/g, ' ')
    .trim()
  return title || undefined
}

function inferDocTypeFromFilename(filename: string): DocType {
  const lower = filename.toLowerCase()
  if (lower.includes('学习报告')) return 'progress'
  if (lower.includes('复习报告')) return 'review'
  if (lower.includes('寓言')) return 'fable'
  if (lower.includes('原始对话')) return 'transcript'
  if (lower.includes('夜航简报')) return 'briefing'
  return 'progress'
}

export function parseFrontmatter(
  raw: string,
  opts?: { filename?: string }
): { frontmatter: Frontmatter; body: string } {
  const parsed = matter(raw)
  const data = parsed.data as Partial<Frontmatter> & Record<string, unknown>

  const type: DocType = (data.type as DocType)
    ?? inferDocTypeFromFilename(opts?.filename ?? '')

  const frontmatter: Frontmatter = {
    title: data.title
      ?? (opts?.filename ? extractTitleFromFilename(opts.filename) : undefined)
      ?? 'untitled',
    description: data.description,
    created: data.created ?? new Date().toISOString(),
    last_studied: data.last_studied,
    last_reviewed: data.last_reviewed,
    review_count: typeof data.review_count === 'number' ? data.review_count : 0,
    difficulty: (data.difficulty as 'high' | 'mid' | 'low') ?? 'mid',
    tags: Array.isArray(data.tags) ? data.tags : [],
    session_number: typeof data.session_number === 'number' ? data.session_number : 0,
    type,
    progress_summary: data.progress_summary,
    summary: data.summary,
    sources: Array.isArray(data.sources) ? data.sources : undefined,
  }

  return { frontmatter, body: parsed.content }
}

export function serializeFrontmatter(
  type: DocType,
  data: Partial<Frontmatter> & Record<string, unknown>,
  body: string
): string {
  const ordered: Record<string, unknown> = {}

  // Core fields in fixed order
  for (const key of CORE_FIELDS) {
    if (data[key] !== undefined && data[key] !== null) {
      ordered[key] = data[key]
    }
  }

  // Extension fields in type-specific order
  const ext = EXT_FIELDS[type] ?? []
  for (const key of ext) {
    if (data[key] !== undefined && data[key] !== null && data[key] !== '') {
      ordered[key] = data[key]
    }
  }

  // Any remaining fields not in core or ext (backward compat)
  const known = new Set([...CORE_FIELDS, ...ext])
  for (const [key, value] of Object.entries(data)) {
    if (!known.has(key) && value !== undefined && value !== null && value !== '') {
      ordered[key] = value
    }
  }

  return matter.stringify(body, ordered)
}
