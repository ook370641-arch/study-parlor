import { describe, it, expect } from 'vitest'
import {
  ANTHROPIC_SECTIONS as MAIN_SECTIONS,
  sectionForUrl as mainSectionForUrl,
} from '../electron/lib/anthropic-sections'
import {
  ANTHROPIC_SECTIONS as RENDER_SECTIONS,
  sectionForUrl,
  sectionOf,
} from '../src/lib/anthropic-sections'

describe('ANTHROPIC_SECTIONS config', () => {
  it('has exactly engineering / institute / research in order', () => {
    expect(MAIN_SECTIONS.map((s) => s.key)).toEqual(['engineering', 'institute', 'research'])
  })

  it('research excludes team pages', () => {
    const research = MAIN_SECTIONS.find((s) => s.key === 'research')
    expect(research?.excludePrefixes).toEqual(['/research/team/'])
  })

  it('each section has indexUrl matching its linkPrefix', () => {
    for (const s of MAIN_SECTIONS) {
      expect(s.indexUrl).toBe(`https://www.anthropic.com${s.linkPrefix.slice(0, -1)}`)
      expect(s.color).toMatch(/^#[0-9a-f]{6}$/)
    }
  })

  it('renderer copy stays in sync with main copy', () => {
    expect(RENDER_SECTIONS).toEqual(MAIN_SECTIONS)
  })
})

describe('sectionForUrl', () => {
  it('maps section urls to keys', () => {
    expect(sectionForUrl('https://www.anthropic.com/engineering/foo')).toBe('engineering')
    expect(sectionForUrl('https://www.anthropic.com/institute/recursive-self-improvement')).toBe('institute')
    expect(sectionForUrl('https://www.anthropic.com/research/global-workspace')).toBe('research')
  })

  it('falls back to engineering for unknown urls', () => {
    expect(sectionForUrl('https://www.anthropic.com/news/claude-opus-5')).toBe('engineering')
    expect(sectionForUrl('')).toBe('engineering')
  })
})

describe('sectionOf', () => {
  it('prefers meta.section over url inference', () => {
    expect(sectionOf({ url: 'https://www.anthropic.com/institute/x', section: 'research' })).toBe('research')
  })

  it('infers from url when section missing (old cache)', () => {
    expect(sectionOf({ url: 'https://www.anthropic.com/research/x' })).toBe('research')
    expect(sectionOf({ url: 'https://www.anthropic.com/engineering/x' })).toBe('engineering')
  })
})
