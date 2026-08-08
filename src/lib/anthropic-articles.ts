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

/** 按 URL 合并（backfill 事件用）：incoming 中已存在的 URL 就地覆盖（补全占位 title/publishedAt），
 *  保留既有保存态（isSaved/filePath）；新 URL 置前。 */
export function mergeArticlesByUrl(
  cached: AnthropicArticleMeta[],
  incoming: AnthropicArticleMeta[]
): AnthropicArticleMeta[] {
  const existingUrls = new Set(cached.map((a) => a.url))
  const merged = [...cached]
  const fresh: AnthropicArticleMeta[] = []
  const seenFresh = new Set<string>()
  for (const a of incoming) {
    if (existingUrls.has(a.url)) {
      const i = merged.findIndex((m) => m.url === a.url)
      if (i >= 0) {
        merged[i] = { ...merged[i], ...a, isSaved: merged[i].isSaved ?? a.isSaved, filePath: merged[i].filePath ?? a.filePath }
      }
    } else if (!seenFresh.has(a.url)) {
      fresh.push(a)
      seenFresh.add(a.url)
    }
  }
  return [...fresh, ...merged]
}

/** 合并时间线排序：本地内置条目（宪法报告）始终在前，其余按 publishedAt 倒序（缺失排尾） */
export function sortArticlesByDateDesc(articles: AnthropicArticleMeta[]): AnthropicArticleMeta[] {
  const local = articles.filter((a) => a.local)
  const rest = articles.filter((a) => !a.local)
  rest.sort((a, b) => (b.publishedAt ?? '').localeCompare(a.publishedAt ?? ''))
  return [...local, ...rest]
}
