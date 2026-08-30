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

const oldBatchCollection: BlogCollectionFile = {
  version: 1, entries: [], dismissed: [],
  history: [{ batch: 1, generatedAt: '2026-08-01T00:00:00.000Z', profile: '旧画像', gaps: ['旧缺口'], queries: ['q'], searchUsed: false }],
  read: [],
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

  it('新批次历史卡片显示核心方向与逐篇挂钩', () => {
    render(<BlogCollectionSection theme="academic" />)
    fireEvent.click(screen.getByTestId('blog-recommend-history'))
    expect(screen.getByText(/构建 coding agent 评测集的原则/)).toBeInTheDocument()
    expect(screen.getByTestId('blog-history-pick-https://anthropic.com/a')).toHaveTextContent('文章甲')
    expect(screen.getByText(/理由甲/)).toBeInTheDocument()
  })

  it('点击逐篇条目打开阅读器', async () => {
    const openReader = vi.fn()
    useStore.setState({ openAnthropicReader: openReader } as any)
    render(<BlogCollectionSection theme="academic" />)
    fireEvent.click(screen.getByTestId('blog-recommend-history'))
    fireEvent.click(screen.getByTestId('blog-history-pick-https://anthropic.com/a'))
    await waitFor(() => expect(mockIpc.readMd).toHaveBeenCalledWith('lib/a.md'))
    expect(openReader).toHaveBeenCalledWith('lib/a.md')
  })

  it('旧批次（无 focus/picks）按原样式降级渲染', () => {
    useStore.setState({ blogCollection: oldBatchCollection } as any)
    render(<BlogCollectionSection theme="academic" />)
    fireEvent.click(screen.getByTestId('blog-recommend-history'))
    expect(screen.getByText('旧画像')).toBeInTheDocument()
    expect(screen.queryByTestId(/^blog-history-pick-/)).not.toBeInTheDocument()
    // 已读为空时不渲染已读区
    expect(screen.queryByTestId('blog-read-section')).not.toBeInTheDocument()
  })

  it('已读文件夹默认折叠，展开后可打开/移出', async () => {
    render(<BlogCollectionSection theme="academic" />)
    const toggle = screen.getByTestId('blog-read-toggle')
    expect(toggle).toHaveTextContent('已读（1）')
    expect(screen.queryByTestId('blog-read-open-https://anthropic.com/r')).not.toBeInTheDocument()
    fireEvent.click(toggle)
    expect(screen.getByTestId('blog-read-open-https://anthropic.com/r')).toBeInTheDocument()
    fireEvent.click(screen.getByTestId('blog-read-remove-https://anthropic.com/r'))
    await waitFor(() => expect(mockIpc.anthropicCollectionRemoveRead).toHaveBeenCalledWith({ sourceUrl: 'https://anthropic.com/r' }))
  })

  it('字号跟随 briefingFontSize（base → 3xl 后标题字号变大）', () => {
    const { unmount } = render(<BlogCollectionSection theme="academic" />)
    fireEvent.click(screen.getByTestId('blog-recommend-history'))
    const baseSize = screen.getByTestId('blog-history-pick-https://anthropic.com/a').style.fontSize
    unmount()
    cleanup()
    useStore.setState({ briefingFontSize: '3xl' } as any)
    render(<BlogCollectionSection theme="academic" />)
    fireEvent.click(screen.getByTestId('blog-recommend-history'))
    const bigSize = screen.getByTestId('blog-history-pick-https://anthropic.com/a').style.fontSize
    expect(parseInt(bigSize)).toBeGreaterThan(parseInt(baseSize))
  })
})
