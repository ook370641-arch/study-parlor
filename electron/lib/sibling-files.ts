import fs from 'node:fs'
import path from 'node:path'

const SUFFIXES = ['.assistant.md', '.annotations.md', '.guide.md']

export function deleteSiblingFiles(articlePath: string): string[] {
  const parsed = path.parse(articlePath)
  const removed: string[] = []
  for (const sfx of SUFFIXES) {
    const p = path.join(parsed.dir, `${parsed.name}${sfx}`)
    try {
      if (fs.existsSync(p)) {
        fs.rmSync(p)
        removed.push(p)
      }
    } catch (e) {
      console.warn('[sibling-files] rm fail', p, e)
    }
  }
  return removed
}
