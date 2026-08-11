import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { loadCatalog, updateEntry, removeEntry, migratePrefix, diffStale, catalogPath, updateGroupSummary, removeGroupSummary, collectGroupDirs, groupSignature } from '../electron/lib/writing-catalog'
import { createFile, scanRoot } from '../electron/lib/writing-tree'

let lib: string
beforeEach(() => {
  lib = fs.mkdtempSync(path.join(os.tmpdir(), 'wcat-'))
  fs.mkdirSync(path.join(lib, 'writing'), { recursive: true })
})
afterEach(() => { fs.rmSync(lib, { recursive: true, force: true }) })

it('损坏 JSON 重建为空 catalog', () => {
  fs.writeFileSync(catalogPath(lib, 'writing'), '{bad')
  const c = loadCatalog(lib, 'writing')
  expect(c.version).toBe(2)
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
  expect(c.version).toBe(2)
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

it('v1 catalog 归一化为 v2（groups 缺省空）', () => {
  fs.writeFileSync(catalogPath(lib, 'writing'), JSON.stringify({ version: 1, entries: { 'a.md': { title: 'A', summary: 'A' } } }))
  const c = loadCatalog(lib, 'writing')
  expect(c.version).toBe(2)
  expect(c.entries['a.md'].summary).toBe('A')
  expect(c.groups).toEqual({})
})

it('collectGroupDirs 收集含文件的分组与全后代文件', () => {
  fs.mkdirSync(path.join(lib, 'writing/随笔'), { recursive: true })
  fs.writeFileSync(path.join(lib, 'writing/随笔/a.md'), '# a')
  fs.mkdirSync(path.join(lib, 'writing/随笔/子'), { recursive: true })
  fs.writeFileSync(path.join(lib, 'writing/随笔/子/b.md'), '# b')
  fs.writeFileSync(path.join(lib, 'writing/根.md'), '# root')
  const dirs = collectGroupDirs(scanRoot(lib, 'writing'))
  expect(dirs).toHaveLength(2)
  const sui = dirs.find(d => d.rel === 'writing/随笔')!
  expect(sui.memberPaths).toEqual(['writing/随笔/a.md', 'writing/随笔/子/b.md'])
  const zi = dirs.find(d => d.rel === 'writing/随笔/子')!
  expect(zi.memberPaths).toEqual(['writing/随笔/子/b.md'])
})

it('groupSignature 基于 catalog 条目 mtime，未生成条目为 ?', () => {
  const catalog = { version: 2 as const, entries: { 'writing/a.md': { title: 'A', summary: 'A', mtimeMs: 5 } }, groups: {} }
  expect(groupSignature(catalog, ['writing/a.md'])).toBe('writing/a.md:5')
  expect(groupSignature(catalog, ['writing/b.md'])).toBe('writing/b.md:?')
})

it('updateGroupSummary / removeGroupSummary', () => {
  updateGroupSummary(lib, 'writing', 'writing/随笔', { summary: '随笔内容', signature: 'x' })
  expect(loadCatalog(lib, 'writing').groups['writing/随笔']).toEqual({ summary: '随笔内容', signature: 'x' })
  removeGroupSummary(lib, 'writing', 'writing/随笔')
  expect(loadCatalog(lib, 'writing').groups['writing/随笔']).toBeUndefined()
})

it('removeGroupSummary 递归清除含子分组的分组摘要', () => {
  updateGroupSummary(lib, 'writing', 'writing/随笔', { summary: 'S', signature: 's1' })
  updateGroupSummary(lib, 'writing', 'writing/随笔/子', { summary: 'Z', signature: 's2' })
  updateGroupSummary(lib, 'writing', 'writing/技术笔记', { summary: 'T', signature: 's3' })
  removeGroupSummary(lib, 'writing', 'writing/随笔')
  const c = loadCatalog(lib, 'writing')
  expect(c.groups['writing/随笔']).toBeUndefined()
  expect(c.groups['writing/随笔/子']).toBeUndefined()
  // 不相关分组不受影响
  expect(c.groups['writing/技术笔记']).toEqual({ summary: 'T', signature: 's3' })
})

it('migratePrefix 同时迁移 groups 前缀', () => {
  updateEntry(lib, 'writing', 'writing/随笔/a.md', { title: 'A', summary: 'A', mtimeMs: 1 })
  updateGroupSummary(lib, 'writing', 'writing/随笔', { summary: 'S', signature: 's1' })
  updateGroupSummary(lib, 'writing', 'writing/随笔/子', { summary: 'Z', signature: 's2' })
  migratePrefix(lib, 'writing', 'writing/随笔', 'writing/散文')
  const c = loadCatalog(lib, 'writing')
  expect(c.entries['writing/散文/a.md']).toBeDefined()
  expect(c.groups['writing/散文']).toEqual({ summary: 'S', signature: 's1' })
  expect(c.groups['writing/散文/子']).toEqual({ summary: 'Z', signature: 's2' })
  expect(c.groups['writing/随笔']).toBeUndefined()
})
