import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { scanBooks, readBookJson, writeBookJson, buildChapterBody, assertInsideBooks, sanitizeBookDirName, BOOKS_DIR, stripDuplicateLeadingHeading } from '../electron/lib/books'

let lib: string
beforeEach(() => {
  lib = fs.mkdtempSync(path.join(os.tmpdir(), 'sp-books-'))
})
afterEach(() => {
  fs.rmSync(lib, { recursive: true, force: true })
})

const sampleJson = {
  title: 'Intercom on Jobs-to-be-Done',
  importedAt: '2026-10-27T00:00:00.000Z',
  sourceFile: 'source.pdf',
  hasToc: true,
  toc: [{ title: 'Foreword', chapterFile: 'chapters/01-foreword.md', pageStart: 4, pageEnd: 4 }],
}

describe('writeBookJson / readBookJson', () => {
  it('原子写后可读回；目录不存在时自动创建', () => {
    const dir = path.join(lib, BOOKS_DIR, 'jtbd')
    writeBookJson(dir, sampleJson)
    expect(readBookJson(dir)).toEqual(sampleJson)
  })

  it('book.json 损坏时读回 null', () => {
    const dir = path.join(lib, BOOKS_DIR, 'bad')
    fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(path.join(dir, 'book.json'), '{oops', 'utf8')
    expect(readBookJson(dir)).toBeNull()
  })

  it('importedAt / toc 非法时读回 null，不把坏数据传给 UI', () => {
    const dir = path.join(lib, BOOKS_DIR, 'invalid')
    fs.mkdirSync(dir, { recursive: true })
    const cases = [
      { ...sampleJson, importedAt: 123 },
      { ...sampleJson, toc: [] },
      { ...sampleJson, toc: [{ title: 'x' }] },
      { ...sampleJson, toc: [{ ...sampleJson.toc[0], chapterFile: '../escape.md' }] },
    ]
    for (const data of cases) {
      fs.writeFileSync(path.join(dir, 'book.json'), JSON.stringify(data), 'utf8')
      expect(readBookJson(dir)).toBeNull()
    }
  })
})

describe('sanitizeBookDirName', () => {
  it('拒绝 . / .. / Windows 保留名与结尾点', () => {
    expect(sanitizeBookDirName('..')).toBe('untitled')
    expect(sanitizeBookDirName('.')).toBe('untitled')
    expect(sanitizeBookDirName('CON')).toBe('untitled')
    expect(sanitizeBookDirName('My Book...')).toBe('My Book')
    expect(sanitizeBookDirName('a/b:c')).toBe('abc')
  })

  it('清洗结果永远是 books/ 的直接子目录（.. 与 CON 不会逃出）', () => {
    for (const raw of ['..', '.', 'CON', 'PRN', 'com1', 'a/../../b', '..\\..\\evil']) {
      const abs = path.join(lib, BOOKS_DIR, sanitizeBookDirName(raw))
      expect(path.dirname(path.resolve(abs))).toBe(path.resolve(lib, BOOKS_DIR))
      expect(path.basename(abs)).not.toMatch(/[\\/]/)
    }
  })
})

describe('scanBooks', () => {
  it('扫描 books/*/book.json 并按 importedAt 新到旧排序；坏目录跳过', () => {
    writeBookJson(path.join(lib, BOOKS_DIR, 'a'), sampleJson)
    writeBookJson(path.join(lib, BOOKS_DIR, 'b'), { ...sampleJson, title: 'B', importedAt: '2026-10-28T00:00:00.000Z' })
    fs.mkdirSync(path.join(lib, BOOKS_DIR, 'broken'), { recursive: true })
    const books = scanBooks(lib)
    expect(books.map((b) => b.title)).toEqual(['B', 'Intercom on Jobs-to-be-Done'])
    expect(books[0].chapterCount).toBe(1)
    expect(books[0].hasToc).toBe(true)
  })

  it('importedAt 非字符串 / toc 项缺字段的坏书被跳过，不拖垮整个列表', () => {
    writeBookJson(path.join(lib, BOOKS_DIR, 'good'), sampleJson)
    const bad = [
      { ...sampleJson, importedAt: 123 },
      { ...sampleJson, hasToc: 'yes' },
      // toc 项缺 chapterFile
      { ...sampleJson, toc: [{ title: 'Foreword', pageStart: 4, pageEnd: 4 }] },
      // toc 项 pageStart 非数字
      { ...sampleJson, toc: [{ ...sampleJson.toc[0], pageStart: '4' }] },
    ]
    bad.forEach((data, i) => {
      const dir = path.join(lib, BOOKS_DIR, `bad-${i}`)
      fs.mkdirSync(dir, { recursive: true })
      fs.writeFileSync(path.join(dir, 'book.json'), JSON.stringify(data), 'utf8')
    })
    const books = scanBooks(lib)
    expect(books.map((b) => b.title)).toEqual([sampleJson.title])
  })

  it('非目录条目 / 无 book.json 目录被跳过，不影响其他书', () => {
    writeBookJson(path.join(lib, BOOKS_DIR, 'good'), sampleJson)
    fs.mkdirSync(path.join(lib, BOOKS_DIR, 'no-json'), { recursive: true })
    fs.writeFileSync(path.join(lib, BOOKS_DIR, 'not-a-dir'), 'plain file', 'utf8')
    expect(scanBooks(lib).map((b) => b.title)).toEqual([sampleJson.title])
  })

  it('导入中的 .tmp-import-* 临时目录不会出现在书架', () => {
    writeBookJson(path.join(lib, BOOKS_DIR, 'good'), sampleJson)
    const tmp = path.join(lib, BOOKS_DIR, '.tmp-import-abc123')
    writeBookJson(tmp, { ...sampleJson, title: 'Half Imported' })
    expect(scanBooks(lib).map((b) => b.title)).toEqual([sampleJson.title])
  })

  it('books 目录不存在时返回空数组', () => {
    expect(scanBooks(lib)).toEqual([])
  })
})

describe('buildChapterBody', () => {
  it('按闭区间拼页，页间双换行', () => {
    expect(buildChapterBody(['p1', 'p2', 'p3'], { title: 'x', startPage: 2, endPage: 3 })).toBe('p2\n\np3')
  })
})

describe('assertInsideBooks', () => {
  it('库外路径抛错', () => {
    expect(() => assertInsideBooks(lib, 'C:/Windows/evil.pdf')).toThrow(/outside/i)
  })
  it('books 内路径放行', () => {
    expect(() => assertInsideBooks(lib, path.join(lib, BOOKS_DIR, 'a', 'book.json'))).not.toThrow()
  })
})

describe('stripDuplicateLeadingHeading', () => {
  it('正文首个标题与章节名相同时去掉，避免阅读器重复显示', () => {
    expect(stripDuplicateLeadingHeading('## Introduction\n\n正文第一段', 'Introduction')).toBe('正文第一段')
  })

  it('归一化后比较（大小写 / 空白 / 标点）', () => {
    expect(stripDuplicateLeadingHeading('## 第 1 章：总则\n\n正文', '第1章 总则')).toBe('正文')
  })

  it('标题不同则原样保留', () => {
    const body = '## 1.1 两条产品线\n\n正文'
    expect(stripDuplicateLeadingHeading(body, '第一章 业务结构')).toBe(body)
  })

  it('没有标题行时原样返回', () => {
    expect(stripDuplicateLeadingHeading('正文', 'Foreword')).toBe('正文')
  })
})
