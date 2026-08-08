import fs from 'node:fs'
import path from 'node:path'
import matter from 'gray-matter'
import { loadCatalog } from './writing-catalog'
import type { WritingRoot, WritingTreeNode } from '@shared/index'

// ── constants ────────────────────────────────────────────────
export const WRITING_ROOTS: WritingRoot[] = ['writing', 'repository']

// ── helpers ──────────────────────────────────────────────────

const HIDDEN_FILE_PATTERNS = [
  /\.assistant\.md$/,
  /\.annotations\.md$/,
  /\.guide\.md$/,
  /^\.catalog\.json$/,
  /^\.assets$/,
  /^\.trash$/,
]

function isHidden(name: string): boolean {
  return HIDDEN_FILE_PATTERNS.some(p => p.test(name))
}

function code(c: string, msg: string): Error {
  const e = new Error(`${c}: ${msg}`)
  ;(e as Error & { code?: string }).code = c
  return e
}

function toRel(lib: string, absPath: string): string {
  return path.relative(lib, absPath).replace(/\\/g, '/')
}

function uniqueName(absDir: string, name: string): string {
  const ext = path.extname(name)
  const base = path.basename(name, ext)
  let candidate = name
  let n = 1
  while (fs.existsSync(path.join(absDir, candidate))) {
    const now = new Date()
    const pad = (v: number) => String(v).padStart(2, '0')
    const suffix = pad(now.getHours()) + pad(now.getMinutes())
    if (n === 1) {
      candidate = `${base}-${suffix}${ext}`
    } else {
      candidate = `${base}-${suffix}-${n}${ext}`
    }
    n++
  }
  return candidate
}

// ── security ─────────────────────────────────────────────────

/**
 * Resolve a relative path to absolute and validate it stays within `lib`.
 * Returns the resolved absolute path.
 */
export function assertInsideRoots(lib: string, rel: string): string {
  if (rel.includes('..')) {
    throw code('WRITING_PATH_FORBIDDEN', `Path traversal not allowed: ${rel}`)
  }
  const abs = path.resolve(lib, rel)
  const normLib = path.resolve(lib) + path.sep
  if (!abs.startsWith(normLib) && abs !== path.resolve(lib)) {
    throw code('WRITING_PATH_FORBIDDEN', `Path outside library: ${rel}`)
  }
  return abs
}

// ── ensure roots ─────────────────────────────────────────────

export function ensureRoots(lib: string): void {
  for (const root of WRITING_ROOTS) {
    const dir = path.join(lib, root)
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true })
    }
  }
}

// ── scan ─────────────────────────────────────────────────────

function scanDir(
  absoluteDir: string,
  lib: string,
  root?: WritingRoot,
  catalog?: { entries: Record<string, { title?: string; summary?: string; updatedAt?: string }> },
): WritingTreeNode[] {
  if (!fs.existsSync(absoluteDir)) return []

  // Load catalog for this root only on the top-level call from scanRoot
  let effectiveCatalog = catalog ?? { entries: {} }
  if (root) {
    try { effectiveCatalog = loadCatalog(lib, root) } catch { /* keep empty */ }
  }

  const entries = fs.readdirSync(absoluteDir, { withFileTypes: true })
  const result: WritingTreeNode[] = []

  for (const entry of entries) {
    if (isHidden(entry.name)) continue
    if (entry.isDirectory()) {
      const children = scanDir(path.join(absoluteDir, entry.name), lib, undefined, effectiveCatalog)
      result.push({
        name: entry.name,
        path: toRel(lib, path.join(absoluteDir, entry.name)),
        kind: 'dir',
        children,
      })
    } else if (entry.isFile() && entry.name.endsWith('.md')) {
      const relPath = toRel(lib, path.join(absoluteDir, entry.name))
      const node: WritingTreeNode = { name: entry.name, path: relPath, kind: 'file' }
      // Attach catalog summary if available
      const catEntry = effectiveCatalog.entries[relPath]
      if (catEntry) {
        if (catEntry.summary) node.summary = catEntry.summary
        if (catEntry.updatedAt) node.catalogUpdatedAt = catEntry.updatedAt
      }
      result.push(node)
    }
    // ignore non-md files
  }

  // sort: dirs first, then by zh localeCompare
  result.sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === 'dir' ? -1 : 1
    return a.name.localeCompare(b.name, 'zh')
  })

  return result
}

export function scanRoot(lib: string, root: WritingRoot): WritingTreeNode[] {
  const rootDir = path.join(lib, root)
  return scanDir(rootDir, lib, root)
}

// ── create ───────────────────────────────────────────────────

function createDir(absDir: string): void {
  if (!fs.existsSync(absDir)) {
    fs.mkdirSync(absDir, { recursive: true })
  }
}

export function createFile(lib: string, root: WritingRoot, dir: string, name: string): string {
  const relDir = dir ? `${root}/${dir}` : root
  const absDir = assertInsideRoots(lib, relDir)
  createDir(absDir)

  const fileName = name.endsWith('.md') ? name : `${name}.md`
  const safeName = uniqueName(absDir, fileName)
  const absPath = path.join(absDir, safeName)
  const frontmatter = { type: 'writing' as const }
  const content = matter.stringify('', frontmatter)
  fs.writeFileSync(absPath, content, 'utf-8')

  return toRel(lib, absPath)
}

export function createFolder(lib: string, root: WritingRoot, dir: string, name: string): string {
  const parentRel = dir ? `${root}/${dir}` : root
  const absParent = assertInsideRoots(lib, parentRel)
  const absPath = path.join(absParent, name)
  createDir(absPath)
  return toRel(lib, absPath)
}

// ── rename ───────────────────────────────────────────────────

export function renameNode(lib: string, rel: string, newName: string): string {
  const absOld = assertInsideRoots(lib, rel)
  if (!fs.existsSync(absOld)) {
    throw code('WRITING_NOT_FOUND', `Node not found: ${rel}`)
  }

  // Reject traversal in the new name (path.join would normalize `..` away)
  if (newName.includes('..')) {
    throw code('WRITING_PATH_FORBIDDEN', `Invalid name: ${newName}`)
  }

  const absNew = path.join(path.dirname(absOld), newName)
  assertInsideRoots(lib, toRel(lib, absNew))

  if (fs.existsSync(absNew)) {
    throw code('WRITING_NAME_CONFLICT', `Target already exists: ${toRel(lib, absNew)}`)
  }

  fs.renameSync(absOld, absNew)
  return toRel(lib, absNew)
}

// ── move ─────────────────────────────────────────────────────

export function moveNode(lib: string, rel: string, targetDir: string): string {
  const absSrc = assertInsideRoots(lib, rel)
  if (!fs.existsSync(absSrc)) {
    throw code('WRITING_NOT_FOUND', `Node not found: ${rel}`)
  }

  const absTargetDir = assertInsideRoots(lib, targetDir)
  if (!fs.existsSync(absTargetDir)) {
    createDir(absTargetDir)
  }

  // Prevent moving into itself
  const srcDir = path.dirname(absSrc)
  if (path.resolve(srcDir) === path.resolve(absTargetDir)) {
    throw code('WRITING_PATH_FORBIDDEN', `Cannot move into same directory: ${targetDir}`)
  }

  const name = path.basename(absSrc)
  const safeName = uniqueName(absTargetDir, name)
  const absDest = path.join(absTargetDir, safeName)

  fs.renameSync(absSrc, absDest)
  return toRel(lib, absDest)
}

// ── delete ───────────────────────────────────────────────────

/**
 * @deprecated 仅测试清场使用。IPC 删除走 trashNode/dissolveGroup（移入 .trash），绝不真删用户文章。
 */
export function deleteNode(lib: string, rel: string): void {
  const absPath = assertInsideRoots(lib, rel)
  if (!fs.existsSync(absPath)) {
    throw code('WRITING_NOT_FOUND', `Node not found: ${rel}`)
  }
  fs.rmSync(absPath, { recursive: true, force: true })
}

// ── trash(删除=移入回收站,红线:绝不真删用户文章) ─────────────

export function trashNode(lib: string, rel: string): string {
  const abs = assertInsideRoots(lib, rel)
  if (!fs.existsSync(abs)) {
    throw code('WRITING_NOT_FOUND', `Node not found: ${rel}`)
  }
  const root: WritingRoot = rel === 'writing' || rel.startsWith('writing/') ? 'writing' : 'repository'
  const underRoot = rel === root ? '' : rel.slice(root.length + 1)
  const sub = path.dirname(underRoot)
  const trashDir = path.join(lib, root, '.trash', sub === '.' ? '' : sub)
  createDir(trashDir)
  const safeName = uniqueName(trashDir, path.basename(abs))
  const absDest = path.join(trashDir, safeName)
  fs.renameSync(abs, absDest)
  return toRel(lib, absDest)
}

export function dissolveGroup(lib: string, rel: string): { moved: { from: string; to: string }[]; trashed: string } {
  const abs = assertInsideRoots(lib, rel)
  if (!fs.existsSync(abs) || !fs.statSync(abs).isDirectory()) {
    throw code('WRITING_NOT_FOUND', `Group not found: ${rel}`)
  }
  const parentRel = path.dirname(rel).replace(/\\/g, '/')
  const moved: { from: string; to: string }[] = []
  for (const child of fs.readdirSync(abs)) {
    if (isHidden(child)) continue
    const from = `${rel}/${child}`
    moved.push({ from, to: moveNode(lib, from, parentRel) })
  }
  const trashed = trashNode(lib, rel)
  return { moved, trashed }
}

// ── read / write ─────────────────────────────────────────────

export function readWritingFile(
  lib: string,
  rel: string
): { frontmatter: Record<string, unknown>; body: string } {
  const absPath = assertInsideRoots(lib, rel)
  const raw = fs.readFileSync(absPath, 'utf-8')
  const parsed = matter(raw)
  return { frontmatter: parsed.data as Record<string, unknown>, body: parsed.content }
}

export function writeWritingFile(lib: string, rel: string, body: string): void {
  const absPath = assertInsideRoots(lib, rel)
  // Read existing frontmatter, preserving whatever is already there
  let existingFm: Record<string, unknown> = {}
  if (fs.existsSync(absPath)) {
    const raw = fs.readFileSync(absPath, 'utf-8')
    existingFm = (matter(raw).data as Record<string, unknown>) ?? {}
  }

  const mergedFm = {
    ...existingFm,
    updated: new Date().toISOString().slice(0, 10),
  }

  const content = matter.stringify(body.replace(/^\n/, ''), mergedFm)
  fs.writeFileSync(absPath, content, 'utf-8')
}
