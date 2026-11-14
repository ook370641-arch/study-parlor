import { describe, expect, it } from 'vitest'
import { DEFAULT_BLOG_FILTER, selectBlogSource, selectBlogView } from '../src/lib/section-filter'

describe('blog view filter', () => {
  it('默认显示我的全部来源', () => {
    expect(DEFAULT_BLOG_FILTER).toEqual({ view: 'mine', source: 'all' })
  })

  it('我的视图也保留来源筛选', () => {
    expect(selectBlogSource({ view: 'mine', source: 'all' }, 'research'))
      .toEqual({ view: 'mine', source: 'research' })
  })

  it('切换我的或全部不清空来源', () => {
    expect(selectBlogView({ view: 'mine', source: 'engineering' }, 'all'))
      .toEqual({ view: 'all', source: 'engineering' })
    expect(selectBlogView({ view: 'all', source: 'engineering' }, 'mine'))
      .toEqual({ view: 'mine', source: 'engineering' })
  })

  it('来源切回全部不影响当前视图', () => {
    expect(selectBlogSource({ view: 'all', source: 'product' }, 'all'))
      .toEqual({ view: 'all', source: 'all' })
  })
})
