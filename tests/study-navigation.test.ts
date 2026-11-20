import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useStore } from '@/store'
import { withSessionReplaced, withStudySaved } from '@/lib/study-navigation'

describe('study navigation guards', () => {
  beforeEach(() => {
    useStore.setState({ currentPage: 'study', toast: null })
  })

  it('does not navigate when snapshot saving fails', async () => {
    const navigate = vi.fn()
    useStore.setState({
      saveCurrentSession: vi.fn().mockRejectedValue(new Error('只读磁盘')),
      showToast: vi.fn(),
    })
    await expect(withStudySaved(navigate)).resolves.toBe(false)
    expect(navigate).not.toHaveBeenCalled()
    expect(useStore.getState().showToast).toHaveBeenCalledWith(expect.stringContaining('只读磁盘'))
  })

  it('saves once before ordinary navigation', async () => {
    const save = vi.fn().mockResolvedValue(undefined)
    const navigate = vi.fn()
    useStore.setState({ saveCurrentSession: save })
    await expect(withStudySaved(navigate)).resolves.toBe(true)
    expect(save).toHaveBeenCalledOnce()
    expect(navigate).toHaveBeenCalledOnce()
  })

  it('saves a background session before replacing it from the briefing', async () => {
    const saveCurrentSession = vi.fn().mockResolvedValue(undefined)
    const replace = vi.fn()
    useStore.setState({ currentPage: 'briefing', saveCurrentSession })
    await expect(withSessionReplaced(replace)).resolves.toBe(true)
    expect(saveCurrentSession).toHaveBeenCalledOnce()
    expect(replace).toHaveBeenCalledOnce()
  })
})
