import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'

const storeState: any = {
  scoutTab: 'chat',
  scoutConversations: [{ id: 'c1', title: '2026-08-02 15:04', createdAt: '', updatedAt: '', filePath: '' }],
  scoutActiveConversationId: null,
  scoutMessages: [],
  scoutStreaming: false,
  scoutArticles: [],
  scoutReaderFilePath: null,
  scoutReaderBody: null,
  scoutReaderTitle: null,
  setScoutTab: vi.fn(),
  initScout: vi.fn(),
  createScoutConversation: vi.fn(),
  selectScoutConversation: vi.fn(),
  renameScoutConversation: vi.fn(),
  deleteScoutConversation: vi.fn(),
  sendScoutMessage: vi.fn(),
  confirmScoutCandidates: vi.fn(),
  openScoutReader: vi.fn(),
  briefingFontSize: 'base',
}
vi.mock('@/store', () => ({ useStore: (sel: any) => sel(storeState) }))
vi.mock('@/lib/ipc', () => ({ ipc: {} }))

import { ScoutPanel } from '@/components/scout/ScoutPanel'

beforeEach(() => {
  cleanup()
  storeState.scoutTab = 'chat'
  storeState.scoutMessages = []
  storeState.scoutReaderFilePath = null
  storeState.scoutActiveConversationId = null
  storeState.scoutArticles = []
  vi.clearAllMocks()
})

describe('ScoutPanel', () => {
  it('聊天 Tab：显示对话列表与新建按钮', () => {
    render(<ScoutPanel />)
    expect(screen.getByTestId('scout-tab-chat')).toBeInTheDocument()
    expect(screen.getByTestId('scout-new-conversation')).toBeInTheDocument()
    expect(screen.getByText('2026-08-02 15:04')).toBeInTheDocument()
  })

  it('切到文章 Tab：显示文章列表', () => {
    storeState.scoutTab = 'articles'
    storeState.scoutArticles = [{ url: 'u', title: 'The Second Half', summary: 's', publishedAt: null, sourceName: 'a.com', filePath: '/a.md' }]
    render(<ScoutPanel />)
    expect(screen.getByTestId('scout-tab-articles')).toBeInTheDocument()
    expect(screen.getByText('The Second Half')).toBeInTheDocument()
  })

  it('新建对话按钮触发 createScoutConversation', () => {
    render(<ScoutPanel />)
    fireEvent.click(screen.getByTestId('scout-new-conversation'))
    expect(storeState.createScoutConversation).toHaveBeenCalled()
  })

  it('候选卡片：不可抓取灰显不可选，确认按钮发送选中', () => {
    storeState.scoutActiveConversationId = 'c1'
    storeState.scoutMessages = [{
      role: 'assistant', content: '候选如下',
      candidates: [
        { title: '可抓', url: 'https://ok', sourceName: 'ok', reason: 'r', fetchable: true },
        { title: '不可抓', url: 'https://no', sourceName: 'no', reason: 'r', fetchable: false, failReason: '站点拒绝访问' },
      ],
      candidatesResolved: false,
    }]
    render(<ScoutPanel />)
    const bad = screen.getByTestId('scout-candidate-1')
    expect(bad).toHaveAttribute('aria-disabled', 'true')
    expect(screen.getByText(/站点拒绝访问/)).toBeInTheDocument()
    fireEvent.click(screen.getByTestId('scout-candidate-0'))
    fireEvent.click(screen.getByTestId('scout-confirm-candidates'))
    expect(storeState.confirmScoutCandidates).toHaveBeenCalledWith(['https://ok'])
  })

  it('candidatesResolved 后卡片不再可交互', () => {
    storeState.scoutActiveConversationId = 'c1'
    storeState.scoutMessages = [{
      role: 'assistant', content: '候选如下',
      candidates: [{ title: 'A', url: 'https://a', sourceName: 'a', reason: 'r', fetchable: true }],
      candidatesResolved: true,
    }]
    render(<ScoutPanel />)
    expect(screen.queryByTestId('scout-confirm-candidates')).not.toBeInTheDocument()
  })
})
