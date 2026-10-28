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

  it('书籍对照模式折叠右栏 → book 回到 guide 且 picker 清空', () => {
    useStore.setState({
      articlePanelMode: { anthropic: 'guide', book: 'companion' },
      writingCompanionPicker: 'book',
      articleAssistantGuideCollapsed: false,
    } as any)

    useStore.getState().setArticleAssistantGuideCollapsed(true)

    const s = useStore.getState()
    expect(s.articlePanelMode.book).toBe('guide')
    expect(s.articlePanelMode.anthropic).toBe('guide')
    expect(s.writingCompanionPicker).toBeNull()
    expect(s.articleAssistantGuideCollapsed).toBe(true)
  })

  it('两栏都是 guide 时折叠不产生 modeReset（避免无意义的 patch）', () => {
    useStore.setState({
      articlePanelMode: { anthropic: 'guide', book: 'guide' },
      writingCompanionPicker: 'book',
      articleAssistantGuideCollapsed: false,
    } as any)

    useStore.getState().setArticleAssistantGuideCollapsed(true)

    const s = useStore.getState()
    expect(s.articlePanelMode).toEqual({ anthropic: 'guide', book: 'guide' })
    expect(s.writingCompanionPicker).toBeNull()
  })
})
