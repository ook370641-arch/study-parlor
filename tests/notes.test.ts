import { describe, expect, it, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { sanitizeNoteFilename, serializeNote, parseNoteFile, scanNotes, createNoteFile, updateNoteMeta, importReadNotes } from '@electron/lib/notes'

let lib: string
beforeEach(() => { lib = fs.mkdtempSync(path.join(os.tmpdir(), 'notes-test-')) })
afterEach(() => { fs.rmSync(lib, { recursive: true, force: true }) })

describe('sanitizeNoteFilename', () => {
  it('去除非法字符并截断', () => {
    expect(sanitizeNoteFilename('a/b\\c:d*e?f"g<h>i|j')).toBe('abcdefghij')
    expect(sanitizeNoteFilename('x'.repeat(100))).toHaveLength(80)
    expect(sanitizeNoteFilename('   ')).toBe('untitled')
  })
})

describe('serializeNote / parseNoteFile 往返', () => {
  it('字段全量往返', () => {
    const meta = { title: 'T', url: 'https://a.b/c', source: 'anthropic' as const, rating: 4, summary: 's', highlight: 'h', collected_at: '2026-10-20T00:00:00.000Z', read_at: '2026-10-18T00:00:00.000Z' }
    const raw = serializeNote(meta, '正文内容')
    const entry = parseNoteFile('notes/t.md', raw)
    expect(entry.meta).toEqual(meta)
    expect(entry.parseError).toBeUndefined()
  })
  it('缺省字段补默认：rating=0，summary/highlight 空串，source=manual', () => {
    const entry = parseNoteFile('notes/x.md', '---\ntitle: X\n---\nbody')
    expect(entry.meta.rating).toBe(0)
    expect(entry.meta.source).toBe('manual')
  })
  it('frontmatter 损坏 → parseError: true，不抛', () => {
    const entry = parseNoteFile('notes/bad.md', '---\n: [broken\n---\nx')
    expect(entry.parseError).toBe(true)
  })
})

describe('createNoteFile / scanNotes', () => {
  it('自动建 notes/ 目录，重名加 -HHMM 后缀，scan 按 collected_at 新→旧', () => {
    const a = createNoteFile(lib, { title: 'Hello', url: 'https://a/1' })
    const bname = createNoteFile(lib, { title: 'Hello', url: 'https://a/2' })
    expect(a.path).toBe('notes/Hello.md')
    expect(bname.path).toMatch(/^notes\/Hello-\d{4}\.md$/)
    const list = scanNotes(lib)
    expect(list).toHaveLength(2)
    expect(list.every(e => e.meta.title === 'Hello')).toBe(true)
  })
})

describe('updateNoteMeta', () => {
  it('只改 frontmatter 指定字段，body 原样保留', () => {
    const { path: p } = createNoteFile(lib, { title: 'A', url: 'https://a' })
    fs.writeFileSync(path.join(lib, p), serializeNote(parseNoteFile(p, fs.readFileSync(path.join(lib, p), 'utf8')).meta, '我的正文'), 'utf8')
    updateNoteMeta(lib, p, { rating: 5, summary: '好文' })
    const raw = fs.readFileSync(path.join(lib, p), 'utf8')
    const entry = parseNoteFile(p, raw)
    expect(entry.meta.rating).toBe(5)
    expect(entry.meta.summary).toBe('好文')
    expect(raw).toContain('我的正文')
  })
})

describe('importReadNotes', () => {
  it('从 .collection.json 导入 read 列表；幂等，第二次全 skip', () => {
    const dir = path.join(lib, 'Anthropic博客')
    fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(path.join(dir, '.collection.json'), JSON.stringify({
      version: 1, entries: [], dismissed: [], history: [],
      read: [
        { sourceUrl: 'https://anthropic.com/a', title: 'Article A', filePath: 'Anthropic博客/a.md', readAt: '2026-10-01T00:00:00.000Z' },
        { sourceUrl: 'https://anthropic.com/b', title: 'Article B', filePath: 'Anthropic博客/b.md', readAt: '2026-10-02T00:00:00.000Z' },
      ],
    }), 'utf8')
    const r1 = importReadNotes(lib)
    expect(r1).toEqual({ created: 2, skipped: 0 })
    const r2 = importReadNotes(lib)
    expect(r2).toEqual({ created: 0, skipped: 2 })
    const list = scanNotes(lib)
    expect(list.map(e => e.meta.url).sort()).toEqual(['https://anthropic.com/a', 'https://anthropic.com/b'])
    expect(list.every(e => e.meta.source === 'anthropic')).toBe(true)
    expect(list.find(e => e.meta.title === 'Article A')?.meta.read_at).toBe('2026-10-01T00:00:00.000Z')
  })
})