import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent, act } from '@testing-library/react'

const patchState = vi.fn()
vi.mock('@/lib/ipc', () => ({ ipc: { patchState: (...a: unknown[]) => patchState(...a) } }))

import { useStore } from '@/store'

vi.mock('@/components/writing-assistant/WritingAssistantMessages', () => ({
  WritingAssistantMessages: () => <div data-testid="wa-messages" />,
}))
vi.mock('@/components/writing-assistant/WritingAssistantInput', () => ({
  WritingAssistantInput: () => <div data-testid="wa-input" />,
}))

import { WritingAssistantPanel } from '@/components/writing-assistant/WritingAssistantPanel'

describe('WritingAssistantPanel', () => {
  beforeEach(() => {
    cleanup()
    patchState.mockReset()
    useStore.setState({ writingAssistantOpen: true, writingAssistantWidth: 320, writingAssistant: null } as any)
  })

  it('uses the shared ArticleDivider for resizing', () => {
    render(<WritingAssistantPanel />)
    expect(screen.getByTestId('article-assistant-divider')).toBeInTheDocument()
  })

  it('divider toggle collapses the panel to the ember strip', () => {
    vi.useFakeTimers()
    render(<WritingAssistantPanel />)
    fireEvent.click(screen.getByTestId('article-assistant-divider-toggle'))
    act(() => { vi.advanceTimersByTime(250) })
    expect(useStore.getState().writingAssistantOpen).toBe(false)
    vi.useRealTimers()
  })

  it('renders divider in collapsed state when panel is closed', () => {
    useStore.setState({ writingAssistantOpen: false } as any)
    render(<WritingAssistantPanel />)
    // ArticleDivider is always rendered; panel content only when open
    expect(screen.getByTestId('article-assistant-divider')).toBeInTheDocument()
    expect(screen.queryByTestId('writing-assistant-close-btn')).not.toBeInTheDocument()
  })

  it('renders header, messages and input when expanded', () => {
    render(<WritingAssistantPanel />)
    expect(screen.getByTestId('writing-assistant-close-btn')).toBeInTheDocument()
    expect(screen.getByTestId('wa-messages')).toBeInTheDocument()
    expect(screen.getByTestId('wa-input')).toBeInTheDocument()
  })

  it('close button sets writingAssistantOpen to false', () => {
    vi.useFakeTimers()
    render(<WritingAssistantPanel />)
    fireEvent.click(screen.getByTestId('writing-assistant-close-btn'))
    act(() => { vi.advanceTimersByTime(250) })
    expect(useStore.getState().writingAssistantOpen).toBe(false)
    vi.useRealTimers()
  })
})
