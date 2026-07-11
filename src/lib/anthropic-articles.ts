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
