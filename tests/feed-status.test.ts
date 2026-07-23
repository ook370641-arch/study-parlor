import { describe, it, expect } from 'vitest'
import { classifyFeed, resolveFeedOutcome } from '../electron/lib/feed-status'

describe('classifyFeed', () => {
  const hasContent = (d: { items?: unknown[] }) => (d.items?.length ?? 0) > 0

  it('null（抓取失败）→ failed', () => {
    expect(classifyFeed(null, hasContent)).toBe('failed')
  })
  it('抓取成功但内容为空 → empty', () => {
    expect(classifyFeed({ items: [] }, hasContent)).toBe('empty')
  })
  it('有内容 → ok', () => {
    expect(classifyFeed({ items: [1] }, hasContent)).toBe('ok')
  })
})

describe('resolveFeedOutcome', () => {
  it('全部 failed → network-error', () => {
    expect(resolveFeedOutcome(['failed', 'failed', 'failed'])).toBe('network-error')
  })
  it('全部 empty → feed-empty', () => {
    expect(resolveFeedOutcome(['empty', 'empty', 'empty'])).toBe('feed-empty')
  })
  it('failed + empty 混合（无 ok）→ feed-empty', () => {
    expect(resolveFeedOutcome(['failed', 'empty', 'empty'])).toBe('feed-empty')
  })
  it('任一 ok → proceed', () => {
    expect(resolveFeedOutcome(['failed', 'ok', 'empty'])).toBe('proceed')
  })
})
