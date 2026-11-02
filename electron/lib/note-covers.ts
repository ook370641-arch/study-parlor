import fs from 'node:fs'
import path from 'node:path'
import { createHash, randomUUID } from 'node:crypto'
import matter from 'gray-matter'
import { extractJsonObject } from './extract-json'
import { assertInsideRoots } from './writing-tree'
import type { NoteCoverDesign, NoteCoverElement, NoteCoverElementStyle, NoteCoverPaint } from '@shared/index'

const HEX_COLOR = /^#[0-9a-f]{6}$/i
const PATH_DATA = /^[MLCQAHVZ0-9\s,.+-]+$/
const POINTS_DATA = /^[0-9\s,.+-]+$/

function fail(message: string): never {
  throw new Error(`Invalid note cover design: ${message}`)
}

function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : fail('expected object')
}

function number(value: unknown, fallback: number, min = -4000, max = 4000): number {
  if (value === undefined) return fallback
  if (typeof value !== 'number' || !Number.isFinite(value)) fail('expected finite number')
  return Math.min(max, Math.max(min, value))
}

function requiredNumber(raw: Record<string, unknown>, key: string, min = -4000, max = 4000): number {
  if (!(key in raw)) fail(`missing ${key}`)
  return number(raw[key], 0, min, max)
}

function paint(value: unknown, fallback: NoteCoverPaint): NoteCoverPaint {
  if (value === undefined) return fallback
  if (value === 'background' || value === 'ink' || value === 'accent' || value === 'secondary' || value === 'none') return value
  return fail('invalid paint')
}

function linecap(value: unknown): NoteCoverElementStyle['strokeLinecap'] {
  if (value === undefined) return 'round'
  if (value === 'butt' || value === 'round' || value === 'square') return value
  return fail('invalid strokeLinecap')
}

function linejoin(value: unknown): NoteCoverElementStyle['strokeLinejoin'] {
  if (value === undefined) return 'round'
  if (value === 'miter' || value === 'round' || value === 'bevel') return value
  return fail('invalid strokeLinejoin')
}

function parseElement(value: unknown): NoteCoverElement {
  const raw = record(value)
  const type = raw.type
  const defaultFill = type === 'line' || type === 'polyline' ? 'none' : 'ink'
  const style: NoteCoverElementStyle = {
    fill: paint(raw.fill, defaultFill),
    stroke: paint(raw.stroke, 'none'),
    strokeWidth: number(raw.strokeWidth, 1, 0, 30),
    opacity: number(raw.opacity, 1, 0.05, 1),
    strokeLinecap: linecap(raw.strokeLinecap),
    strokeLinejoin: linejoin(raw.strokeLinejoin),
  }
  if (type === 'path') {
    if (typeof raw.d !== 'string' || !raw.d.trim() || !PATH_DATA.test(raw.d) || !/\d/.test(raw.d)) fail('invalid path')
    return { type, d: raw.d.trim(), ...style }
  }
  if (type === 'circle') return { type, cx: requiredNumber(raw, 'cx'), cy: requiredNumber(raw, 'cy'), r: requiredNumber(raw, 'r', 0), ...style }
  if (type === 'ellipse') return { type, cx: requiredNumber(raw, 'cx'), cy: requiredNumber(raw, 'cy'), rx: requiredNumber(raw, 'rx', 0), ry: requiredNumber(raw, 'ry', 0), ...style }
  if (type === 'rect') return { type, x: requiredNumber(raw, 'x'), y: requiredNumber(raw, 'y'), width: requiredNumber(raw, 'width', 0), height: requiredNumber(raw, 'height', 0), rx: number(raw.rx, 0, 0), ...style }
  if (type === 'line') return { type, x1: requiredNumber(raw, 'x1'), y1: requiredNumber(raw, 'y1'), x2: requiredNumber(raw, 'x2'), y2: requiredNumber(raw, 'y2'), ...style }
  if (type === 'polyline' || type === 'polygon') {
    if (typeof raw.points !== 'string' || !raw.points.trim() || !POINTS_DATA.test(raw.points) || !/\d/.test(raw.points)) fail('invalid points')
    return { type, points: raw.points.trim(), ...style }
  }
  return fail('unsupported element')
}

export function validateNoteCoverDesign(value: unknown): NoteCoverDesign {
  const raw = record(value)
  if (typeof raw.concept !== 'string' || !raw.concept.trim()) fail('invalid concept')
  const paletteRaw = record(raw.palette)
  const palette = { background: '', ink: '', accent: '', secondary: '' }
  for (const key of Object.keys(palette) as (keyof typeof palette)[]) {
    const color = paletteRaw[key]
    if (typeof color !== 'string' || !HEX_COLOR.test(color)) fail(`invalid ${key} color`)
    palette[key] = color
  }
  if (raw.background !== 'solid' && raw.background !== 'linear' && raw.background !== 'radial') fail('invalid background')
  if (!Array.isArray(raw.elements) || raw.elements.length < 3 || raw.elements.length > 24) fail('elements must contain 3 to 24 items')
  return {
    concept: raw.concept.trim().slice(0, 160),
    palette,
    background: raw.background,
    grain: number(raw.grain, 0.06, 0.03, 0.12),
    elements: raw.elements.map(parseElement),
  }
}

export function parseNoteCoverDesigns(raw: string): NoteCoverDesign[] {
  const extracted = extractJsonObject(raw)
  if (!extracted) fail('JSON not found')
  let parsed: unknown
  try { parsed = JSON.parse(extracted) } catch { return fail('invalid JSON') }
  const designs = record(parsed).designs
  if (!Array.isArray(designs) || designs.length !== 3) fail('exactly three designs required')
  return designs.map(validateNoteCoverDesign)
}

function renderElement(element: NoteCoverElement, palette: NoteCoverDesign['palette']): string {
  const color = (value: NoteCoverPaint | undefined) => value === 'none' ? 'none' : palette[value ?? 'ink']
  const common = `fill="${color(element.fill)}" stroke="${color(element.stroke)}" stroke-width="${element.strokeWidth ?? 1}" opacity="${element.opacity ?? 1}" stroke-linecap="${element.strokeLinecap ?? 'round'}" stroke-linejoin="${element.strokeLinejoin ?? 'round'}"`
  if (element.type === 'path') return `<path d="${element.d}" ${common}/>`
  if (element.type === 'circle') return `<circle cx="${element.cx}" cy="${element.cy}" r="${element.r}" ${common}/>`
  if (element.type === 'ellipse') return `<ellipse cx="${element.cx}" cy="${element.cy}" rx="${element.rx}" ry="${element.ry}" ${common}/>`
  if (element.type === 'rect') return `<rect x="${element.x}" y="${element.y}" width="${element.width}" height="${element.height}" rx="${element.rx ?? 0}" ${common}/>`
  if (element.type === 'line') return `<line x1="${element.x1}" y1="${element.y1}" x2="${element.x2}" y2="${element.y2}" ${common}/>`
  return `<${element.type} points="${element.points}" ${common}/>`
}

export function renderNoteCoverSvg(value: NoteCoverDesign): string {
  const design = validateNoteCoverDesign(value)
  const { background, ink, accent, secondary } = design.palette
  const backgroundDef = design.background === 'linear'
    ? `<linearGradient id="background" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${background}"/><stop offset="1" stop-color="${secondary}"/></linearGradient>`
    : design.background === 'radial'
      ? `<radialGradient id="background" cx="0.42" cy="0.3" r="0.85"><stop offset="0" stop-color="${secondary}"/><stop offset="1" stop-color="${background}"/></radialGradient>`
      : ''
  const backgroundFill = design.background === 'solid' ? background : 'url(#background)'
  const elements = design.elements.map(element => renderElement(element, design.palette)).join('')
  return `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="800" viewBox="0 0 600 800"><defs>${backgroundDef}<linearGradient id="title-shade" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#140c08" stop-opacity="0"/><stop offset="1" stop-color="#140c08" stop-opacity="0.9"/></linearGradient><filter id="paper-grain"><feTurbulence type="fractalNoise" baseFrequency="0.72" numOctaves="3" seed="17" stitchTiles="stitch"/><feColorMatrix type="saturate" values="0"/></filter></defs><rect width="600" height="800" fill="${backgroundFill}"/><g>${elements}</g><rect width="600" height="800" filter="url(#paper-grain)" opacity="${design.grain}"/><rect y="560" width="600" height="240" fill="url(#title-shade)"/></svg>`
}

function svgDataUrl(svg: string): string {
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`
}

function coverAbsolute(lib: string, cover: string): string | null {
  if (!cover.endsWith('.svg') || cover.includes('..') || cover.includes('\\')) return null
  const coversDir = path.resolve(lib, 'notes', 'covers')
  const abs = path.resolve(lib, cover)
  return path.dirname(abs) === coversDir ? abs : null
}

export function noteCoverDataUrl(lib: string, cover: string): string | null {
  const abs = coverAbsolute(lib, cover)
  if (!abs || !fs.existsSync(abs) || !fs.statSync(abs).isFile()) return null
  return svgDataUrl(fs.readFileSync(abs, 'utf8'))
}

export function saveNoteCover(lib: string, rel: string, value: NoteCoverDesign): { cover: string; coverUrl: string } {
  if (!/^notes\/[^/]+\.md$/.test(rel) || rel.includes('\\')) throw new Error('Invalid note path')
  const design = validateNoteCoverDesign(value)
  const noteAbs = assertInsideRoots(lib, rel)
  const document = matter(fs.readFileSync(noteAbs, 'utf8'))
  const oldCover = typeof document.data.cover === 'string' ? document.data.cover : ''
  const hash = createHash('sha256').update(JSON.stringify(design)).digest('hex').slice(0, 12)
  const cover = `notes/covers/${path.basename(rel, '.md')}-${hash}.svg`
  const coverAbs = assertInsideRoots(lib, cover)
  const coversDir = path.dirname(coverAbs)
  fs.mkdirSync(coversDir, { recursive: true })
  const coverExisted = fs.existsSync(coverAbs)
  const coverTmp = path.join(coversDir, `.${randomUUID()}.tmp`)
  const noteTmp = `${noteAbs}.${randomUUID()}.tmp`
  const svg = renderNoteCoverSvg(design)
  fs.writeFileSync(coverTmp, svg, 'utf8')
  fs.renameSync(coverTmp, coverAbs)
  try {
    fs.writeFileSync(noteTmp, matter.stringify(document.content, { ...document.data, cover }), 'utf8')
    fs.renameSync(noteTmp, noteAbs)
  } catch (error) {
    fs.rmSync(noteTmp, { force: true })
    if (!coverExisted && oldCover !== cover) fs.rmSync(coverAbs, { force: true })
    throw error
  }
  if (oldCover && oldCover !== cover) {
    const oldAbs = coverAbsolute(lib, oldCover)
    if (oldAbs) fs.rmSync(oldAbs, { force: true })
  }
  return { cover, coverUrl: svgDataUrl(svg) }
}
