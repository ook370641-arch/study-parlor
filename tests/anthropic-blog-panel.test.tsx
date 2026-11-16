import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, cleanup, fireEvent, waitFor, within } from '@testing-library/react'

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
    anthropicCollectionRead: vi.fn().mockResolvedValue({ ok: true, collection: { version: 1, entries: [], dismissed: [], history: [], read: [] } }),
    anthropicCollectionAdd: vi.fn().mockResolvedValue({ ok: true, collection: { version: 1, entries: [], dismissed: [], history: [], read: [] } }),
    anthropicCollectionRemove: vi.fn().mockResolvedValue({ ok: true, collection: { version: 1, entries: [], dismissed: [], history: [], read: [] } }),
    anthropicCollectionMarkRead: vi.fn().mockResolvedValue({ ok: true, collection: { version: 1, entries: [], dismissed: [], history: [], read: [{ sourceUrl: 'old-1', title: 'Old Article', filePath: 'lib/old-1.md', readAt: 'x' }] } }),
    anthropicCollectionRemoveRead: vi.fn().mockResolvedValue({ ok: true, collection: { version: 1, entries: [], dismissed: [], history: [], read: [] } }),
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

/** 按来源查找第二列 chip */
function chip(key: string): HTMLElement {
  return screen.getByTestId(`list-source-${key}`)
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

  it('第二列与专辑墙的视图和来源筛选分别作用于自己的文章', () => {
    render(<AnthropicBlogPanel theme="academic" />)

    fireEvent.click(screen.getByTestId('wall-view-all'))
    expect(screen.getByTestId('blog-wall-card-old-1')).toBeInTheDocument()
    expect(screen.queryByTestId('anthropic-article-row')).not.toBeInTheDocument()
    expect(screen.getByTestId('list-view-mine')).toHaveAttribute('aria-pressed', 'true')

    fireEvent.click(screen.getByTestId('list-view-all'))
    expect(screen.getAllByTestId('anthropic-article-row').length).toBeGreaterThan(0)
    fireEvent.click(screen.getByTestId('wall-source-research'))
    expect(screen.queryByTestId('blog-wall-card-old-1')).not.toBeInTheDocument()
    expect(screen.getAllByTestId('anthropic-article-row').length).toBeGreaterThan(0)
    expect(screen.getByTestId('list-source-all')).toHaveAttribute('aria-pressed', 'true')
  })

  it('我的三组同屏，来源筛选同时过滤已保存、已读和收藏', () => {
    useStore.setState({
      anthropicBlogCache: {
        lastFetchedAt: null,
        articles: [
          { ...article('saved', 'Saved'), section: 'engineering', isSaved: true, filePath: 'saved.md' },
          { ...article('read', 'Read'), section: 'engineering', isSaved: true, filePath: 'read.md' },
          { ...article('favorite', 'Favorite'), section: 'research', isSaved: true, filePath: 'favorite.md' },
        ],
        loading: false,
        error: null,
      },
      blogCollection: {
        version: 1,
        entries: [{ sourceUrl: 'favorite', filePath: 'favorite.md', title: 'Favorite', addedAt: 'x', origin: 'manual' }],
        dismissed: [],
        history: [],
        read: [{ sourceUrl: 'read', filePath: 'read.md', title: 'Read', readAt: 'x' }],
        order: { groups: ['saved', 'read', 'favorite'], saved: ['saved'], read: ['read'], favorite: ['favorite'] },
      },
    } as any)
    render(<AnthropicBlogPanel theme="academic" />)

    expect(screen.getByTestId('blog-saved-card-saved')).toBeInTheDocument()
    expect(screen.getByTestId('blog-read-card-read')).toBeInTheDocument()
    expect(screen.getByTestId('blog-favorite-card-favorite')).toBeInTheDocument()
    fireEvent.click(screen.getByTestId('list-source-research'))
    expect(screen.queryByTestId('blog-saved-card-saved')).not.toBeInTheDocument()
    expect(screen.queryByTestId('blog-read-card-read')).not.toBeInTheDocument()
    expect(screen.getByTestId('blog-favorite-card-favorite')).toBeInTheDocument()

    fireEvent.click(screen.getByTestId('list-view-all'))
    expect(screen.queryByTestId('blog-collection-section')).not.toBeInTheDocument()
    expect(screen.getByTestId('anthropic-article-row')).toBeInTheDocument()
  })

  it('专辑墙三组使用独立筛选与折叠，并复用共享排序 action', () => {
    const reorderBlog = vi.fn()
    useStore.setState({
      anthropicBlogCache: {
        lastFetchedAt: null,
        articles: [
          { ...article('saved', 'Saved'), section: 'engineering', isSaved: true, filePath: 'saved.md' },
          { ...article('read', 'Read'), section: 'engineering', isSaved: true, filePath: 'read.md' },
          { ...article('favorite', 'Favorite'), section: 'research', isSaved: true, filePath: 'favorite.md' },
        ],
        loading: false,
        error: null,
      },
      blogCollection: {
        version: 1,
        entries: [{ sourceUrl: 'favorite', filePath: 'favorite.md', title: 'Favorite', addedAt: 'x', origin: 'manual' }],
        dismissed: [], history: [],
        read: [{ sourceUrl: 'read', filePath: 'read.md', title: 'Read', readAt: 'x' }],
        order: { groups: ['saved', 'read', 'favorite'], saved: ['saved'], read: ['read'], favorite: ['favorite'] },
      },
      reorderBlog,
    } as any)
    render(<AnthropicBlogPanel theme="academic" />)

    const wall = screen.getByTestId('blog-wall')
    expect(screen.getByTestId('blog-wall-card-saved')).toBeInTheDocument()
    expect(screen.getByTestId('blog-wall-card-read')).toBeInTheDocument()
    expect(screen.getByTestId('blog-wall-card-favorite')).toBeInTheDocument()
    fireEvent.click(within(wall).getByRole('button', { name: '收起已读' }))
    expect(screen.queryByTestId('blog-wall-card-read')).not.toBeInTheDocument()
    expect(screen.getByTestId('blog-read-card-read')).toBeInTheDocument()

    fireEvent.click(screen.getByTestId('wall-source-research'))
    expect(screen.queryByTestId('blog-wall-card-saved')).not.toBeInTheDocument()
    expect(screen.getByTestId('blog-wall-card-favorite')).toBeInTheDocument()
    expect(screen.getByTestId('blog-saved-card-saved')).toBeInTheDocument()

    fireEvent.drop(screen.getByTestId('wall-group-header-read'), {
      dataTransfer: { types: ['application/x-blog-group'], getData: () => 'saved' },
    })
    expect(reorderBlog).toHaveBeenCalledWith({ kind: 'group', source: 'saved', target: 'read', placement: 'before' })
  })

  it('renders swap painting button in empty state (anthropic source has no page-level chrome)', () => {
    render(<AnthropicBlogPanel theme="academic" />)
    expect(screen.getByTestId('anthropic-swap-painting-button')).toBeInTheDocument()
  })

  it('toggles collapsed rail and shows thumbnails', () => {
    render(<AnthropicBlogPanel theme="academic" />)
    fireEvent.click(screen.getByTestId('list-view-all'))
    const toggle = screen.getByTestId('briefing-list-column-toggle')
    fireEvent.click(toggle)
    expect(screen.getByTestId('briefing-list-column')).toHaveClass('w-14')
    expect(screen.getAllByTestId('anthropic-list-rail-thumb').length).toBeGreaterThan(0)
  })

  it('文章列表只使用栏容器滚动，不再嵌套第二个滚动区', () => {
    useStore.setState({
      anthropicBlogCache: {
        lastFetchedAt: null,
        articles: [{ ...article('old-1', 'Old Article') }],
        loading: false, error: null, sectionStatus: {},
      },
      blogCollection: { version: 1, entries: [], dismissed: [], history: [], read: [] },
    } as any)
    const { container } = render(<AnthropicBlogPanel theme="academic" />)
    const list = container.querySelector('[data-testid="anthropic-article-list"]')
    expect(list).not.toBeNull()
    expect(list!.className).toContain('shrink-0')
    expect(list!.className).not.toContain('max-h-')
    expect(list!.className).not.toContain('overflow-y-auto')
  })

  it('我的分组不限制高度，也不显示底部拖曳线', () => {
    render(<AnthropicBlogPanel theme="academic" />)

    expect(screen.getByTestId('blog-list-saved-order')).not.toHaveClass('overflow-y-auto', 'max-h-64')
    expect(screen.queryByTestId('blog-saved-resize')).not.toBeInTheDocument()
  })

  it('我的/全部与来源筛选分为主级和次级两行', () => {
    render(<AnthropicBlogPanel theme="academic" />)

    expect(screen.getByTestId('list-view-mine').closest('[data-testid="list-view-filter-row"]')).not.toBeNull()
    expect(screen.getByTestId('list-source-all').closest('[data-testid="list-source-filter-row"]')).not.toBeNull()
    expect(screen.getByTestId('list-source-filter-row')).toHaveTextContent('来源')
    expect(screen.getByTestId('list-view-filter-row')).not.toBe(screen.getByTestId('list-source-filter-row'))
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
    fireEvent.click(screen.getByTestId('list-view-all'))
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
    fireEvent.click(screen.getByTestId('list-view-all'))
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

  it('合并时间线按日期倒序渲染，全部视图使用单来源筛选', () => {
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
    fireEvent.click(screen.getByTestId('list-view-all'))

    expect(webTitles()).toEqual(['Inst New', 'Res Mid', 'Eng Old', 'Align Low'])

    fireEvent.click(chip('research'))
    expect(chip('research')).toHaveAttribute('aria-pressed', 'true')
    expect(chip('alignment')).toHaveAttribute('aria-pressed', 'false')
    expect(webTitles()).toEqual(['Inst New', 'Res Mid'])

    fireEvent.click(chip('engineering'))
    expect(chip('research')).toHaveAttribute('aria-pressed', 'false')
    expect(chip('engineering')).toHaveAttribute('aria-pressed', 'true')
    expect(webTitles()).toEqual(['Eng Old'])

    fireEvent.click(screen.getByTestId('list-source-all'))
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

  it('constitution 内置报告只在全部视图的全部来源下显示', () => {
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
    fireEvent.click(screen.getByTestId('list-view-all'))

    expect(screen.getAllByText("Claude's Constitution · 可视化双语读本")).not.toHaveLength(0)

    fireEvent.click(chip('research'))
    expect(screen.queryByText("Claude's Constitution · 可视化双语读本")).not.toBeInTheDocument()

    fireEvent.click(chip('engineering'))
    expect(screen.queryByText("Claude's Constitution · 可视化双语读本")).not.toBeInTheDocument()

    fireEvent.click(screen.getByTestId('list-source-all'))
    expect(screen.getAllByText("Claude's Constitution · 可视化双语读本")).not.toHaveLength(0)
  })

  it('我的视图筛选已导入文章，来源选择在切换视图后保留', () => {
    useStore.setState({
      anthropicBlogCache: {
        lastFetchedAt: null,
        articles: [
          { ...article('s1', 'Saved Eng'), section: 'engineering', isSaved: true, filePath: 'lib/Anthropic博客/2026-08/s1.md' },
          { ...article('u1', 'Unsaved Eng'), section: 'engineering' },
          { ...article('s2', 'Saved Res'), section: 'research', isSaved: true, filePath: 'lib/Anthropic博客/2026-08/s2.md' },
        ],
        loading: false,
        error: null,
        sectionStatus: {},
      },
    } as any)
    render(<AnthropicBlogPanel theme="academic" />)

    const mine = screen.getByTestId('list-view-mine')
    const all = screen.getByTestId('list-view-all')
    expect(mine).toHaveAttribute('aria-pressed', 'true')
    expect(all).toHaveAttribute('aria-pressed', 'false')
    expect(webTitles()).toEqual(['Saved Eng', 'Saved Res'])
    expect(screen.queryByText("Claude's Constitution · 可视化双语读本")).not.toBeInTheDocument()

    fireEvent.click(chip('engineering'))
    expect(mine).toHaveAttribute('aria-pressed', 'true')
    expect(chip('engineering')).toHaveAttribute('aria-pressed', 'true')
    expect(webTitles()).toEqual(['Saved Eng'])

    fireEvent.click(all)
    expect(all).toHaveAttribute('aria-pressed', 'true')
    expect(chip('engineering')).toHaveAttribute('aria-pressed', 'true')
    expect(webTitles()).toEqual(['Saved Eng', 'Unsaved Eng'])

    fireEvent.click(screen.getByTestId('list-source-all'))
    expect(webTitles()).toEqual(['Saved Eng', 'Unsaved Eng', 'Saved Res'])
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
    fireEvent.click(screen.getByTestId('list-view-all'))

    expect(screen.getAllByText('Inst')).not.toHaveLength(0)
    fireEvent.click(chip('research'))
    expect(screen.getAllByText('Inst')).not.toHaveLength(0)
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
    fireEvent.click(screen.getByTestId('list-view-all'))
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
    fireEvent.click(screen.getByTestId('list-view-all'))
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
    fireEvent.click(screen.getByTestId('list-view-all'))
    const tags = screen.getAllByTestId('anthropic-section-tag')
    const labels = tags.map((t) => t.textContent)
    expect(labels).toEqual(expect.arrayContaining(['Engineering', 'Institute', 'Research', 'Alignment']))
    // institute 色签走 LEGACY_SECTION_META
    const instTag = tags.find((t) => t.textContent === 'Institute')!
    expect(instTag).toHaveStyle({ color: '#8a9a5b' })
  })

  it('已保存文章行显示已读按钮，点击调用 markRead', async () => {
    useStore.setState({
      anthropicBlogCache: {
        lastFetchedAt: null,
        articles: [{ ...article('old-1', 'Old Article'), isSaved: true, filePath: 'lib/old-1.md' }],
        loading: false,
        error: null,
      },
      blogCollection: { version: 1, entries: [], dismissed: [], history: [], read: [] },
    } as any)
    render(<AnthropicBlogPanel theme="academic" />)
    const btn = screen.getByTestId('blog-read-mark')
    expect(btn).toHaveAttribute('aria-pressed', 'false')
    fireEvent.click(btn)
    const { ipc } = await import('@/lib/ipc')
    await waitFor(() => expect(ipc.anthropicCollectionMarkRead).toHaveBeenCalledWith({ sourceUrl: 'old-1', filePath: 'lib/old-1.md', title: 'Old Article' }))
  })

  it('我的模式下已导入行显示移出库按钮；点击弹确认框，确认后删除', async () => {
    const deleteAnthropicArticle = vi.fn()
    useStore.setState({
      anthropicBlogCache: {
        lastFetchedAt: null,
        articles: [{ ...article('old-1', 'Old Article'), isSaved: true, filePath: 'lib/old-1.md' }],
        loading: false, error: null, sectionStatus: {},
      },
      blogCollection: { version: 1, entries: [], dismissed: [], history: [], read: [] },
      deleteAnthropicArticle,
    } as any)
    render(<AnthropicBlogPanel theme="academic" />)
    const btn = screen.getByTestId('anthropic-row-unimport')
    fireEvent.click(btn)
    // 确认弹窗
    expect(screen.getByTestId('confirm-dialog')).toBeInTheDocument()
    fireEvent.click(screen.getByTestId('confirm-dialog-confirm'))
    await waitFor(() => expect(deleteAnthropicArticle).toHaveBeenCalledWith('lib/old-1.md'))
  })

  it('未保存文章行不显示已读按钮', () => {
    render(<AnthropicBlogPanel theme="academic" />)
    expect(screen.queryByTestId('blog-read-mark')).not.toBeInTheDocument()
  })

  it('recommend 条目点 ★ 走移除（全局真 toggle，promote 已废弃）', async () => {
    const { ipc } = await import('@/lib/ipc')
    useStore.setState({
      anthropicBlogCache: {
        lastFetchedAt: null,
        articles: [{ ...article('old-1', 'Old Article'), isSaved: true, filePath: 'lib/old-1.md' }],
        loading: false, error: null,
      },
      blogCollection: {
        version: 1, dismissed: [], history: [], read: [],
        entries: [{ sourceUrl: 'old-1', filePath: 'lib/old-1.md', title: 'Old Article', addedAt: 'x', origin: 'recommend' as const, batch: 1 }],
      },
    } as any)
    render(<AnthropicBlogPanel theme="academic" />)
    fireEvent.click(screen.getByTestId('list-view-all'))
    fireEvent.click(screen.getByTestId('blog-fav-toggle'))
    await waitFor(() => expect(ipc.anthropicCollectionRemove).toHaveBeenCalledWith({ sourceUrl: 'old-1' }))
    expect(ipc.anthropicCollectionAdd).not.toHaveBeenCalled()
  })

  it('来自推荐批次的文章行显示批号徽标，点击打开推荐页对应批次', async () => {
    const openRecommendView = vi.fn()
    useStore.setState({
      anthropicBlogCache: {
        lastFetchedAt: null,
        articles: [{ ...article('old-1', 'Old Article'), isSaved: true, filePath: 'lib/old-1.md' }],
        loading: false, error: null,
      },
      openRecommendView,
      blogCollection: {
        version: 1, entries: [], dismissed: [], read: [],
        history: [{
          batch: 3, generatedAt: 'g', profile: 'p', gaps: [], queries: [], searchUsed: false,
          picks: [{ sourceUrl: 'old-1', title: 'Old Article', filePath: 'lib/old-1.md', reason: 'r', gap: 'g' }],
        }],
      },
    } as any)
    render(<AnthropicBlogPanel theme="academic" />)
    const badge = screen.getByTestId('blog-rec-badge')
    expect(badge).toHaveTextContent('◆3')
    fireEvent.click(badge)
    expect(openRecommendView).toHaveBeenCalledWith(3)
  })

  it('不在任何批次 picks 里的文章行不显示批号徽标', () => {
    useStore.setState({
      blogCollection: { version: 1, entries: [], dismissed: [], read: [], history: [] },
    } as any)
    render(<AnthropicBlogPanel theme="academic" />)
    expect(screen.queryByTestId('blog-rec-badge')).not.toBeInTheDocument()
  })

  it('收藏夹移出 → 确认后：移出收藏 + 删除文章文件', async () => {
    const removeBlogCollection = vi.fn()
    const deleteAnthropicArticle = vi.fn()
    useStore.setState({
      anthropicBlogCache: {
        lastFetchedAt: null,
        articles: [{ ...article('u-m1', 'Manual'), isSaved: true, filePath: 'lib/m1.md' }],
        loading: false, error: null, sectionStatus: {},
      },
      blogCollection: {
        version: 1, dismissed: [], history: [], read: [],
        entries: [{ sourceUrl: 'u-m1', filePath: 'lib/m1.md', title: '手动一', addedAt: 'b', origin: 'manual' as const }],
      },
      removeBlogCollection, deleteAnthropicArticle,
    } as any)
    render(<AnthropicBlogPanel theme="academic" />)
    fireEvent.click(screen.getByTestId('blog-collection-remove-u-m1'))
    expect(screen.getByTestId('confirm-dialog')).toBeInTheDocument()
    fireEvent.click(screen.getByTestId('confirm-dialog-confirm'))
    await waitFor(() => {
      expect(removeBlogCollection).toHaveBeenCalledWith('u-m1')
      expect(deleteAnthropicArticle).toHaveBeenCalledWith('lib/m1.md')
    })
  })

  it('对照模式下点已保存文章：路由到对照槽，并 toast 提示 + 自动展开导读面板', async () => {
    const selectArticleCompanion = vi.fn()
    const showToast = vi.fn()
    const setArticleAssistantGuideCollapsed = vi.fn()
    useStore.setState({
      anthropicBlogCache: {
        lastFetchedAt: null,
        articles: [{ ...article('old-1', 'Old Article'), isSaved: true, filePath: 'lib/old-1.md' }],
        loading: false, error: null, sectionStatus: {},
      },
      anthropicReaderFilePath: 'lib/current.md',
      articlePanelMode: { anthropic: 'companion', scout: 'guide', job: 'guide' },
      selectArticleCompanion, showToast, setArticleAssistantGuideCollapsed,
    } as any)
    render(<AnthropicBlogPanel theme="academic" />)
    // 排除本地置顶的宪法报告条目，点网络文章行
    const row = screen.getAllByTestId('anthropic-article-row')
      .find((r) => !r.querySelector('[data-testid="anthropic-constitution-pill"]'))!
    fireEvent.click(row)
    await waitFor(() =>
      expect(selectArticleCompanion).toHaveBeenCalledWith('anthropic', 'lib/current.md', 'lib/old-1.md'))
    expect(setArticleAssistantGuideCollapsed).toHaveBeenCalledWith(false)
    expect(showToast).toHaveBeenCalledWith(expect.stringContaining('对照'))
  })

  it('对照模式下从专辑墙打开首篇文章：仍进入主阅读器', async () => {
    const openReader = vi.fn()
    const selectArticleCompanion = vi.fn()
    useStore.setState({
      anthropicBlogCache: {
        lastFetchedAt: null,
        articles: [{ ...article('old-1', 'Old Article'), isSaved: true, filePath: 'lib/old-1.md' }],
        loading: false, error: null, sectionStatus: {},
      },
      anthropicReaderFilePath: null,
      lastAnthropicReaderFile: null,
      articlePanelMode: { anthropic: 'companion', book: 'guide' },
      openAnthropicReader: openReader,
      selectArticleCompanion,
    } as any)
    render(<AnthropicBlogPanel theme="academic" />)
    fireEvent.click(screen.getByTestId('blog-wall-card-old-1'))
    await waitFor(() => expect(openReader).toHaveBeenCalledWith('lib/old-1.md'))
    expect(selectArticleCompanion).not.toHaveBeenCalled()
  })
})
