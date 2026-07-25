import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react'

vi.mock('@/lib/ipc', () => ({
  ipc: {
    patchState: vi.fn(), getState: vi.fn(),
    annotationsRead: vi.fn(async () => [
      { id: '1', selectedText: '长上下文可靠性', note: '', paragraphIndex: 0, createdAt: '', updatedAt: '' },
    ]),
  },
}))
vi.mock('@/lib/paintings', () => ({ manifest: [], pickRandom: vi.fn(() => null) }))

import { useStore } from '@/store'
import { InternalizationSpine } from '@/components/briefing/InternalizationSpine'

const CONTENT = '## X / Twitter\nAaron Levie 讨论了 LLM。\n\n## Official Blogs\nClaude 的新功能提升了长上下文可靠性。'
const CHUNKS = [
  { heading: 'X / Twitter', summary: '', terms: [] },
  { heading: 'Official Blogs', summary: '', terms: [] },
]

describe('InternalizationSpine', () => {
  beforeEach(() => {
    cleanup()
    useStore.setState({ assistantSession: { activeChunkIndex: null } as never })
  })

  it('renders one node per chunk; sealed from annotations; visited up to visitedMax', async () => {
    render(
      <InternalizationSpine content={CONTENT} chunks={CHUNKS as never} filePath="/x.md" visitedMax={0} />,
    )
    await waitFor(() => {
      expect(screen.getByTestId('spine-node-1').dataset.state).toBe('sealed')
    })
    expect(screen.getByTestId('spine-node-0').dataset.state).toBe('visited')
  })

  it('hover highlights the chunk via activeChunkIndex; click scrolls', async () => {
    const onNavigate = vi.fn()
    render(
      <InternalizationSpine content={CONTENT} chunks={CHUNKS as never} filePath="/x.md" visitedMax={null} onNavigate={onNavigate} />,
    )
    await waitFor(() => screen.getByTestId('spine-node-0'))
    fireEvent.mouseEnter(screen.getByTestId('spine-node-0'))
    expect(useStore.getState().assistantSession?.activeChunkIndex).toBe(0)
    fireEvent.mouseLeave(screen.getByTestId('spine-node-0'))
    expect(useStore.getState().assistantSession?.activeChunkIndex ?? null).toBeNull()
    fireEvent.click(screen.getByTestId('spine-node-1'))
    expect(onNavigate).toHaveBeenCalledWith(1)
  })

  it('renders nothing when no chunks and no markdown headings', () => {
    const { container } = render(
      <InternalizationSpine content="无标题纯文本" chunks={[]} filePath="/x.md" visitedMax={null} />,
    )
    expect(container).toBeEmptyDOMElement()
  })
})
