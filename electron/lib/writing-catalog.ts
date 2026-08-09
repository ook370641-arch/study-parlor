import fs from 'node:fs'
import path from 'node:path'
import type { WritingCatalog, WritingCatalogEntry, WritingRoot, WritingTreeNode } from '@shared/index'
import { scanRoot } from './writing-tree'

const EMPTY: WritingCatalog = { version: 1, entries: {} }

export function catalogPath(lib: string, root: WritingRoot): string {
  return path.join(lib, root, '.catalog.json')
}

export function loadCatalog(lib: string, root: WritingRoot): WritingCatalog {
  const p = catalogPath(lib, root)
  if (!fs.existsSync(p)) return { ...EMPTY, entries: {} }
  try {
    const raw = fs.readFileSync(p, 'utf8')
    const parsed = JSON.parse(raw)
    if (parsed && parsed.version === 1 && typeof parsed.entries === 'object') {
      return parsed as WritingCatalog
    }
  } catch { /* damaged — rebuild */ }
  return { ...EMPTY, entries: {} }
}

export function saveCatalog(lib: string, root: WritingRoot, catalog: WritingCatalog): void {
  fs.writeFileSync(catalogPath(lib, root), JSON.stringify(catalog, null, 2), 'utf8')
}

export function updateEntry(lib: string, root: WritingRoot, rel: string, entry: WritingCatalogEntry): void {
  const c = loadCatalog(lib, root)
  c.entries[rel] = entry
  saveCatalog(lib, root, c)
}

export function removeEntry(lib: string, root: WritingRoot, rel: string): void {
  const c = loadCatalog(lib, root)
  delete c.entries[rel]
  saveCatalog(lib, root, c)
}

// Move/rename: remove old path, add new entry (caller provides new entry or copies old)
export function migrateEntry(lib: string, root: WritingRoot, oldRel: string, newRel: string): void {
  const c = loadCatalog(lib, root)
  const entry = c.entries[oldRel]
  if (entry) {
    delete c.entries[oldRel]
    c.entries[newRel] = entry
    saveCatalog(lib, root, c)
  }
}

// 目录改名:把所有 key 以 oldRel 为前缀(含 oldRel 自身)的摘要条目改写为 newRel 前缀。
// 仅在有改动时写盘;无子条目的单文件路径等价 migrateEntry。
export function migratePrefix(lib: string, root: WritingRoot, oldRel: string, newRel: string): void {
  const c = loadCatalog(lib, root)
  let changed = false
  for (const k of Object.keys(c.entries)) {
    if (k === oldRel || k.startsWith(oldRel + '/')) {
      const entry = c.entries[k]
      delete c.entries[k]
      c.entries[newRel + k.slice(oldRel.length)] = entry
      changed = true
    }
  }
  if (changed) saveCatalog(lib, root, c)
}

function collectMdPaths(nodes: WritingTreeNode[]): string[] {
  const result: string[] = []
  for (const n of nodes) {
    if (n.kind === 'file') result.push(n.path)
    if (n.children) result.push(...collectMdPaths(n.children))
  }
  return result
}

export function diffStale(lib: string, root: WritingRoot): string[] {
  const files = collectMdPaths(scanRoot(lib, root))
  const c = loadCatalog(lib, root)
  return files.filter(f => {
    const entry = c.entries[f]
    if (!entry || entry.mtimeMs == null) return true
    try {
      return fs.statSync(path.join(lib, f)).mtimeMs > entry.mtimeMs
    } catch { return true }
  })
}
