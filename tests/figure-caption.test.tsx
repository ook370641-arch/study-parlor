import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, cleanup } from '@testing-library/react'

vi.mock('@/lib/ipc', () => ({
  ipc: { openExternal: vi.fn() },
}))

import { MarkdownRenderer } from '@/components/md/MarkdownRenderer'

function renderBriefing(content: string) {
  return render(<MarkdownRenderer content={content} fileName="article.md" briefingStyle="academic" hideHeader />)
}

describe('rehypeFigureCaption（briefing 阅读器）', () => {
  beforeEach(() => cleanup())

  it('image-only paragraph + short text paragraph → figure with figcaption', () => {
    renderBriefing('![diagram](https://x.com/a.png)\n\nComponents of evaluations for agents.')
    const figure = document.querySelector('figure.md-figure')
    expect(figure).not.toBeNull()
    expect(figure!.querySelector('img')).not.toBeNull()
    expect(figure!.querySelector('figcaption')?.textContent).toBe('Components of evaluations for agents.')
    // 图注段落不再作为独立 p 出现
    expect(document.querySelectorAll('p').length).toBe(0)
  })

  it('caption over 140 chars stays a plain paragraph', () => {
    const long = 'x'.repeat(141)
    renderBriefing(`![a](https://x.com/a.png)\n\n${long}`)
    expect(document.querySelector('figure.md-figure')).toBeNull()
    expect(document.querySelectorAll('p').length).toBeGreaterThan(0)
  })

  it('caption containing a link is not converted', () => {
    renderBriefing('![a](https://x.com/a.png)\n\nSee [source](https://x.com) for details.')
    expect(document.querySelector('figure.md-figure')).toBeNull()
  })

  it('image without following paragraph stays unwrapped', () => {
    renderBriefing('正文段落。\n\n![a](https://x.com/a.png)')
    expect(document.querySelector('figure.md-figure')).toBeNull()
  })

  it('consecutive images each pair with their own captions', () => {
    renderBriefing('![a](https://x.com/a.png)\n\nFigure one.\n\n![b](https://x.com/b.png)\n\nFigure two.')
    const figures = document.querySelectorAll('figure.md-figure')
    expect(figures.length).toBe(2)
    expect(figures[0].querySelector('figcaption')?.textContent).toBe('Figure one.')
    expect(figures[1].querySelector('figcaption')?.textContent).toBe('Figure two.')
  })

  it('non-briefing rendering is not affected', () => {
    render(<MarkdownRenderer content={'![a](https://x.com/a.png)\n\nCaption here.'} fileName="a.md" hideHeader />)
    expect(document.querySelector('figure.md-figure')).toBeNull()
  })
})
