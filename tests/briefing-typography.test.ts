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

  it('英文引注样式只作用于中英混排文档（md-doc-noncjk 整篇英文关闭斜体降档）', () => {
    expect(markdownCss).toContain('.briefing-body-academic .md-body:not(.md-doc-noncjk) p:lang(en),')
    expect(markdownCss).toContain('.briefing-body-newspaper .md-body:not(.md-doc-noncjk) p:lang(en)')
    // 旧的无文档判定的裸选择器不应残留
    expect(markdownCss).not.toMatch(/\.briefing-body-academic p:lang\(en\)/)
    expect(markdownCss).not.toMatch(/\.briefing-body-newspaper p:lang\(en\)/)
  })

  it('标题字号用 em 阶梯跟随正文字号档位（档上调时标题始终大于正文）', () => {
    expect(markdownCss).toMatch(/\.md-body h2,[\s\S]*?font-size:\s*1\.35em/)
    expect(markdownCss).toMatch(/\.md-body h3,[\s\S]*?font-size:\s*1\.12em/)
    expect(markdownCss).toMatch(/\.md-body h4,[\s\S]*?font-size:\s*1em/)
  })

  it('代码块限高可滚动、代码字号跟随正文', () => {
    expect(markdownCss).toMatch(/\.md-codeblock pre,[\s\S]*?max-height:\s*480px/)
    expect(markdownCss).toMatch(/\.md-codeblock pre,[\s\S]*?overflow:\s*auto/)
    expect(markdownCss).toMatch(/\.md-codeblock pre code,[\s\S]*?font-size:\s*0\.85em/)
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
