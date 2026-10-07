// tests/crop-geometry.test.ts
import { describe, it, expect } from 'vitest'
import { computeCropGeo, focusToRect, rectToFocus, formatFocus, parseFocus } from '@/lib/crop-geometry'

describe('crop-geometry', () => {
  // 横图 2000x1000，舞台 320x160（contain s=0.16），视口 1600x900
  // object-cover: k=max(0.8,0.9)=0.9 → cw=1777.8, ch=1000 → 只横向有余量
  const geo = computeCropGeo({ imgW: 2000, imgH: 1000, stageW: 320, stageH: 160, viewportW: 1600, viewportH: 900 })!

  it('computeCropGeo 计算裁剪框与可移动范围', () => {
    expect(geo.s).toBeCloseTo(0.16)
    expect(geo.rangeX).toBeCloseTo(35.56, 1)
    expect(geo.rangeY).toBe(0)
    expect(geo.rectW).toBeCloseTo(1777.78 * 0.16, 1)
    expect(geo.rectH).toBeCloseTo(160)
  })

  it('focusToRect 把百分比焦点映射为框位置', () => {
    const r = focusToRect('50% 50%', geo)
    expect(r.left).toBeCloseTo(geo.rangeX / 2)
    expect(r.top).toBe(0)
  })

  it('rectToFocus 边界：0 → 0%，rangeX → 100%', () => {
    expect(rectToFocus(0, 0, geo)).toBe('0% 50%')
    expect(rectToFocus(geo.rangeX, 0, geo)).toBe('100% 50%')
  })

  it('object-cover 总有一轴无余量，该轴锁 50%', () => {
    // 竖图 1000x2000，视口 1600x900 → 横向无余量
    const g2 = computeCropGeo({ imgW: 1000, imgH: 2000, stageW: 320, stageH: 160, viewportW: 1600, viewportH: 900 })!
    expect(g2.rangeX).toBe(0)
    expect(g2.rangeY).toBeGreaterThan(0)
    expect(rectToFocus(5, g2.rangeY, g2)).toBe('50% 100%')
  })

  it('自由轴往返换算一致', () => {
    const r = focusToRect('50% 60%', geo) // rangeY=0，y 轴恒 50
    expect(rectToFocus(r.left, r.top, geo)).toBe('50% 50%')
    const g2 = computeCropGeo({ imgW: 1000, imgH: 2000, stageW: 320, stageH: 160, viewportW: 1600, viewportH: 900 })!
    const r2 = focusToRect('50% 60%', g2)
    expect(rectToFocus(r2.left, r2.top, g2)).toBe('50% 60%')
  })

  it('formatFocus clamp 到 0-100 并取整', () => {
    expect(formatFocus(-5, 130)).toBe('0% 100%')
    expect(formatFocus(33.6, 66.4)).toBe('34% 66%')
  })

  it('parseFocus 容错非法输入', () => {
    expect(parseFocus('50% 30%')).toEqual([50, 30])
    expect(parseFocus('garbage')).toEqual([50, 50])
  })

  it('非法尺寸返回 null', () => {
    expect(computeCropGeo({ imgW: 0, imgH: 100, stageW: 320, stageH: 160, viewportW: 1600, viewportH: 900 })).toBeNull()
  })
})
