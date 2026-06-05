import { describe, it, expect } from 'vitest'
import { filterAndSortTopics } from '../src/lib/filter-topics'
import type { TopicMeta } from '@shared/index'

function makeTopic(title: string, dirName: string, lastStudied: string, sessionCount: number): TopicMeta {
  return {
    dirName,
    title,
    sessionCount,
    sessions: [],
    last_studied: lastStudied,
    last_studied_days: 0,
    groupId: 'default'
  }
}

describe('filterAndSortTopics', () => {
  const topics: TopicMeta[] = [
    makeTopic('React Hooks', 'react-hooks', '2026-06-05T10:00:00Z', 5),
    makeTopic('TypeScript 进阶', 'ts-advanced', '2026-06-04T10:00:00Z', 3),
    makeTopic('设计模式', 'design-patterns', '2026-06-01T10:00:00Z', 2),
    makeTopic('算法与数据结构', 'algorithms', '2026-06-03T10:00:00Z', 8),
  ]

  it('sorts by last_studied descending by default', () => {
    const result = filterAndSortTopics(topics, '')
    expect(result.map(t => t.title)).toEqual([
      'React Hooks',
      'TypeScript 进阶',
      '算法与数据结构',
      '设计模式'
    ])
  })

  it('filters by title (case insensitive)', () => {
    const result = filterAndSortTopics(topics, 'react')
    expect(result.map(t => t.title)).toEqual(['React Hooks'])
  })

  it('filters by partial match', () => {
    const result = filterAndSortTopics(topics, '模式')
    expect(result.map(t => t.title)).toEqual(['设计模式'])
  })

  it('returns empty array when no match', () => {
    const result = filterAndSortTopics(topics, '不存在的主题')
    expect(result).toEqual([])
  })

  it('returns all topics sorted when query is whitespace', () => {
    const result = filterAndSortTopics(topics, '  ')
    expect(result).toHaveLength(4)
    expect(result[0].title).toBe('React Hooks')
  })

  it('does not mutate the input array', () => {
    const originalOrder = topics.map(t => t.title)
    filterAndSortTopics(topics, '')
    expect(topics.map(t => t.title)).toEqual(originalOrder)
  })
})