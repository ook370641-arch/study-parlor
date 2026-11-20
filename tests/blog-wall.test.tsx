import { beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { BlogWall } from '@/components/anthropic/BlogWall'
import type { AnthropicArticleMeta, BlogMineGroup, BlogOrder } from '@shared/index'
import type { BlogViewFilter } from '@/lib/section-filter'

const saved: AnthropicArticleMeta = {
  url: 'saved', title: '已保存文章', summary: null, publishedAt: '2026-10-01',
  imageUrl: 'https://cdn.sanity.io/images/a.jpg', isSaved: true, filePath: 'saved.md', section: 'engineering',
}
const savedTwo: AnthropicArticleMeta = {
  ...saved, url: 'saved-2', title: '已保存文章二', imageUrl: null,
}
const read: AnthropicArticleMeta = {
  url: 'read', title: '已读文章', summary: null, publishedAt: '2026-09-01',
  imageUrl: null, isSaved: true, filePath: 'read.md', section: 'research',
}
const favorite: AnthropicArticleMeta = {
  url: 'favorite', title: '收藏文章', summary: null, publishedAt: '2026-08-01',
  imageUrl: null, isSaved: true, filePath: 'favorite.md', section: 'alignment',
}

const wallProps = () => ({
  articles: [saved, read, favorite],
  loading: false,
  filter: { view: 'all', source: 'all' } as BlogViewFilter,
  sortBy: 'newest' as const,
  groups: { saved: [saved], read: [read], favorite: [favorite] },
  order: {
    groups: ['saved', 'read', 'favorite'],
    saved: ['saved'],
    read: ['read'],
    favorite: ['favorite'],
  } as BlogOrder,
  collapsedGroups: { saved: false, read: false, favorite: false } as Record<BlogMineGroup, boolean>,
  onToggleGroup: vi.fn(),
  onReorder: vi.fn(),
  onFilterChange: vi.fn(),
  onSortByChange: vi.fn(),
  onOpenArticle: vi.fn(),
  onClearFilters: vi.fn(),
})

function dataTransfer(type: string, value: string): DataTransfer {
  const values = { [type]: value }
  return {
    getData: (key: string) => values[key] ?? '',
    types: Object.keys(values),
  } as unknown as DataTransfer
}

function articleTransfer(group: string, sourceUrl: string): DataTransfer {
  return dataTransfer('application/x-blog-article', JSON.stringify({ group, sourceUrl }))
}

beforeEach(cleanup)

describe('BlogWall', () => {
  it('全部视图渲染封面、日期顺序和已导入标记，不渲染拖拽手柄', () => {
    const current = wallProps()
    const { container } = render(<BlogWall {...current} />)
    expect(screen.getByTestId('blog-wall')).toHaveAttribute('data-album-wall', 'blog')
    expect(screen.getByText('已保存文章')).toBeInTheDocument()
    expect(screen.getByTestId('blog-wall-saved-saved')).toBeInTheDocument()
    expect(screen.getByTestId('blog-wall-cover-fallback-read')).toBeInTheDocument()
    expect(container.querySelector('img')).toHaveAttribute('src', 'https://cdn.sanity.io/images/a.jpg?w=512&q=75&auto=format')
    expect(screen.queryByTestId('blog-wall-article-handle-saved')).not.toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: /文章/ }).map(card => card.getAttribute('data-testid'))).toEqual([
      'blog-wall-card-saved', 'blog-wall-card-read', 'blog-wall-card-favorite',
    ])
    fireEvent.click(screen.getByTestId('blog-wall-card-saved'))
    expect(current.onOpenArticle).toHaveBeenCalledWith(saved)
  })

  it('标题默认截断，仅悬停时展开，卡片不做额外交互动画', () => {
    render(<BlogWall {...wallProps()} />)
    expect(screen.getByText('已保存文章')).toHaveClass('line-clamp-3', 'group-hover:line-clamp-none')
    expect(screen.getByTestId('blog-wall-card-saved')).not.toHaveClass('transition-transform', 'hover:-translate-y-0.5')
  })

  it('筛选和排序控件在两种版式下使用可读配色', () => {
    const current = wallProps()
    const { rerender } = render(<BlogWall {...current} theme="academic" />)
    const sort = screen.getByTestId('blog-wall-sort-select')
    expect(sort).toHaveClass('bg-[#2a1f1a]', 'text-[#e8d5b7]')
    expect(sort.querySelector('option')).toHaveClass('bg-[#2a1f1a]', 'text-[#e8d5b7]')

    rerender(<BlogWall {...current} theme="newspaper" />)
    expect(sort).toHaveClass('bg-[#f5f2ed]', 'text-[#2a1f1a]')
    expect(sort.querySelector('option')).toHaveClass('bg-[#f5f2ed]', 'text-[#2a1f1a]')
  })

  it('第一行来源筛选和日期排序更新面板状态', () => {
    const current = wallProps()
    render(<BlogWall {...current} />)
    fireEvent.change(screen.getByTestId('wall-source-select'), { target: { value: 'research' } })
    expect(current.onFilterChange).toHaveBeenCalledWith({ view: 'all', source: 'research' })
    fireEvent.change(screen.getByTestId('blog-wall-sort-select'), { target: { value: 'oldest' } })
    expect(current.onSortByChange).toHaveBeenCalledWith('oldest')
  })

  it('筛选空态可清空，初始加载显示加载态', () => {
    const current = wallProps()
    const emptyGroups = { saved: [], read: [], favorite: [] }
    const { rerender } = render(<BlogWall {...current} articles={[]} groups={emptyGroups} />)
    fireEvent.click(screen.getByTestId('blog-wall-clear-filters'))
    expect(current.onClearFilters).toHaveBeenCalled()
    rerender(<BlogWall {...current} articles={[]} groups={emptyGroups} loading={true} />)
    expect(screen.getByTestId('blog-wall-loading')).toBeInTheDocument()
  })

  it('我的视图同屏展示三组，组名顺序来自共享 order', () => {
    const current = wallProps()
    current.filter = { view: 'mine', source: 'all' }
    current.order = { ...current.order, groups: ['favorite', 'read', 'saved'] }
    const { container } = render(<BlogWall {...current} />)
    expect(Array.from(container.querySelectorAll('[data-group-section]')).map(node => node.getAttribute('data-group-section'))).toEqual([
      'favorite', 'read', 'saved',
    ])
    expect(screen.getByTestId('blog-wall-card-saved')).toBeInTheDocument()
    expect(screen.getByTestId('blog-wall-card-read')).toBeInTheDocument()
    expect(screen.getByTestId('blog-wall-card-favorite')).toBeInTheDocument()
    expect(screen.getByTestId('blog-wall-saved-order')).toHaveAttribute('data-order', 'saved')
    expect(screen.queryByTestId('blog-wall-sort-select')).not.toBeInTheDocument()
  })

  it('推荐工具位于收藏标题行，收藏折叠时一起隐藏且不影响其他组', () => {
    const current = wallProps()
    current.filter = { view: 'mine', source: 'all' }
    current.collapsedGroups = { ...current.collapsedGroups, favorite: true }
    render(<BlogWall {...current} />)
    expect(screen.queryByTestId('blog-recommendation-tools')).not.toBeInTheDocument()
    expect(screen.queryByTestId('blog-wall-card-favorite')).not.toBeInTheDocument()
    expect(screen.getByTestId('blog-wall-card-saved')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '展开收藏' }))
    expect(current.onToggleGroup).toHaveBeenCalledWith('favorite')
  })

  it('收藏展开时推荐工具与标题同行', () => {
    const current = wallProps()
    current.filter = { view: 'mine', source: 'all' }
    const { container } = render(<BlogWall {...current} />)
    const section = container.querySelector('[data-group-section="favorite"]') as HTMLElement
    const tools = within(section).getByTestId('blog-recommendation-tools')
    const card = within(section).getByTestId('blog-wall-card-favorite')
    expect(within(section).getByTestId('wall-group-header-favorite').contains(tools)).toBe(true)
    expect(tools.compareDocumentPosition(card) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('只有手柄可拖拽，正文点击和键盘仍打开文章', () => {
    const current = wallProps()
    current.filter = { view: 'mine', source: 'all' }
    render(<BlogWall {...current} />)
    const card = screen.getByTestId('blog-wall-card-saved')
    const handle = screen.getByTestId('blog-wall-article-handle-saved')
    expect(card).not.toHaveAttribute('draggable')
    expect(handle).toHaveAttribute('draggable', 'true')
    fireEvent.click(card)
    fireEvent.keyDown(card, { key: 'Enter' })
    fireEvent.keyDown(card, { key: ' ' })
    expect(current.onOpenArticle).toHaveBeenCalledTimes(3)
    expect(current.onOpenArticle).toHaveBeenLastCalledWith(saved)
    fireEvent.click(handle)
    expect(current.onOpenArticle).toHaveBeenCalledTimes(3)
    expect(current.onReorder).not.toHaveBeenCalled()
  })

  it('同组卡片按水平中线发送排序请求，跨组放置不发送', () => {
    const current = wallProps()
    current.filter = { view: 'mine', source: 'all' }
    current.groups = { ...current.groups, saved: [saved, savedTwo] }
    current.order = { ...current.order, saved: ['saved', 'saved-2'] }
    render(<BlogWall {...current} />)
    fireEvent.drop(screen.getByTestId('blog-wall-card-saved-2'), { dataTransfer: articleTransfer('saved', 'saved') })
    expect(current.onReorder).toHaveBeenCalledWith({
      kind: 'article', group: 'saved', sourceUrl: 'saved', targetUrl: 'saved-2', placement: 'before',
    })
    current.onReorder.mockClear()
    fireEvent.drop(screen.getByTestId('wall-group-content-read'), { dataTransfer: articleTransfer('saved', 'saved') })
    expect(current.onReorder).not.toHaveBeenCalled()
  })

  it('分组标题之间可拖拽排序', () => {
    const current = wallProps()
    current.filter = { view: 'mine', source: 'all' }
    render(<BlogWall {...current} />)
    fireEvent.drop(screen.getByTestId('wall-group-header-read'), { dataTransfer: dataTransfer('application/x-blog-group', 'saved') })
    expect(current.onReorder).toHaveBeenCalledWith({ kind: 'group', source: 'saved', target: 'read', placement: 'before' })
  })
})
