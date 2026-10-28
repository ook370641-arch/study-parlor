import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import fs from 'node:fs'
import type { PathLike } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { importPdfBook, reparseBook, readBookJson, writeBookJson, scanBooks, BookImportError, BOOK_PARSER_VERSION, BOOKS_DIR } from '../electron/lib/books'

let lib: string
beforeEach(() => {
  lib = fs.mkdtempSync(path.join(os.tmpdir(), 'sp-reparse-'))
})
afterEach(() => {
  fs.rmSync(lib, { recursive: true, force: true })
})

const fixture = (name: string) => path.join(process.cwd(), 'tests', 'fixtures', name)

/** 用真实 PDF 导入一本「旧书」：手工去掉 parserVersion、加回 bookGuide、塞入旧章与旧导读。 */
async function makeLegacyBook(): Promise<string> {
  const imported = await importPdfBook(lib, fixture('sample.pdf'))
  const dir = imported.dir

  // 旧解析产物：目录 / 章节名与真实解析结果不同
  const oldChapter = path.join(dir, 'chapters', '01-old-parser.md')
  fs.mkdirSync(path.join(dir, 'chapters'), { recursive: true })
  fs.writeFileSync(oldChapter, 'old body', 'utf8')
  fs.writeFileSync(path.join(dir, 'chapters', '01-old-parser.guide.md'), 'old guide', 'utf8')

  const json = readBookJson(dir)!
  delete json.parserVersion
  json.bookGuide = { content: '旧全书导读', generatedAt: '2026-10-01T00:00:00.000Z' }
  json.toc = [{ title: 'Old Chapter', chapterFile: 'chapters/01-old-parser.md', pageStart: 1, pageEnd: 1 }]
  writeBookJson(dir, json)
  return dir
}

const chapterFiles = (dir: string) =>
  fs.readdirSync(path.join(dir, 'chapters')).filter((n) => n.endsWith('.md') && !n.endsWith('.guide.md'))

describe('reparseBook 成功路径', () => {
  it('刷新 parserVersion / toc / chapters，删掉 guide 与 bookGuide，保留 title/importedAt/sourceFile', async () => {
    const dir = await makeLegacyBook()
    const before = readBookJson(dir)!

    const result = await reparseBook(lib, dir)

    expect(result.dir).toBe(dir)
    expect(result.parserVersion).toBe(BOOK_PARSER_VERSION)
    expect(BOOK_PARSER_VERSION).toBe(3)
    expect(result.title).toBe(before.title)
    expect(result.importedAt).toBe(before.importedAt)
    expect(result.sourceFile).toBe(before.sourceFile)

    // toc 用新解析结果覆盖（旧目录指向的 01-old-parser.md 不再存在）
    expect(result.toc.map((t) => t.chapterFile)).not.toContain('chapters/01-old-parser.md')
    const files = chapterFiles(dir)
    expect(files).toHaveLength(result.toc.length)
    for (const item of result.toc) {
      expect(fs.existsSync(path.join(dir, item.chapterFile))).toBe(true)
    }

    // 旧导读与全书导读都必须消失
    expect(fs.existsSync(path.join(dir, 'chapters', '01-old-parser.guide.md'))).toBe(false)
    expect(fs.readdirSync(path.join(dir, 'chapters')).some((n) => n.endsWith('.guide.md'))).toBe(false)
    const after = readBookJson(dir)!
    expect(after.bookGuide).toBeUndefined()
    expect(after.parserVersion).toBe(3)

    // 无残留临时目录 / 备份目录
    const entries = fs.readdirSync(dir)
    expect(entries.some((n) => n.startsWith('.tmp-reparse-'))).toBe(false)
    expect(entries.some((n) => n.startsWith('chapters.bak-'))).toBe(false)
  })

  it('章节边界没变时保留旧章节导读与全书导读', async () => {
    const imported = await importPdfBook(lib, fixture('sample.pdf'))
    const dir = imported.dir
    const chapterFile = imported.toc[0].chapterFile
    const guideFile = chapterFile.replace(/\.md$/, '.guide.md')
    fs.writeFileSync(path.join(dir, guideFile), 'existing guide', 'utf8')

    const json = readBookJson(dir)!
    json.parserVersion = 2
    json.bookGuide = { content: '全书导读', generatedAt: '2026-10-01T00:00:00.000Z' }
    writeBookJson(dir, json)

    const result = await reparseBook(lib, dir)

    expect(result.parserVersion).toBe(3)
    expect(fs.readFileSync(path.join(dir, guideFile), 'utf8')).toBe('existing guide')
    expect(result.bookGuide?.content).toBe('全书导读')
  })
})

describe('reparseBook 失败不破坏原数据', () => {
  it('source.pdf 不是有效 PDF → 抛 PDF_READ_ERROR，chapters 与 book.json 原样', async () => {
    const dir = await makeLegacyBook()
    fs.writeFileSync(path.join(dir, 'source.pdf'), 'not a pdf at all', 'utf8')
    const jsonBefore = fs.readFileSync(path.join(dir, 'book.json'), 'utf8')
    const chaptersBefore = fs.readdirSync(path.join(dir, 'chapters')).sort()

    const err = await reparseBook(lib, dir).then(
      () => null,
      (e: unknown) => e
    )
    expect(err).toBeInstanceOf(BookImportError)
    expect((err as BookImportError).code).toBe('PDF_READ_ERROR')

    expect(fs.readFileSync(path.join(dir, 'book.json'), 'utf8')).toBe(jsonBefore)
    expect(fs.readdirSync(path.join(dir, 'chapters')).sort()).toEqual(chaptersBefore)
    expect(fs.existsSync(path.join(dir, 'chapters', '01-old-parser.md'))).toBe(true)
    expect(fs.readdirSync(dir).some((n) => n.startsWith('.tmp-reparse-'))).toBe(false)
  })

  it('chapters 换位后 book.json 写入失败 → 回滚恢复原 chapters', async () => {
    const dir = await makeLegacyBook()
    const jsonBefore = fs.readFileSync(path.join(dir, 'book.json'), 'utf8')
    const chaptersBefore = fs.readdirSync(path.join(dir, 'chapters')).sort()

    const realRename = fs.renameSync
    const spy = vi.spyOn(fs, 'renameSync').mockImplementation(((from: PathLike, to: PathLike) => {
      // 模拟「新 chapters 就位后，book.json 的 tmp→正式 写入失败」
      if (
        path.basename(String(from)) === 'book.json.tmp' &&
        path.dirname(path.resolve(String(to))) === path.resolve(dir)
      ) {
        const e = new Error('simulated book.json write failure') as NodeJS.ErrnoException
        e.code = 'EACCES'
        throw e
      }
      return realRename(from, to)
    }) as typeof fs.renameSync)

    try {
      await expect(reparseBook(lib, dir)).rejects.toThrow(/simulated book.json write failure/)
    } finally {
      spy.mockRestore()
    }

    expect(fs.readFileSync(path.join(dir, 'book.json'), 'utf8')).toBe(jsonBefore)
    expect(fs.readdirSync(path.join(dir, 'chapters')).sort()).toEqual(chaptersBefore)
    expect(fs.existsSync(path.join(dir, 'chapters', '01-old-parser.guide.md'))).toBe(true)
    const entries = fs.readdirSync(dir)
    expect(entries.some((n) => n.startsWith('.tmp-reparse-'))).toBe(false)
    expect(entries.some((n) => n.startsWith('chapters.bak-'))).toBe(false)
  })

  it('book.json / source.pdf 缺失时抛 PDF_READ_ERROR', async () => {
    const dir = path.join(lib, BOOKS_DIR, 'ghost')
    fs.mkdirSync(dir, { recursive: true })
    const err = await reparseBook(lib, dir).then(
      () => null,
      (e: unknown) => e
    )
    expect(err).toBeInstanceOf(BookImportError)
    expect((err as BookImportError).code).toBe('PDF_READ_ERROR')
  })
})

describe('reparseBook 目录校验', () => {
  it('books/ 之外的路径直接拒绝', async () => {
    await expect(reparseBook(lib, path.join(lib, 'elsewhere'))).rejects.toThrow(/outside/i)
  })

  it('books/ 直接子目录之外的深层路径拒绝（不在 ISBN 子目录上乱写）', async () => {
    const dir = await makeLegacyBook()
    await expect(reparseBook(lib, path.join(dir, 'chapters'))).rejects.toThrow(/direct child of books/)
    // 拒绝发生在读盘之前，原数据不受影响
    expect(fs.existsSync(path.join(dir, 'chapters', '01-old-parser.md'))).toBe(true)
  })
})

describe('parserVersion 兼容', () => {
  it('缺少 parserVersion 的旧 book.json 仍可被 scanBooks 读出，且不虚构该字段', async () => {
    const dir = await makeLegacyBook()
    const books = scanBooks(lib)
    const found = books.find((b) => b.dir === dir)
    expect(found).toBeDefined()
    expect(found!.title).toBe('sample')
    expect(found!.parserVersion).toBeUndefined()
    // 不因缺字段被判为坏数据
    expect(books).toHaveLength(1)
  })

  it('带 parserVersion 的 book.json 可读回原值', async () => {
    const dir = await makeLegacyBook()
    const json = readBookJson(dir)!
    writeBookJson(dir, { ...json, parserVersion: 2 })
    expect(readBookJson(dir)!.parserVersion).toBe(2)
  })
})
