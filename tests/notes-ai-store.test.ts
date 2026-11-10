import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { NoteEntry } from '@shared/index'

const mockIpc = vi.hoisted(() => ({
  patchState: vi.fn(),
  writingWrite: vi.fn(),
  anthropicWriteArticleBody: vi.fn(),
  notesGenerateAi: vi.fn(),
  notesApplyAi: vi.fn(),
  notesAbortAi: vi.fn(),
  notesList: vi.fn(),
  onNotesAiProgress: vi.fn(),
  paintingsCanEdit: vi.fn(async () => false),
}))

vi.mock('@/lib/ipc', () => ({ ipc: mockIpc }))
vi.mock('@/lib/paintings', () => ({
  manifest: [{ id: 'test', painter: 'Test', title: 'Test', url: '/test.jpg' }],
  pickRandom: vi.fn((items: unknown[]) => items[0] ?? null),
}))

import { useStore } from '@/store'

const entry: NoteEntry = {
  path: 'notes/a.md',
  meta: { title: 'A', url: 'https://example.com/a', source: 'web', rating: 0, summary: '', highlight: '', collected_at: '2026-11-05' },
}
const candidate = { generationId: 'generation-1', path: entry.path, body: 'AI 正文' }
const applied = { path: entry.path, body: 'AI 正文\n\n---\n\n## 原笔迹\n\n原笔迹\n', aiGeneratedAt: '2026-11-05T02:00:00.000Z' }

beforeEach(() => {
  vi.clearAllMocks()
  mockIpc.writingWrite.mockResolvedValue({ ok: true, value: null })
  mockIpc.anthropicWriteArticleBody.mockResolvedValue({ ok: true })
  mockIpc.notesGenerateAi.mockResolvedValue(candidate)
  mockIpc.notesApplyAi.mockResolvedValue(applied)
  mockIpc.notesAbortAi.mockResolvedValue(undefined)
  mockIpc.notesList.mockResolvedValue([{ ...entry, meta: { ...entry.meta, ai_generated_at: applied.aiGeneratedAt } }])
  mockIpc.onNotesAiProgress.mockReturnValue(vi.fn())
  useStore.setState({
    aiNoteGenerations: {},
    notesList: [entry],
    writingFile: { path: entry.path, body: '原笔迹', kind: 'md', dirty: false, saving: 'idle' },
    articleCompanion: null,
  })
})

describe('AI 笔记 store', () => {
  it('生成前等待目标主笔记保存，完成后仅展示候选', async () => {
    useStore.setState({ writingFile: { path: entry.path, body: '最新原笔迹', kind: 'md', dirty: true, saving: 'idle' } })

    await useStore.getState().generateAiNote(entry.path)

    expect(mockIpc.writingWrite).toHaveBeenCalledWith({ path: entry.path, body: '最新原笔迹' })
    expect(mockIpc.notesGenerateAi).toHaveBeenCalledWith({ path: entry.path })
    expect(mockIpc.writingWrite.mock.invocationCallOrder[0]).toBeLessThan(mockIpc.notesGenerateAi.mock.invocationCallOrder[0])
    expect(useStore.getState().aiNoteGenerations[entry.path]).toEqual({ path: entry.path, stage: 'reading', candidate, applying: false })
  })

  it('确认后同步主笔记、对照笔记和永久标记', async () => {
    useStore.setState({
      aiNoteGenerations: { [entry.path]: { path: entry.path, stage: 'writing', candidate, applying: false } },
      articleCompanion: { key: 'article', filePath: entry.path, kind: 'md', body: '原笔迹', readonly: false, dirty: false, saving: 'idle' },
    })

    await useStore.getState().applyAiNote(entry.path)

    expect(mockIpc.notesApplyAi).toHaveBeenCalledWith({ generationId: candidate.generationId })
    expect(useStore.getState().writingFile).toMatchObject({ body: applied.body, dirty: false, saving: 'saved' })
    expect(useStore.getState().articleCompanion).toMatchObject({ body: applied.body, dirty: false, saving: 'saved' })
    expect(useStore.getState().notesList?.[0].meta.ai_generated_at).toBe(applied.aiGeneratedAt)
    expect(useStore.getState().aiNoteGenerations).toEqual({})
  })

  it('取消候选只释放候选，不改编辑器正文', async () => {
    useStore.setState({ aiNoteGenerations: { [entry.path]: { path: entry.path, stage: 'writing', candidate, applying: false } } })

    await useStore.getState().cancelAiNote(entry.path)

    expect(mockIpc.notesAbortAi).toHaveBeenCalledWith({ generationId: candidate.generationId })
    expect(useStore.getState().aiNoteGenerations).toEqual({})
    expect(useStore.getState().writingFile?.body).toBe('原笔迹')
  })

  it('写入失败保留候选且不释放会话，随后可以重试', async () => {
    useStore.setState({
      aiNoteGenerations: { [entry.path]: { path: entry.path, stage: 'writing', candidate, applying: false } },
    })
    mockIpc.notesApplyAi.mockRejectedValueOnce(new Error('SAVE_FAILED'))

    await useStore.getState().applyAiNote(entry.path)

    expect(mockIpc.notesAbortAi).not.toHaveBeenCalled()
    expect(useStore.getState().aiNoteGenerations[entry.path]).toEqual({
      path: entry.path, stage: 'writing', candidate, applying: false,
    })

    await useStore.getState().applyAiNote(entry.path)

    expect(mockIpc.notesApplyAi).toHaveBeenCalledTimes(2)
    expect(useStore.getState().aiNoteGenerations).toEqual({})
  })

  it('生成失败清理状态并保留重试能力', async () => {
    mockIpc.notesGenerateAi.mockRejectedValueOnce(new Error('MISSING_API_KEY'))

    await useStore.getState().generateAiNote(entry.path)

    expect(useStore.getState().aiNoteGenerations).toEqual({})
    await useStore.getState().generateAiNote(entry.path)
    expect(mockIpc.notesGenerateAi).toHaveBeenCalledTimes(2)
  })

  it('不同笔记可并行生成并分别保留候选', async () => {
    const otherPath = 'notes/b.md'
    const otherCandidate = { generationId: 'generation-2', path: otherPath, body: '另一篇 AI 正文' }
    let resolveFirst!: (value: typeof candidate) => void
    let resolveSecond!: (value: typeof otherCandidate) => void
    mockIpc.notesGenerateAi.mockImplementation(({ path }: { path: string }) => new Promise(resolve => {
      if (path === entry.path) resolveFirst = resolve
      else resolveSecond = resolve
    }))

    const first = useStore.getState().generateAiNote(entry.path)
    const second = useStore.getState().generateAiNote(otherPath)
    expect(mockIpc.notesGenerateAi).toHaveBeenCalledTimes(2)

    resolveSecond(otherCandidate)
    await second
    expect(useStore.getState().aiNoteGenerations[entry.path]?.candidate).toBeNull()
    expect(useStore.getState().aiNoteGenerations[otherPath]?.candidate).toEqual(otherCandidate)

    resolveFirst(candidate)
    await first
    expect(useStore.getState().aiNoteGenerations[entry.path]?.candidate).toEqual(candidate)
  })
})
