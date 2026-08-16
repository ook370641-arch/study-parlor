// tests/writing-created.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import matter from 'gray-matter'
import { createFile, writeWritingFile, renameNode, moveNode } from '../electron/lib/writing-tree'

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
