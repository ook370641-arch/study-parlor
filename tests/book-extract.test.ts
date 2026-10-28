import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { extractPagesText, importPdfBook, BookImportError } from '../electron/lib/books'

let lib: string
beforeEach(() => {
  lib = fs.mkdtempSync(path.join(os.tmpdir(), 'sp-book-extract-'))
})
afterEach(() => {
  fs.rmSync(lib, { recursive: true, force: true })
})

const fixture = (name: string) => path.join(process.cwd(), 'tests', 'fixtures', name)

describe('extractPagesText（真实 pdfjs）', () => {
  it('详见 PDF 抽出文字层', async () => {
    const pages = await extractPagesText(fixture('sample.pdf'))
    expect(pages.length).toBeGreaterThan(0)
    expect(pages.join('\n')).toContain('Hello PDF from Study Parlor spike')
  })
})

describe('importPdfBook（真实 pdfjs）', () => {
  it('无目录 PDF 整书单章入架', async () => {
    const book = await importPdfBook(lib, fixture('sample.pdf'))
    expect(book.hasToc).toBe(false)
    expect(book.toc).toHaveLength(1)
    expect(fs.existsSync(path.join(book.dir, 'source.pdf'))).toBe(true)
    expect(fs.existsSync(path.join(book.dir, book.toc[0].chapterFile))).toBe(true)
  })

  it('同一 PDF 重复导入命中幂等，不新建目录', async () => {
    const a = await importPdfBook(lib, fixture('sample.pdf'))
    const b = await importPdfBook(lib, fixture('sample.pdf'))
    expect(b.dir).toBe(a.dir)
    const dirs = fs.readdirSync(path.join(lib, 'books')).filter((n) => !n.startsWith('.'))
    expect(dirs).toHaveLength(1)
  })

  it('扫描版 PDF 明确报 SCANNED_PDF 且不入架', async () => {
    const err = await importPdfBook(lib, fixture('blank.pdf')).then(
      () => null,
      (e: unknown) => e
    )
    expect(err).toBeInstanceOf(BookImportError)
    expect((err as BookImportError).code).toBe('SCANNED_PDF')
    const root = path.join(lib, 'books')
    const dirs = fs.existsSync(root) ? fs.readdirSync(root) : []
    expect(dirs).toEqual([])
  })
})
