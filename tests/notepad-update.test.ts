// updateNotepadItem：行内编辑落库——内容/分类可改，文本变更时短标题重算
import { describe, it, expect, vi } from 'vitest'

vi.mock('@/lib/ipc', () => ({ ipc: { patchState: vi.fn() } }))

import { useStore } from '@/store'

describe('updateNotepadItem', () => {
  it('改内容和分类，短标题随文本重算', () => {
    useStore.setState({
      notepadItems: [
        { id: 'a', title: '旧标题', text: '旧内容', category: 'feature', createdAt: '2026-10-22T00:00:00Z' },
        { id: 'b', title: '别动我', text: '另一条', category: 'bug', createdAt: '2026-10-22T00:00:00Z' },
      ],
    } as any)

    useStore.getState().updateNotepadItem('a', { text: '新内容', category: 'bug' })

    const [a, b] = useStore.getState().notepadItems
    expect(a.text).toBe('新内容')
    expect(a.category).toBe('bug')
    expect(a.title).toBe('新内容')
    expect(b.text).toBe('另一条')
  })

  it('只改分类时标题保持', () => {
    useStore.setState({
      notepadItems: [
        { id: 'a', title: '旧标题', text: '旧内容', category: 'feature', createdAt: '2026-10-22T00:00:00Z' },
      ],
    } as any)

    useStore.getState().updateNotepadItem('a', { category: 'improvement' })

    const [a] = useStore.getState().notepadItems
    expect(a.category).toBe('improvement')
    expect(a.title).toBe('旧标题')
  })
})
