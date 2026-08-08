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
    collectionRead: vi.fn().mockResolvedValue({ version: 1, entries: [] }),
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

/** 网络文章标题列表（排除本地置顶的宪法报告条目） */
function webTitles(): (string | null | undefined)[] {
  return screen
    .getAllByTestId('anthropic-article-row')
    .filter((row) => !row.querySelector('[data-testid="anthropic-constitution-pill"]'))
    .map((row) => row.querySelector('[data-testid="anthropic-article-title"]')?.textContent)
}

/** 按 data-section 查找五源 chip */
function chip(key: string): HTMLElement {
  const el = screen.getAllByTestId('anthropic-section-chip').find((c) => c.getAttribute('data-section') === key)
  if (!el) throw new Error(`chip ${key} not found`)
  return el
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

  it('renders swap painting button in empty state (anthropic source has no page-level chrome)', () => {
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

  it('合并时间线按日期倒序渲染；All + 五源多选过滤状态机', () => {
    useStore.setState({
      anthropicBlogCache: {
        lastFetchedAt: null,
        articles: [
          { ...article('e1', 'Eng Old'), section: 'engineering', publishedAt: '2026-07-01T00:00:00.000Z' },
          { ...article('i1', 'Inst New'), section: 'institute', publishedAt: '2026-08-05T00:00:00.000Z' },
          { ...article('r1', 'Res Mid'), section: 'research', publishedAt: '2026-08-01T00:00:00.000Z' },
          { ...article('a1', 'Align Low'), section: 'alignment', publishedAt: '2026-06-01T00:00:00.000Z' },
        ],
        loading: false,
        error: null,
        sectionStatus: {},
      },
    } as any)
    render(<AnthropicBlogPanel theme="academic" />)

    // 初始 All：全源可见、All chip 高亮、五源 chip 全在（无 institute chip）
    expect(screen.getAllByTestId('anthropic-section-chip')).toHaveLength(5)
    expect(screen.getByTestId('anthropic-filter-all')).toHaveAttribute('aria-pressed', 'true')
    expect(webTitles()).toEqual(['Inst New', 'Res Mid', 'Eng Old', 'Align Low'])

    // 点 Research → 仅它亮（institute 遗留归组 research，仍在列表）
    fireEvent.click(chip('research'))
    expect(chip('research')).toHaveAttribute('aria-pressed', 'true')
    expect(chip('alignment')).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByTestId('anthropic-filter-all')).toHaveAttribute('aria-pressed', 'false')
    expect(webTitles()).toEqual(['Inst New', 'Res Mid'])

    // 再点 Alignment → 两个亮
    fireEvent.click(chip('alignment'))
    expect(chip('research')).toHaveAttribute('aria-pressed', 'true')
    expect(chip('alignment')).toHaveAttribute('aria-pressed', 'true')
    expect(webTitles()).toEqual(['Inst New', 'Res Mid', 'Align Low'])

    // 点灭两个 → 回 All
    fireEvent.click(chip('research'))
    expect(webTitles()).toEqual(['Align Low'])
    fireEvent.click(chip('alignment'))
    expect(screen.getByTestId('anthropic-filter-all')).toHaveAttribute('aria-pressed', 'true')
    expect(webTitles()).toEqual(['Inst New', 'Res Mid', 'Eng Old', 'Align Low'])
  })

  it('栏目失败时显示重试提示', () => {
    useStore.setState({
      anthropicBlogCache: {
        lastFetchedAt: null,
        articles: [article('e1', 'Eng')],
        loading: false,
        error: null,
        sectionStatus: { research: { fetchedAt: null, error: { code: 'parse-error', message: '解析页面失败' } } },
      },
    } as any)
    render(<AnthropicBlogPanel theme="academic" />)
    const banner = screen.getByTestId('anthropic-section-error')
    expect(banner).toHaveAttribute('data-section', 'research')
    expect(banner.textContent).toContain('Research')
    fireEvent.click(banner)
    expect(useStore.getState().discoverAnthropicArticles).toHaveBeenCalled()
  })

  it('constitution 条目经 filterGroupOf 归 engineering：只选 research 时隐藏，选 engineering 时显示', () => {
    useStore.setState({
      anthropicBlogCache: {
        lastFetchedAt: null,
        articles: [
          { ...article('r1', 'Res'), section: 'research' },
          { ...article('e1', 'Eng'), section: 'engineering' },
        ],
        loading: false,
        error: null,
        sectionStatus: {},
      },
    } as any)
    render(<AnthropicBlogPanel theme="academic" />)

    // 初始 All：宪法条目显示
    expect(screen.getByText("Claude's Constitution · 可视化双语读本")).toBeInTheDocument()

    // 只选 research → 宪法（engineering）隐藏
    fireEvent.click(chip('research'))
    expect(screen.queryByText("Claude's Constitution · 可视化双语读本")).not.toBeInTheDocument()

    // 加选 engineering → 宪法显示
    fireEvent.click(chip('engineering'))
    expect(screen.getByText("Claude's Constitution · 可视化双语读本")).toBeInTheDocument()
  })

  it('institute 遗留文章归 research：只选 research 时仍显示', () => {
    useStore.setState({
      anthropicBlogCache: {
        lastFetchedAt: null,
        articles: [
          { ...article('i1', 'Inst'), section: 'institute' },
          { ...article('e1', 'Eng'), section: 'engineering' },
        ],
        loading: false,
        error: null,
        sectionStatus: {},
      },
    } as any)
    render(<AnthropicBlogPanel theme="academic" />)

    expect(screen.getByText('Inst')).toBeInTheDocument()
    fireEvent.click(chip('research'))
    expect(screen.getByText('Inst')).toBeInTheDocument()
    expect(screen.queryByText('Eng')).not.toBeInTheDocument()
  })

  it('imageUrl 为 null 的行渲染占位块不崩（alignment/circuits 无封面）', () => {
    useStore.setState({
      anthropicBlogCache: {
        lastFetchedAt: null,
        articles: [
          { ...article('c1', 'Circuits'), section: 'alignment' },
          { ...article('p1', 'Product'), section: 'product' },
        ],
        loading: false,
        error: null,
        sectionStatus: {},
      },
    } as any)
    render(<AnthropicBlogPanel theme="academic" />)
    // 2 篇网络文章 + 1 个本地置顶宪法条目
    expect(screen.getAllByTestId('anthropic-article-row')).toHaveLength(3)
    expect(screen.getAllByText('无配图')).toHaveLength(2)
  })

  it('publishedAt 月初 ISO（2026-07-01）时 formatDate 正常显示', () => {
    useStore.setState({
      anthropicBlogCache: {
        lastFetchedAt: null,
        articles: [
          { ...article('e1', 'Eng'), section: 'engineering', publishedAt: '2026-07-01' },
        ],
        loading: false,
        error: null,
        sectionStatus: {},
      },
    } as any)
    render(<AnthropicBlogPanel theme="academic" />)
    expect(screen.queryByText('未知日期')).not.toBeInTheDocument()
    expect(screen.getByText(/2026年/)).toBeInTheDocument()
  })

  it('AnthropicArticleRow 色签对五源 + institute 遗留值都取到 label/color', () => {
    useStore.setState({
      anthropicBlogCache: {
        lastFetchedAt: null,
        articles: [
          { ...article('e1', 'Eng'), section: 'engineering' },
          { ...article('i1', 'Inst'), section: 'institute' },
          { ...article('r1', 'Res'), section: 'research' },
          { ...article('a1', 'Align'), section: 'alignment' },
        ],
        loading: false,
        error: null,
        sectionStatus: {},
      },
    } as any)
    render(<AnthropicBlogPanel theme="academic" />)
    const tags = screen.getAllByTestId('anthropic-section-tag')
    const labels = tags.map((t) => t.textContent)
    expect(labels).toEqual(expect.arrayContaining(['Engineering', 'Institute', 'Research', 'Alignment']))
    // institute 色签走 LEGACY_SECTION_META
    const instTag = tags.find((t) => t.textContent === 'Institute')!
    expect(instTag).toHaveStyle({ color: '#8a9a5b' })
  })
})
