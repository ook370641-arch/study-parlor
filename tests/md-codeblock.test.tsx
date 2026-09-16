import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react'

vi.mock('@/lib/ipc', () => ({
  ipc: { openExternal: vi.fn() },
}))

import { MarkdownRenderer } from '@/components/md/MarkdownRenderer'

describe('MdCodeBlock（briefing 阅读器）', () => {
  beforeEach(() => {
    cleanup()
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: vi.fn().mockResolvedValue(undefined) },
      configurable: true,
    })
  })

  it('fenced code with language renders bar with lang label and copy button', () => {
    render(
      <MarkdownRenderer
        content={'```yaml\ntask:\n  id: "fix-auth-bypass_1"\n```'}
        fileName="article.md"
        briefingStyle="academic"
        hideHeader
      />
    )
    expect(screen.getByText('yaml')).toBeInTheDocument()
    expect(screen.getByTestId('md-codeblock-copy')).toBeInTheDocument()
  })

  it('copy button writes code text to clipboard and shows transient confirmation', async () => {
    render(
      <MarkdownRenderer
        content={'```yaml\ntask:\n  id: "x"\n```'}
        fileName="article.md"
        briefingStyle="academic"
        hideHeader
      />
    )
    fireEvent.click(screen.getByTestId('md-codeblock-copy'))
    await waitFor(() =>
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith('task:\n  id: "x"')
    )
    expect(await screen.findByText('已复制 ✓')).toBeInTheDocument()
  })

  it('fenced code without language renders copy button but no lang label', () => {
    render(
      <MarkdownRenderer
        content={'```\nplain code\n```'}
        fileName="article.md"
        briefingStyle="academic"
        hideHeader
      />
    )
    expect(screen.getByTestId('md-codeblock-copy')).toBeInTheDocument()
    expect(document.querySelector('.md-codeblock-lang')).toBeNull()
  })

  it('inline code is unchanged (no copy button)', () => {
    render(<MarkdownRenderer content={'Use `pass@k` here.'} fileName="article.md" briefingStyle="academic" hideHeader />)
    expect(screen.queryByTestId('md-codeblock-copy')).not.toBeInTheDocument()
  })

  it('non-briefing rendering keeps old pre without copy button', () => {
    render(<MarkdownRenderer content={'```js\nconsole.log(1)\n```'} fileName="a.md" hideHeader />)
    expect(screen.queryByTestId('md-codeblock-copy')).not.toBeInTheDocument()
  })
})
