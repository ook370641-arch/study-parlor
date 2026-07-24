const LINK_PATTERN = /\[([^\]]+)\]\((https?:\/\/[^)]+)\)|(https?:\/\/[^\s<>"{}|\\^`\[\]]+)/

export function extractFirstLink(item: string): { text: string; url: string | null } {
  const m = LINK_PATTERN.exec(item)
  if (!m) return { text: item, url: null }
  const url = m[2] || m[3]
  const text = (m[1] || item.replace(m[0], '').trim() || url)
  return { text, url }
}
