import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react'

const mockIpc = vi.hoisted(() => ({
  readMd: vi.fn().mockResolvedValue({ frontmatter: { title: 'x' }, body: '正文' }),
  anthropicCollectionRemoveBatch: vi.fn(),
  anthropicCollectionMarkRead: vi.fn().mockResolvedValue({ ok: true }),
}))
vi.mock('@/lib/ipc', () => ({ ipc: mockIpc }))

import { useStore } from '@/store'
import { BlogRecommendView } from '@/components/anthropic/BlogRecommendView'
import type { BlogCollectionFile } from '@/types'

const pick = (n: number) => ({
  sourceUrl: `https://anthropic.com/p${n}`, title: `文章${n}`, filePath: `lib/p${n}.md`,
  reason: `理由${n}`, gap: '缺口一', guide: `导读${n}`,
})
const collectionWith = (history: BlogCollectionFile['history']): BlogCollectionFile => ({
  version: 1, entries: [], dismissed: [], history, read: [],
})
const newBatch = {
  batch: 2, generatedAt: '2026-08-30T00:15:50.000Z', focus: '评测集构建',
  profile: '画像全文', gaps: ['缺口一'], queries: ['evaluation'], searchUsed: true,
  picks: [pick(1), pick(2)],
}
const oldBatch = { batch: 1, generatedAt: '2026-08-01T00:00:00.000Z', profile: '旧画像', gaps: ['旧缺口'], queries: ['q'], searchUsed: false }

describe('BlogRecommendView', () => {
  beforeEach(() => {
    cleanup()
    vi.clearAllMocks()
    useStore.setState({
      blogCollection: collectionWith([newBatch, oldBatch]),
      recommendViewBatch: 2,
      briefingFontSize: 'base',
      openRecommendView: vi.fn((b: number) => useStore.setState({ recommendViewBatch: b })),
      closeRecommendView: vi.fn(() => useStore.setState({ recommendViewBatch: null })),
      removeBlogBatch: vi.fn(),
      toggleBlogCollection: vi.fn(),
      toggleBlogRead: vi.fn(),
      openAnthropicReader: vi.fn(),
      showToast: vi.fn(),
    } as any)
  })

  it('渲染核心方向/画像/知识缺口/逐篇导读与理由', () => {
    render(<BlogRecommendView theme="academic" />)
    expect(screen.getByTestId('blog-rec-view')).toBeInTheDocument()
    expect(screen.getByText(/评测集构建/)).toBeInTheDocument()
    expect(screen.getByText('画像全文')).toBeInTheDocument()
    expect(screen.getAllByText(/缺口一/).length).toBeGreaterThan(0)
    expect(screen.getByText('导读1')).toBeInTheDocument()
    expect(screen.getByText(/理由1/)).toBeInTheDocument()
  })

  it('批次切换：上一批到旧批次并降级渲染，边界置灰', () => {
    render(<BlogRecommendView theme="academic" />)
    expect(screen.getByTestId('blog-rec-next')).toBeDisabled()   // 已是最新
    fireEvent.click(screen.getByTestId('blog-rec-prev'))
    expect(screen.getByText('旧画像')).toBeInTheDocument()
    expect(screen.queryByTestId(/^blog-rec-pick-/)).not.toBeInTheDocument()
    expect(screen.getByTestId('blog-rec-prev')).toBeDisabled()   // 已是最旧
  })

  it('删除本批调用 removeBlogBatch', () => {
    render(<BlogRecommendView theme="academic" />)
    fireEvent.click(screen.getByTestId('blog-rec-delete-batch'))
    expect(useStore.getState().removeBlogBatch).toHaveBeenCalledWith(2)
  })

  it('无历史时渲染空态引导', () => {
    useStore.setState({ blogCollection: collectionWith([]), recommendViewBatch: 1 } as any)
    render(<BlogRecommendView theme="academic" />)
    expect(screen.getByTestId('blog-rec-empty')).toBeInTheDocument()
  })

  it('逐篇卡片点标题打开阅读器', async () => {
    render(<BlogRecommendView theme="academic" />)
    fireEvent.click(screen.getByTestId('blog-rec-pick-https://anthropic.com/p1'))
    await waitFor(() => expect(mockIpc.readMd).toHaveBeenCalledWith('lib/p1.md'))
    expect(useStore.getState().openAnthropicReader).toHaveBeenCalledWith('lib/p1.md')
  })
})
