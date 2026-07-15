import { extractFrontmatterField } from '@/lib/frontmatter-safe'

export type DocType = 'report' | 'fable' | 'dialogue'

export function detectDocType(content: string, fileName: string): DocType {
  // Priority 1: frontmatter type field
  try {
    const type = extractFrontmatterField(content, 'type')
    if (type === 'progress' || type === 'review' || type === 'anthropic-article' || type === 'job-briefing') return 'report'
    if (type === 'fable') return 'fable'
    if (type === 'article-assistant') return 'dialogue'
  } catch {
    // ignore parse errors
  }

  // Priority 2: filename matching
  const lower = fileName.toLowerCase()
  if (lower.includes('学习报告') || lower.includes('复习报告') || lower.includes('求职简报')) return 'report'
  if (lower.includes('寓言')) return 'fable'
  if (lower.includes('原始对话')) return 'dialogue'

  // Default: report for information density
  return 'report'
}
