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

import { vi, afterEach as ae } from 'vitest'

vi.mock('../electron/lib/kimi', () => ({ chatNonStream: vi.fn() }))
vi.mock('../electron/lib/search', () => ({ searchWeb: vi.fn() }))
vi.mock('../electron/lib/credentials', () => ({ getSearchApiKey: vi.fn() }))

import { chatNonStream } from '../electron/lib/kimi'
import { searchWeb } from '../electron/lib/search'
import { getSearchApiKey } from '../electron/lib/credentials'
import { runBlogRecommend } from '../electron/lib/blog-recommend'
import type { AppConfig } from '../electron/env'

const cfg: AppConfig = { get libraryPath() { return dir }, apiKey: 'k', baseUrl: 'u', model: 'm' }

function seedWriting() {
  write(path.join(dir, 'writing', '.catalog.json'), JSON.stringify({
    version: 2,
    entries: { 'a.md': { title: 'A', summary: '摘要A', mtimeMs: 300 } },
    groups: {},
  }))
  write(path.join(dir, 'writing', 'a.md'), '---\ntitle: A\n---\n正文')
}
function seedPool() {
  write(path.join(dir, 'Anthropic博客', '2026-08', 'x.md'),
    '---\ntype: anthropic-article\nsource_url: https://anthropic.com/a\nsummary: s\nimported_at: 2026-08-01\n---\nbody')
}

ae(() => { vi.clearAllMocks() })

describe('runBlogRecommend', () => {
  it('无写作上下文抛 NO_WRITING_CONTEXT', async () => {
    await expect(runBlogRecommend(cfg, {})).rejects.toMatchObject({ code: 'NO_WRITING_CONTEXT' })
  })
  it('有上下文但无本地文章抛 NO_LOCAL_ARTICLES', async () => {
    seedWriting()
    ;(chatNonStream as any).mockResolvedValue(JSON.stringify({ profile: 'p', gaps: ['g'], queries: ['q'] }))
    ;(getSearchApiKey as any).mockResolvedValue(null)
    await expect(runBlogRecommend(cfg, {})).rejects.toMatchObject({ code: 'NO_LOCAL_ARTICLES' })
  })
  it('完整链路返回 batch 与 picks，且校验非法 source_url', async () => {
    seedWriting()
    seedPool()
    ;(getSearchApiKey as any).mockResolvedValue(null)  // 降级 searchUsed=false
    ;(chatNonStream as any)
      .mockResolvedValueOnce(JSON.stringify({ profile: 'p', gaps: ['g'], queries: ['q'] }))
      .mockResolvedValueOnce(JSON.stringify([{ source_url: 'https://anthropic.com/a', reason: 'r', gap: 'g' }, { source_url: 'https://nope.com', reason: 'x', gap: 'g' }]))
    const r = await runBlogRecommend(cfg, {})
    expect(r.batch.profile).toBe('p')
    expect(r.batch.searchUsed).toBe(false)
    expect(r.picks).toHaveLength(1)
    expect(r.picks[0].sourceUrl).toBe('https://anthropic.com/a')
  })
  it('Tavily 可用时聚合搜索命中且 searchUsed=true', async () => {
    seedWriting(); seedPool()
    ;(getSearchApiKey as any).mockResolvedValue('key')
    ;(searchWeb as any).mockResolvedValue([{ title: 'T', url: 'https://anthropic.com/t', content: 'c'.repeat(10) }])
    ;(chatNonStream as any)
      .mockResolvedValueOnce(JSON.stringify({ profile: 'p', gaps: ['g'], queries: ['q1'] }))
      .mockResolvedValueOnce(JSON.stringify([{ source_url: 'https://anthropic.com/a', reason: 'r', gap: 'g' }]))
    const r = await runBlogRecommend(cfg, {})
    expect(r.batch.searchUsed).toBe(true)
    expect(searchWeb).toHaveBeenCalled()
  })
  it('dismissed 的 URL 不出现在候选池', async () => {
    seedWriting(); seedPool()
    write(path.join(dir, 'Anthropic博客', '.collection.json'), JSON.stringify({ version: 1, entries: [], dismissed: ['https://anthropic.com/a'], history: [] }))
    ;(getSearchApiKey as any).mockResolvedValue(null)
    ;(chatNonStream as any)
      .mockResolvedValueOnce(JSON.stringify({ profile: 'p', gaps: ['g'], queries: ['q'] }))
    await expect(runBlogRecommend(cfg, {})).rejects.toMatchObject({ code: 'NO_LOCAL_ARTICLES' })
  })
})
