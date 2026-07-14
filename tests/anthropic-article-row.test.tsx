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

  it('applies ember left border when article is saved', () => {
    render(<AnthropicArticleRow article={article({ isSaved: true, filePath: '/tmp/x.md' })} theme="academic" />)
    const row = screen.getByTestId('anthropic-article-row')
    expect(row).toHaveClass('border-l-ember')
  })

  it('applies subtle left border when article is unsaved', () => {
    render(<AnthropicArticleRow article={article({ isSaved: false })} theme="academic" />)
    const row = screen.getByTestId('anthropic-article-row')
    expect(row.className).toContain('border-l-[rgba(232,213,183,0.12)]')
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
