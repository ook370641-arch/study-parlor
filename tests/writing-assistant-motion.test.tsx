import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent, act } from '@testing-library/react'

vi.mock('@/lib/ipc', () => ({ ipc: { patchState: vi.fn(), getState: vi.fn() } }))
vi.mock('@/lib/paintings', () => ({ manifest: [], pickRandom: vi.fn(() => null) }))

import { useStore } from '@/store'
import { WritingAssistantPanel } from '@/components/writing-assistant/WritingAssistantPanel'

describe('WritingAssistantPanel open/close asymmetry', () => {
  beforeEach(() => {
    cleanup()
    vi.useFakeTimers()
    useStore.setState({ writingAssistantOpen: true, writingAssistantWidth: 320 })
  })
  afterEach(() => { vi.useRealTimers() })

  it('open: panel enters with panel-arise (ease-out welcome)', () => {
    render(<WritingAssistantPanel />)
    expect(screen.getByTestId('writing-assistant-panel').className).toContain('panel-arise')
  })

  it('close: panel-depart plays 200ms before the store actually closes', () => {
    render(<WritingAssistantPanel />)
    fireEvent.click(screen.getByTestId('writing-assistant-close-btn'))
    expect(screen.getByTestId('writing-assistant-panel').className).toContain('panel-depart')
    expect(useStore.getState().writingAssistantOpen).toBe(true) // 仍在播退场
    act(() => { vi.advanceTimersByTime(250) })
    expect(useStore.getState().writingAssistantOpen).toBe(false)
  })
})
