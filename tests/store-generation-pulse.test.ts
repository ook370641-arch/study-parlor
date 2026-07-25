import { describe, expect, it, vi, beforeEach } from 'vitest'

let progressCb: ((stage: string, detail?: string) => void) | null = null
vi.mock('@/lib/ipc', () => ({
  ipc: {
    patchState: vi.fn(),
    getState: vi.fn(),
    onBriefingProgress: vi.fn((cb: (stage: string, detail?: string) => void) => {
      progressCb = cb
      return () => {}
    }),
    briefingGenerate: vi.fn(async () => ({
      title: '夜航简报', content: '## A\n正文', date: '2026-07-25',
      generatedAt: '2026-07-25T01:00:00.000Z', filePath: '/lib/夜航简报/夜航简报-2026-07-25.md',
      sourceStatus: {},
    })),
  },
}))

import { useStore } from '@/store'

describe('store generation pulse fields', () => {
  beforeEach(() => {
    progressCb = null
    useStore.setState({ briefingPulseAt: null, briefingArrivedAt: null, candleBreathAt: null })
  })

  it('progress events stamp briefingPulseAt; success clears it and stamps briefingArrivedAt', async () => {
    const p = useStore.getState().generateBriefing('2026-07-25')
    expect(progressCb).toBeTypeOf('function')
    progressCb!('extracting', '5 个来源')
    expect(useStore.getState().briefingPulseAt).toBeTypeOf('number')
    expect(useStore.getState().briefingStage).toBe('extracting')

    await p
    expect(useStore.getState().briefingPulseAt).toBeNull()
    expect(useStore.getState().briefingArrivedAt).toBeTypeOf('number')
  })

  it('breathCandle stamps candleBreathAt (阖卷→烛光通道)', () => {
    useStore.getState().breathCandle()
    expect(useStore.getState().candleBreathAt).toBeTypeOf('number')
  })
})
