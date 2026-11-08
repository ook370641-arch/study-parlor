import { beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render } from '@testing-library/react'
import { AiNoteGenerator } from '@/components/notes/AiNoteGenerator'
import { useStore } from '@/store'
import type { NoteEntry } from '@shared/index'

const entry: NoteEntry = {
  path: 'notes/a.md',
  meta: { title: 'A', url: 'https://example.com/a', source: 'web', rating: 0, summary: '', highlight: '', collected_at: '2026-11-05' },
}

beforeEach(() => {
  cleanup()
  useStore.setState({
    aiNoteGenerations: {},
    generateAiNote: vi.fn(),
    applyAiNote: vi.fn(),
    cancelAiNote: vi.fn(),
  })
})

describe('AiNoteGenerator', () => {
  it('显示可识别的 Sparkles 入口并开始生成', () => {
    const { getByTestId } = render(<AiNoteGenerator entry={entry} originalBody="原笔迹" />)
    const button = getByTestId('note-ai-generate')
    expect(button).toHaveAttribute('aria-label', '生成笔记')
    expect(button.querySelector('svg')).not.toBeNull()
    fireEvent.click(button)
    expect(useStore.getState().generateAiNote).toHaveBeenCalledWith(entry.path)
  })

  it('生成动画可收起并从原入口重新打开', () => {
    useStore.setState({ aiNoteGenerations: { [entry.path]: { path: entry.path, stage: 'round2', candidate: null, applying: false } } })
    const { getByTestId, getByText, queryByTestId } = render(<AiNoteGenerator entry={entry} originalBody="原笔迹内容" />)
    expect(getByTestId('note-ai-stage')).toHaveTextContent('第二轮检索')
    expect(getByTestId('note-ai-generating')).toBeTruthy()
    fireEvent.click(getByTestId('note-ai-generating-close'))
    expect(queryByTestId('note-ai-generating')).toBeNull()
    fireEvent.click(getByTestId('note-ai-generate'))
    expect(getByTestId('note-ai-generating')).toBeTruthy()
    expect(useStore.getState().generateAiNote).not.toHaveBeenCalled()
    fireEvent.click(getByTestId('note-ai-view-original'))
    expect(getByTestId('note-ai-original')).toBeTruthy()
    expect(getByText('原笔迹内容')).toBeTruthy()
  })

  it('候选只在预览中出现，确认或取消调用对应动作', () => {
    useStore.setState({
      aiNoteGenerations: {
        [entry.path]: {
          path: entry.path, stage: 'writing', applying: false,
          candidate: { generationId: 'generation-1', path: entry.path, body: '## AI 正文\n\n蒸馏内容' },
        },
      },
    })
    const { getByTestId, getByText } = render(<AiNoteGenerator entry={entry} originalBody="原笔迹" />)
    expect(getByTestId('note-ai-preview')).toBeTruthy()
    expect(getByText('蒸馏内容')).toBeTruthy()
    fireEvent.click(getByTestId('note-ai-apply'))
    expect(useStore.getState().applyAiNote).toHaveBeenCalledWith(entry.path)
    fireEvent.click(getByTestId('note-ai-cancel'))
    expect(useStore.getState().cancelAiNote).toHaveBeenCalledWith(entry.path)
  })

  it('已生成笔记不再显示入口', () => {
    const generated = { ...entry, meta: { ...entry.meta, ai_generated_at: '2026-11-05T00:00:00.000Z' } }
    const { queryByTestId } = render(<AiNoteGenerator entry={generated} originalBody="原笔迹" />)
    expect(queryByTestId('note-ai-generate')).toBeNull()
  })
})
