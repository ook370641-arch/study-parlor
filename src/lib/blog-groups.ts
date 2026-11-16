import type {
  AnthropicArticleMeta,
  BlogCollectionEntry,
  BlogCollectionFile,
  BlogMineGroup,
  BlogOrder,
  BlogOrderChange,
  BlogReadEntry,
  BlogReorderRequest,
} from '@shared/index'

export const DEFAULT_BLOG_GROUP_ORDER = ['saved', 'read', 'favorite'] as const

function strings(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string' && item.length > 0)
    : []
}

function orderedUrls(
  preferred: unknown,
  members: string[],
  group: BlogMineGroup,
  change?: BlogOrderChange
): string[] {
  const memberSet = new Set(members)
  const seen = new Set<string>()
  const result: string[] = []
  for (const url of [...strings(preferred), ...members]) {
    if (!memberSet.has(url) || seen.has(url)) continue
    seen.add(url)
    result.push(url)
  }
  if (change?.to === group && memberSet.has(change.sourceUrl)) {
    const current = result.indexOf(change.sourceUrl)
    if (current >= 0) result.splice(current, 1)
    if (change.position === 'append') result.push(change.sourceUrl)
    else result.unshift(change.sourceUrl)
  }
  return result
}

function orderedGroups(value: unknown): BlogMineGroup[] {
  const requested = strings(value)
  const result: BlogMineGroup[] = []
  for (const group of [...requested, ...DEFAULT_BLOG_GROUP_ORDER]) {
    if ((DEFAULT_BLOG_GROUP_ORDER as readonly string[]).includes(group) && !result.includes(group as BlogMineGroup)) {
      result.push(group as BlogMineGroup)
    }
  }
  return result
}

export function reconcileBlogOrder(
  collection: BlogCollectionFile,
  articles: AnthropicArticleMeta[],
  change?: BlogOrderChange
): BlogOrder {
  const favoriteEntries = [...(collection.entries ?? [])].sort(
    (a, b) => Number(a.origin === 'recommend') - Number(b.origin === 'recommend')
  )
  const favorite = favoriteEntries.map(entry => entry.sourceUrl)
  const read = (collection.read ?? []).map(entry => entry.sourceUrl)
  const marked = new Set([...favorite, ...read])
  const saved = articles
    .filter(article => article.isSaved && article.filePath && !marked.has(article.url))
    .sort((a, b) => (b.publishedAt ?? '').localeCompare(a.publishedAt ?? ''))
    .map(article => article.url)

  return {
    groups: orderedGroups(collection.order?.groups),
    saved: orderedUrls(collection.order?.saved, saved, 'saved', change),
    read: orderedUrls(collection.order?.read, read, 'read', change),
    favorite: orderedUrls(collection.order?.favorite, favorite, 'favorite', change),
  }
}

function fallbackMeta(url: string, entry: BlogCollectionEntry | BlogReadEntry): AnthropicArticleMeta {
  return {
    url,
    title: entry.title,
    summary: null,
    publishedAt: null,
    imageUrl: null,
    isSaved: true,
    filePath: entry.filePath,
  }
}

function migratedAnthropicSlug(url: string): string | null {
  try {
    const parsed = new URL(url)
    if (parsed.hostname !== 'www.anthropic.com' && parsed.hostname !== 'anthropic.com') return null
    const match = parsed.pathname.match(/^\/(?:engineering|research)\/([^/]+)\/?$/i)
    return match?.[1]?.toLowerCase() ?? null
  } catch {
    return null
  }
}

export function deriveBlogMineGroups(
  articles: AnthropicArticleMeta[],
  collection: BlogCollectionFile
): Record<BlogMineGroup, AnthropicArticleMeta[]> {
  const order = reconcileBlogOrder(collection, articles)
  const cached = new Map(articles.map(article => [article.url, article]))
  const favorites = new Map(collection.entries.map(entry => [entry.sourceUrl, entry]))
  const reads = new Map(collection.read.map(entry => [entry.sourceUrl, entry]))
  const withFallback = (url: string, entry: BlogCollectionEntry | BlogReadEntry) => {
    const slug = migratedAnthropicSlug(url)
    const article = cached.get(url) ?? (slug
      ? articles.find(candidate => migratedAnthropicSlug(candidate.url) === slug)
      : undefined)
    return article
      ? { ...article, url, isSaved: true, filePath: article.filePath ?? entry.filePath }
      : fallbackMeta(url, entry)
  }

  return {
    saved: order.saved.map(url => cached.get(url)!),
    read: order.read.map(url => withFallback(url, reads.get(url)!)),
    favorite: order.favorite.map(url => withFallback(url, favorites.get(url)!)),
  }
}

export function reorderBlog(order: BlogOrder, request: BlogReorderRequest): BlogOrder {
  if (request.kind === 'group') {
    if (request.source === request.target || !order.groups.includes(request.source)) return order
    const groups = order.groups.filter(group => group !== request.source)
    const target = groups.indexOf(request.target)
    if (target < 0) return order
    groups.splice(target + (request.placement === 'after' ? 1 : 0), 0, request.source)
    return { ...order, groups }
  }
  if (request.sourceUrl === request.targetUrl || !order[request.group].includes(request.sourceUrl)) return order
  const next = order[request.group].filter(url => url !== request.sourceUrl)
  const target = next.indexOf(request.targetUrl)
  if (target < 0) return order
  next.splice(target + (request.placement === 'after' ? 1 : 0), 0, request.sourceUrl)
  return { ...order, [request.group]: next }
}
