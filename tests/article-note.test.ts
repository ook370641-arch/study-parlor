import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockIpc = vi.hoisted(() => ({
  notesCreate: vi.fn(),
  notesList: vi.fn(),
  patchState: vi.fn(),
}))
vi.mock('@/lib/ipc', () => ({ ipc: mockIpc }))

import { useStore } from '@/store'
import type { NoteEntry } from '@shared/index'

const existing: NoteEntry = {
  path: 'notes/existing.md',
  meta: { title: '已有笔记', url: 'https://a.com/post', source: 'anthropic', rating: 0, summary: '', highlight: '', collected_at: '2026-10-26' },
}

beforeEach(() => {
  vi.clearAllMocks()
  useStore.setState({ notesList: [existing] })
})

describe('findOrCreateArticleNote', () => {
  it('URL 已存在时直接复用，不重复创建', async () => {
    const result = await useStore.getState().findOrCreateArticleNote({ title: '新标题', url: 'https://a.com/post' })
    expect(result).toEqual({ path: 'notes/existing.md', created: false })
    expect(mockIpc.notesCreate).not.toHaveBeenCalled()
  })

  it('无对应笔记时创建 Anthropic 空白笔记并刷新列表', async () => {
    useStore.setState({ notesList: [] })
    mockIpc.notesCreate.mockResolvedValue({ path: 'notes/new.md' })
    mockIpc.notesList.mockResolvedValue([existing])
    const result = await useStore.getState().findOrCreateArticleNote({ title: '当前博客', url: 'https://a.com/new' })
    expect(mockIpc.notesCreate).toHaveBeenCalledWith({ title: '当前博客', url: 'https://a.com/new', source: 'anthropic' })
    expect(mockIpc.notesList).toHaveBeenCalled()
    expect(result).toEqual({ path: 'notes/new.md', created: true })
  })
})
