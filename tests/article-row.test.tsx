import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { ArticleRow } from '@/components/article/ArticleRow'

afterEach(() => cleanup())

const base = {
  title: 'The Second Half',
  summary: 'AI 进入下半场',
  dateText: '2025年4月10日',
  testId: 'article-row',
}

describe('ArticleRow（通用展示行）', () => {
  it('渲染标题/摘要/日期', () => {
    render(<ArticleRow {...base} onOpen={() => {}} />)
    expect(screen.getByText('The Second Half')).toBeInTheDocument()
    expect(screen.getByText('AI 进入下半场')).toBeInTheDocument()
    expect(screen.getByText('2025年4月10日')).toBeInTheDocument()
  })

  it('点击触发 onOpen；isNew 显示新标记', () => {
    const onOpen = vi.fn()
    render(<ArticleRow {...base} isNew onOpen={onOpen} />)
    fireEvent.click(screen.getByTestId('article-row'))
    expect(onOpen).toHaveBeenCalledOnce()
    expect(screen.getByTestId('article-row-new-badge')).toBeInTheDocument()
  })

  it('onRequestDelete 提供时渲染删除按钮', () => {
    const onDelete = vi.fn()
    render(<ArticleRow {...base} onOpen={() => {}} onRequestDelete={onDelete} />)
    fireEvent.click(screen.getByTestId('article-row-delete'))
    expect(onDelete).toHaveBeenCalledOnce()
  })

  it('双主题 class 不报错', () => {
    const { unmount } = render(<ArticleRow {...base} theme="newspaper" onOpen={() => {}} />)
    unmount()
    render(<ArticleRow {...base} theme="academic" onOpen={() => {}} />)
    expect(screen.getByTestId('article-row')).toBeInTheDocument()
  })
})
