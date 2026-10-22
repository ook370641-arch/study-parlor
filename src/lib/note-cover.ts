import type { NoteSource } from '@shared/index'

/** 封面来源色（与旧 NoteCard 的 SOURCE_COLOR 一致，anthropic 另有博客封面优先） */
export const NOTE_COVER_COLOR: Record<NoteSource, string> = {
  anthropic: '#d97757',
  web: '#7a9cc6',
  book: '#8fae8b',
  unknown: '#6b5d52',
}

/** 按笔记 url 查 articleMetaCache 的博客封面；失配试 trailing-slash 变体 */
export function noteCoverImageUrl(
  url: string,
  cache: Record<string, { imageUrl: string | null }> | undefined,
): string | null {
  if (!cache) return null
  const direct = cache[url]?.imageUrl
  if (direct) return direct
  const alt = url.endsWith('/') ? url.slice(0, -1) : url + '/'
  return cache[alt]?.imageUrl ?? null
}
