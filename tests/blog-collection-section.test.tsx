import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react'

const mockIpc = vi.hoisted(() => ({
  readMd: vi.fn().mockResolvedValue({ frontmatter: { title: 'x' }, body: '正文' }),
  anthropicCollectionRemoveRead: vi.fn().mockResolvedValue({ ok: true, collection: { version: 1, entries: [], dismissed: [], history: [], read: [] } }),
}))
vi.mock('@/lib/ipc', () => ({ ipc: mockIpc }))

import { useStore } from '@/store'
import { BlogCollectionSection } from '@/components/anthropic/BlogCollectionSection'
import type { BlogCollectionFile } from '@/types'

const newBatchCollection: BlogCollectionFile = {
  version: 1,
  entries: [],
  dismissed: [],
  history: [{
    batch: 2,
    generatedAt: '2026-08-30T00:15:50.000Z',
    focus: '构建 coding agent 评测集的原则',
    profile: '画像散文',
    gaps: ['缺口一'],
    queries: ['evaluation'],
    searchUsed: true,
    picks: [{ sourceUrl: 'https://anthropic.com/a', title: '文章甲', filePath: 'lib/a.md', reason: '理由甲', gap: '缺口一' }],
  }],
  read: [{ sourceUrl: 'https://anthropic.com/r', title: '已读文', filePath: 'lib/r.md', readAt: '2026-08-30T00:00:00.000Z' }],
}

describe('BlogCollectionSection', () => {
  beforeEach(() => {
    cleanup()
    vi.clearAllMocks()
    useStore.setState({
      blogCollection: newBatchCollection,
      recommendRunning: false,
      recommendStage: null,
      briefingFontSize: 'base',
      openAnthropicReader: vi.fn(),
      showToast: vi.fn(),
    } as any)
  })

  it('已读文件夹默认折叠，展开后可打开/移出；已读为空时不渲染已读区', async () => {
    render(<BlogCollectionSection theme="academic" />)
    const toggle = screen.getByTestId('blog-read-toggle')
    expect(toggle).toHaveTextContent('已读（1）')
    expect(screen.queryByTestId('blog-read-open-https://anthropic.com/r')).not.toBeInTheDocument()
    fireEvent.click(toggle)
    expect(screen.getByTestId('blog-read-open-https://anthropic.com/r')).toBeInTheDocument()
    fireEvent.click(screen.getByTestId('blog-read-remove-https://anthropic.com/r'))
    await waitFor(() => expect(mockIpc.anthropicCollectionRemoveRead).toHaveBeenCalledWith({ sourceUrl: 'https://anthropic.com/r' }))

    // 已读为空时不渲染已读区
    cleanup()
    useStore.setState({ blogCollection: { ...newBatchCollection, read: [] } } as any)
    render(<BlogCollectionSection theme="academic" />)
    expect(screen.queryByTestId('blog-read-section')).not.toBeInTheDocument()
  })

  it('字号跟随 briefingFontSize（base → 3xl 后 meta 字号变大）', () => {
    const { unmount } = render(<BlogCollectionSection theme="academic" />)
    const baseSize = screen.getByTestId('blog-read-toggle').style.fontSize
    unmount()
    cleanup()
    useStore.setState({ briefingFontSize: '3xl' } as any)
    render(<BlogCollectionSection theme="academic" />)
    const bigSize = screen.getByTestId('blog-read-toggle').style.fontSize
    expect(parseInt(bigSize)).toBeGreaterThan(parseInt(baseSize))
  })

  it('推荐按钮文案为「重新推荐」，且不再有往期历史入口', () => {
    render(<BlogCollectionSection theme="academic" />)
    expect(screen.getByTestId('blog-recommend-button')).toHaveTextContent('重新推荐')
    expect(screen.queryByTestId('blog-recommend-history')).not.toBeInTheDocument()
  })
})
