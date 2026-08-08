import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { loadCatalog, updateEntry, removeEntry, diffStale, catalogPath } from '../electron/lib/writing-catalog'
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
