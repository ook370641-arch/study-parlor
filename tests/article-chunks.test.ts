import { describe, it, expect } from 'vitest'
import { splitArticleIntoChunks } from '../src/lib/article-chunks'

describe('splitArticleIntoChunks', () => {
  it('splits by headings and preserves order', () => {
    const body = '# Title\n\nIntro.\n\n## Section One\n\nBody one.\n\n## Section Two\n\nBody two.'
    const chunks = splitArticleIntoChunks(body, ['Section One', 'Section Two'])
    expect(chunks).toHaveLength(2)
    expect(chunks[0].heading).toBe('Section One')
    expect(chunks[0].body).toContain('Body one.')
    expect(chunks[1].heading).toBe('Section Two')
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
