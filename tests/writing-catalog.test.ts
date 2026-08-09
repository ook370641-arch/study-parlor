import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { loadCatalog, updateEntry, removeEntry, migratePrefix, diffStale, catalogPath } from '../electron/lib/writing-catalog'
import { createFile } from '../electron/lib/writing-tree'

let lib: string
beforeEach(() => {
  lib = fs.mkdtempSync(path.join(os.tmpdir(), 'wcat-'))
  fs.mkdirSync(path.join(lib, 'writing'), { recursive: true })
})
afterEach(() => { fs.rmSync(lib, { recursive: true, force: true }) })

it('损坏 JSON 重建为空 catalog', () => {
  fs.writeFileSync(catalogPath(lib, 'writing'), '{bad')
  const c = loadCatalog(lib, 'writing')
  expect(c.version).toBe(1)
  expect(c.entries).toEqual({})
})

it('updateEntry 和 removeEntry', () => {
  updateEntry(lib, 'writing', 'a.md', { title: 'A', summary: '关于A', updatedAt: '2026-07-20' })
  const c = loadCatalog(lib, 'writing')
  expect(c.entries['a.md'].title).toBe('A')
  removeEntry(lib, 'writing', 'a.md')
  expect(loadCatalog(lib, 'writing').entries['a.md']).toBeUndefined()
})

it('diffStale:无条目/mtime 更新/旧格式条目都算待更新', () => {
  const aPath = createFile(lib, 'writing', '', 'a.md')
  const bPath = createFile(lib, 'writing', '', 'b.md')
  const cPath = createFile(lib, 'writing', '', 'c.md')
  const aMtime = fs.statSync(path.join(lib, aPath)).mtimeMs
  updateEntry(lib, 'writing', aPath, { title: 'A', summary: 'A', mtimeMs: aMtime })
  updateEntry(lib, 'writing', bPath, { title: 'B', summary: 'B', updatedAt: '2026-07-20' }) // 旧格式
  const stale = diffStale(lib, 'writing')
  expect(stale).not.toContain(aPath)
  expect(stale).toContain(bPath)
  expect(stale).toContain(cPath)
  // a 内容变动(mtime 变大)后重新入列
  const future = aMtime + 100000
  fs.utimesSync(path.join(lib, aPath), new Date(), new Date(future))
  expect(diffStale(lib, 'writing')).toContain(aPath)
})

it('空 catalog 返回默认结构', () => {
  const c = loadCatalog(lib, 'writing')
  expect(c.version).toBe(1)
  expect(c.entries).toEqual({})
})

it('migratePrefix:目录改名迁移自身及子级前缀条目', () => {
  updateEntry(lib, 'writing', 'writing/随笔/a.md', { title: 'A', summary: 'A', mtimeMs: 1 })
  updateEntry(lib, 'writing', 'writing/随笔/子/b.md', { title: 'B', summary: 'B', mtimeMs: 2 })
  updateEntry(lib, 'writing', 'writing/技术笔记/c.md', { title: 'C', summary: 'C', mtimeMs: 3 })
  migratePrefix(lib, 'writing', 'writing/随笔', 'writing/散文')
  const c = loadCatalog(lib, 'writing')
  expect(c.entries['writing/散文/a.md']?.summary).toBe('A')
  expect(c.entries['writing/散文/子/b.md']?.summary).toBe('B')
  expect(c.entries['writing/随笔/a.md']).toBeUndefined()
  expect(c.entries['writing/随笔/子/b.md']).toBeUndefined()
  // 不相关前缀条目不受影响
  expect(c.entries['writing/技术笔记/c.md']?.summary).toBe('C')
})

it('migratePrefix:单文件路径等价 migrateEntry', () => {
  updateEntry(lib, 'writing', 'writing/随笔/a.md', { title: 'A', summary: 'A', mtimeMs: 1 })
  migratePrefix(lib, 'writing', 'writing/随笔/a.md', 'writing/散文/a.md')
  const c = loadCatalog(lib, 'writing')
  expect(c.entries['writing/散文/a.md']?.summary).toBe('A')
  expect(c.entries['writing/随笔/a.md']).toBeUndefined()
})

it('migratePrefix:oldRel 不存在时 no-op 不写盘', () => {
  updateEntry(lib, 'writing', 'writing/随笔/a.md', { title: 'A', summary: 'A', mtimeMs: 1 })
  const mtimeBefore = fs.statSync(catalogPath(lib, 'writing')).mtimeMs
  migratePrefix(lib, 'writing', 'writing/不存在', 'writing/新目录')
  const c = loadCatalog(lib, 'writing')
  expect(c.entries['writing/随笔/a.md']).toBeDefined()
  expect(c.entries['writing/新目录']).toBeUndefined()
  expect(fs.statSync(catalogPath(lib, 'writing')).mtimeMs).toBe(mtimeBefore)
})
