import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

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
