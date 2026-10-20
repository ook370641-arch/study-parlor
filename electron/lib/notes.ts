import fs from 'node:fs'
import path from 'node:path'
import matter from 'gray-matter'
import type { NoteEntry, NoteMeta, NoteSource } from '@shared/index'
import { loadCollection } from './blog-collection'
import { assertInsideRoots } from './writing-tree'

export const NOTES_DIR = 'notes'

const ILLEGAL = /[\\/:*?"<>|]/g

const SIDECAR_PATTERN = /\.(assistant|annotations|guide)\.md$/

export function sanitizeNoteFilename(title: string): string {
  const cleaned = title.replace(ILLEGAL, '').trim().slice(0, 80)
  return cleaned || 'untitled'
}

export function serializeNote(meta: NoteMeta, body: string): string {
  return matter.stringify(body, meta as unknown as Record<string, unknown>)
}

function emptyMeta(): NoteMeta {
  return { title: '', url: '', source: 'unknown', rating: 0, summary: '', highlight: '', collected_at: '' }
}

function iso(v: unknown): string {
  if (typeof v === 'string') return v
  if (v instanceof Date) return v.toISOString()
  return ''
}

function validSource(v: unknown): NoteSource {
  return v === 'anthropic' || v === 'web' || v === 'book' || v === 'unknown' ? v : 'unknown'
}

function validRating(v: unknown): number {
  return typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= 5 ? v : 0
}

export function parseNoteFile(relPath: string, raw: string): NoteEntry {
  try {
    const d = matter(raw)
    const fm = (d.data ?? {}) as Record<string, unknown>
    const meta: NoteMeta = {
      title: typeof fm.title === 'string' ? fm.title : '',
      url: typeof fm.url === 'string' ? fm.url : '',
      source: validSource(fm.source),
      rating: validRating(fm.rating),
      summary: typeof fm.summary === 'string' ? fm.summary : '',
      highlight: typeof fm.highlight === 'string' ? fm.highlight : '',
      collected_at: iso(fm.collected_at),
    }
    const readAt = iso(fm.read_at)
    if (readAt) meta.read_at = readAt
    return { path: relPath, meta }
  } catch {
    return { path: relPath, meta: emptyMeta(), parseError: true }
  }
}

function notesDirAbs(lib: string): string {
  const dir = path.join(lib, NOTES_DIR)
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  return dir
}

function uniqueNoteName(absDir: string, base: string): string {
  let candidate = `${base}.md`
  let n = 1
  while (fs.existsSync(path.join(absDir, candidate))) {
    const now = new Date()
    const pad = (v: number) => String(v).padStart(2, '0')
    const suffix = pad(now.getHours()) + pad(now.getMinutes())
    candidate = n === 1 ? `${base}-${suffix}.md` : `${base}-${suffix}-${n}.md`
    n++
  }
  return candidate
}

export function scanNotes(lib: string): NoteEntry[] {
  const dir = notesDirAbs(lib)
  const entries = fs
    .readdirSync(dir)
    .filter(f => f.endsWith('.md') && !f.startsWith('.') && !SIDECAR_PATTERN.test(f))
    .map(f => parseNoteFile(`${NOTES_DIR}/${f}`, fs.readFileSync(path.join(dir, f), 'utf8')))
  entries.sort((a, b) => b.meta.collected_at.localeCompare(a.meta.collected_at))
  return entries
}

export function createNoteFile(lib: string, a: { title: string; url: string; source?: NoteSource }): { path: string } {
  const dir = notesDirAbs(lib)
  const name = uniqueNoteName(dir, sanitizeNoteFilename(a.title))
  const meta: NoteMeta = {
    title: a.title,
    url: a.url,
    source: a.source ?? 'unknown',
    rating: 0,
    summary: '',
    highlight: '',
    collected_at: new Date().toISOString(),
  }
  fs.writeFileSync(path.join(dir, name), serializeNote(meta, ''), 'utf8')
  return { path: `${NOTES_DIR}/${name}` }
}

export function updateNoteMeta(lib: string, rel: string, patch: Partial<NoteMeta>): void {
  const abs = assertInsideRoots(lib, rel)
  const d = matter(fs.readFileSync(abs, 'utf8'))
  const merged = { ...d.data, ...patch }
  const tmp = abs + '.tmp'
  fs.writeFileSync(tmp, matter.stringify(d.content, merged), 'utf8')
  fs.renameSync(tmp, abs)
}

export function deleteNoteFile(lib: string, rel: string): void {
  fs.rmSync(assertInsideRoots(lib, rel))
}

export function importReadNotes(lib: string): { created: number; skipped: number } {
  const read = loadCollection(lib).read
  const existingUrls = new Set(scanNotes(lib).map(e => e.meta.url))
  let created = 0
  let skipped = 0
  for (const entry of read) {
    if (existingUrls.has(entry.sourceUrl)) {
      skipped++
      continue
    }
    const title = entry.title || entry.sourceUrl.split('/').pop() || 'untitled'
    const { path: rel } = createNoteFile(lib, { title, url: entry.sourceUrl, source: 'anthropic' })
    updateNoteMeta(lib, rel, { source: 'anthropic', read_at: entry.readAt, collected_at: entry.readAt })
    existingUrls.add(entry.sourceUrl)
    created++
  }
  return { created, skipped }
}
