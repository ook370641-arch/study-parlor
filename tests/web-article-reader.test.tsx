import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, cleanup, waitFor } from '@testing-library/react'

vi.mock('@/lib/ipc', () => ({
  ipc: {
    readMd: vi.fn().mockResolvedValue({
      frontmatter: {
        title: 'The Second Half',
        type: 'web-article',
        source_url: 'https://ysymyth.github.io/The-Second-Half/',
        source_name: 'ysymyth.github.io',
        published_at: '2025-04-10T00:00:00.000Z',
        authors: ['Shunyu Yao'],
      },
      body: '# The Second Half\n\ntldr: halftime.',
    }),
    readAssetAsDataUrl: vi.fn(),
    openExternal: vi.fn(),
    annotationsRead: vi.fn().mockResolvedValue([]),
    annotationsWrite: vi.fn().mockResolvedValue(undefined),
  },
}))

import { AnthropicArticleReader } from '@/components/anthropic/AnthropicArticleReader'

describe('web-article reader', () => {
  beforeEach(() => {
    cleanup()
  })

  it('renders generic header with title, source link, date and authors for web-article', async () => {
    render(<AnthropicArticleReader filePath="/lib/拾贝/文章/2025-04/The Second Half.md" theme="academic" />)

    // Title renders
    expect(await screen.findByTestId('anthropic-reader-title')).toHaveTextContent('The Second Half')

    // Source link renders with correct attributes
    const link = screen.getByRole('link', { name: /ysymyth\.github\.io/ })
    expect(link).toHaveAttribute('href', 'https://ysymyth.github.io/The-Second-Half/')
    expect(link).toHaveAttribute('target', '_blank')
    expect(link).toHaveAttribute('rel', expect.stringContaining('noopener'))

    // Authors render
    expect(screen.getByText(/Shunyu Yao/)).toBeInTheDocument()
  })

  it('does not show the Anthropic Engineering button for web-article', async () => {
    render(<AnthropicArticleReader filePath="/lib/拾贝/文章/2025-04/The Second Half.md" theme="academic" />)
    await screen.findByTestId('anthropic-reader-title')
    // The hardcoded "Anthropic Engineering" text should not appear
    expect(screen.queryByText('Anthropic Engineering')).not.toBeInTheDocument()
    // No "导入" label either — web-article does not show imported_at
    expect(screen.queryByText(/^导入：/)).not.toBeInTheDocument()
  })

  it('renders with newspaper theme for web-article', async () => {
    render(<AnthropicArticleReader filePath="/lib/拾贝/文章/2025-04/The Second Half.md" theme="newspaper" />)
    const reader = screen.getByTestId('anthropic-article-reader')
    await waitFor(() => expect(reader).toHaveClass('bg-white'))
  })
})
