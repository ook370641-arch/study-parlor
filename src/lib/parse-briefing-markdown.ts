export type BriefingSection = {
  title: string
  body: string
}

export type BriefingSourceGroup = {
  title: string
  items: string[]
}

export type ParsedBriefing = {
  sections: BriefingSection[]
  sources: BriefingSourceGroup[]
}

export function parseBriefingMarkdown(raw: string): ParsedBriefing {
  const lines = raw.split('\n')
  const sections: BriefingSection[] = []
  const sources: BriefingSourceGroup[] = []

  let current: { kind: 'section' | 'source'; title: string; buffer: string[]; subTitle?: string } | null = null

  function flush() {
    if (!current) return
    const body = current.buffer.join('\n').trim()
    if (current.kind === 'section') {
      sections.push({ title: current.title, body })
    } else if (current.subTitle) {
      sources.push({ title: current.subTitle, items: body ? body.split('\n').map(s => s.trim()).filter(Boolean) : [] })
    }
    current = null
  }

  for (let line of lines) {
    const sectionMatch = line.match(/^##\s+(.*)/)
    const sourceMatch = line.match(/^###\s+(.*)/)

    if (sectionMatch) {
      flush()
      const title = sectionMatch[1].trim()
      if (title.includes('原始来源') || title.toLowerCase().includes('sources')) {
        current = { kind: 'source', title, buffer: [] }
      } else {
        current = { kind: 'section', title, buffer: [] }
      }
      continue
    }

    if (sourceMatch && current?.kind === 'source') {
      const parentTitle: string = current.title
      flush()
      current = { kind: 'source', title: parentTitle, subTitle: sourceMatch[1].trim(), buffer: [] }
      continue
    }

    if (current) {
      current.buffer.push(line)
    }
  }
  flush()

  return { sections, sources }
}
