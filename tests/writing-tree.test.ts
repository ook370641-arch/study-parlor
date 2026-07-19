import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {
  scanRoot,
  createFile,
  createFolder,
  renameNode,
  moveNode,
  deleteNode,
  readWritingFile,
  writeWritingFile,
  ensureRoots,
} from '../electron/lib/writing-tree'

let lib: string
beforeEach(() => { lib = fs.mkdtempSync(path.join(os.tmpdir(), 'wlib-')) })
afterEach(() => { fs.rmSync(lib, { recursive: true, force: true }) })

describe('scanRoot', () => {
  it('扫描嵌套树，隐藏伴生文件', () => {
    fs.mkdirSync(path.join(lib, 'writing/随笔'), { recursive: true })
    fs.writeFileSync(path.join(lib, 'writing/随笔/a.md'), '# a')
    fs.writeFileSync(path.join(lib, 'writing/随笔/a.assistant.md'), 'x')
    fs.writeFileSync(path.join(lib, 'writing/.catalog.json'), '{}')
    const tree = scanRoot(lib, 'writing')
    expect(tree).toHaveLength(1)
    expect(tree[0].children!.map(c => c.name)).toEqual(['a.md'])
  })

  it('空目录返回空数组', () => {
    fs.mkdirSync(path.join(lib, 'writing'), { recursive: true })
    const tree = scanRoot(lib, 'writing')
    expect(tree).toEqual([])
  })

  it('目录不存在返回空数组', () => {
    const tree = scanRoot(lib, 'writing')
    expect(tree).toEqual([])
  })

  it('忽略非 md 文件', () => {
    fs.mkdirSync(path.join(lib, 'writing'), { recursive: true })
    fs.writeFileSync(path.join(lib, 'writing/a.md'), '# a')
    fs.writeFileSync(path.join(lib, 'writing/b.txt'), 'b')
    fs.writeFileSync(path.join(lib, 'writing/c.png'), '')
    const tree = scanRoot(lib, 'writing')
    expect(tree).toHaveLength(1)
    expect(tree[0].name).toBe('a.md')
  })

  it('隐藏 .assistant.md / .annotations.md / .guide.md 伴生文件', () => {
    fs.mkdirSync(path.join(lib, 'writing'), { recursive: true })
    fs.writeFileSync(path.join(lib, 'writing/doc.md'), '# doc')
    fs.writeFileSync(path.join(lib, 'writing/doc.assistant.md'), 'x')
    fs.writeFileSync(path.join(lib, 'writing/doc.annotations.md'), 'x')
    fs.writeFileSync(path.join(lib, 'writing/doc.guide.md'), 'x')
    const tree = scanRoot(lib, 'writing')
    expect(tree).toHaveLength(1)
    expect(tree[0].name).toBe('doc.md')
  })

  it('隐藏 .catalog.json 和 .assets 目录', () => {
    fs.mkdirSync(path.join(lib, 'writing/.assets'), { recursive: true })
    fs.writeFileSync(path.join(lib, 'writing/.catalog.json'), '{}')
    fs.writeFileSync(path.join(lib, 'writing/main.md'), '# main')
    const tree = scanRoot(lib, 'writing')
    expect(tree).toHaveLength(1)
    expect(tree[0].name).toBe('main.md')
  })

  it('目录在前，文件在后，按名称排序', () => {
    fs.mkdirSync(path.join(lib, 'writing/随笔'), { recursive: true })
    fs.mkdirSync(path.join(lib, 'writing/日记'), { recursive: true })
    fs.writeFileSync(path.join(lib, 'writing/a.md'), '# a')
    fs.writeFileSync(path.join(lib, 'writing/b.md'), '# b')
    const tree = scanRoot(lib, 'writing')
    expect(tree.map(n => n.name)).toEqual(['日记', '随笔', 'a.md', 'b.md'])
  })
})

describe('assertInsideRoots / 越界保护', () => {
  it('createFile 拒绝 .. 路径', () => {
    expect(() => createFile(lib, 'writing', '../../etc', 'x.md')).toThrowError(/WRITING_PATH_FORBIDDEN/)
  })

  it('createFolder 拒绝 .. 路径', () => {
    expect(() => createFolder(lib, 'writing', '../../etc', 'x')).toThrowError(/WRITING_PATH_FORBIDDEN/)
  })

  it('renameNode 拒绝 .. 路径', () => {
    fs.mkdirSync(path.join(lib, 'writing'), { recursive: true })
    fs.writeFileSync(path.join(lib, 'writing/a.md'), '# a')
    expect(() => renameNode(lib, 'writing/a.md', '../escape.md')).toThrowError(/WRITING_PATH_FORBIDDEN/)
  })

  it('moveNode 拒绝 .. 路径', () => {
    fs.mkdirSync(path.join(lib, 'writing'), { recursive: true })
    fs.writeFileSync(path.join(lib, 'writing/a.md'), '# a')
    expect(() => moveNode(lib, 'writing/a.md', '../../etc')).toThrowError(/WRITING_PATH_FORBIDDEN/)
  })
})

describe('createFile', () => {
  it('创建文件并写入 type: writing frontmatter', () => {
    const p = createFile(lib, 'writing', '', 'test.md')
    expect(p).toBe('writing/test.md')
    const content = fs.readFileSync(path.join(lib, 'writing/test.md'), 'utf-8')
    expect(content).toContain('type: writing')
  })

  it('重名自动加 -HHMM 后缀', () => {
    fs.mkdirSync(path.join(lib, 'writing'), { recursive: true })
    fs.writeFileSync(path.join(lib, 'writing/a.md'), '1')
    const p = createFile(lib, 'writing', '', 'a.md')
    expect(p).toMatch(/writing\/a-\d{4}\.md$/)
    expect(fs.existsSync(path.join(lib, 'writing/a.md'))).toBe(true)
    expect(fs.existsSync(path.join(lib, p))).toBe(true)
  })

  it('自动创建中间目录', () => {
    const p = createFile(lib, 'writing', 'deep/nested', 'note.md')
    expect(p).toBe('writing/deep/nested/note.md')
    expect(fs.existsSync(path.join(lib, 'writing/deep/nested/note.md'))).toBe(true)
  })
})

describe('createFolder', () => {
  it('创建目录', () => {
    const p = createFolder(lib, 'writing', '', '随笔')
    expect(p).toBe('writing/随笔')
    expect(fs.statSync(path.join(lib, 'writing/随笔')).isDirectory()).toBe(true)
  })

  it('创建嵌套目录', () => {
    const p = createFolder(lib, 'repository', 'projects', 'sub')
    expect(p).toBe('repository/projects/sub')
    expect(fs.statSync(path.join(lib, 'repository/projects/sub')).isDirectory()).toBe(true)
  })
})

describe('renameNode', () => {
  it('重命名文件', () => {
    fs.mkdirSync(path.join(lib, 'writing'), { recursive: true })
    fs.writeFileSync(path.join(lib, 'writing/old.md'), '# old')
    const np = renameNode(lib, 'writing/old.md', 'new.md')
    expect(np).toBe('writing/new.md')
    expect(fs.existsSync(path.join(lib, 'writing/old.md'))).toBe(false)
    expect(fs.existsSync(path.join(lib, 'writing/new.md'))).toBe(true)
  })

  it('重命名目录', () => {
    fs.mkdirSync(path.join(lib, 'writing/old-dir'), { recursive: true })
    const np = renameNode(lib, 'writing/old-dir', 'new-dir')
    expect(np).toBe('writing/new-dir')
    expect(fs.statSync(path.join(lib, 'writing/new-dir')).isDirectory()).toBe(true)
  })

  it('目标已存在则抛 WRITING_NAME_CONFLICT', () => {
    fs.mkdirSync(path.join(lib, 'writing'), { recursive: true })
    fs.writeFileSync(path.join(lib, 'writing/a.md'), '# a')
    fs.writeFileSync(path.join(lib, 'writing/b.md'), '# b')
    expect(() => renameNode(lib, 'writing/a.md', 'b.md')).toThrowError(/WRITING_NAME_CONFLICT/)
  })

  it('源不存在则抛 WRITING_NOT_FOUND', () => {
    expect(() => renameNode(lib, 'writing/nope.md', 'x.md')).toThrowError(/WRITING_NOT_FOUND/)
  })
})

describe('moveNode', () => {
  it('移动文件到另一个目录', () => {
    fs.mkdirSync(path.join(lib, 'writing/A'), { recursive: true })
    fs.mkdirSync(path.join(lib, 'writing/B'), { recursive: true })
    fs.writeFileSync(path.join(lib, 'writing/A/f.md'), '# f')
    const np = moveNode(lib, 'writing/A/f.md', 'writing/B')
    expect(np).toBe('writing/B/f.md')
    expect(fs.existsSync(path.join(lib, 'writing/A/f.md'))).toBe(false)
    expect(fs.existsSync(path.join(lib, 'writing/B/f.md'))).toBe(true)
  })

  it('目标已有同名则自动加 -HHMM 后缀', () => {
    fs.mkdirSync(path.join(lib, 'writing/A'), { recursive: true })
    fs.mkdirSync(path.join(lib, 'writing/B'), { recursive: true })
    fs.writeFileSync(path.join(lib, 'writing/A/f.md'), '# f1')
    fs.writeFileSync(path.join(lib, 'writing/B/f.md'), '# f2')
    const np = moveNode(lib, 'writing/A/f.md', 'writing/B')
    expect(np).toMatch(/writing\/B\/f-\d{4}\.md$/)
  })

  it('不能移动到自身所在目录', () => {
    fs.mkdirSync(path.join(lib, 'writing/A'), { recursive: true })
    fs.writeFileSync(path.join(lib, 'writing/A/f.md'), '# f')
    expect(() => moveNode(lib, 'writing/A/f.md', 'writing/A')).toThrowError(/WRITING_PATH_FORBIDDEN/)
  })

  it('源不存在则抛 WRITING_NOT_FOUND', () => {
    expect(() => moveNode(lib, 'writing/ghost.md', 'writing')).toThrowError(/WRITING_NOT_FOUND/)
  })
})

describe('deleteNode', () => {
  it('删除文件', () => {
    fs.mkdirSync(path.join(lib, 'writing'), { recursive: true })
    fs.writeFileSync(path.join(lib, 'writing/x.md'), '# x')
    deleteNode(lib, 'writing/x.md')
    expect(fs.existsSync(path.join(lib, 'writing/x.md'))).toBe(false)
  })

  it('递归删除目录', () => {
    fs.mkdirSync(path.join(lib, 'writing/deep/nested'), { recursive: true })
    fs.writeFileSync(path.join(lib, 'writing/deep/f.md'), '# f')
    deleteNode(lib, 'writing/deep')
    expect(fs.existsSync(path.join(lib, 'writing/deep'))).toBe(false)
  })

  it('源不存在则抛 WRITING_NOT_FOUND', () => {
    expect(() => deleteNode(lib, 'writing/nope.md')).toThrowError(/WRITING_NOT_FOUND/)
  })
})

describe('readWritingFile / writeWritingFile', () => {
  it('write 合并 frontmatter 并更新 updated', () => {
    fs.mkdirSync(path.join(lib, 'writing'), { recursive: true })
    const p = createFile(lib, 'writing', '', 'b.md')
    writeWritingFile(lib, p, '# 正文\n')
    const { frontmatter, body } = readWritingFile(lib, p)
    expect(frontmatter.type).toBe('writing')
    expect(body).toBe('# 正文\n')
  })

  it('write 保留已有 frontmatter 字段', () => {
    fs.mkdirSync(path.join(lib, 'writing'), { recursive: true })
    const p = createFile(lib, 'writing', '', 'c.md')
    // First write adds some custom frontmatter
    writeWritingFile(lib, p, '# 第一版\n')
    // Second write should preserve type and update 'updated'
    writeWritingFile(lib, p, '# 第二版\n')
    const { frontmatter, body } = readWritingFile(lib, p)
    expect(frontmatter.type).toBe('writing')
    expect(body).toBe('# 第二版\n')
    // updated should be set to today's date
    expect(frontmatter.updated).toBeDefined()
    expect(frontmatter.updated).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  it('read 无 frontmatter 文件仍返回默认值', () => {
    fs.mkdirSync(path.join(lib, 'writing'), { recursive: true })
    fs.writeFileSync(path.join(lib, 'writing/plain.md'), '# plain')
    const { frontmatter, body } = readWritingFile(lib, 'writing/plain.md')
    expect(body).toBe('# plain')
    // gray-matter returns empty object when no frontmatter
    expect(frontmatter).toBeDefined()
  })
})

describe('ensureRoots', () => {
  it('创建 writing 和 repository 目录', () => {
    ensureRoots(lib)
    expect(fs.statSync(path.join(lib, 'writing')).isDirectory()).toBe(true)
    expect(fs.statSync(path.join(lib, 'repository')).isDirectory()).toBe(true)
  })

  it('幂等调用不报错', () => {
    ensureRoots(lib)
    ensureRoots(lib)
    expect(fs.statSync(path.join(lib, 'writing')).isDirectory()).toBe(true)
  })
})
