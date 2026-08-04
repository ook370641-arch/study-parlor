import { describe, it, expect, vi } from 'vitest'

const mockApi = {
  collectionRead: vi.fn(),
  collectionAddEntry: vi.fn(),
  collectionRemoveEntry: vi.fn(),
  collectionAppendQA: vi.fn(),
}
;(globalThis as { window?: unknown }).window = { api: mockApi }

import { ipc } from '@/lib/ipc'

describe('collection IPC wiring', () => {
  it('facade 暴露 4 个精选集方法', () => {
    expect(ipc.collectionRead).toBe(mockApi.collectionRead)
    expect(ipc.collectionAddEntry).toBe(mockApi.collectionAddEntry)
    expect(ipc.collectionRemoveEntry).toBe(mockApi.collectionRemoveEntry)
    expect(ipc.collectionAppendQA).toBe(mockApi.collectionAppendQA)
  })
})
