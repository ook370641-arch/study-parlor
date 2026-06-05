import { describe, it, expect } from 'vitest'
import type { TopicContinueCache, TopicMeta } from '../src/types/index'

function isCacheValid(
  cache: TopicContinueCache | undefined,
  topicMeta: TopicMeta | undefined
): boolean {
  if (!cache || cache.suggestions.length === 0) return false
  if (cache.sessionCount === undefined) return false
  if (!topicMeta) return false
  return cache.sessionCount === topicMeta.sessionCount
}

describe('continue suggestion cache validation', () => {
  it('returns true when sessionCount matches', () => {
    const cache: TopicContinueCache = {
      generatedAt: '2026-06-01T00:00:00Z',
      sessionCount: 3,
      suggestions: [{ title: 'T', context: 'C', rationale: 'R', benefit: 'B' }]
    }
    const meta: TopicMeta = {
      dirName: 'test',
      title: 'Test',
      sessionCount: 3,
      sessions: [],
      last_studied: '',
      last_studied_days: 0,
      groupId: 'default'
    }
    expect(isCacheValid(cache, meta)).toBe(true)
  })

  it('returns false when sessionCount differs', () => {
    const cache: TopicContinueCache = {
      generatedAt: '2026-06-01T00:00:00Z',
      sessionCount: 2,
      suggestions: [{ title: 'T', context: 'C', rationale: 'R', benefit: 'B' }]
    }
    const meta: TopicMeta = {
      dirName: 'test',
      title: 'Test',
      sessionCount: 3,
      sessions: [],
      last_studied: '',
      last_studied_days: 0,
      groupId: 'default'
    }
    expect(isCacheValid(cache, meta)).toBe(false)
  })

  it('returns false when cache lacks sessionCount (old format)', () => {
    const cache = {
      generatedAt: '2026-06-01T00:00:00Z',
      suggestions: [{ title: 'T', context: 'C', rationale: 'R', benefit: 'B' }]
    } as TopicContinueCache
    const meta: TopicMeta = {
      dirName: 'test',
      title: 'Test',
      sessionCount: 3,
      sessions: [],
      last_studied: '',
      last_studied_days: 0,
      groupId: 'default'
    }
    expect(isCacheValid(cache, meta)).toBe(false)
  })

  it('returns false when cache is empty', () => {
    const cache: TopicContinueCache = {
      generatedAt: '2026-06-01T00:00:00Z',
      sessionCount: 3,
      suggestions: []
    }
    const meta: TopicMeta = {
      dirName: 'test',
      title: 'Test',
      sessionCount: 3,
      sessions: [],
      last_studied: '',
      last_studied_days: 0,
      groupId: 'default'
    }
    expect(isCacheValid(cache, meta)).toBe(false)
  })
})
