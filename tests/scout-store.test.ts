import { describe, it, expect, beforeEach, vi } from 'vitest'

const mockIpc = {
  scoutListConversations: vi.fn(),
  scoutCreateConversation: vi.fn(),
  scoutGetConversation: vi.fn(),
  scoutRenameConversation: vi.fn(),
  scoutDeleteConversation: vi.fn(),
  scoutListArticles: vi.fn(),
  scoutDeleteArticle: vi.fn(),
  scoutSendMessage: vi.fn(),
  scoutAbort: vi.fn(),
  patchState: vi.fn(),
}
vi.mock('@/lib/ipc', () => ({ ipc: new Proxy({}, { get: (_, k) => mockIpc[k as keyof typeof mockIpc] ?? (() => Promise.resolve()) }) }))

import { useStore } from '@/store'

const CONV = { id: 'c1', title: '2026-08-02 15:04', createdAt: 'a', updatedAt: 'b', filePath: '/x/c1.json' }

beforeEach(() => {
  vi.clearAllMocks()
  useStore.setState({
    scoutTab: 'chat', scoutConversations: [], scoutActiveConversationId: null,
    scoutMessages: [], scoutStreaming: false, scoutArticles: [],
    scoutReaderFilePath: null, scoutReaderBody: null, scoutReaderTitle: null,
  })
})

describe('scout store slice', () => {
  it('initScout 加载对话列表与文章列表', async () => {
    mockIpc.scoutListConversations.mockResolvedValue([CONV])
    mockIpc.scoutListArticles.mockResolvedValue([{ url: 'u', title: 't', summary: null, publishedAt: null, sourceName: null, filePath: '/a.md' }])
    await useStore.getState().initScout()
    expect(useStore.getState().scoutConversations).toHaveLength(1)
    expect(useStore.getState().scoutArticles).toHaveLength(1)
  })

  it('createScoutConversation 新建并选中', async () => {
    mockIpc.scoutCreateConversation.mockResolvedValue({ ...CONV, messages: [] })
    mockIpc.scoutListConversations.mockResolvedValue([CONV])
    await useStore.getState().createScoutConversation()
    expect(useStore.getState().scoutActiveConversationId).toBe('c1')
    expect(useStore.getState().scoutMessages).toEqual([])
  })

  it('selectScoutConversation 还原消息', async () => {
    mockIpc.scoutGetConversation.mockResolvedValue({ ...CONV, messages: [{ role: 'user', content: 'hi' }] })
    await useStore.getState().selectScoutConversation('c1')
    expect(useStore.getState().scoutMessages).toHaveLength(1)
  })

  it('renameScoutConversation 更新列表项', async () => {
    mockIpc.scoutListConversations.mockResolvedValue([CONV])
    await useStore.getState().initScout()
    mockIpc.scoutRenameConversation.mockResolvedValue({ ok: true })
    mockIpc.scoutListConversations.mockResolvedValue([{ ...CONV, title: '改名' }])
    await useStore.getState().renameScoutConversation('c1', '改名')
    expect(useStore.getState().scoutConversations[0].title).toBe('改名')
  })

  it('deleteScoutConversation 清空当前选中', async () => {
    mockIpc.scoutListConversations.mockResolvedValue([CONV])
    await useStore.getState().initScout()
    useStore.setState({ scoutActiveConversationId: 'c1', scoutMessages: [{ role: 'user', content: 'x' }] })
    mockIpc.scoutDeleteConversation.mockResolvedValue({ ok: true })
    mockIpc.scoutListConversations.mockResolvedValue([])
    await useStore.getState().deleteScoutConversation('c1')
    expect(useStore.getState().scoutActiveConversationId).toBeNull()
    expect(useStore.getState().scoutConversations).toHaveLength(0)
  })

  it('confirmScoutCandidates 标记已确认并发送结构化用户消息', async () => {
    useStore.setState({
      scoutActiveConversationId: 'c1',
      scoutMessages: [
        { role: 'user', content: '找文章' },
        { role: 'assistant', content: '候选', candidates: [
          { title: 'A', url: 'https://a', sourceName: 'a', reason: 'r', fetchable: true },
          { title: 'B', url: 'https://b', sourceName: 'b', reason: 'r', fetchable: true },
        ], candidatesResolved: false },
      ],
    })
    mockIpc.scoutSendMessage.mockResolvedValue(undefined)
    await useStore.getState().confirmScoutCandidates(['https://a'])
    const msgs = useStore.getState().scoutMessages
    expect(msgs[1].candidatesResolved).toBe(true)
    expect(msgs[2].role).toBe('user')
    expect(msgs[2].content).toContain('https://a')
    expect(mockIpc.scoutSendMessage).toHaveBeenCalledWith(expect.objectContaining({ conversationId: 'c1' }))
  })

  it('deleteScoutArticle 关闭打开的 reader 并刷新列表', async () => {
    mockIpc.scoutDeleteArticle.mockResolvedValue({ ok: true })
    mockIpc.scoutListArticles.mockResolvedValue([])
    useStore.setState({ scoutReaderFilePath: '/a.md', scoutArticles: [{ url: 'u', title: 't', summary: null, publishedAt: null, sourceName: null, filePath: '/a.md' }] })
    await useStore.getState().deleteScoutArticle('/a.md')
    expect(useStore.getState().scoutReaderFilePath).toBeNull()
    expect(useStore.getState().scoutArticles).toHaveLength(0)
  })
})
