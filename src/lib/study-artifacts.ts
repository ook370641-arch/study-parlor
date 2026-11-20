export function studyArtifactKey(dirName: string, sessionNumber: number): string {
  return `${dirName}:s${sessionNumber}`
}

export function stripFrontmatter(content: string): string {
  const match = content.match(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/)
  return match ? content.slice(match[0].length) : content
}

export function buildFableUserPrompt(tags: string[], description: string): string | undefined {
  const tagsText = tags.join('、')
  const detail = description.trim()
  if (tagsText && detail) return `风格：${tagsText}。${detail}`
  if (tagsText) return `风格：${tagsText}`
  return detail || undefined
}
