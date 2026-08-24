import { describe, it, expect } from 'vitest'
import { buildPreviewSrcdoc } from '@/lib/html-srcdoc'
import { WRITING_HTML_ZOOM } from '@/lib/briefing-font-size'
import { BRIEFING_FONT_SIZES } from '@/lib/briefing-font-size'

describe('buildPreviewSrcdoc', () => {
  it('注入 <base target="_blank">：有 <head> 插到其后', () => {
    const out = buildPreviewSrcdoc('<html><head><meta charset="utf-8"></head><body></body></html>', 1.2)
    expect(out).toContain('<head><base target="_blank" data-sp-inject>')
  })

  it('注入 <base target="_blank">：无 <head> 前置文档头', () => {
    const out = buildPreviewSrcdoc('<p>hi</p>', 1.2)
    expect(out.startsWith('<base target="_blank" data-sp-inject>')).toBe(true)
  })

  it('注入 zoom 样式：有 </head> 插到其前', () => {
    const out = buildPreviewSrcdoc('<html><head></head><body></body></html>', 1.33)
    expect(out).toContain('<style data-sp-inject>html{zoom:1.33 !important}</style></head>')
  })

  it('注入 zoom 样式：无 </head> 前置文档头', () => {
    const out = buildPreviewSrcdoc('<p>hi</p>', 1.33)
    expect(out).toContain('<style data-sp-inject>html{zoom:1.33 !important}</style>')
  })

  it('zoom 样式带 !important（压过页面自带样式）', () => {
    const out = buildPreviewSrcdoc('<html><head><style>html{zoom:2}</style></head><body></body></html>', 1.2)
    expect(out).toContain('zoom:1.2 !important')
  })

  it('大写 <HEAD> 也能识别（大小写不敏感）', () => {
    const out = buildPreviewSrcdoc('<HTML><HEAD></HEAD><BODY></BODY></HTML>', 1.2)
    expect(out.toLowerCase()).toContain('</style></head>')
  })
})

describe('WRITING_HTML_ZOOM', () => {
  it('覆盖全部 10 档', () => {
    for (const size of BRIEFING_FONT_SIZES) {
      expect(typeof WRITING_HTML_ZOOM[size]).toBe('number')
    }
  })

  it('base 档 = 1.2（默认已放大）', () => {
    expect(WRITING_HTML_ZOOM.base).toBe(1.2)
  })

  it('档位递增', () => {
    const values = BRIEFING_FONT_SIZES.map(s => WRITING_HTML_ZOOM[s])
    for (let i = 1; i < values.length; i++) {
      expect(values[i]).toBeGreaterThan(values[i - 1])
    }
  })
})

describe('删除模式脚本注入', () => {
  it('hover 样式与编辑脚本带 data-sp-inject，插到 </body> 前', () => {
    const out = buildPreviewSrcdoc('<html><head></head><body><p>x</p></body></html>', 1.2)
    expect(out).toContain('<style data-sp-inject>.sp-del-hover')
    const scriptIdx = out.indexOf('<script data-sp-inject>')
    expect(scriptIdx).toBeGreaterThan(-1)
    expect(out.indexOf('</body>')).toBeGreaterThan(scriptIdx)
  })

  it('无 </body> 时尾置', () => {
    const out = buildPreviewSrcdoc('<p>hi</p>', 1.2)
    expect(out.trimEnd().endsWith('</script>')).toBe(true)
  })

  it('脚本体不含字面量 </script（会提前闭合标签）', () => {
    const out = buildPreviewSrcdoc('<p>hi</p>', 1.2)
    const m = out.match(/<script data-sp-inject>([\s\S]*?)<\/script>/)
    expect(m).not.toBeNull()
    expect(m![1]).not.toContain('</script')
    expect(m![1]).not.toContain('`')
  })

  it('脚本含 postMessage 协议四件套与块选择器', () => {
    const out = buildPreviewSrcdoc('<p>hi</p>', 1.2)
    for (const token of ['sp-html-edit', 'sp-html-collect', 'sp-html-save', 'sp-html-dirty', 'data-sp-inject']) {
      expect(out).toContain(token)
    }
  })
})
