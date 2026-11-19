import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/ipc', () => ({
  ipc: {
    patchState: vi.fn(async () => undefined),
  },
}))

import { useStore } from '@/store'

describe('immersive mode', () => {
  beforeEach(() => {
    useStore.setState({
      immersiveMode: false,
      immersiveRestore: null,
      articleAssistantGuideCollapsed: false,
      articlePanelMode: { anthropic: 'guide', book: 'guide' },
      writingAssistantOpen: true,
      assistantSession: { isOpen: true },
    } as any)
  })

  it('entering collapses right rails and records a restore snapshot', () => {
    useStore.getState().toggleImmersiveMode()
    const s = useStore.getState()
    expect(s.immersiveMode).toBe(true)
    expect(s.articleAssistantGuideCollapsed).toBe(true)
    expect(s.assistantSession?.isOpen).toBe(false)
    expect(s.writingAssistantOpen).toBe(false)
    expect(s.immersiveRestore).toEqual({ guideCollapsed: false, chatOpen: true, writingAssistantOpen: true })
  })

  it('exiting restores the previous rail states', () => {
    useStore.getState().toggleImmersiveMode()
    useStore.getState().exitImmersiveMode()
    const s = useStore.getState()
    expect(s.immersiveMode).toBe(false)
    expect(s.immersiveRestore).toBeNull()
    expect(s.articleAssistantGuideCollapsed).toBe(false)
    expect(s.assistantSession?.isOpen).toBe(true)
    expect(s.writingAssistantOpen).toBe(true)
  })

  it('toggle twice round-trips', () => {
    useStore.getState().toggleImmersiveMode()
    useStore.getState().toggleImmersiveMode()
    expect(useStore.getState().immersiveMode).toBe(false)
    expect(useStore.getState().articleAssistantGuideCollapsed).toBe(false)
  })

  it('does not re-open rails that were already closed before entering', () => {
    useStore.setState({
      articleAssistantGuideCollapsed: true,
      writingAssistantOpen: false,
      assistantSession: { isOpen: false },
    } as any)
    useStore.getState().toggleImmersiveMode()
    useStore.getState().exitImmersiveMode()
    const s = useStore.getState()
    expect(s.articleAssistantGuideCollapsed).toBe(true)
    expect(s.assistantSession?.isOpen).toBe(false)
    expect(s.writingAssistantOpen).toBe(false)
  })

  it('exit without a snapshot only clears the flag', () => {
    useStore.setState({ immersiveMode: true, immersiveRestore: null } as any)
    useStore.getState().exitImmersiveMode()
    expect(useStore.getState().immersiveMode).toBe(false)
    expect(useStore.getState().articleAssistantGuideCollapsed).toBe(false)
  })
})
