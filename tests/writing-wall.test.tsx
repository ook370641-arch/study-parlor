import { beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import type { NoteCoverCandidate, WritingTreeNode } from '@shared/index'
import { buildWritingWallGroups } from '@/lib/writing-wall'
import { WritingWall } from '@/components/writing/WritingWall'
import { useStore } from '@/store'
import { ipc } from '@/lib/ipc'

vi.mock('@/lib/ipc', () => ({ ipc: { writingDelete: vi.fn(), writingGenerateCovers: vi.fn(), writingSaveCover: vi.fn() } }))

const nestedTree: WritingTreeNode[] = [{
  kind: 'dir', name: '研究', path: 'writing/研究', children: [{
    kind: 'dir', name: '访谈', path: 'writing/研究/访谈', children: [
      { kind: 'file', name: '短.md', path: 'writing/研究/访谈/短.md', wordCount: 20, mtimeMs: 10 },
      { kind: 'file', name: '长.md', path: 'writing/研究/访谈/长.md', wordCount: 120, mtimeMs: 20 },
    ],
  }],
}, { kind: 'file', name: '根.md', path: 'writing/根.md', wordCount: 5, mtimeMs: 30 }]

beforeEach(() => {
  cleanup()
  vi.clearAllMocks()
  useStore.setState({
    writingTree: { writing: nestedTree, repository: [] },
    writingOrder: {},
    writingUIFontSize: 'base',
    selectWritingFile: vi.fn(),
    loadWritingTree: vi.fn(),
    showToast: vi.fn(),
  } as any)
})

describe('buildWritingWallGroups', () => {
  it('文件只进入实际目录，嵌套组显示路径，根文件进未分组', () => {
    expect(buildWritingWallGroups(nestedTree, 'default', {}).map(group => group.label)).toEqual(['研究 / 访谈', '未分组'])
    expect(buildWritingWallGroups(nestedTree, 'default', '')[0]?.files).toHaveLength(2)
  })

  it('最近修改和字数只在组内排序', () => {
    expect(buildWritingWallGroups(nestedTree, 'modified', {})[0].files.map(file => file.name)).toEqual(['长.md', '短.md'])
    expect(buildWritingWallGroups(nestedTree, 'words', {})[0].files.map(file => file.name)).toEqual(['长.md', '短.md'])
  })
})

describe('WritingWall', () => {
  it('支持打开、分组折叠、组内排序和 hover 字数', () => {
    render(<WritingWall root="writing" />)
    expect(screen.getByTestId('writing-wall-writing')).toHaveAttribute('data-album-wall', 'writing')
    expect(screen.getAllByTestId(/^writing-wall-card-/)).toHaveLength(3)
    expect(screen.getByTestId('writing-wall-word-count-writing/研究/访谈/长.md')).toHaveTextContent('120 字')
    expect(screen.getByTestId('writing-wall-word-count-writing/研究/访谈/长.md').parentElement).toHaveClass('opacity-0', 'group-hover:opacity-100')

    fireEvent.click(screen.getByTestId('writing-wall-card-writing/研究/访谈/短.md'))
    expect(useStore.getState().selectWritingFile).toHaveBeenCalledWith('writing/研究/访谈/短.md')

    fireEvent.click(screen.getByRole('button', { name: '收起研究 / 访谈' }))
    expect(screen.queryByTestId('writing-wall-card-writing/研究/访谈/短.md')).not.toBeInTheDocument()
    expect(screen.getByTestId('writing-wall-card-writing/根.md')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '展开研究 / 访谈' }))

    fireEvent.change(screen.getByTestId('writing-wall-sort-writing'), { target: { value: 'words' } })
    expect(screen.getByTestId('writing-wall-grid-writing/研究/访谈')).toHaveAttribute('data-order', 'writing/研究/访谈/长.md,writing/研究/访谈/短.md')
  })

  it('删除卡片需要确认，成功后刷新且保持墙模式', async () => {
    vi.mocked(ipc.writingDelete).mockResolvedValue({ ok: true, value: { moved: [] } })
    render(<WritingWall root="writing" />)
    fireEvent.click(screen.getByTestId('writing-wall-delete-writing/根.md'))
    expect(screen.getByTestId('confirm-dialog')).toBeInTheDocument()
    fireEvent.click(screen.getByTestId('confirm-dialog-cancel'))
    expect(ipc.writingDelete).not.toHaveBeenCalled()

    fireEvent.click(screen.getByTestId('writing-wall-delete-writing/根.md'))
    fireEvent.click(screen.getByTestId('confirm-dialog-confirm'))
    expect(ipc.writingDelete).toHaveBeenCalledWith({ path: 'writing/根.md' })
    expect(await vi.waitFor(() => expect(useStore.getState().loadWritingTree).toHaveBeenCalled()))
  })

  it('文章封面静默生成三候选，保存失败保留候选供重试', async () => {
    const candidates: NoteCoverCandidate[] = [0, 1, 2].map(index => ({
      design: {
        concept: `候选 ${index}`,
        palette: { background: '#211a18', ink: '#e8d5b7', accent: '#d97757', secondary: '#6f8892' },
        background: 'linear', grain: 0.06,
        elements: [
          { type: 'circle', cx: 100, cy: 100, r: 40 },
          { type: 'rect', x: 10, y: 10, width: 20, height: 20 },
          { type: 'line', x1: 0, y1: 0, x2: 10, y2: 10 },
        ],
      },
      svgDataUrl: `data:image/svg+xml;base64,candidate-${index}`,
    }))
    vi.mocked(ipc.writingGenerateCovers).mockResolvedValue({ ok: true, value: { candidates } })
    vi.mocked(ipc.writingSaveCover)
      .mockResolvedValueOnce({ ok: false, code: 'WRITING_IO_ERROR', message: '失败' })
      .mockResolvedValueOnce({ ok: true, value: { cover: 'writing/.covers/a.svg', coverUrl: candidates[0].svgDataUrl } })
    render(<WritingWall root="writing" />)
    const card = screen.getByTestId('writing-wall-card-writing/根.md')

    fireEvent.click(within(card).getByTestId('writing-cover-generate'))
    await vi.waitFor(() => expect(within(card).getByTestId('writing-cover-generate')).toHaveTextContent('待挑选'))
    expect(screen.queryByTestId('writing-cover-dialog')).not.toBeInTheDocument()
    fireEvent.click(within(card).getByTestId('writing-cover-generate'))
    expect(screen.getAllByTestId('writing-cover-candidate')).toHaveLength(3)

    fireEvent.click(screen.getAllByTestId('writing-cover-select')[0])
    await vi.waitFor(() => expect(useStore.getState().showToast).toHaveBeenCalledWith('封面保存失败'))
    expect(screen.getByTestId('writing-cover-dialog')).toBeInTheDocument()
    expect(screen.getAllByTestId('writing-cover-candidate')).toHaveLength(3)

    fireEvent.click(screen.getAllByTestId('writing-cover-select')[0])
    await vi.waitFor(() => expect(useStore.getState().loadWritingTree).toHaveBeenCalled())
    expect(screen.queryByTestId('writing-cover-dialog')).not.toBeInTheDocument()
  })

  it('显示安全封面，非 Markdown 不提供 AI 封面', () => {
    useStore.setState({ writingTree: { writing: [
      { kind: 'file', name: '封面.md', path: 'writing/封面.md', coverUrl: 'data:image/svg+xml;base64,safe' },
      { kind: 'file', name: '资料.pdf', path: 'writing/资料.pdf' },
    ], repository: [] } })
    render(<WritingWall root="writing" />)
    const covered = screen.getByTestId('writing-wall-card-writing/封面.md')
    const pdf = screen.getByTestId('writing-wall-card-writing/资料.pdf')
    expect(within(covered).getByRole('img', { name: '封面.md 封面' })).toHaveAttribute('src', 'data:image/svg+xml;base64,safe')
    expect(within(covered).getByTestId('writing-cover-generate')).toHaveTextContent('重新生成')
    expect(within(pdf).queryByTestId('writing-cover-generate')).not.toBeInTheDocument()
  })
})
