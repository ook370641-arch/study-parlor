import { describe, it, expect, vi, beforeEach } from 'vitest'

const patchState = vi.fn()
vi.mock('@/lib/ipc', () => ({ ipc: { patchState: (...a: unknown[]) => patchState(...a) } }))

vi.mock('@/lib/paintings', () => ({
  manifest: [{ id: 'test', painter: 'Test', title: 'Test', url: '/test.jpg' }],
  pickRandom: vi.fn((manifest: unknown[]) => manifest[0] ?? null)
}))

import { useStore } from '@/store'
import { sortNodesByOrder } from '@/lib/writing-tree-utils'

const nodes = [
  { kind: 'file' as const, name: 'a.md', path: 'writing/a.md' },
  { kind: 'file' as const, name: 'b.md', path: 'writing/b.md' },
  { kind: 'file' as const, name: 'c.md', path: 'writing/c.md' },
]

describe('sortNodesByOrder', () => {
  it('sorts by recorded order, unknown nodes last in scan order', () => {
    const sorted = sortNodesByOrder(nodes, ['writing/c.md', 'writing/a.md'])
    expect(sorted.map(n => n.path)).toEqual(['writing/c.md', 'writing/a.md', 'writing/b.md'])
  })

  it('returns scan order when no order recorded', () => {
    expect(sortNodesByOrder(nodes, undefined).map(n => n.path)).toEqual(['writing/a.md', 'writing/b.md', 'writing/c.md'])
  })
})

describe('reorderWritingSibling', () => {
  beforeEach(() => {
    patchState.mockReset()
    useStore.setState({ writingOrder: {} } as any)
  })

  it('moves src before target and persists', () => {
    useStore.getState().reorderWritingSibling({
      dir: 'writing', src: 'writing/c.md', target: 'writing/a.md', position: 'before',
      siblings: ['writing/a.md', 'writing/b.md', 'writing/c.md'],
    })
    expect(useStore.getState().writingOrder['writing']).toEqual(['writing/c.md', 'writing/a.md', 'writing/b.md'])
    expect(patchState).toHaveBeenCalledWith({ writingOrder: { writing: ['writing/c.md', 'writing/a.md', 'writing/b.md'] } })
  })

  it('moves src after target', () => {
    useStore.getState().reorderWritingSibling({
      dir: 'writing', src: 'writing/a.md', target: 'writing/c.md', position: 'after',
      siblings: ['writing/a.md', 'writing/b.md', 'writing/c.md'],
    })
    expect(useStore.getState().writingOrder['writing']).toEqual(['writing/b.md', 'writing/c.md', 'writing/a.md'])
  })
})
