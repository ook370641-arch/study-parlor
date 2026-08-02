import { describe, it, expect } from 'vitest'
import { fetchArticle, type FetchDeps } from '../electron/lib/scout/article-fetcher'

const LONG_MD = '# Title\n\n' + '正文内容。'.repeat(200) // >500 字

function deps(overrides: Partial<FetchDeps>): FetchDeps {
  return {
    tavilyExtract: async () => { throw Object.assign(new Error('no key'), { code: 'TAVILY_ERROR' }) },
    plainFetch: async () => { throw new Error('fetch failed') },
    scraperFetch: async () => { throw new Error('scraper disabled in test') },
    ...overrides,
  }
}

describe('fetchArticle 三级管线', () => {
  it('tier-1 tavily 成功直接返回，不调用后续', async () => {
    let tier2Called = false
    const r = await fetchArticle({
      url: 'https://a.com/x',
      deps: deps({
        tavilyExtract: async () => LONG_MD,
        plainFetch: async () => { tier2Called = true; return LONG_MD },
      }),
    })
    expect(r.tier).toBe(1)
    expect(r.markdown).toBe(LONG_MD)
    expect(tier2Called).toBe(false)
  })

  it('tier-1 失败回退 tier-2 裸 fetch', async () => {
    const r = await fetchArticle({
      url: 'https://blog.example/post',
      deps: deps({ plainFetch: async () => LONG_MD }),
    })
    expect(r.tier).toBe(2)
  })

  it('tier-1/2 均失败回退 tier-3 scraper 窗口', async () => {
    const r = await fetchArticle({
      url: 'https://spa.example/post',
      deps: deps({ scraperFetch: async () => ({ markdown: LONG_MD, title: 'SPA 标题', publishedAt: null, authors: [] }) }),
    })
    expect(r.tier).toBe(3)
    expect(r.title).toBe('SPA 标题')
  })

  it('三级全失败：403 → FETCH_BLOCKED', async () => {
    const err403 = () => { throw Object.assign(new Error('HTTP 403'), { httpStatus: 403 }) }
    await expect(fetchArticle({
      url: 'https://blocked.example/',
      deps: deps({ tavilyExtract: err403, plainFetch: err403, scraperFetch: err403 }),
    })).rejects.toMatchObject({ code: 'FETCH_BLOCKED' })
  })

  it('三级全失败：内容为空 → NO_CONTENT', async () => {
    await expect(fetchArticle({
      url: 'https://empty.example/',
      deps: deps({
        tavilyExtract: async () => '太短',
        plainFetch: async () => '也太短',
        scraperFetch: async () => ({ markdown: '', title: '', publishedAt: null, authors: [] }),
      }),
    })).rejects.toMatchObject({ code: 'NO_CONTENT' })
  })
})
