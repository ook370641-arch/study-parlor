import type { AnthropicSectionKey } from '@shared/index'

export type BlogView = 'mine' | 'all'
export type BlogSourceFilter = 'all' | AnthropicSectionKey
export type BlogViewFilter = { view: BlogView; source: BlogSourceFilter }

export const DEFAULT_BLOG_FILTER: BlogViewFilter = { view: 'mine', source: 'all' }

export function selectBlogView(filter: BlogViewFilter, view: BlogView): BlogViewFilter {
  return { ...filter, view }
}

export function selectBlogSource(filter: BlogViewFilter, source: BlogSourceFilter): BlogViewFilter {
  return { ...filter, source }
}
