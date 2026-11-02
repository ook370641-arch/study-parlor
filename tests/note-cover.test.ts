import { describe, it, expect } from 'vitest'
import { noteCoverImage, noteCoverImageUrl } from '@/lib/note-cover'
import type { NoteEntry } from '@shared/index'

const cache = {
  'https://www.anthropic.com/engineering/foo': { imageUrl: 'https://cdn.example.com/foo.png' },
  'https://www.anthropic.com/engineering/bar/': { imageUrl: 'https://cdn.example.com/bar.png' },
  'https://www.anthropic.com/engineering/none': { imageUrl: null },
}

describe('noteCoverImageUrl', () => {
  it('精确命中返回 imageUrl', () => {
    expect(noteCoverImageUrl('https://www.anthropic.com/engineering/foo', cache)).toBe('https://cdn.example.com/foo.png')
  })
  it('trailing-slash 变体兜底命中', () => {
    expect(noteCoverImageUrl('https://www.anthropic.com/engineering/bar', cache)).toBe('https://cdn.example.com/bar.png')
  })
  it('imageUrl 为 null 或缓存未命中返回 null', () => {
    expect(noteCoverImageUrl('https://www.anthropic.com/engineering/none', cache)).toBe(null)
    expect(noteCoverImageUrl('https://example.com/x', cache)).toBe(null)
    expect(noteCoverImageUrl('https://x.com', undefined)).toBe(null)
  })
})

describe('noteCoverImage', () => {
  const entry: NoteEntry = {
    path: 'notes/a.md',
    meta: { title: 'A', url: 'https://www.anthropic.com/engineering/foo', source: 'anthropic', rating: 0, summary: '', highlight: '', collected_at: '2026-09-01' },
    coverUrl: 'data:image/svg+xml;base64,generated',
  }

  it('本地生成封面优先于 Anthropic 原图', () => {
    expect(noteCoverImage(entry, cache)).toBe(entry.coverUrl)
    expect(noteCoverImage({ ...entry, coverUrl: undefined }, cache)).toBe('https://cdn.example.com/foo.png')
    expect(noteCoverImage({ ...entry, coverUrl: undefined, meta: { ...entry.meta, source: 'web' } }, cache)).toBeNull()
  })
})
