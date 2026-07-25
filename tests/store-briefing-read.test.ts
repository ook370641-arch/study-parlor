import { describe, expect, it, vi, beforeEach } from 'vitest'

vi.mock('@/lib/ipc', () => ({
  ipc: {
    patchState: vi.fn(),
    getState: vi.fn()
  }
}))
vi.mock('@/lib/paintings', () => ({ manifest: [], pickRandom: vi.fn(() => null) }))

import { useStore } from '@/store'
import { ipc } from '@/lib/ipc'

describe('store briefingRead', () => {
  beforeEach(() => {
    vi.mocked(ipc.patchState).mockClear()
    useStore.setState({ briefingRead: { digest: [], 'job-briefing': [] } })
  })

  it('markBriefingRead appends, dedups, patches state.json', async () => {
    await useStore.getState().markBriefingRead('digest', '2026-07-25')
    expect(useStore.getState().briefingRead.digest).toEqual(['2026-07-25'])
    expect(ipc.patchState).toHaveBeenCalledWith({ briefingRead: { digest: ['2026-07-25'], 'job-briefing': [] } })

    vi.mocked(ipc.patchState).mockClear()
    await useStore.getState().markBriefingRead('digest', '2026-07-25')
    expect(ipc.patchState).not.toHaveBeenCalled()
  })

  it('trims each source to the latest 120 dates', async () => {
    const many = Array.from({ length: 121 }, (_, i) => `2026-01-${String(i + 1).padStart(3, '0')}`)
    useStore.setState({ briefingRead: { digest: many.slice(0, 120), 'job-briefing': [] } })
    await useStore.getState().markBriefingRead('digest', '2026-07-25')
    const list = useStore.getState().briefingRead.digest
    expect(list.length).toBe(120)
    expect(list[119]).toBe('2026-07-25')
    expect(list).not.toContain(many[0])
  })

  it('keeps digest and job-briefing lists independent', async () => {
    await useStore.getState().markBriefingRead('job-briefing', '2026-07-25')
    expect(useStore.getState().briefingRead.digest).toEqual([])
    expect(useStore.getState().briefingRead['job-briefing']).toEqual(['2026-07-25'])
  })
})
