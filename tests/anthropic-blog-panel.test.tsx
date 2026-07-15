import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react'

vi.mock('@/lib/ipc', () => ({
  ipc: {
    patchState: vi.fn(),
    getState: vi.fn(),
    scanLibrary: vi.fn(),
    loadGroups: vi.fn(),
    loadSessions: vi.fn(),
    anthropicDiscover: vi.fn(() => Promise.resolve({ ok: true, lastFetchedAt: null, articles: [] })),
    anthropicImportArticle: vi.fn(),
    readMd: vi.fn(),
  },
}))

vi.mock('@/lib/paintings', () => ({
  manifest: [],
  pickRandom: vi.fn(() => null),
  formatAttribution: vi.fn(() => ''),
}))

import { useStore } from '@/store'
import { AnthropicBlogPanel } from '@/components/anthropic/AnthropicBlogPanel'

function article(url: string, title: string) {
  return { url, title, summary: null, publishedAt: null, imageUrl: null }
}

describe('AnthropicBlogPanel', () => {
  beforeEach(() => {
    cleanup()
    useStore.setState({
      anthropicBlogCache: {
        lastFetchedAt: null,
        articles: [article('old-1', 'Old Article')],
        loading: false,
        error: null,
      },
      anthropicReaderFilePath: null,
      discoverAnthropicArticles: vi.fn().mockResolvedValue({
        ok: true,
        lastFetchedAt: new Date().toISOString(),
        articles: [article('old-1', 'Old Article')],
      }),
      mergeAnthropicArticles: vi.fn(),
      closeAnthropicReader: vi.fn(),
    } as any)
  })

  it('renders BriefingListColumn shell', () => {
    render(<AnthropicBlogPanel theme="academic" />)
    expect(screen.getByTestId('briefing-list-column')).toBeInTheDocument()
  })

  it('renders the swap painting button in the empty state (no article open)', () => {
    render(<AnthropicBlogPanel theme="academic" />)
    expect(screen.getByTestId('anthropic-swap-painting-button')).toBeInTheDocument()
  })

  it('toggles collapsed rail and shows thumbnails', () => {
    render(<AnthropicBlogPanel theme="academic" />)
    const toggle = screen.getByTestId('briefing-list-column-toggle')
    fireEvent.click(toggle)
    expect(screen.getByTestId('briefing-list-column')).toHaveClass('w-14')
    expect(screen.getAllByTestId('anthropic-list-rail-thumb').length).toBeGreaterThan(0)
  })

  it('shows new articles prompt after auto-detect finds new articles', async () => {
    const discover = vi.fn().mockResolvedValue({
      ok: true,
      lastFetchedAt: new Date().toISOString(),
      articles: [article('new-1', 'New Article'), article('old-1', 'Old Article')],
    })
    const merge = vi.fn()
    useStore.setState({ discoverAnthropicArticles: discover, mergeAnthropicArticles: merge } as any)

    render(<AnthropicBlogPanel theme="academic" />)

    await waitFor(() => {
      expect(screen.getByTestId('anthropic-new-articles-prompt')).toBeInTheDocument()
    })
    expect(screen.getByText(/发现 1 篇新文章/)).toBeInTheDocument()
  })

  it('clicking refresh prompt merges new articles', async () => {
    const lastFetchedAt = new Date().toISOString()
    const discover = vi.fn().mockResolvedValue({
      ok: true,
      lastFetchedAt,
      articles: [article('new-1', 'New Article'), article('old-1', 'Old Article')],
    })
    const merge = vi.fn()
    useStore.setState({ discoverAnthropicArticles: discover, mergeAnthropicArticles: merge } as any)

    render(<AnthropicBlogPanel theme="academic" />)
    await waitFor(() => screen.getByTestId('anthropic-new-articles-prompt'))
    fireEvent.click(screen.getByTestId('anthropic-new-articles-prompt'))

    expect(merge).toHaveBeenCalledWith([article('new-1', 'New Article')], lastFetchedAt)
  })
})
