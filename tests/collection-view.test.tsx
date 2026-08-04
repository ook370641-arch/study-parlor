import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'

const mockIpc = { collectionRemoveEntry: vi.fn(), collectionRead: vi.fn() }
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
})
