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
    readMd: vi.fn().mockResolvedValue({ frontmatter: { title: 'x' }, body: '正文' }),
    readAssetAsDataUrl: vi.fn().mockRejectedValue(new Error('not found')),
    openExternal: vi.fn(),
    annotationsRead: vi.fn().mockResolvedValue([]),
    annotationsWrite: vi.fn().mockResolvedValue(undefined),
    articleAssistantReadGuide: vi.fn().mockResolvedValue({ guide: null }),
    articleAssistantReadSession: vi.fn().mockResolvedValue({ messages: [] }),
    articleAssistantWriteGuide: vi.fn().mockResolvedValue(undefined),
    articleAssistantWriteSession: vi.fn().mockResolvedValue(undefined),
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

  it('does not render its own swap painting button (centralized at page level)', () => {
    render(<AnthropicBlogPanel theme="academic" />)
    expect(screen.queryByTestId('anthropic-swap-painting-button')).not.toBeInTheDocument()
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

  it('mounts ArticleAssistantPanel at panel root when reader is open', async () => {
    useStore.setState({
      anthropicReaderFilePath: '/lib/Anthropic博客/x.md',
      anthropicReaderBody: '正文',
      anthropicReaderTitle: '标题',
    } as any)
    render(<AnthropicBlogPanel theme="academic" />)
    // ArticleAssistantPanel effect calls openAssistantSession synchronously via set(),
    // then loadAssistantGuide/loadAssistantSession async; the panel div appears once
    // contextId matches parentPath (set synchronously).
    await waitFor(() => {
      expect(screen.getByTestId('article-assistant-panel')).toBeInTheDocument()
    })
  })

  it('collapsed rail renders ALL filtered articles (no 10-item cap)', () => {
    const articles = Array.from({ length: 15 }, (_, i) => ({
      url: `https://a/${i}`, title: `T${i}`, publishedAt: null, summary: '',
      imageUrl: null, isSaved: false, filePath: null,
    }))
    useStore.setState({
      anthropicBlogCache: { articles, loading: false, error: null, lastFetchedAt: null },
      anthropicReaderFilePath: null, anthropicReaderBody: null, anthropicReaderTitle: null,
    } as any)
    render(<AnthropicBlogPanel theme="academic" />)
    fireEvent.click(screen.getByTestId('briefing-list-column-toggle'))
    // 15 篇网络文章 + 1 个本地置顶的宪法报告条目
    expect(screen.getAllByTestId('anthropic-list-rail-thumb')).toHaveLength(16)
  })

  it('collapsed rail marks saved articles with ember border', () => {
    useStore.setState({
      anthropicBlogCache: {
        articles: [
          { url: 'https://a/1', title: 'saved', publishedAt: null, summary: '', imageUrl: null, isSaved: true, filePath: '/x.md' },
          { url: 'https://a/2', title: 'plain', publishedAt: null, summary: '', imageUrl: null, isSaved: false, filePath: null },
        ],
        loading: false, error: null, lastFetchedAt: null,
      },
      anthropicReaderFilePath: null, anthropicReaderBody: null, anthropicReaderTitle: null,
    } as any)
    render(<AnthropicBlogPanel theme="academic" />)
    fireEvent.click(screen.getByTestId('briefing-list-column-toggle'))
    // 首位永远是宪法报告条目（isSaved 视觉），其后才是文章列表
    const [constitution, saved, plain] = screen.getAllByTestId('anthropic-list-rail-thumb')
    expect(constitution.className).toContain('border-ember')
    expect(saved.className).toContain('border-ember')
    expect(plain.className).not.toContain('border-ember')
  })

  it('does not mount ArticleAssistantPanel when no reader is open', () => {
    useStore.setState({ anthropicReaderFilePath: null, anthropicReaderBody: null, anthropicReaderTitle: null } as any)
    render(<AnthropicBlogPanel theme="academic" />)
    expect(screen.queryByTestId('article-assistant-panel')).not.toBeInTheDocument()
  })
})
