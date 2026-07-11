export interface ArticleChunk {
  heading: string
  body: string
  startIndex: number
}

function normalizeHeading(h: string): string {
  return h.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '').trim()
}

export function splitArticleIntoChunks(body: string, headings: string[]): ArticleChunk[] {
  if (!body || headings.length === 0) {
    return [{ heading: '', body: body ?? '', startIndex: 0 }]
  }
  const targets = headings.map(normalizeHeading)
  const chunks: ArticleChunk[] = []
  let currentStart = 0
  let currentHeading = ''

  const lines = body.split('\n')
  let cursor = 0

  for (let li = 0; li < lines.length; li++) {
    const line = lines[li]
    const normalizedLine = normalizeHeading(line)
    const matchIndex = targets.findIndex((t) => t.length > 0 && normalizedLine.includes(t))
    if (matchIndex !== -1) {
      if (cursor > currentStart && currentHeading) {
        chunks.push({ heading: currentHeading, body: body.slice(currentStart, cursor).trim(), startIndex: currentStart })
      }
      currentHeading = headings[matchIndex]
      currentStart = cursor + line.length + 1
    }
    cursor += line.length + 1
  }

  if (currentStart < body.length) {
    chunks.push({ heading: currentHeading, body: body.slice(currentStart).trim(), startIndex: currentStart })
  }

  if (chunks.length === 0) {
    return [{ heading: '', body: body.trim(), startIndex: 0 }]
  }
  return chunks
}
