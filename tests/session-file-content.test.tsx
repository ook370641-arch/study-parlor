import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ipc } from '@/lib/ipc'
import { SessionFileContent } from '@/components/study/SessionFileContent'

vi.mock('@/lib/ipc', () => ({ ipc: { readSessionFile: vi.fn() } }))
vi.mock('@/components/md/MarkdownRenderer', () => ({ MarkdownRenderer: ({ content }: { content: string }) => <div data-testid="markdown">{content}</div> }))
vi.mock('@/components/SVGRenderer', () => ({ SVGRenderer: ({ source }: { source: string }) => <div data-testid="svg">{source}</div> }))

const props = { dirName: 'memory', sessionNumber: 2, fileName: '学习报告.md', title: '第 2 次报告' }

describe('SessionFileContent', () => {
  beforeEach(() => { cleanup(); vi.mocked(ipc.readSessionFile).mockReset() })

  it('keeps a read failure in the workspace and retries the same file', async () => {
    vi.mocked(ipc.readSessionFile)
      .mockRejectedValueOnce(new Error('磁盘暂不可用'))
      .mockResolvedValueOnce({ content: '# 恢复后的报告', mimeType: 'text/markdown' })
    render(<SessionFileContent {...props} />)
    expect(await screen.findByText('磁盘暂不可用')).toBeInTheDocument()
    fireEvent.click(screen.getByTestId('session-file-retry'))
    await waitFor(() => expect(screen.getByTestId('markdown')).toHaveTextContent('恢复后的报告'))
    expect(ipc.readSessionFile).toHaveBeenNthCalledWith(2, { dirName: 'memory', sessionNumber: 2, fileName: '学习报告.md' })
  })

  it('renders SVG in the existing safe renderer', async () => {
    vi.mocked(ipc.readSessionFile).mockResolvedValue({ content: '<svg />', mimeType: 'image/svg+xml' })
    render(<SessionFileContent {...props} fileName="学习图表.svg" />)
    expect(await screen.findByTestId('svg')).toBeInTheDocument()
  })
})
