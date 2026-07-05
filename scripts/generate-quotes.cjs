const fs = require('fs')
const path = require('path')

const mdPath = path.join(__dirname, '..', 'docs', 'superpowers', 'quotes-collection-draft-2026-06-22.md')
const outPath = path.join(__dirname, '..', 'src', 'lib', 'quotes.ts')

const content = fs.readFileSync(mdPath, 'utf-8')
const lines = content.split(/\r?\n/)

let author = ''
const quotes = []
const warnings = []

for (let i = 0; i < lines.length; i++) {
  const line = lines[i]

  const headingMatch = line.match(/^###\s+(.+)$/)
  if (headingMatch) {
    const heading = headingMatch[1].trim()
    const slashIdx = heading.indexOf(' / ')
    author = slashIdx >= 0 ? heading.slice(0, slashIdx).trim() : heading
    continue
  }

  const bulletMatch = line.match(/^-\s+\*\*([^*\s]+)\*\*\s+(.+)$/)
  if (!bulletMatch) continue

  const id = bulletMatch[1].trim()
  const text = bulletMatch[2].trim()

  let original = null
  let source = null

  const nextLine = lines[i + 1]
  if (nextLine && nextLine.startsWith('  ')) {
    const raw = nextLine.slice(2).trim()
    const dashMatch = raw.match(/\s*——\s*/)
    if (dashMatch) {
      const left = raw.slice(0, dashMatch.index).trim()
      const right = raw.slice(dashMatch.index + dashMatch[0].length).trim()

      if (left.length > 0 && left.startsWith('*') && left.endsWith('*')) {
        original = left.slice(1, -1).trim()
      }

      if (right.length > 0) {
        source = right
      }
    } else {
      source = raw.replace(/^——\s*/, '').trim()
    }
    i++
  }

  quotes.push({
    id,
    text,
    ...(original ? { original } : {}),
    author,
    ...(source ? { source } : {}),
  })
}

const idSet = new Set()
for (const q of quotes) {
  if (idSet.has(q.id)) warnings.push(`duplicate id: ${q.id}`)
  idSet.add(q.id)
}

console.log(`parsed ${quotes.length} quotes`)
if (warnings.length) {
  console.warn('warnings:')
  console.warn(warnings.join('\n'))
}

const quoteLines = quotes.map((q) => {
  const fields = [`id: ${JSON.stringify(q.id)}`, `text: ${JSON.stringify(q.text)}`]
  if (q.original) fields.push(`original: ${JSON.stringify(q.original)}`)
  fields.push(`author: ${JSON.stringify(q.author)}`)
  if (q.source) fields.push(`source: ${JSON.stringify(q.source)}`)
  return `  {\n    ${fields.join(',\n    ')},\n  },`
})

const out = `export type Quote = {
  id: string
  text: string
  original?: string
  author: string
  authorOriginal?: string
  source?: string
}

export const quotes: Quote[] = [
${quoteLines.join('\n')}
]

export function pickRandomQuote(
  options: { excludeId?: string | null; pool?: Quote[] } = {}
): Quote | null {
  const pool = options.pool ?? quotes
  const excludeId = options.excludeId ?? null
  const filtered = excludeId ? pool.filter(q => q.id !== excludeId) : pool
  if (filtered.length === 0) return null
  return filtered[Math.floor(Math.random() * filtered.length)]
}
`

fs.writeFileSync(outPath, out)
console.log(`wrote ${outPath}`)
