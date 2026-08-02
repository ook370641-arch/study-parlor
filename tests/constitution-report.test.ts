import { describe, expect, it, vi, beforeEach } from 'vitest'

vi.mock('@/lib/ipc', () => ({
  ipc: {
    patchState: vi.fn(),
    getState: vi.fn(),
  },
}))

vi.mock('@/lib/paintings', () => ({
  manifest: [],
  pickRandom: vi.fn(() => null),
  preloadPaintings: vi.fn(),
}))

import {
  CONSTITUTION_ARTICLE_META,
  CONSTITUTION_ARTICLE_URL,
  withConstitutionEntry,
} from '@/lib/constitution-report'
import { useStore } from '@/store'
import type { AnthropicArticleMeta } from '@shared/index'

const webArticle: AnthropicArticleMeta = {
  url: 'https://www.anthropic.com/engineering/foo',
  title: 'Foo',
  summary: null,
  publishedAt: null,
  imageUrl: null,
}

describe('withConstitutionEntry', () => {
  it('prepends the constitution entry to an empty list', () => {
    const result = withConstitutionEntry([])
    expect(result).toHaveLength(1)
    expect(result[0]).toEqual(CONSTITUTION_ARTICLE_META)
  })

  it('prepends the constitution entry ahead of web articles', () => {
    const result = withConstitutionEntry([webArticle])
    expect(result.map((a) => a.url)).toEqual([CONSTITUTION_ARTICLE_URL, webArticle.url])
  })

  it('dedupes when the persisted cache already contains the entry', () => {
    const stale = { ...CONSTITUTION_ARTICLE_META, title: '旧标题' }
    const result = withConstitutionEntry([stale, webArticle])
    expect(result.filter((a) => a.url === CONSTITUTION_ARTICLE_URL)).toHaveLength(1)
    expect(result[0].title).toBe(CONSTITUTION_ARTICLE_META.title)
  })
})

describe('constitution report / article reader mutual exclusion', () => {
  beforeEach(() => {
    useStore.setState({
      constitutionReportOpen: false,
      anthropicReaderFilePath: null,
      anthropicReaderBody: null,
      anthropicReaderTitle: null,
    })
  })

  it('openConstitutionReport clears the article reader', () => {
    useStore.setState({
      anthropicReaderFilePath: '/lib/a.md',
      anthropicReaderBody: 'body',
      anthropicReaderTitle: 't',
    })
    useStore.getState().openConstitutionReport()
    const s = useStore.getState()
    expect(s.constitutionReportOpen).toBe(true)
    expect(s.anthropicReaderFilePath).toBeNull()
    expect(s.anthropicReaderBody).toBeNull()
    expect(s.anthropicReaderTitle).toBeNull()
  })

  it('openAnthropicReader closes the constitution report', async () => {
    useStore.setState({ constitutionReportOpen: true })
    await useStore.getState().openAnthropicReader('/lib/a.md')
    const s = useStore.getState()
    expect(s.constitutionReportOpen).toBe(false)
    expect(s.anthropicReaderFilePath).toBe('/lib/a.md')
  })
})
