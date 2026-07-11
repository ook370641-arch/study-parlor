import { describe, it, expect } from 'vitest'
import { splitArticleIntoChunks } from '../src/lib/article-chunks'

describe('splitArticleIntoChunks', () => {
  it('splits by headings and preserves preamble + order', () => {
    const body = '# Title\n\nIntro.\n\n## Section One\n\nBody one.\n\n## Section Two\n\nBody two.'
    const chunks = splitArticleIntoChunks(body, ['Section One', 'Section Two'])
    expect(chunks).toHaveLength(3)
    expect(chunks[0].heading).toBe('')            // preamble preserved
    expect(chunks[0].body).toContain('Intro.')
    expect(chunks[1].heading).toBe('Section One')
    expect(chunks[1].body).toContain('Body one.')
    expect(chunks[2].heading).toBe('Section Two')
  })

  it('does not match heading text appearing inside prose', () => {
    const body = '## Intro\n\nThis content is available in detail.\n\n## Details\n\nMore.'
    const chunks = splitArticleIntoChunks(body, ['AI', 'Details'])
    // 'AI' only appears inside 'available' (prose), never as a heading line, so it must NOT split there
    const headings = chunks.map((c) => c.heading)
    expect(headings).not.toContain('AI')
    expect(headings).toContain('Details')
  })

  it('ignores case and punctuation', () => {
    const body = '## SECTION-ONE!\n\ncontent'
    const chunks = splitArticleIntoChunks(body, ['section one'])
    expect(chunks).toHaveLength(1)
    expect(chunks[0].heading).toBe('section one')
  })

  it('falls back to single chunk when no headings match', () => {
    const body = 'just content'
    const chunks = splitArticleIntoChunks(body, ['missing'])
    expect(chunks).toHaveLength(1)
    expect(chunks[0].heading).toBe('')
  })
})
