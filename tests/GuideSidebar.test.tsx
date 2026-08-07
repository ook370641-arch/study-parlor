import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import type { AssistantSession } from '@/store'
import * as storeModule from '@/store'
import { GuideSidebar } from '../src/components/article-assistant/GuideSidebar'

vi.mock('@/store', () => ({
  useStore: vi.fn(),
}))

function mockStore(session: AssistantSession | null) {
  const fullState = {
    assistantSession: session,
    setAssistantActiveChunk: vi.fn(),
    guideScrollToChunkIndex: null,
    setGuideScrollToChunk: vi.fn(),
    generateAssistantGuide: vi.fn(),
  }
  ;(storeModule.useStore as unknown as ReturnType<typeof vi.fn>).mockImplementation(
    (selector: (s: typeof fullState) => unknown) => selector(fullState)
  )
  return fullState
}

function sessionWithGuide(): AssistantSession {
  return {
    contextId: '/lib/夜航简报-2026-07-11.md',
    contextType: 'briefing',
    articleTitle: '夜航简报',
    articleContent: '文章正文',
    guide: {
      background: '背景介绍',
      chunks: [
        {
          heading: '第一节',
          summary: '本节摘要',
          terms: [{ term: 'term', translation: '术语', explanation: '解释' }],
        },
      ],
    },
    guideLoading: false,
    guideProgress: null,
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
    activeChunkIndex: null,
  } as AssistantSession
}

describe('GuideSidebar', () => {
  beforeEach(() => {
    cleanup()
    vi.clearAllMocks()
  })

  it('renders without swap button', () => {
    mockStore(null)
    render(<GuideSidebar />)
    expect(screen.queryByTestId('swap-painting-button')).not.toBeInTheDocument()
    expect(screen.queryByTestId('briefing-swap-painting-button')).not.toBeInTheDocument()
  })

  it('derives guide font sizes from the body font CSS variable so they track reader font changes', () => {
    mockStore(sessionWithGuide())
    render(<GuideSidebar />)

    // 导读正文级（chunk 卡片：§标题 + 摘要）恒比正文小 1 档（正文档位步进 2px）
    const chunk = screen.getByTestId('guide-chunk')
    expect(chunk.style.fontSize).toBe('calc(var(--briefing-body-size, 19px) - 2px)')

    // 术语级再小 1 档（比正文小 2 档），维持导读内部梯度
    const term = screen.getByTestId('guide-term')
    expect(term.style.fontSize).toBe('calc(var(--briefing-body-size, 19px) - 4px)')
  })

  it('renders chunk context (v2) when present, falling back to summary', () => {
    const s = sessionWithGuide()
    s.guide = {
      background: '背景',
      chunks: [
        { heading: '一', context: '背景铺陈文字', terms: [] },
        { heading: '二', summary: '旧摘要文字', terms: [] },
      ],
    }
    mockStore(s)
    render(<GuideSidebar />)
    expect(screen.getByText('背景铺陈文字')).toBeInTheDocument()
    expect(screen.getByText('旧摘要文字')).toBeInTheDocument()
  })

  it('shows searching progress text and progress bar while generating', () => {
    const s = sessionWithGuide()
    s.guide = null
    s.guideLoading = true
    s.guideProgress = { stage: 'searching', done: 1, total: 2 }
    mockStore(s)
    render(<GuideSidebar />)
    const el = screen.getByTestId('guide-progress')
    expect(el).toHaveTextContent('检索背景资料中… 1/2')
  })

  it('shows writing progress with entry counter and char count', () => {
    const s = sessionWithGuide()
    s.guide = null
    s.guideLoading = true
    s.guideProgress = { stage: 'writing', chars: 860, entriesDone: 2, entriesTotal: 14 }
    mockStore(s)
    render(<GuideSidebar />)
    expect(screen.getByTestId('guide-progress')).toHaveTextContent('撰写导读中… §2/§14 · 已写 860 字')
  })

  it('renders progress under newspaper theme too', () => {
    const s = sessionWithGuide()
    s.guide = null
    s.guideLoading = true
    s.guideProgress = { stage: 'planning' }
    mockStore(s)
    render(<GuideSidebar theme="newspaper" />)
    expect(screen.getByTestId('guide-progress')).toHaveTextContent('规划检索中…')
  })

  it('uses ember accent on the stage keyword in progress text', () => {
    const s = sessionWithGuide()
    s.guide = null
    s.guideLoading = true
    s.guideProgress = { stage: 'writing', chars: 860, entriesDone: 2, entriesTotal: 14 }
    mockStore(s)
    render(<GuideSidebar />)
    const progress = screen.getByTestId('guide-progress')
    const emberSpan = progress.querySelector('span.text-ember')
    expect(emberSpan).not.toBeNull()
    expect(emberSpan!.textContent).toBe('撰写导读中…')
  })

  it('renders guide error with a retry button that regenerates the guide', () => {
    const s = sessionWithGuide()
    s.guide = null
    s.guideLoading = false
    s.guideError = 'GUIDE_JSON_ERROR'
    const state = mockStore(s)
    render(<GuideSidebar />)
    expect(screen.getByText('未能生成导读，可继续阅读原文。')).toBeInTheDocument()
    screen.getByTestId('guide-retry').click()
    expect(state.generateAssistantGuide).toHaveBeenCalledTimes(1)
  })
})
