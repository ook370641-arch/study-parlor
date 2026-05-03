import type { Frontmatter } from '@shared/index'

export function resolveTitleConflict(title: string, existingFileNames: string[], now: Date): string {
  const base = `${title}.md`
  if (!existingFileNames.includes(base)) return base
  const hh = String(now.getHours()).padStart(2, '0')
  const mm = String(now.getMinutes()).padStart(2, '0')
  return `${title}-${hh}${mm}.md`
}

export function buildReviewAppendix(date: Date, summary: string): string {
  const yyyy = date.getFullYear()
  const mm = String(date.getMonth() + 1).padStart(2, '0')
  const dd = String(date.getDate()).padStart(2, '0')
  return `\n\n## 复习记录 ${yyyy}-${mm}-${dd}\n${summary.trim()}\n`
}

export function bumpReviewFrontmatter(fm: Frontmatter, now: Date): Frontmatter {
  return {
    ...fm,
    review_count: fm.review_count + 1,
    last_reviewed: now.toISOString()
  }
}
