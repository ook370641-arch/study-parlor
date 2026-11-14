import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { BlogMineGroupSection } from '@/components/anthropic/BlogMineGroupSection'
import { BlogRecommendationTools } from '@/components/anthropic/BlogRecommendationTools'
import { useStore } from '@/store'
import type { BlogCollectionFile } from '@shared/index'

afterEach(cleanup)

const props = () => ({
  area: 'wall' as const,
  group: 'favorite' as const,
  label: '收藏',
  count: 2,
  collapsed: false,
  onToggle: vi.fn(),
  onGroupDragStart: vi.fn(),
  onGroupDragOver: vi.fn(),
  onGroupDrop: vi.fn(),
})

const collection: BlogCollectionFile = {
  version: 1,
  entries: [],
  dismissed: [],
  read: [],
  history: [{ batch: 2, generatedAt: 'x', profile: 'p', gaps: [], queries: [], searchUsed: false }],
}

describe('BlogMineGroupSection', () => {
  it('推荐工具紧跟收藏标题并位于卡片之前', () => {
    render(<BlogMineGroupSection {...props()} recommendationTools={<div data-testid="tools" />}><div data-testid="cards" /></BlogMineGroupSection>)

    const header = screen.getByTestId('wall-group-header-favorite')
    const tools = screen.getByTestId('tools')
    const cards = screen.getByTestId('cards')
    expect(header.compareDocumentPosition(tools)).toBe(Node.DOCUMENT_POSITION_FOLLOWING)
    expect(tools.compareDocumentPosition(cards)).toBe(Node.DOCUMENT_POSITION_FOLLOWING)
  })

  it('收藏折叠时工具和内容一起隐藏', () => {
    render(<BlogMineGroupSection {...props()} collapsed recommendationTools={<div data-testid="tools" />}><div data-testid="cards" /></BlogMineGroupSection>)

    expect(screen.queryByTestId('tools')).not.toBeInTheDocument()
    expect(screen.queryByTestId('cards')).not.toBeInTheDocument()
  })

  it('拖拽手柄仅悬停显示，折叠按钮不触发拖拽', () => {
    const current = props()
    render(<BlogMineGroupSection {...current}><div /></BlogMineGroupSection>)

    expect(screen.getByTestId('wall-group-handle-favorite')).toHaveClass('opacity-0', 'group-hover/header:opacity-100')
    fireEvent.click(screen.getByRole('button', { name: '收起收藏' }))
    expect(current.onToggle).toHaveBeenCalledTimes(1)
    expect(current.onGroupDragStart).not.toHaveBeenCalled()
    expect(current.onGroupDrop).not.toHaveBeenCalled()
  })
})

describe('BlogRecommendationTools', () => {
  beforeEach(() => {
    useStore.setState({
      blogCollection: collection,
      recommendRunning: false,
      recommendStage: null,
      openRecommendView: vi.fn(),
      startBlogRecommend: vi.fn(),
      cancelBlogRecommend: vi.fn(),
    } as never)
  })

  it('保留推荐记录和备注重新推荐', () => {
    render(<BlogRecommendationTools theme="academic" />)

    fireEvent.click(screen.getByTestId('blog-rec-history'))
    expect(useStore.getState().openRecommendView).toHaveBeenCalledWith(2)
    fireEvent.click(screen.getByTestId('blog-recommend-button'))
    fireEvent.change(screen.getByTestId('blog-recommend-note'), { target: { value: '关注工程实践' } })
    fireEvent.click(screen.getByTestId('blog-recommend-start'))
    expect(useStore.getState().startBlogRecommend).toHaveBeenCalledWith('关注工程实践')
  })

  it('生成中显示阶段并允许取消，空历史不显示记录', () => {
    useStore.setState({ blogCollection: { ...collection, history: [] }, recommendRunning: true, recommendStage: 'search' } as never)
    render(<BlogRecommendationTools theme="academic" />)

    expect(screen.queryByTestId('blog-rec-history')).not.toBeInTheDocument()
    expect(screen.getByText('搜索前沿博客…')).toBeInTheDocument()
    fireEvent.click(screen.getByTestId('blog-recommend-button'))
    expect(useStore.getState().cancelBlogRecommend).toHaveBeenCalledTimes(1)
  })
})
