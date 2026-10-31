import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { DemoInfoButton } from '@/components/demo/DemoNotePopover'
import { useStore } from '@/store'

describe('DemoInfoButton visibility', () => {
  it('设置中隐藏的说明不渲染入口', () => {
    useStore.setState({ demoNotesHidden: ['book-source'] } as any)
    const InfoButton = DemoInfoButton as any

    render(<InfoButton noteId="book-source" testId="demo-info-book-source" active={false} onClick={() => {}} />)

    expect(screen.queryByTestId('demo-info-book-source')).not.toBeInTheDocument()
  })
})
