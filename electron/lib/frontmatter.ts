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
  'anthropic-article': ['source_url', 'published_at', 'imported_at', 'authors', 'summary'],
  'web-article': ['source_url', 'source_name', 'published_at', 'imported_at', 'authors', 'summary'],
  'article-assistant': ['parent_path', 'parent_type', 'created_at', 'updated_at', 'guide_version'],
  'job-briefing': ['date', 'generated_at', 'role_keywords', 'cities', 'companies', 'job_sources'],
  writing: [],
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
  if (lower.includes('外部资料')) return 'external-materials'
  if (lower.includes('求职简报')) return 'job-briefing'
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
    created_at: typeof data.created_at === 'string' ? data.created_at : undefined,
    updated_at: typeof data.updated_at === 'string' ? data.updated_at : undefined,
    last_studied: data.last_studied,
    last_reviewed: data.last_reviewed,
    review_count: typeof data.review_count === 'number' ? data.review_count : 0,
    difficulty: (data.difficulty as 'high' | 'mid' | 'low') ?? 'mid',
    tags: Array.isArray(data.tags) ? data.tags : [],
    session_number: typeof data.session_number === 'number' ? data.session_number : 0,
    type,
    topic: data.topic,
    progress_summary: data.progress_summary,
    summary: data.summary,
    sources: Array.isArray(data.sources) ? data.sources : undefined,
    source_url: typeof data.source_url === 'string' ? data.source_url : undefined,
    source_name: typeof data.source_name === 'string' ? data.source_name : undefined,
    published_at: typeof data.published_at === 'string' ? data.published_at : undefined,
    imported_at: typeof data.imported_at === 'string' ? data.imported_at : undefined,
    authors: Array.isArray(data.authors) ? data.authors as string[] : undefined,
    parent_path: typeof data.parent_path === 'string' ? data.parent_path : undefined,
    parent_type: data.parent_type === 'briefing' || data.parent_type === 'anthropic-article' || data.parent_type === 'job-briefing' || data.parent_type === 'web-article' ? data.parent_type : undefined,
    generated_at: typeof data.generated_at === 'string' ? data.generated_at : undefined,
    guide_version: typeof data.guide_version === 'number' ? data.guide_version : undefined,
    role_keywords: Array.isArray(data.role_keywords) ? data.role_keywords as string[] : undefined,
    cities: Array.isArray(data.cities) ? data.cities as string[] : undefined,
    companies: Array.isArray(data.companies) ? data.companies as string[] : undefined,
    job_sources: typeof data.job_sources === 'string' ? data.job_sources : undefined,
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
