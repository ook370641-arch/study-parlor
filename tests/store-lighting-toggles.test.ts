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

describe('store lighting toggles', () => {
  beforeEach(() => {
    vi.mocked(ipc.patchState).mockClear()
    useStore.setState({ candlelightEnabled: true, paintingPlateEnabled: false })
  })

  it('candlelightEnabled defaults on and toggles with persistence', async () => {
    await useStore.getState().toggleCandlelight()
    expect(useStore.getState().candlelightEnabled).toBe(false)
    expect(ipc.patchState).toHaveBeenCalledWith({ candlelightEnabled: false })
    await useStore.getState().toggleCandlelight()
    expect(useStore.getState().candlelightEnabled).toBe(true)
  })

  it('paintingPlateEnabled defaults off and toggles with persistence', async () => {
    await useStore.getState().togglePaintingPlate()
    expect(useStore.getState().paintingPlateEnabled).toBe(true)
    expect(ipc.patchState).toHaveBeenCalledWith({ paintingPlateEnabled: true })
  })
})
