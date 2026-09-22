import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'

afterEach(cleanup)

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

  it('已读区默认折叠，展开后点移出按钮上抛 read 复合删除请求；已读为空时不渲染已读区', () => {
    const onRequestRemove = vi.fn()
    render(<BlogCollectionSection theme="academic" onRequestRemove={onRequestRemove} />)
    expect(screen.queryByTestId('blog-read-open-https://anthropic.com/r')).not.toBeInTheDocument()
    fireEvent.click(screen.getByTestId('blog-read-toggle'))
    expect(screen.getByTestId('blog-read-open-https://anthropic.com/r')).toBeInTheDocument()
    fireEvent.click(screen.getByTestId('blog-read-remove-https://anthropic.com/r'))
    expect(onRequestRemove).toHaveBeenCalledWith({
      kind: 'read', sourceUrl: 'https://anthropic.com/r', filePath: 'lib/r.md', title: '已读文',
    })
    // 不再直接调 IPC
    expect(mockIpc.anthropicCollectionRemoveRead).not.toHaveBeenCalled()

    // 已读为空时不渲染已读区
    cleanup()
    useStore.setState({ blogCollection: { ...newBatchCollection, read: [] } } as any)
    render(<BlogCollectionSection theme="academic" onRequestRemove={vi.fn()} />)
    expect(screen.queryByTestId('blog-read-section')).not.toBeInTheDocument()
  })

  it('区头为图标+计数（无「已读」文字标签）', () => {
    render(<BlogCollectionSection theme="academic" onRequestRemove={vi.fn()} />)
    expect(screen.getByTestId('blog-read-count')).toHaveTextContent('1')
    expect(screen.getByTestId('blog-read-toggle')).toHaveAttribute('title', '已读')
  })

  it('收藏夹排序：手动在前，推荐（💡）后置，组内保序', () => {
    useStore.setState({
      blogCollection: {
        version: 1, dismissed: [], history: [], read: [],
        entries: [
          { sourceUrl: 'u-r1', filePath: 'lib/r1.md', title: '推荐一', addedAt: 'a', origin: 'recommend' as const, batch: 1, reason: 'r', gap: 'g' },
          { sourceUrl: 'u-m1', filePath: 'lib/m1.md', title: '手动一', addedAt: 'b', origin: 'manual' as const },
          { sourceUrl: 'u-r2', filePath: 'lib/r2.md', title: '推荐二', addedAt: 'c', origin: 'recommend' as const, batch: 1, reason: 'r', gap: 'g' },
          { sourceUrl: 'u-m2', filePath: 'lib/m2.md', title: '手动二', addedAt: 'd', origin: 'manual' as const },
        ],
      },
    } as any)
    render(<BlogCollectionSection theme="academic" onRequestRemove={vi.fn()} />)
    const titles = screen.getAllByTestId(/^blog-collection-open-/).map((n) => n.textContent)
    expect(titles).toEqual(['手动一', '手动二', '推荐一', '推荐二'])
  })

  it('收藏夹卡片只有移出+已读两按钮；移出上抛 collection 复合删除请求', () => {
    const onRequestRemove = vi.fn()
    useStore.setState({
      blogCollection: {
        version: 1, dismissed: [], history: [], read: [],
        entries: [{ sourceUrl: 'u-m1', filePath: 'lib/m1.md', title: '手动一', addedAt: 'b', origin: 'manual' as const }],
      },
    } as any)
    render(<BlogCollectionSection theme="academic" onRequestRemove={onRequestRemove} />)
    fireEvent.click(screen.getByTestId('blog-collection-remove-u-m1'))
    expect(onRequestRemove).toHaveBeenCalledWith({
      kind: 'collection', sourceUrl: 'u-m1', filePath: 'lib/m1.md', title: '手动一',
    })
    // 卡片内有已读 toggle（书图标），无收藏 toggle
    expect(screen.getByTestId('blog-collection-read-u-m1')).toBeInTheDocument()
    expect(screen.queryByTestId('blog-fav-toggle')).not.toBeInTheDocument()
  })

  it('字号跟随 briefingFontSize（base → 3xl 后区头计数字号变大）', () => {
    const { unmount } = render(<BlogCollectionSection theme="academic" onRequestRemove={vi.fn()} />)
    const baseSize = screen.getByTestId('blog-read-count').style.fontSize
    unmount()
    cleanup()
    useStore.setState({ briefingFontSize: '3xl' } as any)
    render(<BlogCollectionSection theme="academic" onRequestRemove={vi.fn()} />)
    const bigSize = screen.getByTestId('blog-read-count').style.fontSize
    expect(parseInt(bigSize)).toBeGreaterThan(parseInt(baseSize))
  })

  it('推荐按钮 title 为「重新推荐」，且不再有往期历史入口', () => {
    render(<BlogCollectionSection theme="academic" onRequestRemove={vi.fn()} />)
    expect(screen.getByTestId('blog-recommend-button')).toHaveAttribute('title', '重新推荐')
    expect(screen.queryByTestId('blog-recommend-history')).not.toBeInTheDocument()
  })
})
