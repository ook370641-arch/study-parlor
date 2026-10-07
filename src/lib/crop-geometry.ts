// src/lib/crop-geometry.ts
// 封面裁剪的 object-cover 几何：缩略图 contain 适配舞台，裁剪框 = 视口宽高比在
// 原图上的可见窗口（换算到舞台像素）。数学与 scripts/curation-crop.cjs 的 geo() 一致。

export const DEFAULT_FOCUS = '50% 50%'

export interface CropGeo {
  /** 缩略图缩放比（contain） */
  s: number
  /** 缩略图左上角在舞台内的偏移 */
  left: number
  top: number
  /** 裁剪框尺寸（舞台像素） */
  rectW: number
  rectH: number
  /** 裁剪框可移动范围（舞台像素）；object-cover 总有一轴为 0 */
  rangeX: number
  rangeY: number
}

export function parseFocus(focus: string): [number, number] {
  const [x, y] = focus.split(' ').map(v => parseFloat(v))
  return [Number.isFinite(x) ? x : 50, Number.isFinite(y) ? y : 50]
}

export function formatFocus(x: number, y: number): string {
  const c = (v: number) => Math.round(Math.max(0, Math.min(100, v)))
  return `${c(x)}% ${c(y)}%`
}

export function computeCropGeo(args: {
  imgW: number; imgH: number; stageW: number; stageH: number; viewportW: number; viewportH: number
}): CropGeo | null {
  const { imgW, imgH, stageW, stageH, viewportW, viewportH } = args
  if (!imgW || !imgH || !stageW || !stageH || !viewportW || !viewportH) return null
  const s = Math.min(stageW / imgW, stageH / imgH)
  const k = Math.max(viewportW / imgW, viewportH / imgH)
  const cw = viewportW / k
  const ch = viewportH / k
  return {
    s,
    left: (stageW - imgW * s) / 2,
    top: (stageH - imgH * s) / 2,
    rectW: cw * s,
    rectH: ch * s,
    rangeX: Math.max(0, (imgW - cw) * s),
    rangeY: Math.max(0, (imgH - ch) * s),
  }
}

export function focusToRect(focus: string, geo: CropGeo): { left: number; top: number } {
  const [fx, fy] = parseFocus(focus)
  return { left: geo.rangeX * fx / 100, top: geo.rangeY * fy / 100 }
}

export function rectToFocus(left: number, top: number, geo: CropGeo): string {
  const fx = geo.rangeX ? (left / geo.rangeX) * 100 : 50
  const fy = geo.rangeY ? (top / geo.rangeY) * 100 : 50
  return formatFocus(fx, fy)
}
