import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import type { AssistantSession } from '@/store'
import * as storeModule from '@/store'
import { ChatWindow } from '@/components/article-assistant/ChatWindow'

vi.mock('@/store', () => ({
  useStore: vi.fn(),
}))

const actions = {
  sendAssistantMessage: vi.fn(),
  retryAssistantMessage: vi.fn(),
  abortAssistantStream: vi.fn(),
  toggleAssistantOpen: vi.fn(),
  toggleAssistantSearch: vi.fn(),
}

function baseSession(overrides: Partial<AssistantSession> = {}): AssistantSession {
  return {
    contextId: '/lib/夜航简报-2026-07-11.md',
    contextType: 'briefing',
    articleTitle: '夜航简报',
    articleContent: '文章正文',
    guide: null,
    guideLoading: false,
    guideError: null,
    messages: [],
    streaming: false,
    abortId: 'abort-1',
    searchLoading: false,
    searchEnabled: false,
    searchError: null,
    chatError: null,
    retryContext: null,
    pendingSelection: undefined,
    isOpen: true,
    ...overrides,
  }
}

function mockStore(session: AssistantSession | null) {
  const fullState = { assistantSession: session, ...actions }
  ;(storeModule.useStore as unknown as ReturnType<typeof vi.fn>).mockImplementation(
    (selector: (s: typeof fullState) => unknown) => selector(fullState)
  )
}

describe('ChatWindow', () => {
  beforeEach(() => {
    cleanup()
    vi.clearAllMocks()
  })

  it('renders the chat window and selection quote block when open with a pending selection', () => {
    mockStore(baseSession({ pendingSelection: 'selected text' }))
    render(<ChatWindow />)
    expect(screen.getByTestId('article-assistant-chat-window')).toBeInTheDocument()
    expect(screen.getByText('你选中了：')).toBeInTheDocument()
    expect(screen.getByText(/selected text/)).toBeInTheDocument()
  })

  it('renders nothing when the session is closed', () => {
    mockStore(baseSession({ isOpen: false }))
    const { container } = render(<ChatWindow />)
    expect(container).toBeEmptyDOMElement()
    expect(screen.queryByTestId('article-assistant-chat-window')).not.toBeInTheDocument()
  })

  it('renders nothing when there is no session', () => {
    mockStore(null)
    const { container } = render(<ChatWindow />)
    expect(container).toBeEmptyDOMElement()
  })

  it('disables the search button while a search is loading', () => {
    mockStore(baseSession({ searchLoading: true }))
    render(<ChatWindow />)
    expect(screen.getByTestId('article-assistant-search-btn')).toBeDisabled()
  })

  it('shows the send button (not stop) when not streaming', () => {
    mockStore(baseSession({ streaming: false }))
    render(<ChatWindow />)
    expect(screen.getByTestId('article-assistant-send-btn')).toBeInTheDocument()
    expect(screen.queryByTestId('article-assistant-stop-btn')).not.toBeInTheDocument()
  })

  it('shows the stop button (not send) while streaming', () => {
    mockStore(baseSession({ streaming: true }))
    render(<ChatWindow />)
    expect(screen.getByTestId('article-assistant-stop-btn')).toBeInTheDocument()
    expect(screen.queryByTestId('article-assistant-send-btn')).not.toBeInTheDocument()
  })

  it('renders the searched-sources count for an assistant message', () => {
    mockStore(
      baseSession({
        messages: [
          {
            role: 'assistant',
            content: '这是回复',
            searchSources: [
              { title: 'A', url: 'https://a.example', snippet: 's1' },
              { title: 'B', url: 'https://b.example', snippet: 's2' },
              { title: 'C', url: 'https://c.example', snippet: 's3' },
            ],
          },
        ],
      })
    )
    render(<ChatWindow />)
    expect(screen.getByText('已搜索 3 个来源')).toBeInTheDocument()
  })

  it('renders search button in off state without ember background', () => {
    mockStore(baseSession({ searchEnabled: false }))
    render(<ChatWindow />)
    const btn = screen.getByTestId('article-assistant-search-btn')
    expect(btn.className).not.toContain('bg-ember')
  })

  it('renders search button in on state with ember background', () => {
    mockStore(baseSession({ searchEnabled: true }))
    render(<ChatWindow />)
    const btn = screen.getByTestId('article-assistant-search-btn')
    expect(btn.className).toContain('bg-ember')
  })

  it('clicking search button toggles search mode without sending', () => {
    mockStore(baseSession({ searchEnabled: false }))
    render(<ChatWindow />)
    fireEvent.click(screen.getByTestId('article-assistant-search-btn'))
    expect(actions.toggleAssistantSearch).toHaveBeenCalledTimes(1)
    expect(actions.sendAssistantMessage).not.toHaveBeenCalled()
  })

  it('sending uses the current searchEnabled state', () => {
    mockStore(baseSession({ searchEnabled: true }))
    render(<ChatWindow />)
    fireEvent.change(screen.getByTestId('article-assistant-input'), { target: { value: '问题' } })
    fireEvent.click(screen.getByTestId('article-assistant-send-btn'))
    expect(actions.sendAssistantMessage).toHaveBeenCalledWith('问题', true)
  })
})
