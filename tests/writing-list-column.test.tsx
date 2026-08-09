import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'

vi.mock('@/lib/ipc', () => ({
  ipc: {
    writingCreateFile: vi.fn(), writingCreateFolder: vi.fn(), writingImportFiles: vi.fn(),
    writingRefreshCatalog: vi.fn(),
    patchState: vi.fn(),
  },
}))

import { useStore } from '@/store'
import { WritingListColumn } from '@/components/writing/WritingListColumn'

describe('WritingListColumn', () => {
  beforeEach(() => {
    cleanup()
    useStore.setState({
      writingListTab: 'articles',
      writingTree: { writing: [], repository: [] },
      writingFile: null,
      loadWritingTree: vi.fn(),
      selectWritingFile: vi.fn(),
    } as any)
  })

  it('labels the repository tab as 仓库', () => {
    render(<WritingListColumn theme="academic" />)
    expect(screen.getByTestId('writing-list-tab-repository')).toHaveTextContent('仓库')
    expect(screen.queryByText('repository')).not.toBeInTheDocument()
  })

  it('switch indicator moves with active tab', () => {
    render(<WritingListColumn theme="academic" />)
    expect(screen.getByTestId('writing-list-tab-articles').getAttribute('aria-pressed')).toBe('true')
    fireEvent.click(screen.getByTestId('writing-list-tab-repository'))
    expect(screen.getByTestId('writing-list-tab-repository').getAttribute('aria-pressed')).toBe('true')
  })

  it('uses dark text classes in newspaper theme', () => {
    render(<WritingListColumn theme="newspaper" />)
    expect(screen.getByTestId('writing-new-file').className).not.toContain('text-parchment')
  })

  it('collapsed shows vertical labels with file counts instead of the tree', () => {
    useStore.setState({
      writingListTab: 'articles',
      writingTree: {
        writing: [
          { kind: 'file', name: 'a.md', path: 'writing/a.md' },
          { kind: 'dir', name: '随笔', path: 'writing/随笔', children: [{ kind: 'file', name: 'b.md', path: 'writing/随笔/b.md' }] },
        ],
        repository: [{ kind: 'file', name: 'r.md', path: 'repository/r.md' }],
      },
    } as any)
    render(<WritingListColumn theme="academic" collapsed />)
    expect(screen.getByTestId('writing-collapsed-articles-count')).toHaveTextContent('2')
    expect(screen.getByTestId('writing-collapsed-repository-count')).toHaveTextContent('1')
    expect(screen.queryByTestId('writing-tree-node')).not.toBeInTheDocument()
    expect(screen.getByTestId('writing-collapsed-recent-0')).toHaveTextContent('a')
    expect(screen.getByTestId('writing-collapsed-recent-1')).toHaveTextContent('b')
  })
})
