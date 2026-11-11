// updateNotepadItem：行内编辑落库——内容/分类可改，文本变更时短标题重算
import { beforeEach, describe, it, expect, vi } from 'vitest'
import type { NotepadItem } from '@shared/index'

vi.mock('@/lib/ipc', () => ({ ipc: { patchState: vi.fn() } }))

import { useStore } from '@/store'
import { ipc } from '@/lib/ipc'

beforeEach(() => {
  vi.mocked(ipc.patchState).mockClear()
})

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

describe('记事板 claim 写回隔离', () => {
  const claim = { claimedBy: 'codex/a', claimedAt: '2026-11-11T01:00:00Z' }
  const claimedItem = (): NotepadItem => ({
    id: 'a',
    title: '已认领',
    text: '已认领',
    category: 'feature',
    createdAt: '2026-11-11T00:00:00Z',
    claim,
  })
  const otherItem = (): NotepadItem => ({
    id: 'b',
    text: '另一条',
    category: 'bug',
    createdAt: '2026-11-11T00:00:00Z',
  })

  it('新增待办时旧条目的 claim 只留在内存', () => {
    useStore.setState({ notepadItems: [claimedItem()] } as any)

    useStore.getState().addNotepadItem('新待办', 'feature')

    const patch = vi.mocked(ipc.patchState).mock.calls.at(-1)?.[0]
    expect(patch?.notepadItems?.[0]).not.toHaveProperty('claim')
    expect(useStore.getState().notepadItems[0].claim).toEqual(claim)
  })

  it('更新待办时 claim 只留在内存', () => {
    useStore.setState({ notepadItems: [claimedItem()] } as any)

    useStore.getState().updateNotepadItem('a', { text: '更新后' })

    const patch = vi.mocked(ipc.patchState).mock.calls.at(-1)?.[0]
    expect(patch?.notepadItems?.[0]).not.toHaveProperty('claim')
    expect(useStore.getState().notepadItems[0].claim).toEqual(claim)
  })

  it('归档时 items 和 log 的写回都不含 claim', () => {
    useStore.setState({ notepadItems: [claimedItem()], notepadLog: [] } as any)

    useStore.getState().resolveNotepadItem('a')

    const patch = vi.mocked(ipc.patchState).mock.calls.at(-1)?.[0]
    expect(patch?.notepadLog?.[0]).not.toHaveProperty('claim')
    expect(useStore.getState().notepadLog[0].claim).toEqual(claim)
  })

  it('删除其他待办时保留内存 claim 但不写回', () => {
    useStore.setState({ notepadItems: [claimedItem(), otherItem()] } as any)

    useStore.getState().deleteNotepadItem('b')

    const patch = vi.mocked(ipc.patchState).mock.calls.at(-1)?.[0]
    expect(patch?.notepadItems?.[0]).not.toHaveProperty('claim')
    expect(useStore.getState().notepadItems[0].claim).toEqual(claim)
  })

  it('移动待办时 claim 只留在内存', () => {
    useStore.setState({ notepadItems: [claimedItem(), otherItem()] } as any)

    useStore.getState().moveNotepadItem('b', 0)

    const patch = vi.mocked(ipc.patchState).mock.calls.at(-1)?.[0]
    expect(patch?.notepadItems?.[1]).not.toHaveProperty('claim')
    expect(useStore.getState().notepadItems[1].claim).toEqual(claim)
  })
})
