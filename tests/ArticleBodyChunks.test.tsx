import { describe, it, expect, vi } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'

vi.mock('@/components/md/MarkdownRenderer', () => ({
  MarkdownRenderer: ({ content }: any) => <div>{content}</div>,
}))

import { ArticleBodyChunks } from '../src/components/article-assistant/ArticleBodyChunks'

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
})
