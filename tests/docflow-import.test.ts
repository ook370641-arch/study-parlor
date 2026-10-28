import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import matter from 'gray-matter'
import { importStructuredBundle, buildDemoStructuredBundle } from '../electron/lib/docflow-import'
import { scanBooks, readBookJson } from '../electron/lib/books'

function tempLib(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'study-parlor-docflow-'))
}

describe('结构化产物导入（DocFlow 对照实验）', () => {
  it('内置样本写入 books/ 后能被书架扫描到，且标记结构化来源', () => {
    const lib = tempLib()
    const book = importStructuredBundle(lib, buildDemoStructuredBundle())

    expect(book.title).toContain('结构化样本')
    expect(book.parserKind).toBe('docflow-bundle')
    expect(book.toc.length).toBe(3)
    expect(fs.existsSync(path.join(book.dir, 'book.json'))).toBe(true)

    const scanned = scanBooks(lib)
    expect(scanned).toHaveLength(1)
    expect(scanned[0].parserKind).toBe('docflow-bundle')
    expect(scanned[0].chapterCount).toBe(3)
  })

  it('章节是真实 md 文件，frontmatter 带标题、章序与页码范围', () => {
    const lib = tempLib()
    const book = importStructuredBundle(lib, buildDemoStructuredBundle())

    const first = book.toc[0]
    const raw = fs.readFileSync(path.join(book.dir, first.chapterFile), 'utf8')
    const parsed = matter(raw)
    expect(parsed.data.title).toBe(first.title)
    expect(parsed.data.chapter_index).toBe(1)
    expect(parsed.data.page_range).toEqual([first.pageStart, first.pageEnd])
    expect(parsed.content).toContain('## 1.1')
  })

  it('表格以真实 Markdown 表格保留（本地 PDF.js 链会拍平）', () => {
    const lib = tempLib()
    const book = importStructuredBundle(lib, buildDemoStructuredBundle())
    const raw = fs.readFileSync(path.join(book.dir, book.toc[0].chapterFile), 'utf8')
    expect(raw).toContain('| 指标 | 本期 | 上期 | 同比 |')
    expect(raw).toContain('| --- | ---: | ---: | ---: |')
  })

  it('同名重复导入不覆盖已有书，而是追加序号', () => {
    const lib = tempLib()
    const a = importStructuredBundle(lib, buildDemoStructuredBundle())
    const b = importStructuredBundle(lib, buildDemoStructuredBundle())
    expect(a.dir).not.toBe(b.dir)
    expect(scanBooks(lib)).toHaveLength(2)
    expect(readBookJson(a.dir)?.parserKind).toBe('docflow-bundle')
  })

  it('空章节产物直接报错，不留下半成品目录', () => {
    const lib = tempLib()
    expect(() => importStructuredBundle(lib, { title: '空书', sourceLabel: 'x', chapters: [] }))
      .toThrow(/没有任何章节/)
    expect(scanBooks(lib)).toHaveLength(0)
    // 校验发生在建目录之前：连 books/ 都不应该被创建
    expect(fs.existsSync(path.join(lib, 'books'))).toBe(false)
  })
})
