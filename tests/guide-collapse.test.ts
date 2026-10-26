// 2026-10-22 回归：对照侧边栏收起后仍处于对照模式，点文章被路由进不可见的对照槽（"退不出来"）。
// 修复：折叠右栏时一并退出对照模式并关闭挑选器。
import { describe, it, expect, vi } from 'vitest'

vi.mock('@/lib/ipc', () => ({ ipc: { patchState: vi.fn() } }))

import { useStore } from '@/store'

describe('setArticleAssistantGuideCollapsed', () => {
  it('折叠右栏时退出对照模式并关闭挑选器', () => {
    useStore.setState({
      articlePanelMode: { anthropic: 'companion' },
      writingCompanionPicker: 'anthropic',
      articleAssistantGuideCollapsed: false,
    } as any)

    useStore.getState().setArticleAssistantGuideCollapsed(true)

    const s = useStore.getState()
    expect(s.articlePanelMode.anthropic).toBe('guide')
    expect(s.writingCompanionPicker).toBeNull()
    expect(s.articleAssistantGuideCollapsed).toBe(true)
  })

  it('展开右栏不改对照模式', () => {
    useStore.setState({
      articlePanelMode: { anthropic: 'companion' },
      writingCompanionPicker: null,
      articleAssistantGuideCollapsed: true,
    } as any)

    useStore.getState().setArticleAssistantGuideCollapsed(false)

    expect(useStore.getState().articlePanelMode.anthropic).toBe('companion')
  })
})
