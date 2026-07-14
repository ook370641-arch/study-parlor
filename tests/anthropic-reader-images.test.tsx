import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, cleanup, waitFor } from '@testing-library/react'

vi.mock('@/lib/ipc', () => ({
  ipc: {
    readMd: vi.fn(),
    readAssetAsDataUrl: vi.fn(),
    openExternal: vi.fn(),
    articleAssistantReadSession: vi.fn(),
    articleAssistantWriteSession: vi.fn(),
    articleAssistantGenerateGuide: vi.fn(),
    articleAssistantSendMessage: vi.fn(),
    articleAssistantAbort: vi.fn(),
    annotationsRead: vi.fn().mockResolvedValue([]),
    annotationsWrite: vi.fn().mockResolvedValue(undefined),
  }
}))

import { ipc } from '@/lib/ipc'
import { AnthropicArticleReader } from '@/components/anthropic/AnthropicArticleReader'

const mockedReadMd = vi.mocked(ipc.readMd)
const mockedReadAssetAsDataUrl = vi.mocked(ipc.readAssetAsDataUrl)

const TEST_FILE_PATH = 'C:/Users/test/Anthropic博客/2026-07/article.md'

describe('AnthropicArticleReader image inlining', () => {
  beforeEach(() => {
    cleanup()
    vi.clearAllMocks()
    mockedReadAssetAsDataUrl.mockResolvedValue('data:image/png;base64,abc123')
    mockedReadMd.mockResolvedValue({
      frontmatter: {
        title: 'Test Article',
        type: 'anthropic-article',
        source_url: 'https://www.anthropic.com/engineering/test',
        created: new Date().toISOString(),
      },
      body: '![](./.assets/image.png)',
    })
  })

  it('inlines local asset paths as data URLs', async () => {
    render(<AnthropicArticleReader filePath={TEST_FILE_PATH} theme="academic" />)

    const img = await waitFor(() => screen.getByTestId('md-image'))
    expect(img).toHaveAttribute('src', 'data:image/png;base64,abc123')
    expect(mockedReadAssetAsDataUrl).toHaveBeenCalledWith(
      TEST_FILE_PATH,
      './.assets/image.png'
    )
  })

  it('leaves absolute HTTP image URLs unchanged', async () => {
    mockedReadMd.mockResolvedValueOnce({
      frontmatter: {
        title: 'Test Article',
        type: 'anthropic-article',
        source_url: 'https://www.anthropic.com/engineering/test',
        created: new Date().toISOString(),
      },
      body: '![](https://example.com/image.png)',
    })

    render(<AnthropicArticleReader filePath={TEST_FILE_PATH} theme="academic" />)

    const img = await waitFor(() => screen.getByTestId('md-image'))
    expect(img).toHaveAttribute('src', 'https://example.com/image.png')
    expect(mockedReadAssetAsDataUrl).not.toHaveBeenCalled()
  })

  it('does not render the back-to-list button', async () => {
    render(<AnthropicArticleReader filePath={TEST_FILE_PATH} theme="academic" />)
    await waitFor(() => screen.getByTestId('anthropic-reader-title'))
    expect(screen.queryByTestId('anthropic-reader-close')).not.toBeInTheDocument()
  })
})
