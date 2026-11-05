import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import matter from 'gray-matter'
import type { NoteEntry, NoteMeta, NoteSource } from '@shared/index'
import { loadCollection } from './blog-collection'
import { assertInsideRoots } from './writing-tree'
import { noteCoverDataUrl } from './note-covers'

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
    if (typeof fm.book === 'string' && fm.book) meta.book = fm.book
    if (typeof fm.chapter === 'string' && fm.chapter) meta.chapter = fm.chapter
    if (typeof fm.cover === 'string' && fm.cover) meta.cover = fm.cover
    const aiGeneratedAt = iso(fm.ai_generated_at)
    if (aiGeneratedAt) meta.ai_generated_at = aiGeneratedAt
    return { path: relPath, meta }
  } catch {
    return { path: relPath, meta: emptyMeta(), parseError: true }
  }
}

export function hashNoteRaw(raw: string): string {
  return crypto.createHash('sha256').update(raw).digest('hex')
}

export function composeAiNoteBody(aiBody: string, originalContent: string): string {
  if (!originalContent) return aiBody
  return `${aiBody}\n\n---\n\n## 原笔迹\n\n${originalContent}`
}

export function applyAiNote(
  lib: string,
  rel: string,
  args: { aiBody: string; baseRawHash: string; aiGeneratedAt: string },
): { body: string } {
  const absolutePath = assertInsideRoots(lib, rel)
  const raw = fs.readFileSync(absolutePath, 'utf8')
  const parsed = matter(raw)
  if (iso(parsed.data.ai_generated_at)) {
    const error = new Error('ALREADY_GENERATED') as Error & { code: string }
    error.code = 'ALREADY_GENERATED'
    throw error
  }
  if (hashNoteRaw(raw) !== args.baseRawHash) {
    const error = new Error('NOTE_CHANGED') as Error & { code: string }
    error.code = 'NOTE_CHANGED'
    throw error
  }
  const body = composeAiNoteBody(args.aiBody, parsed.content)
  const temporaryPath = `${absolutePath}.${process.pid}.${Date.now()}.tmp`
  try {
    fs.writeFileSync(temporaryPath, matter.stringify(body, { ...parsed.data, ai_generated_at: args.aiGeneratedAt }), 'utf8')
    fs.renameSync(temporaryPath, absolutePath)
  } catch (error) {
    fs.rmSync(temporaryPath, { force: true })
    throw error
  }
  return { body }
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
    .map(entry => {
      const coverUrl = entry.meta.cover ? noteCoverDataUrl(lib, entry.meta.cover) : null
      return coverUrl ? { ...entry, coverUrl } : entry
    })
  entries.sort((a, b) => b.meta.collected_at.localeCompare(a.meta.collected_at))
  return entries
}

export function createNoteFile(
  lib: string,
  a: { title: string; url: string; source?: NoteSource; book?: string; chapter?: string; body?: string }
): { path: string } {
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
    ...(a.book ? { book: a.book } : {}),
    ...(a.chapter ? { chapter: a.chapter } : {}),
  }
  fs.writeFileSync(path.join(dir, name), serializeNote(meta, a.body ?? ''), 'utf8')
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
