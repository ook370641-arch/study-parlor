import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent, act } from '@testing-library/react'

vi.mock('@/components/md/MarkdownRenderer', () => ({
  MarkdownRenderer: ({ content }: any) => <div>{content}</div>,
}))

import { ArticleBodyChunks } from '../src/components/article-assistant/ArticleBodyChunks'

afterEach(() => {
  window.getSelection()?.removeAllRanges()
  cleanup()
})

/** 在元素文本上制造一个非折叠选区（模拟用户划选） */
function selectTextIn(el: HTMLElement) {
  const range = document.createRange()
  range.selectNodeContents(el)
  const sel = window.getSelection()!
  sel.removeAllRanges()
  sel.addRange(range)
  document.dispatchEvent(new Event('selectionchange'))
  return sel
}

describe('ArticleBodyChunks', () => {
  it('renders chunks based on headings', () => {
    const content = '## Intro\n\nHello.\n\n## Details\n\nWorld.'
    const chunks = [{ heading: 'Intro', summary: '', terms: [] }, { heading: 'Details', summary: '', terms: [] }]
    render(<ArticleBodyChunks content={content} chunks={chunks} fileName="x.md" />)
    expect(screen.getAllByTestId('article-body-chunk')).toHaveLength(2)
  })

  it('renders chunk headings as ❧ plaque with chunk number and heading text', () => {
    cleanup()
    const content = '## Intro\n\nHello.\n\n## Details\n\nWorld.'
    const chunks = [{ heading: 'Intro', summary: '', terms: [] }, { heading: 'Details', summary: '', terms: [] }]
    render(<ArticleBodyChunks content={content} chunks={chunks} fileName="x.md" />)
    const plaques = screen.getAllByTestId('article-chunk-plaque')
    expect(plaques).toHaveLength(2)
    expect(plaques[0]).toHaveTextContent('❧')
    expect(plaques[0]).toHaveTextContent('1')
    expect(plaques[0]).toHaveTextContent('Intro')
    expect(plaques[0].textContent).not.toContain('§')
    expect(plaques[1]).toHaveTextContent('2')
    expect(plaques[1]).toHaveTextContent('Details')
  })

  it('选区活跃时延迟应用 guide 结构（不重建 DOM 打断划选），选区收敛后补应用', () => {
    const content = '## Intro\n\nHello.\n\n## Details\n\nWorld.'
    const { container, rerender } = render(
      <ArticleBodyChunks content={content} chunks={[]} fileName="x.md" />
    )
    // 初始无导读：无 plaque
    expect(screen.queryAllByTestId('article-chunk-plaque')).toHaveLength(0)

    // 用户在正文上按住并划出选区
    const body = container.querySelector('.space-y-4') as HTMLElement
    fireEvent.mouseDown(body)
    selectTextIn(body)

    // 导读异步到达：chunks 变化 → 应被延迟，不出现 plaque
    const chunks = [{ heading: 'Intro', summary: '', terms: [] }, { heading: 'Details', summary: '', terms: [] }]
    rerender(<ArticleBodyChunks content={content} chunks={chunks} fileName="x.md" />)
    expect(screen.queryAllByTestId('article-chunk-plaque')).toHaveLength(0)

    // 用户点击别处，选区收敛 → 延迟的导读结构补应用
    fireEvent.mouseUp(document.body)
    const sel = window.getSelection()!
    sel.removeAllRanges()
    act(() => {
      document.dispatchEvent(new Event('selectionchange'))
    })
    expect(screen.getAllByTestId('article-chunk-plaque')).toHaveLength(2)
  })

  it('无选区时 chunks 变化立即应用', () => {
    const content = '## Intro\n\nHello.\n\n## Details\n\nWorld.'
    const { rerender } = render(
      <ArticleBodyChunks content={content} chunks={[]} fileName="x.md" />
    )
    const chunks = [{ heading: 'Intro', summary: '', terms: [] }, { heading: 'Details', summary: '', terms: [] }]
    rerender(<ArticleBodyChunks content={content} chunks={chunks} fileName="x.md" />)
    expect(screen.getAllByTestId('article-chunk-plaque')).toHaveLength(2)
  })
})
