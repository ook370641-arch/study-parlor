import { describe, it, expect } from 'vitest'
import { buildPreviewSrcdoc } from '@/lib/html-srcdoc'
import { WRITING_HTML_ZOOM } from '@/lib/briefing-font-size'
import { BRIEFING_FONT_SIZES } from '@/lib/briefing-font-size'

describe('buildPreviewSrcdoc', () => {
  it('注入 <base target="_blank">：有 <head> 插到其后', () => {
    const out = buildPreviewSrcdoc('<html><head><meta charset="utf-8"></head><body></body></html>', 1.2)
    expect(out).toContain('<head><base target="_blank">')
  })

  it('注入 <base target="_blank">：无 <head> 前置文档头', () => {
    const out = buildPreviewSrcdoc('<p>hi</p>', 1.2)
    expect(out.startsWith('<base target="_blank">')).toBe(true)
  })

  it('注入 zoom 样式：有 </head> 插到其前', () => {
    const out = buildPreviewSrcdoc('<html><head></head><body></body></html>', 1.33)
    expect(out).toContain('<style>html{zoom:1.33 !important}</style></head>')
  })

  it('注入 zoom 样式：无 </head> 前置文档头', () => {
    const out = buildPreviewSrcdoc('<p>hi</p>', 1.33)
    expect(out).toContain('<style>html{zoom:1.33 !important}</style>')
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
