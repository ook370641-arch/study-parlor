import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'

const mockIpc = { collectionAddEntry: vi.fn() }
vi.mock('@/lib/ipc', () => ({ ipc: new Proxy({}, { get: (_, k) => mockIpc[k as keyof typeof mockIpc] ?? (() => Promise.resolve()) }) }))

import { useStore } from '@/store'
import { ArticleBodyChunks } from '@/components/article-assistant/ArticleBodyChunks'

const ARTICLE = '## AI Safety\n宪法式 AI 用书面原则约束模型。\n\n## Training Data\n训练数据的去重与过滤。'
const CHUNKS = [
  { heading: 'AI Safety', summary: 's0', terms: [] },
  { heading: 'Training Data', summary: 's1', terms: [] },
]

function seedSession() {
  useStore.setState({
    assistantSession: {
      contextId: '/lib/夜航简报/夜航简报-2026-08-04.md',
      contextType: 'briefing',
      articleContent: ARTICLE,
      guide: { background: 'bg', chunks: CHUNKS },
      guideLoading: false, guideError: null, messages: [], streaming: false,
      abortId: '', searchLoading: false, searchError: null, chatError: null,
      retryContext: null, isOpen: true, activeChunkIndex: null,
    } as never,
    collection: { entries: [], loaded: true },
  })
}

beforeEach(() => {
  cleanup()
  vi.clearAllMocks()
  useStore.setState({ assistantSession: null, collection: { entries: [], loaded: false } })
})

describe('chunk collect button', () => {
  it('collectible 时每块铭牌行渲染未收藏按钮', () => {
    seedSession()
    render(<ArticleBodyChunks content={ARTICLE} chunks={CHUNKS} fileName="b.md" collectible />)
    expect(screen.getByTestId('chunk-collect-button-0')).toHaveTextContent('收入精选集')
    expect(screen.getByTestId('chunk-collect-button-1')).toHaveTextContent('收入精选集')
  })

  it('点击后调用 collectChunk 并变已收藏禁用', async () => {
    seedSession()
    mockIpc.collectionAddEntry.mockResolvedValue({ ok: true })
    render(<ArticleBodyChunks content={ARTICLE} chunks={CHUNKS} fileName="b.md" collectible />)
    fireEvent.click(screen.getByTestId('chunk-collect-button-0'))
    await vi.waitFor(() =>
      expect(screen.getByTestId('chunk-collect-button-0')).toHaveTextContent('已收藏')
    )
    expect(screen.getByTestId('chunk-collect-button-0')).toBeDisabled()
    expect(mockIpc.collectionAddEntry).toHaveBeenCalled()
  })

  it('已收藏条目（来自持久化）渲染已收藏禁用态', () => {
    seedSession()
    useStore.setState({
      collection: {
        loaded: true,
        entries: [{
          id: 'c-1', briefingFilePath: '/lib/夜航简报/夜航简报-2026-08-04.md', briefingDate: '2026-08-04',
          chunkHeading: 'AI Safety', chunkIndex: 0, chunkBody: 'x',
          guide: { summary: 's0', terms: [] }, qa: [], qaMessageCount: 0,
          collectedAt: 't', updatedAt: 't',
        }],
      },
    })
    render(<ArticleBodyChunks content={ARTICLE} chunks={CHUNKS} fileName="b.md" collectible />)
    expect(screen.getByTestId('chunk-collect-button-0')).toBeDisabled()
    expect(screen.getByTestId('chunk-collect-button-1')).toBeEnabled()
  })

  it('collectible 缺省/false 时不渲染按钮（Anthropic/拾贝路径）', () => {
    seedSession()
    render(<ArticleBodyChunks content={ARTICLE} chunks={CHUNKS} fileName="b.md" />)
    expect(screen.queryByTestId('chunk-collect-button-0')).toBeNull()
  })

  it('已收藏条目 heading 与当前块不匹配（源重生成）时按钮可点', () => {
    seedSession()
    useStore.setState({
      collection: {
        loaded: true,
        entries: [{
          id: 'c-1', briefingFilePath: '/lib/夜航简报/夜航简报-2026-08-04.md', briefingDate: '2026-08-04',
          chunkHeading: '旧内容标题', chunkIndex: 0, chunkBody: 'x',
          guide: { summary: 's0', terms: [] }, qa: [], qaMessageCount: 0,
          collectedAt: 't', updatedAt: 't',
        }],
      },
    })
    render(<ArticleBodyChunks content={ARTICLE} chunks={CHUNKS} fileName="b.md" collectible />)
    expect(screen.getByTestId('chunk-collect-button-0')).toBeEnabled()
  })
})
