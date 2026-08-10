import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'

vi.mock('@/lib/ipc', () => ({ ipc: { patchState: vi.fn() } }))

import { useStore } from '@/store'
import { WritingAssistantInput } from '@/components/writing-assistant/WritingAssistantInput'

describe('WritingAssistantInput snapshot button', () => {
  beforeEach(() => {
    cleanup()
    useStore.setState({
      writingAssistantSnapshotLit: false,
      writingAssistant: null,
      writingFile: null,
      assistantSearchEnabled: false,
      assistantThinkingEffort: 'off',
    } as any)
  })

  it('toggles writingAssistantSnapshotLit when clicked', () => {
    render(<WritingAssistantInput />)
    const btn = screen.getByTestId('writing-assistant-snapshot-btn')
    fireEvent.click(btn)
    expect(useStore.getState().writingAssistantSnapshotLit).toBe(true)
    expect(btn).toHaveAttribute('aria-pressed', 'true')
    fireEvent.click(btn)
    expect(useStore.getState().writingAssistantSnapshotLit).toBe(false)
  })
})
