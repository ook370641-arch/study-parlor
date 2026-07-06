import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

const PROMPT_DIR = path.resolve(__dirname, '../electron/prompts/briefing')
const files = ['profile-context.md', 'digest-intro.md', 'summarize-tweets.md', 'summarize-podcast.md', 'summarize-blogs.md', 'translate.md']

describe('briefing prompts', () => {
  for (const f of files) {
    it(`includes ${f}`, () => {
      const p = path.join(PROMPT_DIR, f)
      expect(fs.existsSync(p)).toBe(true)
      const text = fs.readFileSync(p, 'utf8')
      expect(text.length).toBeGreaterThan(50)
    })
  }

  it('translate.md mentions bilingual mode', () => {
    const text = fs.readFileSync(path.join(PROMPT_DIR, 'translate.md'), 'utf8')
    expect(text).toContain('bilingual')
  })

  it('profile-context.md contains the profile placeholder', () => {
    const text = fs.readFileSync(path.join(PROMPT_DIR, 'profile-context.md'), 'utf8')
    expect(text).toContain('{{profile_text}}')
  })

  it('contains explain_like_beginner in summarization prompts', () => {
    const dir = PROMPT_DIR
    for (const f of ['summarize-tweets.md', 'summarize-blogs.md', 'summarize-podcast.md']) {
      const content = fs.readFileSync(path.join(dir, f), 'utf8')
      expect(content).toContain('explain_like_beginner')
    }
  })

  it('forbids decorative masthead in digest intro', () => {
    const dir = PROMPT_DIR
    const content = fs.readFileSync(path.join(dir, 'digest-intro.md'), 'utf8')
    expect(content).toContain('AI Builders Digest')
    expect(content).toContain('No decorative headers')
  })
})
