import { describe, it, expect, beforeEach, vi } from 'vitest'

const mockIpc = {
  collectionRead: vi.fn(),
  collectionAddEntry: vi.fn(),
  collectionRemoveEntry: vi.fn(),
  collectionAppendQA: vi.fn(),
}
vi.mock('@/lib/ipc', () => ({ ipc: new Proxy({}, { get: (_, k) => mockIpc[k as keyof typeof mockIpc] ?? (() => Promise.resolve()) }) }))

import { useStore } from '@/store'
import type { BriefingCollectionEntry } from '@shared/index'

const ARTICLE = '## AI Safety\n宪法式 AI 用书面原则约束模型。\n\n## Training Data\n训练数据的去重与过滤。'
const GUIDE = {
  background: 'bg',
  chunks: [
    { heading: 'AI Safety', summary: 's0', terms: [] },
    { heading: 'Training Data', summary: 's1', terms: [] },
  ],
}
const FILE = '/lib/夜航简报/夜航简报-2026-08-04.md'

function seedAssistantSession(messages: Array<{ role: 'user' | 'assistant'; content: string; selection?: string }>) {
  useStore.setState({
    assistantSession: {
      contextId: FILE,
      contextType: 'briefing',
      articleContent: ARTICLE,
      guide: GUIDE,
      guideLoading: false,
      guideError: null,
      messages,
      streaming: false,
      abortId: '',
      searchLoading: false,
      searchError: null,
      chatError: null,
      retryContext: null,
      isOpen: true,
      activeChunkIndex: null,
    } as never,
  })
}

function entryOf(overrides: Partial<BriefingCollectionEntry> = {}): BriefingCollectionEntry {
  return {
    id: 'c-1', briefingFilePath: FILE, briefingDate: '2026-08-04',
    chunkHeading: 'AI Safety', chunkIndex: 0, chunkBody: '宪法式 AI 用书面原则约束模型。',
    guide: { summary: 's0', terms: [] }, qa: [], qaMessageCount: 2,
    collectedAt: '2026-08-04T10:00:00.000Z', updatedAt: '2026-08-04T10:00:00.000Z',
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  useStore.setState({ collection: { entries: [], loaded: false }, collectionViewOpen: false, assistantSession: null })
})

describe('collection slice', () => {
  it('openCollectionView 置开视图并加载条目', async () => {
    mockIpc.collectionRead.mockResolvedValue({ version: 1, entries: [entryOf()] })
    await useStore.getState().openCollectionView()
    expect(useStore.getState().collectionViewOpen).toBe(true)
    expect(useStore.getState().collection.entries).toHaveLength(1)
  })

  it('collectChunk 快照正文+导读+归属问答并写入', async () => {
    seedAssistantSession([
      { role: 'user', content: '这是什么', selection: '宪法式 AI' },
      { role: 'assistant', content: '回答一' },
    ])
    mockIpc.collectionAddEntry.mockResolvedValue({ ok: true })
    await useStore.getState().collectChunk(0)
    const arg = mockIpc.collectionAddEntry.mock.calls[0][0] as BriefingCollectionEntry
    expect(arg.briefingFilePath).toBe(FILE)
    expect(arg.briefingDate).toBe('2026-08-04')
    expect(arg.chunkBody).toContain('宪法式 AI')
    expect(arg.guide.summary).toBe('s0')
    expect(arg.qa).toHaveLength(2)
    expect(arg.qaMessageCount).toBe(2)
    expect(useStore.getState().collection.entries[0].id).toBe(arg.id)
  })

  it('collectChunk 非 briefing 上下文直接返回', async () => {
    seedAssistantSession([])
    useStore.setState({ assistantSession: { ...useStore.getState().assistantSession!, contextType: 'web-article' } })
    await useStore.getState().collectChunk(0)
    expect(mockIpc.collectionAddEntry).not.toHaveBeenCalled()
  })

  it('collectChunk 重复收藏（DUPLICATE）不写入 store', async () => {
    seedAssistantSession([])
    useStore.setState({ collection: { entries: [], loaded: true } })
    mockIpc.collectionAddEntry.mockResolvedValue({ ok: false, code: 'DUPLICATE' })
    await useStore.getState().collectChunk(0)
    expect(useStore.getState().collection.entries).toHaveLength(0)
  })

  it('removeCollectionEntry 移除条目', async () => {
    useStore.setState({ collection: { entries: [entryOf()], loaded: true } })
    await useStore.getState().removeCollectionEntry('c-1')
    expect(mockIpc.collectionRemoveEntry).toHaveBeenCalledWith('c-1')
    expect(useStore.getState().collection.entries).toHaveLength(0)
  })

  it('syncCollectionQA 只追加游标后的归属消息并推进游标', async () => {
    useStore.setState({ collection: { entries: [entryOf({ qaMessageCount: 2 })], loaded: true } })
    seedAssistantSession([
      { role: 'user', content: '这是什么', selection: '宪法式 AI' },  // index 0（已同步）
      { role: 'assistant', content: '回答一' },                       // index 1（已同步）
      { role: 'user', content: '追问不带选段' },                      // index 2 → 向前填充归 chunk 0
      { role: 'assistant', content: '回答二' },                       // index 3
    ])
    await useStore.getState().syncCollectionQA()
    expect(mockIpc.collectionAppendQA).toHaveBeenCalledWith({
      id: 'c-1',
      qa: [
        { role: 'user', content: '追问不带选段' },
        { role: 'assistant', content: '回答二' },
      ],
      qaMessageCount: 4,
    })
  })

  it('syncCollectionQA 无新增消息时不调用 IPC', async () => {
    useStore.setState({ collection: { entries: [entryOf({ qaMessageCount: 2 })], loaded: true } })
    seedAssistantSession([
      { role: 'user', content: 'a', selection: '宪法式 AI' },
      { role: 'assistant', content: 'b' },
    ])
    await useStore.getState().syncCollectionQA()
    expect(mockIpc.collectionAppendQA).not.toHaveBeenCalled()
  })

  it('finishAssistantStreaming 触发追加同步', async () => {
    useStore.setState({ collection: { entries: [entryOf({ qaMessageCount: 0 })], loaded: true } })
    seedAssistantSession([
      { role: 'user', content: '这是什么', selection: '宪法式 AI' },
      { role: 'assistant', content: '完整回答' },
    ])
    useStore.setState({ assistantSession: { ...useStore.getState().assistantSession!, streaming: true } as never })
    useStore.getState().finishAssistantStreaming()
    await vi.waitFor(() => expect(mockIpc.collectionAppendQA).toHaveBeenCalled())
  })

  it('打开 briefing 旁注会话时预载精选集', async () => {
    mockIpc.collectionRead.mockResolvedValue({ version: 1, entries: [] })
    useStore.getState().openAssistantSession({
      contextId: FILE,
      contextType: 'briefing',
      articleContent: ARTICLE,
    })
    await vi.waitFor(() => expect(mockIpc.collectionRead).toHaveBeenCalled())
    expect(useStore.getState().collection.loaded).toBe(true)
  })

  it('collectChunk 在精选集未加载时先加载再判重', async () => {
    seedAssistantSession([{ role: 'user', content: 'q', selection: '宪法式 AI' }])
    useStore.setState({ collection: { entries: [], loaded: false } })
    mockIpc.collectionRead.mockResolvedValue({ version: 1, entries: [entryOf()] })
    mockIpc.collectionAddEntry.mockResolvedValue({ ok: false, code: 'DUPLICATE' })
    await useStore.getState().collectChunk(0)
    expect(mockIpc.collectionRead).toHaveBeenCalled()
    expect(useStore.getState().collection.entries).toHaveLength(1)
  })
})
