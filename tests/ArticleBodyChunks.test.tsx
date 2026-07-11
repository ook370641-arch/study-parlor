import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

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
})
