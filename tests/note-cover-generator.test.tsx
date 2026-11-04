import { beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react'
import { NoteCoverGenerator } from '@/components/notes/NoteCoverGenerator'
import { NoteCover } from '@/components/notes/NoteCover'
import { NoteMetaHeader } from '@/components/notes/NoteMetaHeader'
import { useStore } from '@/store'
import type { NoteCoverCandidate, NoteEntry } from '@shared/index'

const mockIpc = vi.hoisted(() => ({
  notesGenerateCovers: vi.fn(),
  notesSaveCover: vi.fn(),
}))

vi.mock('@/lib/ipc', () => ({ ipc: mockIpc }))

const entry: NoteEntry = {
  path: 'notes/a.md',
  meta: { title: 'A', url: '', source: 'web', rating: 0, summary: '', highlight: '', collected_at: '2026-09-01' },
}

const candidates: NoteCoverCandidate[] = [0, 1, 2].map(index => ({
  design: {
    concept: `创作意图 ${index}`,
    palette: { background: '#211a18', ink: '#e8d5b7', accent: '#d97757', secondary: '#6f8892' },
    background: 'solid',
    grain: 0.05,
    elements: [
      { type: 'circle', cx: 100, cy: 100, r: 30 },
      { type: 'circle', cx: 160, cy: 160, r: 30 },
      { type: 'circle', cx: 220, cy: 220, r: 30 },
    ],
  },
  svgDataUrl: `data:image/svg+xml;base64,candidate-${index}`,
}))

beforeEach(() => {
  cleanup()
  vi.clearAllMocks()
  mockIpc.notesGenerateCovers.mockResolvedValue({ candidates })
  mockIpc.notesSaveCover.mockResolvedValue({ cover: 'notes/covers/a.svg', coverUrl: candidates[1].svgDataUrl })
  useStore.setState({ loadNotes: vi.fn().mockResolvedValue(undefined), showToast: vi.fn(), updateNoteMetaAction: vi.fn() })
})

describe('NoteCoverGenerator', () => {
  it('展示三个内容符号候选，选中保存后刷新笔记列表', async () => {
    const { getByTestId, findAllByTestId, getAllByTestId, getAllByText, queryByTestId } = render(<NoteCoverGenerator entry={entry} />)
    fireEvent.click(getByTestId('note-cover-generate'))
    expect(await findAllByTestId('note-cover-candidate')).toHaveLength(3)
    expect(getAllByText(/创作意图/)).toHaveLength(3)
    fireEvent.click(getAllByTestId('note-cover-select')[1])
    await waitFor(() => expect(mockIpc.notesSaveCover).toHaveBeenCalledWith({ path: entry.path, design: candidates[1].design }))
    expect(useStore.getState().loadNotes).toHaveBeenCalledTimes(1)
    await waitFor(() => expect(queryByTestId('note-cover-dialog')).toBeNull())
  })

  it('生成期间防止重复提交', async () => {
    let resolve: (value: { candidates: NoteCoverCandidate[] }) => void = () => {}
    mockIpc.notesGenerateCovers.mockReturnValue(new Promise(resolver => { resolve = resolver }))
    const { getByTestId, findAllByTestId } = render(<NoteCoverGenerator entry={entry} />)
    fireEvent.click(getByTestId('note-cover-generate'))
    fireEvent.click(getByTestId('note-cover-generate'))
    expect(mockIpc.notesGenerateCovers).toHaveBeenCalledTimes(1)
    resolve({ candidates })
    expect(await findAllByTestId('note-cover-candidate')).toHaveLength(3)
  })

  it('关闭弹窗后后台继续生成，入口从生成中变为待挑选并可恢复候选', async () => {
    let resolve: (value: { candidates: NoteCoverCandidate[] }) => void = () => {}
    mockIpc.notesGenerateCovers.mockReturnValue(new Promise(resolver => { resolve = resolver }))
    const { getByTestId, queryByTestId, findAllByTestId } = render(<NoteCoverGenerator entry={entry} />)

    fireEvent.click(getByTestId('note-cover-generate'))
    fireEvent.click(getByTestId('note-cover-cancel'))

    expect(queryByTestId('note-cover-dialog')).toBeNull()
    expect(getByTestId('note-cover-generate')).toHaveTextContent('生成中')
    expect(getByTestId('note-cover-generate').querySelector('[data-testid="note-cover-generating-spinner"]')).not.toBeNull()

    resolve({ candidates })
    await waitFor(() => expect(getByTestId('note-cover-generate')).toHaveTextContent('待挑选'))
    fireEvent.click(getByTestId('note-cover-generate'))

    expect(await findAllByTestId('note-cover-candidate')).toHaveLength(3)
    expect(mockIpc.notesGenerateCovers).toHaveBeenCalledTimes(1)
  })

  it('保存失败保留旧封面并提示', async () => {
    const covered = { ...entry, coverUrl: 'data:image/svg+xml;base64,old-cover' }
    mockIpc.notesSaveCover.mockRejectedValue(new Error('save failed'))
    const showToast = vi.fn()
    useStore.setState({ showToast })
    const { container, getByTestId, findAllByTestId, getAllByTestId } = render(<><NoteCover entry={covered} /><NoteCoverGenerator entry={covered} /></>)
    expect(container.querySelector('img')).toHaveAttribute('src', covered.coverUrl)
    fireEvent.click(getByTestId('note-cover-generate'))
    await findAllByTestId('note-cover-candidate')
    fireEvent.click(getAllByTestId('note-cover-select')[0])
    await waitFor(() => expect(showToast).toHaveBeenCalledWith('封面保存失败'))
    expect(container.querySelector('img')).toHaveAttribute('src', covered.coverUrl)
    expect(getByTestId('note-cover-dialog')).toBeTruthy()
  })

  it('已有生成封面可从笔记信息区重新生成', () => {
    const covered = { ...entry, coverUrl: 'data:image/svg+xml;base64,old-cover' }
    const { getByTestId, getByText } = render(<NoteMetaHeader entry={covered} />)
    fireEvent.click(getByTestId('note-meta-info-toggle'))
    expect(getByText('重新生成')).toBeTruthy()
  })
})
