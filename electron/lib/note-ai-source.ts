import fs from 'node:fs'
import path from 'node:path'
import matter from 'gray-matter'
import type { BookGuideContext, NoteEntry } from '@shared/index'
import { hashNoteRaw, parseNoteFile } from './notes'
import { loadCollection } from './blog-collection'
import { scanBooks } from './books'
import { assertInsideRoots } from './writing-tree'

export type AiNoteSourceIdentity =
  | { type: 'blog'; url: string }
  | { type: 'book'; book: string; chapter: string }

export type AiNoteInput = {
  notePath: string
  title: string
  sourceText: string
  guideText: string | null
  originalNote: string
  sourceIdentity: AiNoteSourceIdentity
  bookContext?: BookGuideContext
}

export type AiNoteSnapshot = {
  raw: string
  rawHash: string
  entry: NoteEntry
  originalContent: string
}

function sourceError(code: 'SOURCE_NOT_FOUND' | 'SOURCE_INVALID'): Error & { code: string } {
  const error = new Error(code) as Error & { code: string }
  error.code = code
  return error
}

export function normalizeSourceUrl(url: string): string {
  try {
    const normalized = new URL(url.trim())
    normalized.hash = ''
    normalized.pathname = normalized.pathname.replace(/\/+$/, '') || '/'
    return normalized.toString()
  } catch {
    return url.trim().replace(/\/+$/, '')
  }
}

function cleanEmbeddedImages(content: string): string {
  return content
    .replace(/!\[[^\]]*\]\(\s*data:image\/[^;]+;base64,[^)]+\)/gi, '[内嵌图片]')
    .replace(/<img\b[^>]*\bsrc=["']data:image\/[^;]+;base64,[^"']+["'][^>]*>/gi, '[内嵌图片]')
}

function resolveLibraryFile(libraryPath: string, filePath: string): string {
  const absolutePath = assertInsideRoots(libraryPath, filePath)
  if (!fs.existsSync(absolutePath) || !fs.statSync(absolutePath).isFile()) throw sourceError('SOURCE_NOT_FOUND')
  return absolutePath
}

function readGuide(sourcePath: string): string | null {
  const parsedPath = path.parse(sourcePath)
  const guidePath = path.join(parsedPath.dir, `${parsedPath.name}.guide.md`)
  if (!fs.existsSync(guidePath)) return null
  try {
    return matter(fs.readFileSync(guidePath, 'utf8')).content
  } catch {
    return null
  }
}

function readSource(sourcePath: string): { content: string; guideText: string | null } {
  try {
    const content = matter(fs.readFileSync(sourcePath, 'utf8')).content
    if (!content.trim()) throw sourceError('SOURCE_INVALID')
    return { content, guideText: readGuide(sourcePath) }
  } catch (error) {
    if ((error as Error & { code?: string }).code === 'SOURCE_INVALID') throw error
    throw sourceError('SOURCE_INVALID')
  }
}

function findBlogFallback(libraryPath: string, sourceUrl: string): string | null {
  const root = path.join(libraryPath, 'Anthropic博客')
  if (!fs.existsSync(root)) return null
  const pending = [root]
  while (pending.length > 0) {
    const directory = pending.pop()!
    for (const item of fs.readdirSync(directory, { withFileTypes: true })) {
      const absolutePath = path.join(directory, item.name)
      if (item.isDirectory()) {
        pending.push(absolutePath)
        continue
      }
      if (!item.name.endsWith('.md') || /\.(assistant|annotations|guide)\.md$/.test(item.name)) continue
      try {
        const parsed = matter(fs.readFileSync(absolutePath, 'utf8'))
        if (typeof parsed.data.source_url === 'string' && normalizeSourceUrl(parsed.data.source_url) === sourceUrl) return absolutePath
      } catch {
        continue
      }
    }
  }
  return null
}

function findBlogSource(libraryPath: string, noteUrl: string): string {
  const sourceUrl = normalizeSourceUrl(noteUrl)
  if (!sourceUrl) throw sourceError('SOURCE_NOT_FOUND')
  const collection = loadCollection(libraryPath)
  const mapped = [...collection.entries, ...collection.read]
    .find(item => normalizeSourceUrl(item.sourceUrl) === sourceUrl && item.filePath)
  if (mapped) {
    try {
      return resolveLibraryFile(libraryPath, mapped.filePath)
    } catch {
    }
  }
  const fallback = findBlogFallback(libraryPath, sourceUrl)
  if (!fallback) throw sourceError('SOURCE_NOT_FOUND')
  return fallback
}

function inferChapter(entry: NoteEntry): string {
  if (entry.meta.chapter?.trim()) return entry.meta.chapter.trim()
  const prefix = `${entry.meta.book ?? ''} · `
  return entry.meta.title.startsWith(prefix) ? entry.meta.title.slice(prefix.length).replace(/ · 标注(?: \d+)?$/, '').trim() : ''
}

function findBookSource(libraryPath: string, entry: NoteEntry): { sourcePath: string; chapter: string; bookContext: BookGuideContext } {
  const bookTitle = entry.meta.book?.trim()
  const chapter = inferChapter(entry)
  const book = scanBooks(libraryPath).find(item => item.title === bookTitle)
  const item = book?.toc.find(tocItem => tocItem.title === chapter)
  if (!book || !item) throw sourceError('SOURCE_NOT_FOUND')
  return {
    sourcePath: resolveLibraryFile(libraryPath, path.join(book.dir, item.chapterFile)),
    chapter,
    bookContext: { bookTitle: book.title, tocTitles: book.toc.map(tocItem => tocItem.title) },
  }
}

export function readAiNoteSnapshot(libraryPath: string, relativePath: string): AiNoteSnapshot {
  const normalizedPath = relativePath.replace(/\\/g, '/')
  if (path.posix.dirname(normalizedPath) !== 'notes' || !normalizedPath.endsWith('.md') || /\.(assistant|annotations|guide)\.md$/.test(normalizedPath)) {
    throw sourceError('SOURCE_INVALID')
  }
  const absolutePath = resolveLibraryFile(libraryPath, normalizedPath)
  const raw = fs.readFileSync(absolutePath, 'utf8')
  let parsed: matter.GrayMatterFile<string>
  try {
    parsed = matter(raw)
  } catch {
    throw sourceError('SOURCE_INVALID')
  }
  const entry = parseNoteFile(normalizedPath, raw)
  if (entry.parseError) throw sourceError('SOURCE_INVALID')
  return { raw, rawHash: hashNoteRaw(raw), entry, originalContent: parsed.content }
}

export function assembleAiNoteInput(libraryPath: string, snapshot: AiNoteSnapshot): AiNoteInput {
  const { entry } = snapshot
  if (entry.meta.source !== 'anthropic' && entry.meta.source !== 'web' && entry.meta.source !== 'book') throw sourceError('SOURCE_INVALID')
  const identity: AiNoteSourceIdentity = entry.meta.source === 'book'
    ? { type: 'book', book: entry.meta.book ?? '', chapter: inferChapter(entry) }
    : { type: 'blog', url: normalizeSourceUrl(entry.meta.url) }
  let sourcePath: string
  let bookContext: BookGuideContext | undefined
  if (identity.type === 'book') {
    const bookSource = findBookSource(libraryPath, entry)
    sourcePath = bookSource.sourcePath
    bookContext = bookSource.bookContext
  } else {
    sourcePath = findBlogSource(libraryPath, identity.url)
  }
  const source = readSource(sourcePath)
  return {
    notePath: entry.path,
    title: entry.meta.title,
    sourceText: source.content,
    guideText: source.guideText,
    originalNote: cleanEmbeddedImages(snapshot.originalContent),
    sourceIdentity: identity,
    ...(bookContext ? { bookContext } : {}),
  }
}
