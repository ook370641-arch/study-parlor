import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { executeScoutTool, clearPrecheckCache, type ScoutToolDeps } from '../electron/lib/scout/tools'
import { buildScoutSystemPrompt } from '../electron/lib/scout/prompt'

let root: string
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'scout-tools-'))
  clearPrecheckCache()
})
afterEach(() => { fs.rmSync(root, { recursive: true, force: true }) })

const LONG_MD = '# 好文\n\n' + '内容。'.repeat(300)

function makeDeps(overrides: Partial<ScoutToolDeps> = {}): ScoutToolDeps {
  return {
    libraryPath: root,
    send: () => {},
    searchWeb: async () => [{ title: 'T', url: 'https://a.com/x', content: 'snippet' }],
    tavilyExtract: async () => LONG_MD,
    plainFetch: async () => LONG_MD,
    scraperFetch: async () => ({ markdown: LONG_MD, title: '好文', publishedAt: null, authors: [] }),
    ...overrides,
  }
}

describe('executeScoutTool', () => {
  it('web_search 返回格式化结果', async () => {
    const r = await executeScoutTool({ tool: 'web_search', query: 'q' }, makeDeps())
    expect(r).toContain('https://a.com/x')
  })

  it('propose_candidates 预检：可抓取的标 fetchable，失败的标 failReason', async () => {
    // 让 tier-1 (tavilyExtract) 和 tier-3 (scraperFetch) 都失败，
    // 仅 tier-2 (plainFetch) 按 URL 差异化返回，测试三级全失败路径
    const deps = makeDeps({
      tavilyExtract: async () => { throw Object.assign(new Error('no key'), { code: 'TAVILY_ERROR' }) },
      plainFetch: async (url) => url.includes('bad')
        ? Promise.reject(Object.assign(new Error('403'), { httpStatus: 403 }))
        : LONG_MD,
      scraperFetch: async (url) => url.includes('bad')
        ? Promise.reject(Object.assign(new Error('403'), { httpStatus: 403 }))
        : { markdown: LONG_MD, title: '好文', publishedAt: null, authors: [] },
    })
    const r = await executeScoutTool({
      tool: 'propose_candidates',
      candidates: [
        { title: '好', url: 'https://a.com/good', sourceName: 'a.com', reason: 'r' },
        { title: '坏', url: 'https://a.com/bad', sourceName: 'a.com', reason: 'r' },
      ],
    }, deps)
    const parsed = JSON.parse(r)
    expect(parsed.candidates[0].fetchable).toBe(true)
    expect(parsed.candidates[1].fetchable).toBe(false)
    expect(parsed.candidates[1].failReason).toBeTruthy()
  })

  it('propose_candidates 预检内容入缓存，fetch_and_save 消费缓存不再抓取', async () => {
    let fetchCount = 0
    // 让 tier-1 失败，这样 tier-2 (plainFetch) 才会被调用，fetchCount 才有意义
    const deps = makeDeps({
      tavilyExtract: async () => { throw Object.assign(new Error('no key'), { code: 'TAVILY_ERROR' }) },
      plainFetch: async () => { fetchCount++; return LONG_MD },
    })
    await executeScoutTool({
      tool: 'propose_candidates',
      candidates: [{ title: '好', url: 'https://a.com/good', sourceName: 'a.com', reason: 'r' }],
    }, deps)
    expect(fetchCount).toBe(1)
    const r = await executeScoutTool({ tool: 'fetch_and_save', urls: ['https://a.com/good'] }, deps)
    expect(fetchCount).toBe(1) // 缓存命中，未再抓
    expect(r).toContain('已入库')
    // 文件确实落盘 — 用 fs 直接验证，不调用 parseFrontmatter
    const saved = fs.readdirSync(path.join(root, '拾贝', '文章'), { recursive: true })
    expect(saved.length).toBeGreaterThan(0)
  })

  it('fetch_and_save 重复 URL → 提示已在库中', async () => {
    const deps = makeDeps()
    await executeScoutTool({ tool: 'fetch_and_save', urls: ['https://a.com/x'] }, deps)
    const r = await executeScoutTool({ tool: 'fetch_and_save', urls: ['https://a.com/x'] }, deps)
    expect(r).toContain('已在库中')
  })

  it('read_article 读已入库文章全文；未入库提示先抓取', async () => {
    const deps = makeDeps()
    await executeScoutTool({ tool: 'fetch_and_save', urls: ['https://a.com/x'] }, deps)
    const r = await executeScoutTool({ tool: 'read_article', url: 'https://a.com/x' }, deps)
    expect(r).toContain('内容。')
    const miss = await executeScoutTool({ tool: 'read_article', url: 'https://not-saved.com/' }, deps)
    expect(miss).toContain('尚未入库')
  })

  it('read_article 超长截断并注明', async () => {
    const huge = '# 长文\n\n' + '字'.repeat(30000)
    // 让 tier-1 返回 huge 内容，这样 saveArticle 存入的就是超长文章
    const deps = makeDeps({ tavilyExtract: async () => huge })
    await executeScoutTool({ tool: 'fetch_and_save', urls: ['https://a.com/x'] }, deps)
    const r = await executeScoutTool({ tool: 'read_article', url: 'https://a.com/x' }, deps)
    expect(r.length).toBeLessThan(huge.length)
    expect(r).toContain('截断')
  })
})

describe('buildScoutSystemPrompt', () => {
  it('包含四工具说明与候选确认规则与负面示例', () => {
    const p = buildScoutSystemPrompt()
    expect(p).toContain('web_search')
    expect(p).toContain('propose_candidates')
    expect(p).toContain('fetch_and_save')
    expect(p).toContain('read_article')
    expect(p).toContain('确认')
  })
})
