import { describe, it, expect } from 'vitest'
import { noteCoverImageUrl } from '@/lib/note-cover'

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
