import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { saveArticle, listArticles, deleteArticle, findSavedByUrl, SCOUT_DIR } from '../electron/lib/scout/article-store'
import type { FetchedArticle } from '../electron/lib/scout/article-fetcher'

let root: string
beforeEach(() => { root = fs.mkdtempSync(path.join(os.tmpdir(), 'scout-test-')) })
afterEach(() => { fs.rmSync(root, { recursive: true, force: true }) })

function fetched(overrides: Partial<FetchedArticle> = {}): FetchedArticle {
  return {
    url: 'https://a.com/x', title: '测试文章', markdown: '# 测试文章\n\n正文',
    summary: '摘要', publishedAt: '2026-08-01T00:00:00.000Z', authors: ['作者'], tier: 1,
    ...overrides,
  }
}

describe('scout article-store', () => {
  it('saveArticle 写入 拾贝/文章/YYYY-MM/ 并带完整 frontmatter', () => {
    const r = saveArticle(root, fetched())
    expect(r.filePath).toContain(SCOUT_DIR)
    expect(r.filePath).toContain(path.join('文章', '2026-08'))
    const raw = fs.readFileSync(r.filePath, 'utf8')
    expect(raw).toContain('web-article')
    expect(raw).toContain('https://a.com/x')
    expect(raw).toContain('正文')
  })

  it('同 source_url 重复保存 → wasAlreadySaved，不产生新文件', () => {
    const a = saveArticle(root, fetched())
    const b = saveArticle(root, fetched())
    expect(b.wasAlreadySaved).toBe(true)
    expect(b.filePath).toBe(a.filePath)
  })

  it('同名不同 URL → 序号后缀', () => {
    const a = saveArticle(root, fetched())
    const b = saveArticle(root, fetched({ url: 'https://b.com/y' }))
    expect(b.wasAlreadySaved).toBe(false)
    expect(b.filePath).not.toBe(a.filePath)
    expect(fs.existsSync(a.filePath)).toBe(true)
    expect(fs.existsSync(b.filePath)).toBe(true)
  })

  it('listArticles 返回已存文章元数据；findSavedByUrl 命中', () => {
    saveArticle(root, fetched())
    const list = listArticles(root)
    expect(list).toHaveLength(1)
    expect(list[0].url).toBe('https://a.com/x')
    expect(list[0].title).toBe('测试文章')
    expect(findSavedByUrl(root).get('https://a.com/x')).toBe(list[0].filePath)
  })

  it('deleteArticle 删除文件并拒绝库外路径', () => {
    const r = saveArticle(root, fetched())
    expect(deleteArticle(root, r.filePath)).toEqual({ ok: true })
    expect(fs.existsSync(r.filePath)).toBe(false)
    expect(deleteArticle(root, 'C:/Windows/evil.md').ok).toBe(false)
  })

  it('listArticles 容错：损坏文件跳过不抛', () => {
    const dir = path.join(root, SCOUT_DIR, '文章', '2026-08')
    fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(path.join(dir, 'bad.md'), '---\n: broken yaml: [', 'utf8')
    expect(() => listArticles(root)).not.toThrow()
    expect(listArticles(root)).toHaveLength(0)
  })
})
