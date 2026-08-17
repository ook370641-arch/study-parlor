// tests/writing-backup.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import matter from 'gray-matter'
import { scanRoot, createFile, writeWritingFile } from '../electron/lib/writing-tree'

let lib: string
beforeEach(() => { lib = fs.mkdtempSync(path.join(os.tmpdir(), 'sp-backup-')) })
afterEach(() => { fs.rmSync(lib, { recursive: true, force: true }) })

function writeArticle(rel: string, body: string): void {
  const abs = path.join(lib, rel)
  fs.mkdirSync(path.dirname(abs), { recursive: true })
  fs.writeFileSync(abs, body, 'utf-8')
}

/** writing/组A/a.md → <lib>/writing/.backups/组A/a.md */
function backupOf(rel: string): string {
  return path.join(lib, 'writing', '.backups', rel.slice('writing/'.length))
}

function readBackup(rel: string): string {
  return fs.readFileSync(backupOf(rel), 'utf-8')
}

describe('writing 按天备份：写入时机', () => {
  it('今天第一次保存产生备份，内容 = 修改前的旧文件', () => {
    writeArticle('writing/a.md', '旧内容')
    writeWritingFile(lib, 'writing/a.md', '新内容')
    expect(fs.existsSync(backupOf('writing/a.md'))).toBe(true)
    expect(readBackup('writing/a.md')).toContain('旧内容')
    const current = fs.readFileSync(path.join(lib, 'writing/a.md'), 'utf-8')
    expect(matter(current).content).toContain('新内容')
  })

  it('嵌套分组的文章备份到镜像子目录', () => {
    writeArticle('writing/组A/a.md', '旧内容')
    writeWritingFile(lib, 'writing/组A/a.md', '新内容')
    expect(fs.existsSync(path.join(lib, 'writing/.backups/组A/a.md'))).toBe(true)
  })

  it('同天第二次保存不覆盖备份', () => {
    writeArticle('writing/a.md', '版本1')
    writeWritingFile(lib, 'writing/a.md', '版本2')
    writeWritingFile(lib, 'writing/a.md', '版本3')
    expect(readBackup('writing/a.md')).toContain('版本1')
  })

  it('备份 mtime 是昨天时再保存 → 备份更新为最新的修改前版本', () => {
    writeArticle('writing/a.md', '版本1')
    writeWritingFile(lib, 'writing/a.md', '版本2')
    const yesterday = new Date(Date.now() - 24 * 3600 * 1000)
    fs.utimesSync(backupOf('writing/a.md'), yesterday, yesterday)
    writeWritingFile(lib, 'writing/a.md', '版本3')
    expect(readBackup('writing/a.md')).toContain('版本2')
  })

  it('repository/ 根下的文章不产生备份', () => {
    writeArticle('repository/a.md', '旧内容')
    writeWritingFile(lib, 'repository/a.md', '新内容')
    expect(fs.existsSync(path.join(lib, 'writing/.backups'))).toBe(false)
    expect(fs.existsSync(path.join(lib, 'repository/.backups'))).toBe(false)
  })

  it('新建空壳首次编辑不备份，有内容后的下一次修改才备份', () => {
    const rel = createFile(lib, 'writing', '', '新文章')
    writeWritingFile(lib, rel, '正文 v1')
    expect(fs.existsSync(backupOf(rel))).toBe(false)
    writeWritingFile(lib, rel, '正文 v2')
    expect(fs.existsSync(backupOf(rel))).toBe(true)
    expect(readBackup(rel)).toContain('正文 v1')
  })

  it('scanRoot 不显示 .backups 目录', () => {
    fs.mkdirSync(path.join(lib, 'writing/.backups'), { recursive: true })
    fs.writeFileSync(path.join(lib, 'writing/.backups/a.md'), 'x', 'utf-8')
    fs.writeFileSync(path.join(lib, 'writing/a.md'), '# a', 'utf-8')
    const tree = scanRoot(lib, 'writing')
    expect(tree.map(n => n.name)).toEqual(['a.md'])
  })
})
