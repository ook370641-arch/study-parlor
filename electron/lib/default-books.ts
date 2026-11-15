import fs from 'node:fs'
import path from 'node:path'

export function seedDefaultBooks(libraryPath: string, sourceRoot: string): { copied: number; skipped: number } {
  const booksRoot = path.join(libraryPath, 'books')
  fs.mkdirSync(booksRoot, { recursive: true })
  let copied = 0
  let skipped = 0

  for (const entry of fs.readdirSync(sourceRoot, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue
    const finalDir = path.join(booksRoot, entry.name)
    if (fs.existsSync(finalDir)) {
      skipped += 1
      continue
    }

    const tempRoot = fs.mkdtempSync(path.join(booksRoot, '.tmp-import-default-'))
    try {
      const stagedDir = path.join(tempRoot, entry.name)
      fs.cpSync(path.join(sourceRoot, entry.name), stagedDir, { recursive: true })
      fs.renameSync(stagedDir, finalDir)
      copied += 1
    } finally {
      fs.rmSync(tempRoot, { recursive: true, force: true })
    }
  }

  return { copied, skipped }
}
