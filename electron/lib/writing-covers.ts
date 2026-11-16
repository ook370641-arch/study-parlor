import fs from 'node:fs'
import path from 'node:path'
import { createHash, randomUUID } from 'node:crypto'
import matter from 'gray-matter'
import type { NoteCoverDesign, WritingRoot } from '@shared/index'
import { renderNoteCoverSvg, validateNoteCoverDesign } from './note-covers'
import { assertInsideRoots } from './writing-tree'
import { loadCatalog, updateEntry } from './writing-catalog'

function writingRootOf(rel: string): WritingRoot {
  if (!/^(writing|repository)\/.+\.(?:md|html)$/.test(rel) || rel.includes('\\')) {
    throw Object.assign(new Error('Invalid writing path'), { code: 'WRITING_PATH_FORBIDDEN' })
  }
  return rel.startsWith('writing/') ? 'writing' : 'repository'
}

function pathHash(rel: string): string {
  return createHash('sha256').update(rel).digest('hex').slice(0, 12)
}

function svgDataUrl(svg: string): string {
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`
}

function coverAbsolute(lib: string, cover: string): string | null {
  if (!/^(writing|repository)\/\.covers\/[^/]+\.svg$/.test(cover) || cover.includes('..') || cover.includes('\\')) return null
  const root = cover.startsWith('writing/') ? 'writing' : 'repository'
  const coversDir = path.resolve(lib, root, '.covers')
  const absolutePath = path.resolve(lib, cover)
  return path.dirname(absolutePath) === coversDir ? absolutePath : null
}

export function writingCoverDataUrl(lib: string, cover: string): string | null {
  const absolutePath = coverAbsolute(lib, cover)
  if (!absolutePath || !fs.existsSync(absolutePath) || !fs.statSync(absolutePath).isFile()) return null
  return svgDataUrl(fs.readFileSync(absolutePath, 'utf8'))
}

export function saveWritingCover(lib: string, rel: string, value: NoteCoverDesign): { cover: string; coverUrl: string } {
  const root = writingRootOf(rel)
  const design = validateNoteCoverDesign(value)
  const documentPath = assertInsideRoots(lib, rel)
  const isHtml = rel.endsWith('.html')
  const document = isHtml ? null : matter(fs.readFileSync(documentPath, 'utf8'))
  const oldCover = document
    ? typeof document.data.cover === 'string' ? document.data.cover : ''
    : loadCatalog(lib, root).entries[rel]?.cover ?? ''
  const designHash = createHash('sha256').update(JSON.stringify(design)).digest('hex').slice(0, 12)
  const cover = `${root}/.covers/${pathHash(rel)}${designHash}.svg`
  const coverPath = assertInsideRoots(lib, cover)
  const coversDir = path.dirname(coverPath)
  const coverExisted = fs.existsSync(coverPath)
  const coverTmp = path.join(coversDir, `.${randomUUID()}.tmp`)
  const documentTmp = `${documentPath}.${randomUUID()}.tmp`
  const svg = renderNoteCoverSvg(design)
  fs.mkdirSync(coversDir, { recursive: true })
  fs.writeFileSync(coverTmp, svg, 'utf8')
  fs.renameSync(coverTmp, coverPath)
  try {
    if (document) {
      fs.writeFileSync(documentTmp, matter.stringify(document.content, { ...document.data, cover }), 'utf8')
      fs.renameSync(documentTmp, documentPath)
    } else {
      const existing = loadCatalog(lib, root).entries[rel]
      updateEntry(lib, root, rel, {
        title: existing?.title ?? path.basename(rel, '.html'),
        summary: existing?.summary ?? '',
        cover,
      })
    }
  } catch (error) {
    fs.rmSync(documentTmp, { force: true })
    if (!coverExisted && oldCover !== cover) fs.rmSync(coverPath, { force: true })
    throw error
  }
  if (oldCover && oldCover !== cover) {
    const oldPath = coverAbsolute(lib, oldCover)
    if (oldPath) fs.rmSync(oldPath, { force: true })
  }
  return { cover, coverUrl: svgDataUrl(svg) }
}

export function deleteWritingCovers(lib: string, rel: string): void {
  const root = writingRootOf(rel)
  const coversDir = path.join(lib, root, '.covers')
  if (!fs.existsSync(coversDir)) return
  const prefix = pathHash(rel)
  for (const name of fs.readdirSync(coversDir)) {
    if (name.startsWith(prefix) && name.endsWith('.svg')) fs.rmSync(path.join(coversDir, name), { force: true })
  }
}
