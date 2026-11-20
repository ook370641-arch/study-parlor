import { act, fireEvent, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { TopicMeta } from '@shared/index'
import { useStore } from '@/store'
import { useStudyGravityDrag } from '@/components/study/useStudyGravityDrag'

const topic: TopicMeta = {
  dirName: 'memory', title: '记忆', sessionCount: 0, sessions: [],
  last_studied: '', last_studied_days: 0, groupId: 'old',
}

describe('useStudyGravityDrag', () => {
  beforeEach(() => {
    window.innerWidth = 1000
    window.innerHeight = 800
    useStore.setState({
      groups: [{ id: 'default', name: '默认', color: '#d97757' }],
      groupMapping: { memory: 'old' },
      gravityFieldOpen: false,
      draggingTopic: null,
      showToast: vi.fn(),
    })
  })

  it('activates after six pixels and moves near the satellite', async () => {
    const moveTopicToGroup = vi.fn().mockResolvedValue(undefined)
    useStore.setState({ moveTopicToGroup })
    const { result } = renderHook(() => useStudyGravityDrag())
    act(() => result.current.beginDrag(topic, 100, 100))
    fireEvent.mouseMove(window, { clientX: 105, clientY: 100 })
    expect(useStore.getState().gravityFieldOpen).toBe(false)
    fireEvent.mouseMove(window, { clientX: 107, clientY: 100 })
    expect(useStore.getState().gravityFieldOpen).toBe(true)
    fireEvent.mouseUp(window, { clientX: 500, clientY: 160 })
    await waitFor(() => expect(moveTopicToGroup).toHaveBeenCalledWith('memory', 'default'))
  })

  it('cancels on Escape without changing the mapping', () => {
    const moveTopicToGroup = vi.fn()
    useStore.setState({ moveTopicToGroup })
    const { result } = renderHook(() => useStudyGravityDrag())
    act(() => result.current.beginDrag(topic, 100, 100))
    fireEvent.mouseMove(window, { clientX: 120, clientY: 120 })
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(useStore.getState().gravityFieldOpen).toBe(false)
    expect(useStore.getState().groupMapping.memory).toBe('old')
    expect(moveTopicToGroup).not.toHaveBeenCalled()
  })
})
