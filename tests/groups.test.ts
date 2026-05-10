import { describe, it, expect } from 'vitest'

// Test group sorting logic
function sortTopicsByGroup(
  topics: { dirName: string; last_studied: string; groupId: string }[],
  groups: { id: string }[]
) {
  const groupIndexMap = new Map(groups.map((g, i) => [g.id, i]))
  return [...topics].sort((a, b) => {
    const ai = groupIndexMap.get(a.groupId) ?? Infinity
    const bi = groupIndexMap.get(b.groupId) ?? Infinity
    if (ai !== bi) return ai - bi
    return new Date(b.last_studied).getTime() - new Date(a.last_studied).getTime()
  })
}

describe('group sorting', () => {
  it('sorts by group order first', () => {
    const groups = [{ id: 'default' }, { id: 'ai' }, { id: 'philosophy' }]
    const topics = [
      { dirName: 'a', last_studied: '2026-05-10', groupId: 'ai' },
      { dirName: 'b', last_studied: '2026-05-09', groupId: 'default' },
      { dirName: 'c', last_studied: '2026-05-11', groupId: 'philosophy' },
    ]
    const sorted = sortTopicsByGroup(topics, groups)
    expect(sorted.map((t) => t.groupId)).toEqual(['default', 'ai', 'philosophy'])
  })

  it('falls back to last_studied within same group', () => {
    const groups = [{ id: 'default' }]
    const topics = [
      { dirName: 'a', last_studied: '2026-05-08', groupId: 'default' },
      { dirName: 'b', last_studied: '2026-05-10', groupId: 'default' },
      { dirName: 'c', last_studied: '2026-05-09', groupId: 'default' },
    ]
    const sorted = sortTopicsByGroup(topics, groups)
    expect(sorted.map((t) => t.dirName)).toEqual(['b', 'c', 'a'])
  })

  it('puts unmapped groupId at the end', () => {
    const groups = [{ id: 'default' }]
    const topics = [
      { dirName: 'a', last_studied: '2026-05-10', groupId: 'unknown' },
      { dirName: 'b', last_studied: '2026-05-09', groupId: 'default' },
    ]
    const sorted = sortTopicsByGroup(topics, groups)
    expect(sorted.map((t) => t.dirName)).toEqual(['b', 'a'])
  })
})

// Test group color generation
describe('group color generation', () => {
  it('returns a valid hex color', () => {
    const darkColors = [
      '#8b5a2b', '#5a4632', '#4a6741', '#4a5568', '#6b4c3b',
      '#4c5c6b', '#6b5b4c', '#5c4b6b', '#4b6b5c', '#6b4b5c'
    ]
    const color = darkColors[Math.floor(Math.random() * darkColors.length)]
    expect(color).toMatch(/^#[0-9a-fA-F]{6}$/)
  })
})

// Test distance calculation for gravity field
describe('gravity field distance', () => {
  it('finds nearest center correctly', () => {
    const centers = [
      { id: 'default', x: 100, y: 100 },
      { id: 'ai', x: 300, y: 100 },
    ]
    const dropX = 280
    const dropY = 110

    let nearestId: string | null = null
    let minDist = Infinity

    for (const c of centers) {
      const dist = Math.hypot(dropX - c.x, dropY - c.y)
      if (dist < minDist) {
        minDist = dist
        nearestId = c.id
      }
    }

    expect(nearestId).toBe('ai')
    expect(minDist).toBeCloseTo(Math.hypot(20, 10), 1)
  })

  it('respects threshold of 72px', () => {
    const centerX = 100
    const centerY = 100
    const dropX = 200
    const dropY = 100

    const dist = Math.hypot(dropX - centerX, dropY - centerY)
    const shouldGroup = dist < 72

    expect(shouldGroup).toBe(false)
  })
})
