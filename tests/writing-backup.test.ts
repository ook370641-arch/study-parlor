// tests/writing-backup.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import matter from 'gray-matter'
import { scanRoot, createFile, writeWritingFile, writeHtmlFile, renameNode, moveNode, deleteNode, dissolveGroup } from '../electron/lib/writing-tree'

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

describe('writing 按天备份：生命周期跟随', () => {
  it('重命名文章 → 备份跟随到新名字', () => {
    writeArticle('writing/a.md', '旧内容')
    writeWritingFile(lib, 'writing/a.md', '新内容')
    const newRel = renameNode(lib, 'writing/a.md', 'b.md')
    expect(fs.existsSync(backupOf('writing/a.md'))).toBe(false)
    expect(fs.existsSync(backupOf(newRel))).toBe(true)
  })

  it('writing 根内移动 → 备份跟随到镜像新路径', () => {
    writeArticle('writing/a.md', '旧内容')
    writeWritingFile(lib, 'writing/a.md', '新内容')
    moveNode(lib, 'writing/a.md', 'writing/组A')
    expect(fs.existsSync(backupOf('writing/a.md'))).toBe(false)
    expect(fs.existsSync(path.join(lib, 'writing/.backups/组A/a.md'))).toBe(true)
  })

  it('移动到 repository/ → 备份删除', () => {
    writeArticle('writing/a.md', '旧内容')
    writeWritingFile(lib, 'writing/a.md', '新内容')
    moveNode(lib, 'writing/a.md', 'repository')
    expect(fs.existsSync(backupOf('writing/a.md'))).toBe(false)
    expect(fs.existsSync(path.join(lib, 'repository/.backups'))).toBe(false)
  })

  it('删除文章 → 备份一并删除', () => {
    writeArticle('writing/a.md', '旧内容')
    writeWritingFile(lib, 'writing/a.md', '新内容')
    deleteNode(lib, 'writing/a.md')
    expect(fs.existsSync(backupOf('writing/a.md'))).toBe(false)
  })

  it('重命名分组 → 镜像备份目录整体跟随', () => {
    writeArticle('writing/组A/a.md', '旧内容')
    writeWritingFile(lib, 'writing/组A/a.md', '新内容')
    renameNode(lib, 'writing/组A', '组B')
    expect(fs.existsSync(path.join(lib, 'writing/.backups/组B/a.md'))).toBe(true)
    expect(fs.existsSync(path.join(lib, 'writing/.backups/组A'))).toBe(false)
  })

  it('解散分组 → 文章备份随文章释放到父级，镜像空目录清理', () => {
    writeArticle('writing/组A/a.md', '旧内容')
    writeWritingFile(lib, 'writing/组A/a.md', '新内容')
    dissolveGroup(lib, 'writing/组A')
    expect(fs.existsSync(backupOf('writing/a.md'))).toBe(true)
    expect(fs.existsSync(path.join(lib, 'writing/.backups/组A'))).toBe(false)
  })
})

describe('writeHtmlFile：HTML 原文写回（删除模式）', () => {
  const HTML_V1 = '<!DOCTYPE html><html><head><meta charset="utf-8"></head><body><p>旧段落</p></body></html>'
  const HTML_V2 = '<!DOCTYPE html><html><head><meta charset="utf-8"></head><body></body></html>'

  it('原文写回，不经 gray-matter（内容逐字节相等）', () => {
    writeArticle('writing/报告.html', HTML_V1)
    writeHtmlFile(lib, 'writing/报告.html', HTML_V2)
    expect(fs.readFileSync(path.join(lib, 'writing/报告.html'), 'utf-8')).toBe(HTML_V2)
  })

  it('写回前生成当日按天备份，内容 = 修改前版本', () => {
    writeArticle('writing/报告.html', HTML_V1)
    writeHtmlFile(lib, 'writing/报告.html', HTML_V2)
    expect(readBackup('writing/报告.html')).toBe(HTML_V1)
  })

  it('repository/ 根下写回不产生备份', () => {
    writeArticle('repository/报告.html', HTML_V1)
    writeHtmlFile(lib, 'repository/报告.html', HTML_V2)
    expect(fs.existsSync(path.join(lib, 'writing/.backups'))).toBe(false)
    expect(fs.readFileSync(path.join(lib, 'repository/报告.html'), 'utf-8')).toBe(HTML_V2)
  })

  it('拒绝非 .html 扩展名（WRITING_PATH_FORBIDDEN）', () => {
    writeArticle('writing/a.md', 'x')
    expect(() => writeHtmlFile(lib, 'writing/a.md', HTML_V2)).toThrowError(/仅支持写回/)
  })

  it('拒绝根外路径', () => {
    expect(() => writeHtmlFile(lib, '../outside.html', HTML_V2)).toThrow()
  })
})
