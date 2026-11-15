import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { seedDefaultBooks } from '../electron/lib/default-books'

let root = ''
let sourceRoot = ''
let libraryPath = ''

function addBook(parent: string, name: string, body: string): void {
  const bookDir = path.join(parent, name)
  fs.mkdirSync(path.join(bookDir, 'chapters'), { recursive: true })
  fs.writeFileSync(path.join(bookDir, 'book.json'), JSON.stringify({ title: name }), 'utf8')
  fs.writeFileSync(path.join(bookDir, 'chapters', '01.md'), body, 'utf8')
}

describe('seedDefaultBooks', () => {
  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'default-books-'))
    sourceRoot = path.join(root, 'bundled')
    libraryPath = path.join(root, 'library')
    fs.mkdirSync(sourceRoot, { recursive: true })
  })

  afterEach(() => {
    vi.restoreAllMocks()
    fs.rmSync(root, { recursive: true, force: true })
  })

  it('首次配置时把内置书复制到学习库', () => {
    addBook(sourceRoot, 'A', 'chapter A')
    addBook(sourceRoot, 'B', 'chapter B')

    expect(seedDefaultBooks(libraryPath, sourceRoot)).toEqual({ copied: 2, skipped: 0 })
    expect(fs.readFileSync(path.join(libraryPath, 'books', 'A', 'chapters', '01.md'), 'utf8')).toBe('chapter A')
    expect(fs.readFileSync(path.join(libraryPath, 'books', 'B', 'book.json'), 'utf8')).toBe(JSON.stringify({ title: 'B' }))
  })

  it('同名书籍保留用户现有内容，其余书仍复制', () => {
    addBook(sourceRoot, 'A', 'bundled A')
    addBook(sourceRoot, 'B', 'bundled B')
    addBook(path.join(libraryPath, 'books'), 'A', 'user A')

    expect(seedDefaultBooks(libraryPath, sourceRoot)).toEqual({ copied: 1, skipped: 1 })
    expect(fs.readFileSync(path.join(libraryPath, 'books', 'A', 'chapters', '01.md'), 'utf8')).toBe('user A')
    expect(fs.readFileSync(path.join(libraryPath, 'books', 'B', 'chapters', '01.md'), 'utf8')).toBe('bundled B')
  })

  it('复制失败时清理临时目录，重试可补齐剩余书籍', () => {
    addBook(sourceRoot, 'A', 'chapter A')
    addBook(sourceRoot, 'B', 'chapter B')
    const copySync = fs.cpSync
    vi.spyOn(fs, 'cpSync').mockImplementation(((source, destination, options) => {
      if (path.basename(String(source)) === 'B') throw new Error('disk full')
      return copySync(source, destination, options)
    }) as typeof fs.cpSync)

    expect(() => seedDefaultBooks(libraryPath, sourceRoot)).toThrow('disk full')
    const booksRoot = path.join(libraryPath, 'books')
    expect(fs.readdirSync(booksRoot).filter(name => name.startsWith('.tmp-import-default-'))).toEqual([])
    expect(fs.existsSync(path.join(booksRoot, 'A'))).toBe(true)
    expect(fs.existsSync(path.join(booksRoot, 'B'))).toBe(false)

    vi.restoreAllMocks()
    expect(seedDefaultBooks(libraryPath, sourceRoot)).toEqual({ copied: 1, skipped: 1 })
    expect(fs.readFileSync(path.join(booksRoot, 'B', 'chapters', '01.md'), 'utf8')).toBe('chapter B')
  })
})

describe('内置书快照', () => {
  it('只包含可公开分发的书籍内容，且章节与原件齐全', () => {
    const bundledRoot = path.resolve(__dirname, '../resources/default-books')
    const names = fs.readdirSync(bundledRoot, { withFileTypes: true })
      .filter(entry => entry.isDirectory())
      .map(entry => entry.name)
      .sort()

    expect(names).toEqual(['DeepSeek SuperAgent', 'Intercom on Jobs-to-be-Done'])
    for (const name of names) {
      const bookDir = path.join(bundledRoot, name)
      const json = JSON.parse(fs.readFileSync(path.join(bookDir, 'book.json'), 'utf8'))
      expect(json.bookGuide).toBeUndefined()
      expect(json.parserVersion).toBe(3)

      const files = fs.readdirSync(bookDir, { recursive: true, encoding: 'utf8' })
      expect(files.filter(file => /\.(assistant|annotations|guide)\.md$/i.test(file))).toEqual([])
      for (const chapter of json.toc) {
        expect(fs.existsSync(path.join(bookDir, chapter.chapterFile))).toBe(true)
      }
      if (json.sourceFile === 'source.pdf') {
        expect(fs.existsSync(path.join(bookDir, 'source.pdf'))).toBe(true)
      }
    }
  })
})
