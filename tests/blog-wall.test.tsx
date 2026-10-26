import { beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { BlogWall } from '@/components/anthropic/BlogWall'
import type { AnthropicArticleMeta } from '@shared/index'

const articles: AnthropicArticleMeta[] = [
  { url: 'a', title: '文章 A', summary: null, publishedAt: '2026-10-01', imageUrl: 'https://cdn.sanity.io/images/a.jpg', isSaved: true, section: 'engineering' },
  { url: 'b', title: '文章 B', summary: null, publishedAt: '2026-09-01', imageUrl: null, section: 'research' },
]

const props = () => ({
  articles,
  loading: false,
  filter: { mode: 'all' } as const,
  sortBy: 'newest' as const,
  onFilterChange: vi.fn(),
  onSortByChange: vi.fn(),
  onOpenArticle: vi.fn(),
  onClearFilters: vi.fn(),
})

beforeEach(cleanup)

describe('BlogWall', () => {
  it('渲染封面卡片、已导入标记和无图回退，点击交给打开逻辑', () => {
    const current = props()
    const { container } = render(<BlogWall {...current} />)
    expect(screen.getByText('文章 A')).toBeInTheDocument()
    expect(screen.getByTestId('blog-wall-saved-a')).toBeInTheDocument()
    expect(screen.getByTestId('blog-wall-cover-fallback-b')).toBeInTheDocument()
    expect(container.querySelector('img')).toHaveAttribute('src', 'https://cdn.sanity.io/images/a.jpg?w=512&q=75&auto=format')
    fireEvent.click(screen.getByTestId('blog-wall-card-a'))
    expect(current.onOpenArticle).toHaveBeenCalledWith(articles[0])
  })

  it('标题默认截断，仅悬停时展开，卡片不做额外交互动画', () => {
    render(<BlogWall {...props()} />)
    const title = screen.getByText('文章 A')
    expect(title).toHaveClass('line-clamp-3', 'group-hover:line-clamp-none')
    const card = screen.getByTestId('blog-wall-card-a')
    expect(card).not.toHaveClass('transition-transform', 'hover:-translate-y-0.5')
  })

  it('筛选和排序控件在两种版式下使用可读配色', () => {
    const current = props()
    const { rerender } = render(<BlogWall {...current} theme="academic" />)
    const filter = screen.getByTestId('blog-wall-filter-select')
    expect(filter).toHaveClass('bg-[#2a1f1a]', 'text-[#e8d5b7]')
    expect(filter.querySelector('option')).toHaveClass('bg-[#2a1f1a]', 'text-[#e8d5b7]')

    rerender(<BlogWall {...current} theme="newspaper" />)
    expect(filter).toHaveClass('bg-[#f5f2ed]', 'text-[#2a1f1a]')
    expect(filter.querySelector('option')).toHaveClass('bg-[#f5f2ed]', 'text-[#2a1f1a]')
  })

  it('第一行筛选和排序更新面板状态', () => {
    const current = props()
    render(<BlogWall {...current} />)
    fireEvent.change(screen.getByTestId('blog-wall-filter-select'), { target: { value: 'research' } })
    expect(current.onFilterChange).toHaveBeenCalledWith({ mode: 'pick', selected: new Set(['research']) })
    fireEvent.change(screen.getByTestId('blog-wall-sort-select'), { target: { value: 'oldest' } })
    expect(current.onSortByChange).toHaveBeenCalledWith('oldest')
  })

  it('筛选空态可清空，初始加载显示加载态', () => {
    const current = props()
    const { rerender } = render(<BlogWall {...current} articles={[]} />)
    fireEvent.click(screen.getByTestId('blog-wall-clear-filters'))
    expect(current.onClearFilters).toHaveBeenCalled()
    rerender(<BlogWall {...current} articles={[]} loading={true} />)
    expect(screen.getByTestId('blog-wall-loading')).toBeInTheDocument()
  })
})
