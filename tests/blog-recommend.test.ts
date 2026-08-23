import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { collectWritingContext, collectLocalArticles } from '../electron/lib/blog-recommend'

let dir: string
beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'blog-rec-')) })
afterEach(() => { fs.rmSync(dir, { recursive: true, force: true }) })

function write(p: string, content: string) {
  fs.mkdirSync(path.dirname(p), { recursive: true })
  fs.writeFileSync(p, content, 'utf8')
}

describe('collectWritingContext', () => {
  it('catalog 为空返回 count=0', () => {
    expect(collectWritingContext(dir).count).toBe(0)
  })
  it('读 writing 根 catalog 条目并读近期原文', () => {
    const cat = {
      version: 2,
      entries: {
        'writing/a.md': { title: 'A', summary: '摘要A', mtimeMs: 300 },
        'writing/b.md': { title: 'B', summary: '摘要B', mtimeMs: 200 },
      },
      groups: {},
    }
    write(path.join(dir, 'writing', '.catalog.json'), JSON.stringify(cat))
    write(path.join(dir, 'writing', 'a.md'), '---\ntitle: A\n---\n正文A 内容')
    const ctx = collectWritingContext(dir)
    expect(ctx.count).toBe(2)
    expect(ctx.summaries.map(s => s.title)).toEqual(['A', 'B'])
    expect(ctx.recentBodies.some(b => b.includes('正文A'))).toBe(true)
  })
  it('按 mtimeMs 倒序排列摘要（newest-first）', () => {
    const cat = {
      version: 2,
      entries: {
        'writing/old.md': { title: 'Old', summary: '旧', mtimeMs: 100 },
        'writing/new.md': { title: 'New', summary: '新', mtimeMs: 300 },
        'writing/mid.md': { title: 'Mid', summary: '中', mtimeMs: 200 },
      },
      groups: {},
    }
    write(path.join(dir, 'writing', '.catalog.json'), JSON.stringify(cat))
    const ctx = collectWritingContext(dir)
    expect(ctx.summaries.map(s => s.title)).toEqual(['New', 'Mid', 'Old'])
  })
})

describe('collectLocalArticles', () => {
  it('过滤非 anthropic-article / 无 source_url，跳过损坏文件', () => {
    write(path.join(dir, 'Anthropic博客', '2026-08', 'x.md'),
      '---\ntype: anthropic-article\nsource_url: https://anthropic.com/a\nsummary: s\nsection: research\nimported_at: 2026-08-01\n---\nbody')
    write(path.join(dir, 'Anthropic博客', '2026-08', 'y.md'),
      '---\ntype: note\nsource_url: https://anthropic.com/b\n---\nbody')  // type 不符，跳过
    write(path.join(dir, 'Anthropic博客', '2026-08', 'z.md'),
      '---\ntype: anthropic-article\n---\nbody')  // 无 source_url，跳过
    write(path.join(dir, 'Anthropic博客', '2026-08', 'broken.md'), '{broken')
    const list = collectLocalArticles(dir)
    expect(list).toHaveLength(1)
    expect(list[0].sourceUrl).toBe('https://anthropic.com/a')
    expect(list[0].section).toBe('research')
  })
})
