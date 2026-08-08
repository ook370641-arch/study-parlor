import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createFile, createFolder, trashNode, dissolveGroup, scanRoot } from '../electron/lib/writing-tree'

let lib: string
beforeEach(() => {
  lib = fs.mkdtempSync(path.join(os.tmpdir(), 'wtrash-'))
  fs.mkdirSync(path.join(lib, 'writing'), { recursive: true })
})
afterEach(() => { fs.rmSync(lib, { recursive: true, force: true }) })

it('文件进 .trash 保留相对目录结构', () => {
  createFolder(lib, 'writing', '', '随笔')
  const rel = createFile(lib, 'writing', '随笔', 'a.md')
  const trashed = trashNode(lib, rel)
  expect(fs.existsSync(path.join(lib, rel))).toBe(false)
  expect(trashed).toBe(path.join('writing', '.trash', '随笔', 'a.md').replace(/\\/g, '/'))
  expect(fs.existsSync(path.join(lib, trashed))).toBe(true)
})

it('重名进 .trash 加 -HHMM 后缀不覆盖', () => {
  const a = createFile(lib, 'writing', '', 'a.md')
  trashNode(lib, a)
  const b = createFile(lib, 'writing', '', 'a.md')
  const t2 = trashNode(lib, b)
  expect(t2).not.toBe(path.join('writing', '.trash', 'a.md').replace(/\\/g, '/'))
  expect(fs.existsSync(path.join(lib, 'writing', '.trash', 'a.md'))).toBe(true)
  expect(fs.existsSync(path.join(lib, t2))).toBe(true)
})

it('解散分组:子项释放到父级,空壳进 .trash', () => {
  createFolder(lib, 'writing', '', '组A')
  const f1 = createFile(lib, 'writing', '组A', '一.md')
  const f2 = createFile(lib, 'writing', '组A', '二.md')
  const r = dissolveGroup(lib, 'writing/组A')
  expect(r.moved).toHaveLength(2)
  expect(fs.existsSync(path.join(lib, 'writing', '一.md'))).toBe(true)
  expect(fs.existsSync(path.join(lib, 'writing', '二.md'))).toBe(true)
  expect(fs.existsSync(path.join(lib, 'writing', '组A'))).toBe(false)
  expect(fs.existsSync(path.join(lib, r.trashed))).toBe(true)
  expect(f1).not.toBe(f2)
})

it('.trash 目录不出现在扫描树', () => {
  const rel = createFile(lib, 'writing', '', 'x.md')
  trashNode(lib, rel)
  const nodes = scanRoot(lib, 'writing')
  expect(nodes.some(n => n.name === '.trash')).toBe(false)
  expect(nodes).toHaveLength(0)
})
