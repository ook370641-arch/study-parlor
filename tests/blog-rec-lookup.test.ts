import { describe, it, expect } from 'vitest'
import { findBatchForUrl } from '../src/lib/blog-rec-lookup'
import type { BlogRecommendBatch } from '../src/types'

const batch = (n: number, urls: string[]): BlogRecommendBatch => ({
  batch: n, generatedAt: 'g', profile: 'p', gaps: [], queries: [], searchUsed: false,
  picks: urls.map(u => ({ sourceUrl: u, title: u, filePath: 'f', reason: 'r', gap: 'g' })),
})

describe('findBatchForUrl', () => {
  it('命中返回批次号，多批命中取最新（history 最新在前）', () => {
    const h = [batch(3, ['a']), batch(1, ['a', 'b'])]
    expect(findBatchForUrl(h, 'a')).toBe(3)
    expect(findBatchForUrl(h, 'b')).toBe(1)
  })
  it('未命中或无 picks 的旧批次返回 null', () => {
    const old: BlogRecommendBatch = { batch: 0, generatedAt: 'g', profile: 'p', gaps: [], queries: [], searchUsed: false }
    expect(findBatchForUrl([old], 'a')).toBeNull()
    expect(findBatchForUrl([], 'a')).toBeNull()
  })
})
