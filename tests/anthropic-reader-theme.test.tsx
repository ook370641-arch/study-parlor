import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'

vi.mock('@/lib/ipc', () => ({
  ipc: {
    readMd: vi.fn().mockResolvedValue({
      frontmatter: {
        title: 'Test Article',
        type: 'anthropic-article',
        source_url: 'https://www.anthropic.com/engineering/test',
        created: new Date().toISOString(),
      },
      body: 'Hello world.',
    }),
    openExternal: vi.fn(),
    readAssetAsDataUrl: vi.fn(),
    articleAssistantReadSession: vi.fn(),
    articleAssistantWriteSession: vi.fn(),
    articleAssistantGenerateGuide: vi.fn(),
    articleAssistantSendMessage: vi.fn(),
    articleAssistantAbort: vi.fn(),
  }
}))

import { AnthropicArticleReader } from '@/components/anthropic/AnthropicArticleReader'

describe('AnthropicArticleReader theme', () => {
  beforeEach(() => {
    cleanup()
  })

  it('uses translucent ink background in academic theme', () => {
    render(<AnthropicArticleReader filePath="/tmp/test.md" theme="academic" />)
    const reader = screen.getByTestId('anthropic-article-reader')
    expect(reader).toHaveClass('bg-transparent')
  })

  it('uses opaque white background in newspaper theme', () => {
    render(<AnthropicArticleReader filePath="/tmp/test.md" theme="newspaper" />)
    const reader = screen.getByTestId('anthropic-article-reader')
    expect(reader).toHaveClass('bg-white')
  })
})
