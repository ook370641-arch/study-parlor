import type { AnthropicArticleMeta } from '@shared/index'

export function findNewArticleUrls(
  cached: AnthropicArticleMeta[],
  fetched: AnthropicArticleMeta[]
): string[] {
  const cachedUrls = new Set(cached.map((a) => a.url))
  return fetched.map((a) => a.url).filter((url) => !cachedUrls.has(url))
}

export function mergeNewArticles(
  cached: AnthropicArticleMeta[],
  newArticles: AnthropicArticleMeta[]
): AnthropicArticleMeta[] {
  const existingUrls = new Set(cached.map((a) => a.url))
  return [...newArticles.filter((a) => !existingUrls.has(a.url)), ...cached]
}

/** 合并时间线排序：本地内置条目（宪法报告）始终在前，其余按 publishedAt 倒序（缺失排尾） */
export function sortArticlesByDateDesc(articles: AnthropicArticleMeta[]): AnthropicArticleMeta[] {
  const local = articles.filter((a) => a.local)
  const rest = articles.filter((a) => !a.local)
  rest.sort((a, b) => (b.publishedAt ?? '').localeCompare(a.publishedAt ?? ''))
  return [...local, ...rest]
}
