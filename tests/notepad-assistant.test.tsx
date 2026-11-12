import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { NotepadLogEntry } from '@shared/index'

const store = vi.hoisted(() => ({
  notepadItems: [],
  notepadLog: [] as NotepadLogEntry[],
  notepadFontSize: 'base',
  notepadPanelSize: null,
  addNotepadItem: vi.fn(),
  resolveNotepadItem: vi.fn(),
  deleteNotepadItem: vi.fn(),
  moveNotepadItem: vi.fn(),
  updateNotepadItem: vi.fn(),
  saveNotepadComment: vi.fn(),
  refreshNotepad: vi.fn(),
  setNotepadFontSize: vi.fn(),
  setNotepadPanelSize: vi.fn(),
}))

vi.mock('@/store', () => ({
  useStore: (selector: (s: typeof store) => unknown) => selector(store),
}))

import { NotepadPanel } from '@/components/NotepadPanel'

afterEach(() => {
  cleanup()
  store.notepadLog = []
  vi.clearAllMocks()
  vi.useRealTimers()
})

function renderPanel(placement?: 'left' | 'right') {
  const onClose = vi.fn()
  render(
    <>
      <NotepadPanel open onClose={onClose} placement={placement} />
      <div data-testid="article-assistant-tab">
        <span data-testid="article-assistant-tab-child" />
      </div>
      <div data-testid="article-assistant-chat-window">
        <input data-testid="article-assistant-input" />
      </div>
      <div data-testid="notepad-test-outside" />
    </>,
  )
  return onClose
}

describe('NotepadPanel 与旁注聊天窗共存', () => {
  it('默认位于右侧，可切换为左侧', () => {
    const { unmount } = render(<NotepadPanel open onClose={vi.fn()} />)
    expect(screen.getByTestId('notepad-panel')).toHaveClass('right-5')
    unmount()

    renderPanel('left')
    expect(screen.getByTestId('notepad-panel')).toHaveClass('left-5')
  })

  it('旁注交互不关闭面板，普通外部区域仍关闭', () => {
    const onClose = renderPanel('left')

    fireEvent.mouseDown(screen.getByTestId('article-assistant-tab-child'))
    fireEvent.mouseDown(screen.getByTestId('article-assistant-input'))
    expect(onClose).not.toHaveBeenCalled()

    fireEvent.mouseDown(screen.getByTestId('notepad-test-outside'))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it.each([
    { placement: 'left' as const, startX: 20, endX: 60 },
    { placement: 'right' as const, startX: 100, endX: 60 },
  ])('$placement 布局沿上左拖柄向外拖动时加宽', ({ placement, startX, endX }) => {
    renderPanel(placement)

    fireEvent.pointerDown(screen.getByTestId('notepad-resize-grip'), { clientX: startX, clientY: 20 })
    fireEvent.pointerMove(window, { clientX: endX, clientY: 20 })

    expect(screen.getByTestId('notepad-panel')).toHaveStyle({ width: '424px' })
    fireEvent.pointerUp(window)
  })
})

describe('NotepadPanel 已完成时间线', () => {
  it('仅高亮今天完成的条目，并保留 agent 标记', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 10, 12, 8, 0))
    store.notepadLog = [
      {
        id: 'today',
        title: '今天完成的需求',
        text: '今天完成的需求',
        category: 'feature',
        createdAt: '2026-11-01T00:00:00.000Z',
        resolvedAt: new Date(2026, 10, 12, 7, 0).toISOString(),
        source: 'agent',
      },
      {
        id: 'yesterday',
        title: '昨天完成的需求',
        text: '昨天完成的需求',
        category: 'improvement',
        createdAt: '2026-11-01T00:00:00.000Z',
        resolvedAt: new Date(2026, 10, 11, 23, 0).toISOString(),
        source: 'user',
      },
    ]

    renderPanel()
    fireEvent.click(screen.getByTestId('notepad-tab-done'))

    const todayEntries = screen.getAllByTestId('notepad-log-today')
    expect(todayEntries).toHaveLength(1)
    expect(todayEntries[0]).toHaveTextContent('今天完成的需求')
    expect(todayEntries[0]).toHaveTextContent('今日完成 · 待测试')
    expect(todayEntries[0]).toHaveTextContent('agent')
    expect(todayEntries[0]).toHaveClass('border-ember/35', 'bg-ember/10')

    const yesterdayEntry = screen.getByText('昨天完成的需求').closest('[data-testid="notepad-log-entry"]')
    expect(yesterdayEntry).toBeInTheDocument()
    expect(yesterdayEntry).not.toHaveTextContent('今日完成 · 待测试')
    expect(yesterdayEntry).not.toHaveClass('border-ember/35', 'bg-ember/10')
  })

  it('按解决时间倒序展示，最近完成的需求在最上方', () => {
    store.notepadLog = [
      {
        id: 'older',
        title: '较早完成的需求',
        text: '较早完成的需求',
        category: 'feature',
        createdAt: '2026-09-01T00:00:00.000Z',
        resolvedAt: '2026-10-01T00:00:00.000Z',
        source: 'user',
      },
      {
        id: 'newer',
        title: '最近完成的需求',
        text: '最近完成的需求',
        category: 'improvement',
        createdAt: '2026-10-01T00:00:00.000Z',
        resolvedAt: '2026-11-05T00:00:00.000Z',
        source: 'agent',
      },
    ]

    renderPanel()
    fireEvent.click(screen.getByTestId('notepad-tab-done'))

    const entries = screen.getAllByTestId('notepad-log-entry')
    expect(entries).toHaveLength(2)
    expect(entries[0]).toHaveTextContent('最近完成的需求')
    expect(entries[1]).toHaveTextContent('较早完成的需求')
  })

  it('点击新增评论按钮后才显示输入框，输入即保存且没有保存取消按钮', () => {
    store.notepadLog = [{
      id: 'done-comment',
      title: '已完成的优化',
      text: '原始需求',
      category: 'improvement',
      createdAt: '2026-11-01T00:00:00.000Z',
      resolvedAt: '2026-11-05T00:00:00.000Z',
      source: 'agent',
    }]
    renderPanel()
    fireEvent.click(screen.getByTestId('notepad-tab-done'))

    expect(screen.queryByTestId('notepad-comment-input-done-comment')).not.toBeInTheDocument()
    fireEvent.click(screen.getByTestId('notepad-comment-add-done-comment'))
    expect(screen.getByTestId('notepad-comment-input-done-comment')).toBeInTheDocument()
    fireEvent.change(screen.getByTestId('notepad-comment-input-done-comment'), { target: { value: '还需要补充处理记录' } })

    expect(store.saveNotepadComment).toHaveBeenCalledWith('done-comment', expect.any(String), '还需要补充处理记录')
    expect(screen.queryByTestId('notepad-comment-save-done-comment')).not.toBeInTheDocument()
    expect(screen.queryByTestId('notepad-comment-cancel-done-comment')).not.toBeInTheDocument()
  })

  it('点击评论区域外自动收起，已输入内容不会随面板关闭丢失', () => {
    store.notepadLog = [{
      id: 'done-autosave',
      title: '已完成的优化',
      text: '原始需求',
      category: 'improvement',
      createdAt: '2026-11-01T00:00:00.000Z',
      resolvedAt: '2026-11-05T00:00:00.000Z',
      source: 'agent',
    }]
    const onClose = renderPanel()
    fireEvent.click(screen.getByTestId('notepad-tab-done'))
    fireEvent.click(screen.getByTestId('notepad-comment-add-done-autosave'))
    fireEvent.change(screen.getByTestId('notepad-comment-input-done-autosave'), { target: { value: '会自动保存的评论' } })
    expect(store.saveNotepadComment).toHaveBeenCalledWith('done-autosave', expect.any(String), '会自动保存的评论')

    fireEvent.mouseDown(screen.getByText('原始需求'))
    expect(screen.queryByTestId('notepad-comment-input-done-autosave')).not.toBeInTheDocument()
    expect(onClose).not.toHaveBeenCalled()

    fireEvent.click(screen.getByTestId('notepad-comment-add-done-autosave'))
    fireEvent.change(screen.getByTestId('notepad-comment-input-done-autosave'), { target: { value: '外点也不丢失' } })
    fireEvent.mouseDown(screen.getByTestId('notepad-test-outside'))
    expect(store.saveNotepadComment).toHaveBeenCalledWith('done-autosave', expect.any(String), '外点也不丢失')
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('展开已完成条目时显示评论及 agent 处理记录', () => {
    store.notepadLog = [{
      id: 'done-history',
      title: '已完成的需求',
      text: '原始需求',
      category: 'feature',
      createdAt: '2026-11-01T00:00:00.000Z',
      resolvedAt: '2026-11-05T00:00:00.000Z',
      source: 'agent',
      comments: [{
        id: 'comment-1',
        text: '这个入口还不够明显',
        createdAt: '2026-11-06T00:00:00.000Z',
        resolvedAt: '2026-11-07T00:00:00.000Z',
        resolution: '已增加独立入口',
      }],
    }]
    renderPanel()
    fireEvent.click(screen.getByTestId('notepad-tab-done'))
    fireEvent.click(screen.getByText('已完成的需求'))

    expect(screen.getByText('这个入口还不够明显')).toBeInTheDocument()
    expect(screen.getByTestId('notepad-comment-comment-1')).toHaveTextContent('已增加独立入口')
  })
})
