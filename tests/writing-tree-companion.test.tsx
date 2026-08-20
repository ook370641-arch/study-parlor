import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'

vi.mock('@/lib/ipc', () => ({
  ipc: {
    writingDelete: vi.fn(), writingRename: vi.fn(), writingCreateFile: vi.fn(), writingCreateFolder: vi.fn(), writingMove: vi.fn(),
  },
}))

import { useStore } from '@/store'
import { WritingTree } from '@/components/writing/WritingTree'

const TREE = {
  writing: [
    { kind: 'file', name: 'main.md', path: 'writing/main.md' },
    { kind: 'file', name: 'ref.md', path: 'writing/ref.md' },
    { kind: 'dir', name: '随笔', path: 'writing/随笔', children: [{ kind: 'file', name: 'c.md', path: 'writing/随笔/c.md' }] },
  ],
  repository: [],
}

function seed(overrides: Record<string, unknown> = {}) {
  useStore.setState({
    writingTree: TREE,
    writingFile: { path: 'writing/main.md', body: '', kind: 'md', dirty: false, saving: 'idle' },
    writingExpandedGroups: {},
    writingOrder: {},
    writingAssistantOpen: false,
    writingPanelMode: 'assistant',
    companionFile: null,
    selectWritingFile: vi.fn(),
    selectCompanionFile: vi.fn(),
    loadWritingTree: vi.fn(),
    setWritingGroupExpanded: vi.fn(),
    moveWritingNode: vi.fn(),
    ...overrides,
  } as any)
}

function nodeRow(text: string): HTMLElement {
  const row = screen.getAllByTestId('writing-tree-node').find(n => n.textContent?.includes(text))
  if (!row) throw new Error(`node row not found: ${text}`)
  return row
}

describe('文件树对照交互', () => {
  beforeEach(() => cleanup())

  it('对照模式展开时左键点文章 → selectCompanionFile（不写主文）', () => {
    seed({ writingAssistantOpen: true, writingPanelMode: 'companion' })
    render(<WritingTree root="writing" />)
    fireEvent.click(nodeRow('ref'))
    expect(useStore.getState().selectCompanionFile).toHaveBeenCalledWith('writing/ref.md')
    expect(useStore.getState().selectWritingFile).not.toHaveBeenCalled()
  })

  it('助手模式下左键点文章 → selectWritingFile（现状）', () => {
    seed({ writingAssistantOpen: true, writingPanelMode: 'assistant' })
    render(<WritingTree root="writing" />)
    fireEvent.click(nodeRow('ref'))
    expect(useStore.getState().selectWritingFile).toHaveBeenCalledWith('writing/ref.md')
    expect(useStore.getState().selectCompanionFile).not.toHaveBeenCalled()
  })

  it('右栏折叠时即使对照模式，左键点文章 → selectWritingFile', () => {
    seed({ writingAssistantOpen: false, writingPanelMode: 'companion' })
    render(<WritingTree root="writing" />)
    fireEvent.click(nodeRow('ref'))
    expect(useStore.getState().selectWritingFile).toHaveBeenCalledWith('writing/ref.md')
    expect(useStore.getState().selectCompanionFile).not.toHaveBeenCalled()
  })

  it('目录节点点击仍只展开/收起，不分流', () => {
    seed({ writingAssistantOpen: true, writingPanelMode: 'companion' })
    render(<WritingTree root="writing" />)
    fireEvent.click(nodeRow('随笔'))
    // writing 顶层默认展开（depth 0），点击 = 收起
    expect(useStore.getState().setWritingGroupExpanded).toHaveBeenCalledWith('writing/随笔', false)
    expect(useStore.getState().selectCompanionFile).not.toHaveBeenCalled()
    expect(useStore.getState().selectWritingFile).not.toHaveBeenCalled()
  })

  it('对照文带 data-companion 与 academic 高亮 class；主文高亮不变', () => {
    seed({
      writingAssistantOpen: true,
      writingPanelMode: 'companion',
      companionFile: { path: 'writing/ref.md', body: '', kind: 'md', dirty: false, saving: 'idle' },
    })
    render(<WritingTree root="writing" />)
    const ref = nodeRow('ref')
    expect(ref.getAttribute('data-companion')).toBe('true')
    expect(ref.className).toContain('bg-parchment/8')
    expect(ref.className).toContain('shadow-[inset_2px_0_0_rgba(232,213,183,0.4)]')
    const main = nodeRow('main')
    expect(main.getAttribute('data-companion')).toBeNull()
    expect(main.className).toContain('bg-ember/10')
    expect(main.className).toContain('text-ember')
  })

  it('newspaper 主题对照高亮 class；主文选中样式不变', () => {
    seed({
      writingAssistantOpen: true,
      writingPanelMode: 'companion',
      companionFile: { path: 'writing/ref.md', body: '', kind: 'md', dirty: false, saving: 'idle' },
    })
    render(<WritingTree root="writing" theme="newspaper" />)
    const ref = nodeRow('ref')
    expect(ref.getAttribute('data-companion')).toBe('true')
    expect(ref.className).toContain('bg-[#6b5d52]/10')
    expect(ref.className).toContain('shadow-[inset_2px_0_0_rgba(42,31,26,0.35)]')
    expect(nodeRow('main').className).toContain('bg-[#1a1a1a]/10')
  })

  it('右键任意节点不弹出菜单（menu 已删除）', () => {
    seed()
    render(<WritingTree root="writing" />)
    fireEvent.contextMenu(nodeRow('ref'))
    fireEvent.contextMenu(nodeRow('随笔'))
    expect(screen.queryByText('＋ 新建文章')).toBeNull()
    expect(screen.queryByText('新建子分组')).toBeNull()
    expect(screen.queryByText('移出分组')).toBeNull()
    expect(screen.queryByText('重命名')).toBeNull()
  })

  it('hover 的 ✎/＋/🗀/🗑 按钮仍在，✎ 打开内联改名', () => {
    seed()
    render(<WritingTree root="writing" />)
    // 3 顶层节点 + 默认展开的「随笔」内 1 子节点 = 4 行
    expect(screen.getAllByTestId('writing-node-rename')).toHaveLength(4)
    expect(screen.getAllByTestId('writing-node-delete')).toHaveLength(4)
    expect(screen.getByTestId('writing-node-create')).toBeInTheDocument()
    expect(screen.getByTestId('writing-node-create-folder')).toBeInTheDocument()
    fireEvent.click(screen.getAllByTestId('writing-node-rename')[0])
    expect(screen.getByTestId('writing-inline-rename')).toBeInTheDocument()
  })

  it('拖拽到树空白区 = 移出分组（根投放区 onDrop 保留）', () => {
    seed()
    const { container } = render(<WritingTree root="writing" />)
    const dropZone = container.firstElementChild!
    fireEvent.drop(dropZone, {
      dataTransfer: { getData: () => 'writing/随笔/c.md', files: [] },
    })
    expect(useStore.getState().moveWritingNode).toHaveBeenCalledWith({ src: 'writing/随笔/c.md', targetDir: 'writing', index: null })
  })
})
