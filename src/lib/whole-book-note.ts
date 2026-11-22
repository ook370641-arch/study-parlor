const ORIGINAL_MARKER = '\n\n---\n\n## 原笔迹\n\n'

export function splitWholeBookNoteBody(body: string): { aiBody: string; original: string } {
  const markerIndex = body.indexOf(ORIGINAL_MARKER)
  if (markerIndex < 0) return { aiBody: '', original: body }
  return {
    aiBody: body.slice(0, markerIndex),
    original: body.slice(markerIndex + ORIGINAL_MARKER.length),
  }
}

export function composeWholeBookNoteBody(aiBody: string, original: string): string {
  if (!aiBody) return original
  return `${aiBody}${ORIGINAL_MARKER}${original}`
}
