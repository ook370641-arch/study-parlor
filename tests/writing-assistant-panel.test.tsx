import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'

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
    render(<WritingAssistantPanel />)
    fireEvent.click(screen.getByTestId('article-assistant-divider-toggle'))
    expect(useStore.getState().writingAssistantOpen).toBe(false)
  })

  it('keeps the collapsed strip entry with its testid', () => {
    useStore.setState({ writingAssistantOpen: false } as any)
    render(<WritingAssistantPanel />)
    expect(screen.getByTestId('writing-assistant-collapsed')).toBeInTheDocument()
  })

  it('renders header, messages and input when expanded', () => {
    render(<WritingAssistantPanel />)
    expect(screen.getByTestId('writing-assistant-close-btn')).toBeInTheDocument()
    expect(screen.getByTestId('wa-messages')).toBeInTheDocument()
    expect(screen.getByTestId('wa-input')).toBeInTheDocument()
  })

  it('close button sets writingAssistantOpen to false', () => {
    render(<WritingAssistantPanel />)
    fireEvent.click(screen.getByTestId('writing-assistant-close-btn'))
    expect(useStore.getState().writingAssistantOpen).toBe(false)
  })
})
