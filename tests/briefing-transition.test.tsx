import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup, act } from '@testing-library/react'

vi.mock('@/lib/ipc', () => ({
  ipc: new Proxy({}, {
    get: (_t, prop) => {
      if (prop === 'onBriefingProgress' || prop === 'onLlmChunk' || prop === 'onLlmDone' || prop === 'onLlmError') {
        return vi.fn(() => () => {})
      }
      if (prop === 'articleAssistantReadSession') {
        return vi.fn(async () => ({ messages: [] }))
      }
      if (prop === 'articleAssistantGenerateGuide' || prop === 'articleAssistantSendMessage' || prop === 'articleAssistantAbort') {
        return vi.fn(async () => undefined)
      }
      if (prop === 'annotationsRead' || prop === 'annotationsWrite') {
        return vi.fn(async () => ([]))
      }
      if (prop === 'readAssetAsDataUrl' || prop === 'openExternal') {
        return vi.fn(async () => '')
      }
      return vi.fn(async () => ([]))
    },
  }),
}))
vi.mock('@/lib/paintings', () => ({ manifest: [], pickRandom: vi.fn(() => null) }))

import { useStore } from '@/store'
import { Briefing } from '@/pages/Briefing'

const RESULT = {
  title: '夜航简报',
  content: '## A\n正文内容',
  date: '2026-07-25',
  generatedAt: '2026-07-25T01:00:00.000Z',
  filePath: '/x/夜航简报-2026-07-25.md',
  sourceStatus: {},
} as const

function seedBase() {
  useStore.setState({
    briefing: { result: null, loading: false, error: null },
    briefingStage: null,
    briefingStageDetail: null,
    briefingPulseAt: null,
    briefingArrivedAt: null,
    briefingSource: 'digest',
    briefingTheme: 'academic',
    briefingHistory: { list: [], loading: false, error: null },
    jobBriefing: { result: null, loading: false, error: null },
    jobBriefingHistory: { list: [], loading: false, error: null },
    assistantSession: null,
    currentPaintings: { cover: null, home: null, study: null, briefing: null },
  } as any)
}

describe('Briefing generation transition choreography', () => {
  beforeEach(() => { cleanup(); vi.useFakeTimers(); seedBase() })
  afterEach(() => { vi.useRealTimers() })

  it('loading renders constellation live; result passes through resolved/departing into fresh reading pane', () => {
    render(<Briefing />)
    act(() => {
      useStore.setState({
        briefing: { result: null, loading: true, error: null },
        briefingStage: 'fetching',
      } as any)
    })
    expect(screen.getByTestId('briefing-constellation')).toBeInTheDocument()

    act(() => {
      useStore.setState({
        briefing: {
          result: RESULT as never,
          loading: false,
          error: null,
        },
        briefingStage: null,
      } as any)
    })
    // Advance through resolved (900ms) + departing (600ms) → idle
    act(() => { vi.advanceTimersByTime(1600) })
    const pane = screen.getByTestId('briefing-reading-pane')
    expect(pane.dataset.arrival).toBe('fresh')
  })

  it('error: failing keeps constellation before the error panel', () => {
    render(<Briefing />)
    act(() => {
      useStore.setState({
        briefing: { result: null, loading: true, error: null },
        briefingStage: 'fetching',
      } as any)
    })
    act(() => {
      useStore.setState({
        briefing: { result: null, loading: false, error: 'NETWORK_ERROR' },
        briefingStage: null,
        briefingPulseAt: null,
      } as any)
    })
    expect(screen.getByTestId('briefing-constellation-well').dataset.state).toBe('failed')
    act(() => { vi.advanceTimersByTime(1100) })
    expect(screen.queryByTestId('briefing-constellation')).toBeNull()
  })

  it('revisit: seeded result without loading shows reading pane as revisit', () => {
    act(() => {
      useStore.setState({
        briefing: {
          result: RESULT as never,
          loading: false,
          error: null,
        },
      } as any)
    })
    render(<Briefing />)
    const pane = screen.getByTestId('briefing-reading-pane')
    expect(pane.dataset.arrival).toBe('revisit')
  })
})
