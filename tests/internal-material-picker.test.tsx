import { beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { InternalMaterialPickerModal } from '@/components/InternalMaterialPickerModal'
import { PreStudyModal } from '@/components/PreStudyModal'
import { ipc } from '@/lib/ipc'
import { useStore } from '@/store'
import type { NoteEntry } from '@shared/index'

vi.mock('@/lib/ipc', () => ({
  ipc: { writingRead: vi.fn(), searchCheckConfig: vi.fn().mockResolvedValue({ configured: false }) },
}))

const note: NoteEntry = {
  path: 'notes/JTBD.md',
  meta: {
    title: 'JTBD 笔记',
    url: 'https://example.com/jtbd',
    source: 'web',
    rating: 0,
    summary: '',
    highlight: '',
    collected_at: '2026-11-22',
  },
}

describe('InternalMaterialPickerModal', () => {
  beforeEach(() => {
    cleanup()
    vi.clearAllMocks()
    useStore.setState({
      notesList: [note],
      notesCategory: 'all',
      notesSortBy: 'time',
      writingTree: {
        writing: [{ kind: 'file', name: '产品资料.md', path: 'writing/产品资料.md' }],
        repository: [{ kind: 'file', name: '访谈仓库.md', path: 'repository/访谈仓库.md' }],
      },
      writingOrder: {},
      writingExpandedGroups: {},
      writingUIFontSize: 'base',
      loadNotes: vi.fn(),
      loadWritingTree: vi.fn(),
    } as any)
    vi.mocked(ipc.writingRead).mockImplementation(async ({ path }) => ({
      ok: true,
      value: { frontmatter: {}, body: `${path} 的正文` },
    }))
  })

  it.each([
    ['资料', '产品资料', 'writing/产品资料.md', '产品资料.md'],
    ['仓库', '访谈仓库', 'repository/访谈仓库.md', '访谈仓库.md'],
    ['笔记', 'JTBD 笔记', 'notes/JTBD.md', 'JTBD.md'],
  ])('可从%s选择并读取为学习资料', async (_section, row, path, name) => {
    const onSelect = vi.fn()
    const onClose = vi.fn()
    render(<InternalMaterialPickerModal onSelect={onSelect} onClose={onClose} />)

    fireEvent.click(screen.getByText(row))

    await waitFor(() => expect(onSelect).toHaveBeenCalledWith({ name, content: `${path} 的正文` }))
    expect(ipc.writingRead).toHaveBeenCalledWith({ path })
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('读取失败时保留弹窗并提示，可重新选择', async () => {
    vi.mocked(ipc.writingRead).mockResolvedValue({ ok: false, code: 'WRITING_IO_ERROR', message: '磁盘错误' })
    const onSelect = vi.fn()
    const onClose = vi.fn()
    render(<InternalMaterialPickerModal onSelect={onSelect} onClose={onClose} />)

    fireEvent.click(screen.getByText('产品资料'))

    expect(await screen.findByRole('alert')).toHaveTextContent('磁盘错误')
    expect(onSelect).not.toHaveBeenCalled()
    expect(onClose).not.toHaveBeenCalled()
  })

  it('非文本资料不进入学习上下文', async () => {
    useStore.setState({
      writingTree: {
        writing: [{ kind: 'file', name: '表格.xlsx', path: 'writing/表格.xlsx' }],
        repository: [],
      },
    } as any)
    const onSelect = vi.fn()
    render(<InternalMaterialPickerModal onSelect={onSelect} onClose={vi.fn()} />)

    fireEvent.click(screen.getByText('表格.xlsx'))

    expect(await screen.findByRole('alert')).toHaveTextContent('仅支持 Markdown / TXT 资料')
    expect(ipc.writingRead).not.toHaveBeenCalled()
    expect(onSelect).not.toHaveBeenCalled()
  })

  it('学习开始前可打开二级弹窗，选中资料出现在待注入列表', async () => {
    useStore.setState({
      preStudyArgs: { mode: 'progress', topic: '产品思维' },
      briefingTheme: 'academic',
    } as any)
    render(<PreStudyModal />)

    fireEvent.click(screen.getByTestId('internal-material-add'))
    expect(screen.getByTestId('internal-material-picker')).toBeInTheDocument()
    fireEvent.click(screen.getByText('产品资料'))

    await waitFor(() => expect(screen.queryByTestId('internal-material-picker')).not.toBeInTheDocument())
    expect(screen.getByText(/产品资料\.md/)).toBeInTheDocument()
    expect(screen.getByTestId('local-material-remove-0')).toBeInTheDocument()
  })
})
