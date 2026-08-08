import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'

const mockIpc = { collectionRemoveEntry: vi.fn(), collectionRead: vi.fn(), collectionUpdateNote: vi.fn(), collectionUpdateQA: vi.fn() }
vi.mock('@/lib/ipc', () => ({ ipc: new Proxy({}, { get: (_, k) => mockIpc[k as keyof typeof mockIpc] ?? (() => Promise.resolve()) }) }))

import { useStore } from '@/store'
import { BriefingDateColumn } from '@/components/BriefingDateColumn'
import { CollectionView } from '@/components/briefing/CollectionView'
import type { BriefingCollectionEntry } from '@shared/index'

const ENTRY: BriefingCollectionEntry = {
  id: 'c-1', briefingFilePath: '/lib/夜航简报/夜航简报-2026-08-04.md', briefingDate: '2026-08-04',
  chunkHeading: 'AI Safety', chunkIndex: 0, chunkBody: '宪法式 AI 用书面原则约束模型行为。',
  guide: { summary: '本段介绍宪法式 AI。', terms: [{ term: 'Constitutional AI', translation: '宪法式 AI' }] },
  qa: [
    { role: 'user', content: '这是什么', selection: '宪法式 AI' },
    { role: 'assistant', content: '回答一' },
  ],
  qaMessageCount: 2, collectedAt: '2026-08-04T10:00:00.000Z', updatedAt: '2026-08-04T10:00:00.000Z',
}

const COLUMN_PROPS = {
  collapsed: false, history: [], today: '2026-08-04',
  onSelect: () => {}, onReceiveToday: () => {}, theme: 'academic' as const,
}

beforeEach(() => {
  cleanup()
  vi.clearAllMocks()
  useStore.setState({
    briefingSource: 'digest',
    briefingFontSize: 'lg',
    collection: { entries: [], loaded: true },
  })
})

describe('BriefingDateColumn 精选集入口', () => {
  it('传 collection prop 时今日上方渲染置顶入口', () => {
    render(<BriefingDateColumn {...COLUMN_PROPS} collection={{ active: false, onOpen: () => {} }} />)
    const entry = screen.getByTestId('briefing-collection-entry')
    expect(entry).toHaveTextContent('精选集')
    const today = screen.getByTestId('briefing-date-item-2026-08-04')
    expect(entry.compareDocumentPosition(today) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('不传 collection prop 时不渲染（求职源）', () => {
    render(<BriefingDateColumn {...COLUMN_PROPS} />)
    expect(screen.queryByTestId('briefing-collection-entry')).toBeNull()
  })

  it('收起态渲染 ✦ 小按钮并触发 onOpen', () => {
    const onOpen = vi.fn()
    render(<BriefingDateColumn {...COLUMN_PROPS} collapsed collection={{ active: false, onOpen }} />)
    fireEvent.click(screen.getByTestId('briefing-collection-mini'))
    expect(onOpen).toHaveBeenCalled()
  })

  it('精选集激活时当前日期条目不再高亮（日期列单选互斥）', () => {
    render(
      <BriefingDateColumn
        {...COLUMN_PROPS}
        currentDate="2026-08-04"
        history={[{ date: '2026-08-03', filePath: '/x.md' }]}
        collection={{ active: true, onOpen: () => {} }}
      />
    )
    expect(screen.getByTestId('briefing-collection-entry')).toHaveClass('bg-ember/20')
    expect(screen.getByTestId('briefing-date-item-2026-08-04')).not.toHaveClass('bg-ember/20')
    expect(screen.getByTestId('briefing-date-item-2026-08-03')).not.toHaveClass('bg-ember/20')
  })

  it('精选集关闭时当前日期条目正常高亮', () => {
    render(
      <BriefingDateColumn
        {...COLUMN_PROPS}
        currentDate="2026-08-04"
        collection={{ active: false, onOpen: () => {} }}
      />
    )
    expect(screen.getByTestId('briefing-date-item-2026-08-04')).toHaveClass('bg-ember/20')
  })

  it('收起态精选集激活时「今」mini 不再恒亮', () => {
    render(<BriefingDateColumn {...COLUMN_PROPS} collapsed collection={{ active: true, onOpen: () => {} }} />)
    expect(screen.getByTestId('briefing-collection-mini')).toHaveClass('bg-ember/20')
    expect(screen.getByTestId('briefing-date-today-mini')).not.toHaveClass('bg-ember/20')
  })
})

describe('CollectionView', () => {
  it('空态提示', () => {
    render(<CollectionView theme="academic" />)
    expect(screen.getByTestId('collection-empty')).toBeInTheDocument()
  })

  it('渲染条目三段：正文快照 / 导读 / 旁注问答', () => {
    useStore.setState({ collection: { entries: [ENTRY], loaded: true } })
    render(<CollectionView theme="academic" />)
    expect(screen.getByTestId('collection-entry-c-1')).toBeInTheDocument()
    expect(screen.getByText('宪法式 AI 用书面原则约束模型行为。')).toBeInTheDocument()
    expect(screen.getByText('本段介绍宪法式 AI。')).toBeInTheDocument()
    expect(screen.getByText('Constitutional AI')).toBeInTheDocument()
    expect(screen.getByText('这是什么')).toBeInTheDocument()
    expect(screen.getByText('回答一')).toBeInTheDocument()
  })

  it('移出精选集经 ConfirmDialog 后调用 removeCollectionEntry', async () => {
    useStore.setState({ collection: { entries: [ENTRY], loaded: true } })
    render(<CollectionView theme="academic" />)
    fireEvent.click(screen.getByTestId('collection-remove-c-1'))
    fireEvent.click(await screen.findByTestId('confirm-dialog-confirm'))
    expect(mockIpc.collectionRemoveEntry).toHaveBeenCalledWith('c-1')
  })

  it('术语表渲染 explanation（沿用 GuideSidebar 视觉语言）', () => {
    useStore.setState({
      collection: {
        loaded: true,
        entries: [{
          ...ENTRY,
          guide: { summary: 's', terms: [{ term: 'CAI', translation: '宪法式 AI', explanation: '用书面原则约束模型行为的对齐方法。' }] },
        }],
      },
    })
    render(<CollectionView theme="academic" />)
    expect(screen.getByText('用书面原则约束模型行为的对齐方法。')).toBeInTheDocument()
  })

  it('按简报日期分组渲染组头', () => {
    useStore.setState({
      collection: {
        loaded: true,
        entries: [
          ENTRY,
          { ...ENTRY, id: 'c-2', briefingDate: '2026-08-03', collectedAt: '2026-08-03T10:00:00.000Z' },
        ],
      },
    })
    render(<CollectionView theme="academic" />)
    expect(screen.getByText('8月4日 夜航简报')).toBeInTheDocument()
    expect(screen.getByText('8月3日 夜航简报')).toBeInTheDocument()
  })

  it('newspaper 主题下条目正常渲染', () => {
    useStore.setState({ collection: { entries: [ENTRY], loaded: true } })
    render(<CollectionView theme="newspaper" />)
    expect(screen.getByTestId('collection-entry-c-1')).toBeInTheDocument()
    expect(screen.getByText('本段介绍宪法式 AI。')).toBeInTheDocument()
  })

  it('无备注时显示添加入口，点击后出现输入框', () => {
    useStore.setState({ collection: { entries: [ENTRY], loaded: true } })
    render(<CollectionView theme="academic" />)
    fireEvent.click(screen.getByTestId('collection-note-add-c-1'))
    expect(screen.getByTestId('collection-note-input-c-1')).toBeInTheDocument()
  })

  it('输入备注后失焦保存：调用 IPC 并渲染备注', async () => {
    useStore.setState({ collection: { entries: [ENTRY], loaded: true } })
    render(<CollectionView theme="academic" />)
    fireEvent.click(screen.getByTestId('collection-note-add-c-1'))
    const input = screen.getByTestId('collection-note-input-c-1')
    fireEvent.change(input, { target: { value: '这条值得重读' } })
    fireEvent.blur(input)
    expect(mockIpc.collectionUpdateNote).toHaveBeenCalledWith({ id: 'c-1', note: '这条值得重读' })
    expect(await screen.findByTestId('collection-note-c-1')).toHaveTextContent('这条值得重读')
  })

  it('已有备注直接渲染，点击进入编辑', () => {
    useStore.setState({ collection: { entries: [{ ...ENTRY, note: '已有备注' }], loaded: true } })
    render(<CollectionView theme="academic" />)
    fireEvent.click(screen.getByTestId('collection-note-c-1'))
    expect(screen.getByTestId('collection-note-input-c-1')).toHaveValue('已有备注')
  })

  it('Esc 取消不保存', () => {
    useStore.setState({ collection: { entries: [{ ...ENTRY, note: '原备注' }], loaded: true } })
    render(<CollectionView theme="academic" />)
    fireEvent.click(screen.getByTestId('collection-note-c-1'))
    const input = screen.getByTestId('collection-note-input-c-1')
    fireEvent.change(input, { target: { value: '改掉' } })
    fireEvent.keyDown(input, { key: 'Escape' })
    expect(mockIpc.collectionUpdateNote).not.toHaveBeenCalled()
    expect(screen.getByTestId('collection-note-c-1')).toHaveTextContent('原备注')
  })

  it('清空备注保存后回到添加入口', async () => {
    useStore.setState({ collection: { entries: [{ ...ENTRY, note: '待删' }], loaded: true } })
    render(<CollectionView theme="academic" />)
    fireEvent.click(screen.getByTestId('collection-note-c-1'))
    const input = screen.getByTestId('collection-note-input-c-1')
    fireEvent.change(input, { target: { value: '  ' } })
    fireEvent.blur(input)
    expect(mockIpc.collectionUpdateNote).toHaveBeenCalledWith({ id: 'c-1', note: '  ' })
    expect(await screen.findByTestId('collection-note-add-c-1')).toBeInTheDocument()
  })

  it('旁注按角色渲染气泡：用户右列无标签，助手左列标「助手」', () => {
    useStore.setState({ collection: { entries: [ENTRY], loaded: true } })
    render(<CollectionView theme="academic" />)
    const userMsg = screen.getByTestId('collection-qa-message-c-1-0')
    const aiMsg = screen.getByTestId('collection-qa-message-c-1-1')
    expect(userMsg).toHaveAttribute('data-role', 'user')
    expect(userMsg.className).toContain('items-end')
    expect(userMsg).not.toHaveTextContent('我')
    expect(userMsg).toHaveTextContent('「宪法式 AI」')
    expect(aiMsg).toHaveAttribute('data-role', 'assistant')
    expect(aiMsg.className).toContain('items-start')
    expect(aiMsg).toHaveTextContent('助手')
  })

  it('编辑时气泡 w-full 撑开不坍缩', () => {
    useStore.setState({ collection: { entries: [ENTRY], loaded: true } })
    render(<CollectionView theme="academic" />)
    fireEvent.click(screen.getByTestId('collection-qa-edit-c-1-1'))
    const bubble = screen.getByTestId('collection-qa-input-c-1-1').parentElement!
    expect(bubble.className).toContain('w-full')
  })

  it('删除一条后，移位到下标的消息不残留「确认删除」', async () => {
    useStore.setState({ collection: { entries: [ENTRY], loaded: true } })
    render(<CollectionView theme="academic" />)
    fireEvent.click(screen.getByTestId('collection-qa-delete-c-1-0'))
    fireEvent.click(screen.getByTestId('collection-qa-delete-confirm-c-1-0'))
    // 原 index 1 移位到 index 0：应显示普通「删除」按钮
    expect(await screen.findByTestId('collection-qa-delete-c-1-0')).toBeInTheDocument()
    expect(screen.queryByTestId('collection-qa-delete-confirm-c-1-0')).toBeNull()
  })

  it('编辑旁注失焦保存：替换该条 content 调用 updateQA', async () => {
    useStore.setState({ collection: { entries: [ENTRY], loaded: true } })
    render(<CollectionView theme="academic" />)
    fireEvent.click(screen.getByTestId('collection-qa-edit-c-1-1'))
    const input = screen.getByTestId('collection-qa-input-c-1-1')
    expect(input).toHaveValue('回答一')
    fireEvent.change(input, { target: { value: '回答一（删改后）' } })
    fireEvent.blur(input)
    expect(mockIpc.collectionUpdateQA).toHaveBeenCalledWith({
      id: 'c-1',
      qa: [ENTRY.qa[0], { role: 'assistant', content: '回答一（删改后）' }],
    })
    expect(await screen.findByText('回答一（删改后）')).toBeInTheDocument()
  })

  it('编辑旁注 Esc 取消不保存', () => {
    useStore.setState({ collection: { entries: [ENTRY], loaded: true } })
    render(<CollectionView theme="academic" />)
    fireEvent.click(screen.getByTestId('collection-qa-edit-c-1-1'))
    const input = screen.getByTestId('collection-qa-input-c-1-1')
    fireEvent.change(input, { target: { value: '改掉' } })
    fireEvent.keyDown(input, { key: 'Escape' })
    expect(mockIpc.collectionUpdateQA).not.toHaveBeenCalled()
  })

  it('编辑旁注清空内容不保存（删整条请用删除）', () => {
    useStore.setState({ collection: { entries: [ENTRY], loaded: true } })
    render(<CollectionView theme="academic" />)
    fireEvent.click(screen.getByTestId('collection-qa-edit-c-1-0'))
    const input = screen.getByTestId('collection-qa-input-c-1-0')
    fireEvent.change(input, { target: { value: '  ' } })
    fireEvent.blur(input)
    expect(mockIpc.collectionUpdateQA).not.toHaveBeenCalled()
  })

  it('删除旁注需两步确认，确认后从 qa 中移除该条', async () => {
    useStore.setState({ collection: { entries: [ENTRY], loaded: true } })
    render(<CollectionView theme="academic" />)
    fireEvent.click(screen.getByTestId('collection-qa-delete-c-1-0'))
    expect(mockIpc.collectionUpdateQA).not.toHaveBeenCalled()
    fireEvent.click(screen.getByTestId('collection-qa-delete-confirm-c-1-0'))
    expect(mockIpc.collectionUpdateQA).toHaveBeenCalledWith({ id: 'c-1', qa: [ENTRY.qa[1]] })
  })

  it('删除第一步后可取消', () => {
    useStore.setState({ collection: { entries: [ENTRY], loaded: true } })
    render(<CollectionView theme="academic" />)
    fireEvent.click(screen.getByTestId('collection-qa-delete-c-1-0'))
    fireEvent.click(screen.getByTestId('collection-qa-delete-cancel-c-1-0'))
    expect(mockIpc.collectionUpdateQA).not.toHaveBeenCalled()
    expect(screen.getByTestId('collection-qa-delete-c-1-0')).toBeInTheDocument()
  })
})
