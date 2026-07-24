import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { deleteAnthropicArticleFile } from '@electron/lib/anthropic-delete'
import { IMPORT_DIR } from '@electron/lib/anthropic-scraper'

let lib: string
beforeEach(() => { lib = fs.mkdtempSync(path.join(os.tmpdir(), 'alib-')) })
afterEach(() => { fs.rmSync(lib, { recursive: true, force: true }) })

function seedArticle() {
  const dir = path.join(lib, IMPORT_DIR, '2026-07')
  fs.mkdirSync(dir, { recursive: true })
  const article = path.join(dir, 'test-article.md')
  fs.writeFileSync(article, '# article')
  fs.writeFileSync(path.join(dir, 'test-article.assistant.md'), 'chat')
  fs.writeFileSync(path.join(dir, 'test-article.annotations.md'), 'annos')
  fs.writeFileSync(path.join(dir, 'test-article.guide.md'), 'guide')
  return article
}

describe('deleteAnthropicArticleFile', () => {
  it('deletes the article and its sibling files', () => {
    const article = seedArticle()
    const r = deleteAnthropicArticleFile(lib, article)
    expect(r.ok).toBe(true)
    expect(fs.existsSync(article)).toBe(false)
    const dir = path.dirname(article)
    expect(fs.readdirSync(dir)).toEqual([])
  })

  it('rejects paths outside the import dir', () => {
    const outside = path.join(lib, 'writing', 'x.md')
    fs.mkdirSync(path.dirname(outside), { recursive: true })
    fs.writeFileSync(outside, 'x')
    const r = deleteAnthropicArticleFile(lib, outside)
    expect(r.ok).toBe(false)
    expect(fs.existsSync(outside)).toBe(true)
  })

  it('rejects missing files', () => {
    const r = deleteAnthropicArticleFile(lib, path.join(lib, IMPORT_DIR, 'ghost.md'))
    expect(r.ok).toBe(false)
  })
})
