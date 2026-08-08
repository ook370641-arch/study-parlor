import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createFile, createFolder, deleteNode, dissolveGroup, scanRoot } from '../electron/lib/writing-tree'

let lib: string
beforeEach(() => {
  lib = fs.mkdtempSync(path.join(os.tmpdir(), 'wdel-'))
  fs.mkdirSync(path.join(lib, 'writing'), { recursive: true })
})
afterEach(() => { fs.rmSync(lib, { recursive: true, force: true }) })

it('文件删除 = 真删,磁盘不再存在', () => {
  createFolder(lib, 'writing', '', '随笔')
  const rel = createFile(lib, 'writing', '随笔', 'a.md')
  deleteNode(lib, rel)
  expect(fs.existsSync(path.join(lib, rel))).toBe(false)
})

it('删除不存在路径抛 WRITING_NOT_FOUND', () => {
  expect(() => deleteNode(lib, 'writing/没有.md')).toThrowError(/WRITING_NOT_FOUND/)
})

it('解散分组:子项释放到父级,空壳目录删除', () => {
  createFolder(lib, 'writing', '', '组A')
  createFile(lib, 'writing', '组A', '一.md')
  createFile(lib, 'writing', '组A', '二.md')
  const r = dissolveGroup(lib, 'writing/组A')
  expect(r.moved).toHaveLength(2)
  expect(fs.existsSync(path.join(lib, 'writing', '一.md'))).toBe(true)
  expect(fs.existsSync(path.join(lib, 'writing', '二.md'))).toBe(true)
  expect(fs.existsSync(path.join(lib, 'writing', '组A'))).toBe(false)
})

it('解散分组:伴生 .assistant.md 随文章随迁到父级', () => {
  createFolder(lib, 'writing', '', '组B')
  createFile(lib, 'writing', '组B', '文.md')
  fs.writeFileSync(path.join(lib, 'writing', '组B', '文.assistant.md'), '---\ntype: article-assistant\n---\n## 用户\nhi\n', 'utf-8')
  const r = dissolveGroup(lib, 'writing/组B')
  expect(r.moved).toHaveLength(2)
  expect(fs.existsSync(path.join(lib, 'writing', '文.md'))).toBe(true)
  expect(fs.existsSync(path.join(lib, 'writing', '文.assistant.md'))).toBe(true)
  expect(fs.existsSync(path.join(lib, 'writing', '组B'))).toBe(false)
})

it('遗留 .trash 目录不出现在扫描树(隐藏名单保留)', () => {
  fs.mkdirSync(path.join(lib, 'writing', '.trash'), { recursive: true })
  fs.writeFileSync(path.join(lib, 'writing', '.trash', '旧.md'), 'x', 'utf-8')
  createFile(lib, 'writing', '', 'x.md')
  const nodes = scanRoot(lib, 'writing')
  expect(nodes.some(n => n.name === '.trash')).toBe(false)
  expect(nodes).toHaveLength(1)
})
