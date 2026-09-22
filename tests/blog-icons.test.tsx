import { describe, expect, it, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { BookIcon, BookmarkIcon, HistoryIcon, RefreshIcon, UnimportIcon } from '@/components/anthropic/blog-icons'

afterEach(cleanup)

describe('blog-icons', () => {
  it('五个图标都渲染 svg，带各自 testid', () => {
    render(<>
      <BookIcon /><BookmarkIcon /><HistoryIcon /><RefreshIcon /><UnimportIcon />
    </>)
    for (const id of ['blog-icon-book', 'blog-icon-bookmark', 'blog-icon-history', 'blog-icon-refresh', 'blog-icon-unimport']) {
      expect(screen.getByTestId(id)).toBeInTheDocument()
    }
  })
  it('Book/Bookmark 激活态用实心填充', () => {
    render(<><BookIcon active /><BookmarkIcon active /></>)
    expect(screen.getByTestId('blog-icon-book')).toHaveAttribute('fill', 'currentColor')
    expect(screen.getByTestId('blog-icon-bookmark')).toHaveAttribute('fill', 'currentColor')
  })
})
