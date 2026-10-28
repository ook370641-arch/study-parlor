import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import fs from 'node:fs'
import type { PathLike } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import matter from 'gray-matter'
import { __test__importFromPages } from '../electron/lib/books'

let lib: string
beforeEach(() => {
  lib = fs.mkdtempSync(path.join(os.tmpdir(), 'sp-import-'))
})
afterEach(() => {
  fs.rmSync(lib, { recursive: true, force: true })
})

const TOC = `Table of Contents
Alpha
Beta
3
5`
const pages = ['cover', TOC, '3\nAlpha body', 'alpha more', '5\nBeta body']

describe('__test__importFromPages', () => {
  it('切章写 md（frontmatter 含 title/chapter_index/page_range）并写 book.json', async () => {
    const src = path.join(lib, 'src.pdf')
    fs.writeFileSync(src, 'fake')
    const book = await __test__importFromPages(lib, src, 'My Book', pages)
    expect(book.hasToc).toBe(true)
    expect(book.toc).toHaveLength(2)
    const chapterAbs = path.join(book.dir, book.toc[0].chapterFile)
    const d = matter(fs.readFileSync(chapterAbs, 'utf8'))
    expect(d.data.title).toBe('Alpha')
    expect(d.data.chapter_index).toBe(1)
    expect(d.content).toContain('Alpha body')
    expect(fs.existsSync(path.join(book.dir, 'source.pdf'))).toBe(true)
  })

  it('段落化正文 + 原始行目录：目录解析用 rawPages，正文用 pages', async () => {
    const src = path.join(lib, 'src4.pdf')
    fs.writeFileSync(src, 'fake')
    // pages 是段落化产物：目录页的页码孤行已被丢弃、标题连成一行
    const paragraphPages = [
      'cover',
      'Table of Contents Foreword Introduction',
      'Foreword body paragraph.',
      'Introduction body paragraph.',
    ]
    const rawPages = ['cover', 'Table of Contents\nForeword\nIntroduction\n3\n5', '3\nForeword', '5\nIntroduction']
    const book = await __test__importFromPages(lib, src, 'Raw Toc', paragraphPages, rawPages)
    expect(book.hasToc).toBe(true)
    expect(book.toc.map((t) => t.title)).toEqual(['Foreword', 'Introduction'])
    const chapterAbs = path.join(book.dir, book.toc[0].chapterFile)
    // 正文取段落化结果（干净段落），不取 raw 行
    expect(matter(fs.readFileSync(chapterAbs, 'utf8')).content).toContain('Foreword body paragraph.')
  })

  it('全书无目录时单章导入且 hasToc=false', async () => {    const src = path.join(lib, 'src2.pdf')
    fs.writeFileSync(src, 'fake')
    const book = await __test__importFromPages(lib, src, 'No Toc', ['page one text', 'page two text'])
    expect(book.hasToc).toBe(false)
    expect(book.toc).toHaveLength(1)
  })

  it('文字层为空时抛 SCANNED_PDF', async () => {
    const src = path.join(lib, 'src3.pdf')
    fs.writeFileSync(src, 'fake')
    await expect(__test__importFromPages(lib, src, 'Scanned', ['', ' ', ''])).rejects.toMatchObject({ code: 'SCANNED_PDF' })
  })

  it('只有页码的扫描页也抛 SCANNED_PDF', async () => {
    const src = path.join(lib, 'src3b.pdf')
    fs.writeFileSync(src, 'fake')
    const pages = Array.from({ length: 50 }, (_, i) => String(i + 1))
    await expect(__test__importFromPages(lib, src, 'Scanned Pages', pages)).rejects.toMatchObject({ code: 'SCANNED_PDF' })
  })

  it('同名书重复导入时目录加 -HHMM 后缀，三次都不同且都存在', async () => {
    const src = path.join(lib, 'src4.pdf')
    fs.writeFileSync(src, 'fake')
    const a = await __test__importFromPages(lib, src, 'Dup', pages)
    const b = await __test__importFromPages(lib, src, 'Dup', pages)
    const c = await __test__importFromPages(lib, src, 'Dup', pages)
    expect(new Set([a.dir, b.dir, c.dir]).size).toBe(3)
    const booksRoot = path.join(lib, 'books')
    for (const book of [a, b, c]) {
      expect(fs.existsSync(book.dir)).toBe(true)
      // 绝不覆盖已有书：每次都是 books/ 的直接子目录
      expect(path.dirname(path.resolve(book.dir))).toBe(path.resolve(booksRoot))
      expect(fs.existsSync(path.join(book.dir, 'book.json'))).toBe(true)
    }
    // 导入成功后不残留临时目录
    expect(fs.readdirSync(booksRoot).some((n) => n.startsWith('.tmp-import-'))).toBe(false)
  })

  it('Windows 保留名 CON 回退为 untitled，仍是 books/ 直接子目录', async () => {
    const src = path.join(lib, 'src-con.pdf')
    fs.writeFileSync(src, 'fake')
    const book = await __test__importFromPages(lib, src, 'CON', pages)
    expect(path.basename(book.dir)).toMatch(/^untitled/)
    expect(path.dirname(path.resolve(book.dir))).toBe(path.resolve(path.join(lib, 'books')))
  })

  it('书名为 . / .. 时落到安全的 untitled 目录，不写出 books/', async () => {
    const src = path.join(lib, 'src5.pdf')
    fs.writeFileSync(src, 'fake')
    const book = await __test__importFromPages(lib, src, '..', pages)
    expect(path.basename(book.dir)).toMatch(/^untitled/)
    expect(path.dirname(book.dir)).toBe(path.join(lib, 'books'))
    expect(fs.existsSync(path.join(lib, 'chapters'))).toBe(false)
  })

  it('复制源文件失败时清理临时目录，不留下半成品', async () => {
    const missing = path.join(lib, 'missing.pdf')
    await expect(__test__importFromPages(lib, missing, 'Broken', pages)).rejects.toThrow()
    const root = path.join(lib, 'books')
    const leftovers = fs.existsSync(root) ? fs.readdirSync(root) : []
    expect(leftovers).toEqual([])
  })

  it('最终 rename 失败时回滚临时目录，不留孤儿目录', async () => {
    const src = path.join(lib, 'src-rename.pdf')
    fs.writeFileSync(src, 'fake')
    const root = path.join(lib, 'books')
    const realRename = fs.renameSync
    const spy = vi.spyOn(fs, 'renameSync').mockImplementation(((from: PathLike, to: PathLike) => {
      // 只拦截「临时目录 → 正式书目」这一步，book.json 在临时目录内的 rename 正常放行
      const destDir = path.dirname(path.resolve(String(to)))
      if (String(from).includes('.tmp-import-') && destDir === path.resolve(root)) {
        const err = new Error('simulated rename failure') as NodeJS.ErrnoException
        err.code = 'EACCES'
        throw err
      }
      return realRename(from, to)
    }) as typeof fs.renameSync)
    try {
      await expect(__test__importFromPages(lib, src, 'Rename Fail', pages)).rejects.toThrow(/simulated rename failure/)
    } finally {
      spy.mockRestore()
    }
    expect(fs.readdirSync(root)).toEqual([])
  })
})
