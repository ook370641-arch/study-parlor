// tests/writing-created.test.ts
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import matter from 'gray-matter'
import { createFile, writeWritingFile, renameNode, moveNode, scanRoot } from '../electron/lib/writing-tree'
import { loadCatalog } from '../electron/lib/writing-catalog'

let lib: string

beforeEach(() => {
  lib = fs.mkdtempSync(path.join(os.tmpdir(), 'sp-writing-'))
})
afterEach(() => {
  fs.rmSync(lib, { recursive: true, force: true })
})

function readFm(rel: string): Record<string, unknown> {
  return matter(fs.readFileSync(path.join(lib, rel), 'utf-8')).data
}

describe('writing created 时间戳', () => {
  it('新建文章 frontmatter 含 ISO created', () => {
    const rel = createFile(lib, 'writing', '', '测试文章')
    const fm = readFm(rel)
    expect(fm.type).toBe('writing')
    expect(typeof fm.created).toBe('string')
    expect(Number.isNaN(Date.parse(fm.created as string))).toBe(false)
  })

  it('保存（writeWritingFile）后 created 不变', () => {
    const rel = createFile(lib, 'writing', '', '测试文章')
    const created = readFm(rel).created
    writeWritingFile(lib, rel, '正文内容')
    expect(readFm(rel).created).toBe(created)
  })

  it('改名与移动后 created 不变', () => {
    const rel = createFile(lib, 'writing', '', '测试文章')
    const created = readFm(rel).created
    const renamed = renameNode(lib, rel, '新名字.md')
    const moved = moveNode(lib, renamed, 'writing/分组A')
    expect(readFm(moved).created).toBe(created)
  })
})

// repository/ 外部引入文件扫描时补 created(2026-08-19 设计):
// 取值 = 文件 birthtime(拷入库的时刻);只补缺失项,已有 frontmatter 不动。
describe('repository 扫描补 created', () => {
  function writeRel(rel: string, content: string): string {
    const abs = path.join(lib, rel)
    fs.mkdirSync(path.dirname(abs), { recursive: true })
    fs.writeFileSync(abs, content, 'utf-8')
    return abs
  }

  it('无 frontmatter 的文件补上 created = birthtime,正文不变', () => {
    const abs = writeRel('repository/旧文.md', '旧文正文\n第二行\n')
    scanRoot(lib, 'repository')
    const raw = fs.readFileSync(abs, 'utf-8')
    const parsed = matter(raw)
    expect(parsed.content.trim()).toBe('旧文正文\n第二行')
    expect(parsed.data.created).toBe(fs.statSync(abs).birthtime.toISOString())
  })

  it('嵌套子目录里的文件同样补上', () => {
    const abs = writeRel('repository/分组/深/文.md', '正文')
    scanRoot(lib, 'repository')
    expect(typeof readFm('repository/分组/深/文.md').created).toBe('string')
  })

  it('已有 created 的文件零改动', () => {
    const original = '---\ntype: writing\ncreated: \'2020-01-02T03:04:05.000Z\'\n---\n\n正文\n'
    const abs = writeRel('repository/老文.md', original)
    scanRoot(lib, 'repository')
    expect(fs.readFileSync(abs, 'utf-8')).toBe(original)
  })

  it('有 frontmatter 但缺 created → 合并且既有字段保留', () => {
    writeRel('repository/半头.md', '---\nauthor: hermes\ntags:\n  - a\n---\n\n正文\n')
    scanRoot(lib, 'repository')
    const fm = readFm('repository/半头.md')
    expect(fm.author).toBe('hermes')
    expect(fm.tags).toEqual(['a'])
    expect(typeof fm.created).toBe('string')
  })

  it('writing/ 根不在补写范围内', () => {
    const abs = writeRel('writing/新文.md', '正文\n')
    scanRoot(lib, 'writing')
    expect(fs.readFileSync(abs, 'utf-8')).toBe('正文\n')
  })

  it('隐藏伴生文件与非 md 文件跳过', () => {
    const assistant = writeRel('repository/文.assistant.md', '助手记录\n')
    writeRel('repository/表.xlsx', 'fake-binary')
    scanRoot(lib, 'repository')
    expect(fs.readFileSync(assistant, 'utf-8')).toBe('助手记录\n')
    expect(matter(fs.readFileSync(assistant, 'utf-8')).data.created).toBeUndefined()
  })

  it('单文件补写失败不阻断扫描', () => {
    const readonlyAbs = writeRel('repository/只读.md', '正文\n')
    writeRel('repository/正常.md', '正文\n')
    fs.chmodSync(readonlyAbs, 0o444)
    try {
      const tree = scanRoot(lib, 'repository')
      expect(tree.map(n => n.name).sort()).toEqual(['只读.md', '正常.md'])
      // 其他文件不受影响,仍然补上
      expect(typeof readFm('repository/正常.md').created).toBe('string')
    } finally {
      fs.chmodSync(readonlyAbs, 0o666)
    }
  })
})

// 台账（catalog.stamped）：已确认含 created 的文件记 path→mtimeMs，二次扫描命中即跳过读取（2026-09-16 性能优化）
describe('repository 补 created 台账', () => {
  function writeRel(rel: string, content: string): string {
    const abs = path.join(lib, rel)
    fs.mkdirSync(path.dirname(abs), { recursive: true })
    fs.writeFileSync(abs, content, 'utf-8')
    return abs
  }
  /** readFileSync 调用中读取 .md 的次数（排除 .catalog.json） */
  function mdReads(spy: ReturnType<typeof vi.spyOn>): number {
    return spy.mock.calls.filter(c => String(c[0]).endsWith('.md')).length
  }

  it('首次扫描后写入台账：已有 created 记当前 mtime；补写的记写入后新 mtime', () => {
    const old = writeRel('repository/老文.md', '---\ncreated: \'2020-01-02T03:04:05.000Z\'\n---\n\n正文\n')
    const fresh = writeRel('repository/新文.md', '正文\n')
    scanRoot(lib, 'repository')
    const stamped = loadCatalog(lib, 'repository').stamped
    expect(stamped['repository/老文.md']).toBe(fs.statSync(old).mtimeMs)
    expect(stamped['repository/新文.md']).toBe(fs.statSync(fresh).mtimeMs)
  })

  it('二次扫描命中台账，不再读取任何 .md 文件', () => {
    writeRel('repository/a.md', '正文 a\n')
    writeRel('repository/分组/b.md', '---\ncreated: \'2020-01-02T03:04:05.000Z\'\n---\n\n正文 b\n')
    scanRoot(lib, 'repository')
    const spy = vi.spyOn(fs, 'readFileSync')
    try {
      scanRoot(lib, 'repository')
      expect(mdReads(spy)).toBe(0)
    } finally {
      spy.mockRestore()
    }
  })

  it('外部修改后 mtime 变化 → 该文件重新检查，其余仍命中台账', () => {
    const a = writeRel('repository/a.md', '正文 a\n')
    writeRel('repository/b.md', '正文 b\n')
    scanRoot(lib, 'repository')
    // 外部编辑 a.md（内容仍无 created，应被补写）；显式拨动 mtime 避免同毫秒精度问题
    fs.writeFileSync(a, '正文 a 改\n', 'utf-8')
    const future = new Date(Date.now() + 60_000)
    fs.utimesSync(a, future, future)
    const spy = vi.spyOn(fs, 'readFileSync')
    try {
      scanRoot(lib, 'repository')
      const reads = spy.mock.calls.map(c => String(c[0])).filter(p => p.endsWith('.md'))
      expect(reads).toEqual([a])
    } finally {
      spy.mockRestore()
    }
    expect(typeof readFm('repository/a.md').created).toBe('string')
    // 两个文件最终都在台账中
    const stamped = loadCatalog(lib, 'repository').stamped
    expect(stamped['repository/a.md']).toBe(fs.statSync(a).mtimeMs)
    expect(stamped['repository/b.md']).toBeDefined()
  })

  it('文件删除后台账条目被清理', () => {
    const a = writeRel('repository/a.md', '正文\n')
    scanRoot(lib, 'repository')
    expect(loadCatalog(lib, 'repository').stamped['repository/a.md']).toBeDefined()
    fs.rmSync(a)
    scanRoot(lib, 'repository')
    expect(loadCatalog(lib, 'repository').stamped['repository/a.md']).toBeUndefined()
  })

  it('旧格式 .catalog.json（无 stamped 字段）兼容，扫描后补出台账', () => {
    writeRel('repository/a.md', '---\ncreated: \'2020-01-02T03:04:05.000Z\'\n---\n\n正文\n')
    fs.writeFileSync(path.join(lib, 'repository', '.catalog.json'),
      JSON.stringify({ version: 2, entries: {}, groups: {} }), 'utf-8')
    scanRoot(lib, 'repository')
    expect(loadCatalog(lib, 'repository').stamped['repository/a.md']).toBeDefined()
  })
})
