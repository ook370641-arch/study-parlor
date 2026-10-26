import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react'

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
    annotationsRead: vi.fn().mockResolvedValue([]),
    annotationsWrite: vi.fn().mockResolvedValue(undefined),
  }
}))

import { AnthropicArticleReader } from '@/components/anthropic/AnthropicArticleReader'
import { useStore } from '@/store'
import { ipc } from '@/lib/ipc'

function mockReadMd(frontmatter: Record<string, unknown>, body = 'Hello world.') {
  vi.mocked(ipc.readMd).mockResolvedValue({
    frontmatter: {
      title: 'Test Article',
      created: new Date().toISOString(),
      ...frontmatter,
    },
    body,
  })
}

describe('AnthropicArticleReader theme', () => {
  beforeEach(() => {
    cleanup()
  })

  it('uses translucent ink background in academic theme', () => {
    render(<AnthropicArticleReader filePath="/tmp/test.md" theme="academic" />)
    const reader = screen.getByTestId('anthropic-article-reader')
    expect(reader).toHaveClass('bg-transparent')
  })

  it('返回博客墙时关闭阅读器和文章对照', () => {
    const closeAnthropicReader = vi.fn()
    const closeArticleCompanion = vi.fn()
    useStore.setState({ closeAnthropicReader, closeArticleCompanion })
    render(<AnthropicArticleReader filePath="/tmp/test.md" theme="academic" />)
    fireEvent.click(screen.getByTestId('blog-back-to-wall'))
    expect(closeAnthropicReader).toHaveBeenCalled()
    expect(closeArticleCompanion).toHaveBeenCalled()
    const fontButton = screen.getByTestId('briefing-font-size-decrease')
    expect(fontButton.parentElement).toHaveClass('pointer-events-none')
    expect(fontButton).toHaveClass('pointer-events-auto')
  })

  it('从当前博客生成对应笔记并切换到笔记页打开', async () => {
    const findOrCreateArticleNote = vi.fn().mockResolvedValue({ path: 'notes/test.md', created: true })
    const setBriefingSource = vi.fn().mockResolvedValue(undefined)
    const setWritingListTab = vi.fn()
    const selectWritingFile = vi.fn().mockResolvedValue(undefined)
    useStore.setState({ findOrCreateArticleNote, setBriefingSource, setWritingListTab, selectWritingFile })
    render(<AnthropicArticleReader filePath="/tmp/test.md" theme="academic" />)
    fireEvent.click(await screen.findByTestId('article-note-create'))
    await waitFor(() => {
      expect(findOrCreateArticleNote).toHaveBeenCalledWith({ title: 'Test Article', url: 'https://www.anthropic.com/engineering/test' })
      expect(setBriefingSource).toHaveBeenCalledWith('writing')
      expect(setWritingListTab).toHaveBeenCalledWith('notes')
      expect(selectWritingFile).toHaveBeenCalledWith('notes/test.md')
    })
  })

  it('uses opaque white background in newspaper theme', () => {
    render(<AnthropicArticleReader filePath="/tmp/test.md" theme="newspaper" />)
    const reader = screen.getByTestId('anthropic-article-reader')
    expect(reader).toHaveClass('bg-white')
  })

  it('renders its own swap painting button in academic theme after load (blog-source swap lives in the reader panel, not page-level)', async () => {
    render(<AnthropicArticleReader filePath="/tmp/test.md" theme="academic" />)
    await screen.findByTestId('anthropic-reader-title')
    expect(screen.getByTestId('anthropic-swap-painting-button')).toBeInTheDocument()
  })

  it('does not render swap painting button in newspaper theme', async () => {
    render(<AnthropicArticleReader filePath="/tmp/test.md" theme="newspaper" />)
    await screen.findByTestId('anthropic-reader-title')
    expect(screen.queryByTestId('anthropic-swap-painting-button')).not.toBeInTheDocument()
  })
})

describe('AnthropicArticleReader source pill section identity', () => {
  beforeEach(() => {
    cleanup()
  })

  it('anthropic-article + section=institute → pill shows Institute with section color', async () => {
    mockReadMd({
      type: 'anthropic-article',
      section: 'institute',
      source_url: 'https://www.anthropic.com/institute/safety-and-responsibility',
    })
    render(<AnthropicArticleReader filePath="/tmp/test.md" theme="academic" />)
    const pill = await screen.findByTestId('anthropic-reader-source-pill')
    expect(pill).toHaveTextContent('Institute')
    expect(pill).not.toHaveTextContent('Anthropic Engineering')
    expect(pill).toHaveStyle({ color: 'rgb(138, 154, 91)' })
  })

  it('anthropic-article without section → back-derives label from URL', async () => {
    mockReadMd({
      type: 'anthropic-article',
      source_url: 'https://www.anthropic.com/research/alignment',
    })
    render(<AnthropicArticleReader filePath="/tmp/test.md" theme="academic" />)
    const pill = await screen.findByTestId('anthropic-reader-source-pill')
    expect(pill).toHaveTextContent('Research')
    expect(pill).toHaveStyle({ color: 'rgb(107, 143, 163)' })
  })

  it('non-anthropic article keeps hardcoded Anthropic Engineering pill', async () => {
    mockReadMd({
      type: 'progress',
      source_url: 'https://example.com/notes',
    })
    render(<AnthropicArticleReader filePath="/tmp/test.md" theme="academic" />)
    const pill = await screen.findByTestId('anthropic-reader-source-pill')
    expect(pill).toHaveTextContent('Anthropic Engineering')
    expect(pill.getAttribute('style')).toBeNull()
  })

  it('does not render source pill when source_url is missing', async () => {
    mockReadMd({ type: 'anthropic-article' })
    render(<AnthropicArticleReader filePath="/tmp/test.md" theme="academic" />)
    await screen.findByTestId('anthropic-reader-title')
    expect(screen.queryByTestId('anthropic-reader-source-pill')).not.toBeInTheDocument()
  })
})
