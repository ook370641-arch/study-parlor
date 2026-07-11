import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react'

vi.mock('@/lib/ipc', () => ({
  ipc: {
    patchState: vi.fn(),
    getState: vi.fn(),
    scanLibrary: vi.fn(),
    loadGroups: vi.fn(),
    loadSessions: vi.fn(),
    llmWildcardInspiration: vi.fn(),
    briefingGenerate: vi.fn(),
    onBriefingProgress: vi.fn(() => () => {}),
    briefingList: vi.fn(),
    searchPrepare: vi.fn(),
  },
}))

vi.mock('@/lib/paintings', () => ({
  manifest: [],
  pickRandom: vi.fn(() => null),
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

  it('hides list and shows expand handle when hide button clicked', () => {
    render(<AnthropicBlogPanel theme="academic" />)
    // Hide button exists initially
    expect(screen.getByTestId('anthropic-list-hide-button')).toBeInTheDocument()
    expect(screen.queryByTestId('anthropic-list-expand-handle')).not.toBeInTheDocument()
    fireEvent.click(screen.getByTestId('anthropic-list-hide-button'))
    // After hiding, expand handle appears
    expect(screen.getByTestId('anthropic-list-expand-handle')).toBeInTheDocument()
  })

  it('expands list when handle clicked', () => {
    render(<AnthropicBlogPanel theme="academic" />)
    fireEvent.click(screen.getByTestId('anthropic-list-hide-button'))
    expect(screen.getByTestId('anthropic-list-expand-handle')).toBeInTheDocument()
    fireEvent.click(screen.getByTestId('anthropic-list-expand-handle'))
    // After expanding, hide button is back and expand handle is gone
    expect(screen.getByTestId('anthropic-list-hide-button')).toBeInTheDocument()
    expect(screen.queryByTestId('anthropic-list-expand-handle')).not.toBeInTheDocument()
  })

  it('shows new articles prompt after auto-detect finds new articles', async () => {
    const discover = vi.fn().mockResolvedValue({
      ok: true,
      lastFetchedAt: new Date().toISOString(),
      articles: [
        article('new-1', 'New Article'),
        article('old-1', 'Old Article'),
      ],
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
