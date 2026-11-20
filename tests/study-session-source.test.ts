import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ipc } from '@/lib/ipc'
import { useStore } from '@/store'

vi.mock('@/lib/ipc', () => ({ ipc: { patchState: vi.fn().mockResolvedValue(undefined), llmAbort: vi.fn().mockResolvedValue(undefined), searchPrepare: vi.fn() } }))

describe('study session source restoration', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useStore.setState({ briefingSource: 'anthropic', session: null, session_count: 0 })
  })

  it('starts every session with study as the persisted return source', () => {
    useStore.getState().startSession({ mode: 'progress', topic: '记忆', difficulty: 'mid', temperature: 0.7 })
    expect(useStore.getState().briefingSource).toBe('study')
    expect(useStore.getState().studyWorkspaceTab).toBe('conversation')
    expect(ipc.patchState).toHaveBeenCalledWith(expect.objectContaining({ briefingSource: 'study' }))
  })

  it('restores a live session without replacing its in-memory history', () => {
    const session = { mode: 'progress' as const, topic: '记忆', difficulty: 'mid' as const, temperature: 0.7, history: [{ role: 'assistant' as const, content: '最新内容' }], streaming: false, abortId: 'live', archivePending: false }
    useStore.setState({ session, currentPage: 'briefing' })
    useStore.getState().restoreSession({ id: 'live', mode: 'progress', topic: '记忆', difficulty: 'mid', temperature: 0.7, history: [] })
    expect(useStore.getState().session?.history[0].content).toBe('最新内容')
    expect(useStore.getState().currentPage).toBe('study')
    expect(useStore.getState().briefingSource).toBe('study')
  })

  it('drops a late external-material result owned by a replaced session', async () => {
    let resolveSearch!: (value: { summary: string; sources: [] }) => void
    vi.mocked(ipc.searchPrepare).mockImplementation(() => new Promise(resolve => { resolveSearch = resolve }))
    useStore.setState({
      session: { mode: 'progress', topic: '旧主题', difficulty: 'mid', temperature: 0.7, history: [], streaming: false, abortId: 'old', archivePending: false },
      externalMaterials: null,
      showToast: vi.fn(),
    })
    const pending = useStore.getState().prepareExternalMaterials('旧主题')
    useStore.getState().startSession({ mode: 'progress', topic: '新主题', difficulty: 'mid', temperature: 0.7 })
    resolveSearch({ summary: '旧摘要', sources: [] })
    await pending
    expect(useStore.getState().externalMaterials).toBeNull()
  })
})
