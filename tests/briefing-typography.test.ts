import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { BRIEFING_FONT_SIZES, BRIEFING_LIST_STYLES, BRIEFING_QUOTE_SIZES } from '@/lib/briefing-font-size'

const markdownCss = fs.readFileSync(path.join(process.cwd(), 'src/components/md/markdown.css'), 'utf8')

describe('briefing academic typography', () => {
  it('decorates academic section headings with the amber diamond ornament', () => {
    expect(markdownCss).toContain('.briefing-body-academic .md-body h2::before')
    expect(markdownCss).toContain('◆')
  })

  it('highlights terms with a dotted amber underline', () => {
    expect(markdownCss).toMatch(/\.article-term-highlight\s*\{[^}]*border-bottom:\s*1px dotted #d97757/)
  })

  it('sets academic body line-height to 1.9', () => {
    expect(markdownCss).toMatch(/\.briefing-body-academic \.md-body p\s*\{[^}]*line-height:\s*1\.9/)
  })
})

describe('constellation motion fallbacks', () => {
  it('globals.css defines wellPulse keyframes and a reduced-motion opt-out', () => {
    const globals = fs.readFileSync(path.join(process.cwd(), 'src/styles/globals.css'), 'utf8')
    expect(globals).toContain('@keyframes wellPulse')
    expect(globals).toContain('prefers-reduced-motion')
    expect(globals).toContain('.constellation-animated')
  })
})

describe('briefing font size extension', () => {
  it('exposes list title/meta and quote sizes for every font step', () => {
    for (const size of BRIEFING_FONT_SIZES) {
      expect(BRIEFING_LIST_STYLES[size].title).toMatch(/px$/)
      expect(BRIEFING_LIST_STYLES[size].meta).toMatch(/px$/)
      expect(BRIEFING_QUOTE_SIZES[size]).toMatch(/px$/)
    }
  })

  it('list title grows from 13px to 22px across the scale', () => {
    expect(BRIEFING_LIST_STYLES.sm.title).toBe('13px')
    expect(BRIEFING_LIST_STYLES['7xl'].title).toBe('22px')
  })

  it('list meta grows from 10px to 18px across the scale', () => {
    expect(BRIEFING_LIST_STYLES.sm.meta).toBe('10px')
    expect(BRIEFING_LIST_STYLES['7xl'].meta).toBe('18px')
  })

  it('quote size grows from 12px to 21px across the scale', () => {
    expect(BRIEFING_QUOTE_SIZES.sm).toBe('12px')
    expect(BRIEFING_QUOTE_SIZES['7xl']).toBe('21px')
  })
})
