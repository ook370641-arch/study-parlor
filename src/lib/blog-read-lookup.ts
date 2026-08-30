import type { BlogCollectionEntry, AnthropicArticleMeta } from '@shared/index'

/** 由 filePath 反查已读标记所需的 sourceUrl/title：收藏夹优先，回退文章缓存。
 *  两处都查不到（文章不在缓存也不在收藏夹）返回 null，调用方跳过自动标记。 */
export function findReadTarget(
  filePath: string,
  sources: { entries: BlogCollectionEntry[]; articles: AnthropicArticleMeta[] }
): { sourceUrl: string; title: string; filePath: string } | null {
  const e = sources.entries.find(x => x.filePath === filePath)
  if (e) return { sourceUrl: e.sourceUrl, title: e.title, filePath }
  const a = sources.articles.find(x => x.isSaved && x.filePath === filePath)
  if (a) return { sourceUrl: a.url, title: a.title, filePath }
  return null
}
