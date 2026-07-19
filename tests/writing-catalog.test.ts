import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { loadCatalog, updateEntry, removeEntry, diffPending, catalogPath } from '../electron/lib/writing-catalog'
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

it('diffPending 找出缺条目的文件', () => {
  const bPath = createFile(lib, 'writing', '', 'b.md')
  const cPath = createFile(lib, 'writing', '', 'c.md')
  updateEntry(lib, 'writing', bPath, { title: 'B', summary: 'B', updatedAt: '2026-07-20' })
  const pending = diffPending(lib, 'writing')
  expect(pending).toContain(cPath)
  expect(pending).not.toContain(bPath)
})

it('空 catalog 返回默认结构', () => {
  const c = loadCatalog(lib, 'writing')
  expect(c.version).toBe(1)
  expect(c.entries).toEqual({})
})
