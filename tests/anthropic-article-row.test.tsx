import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'

vi.mock('@/lib/ipc', () => ({
  ipc: {
    readMd: vi.fn(),
  },
}))

import { useStore } from '@/store'
import { AnthropicArticleRow } from '@/components/anthropic/AnthropicArticleRow'

function article(overrides = {}) {
  return {
    url: 'https://www.anthropic.com/engineering/test',
    title: 'A Very Long Anthropic Engineering Article Title That Should Be Truncated By Default',
    summary: 'Summary text.',
    publishedAt: '2026-07-01T00:00:00.000Z',
    imageUrl: null,
    isSaved: false,
    ...overrides,
  }
}

describe('AnthropicArticleRow', () => {
  beforeEach(() => {
    cleanup()
    useStore.setState({
      importAnthropicArticle: vi.fn(),
      cancelAnthropicImport: vi.fn(),
      openAnthropicReader: vi.fn(),
    } as any)
  })

  it('does not render the old click-import/read hint', () => {
    render(<AnthropicArticleRow article={article()} theme="academic" />)
    expect(screen.queryByText('点击导入')).not.toBeInTheDocument()
    expect(screen.queryByText('阅读')).not.toBeInTheDocument()
  })

  it('does not render saved/unsaved text badges', () => {
    render(<AnthropicArticleRow article={article({ isSaved: true, filePath: '/tmp/x.md' })} theme="academic" />)
    expect(screen.queryByText('已保存')).not.toBeInTheDocument()
    expect(screen.queryByText('导入阅读')).not.toBeInTheDocument()
  })

  it('applies ember left border and brown top/right/bottom borders when article is saved (academic)', () => {
    render(<AnthropicArticleRow article={article({ isSaved: true, filePath: '/tmp/x.md' })} theme="academic" />)
    const row = screen.getByTestId('anthropic-article-row')
    // 左边框保持橙色
    expect(row).toHaveClass('border-l-ember')
    // 上/右/下边框为未导入文章左边框同色
    expect(row.className).toContain('border-t-[rgba(232,213,183,0.12)]')
    expect(row.className).toContain('border-r-[rgba(232,213,183,0.12)]')
    expect(row.className).toContain('border-b-[rgba(232,213,183,0.12)]')
  })

  it('applies dark left border and brown other borders when article is saved (newspaper)', () => {
    render(<AnthropicArticleRow article={article({ isSaved: true, filePath: '/tmp/x.md' })} theme="newspaper" />)
    const row = screen.getByTestId('anthropic-article-row')
    expect(row.className).toContain('border-l-[#1a1a1a]')
    expect(row.className).toContain('border-t-[#c9c3b8]/30')
  })

  it('applies brown top/right/bottom borders when article is unsaved (academic)', () => {
    render(<AnthropicArticleRow article={article({ isSaved: false })} theme="academic" />)
    const row = screen.getByTestId('anthropic-article-row')
    expect(row.className).toContain('border-l-[rgba(232,213,183,0.12)]')
    expect(row.className).toContain('border-t-[rgba(232,213,183,0.12)]')
    expect(row.className).toContain('border-r-[rgba(232,213,183,0.12)]')
    expect(row.className).toContain('border-b-[rgba(232,213,183,0.12)]')
  })

  it('applies brown top/right/bottom borders when article is unsaved (newspaper)', () => {
    render(<AnthropicArticleRow article={article({ isSaved: false })} theme="newspaper" />)
    const row = screen.getByTestId('anthropic-article-row')
    expect(row.className).toContain('border-l-[#c9c3b8]/30')
    expect(row.className).toContain('border-t-[#c9c3b8]/30')
    expect(row.className).toContain('border-r-[#c9c3b8]/30')
    expect(row.className).toContain('border-b-[#c9c3b8]/30')
  })

  it('does not render article summary', () => {
    render(<AnthropicArticleRow article={article({ summary: 'A great article about AI' })} theme="academic" />)
    expect(screen.queryByText('A great article about AI')).not.toBeInTheDocument()
  })

  it('truncates title by default and removes line-clamp on hover', () => {
    render(<AnthropicArticleRow article={article()} theme="academic" />)
    const title = screen.getByTestId('anthropic-article-title')
    expect(title).toHaveClass('line-clamp-1')
    fireEvent.mouseEnter(screen.getByTestId('anthropic-article-row'))
    expect(title).not.toHaveClass('line-clamp-1')
  })
})
