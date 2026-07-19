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
  toggleAssistantSocratic: vi.fn(),
  cycleAssistantThinkingEffort: vi.fn(),
  setAssistantSelection: vi.fn(),
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
    searchError: null,
    chatError: null,
    retryContext: null,
    pendingSelection: undefined,
    isOpen: true,
    ...overrides,
  }
}

function mockStore(session: AssistantSession | null, globals: Record<string, unknown> = {}) {
  const fullState = {
    assistantSession: session,
    assistantSearchEnabled: false,
    assistantSocraticMode: true,
    assistantThinkingEffort: 'off' as const,
    ...globals,
    ...actions,
  }
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

  it('disables all three toggle buttons while streaming', () => {
    mockStore(baseSession({ streaming: true }))
    render(<ChatWindow />)
    expect(screen.getByTestId('article-assistant-search-btn')).toBeDisabled()
    expect(screen.getByTestId('article-assistant-socratic-btn')).toBeDisabled()
    expect(screen.getByTestId('article-assistant-thinking-btn')).toBeDisabled()
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

  it('renders search button in off state with gray color', () => {
    mockStore(baseSession(), { assistantSearchEnabled: false })
    render(<ChatWindow />)
    const btn = screen.getByTestId('article-assistant-search-btn')
    expect(btn.className).toContain('text-parchment/40')
    expect(btn.className).not.toContain('text-sky-400')
  })

  it('renders search button in on state with blue color', () => {
    mockStore(baseSession(), { assistantSearchEnabled: true })
    render(<ChatWindow />)
    const btn = screen.getByTestId('article-assistant-search-btn')
    expect(btn.className).toContain('text-sky-400')
  })

  it('sending delegates search state to the store (single-argument send)', () => {
    mockStore(baseSession(), { assistantSearchEnabled: true })
    render(<ChatWindow />)
    fireEvent.change(screen.getByTestId('article-assistant-input'), { target: { value: '问题' } })
    fireEvent.click(screen.getByTestId('article-assistant-send-btn'))
    expect(actions.sendAssistantMessage).toHaveBeenCalledWith('问题')
  })

  it('reflects socratic and thinking global state and calls their actions', () => {
    mockStore(baseSession(), { assistantSocraticMode: false, assistantThinkingEffort: 'max' })
    render(<ChatWindow />)
    const socratic = screen.getByTestId('article-assistant-socratic-btn')
    const thinking = screen.getByTestId('article-assistant-thinking-btn')
    expect(socratic).toHaveAttribute('aria-pressed', 'false')
    expect(socratic.className).toContain('text-parchment/40')
    expect(thinking.className).toContain('text-sky-400')
    expect(thinking.textContent).toContain('MAX')

    fireEvent.click(socratic)
    expect(actions.toggleAssistantSocratic).toHaveBeenCalledTimes(1)
    fireEvent.click(thinking)
    expect(actions.cycleAssistantThinkingEffort).toHaveBeenCalledTimes(1)
  })

  it('clamps dragging so the title bar drag handle never leaves the viewport', () => {
    mockStore(baseSession())
    const { container } = render(<ChatWindow />)
    const win = screen.getByTestId('article-assistant-chat-window')
    vi.spyOn(win, 'getBoundingClientRect').mockReturnValue({
      left: 400, top: 300, width: 340, height: 260,
      right: 740, bottom: 560, x: 400, y: 300, toJSON: () => ({}),
    } as DOMRect)
    const titleBar = container.querySelector('.cursor-move') as HTMLElement
    titleBar.setPointerCapture = vi.fn()
    titleBar.releasePointerCapture = vi.fn()

    fireEvent.pointerDown(titleBar, { clientX: 420, clientY: 320, pointerId: 1 })

    // 向上拖出视口（用户实际场景：拖到 Electron 原生标题栏位置松手）
    // —— 标题栏是唯一拖拽把手，top 不允许为负，否则永远无法再拖回来
    fireEvent.pointerMove(window, { clientX: 420, clientY: -100 })
    expect(win.style.top).toBe('0px')

    // 向下拖出视口 —— 至少保留标题栏可点
    fireEvent.pointerMove(window, { clientX: 420, clientY: 3000 })
    expect(win.style.top).toBe(`${window.innerHeight - 40}px`)

    // 向左拖出视口 —— 保留 80px 可抓取区域（窗口宽 340 → 最小 left = -260）
    fireEvent.pointerMove(window, { clientX: -500, clientY: 320 })
    expect(win.style.left).toBe('-260px')

    fireEvent.pointerUp(window)
  })
})
