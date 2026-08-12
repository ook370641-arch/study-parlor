import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { scanRoot, createFile, importBinaryFile, isNonMdPath } from '../electron/lib/writing-tree'
import { diffStale, collectGroupDirs, loadCatalog, updateEntry } from '../electron/lib/writing-catalog'
import { normalizeWritingFileRename, writingPreviewKindOf } from '../src/lib/writing-tree-utils'

const FIXTURES = path.join(__dirname, 'fixtures')

let lib: string
beforeEach(() => {
  lib = fs.mkdtempSync(path.join(os.tmpdir(), 'wmd-'))
  fs.mkdirSync(path.join(lib, 'writing'), { recursive: true })
})
afterEach(() => { fs.rmSync(lib, { recursive: true, force: true }) })

describe('scanRoot 非 md 支持', () => {
  it('包含 xlsx/pdf/docx，仍忽略其它扩展名', () => {
    fs.writeFileSync(path.join(lib, 'writing/a.md'), '# a')
    fs.writeFileSync(path.join(lib, 'writing/b.txt'), 'b')
    fs.writeFileSync(path.join(lib, 'writing/c.png'), '')
    const seeds: Array<[string, string]> = [
      ['d.xlsx', 'sample.xlsx'],
      ['e.PDF', 'sample.pdf'], // 大写扩展名
      ['f.docx', 'sample.docx'],
    ]
    for (const [target, src] of seeds) {
      fs.copyFileSync(path.join(FIXTURES, src), path.join(lib, 'writing', target))
    }
    const names = scanRoot(lib, 'writing').map(n => n.name).sort()
    expect(names).toEqual(['a.md', 'd.xlsx', 'e.PDF', 'f.docx'])
  })
})

describe('importBinaryFile', () => {
  it('按原名拷入并返回相对路径', () => {
    const rel = importBinaryFile(lib, 'writing', '', path.join(FIXTURES, 'sample.xlsx'))
    expect(rel).toBe('writing/sample.xlsx')
    expect(fs.existsSync(path.join(lib, rel))).toBe(true)
    expect(fs.readFileSync(path.join(lib, rel)).equals(fs.readFileSync(path.join(FIXTURES, 'sample.xlsx')))).toBe(true)
  })

  it('重名自动加时间戳后缀', () => {
    importBinaryFile(lib, 'writing', '', path.join(FIXTURES, 'sample.pdf'))
    const rel = importBinaryFile(lib, 'writing', '', path.join(FIXTURES, 'sample.pdf'))
    expect(rel).toMatch(/writing\/sample-\d{4}\.pdf$/)
  })

  it('可导入到子分组', () => {
    fs.mkdirSync(path.join(lib, 'writing/数据'), { recursive: true })
    const rel = importBinaryFile(lib, 'writing', '数据', path.join(FIXTURES, 'sample.xlsx'))
    expect(rel).toBe('writing/数据/sample.xlsx')
  })

  it('拒绝路径穿越', () => {
    expect(() => importBinaryFile(lib, 'writing', '../../etc', path.join(FIXTURES, 'sample.xlsx'))).toThrowError(/WRITING_PATH_FORBIDDEN/)
  })
})

describe('isNonMdPath', () => {
  it('识别 xlsx/pdf/docx 相对路径', () => {
    expect(isNonMdPath('writing/a.xlsx')).toBe(true)
    expect(isNonMdPath('repository/sub/b.pdf')).toBe(true)
    expect(isNonMdPath('writing/a.docx')).toBe(true)
    expect(isNonMdPath('writing/a.md')).toBe(false)
    expect(isNonMdPath('writing/a.txt')).toBe(false)
  })
})

describe('catalog 对非 md 的防护', () => {
  it('diffStale 不把非 md 文件列为待摘要（避免 gray-matter 读二进制）', () => {
    createFile(lib, 'writing', '', 'a.md')
    importBinaryFile(lib, 'writing', '', path.join(FIXTURES, 'sample.xlsx'))
    const stale = diffStale(lib, 'writing')
    expect(stale).toContain('writing/a.md')
    expect(stale).not.toContain('writing/sample.xlsx')
  })

  it('collectGroupDirs 的分组成员只含 md', () => {
    fs.mkdirSync(path.join(lib, 'writing/分组'), { recursive: true })
    fs.writeFileSync(path.join(lib, 'writing/分组/doc.md'), '# doc')
    importBinaryFile(lib, 'writing', '分组', path.join(FIXTURES, 'sample.xlsx'))
    const dirs = collectGroupDirs(scanRoot(lib, 'writing'))
    const g = dirs.find(d => d.rel === 'writing/分组')!
    expect(g.memberPaths).toEqual(['writing/分组/doc.md'])
  })

  it('非 md 文件也能写入 catalog stub 条目（助手资料目录可见）', () => {
    importBinaryFile(lib, 'writing', '', path.join(FIXTURES, 'sample.pdf'))
    updateEntry(lib, 'writing', 'writing/sample.pdf', { title: 'sample', summary: 'PDF 文件，可用 read_local 读取内容', mtimeMs: 1 })
    const c = loadCatalog(lib, 'writing')
    expect(c.entries['writing/sample.pdf']?.title).toBe('sample')
    expect(c.entries['writing/sample.pdf']?.mtimeMs).toBe(1)
  })
})

describe('writing-tree-utils 非 md 重命名/类型', () => {
  it('normalizeWritingFileRename 保留扩展名', () => {
    expect(normalizeWritingFileRename('报表', 'xlsx')).toBe('报表.xlsx')
    expect(normalizeWritingFileRename(' 数据 ', 'pdf')).toBe('数据.pdf')
    expect(normalizeWritingFileRename('a.PDF', 'pdf')).toBe('a.PDF') // 显式带扩展名则原样
    expect(normalizeWritingFileRename('doc', '.docx')).toBe('doc.docx') // 带点扩展名
  })

  it('writingPreviewKindOf 按扩展名判断', () => {
    expect(writingPreviewKindOf('writing/报表.xlsx')).toBe('xlsx')
    expect(writingPreviewKindOf('writing/a.PDF')).toBe('pdf')
    expect(writingPreviewKindOf('writing/note.docx')).toBe('docx')
    expect(writingPreviewKindOf('writing/note.md')).toBe('md')
    expect(writingPreviewKindOf('writing/note.txt')).toBe('md')
  })
})
