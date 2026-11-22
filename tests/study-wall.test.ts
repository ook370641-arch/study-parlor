import { describe, expect, it } from 'vitest'
import type { Group, TopicMeta } from '@shared/index'
import {
  buildStudyWallGroups,
  filterStudyTopics,
  latestSession,
  mergePendingArchives,
  pendingSessionNumbers,
  recommendationExistsInLibrary,
  selectRecommendationGroups,
} from '@/lib/study-wall'

const topic: TopicMeta = {
  dirName: 'memory',
  title: '记忆',
  sessionCount: 1,
  sessions: [{
    sessionNumber: 1,
    date: '2026-11-18',
    hasReport: true,
    hasTranscript: true,
    hasReview: false,
    hasFable: false,
    fableCount: 0,
    hasDiagram: false,
    reportFile: '学习报告.md',
  }],
  last_studied: '2026-11-18',
  last_studied_days: 2,
  groupId: 'default',
}

const groups: Group[] = [
  { id: 'default', name: '默认', color: '#d97757' },
  { id: 'g2', name: '二', color: '#7c9cb5' },
  { id: 'g3', name: '三', color: '#6b8f71' },
]

describe('study wall models', () => {
  it('merges pending sessions idempotently and selects the latest session', () => {
    const pending = [{ dirName: 'memory', topic: '记忆', sessionNumber: 2, mode: 'progress' as const, date: '2026-11-20' }]
    const merged = mergePendingArchives([topic], pending)
    expect(merged[0].sessions).toHaveLength(2)
    expect(mergePendingArchives(merged, pending)[0].sessions).toHaveLength(2)
    expect(latestSession(merged[0])?.sessionNumber).toBe(2)
    expect([...pendingSessionNumbers(pending, 'memory')]).toEqual([2])
  })

  it('keeps every topic reachable and filters without pagination', () => {
    const topics = Array.from({ length: 12 }, (_, index) => ({ ...topic, dirName: `t${index}`, title: `主题 ${index}` }))
    expect(filterStudyTopics(topics, null, '')).toHaveLength(12)
    expect(filterStudyTopics(topics, null, '主题 11').map(item => item.dirName)).toEqual(['t11'])
  })

  it('caps recommendation groups without dropping topic cards', () => {
    const topics = groups.map(group => ({ ...topic, dirName: group.id, groupId: group.id }))
    expect(selectRecommendationGroups(groups, topics, null).map(group => group.id)).toEqual(['default', 'g2'])
    expect(selectRecommendationGroups(groups, topics, 'g3').map(group => group.id)).toEqual(['g3'])
    expect(filterStudyTopics(topics, null, '')).toHaveLength(3)
  })

  it('hides only recommendations already present in the library', () => {
    expect(recommendationExistsInLibrary(' 记忆 ', [topic])).toBe(true)
    expect(recommendationExistsInLibrary('陌生主题', [topic])).toBe(false)
  })

  it('places recommendations in their target groups without counting them as topics', () => {
    const result = buildStudyWallGroups(
      groups,
      [{ ...topic, groupId: 'g2' }],
      null,
      '',
      { topic: '随机', hook: '随机钩子' },
      { g2: { topic: '分组推荐', hook: '分组钩子' } },
    )

    expect(result.map(group => ({ id: group.group.id, recommendations: group.recommendations, count: group.topics.length }))).toEqual([
      { id: 'default', recommendations: ['wildcard'], count: 0 },
      { id: 'g2', recommendations: ['group'], count: 1 },
      { id: 'g3', recommendations: [], count: 0 },
    ])
  })

  it('targets wildcard and group recommendations to the active group', () => {
    const result = buildStudyWallGroups(groups, [{ ...topic, groupId: 'g3' }], 'g3', '', null, {})
    expect(result).toHaveLength(1)
    expect(result[0]).toMatchObject({ group: { id: 'g3' }, recommendations: ['wildcard', 'group'] })
  })

  it('keeps recommendations out when their topic already exists', () => {
    const result = buildStudyWallGroups(
      groups,
      [{ ...topic, title: '随机', groupId: 'default' }],
      null,
      '',
      { topic: '随机', hook: '随机钩子' },
      {},
    )
    expect(result[0].recommendations).not.toContain('wildcard')
  })
})
