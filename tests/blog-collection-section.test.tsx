import { beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'

const mockIpc = vi.hoisted(() => ({ readMd: vi.fn() }))
vi.mock('@/lib/ipc', () => ({ ipc: mockIpc }))

import { useStore } from '@/store'
import { BlogCollectionSection } from '@/components/anthropic/BlogCollectionSection'
import type { AnthropicArticleMeta, BlogCollectionFile } from '@shared/index'

const savedArticle: AnthropicArticleMeta = { url: 'saved', title: 'Saved', summary: null, publishedAt: '2026-01-01', imageUrl: null, isSaved: true, filePath: 'saved.md' }
const readArticle: AnthropicArticleMeta = { ...savedArticle, url: 'read', title: 'Read', filePath: 'read.md' }
const favoriteArticle: AnthropicArticleMeta = { ...savedArticle, url: 'favorite', title: 'Favorite', filePath: 'favorite.md' }

const collection: BlogCollectionFile = {
  version: 1,
  entries: [{ sourceUrl: 'favorite', filePath: 'favorite.md', title: 'Favorite', addedAt: '2026-01-01', origin: 'recommend', reason: '推荐理由', gap: '缺口', guide: '导读' }],
  dismissed: [],
  history: [{ batch: 1, generatedAt: 'x', profile: 'p', gaps: [], queries: [], searchUsed: false }],
  read: [{ sourceUrl: 'read', filePath: 'read.md', title: 'Read', readAt: '2026-01-02' }],
  order: { groups: ['saved', 'read', 'favorite'], saved: ['saved'], read: ['read'], favorite: ['favorite'] },
}

const props = () => ({
  theme: 'academic' as const,
  groups: { saved: [] as AnthropicArticleMeta[], read: [] as AnthropicArticleMeta[], favorite: [] as AnthropicArticleMeta[] },
  order: collection.order!,
  collapsedGroups: { saved: false, read: false, favorite: false },
  onToggleGroup: vi.fn(),
  onReorder: vi.fn(),
  onOpenArticle: vi.fn(),
  onRequestDelete: vi.fn(),
})

describe('BlogCollectionSection', () => {
  beforeEach(() => {
    cleanup()
    vi.clearAllMocks()
    mockIpc.readMd.mockResolvedValue({ frontmatter: {}, body: '正文' })
    useStore.setState({
      blogCollection: collection,
      recommendRunning: false,
      recommendStage: null,
      briefingFontSize: 'base',
      toggleBlogCollection: vi.fn(),
      toggleBlogRead: vi.fn(),
      removeBlogCollection: vi.fn(),
      removeBlogRead: vi.fn(),
      openAnthropicReader: vi.fn(),
      openRecommendView: vi.fn(),
      showToast: vi.fn(),
    } as never)
  })

  it('已保存卡片保留收藏、已读和取消导入按钮', () => {
    const current = props()
    current.groups.saved = [savedArticle]
    render(<BlogCollectionSection {...current} />)

    expect(screen.getByTestId('blog-saved-card-saved')).toBeInTheDocument()
    fireEvent.click(screen.getByTitle('收藏'))
    expect(useStore.getState().toggleBlogCollection).toHaveBeenCalledWith({ sourceUrl: 'saved', filePath: 'saved.md', title: 'Saved' })
    fireEvent.click(screen.getByTitle('标为已读'))
    expect(useStore.getState().toggleBlogRead).toHaveBeenCalledWith({ sourceUrl: 'saved', filePath: 'saved.md', title: 'Saved' })
    const deleteButton = screen.getByTestId('anthropic-row-unimport')
    expect(deleteButton).toHaveClass('h-7', 'w-7')
    expect(deleteButton.querySelector('[data-testid="blog-icon-trash"]')).toBeInTheDocument()
    fireEvent.click(deleteButton)
    expect(current.onRequestDelete).toHaveBeenCalledWith({ kind: 'mine', article: savedArticle })
    expect(current.onOpenArticle).not.toHaveBeenCalled()
  })

  it('已读与收藏继续使用不同删除请求', () => {
    const current = props()
    current.groups.read = [readArticle]
    current.groups.favorite = [favoriteArticle]
    render(<BlogCollectionSection {...current} />)

    const readDelete = screen.getByTestId('blog-read-remove-read')
    const favoriteDelete = screen.getByTestId('blog-collection-remove-favorite')
    for (const button of [readDelete, favoriteDelete]) {
      expect(button).toHaveClass('h-7', 'w-7')
      expect(button.querySelector('[data-testid="blog-icon-trash"]')).toBeInTheDocument()
    }
    fireEvent.click(readDelete)
    expect(current.onRequestDelete).toHaveBeenCalledWith({ kind: 'read', sourceUrl: 'read', filePath: 'read.md', title: 'Read' })
    fireEvent.click(favoriteDelete)
    expect(current.onRequestDelete).toHaveBeenCalledWith({ kind: 'collection', sourceUrl: 'favorite', filePath: 'favorite.md', title: 'Favorite' })
  })

  it('我的分组与卡片去掉额外左右内边距', () => {
    const current = props()
    current.groups.saved = [savedArticle]
    render(<BlogCollectionSection {...current} />)

    expect(screen.getByTestId('blog-collection-section')).toHaveClass('px-0')
    expect(screen.getByTestId('blog-collection-section')).not.toHaveClass('px-4')
  })

  it('只有手柄可拖拽，卡片正文仍通过面板打开', () => {
    const current = props()
    current.groups.saved = [savedArticle]
    render(<BlogCollectionSection {...current} />)

    expect(screen.getByTestId('blog-saved-card-saved')).not.toHaveAttribute('draggable')
    expect(screen.getByTestId('blog-list-article-handle-saved')).toHaveAttribute('draggable', 'true')
    fireEvent.click(screen.getByTestId('anthropic-article-row'))
    expect(current.onOpenArticle).toHaveBeenCalledWith(savedArticle)
  })

  it('按共享顺序渲染分组，收藏折叠时推荐工具一起隐藏', () => {
    const current = props()
    current.order = { ...current.order, groups: ['favorite', 'saved', 'read'] }
    current.collapsedGroups = { ...current.collapsedGroups, favorite: true }
    render(<BlogCollectionSection {...current} />)

    expect(screen.getAllByTestId(/^list-group-header-/).map(node => node.getAttribute('data-testid'))).toEqual([
      'list-group-header-favorite', 'list-group-header-saved', 'list-group-header-read',
    ])
    expect(screen.queryByTestId('blog-recommendation-tools')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '展开收藏' }))
    expect(current.onToggleGroup).toHaveBeenCalledWith('favorite')
  })

  it('已读收藏卡片与全部列表同尺寸，分组标题清晰突出', () => {
    const current = props()
    current.groups.read = [readArticle]
    current.groups.favorite = [favoriteArticle]
    render(<BlogCollectionSection {...current} />)

    expect(screen.getByTestId('blog-read-card-read').lastElementChild).toHaveClass('p-4')
    expect(screen.getByTestId('blog-favorite-card-favorite').lastElementChild).toHaveClass('p-4')
    for (const placeholder of screen.getAllByText('无配图')) {
      expect(placeholder).toHaveClass('h-14', 'w-14')
    }
    expect(screen.getByTestId('list-group-header-read')).toHaveClass('text-lg')
    expect(screen.getByTestId('list-group-header-favorite')).toHaveClass('text-lg')
  })

  it('推荐理由、导读和缺口继续展开', () => {
    const current = props()
    current.groups.favorite = [favoriteArticle]
    render(<BlogCollectionSection {...current} />)

    fireEvent.click(screen.getByTestId('blog-collection-reason-favorite'))
    expect(screen.getByText('为什么推荐：', { exact: false })).toBeInTheDocument()
    expect(screen.getByText('推荐理由')).toBeInTheDocument()
    expect(screen.getByText('导读')).toBeInTheDocument()
    expect(screen.getByText('缺口')).toBeInTheDocument()
  })

  it('已读文件缺失时沿用原清理逻辑', async () => {
    const current = props()
    current.groups.read = [readArticle]
    mockIpc.readMd.mockRejectedValue(new Error('missing'))
    render(<BlogCollectionSection {...current} />)

    fireEvent.click(screen.getByTestId('blog-read-open-read'))
    await waitFor(() => expect(useStore.getState().removeBlogRead).toHaveBeenCalledWith('read'))
    expect(useStore.getState().showToast).toHaveBeenCalledWith('该文件已被删除，已从已读移除')
    expect(current.onOpenArticle).not.toHaveBeenCalled()
  })

  it('收藏文件存在时读取后通过面板打开', async () => {
    const current = props()
    current.groups.favorite = [favoriteArticle]
    render(<BlogCollectionSection {...current} />)

    fireEvent.click(screen.getByTestId('blog-collection-open-favorite'))
    await waitFor(() => expect(current.onOpenArticle).toHaveBeenCalledWith(favoriteArticle))
  })

  it('收藏空态仍保留推荐入口', () => {
    const current = props()
    current.groups.saved = [savedArticle]
    render(<BlogCollectionSection {...current} />)

    expect(screen.getByTestId('blog-recommendation-tools')).toBeInTheDocument()
    expect(screen.getByTestId('blog-collection-empty')).toBeInTheDocument()
    const list = screen.getByTestId('blog-list-saved-order')
    expect(list).toHaveAttribute('data-order', 'saved')
  })
})
