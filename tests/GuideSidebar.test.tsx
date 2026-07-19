import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import type { AssistantSession } from '@/store'
import * as storeModule from '@/store'
import { GuideSidebar } from '../src/components/article-assistant/GuideSidebar'

vi.mock('@/store', () => ({
  useStore: vi.fn(),
}))

function mockStore(session: AssistantSession | null) {
  const fullState = { assistantSession: session, setAssistantActiveChunk: vi.fn() }
  ;(storeModule.useStore as unknown as ReturnType<typeof vi.fn>).mockImplementation(
    (selector: (s: typeof fullState) => unknown) => selector(fullState)
  )
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
})
