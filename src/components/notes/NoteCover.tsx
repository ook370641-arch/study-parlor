import type { CSSProperties } from 'react'
import { useStore } from '@/store'
import type { NoteEntry } from '@shared/index'
import { NOTE_COVER_COLOR, noteCoverImageUrl } from '@/lib/note-cover'

/** 笔记封面：anthropic 优先博客封面图，其余来源（或未命中）来源色渐变。墙/列/picker 共用。 */
export function NoteCover({ entry, className, style }: { entry: NoteEntry; className?: string; style?: CSSProperties }) {
  const cache = useStore(s => s.anthropicBlogCache.articleMetaCache)
  const img = entry.meta.source === 'anthropic' ? noteCoverImageUrl(entry.meta.url, cache) : null
  if (img) {
    return <img src={img} alt="" loading="lazy" decoding="async" className={className} style={{ objectFit: 'cover', ...style }} />
  }
  const c = NOTE_COVER_COLOR[entry.meta.source]
  return (
    <div
      aria-hidden
      className={className}
      style={{ background: `linear-gradient(135deg, ${c}59, ${c}26 55%, #1a120d)`, ...style }}
    />
  )
}
