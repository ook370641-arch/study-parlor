import { describe, expect, it, vi, beforeEach } from 'vitest'
import { formatBriefingDate } from '@/lib/format-briefing-date'

const today = formatBriefingDate(new Date())

let progressCb: ((source: string, stage: string, detail?: string) => void) | null = null
vi.mock('@/lib/ipc', () => ({
  ipc: {
    patchState: vi.fn(),
    getState: vi.fn(),
    onBriefingProgress: vi.fn((cb: (source: string, stage: string, detail?: string) => void) => {
      progressCb = cb
      return () => {}
    }),
    briefingGenerate: vi.fn(async () => ({
      title: '夜航简报', content: '## A\n正文', date: today,
      generatedAt: `${today}T01:00:00.000Z`, filePath: `/lib/夜航简报/夜航简报-${today}.md`,
      sourceStatus: {}, cached: false,
    })),
    briefingList: vi.fn(async () => []),
  },
}))

import { useStore } from '@/store'

describe('store generation pulse fields', () => {
  beforeEach(() => {
    progressCb = null
    useStore.setState({
      briefingPulseAt: null,
      briefingArrivedAt: null,
      candleBreathAt: null,
      briefingViewingDate: null,
      briefingGeneration: null,
      briefingStage: null,
      briefingStageDetail: null,
      briefing: { result: null, loading: false, error: null },
    })
  })

  it('progress events stamp briefingPulseAt; success clears it (arrivedAt stamped later by Briefing.tsx)', async () => {
    const p = useStore.getState().generateBriefing(today)
    expect(progressCb).toBeTypeOf('function')
    progressCb!('digest', 'extracting', '5 个来源')
    expect(useStore.getState().briefingPulseAt).toBeTypeOf('number')
    expect(useStore.getState().briefingStage).toBe('extracting')

    await p
    expect(useStore.getState().briefingPulseAt).toBeNull()
    expect(useStore.getState().briefingArrivedAt).toBeNull()
  })

  it('progress events from other sources are ignored', async () => {
    const p = useStore.getState().generateBriefing(today)
    expect(progressCb).toBeTypeOf('function')
    progressCb!('job', 'scanning-events')
    expect(useStore.getState().briefingStage).toBe('fetching') // 保持初始 stage

    await p
  })

  it('breathCandle stamps candleBreathAt (阖卷→烛光通道)', () => {
    useStore.getState().breathCandle()
    expect(useStore.getState().candleBreathAt).toBeTypeOf('number')
  })
})
