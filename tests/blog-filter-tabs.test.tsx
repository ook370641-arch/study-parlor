import { useState } from 'react'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { BlogFilterTabs } from '@/components/anthropic/BlogFilterTabs'
import { DEFAULT_BLOG_FILTER } from '@/lib/section-filter'

afterEach(cleanup)

function IndependentFilters() {
  const [list, setList] = useState(DEFAULT_BLOG_FILTER)
  const [wall, setWall] = useState(DEFAULT_BLOG_FILTER)
  return (
    <>
      <BlogFilterTabs area="list" value={list} onChange={setList} />
      <BlogFilterTabs area="wall" value={wall} onChange={setWall} />
    </>
  )
}

describe('BlogFilterTabs', () => {
  it('两侧视图与来源筛选互不影响', () => {
    render(<IndependentFilters />)

    fireEvent.click(screen.getByTestId('wall-view-all'))
    expect(screen.getByTestId('wall-view-all')).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByTestId('list-view-mine')).toHaveAttribute('aria-pressed', 'true')

    fireEvent.change(screen.getByTestId('list-source-select'), { target: { value: 'research' } })
    expect(screen.getByTestId('list-source-select')).toHaveValue('research')
    expect(screen.getByTestId('wall-source-select')).toHaveValue('all')
    expect(screen.getByTestId('wall-view-all')).toHaveAttribute('aria-pressed', 'true')
  })

  it('我的视图仍显示来源下拉框，主视图使用标签页', () => {
    render(<BlogFilterTabs area="list" value={DEFAULT_BLOG_FILTER} onChange={() => {}} />)

    expect(screen.getByTestId('list-view-mine')).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByTestId('list-view-filter-row')).toHaveAttribute('role', 'tablist')
    expect(screen.getByTestId('list-source-select')).toHaveValue('all')
    expect(screen.getByTestId('list-source-all')).toBeInTheDocument()
    expect(screen.getByTestId('list-source-research')).toBeInTheDocument()
  })
})
