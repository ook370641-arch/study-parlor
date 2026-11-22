import { beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render } from '@testing-library/react'
import { WholeBookNoteEditor } from '@/components/notes/WholeBookNoteEditor'

vi.mock('@/components/writing/WritingEditor', () => ({
  WritingEditor: ({ initial, onChange }: { initial: string; onChange: (body: string) => void }) => (
    <div data-testid="whole-ai-editor"><span>{initial}</span><button onClick={() => onChange('修改后的 AI')}>编辑 AI</button></div>
  ),
}))

beforeEach(cleanup)

describe('整书笔记编辑器', () => {
  it('全书导读可见，原笔迹独立输入并保留 AI 正文', () => {
    const onChange = vi.fn()
    const screen = render(<WholeBookNoteEditor filePath="notes/whole.md" body={'AI 正文\n\n---\n\n## 原笔迹\n\n已有全书笔记'} bookGuide="短全书导读" onChange={onChange} />)

    expect(screen.getByText('短全书导读')).toBeVisible()
    expect(screen.getByTestId('whole-ai-editor')).toHaveTextContent('AI 正文')
    fireEvent.change(screen.getByLabelText('已有全书笔记'), { target: { value: '新的整体理解' } })
    expect(onChange).toHaveBeenCalledWith('AI 正文\n\n---\n\n## 原笔迹\n\n新的整体理解')

    fireEvent.click(screen.getByText('编辑 AI'))
    expect(onChange).toHaveBeenCalledWith('修改后的 AI\n\n---\n\n## 原笔迹\n\n已有全书笔记')
  })

  it('尚未 AI 整理时，手动正文全部作为原笔迹', () => {
    const onChange = vi.fn()
    const screen = render(<WholeBookNoteEditor filePath="notes/whole.md" body="手动整体理解" bookGuide={undefined} onChange={onChange} />)

    expect(screen.getByLabelText('已有全书笔记')).toHaveValue('手动整体理解')
    expect(screen.getByTestId('whole-ai-editor').querySelector('span')).toBeEmptyDOMElement()
  })
})
