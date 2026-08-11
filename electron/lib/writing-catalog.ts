import fs from 'node:fs'
import path from 'node:path'
import type { WritingCatalog, WritingCatalogEntry, WritingGroupSummaryEntry, WritingRoot, WritingTreeNode } from '@shared/index'
import { scanRoot } from './writing-tree'

const EMPTY: WritingCatalog = { version: 2, entries: {}, groups: {} }

export function catalogPath(lib: string, root: WritingRoot): string {
  return path.join(lib, root, '.catalog.json')
}

export function loadCatalog(lib: string, root: WritingRoot): WritingCatalog {
  const p = catalogPath(lib, root)
  if (!fs.existsSync(p)) return { ...EMPTY, entries: {}, groups: {} }
  try {
    const raw = fs.readFileSync(p, 'utf8')
    const parsed = JSON.parse(raw) as { version?: number; entries?: Record<string, WritingCatalogEntry>; groups?: Record<string, WritingGroupSummaryEntry> }
    if (parsed && parsed.version === 2 && typeof parsed.entries === 'object' && typeof parsed.groups === 'object') {
      return parsed as WritingCatalog
    }
    if (parsed && parsed.version === 1 && typeof parsed.entries === 'object') {
      return { version: 2, entries: parsed.entries, groups: parsed.groups ?? {} }
    }
  } catch { /* damaged — rebuild */ }
  return { ...EMPTY, entries: {}, groups: {} }
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

export function updateGroupSummary(lib: string, root: WritingRoot, dir: string, entry: WritingGroupSummaryEntry): void {
  const c = loadCatalog(lib, root)
  c.groups[dir] = entry
  saveCatalog(lib, root, c)
}

export function removeGroupSummary(lib: string, root: WritingRoot, dir: string): void {
  const c = loadCatalog(lib, root)
  let changed = false
  for (const k of Object.keys(c.groups)) {
    if (k === dir || k.startsWith(dir + '/')) {
      delete c.groups[k]
      changed = true
    }
  }
  if (changed) saveCatalog(lib, root, c)
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
  for (const k of Object.keys(c.groups)) {
    if (k === oldRel || k.startsWith(oldRel + '/')) {
      const g = c.groups[k]
      delete c.groups[k]
      c.groups[newRel + k.slice(oldRel.length)] = g
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

function collectDescendantFiles(node: WritingTreeNode): string[] {
  const out: string[] = []
  const walk = (n: WritingTreeNode) => {
    if (n.kind === 'file') { out.push(n.path); return }
    for (const c of n.children ?? []) walk(c)
  }
  walk(node)
  return out
}

/** 目录中所有含 md 文件的分组（含递归子分组）；memberPaths 为全后代文件路径（排序后）。 */
export function collectGroupDirs(nodes: WritingTreeNode[]): { rel: string; memberPaths: string[] }[] {
  const out: { rel: string; memberPaths: string[] }[] = []
  const walk = (ns: WritingTreeNode[]) => {
    for (const n of ns) {
      if (n.kind !== 'dir') continue
      const memberPaths = collectDescendantFiles(n).sort()
      if (memberPaths.length > 0) out.push({ rel: n.path, memberPaths })
      walk(n.children ?? [])
    }
  }
  walk(nodes)
  return out
}

/** 分组摘要签名：基于 catalog 条目 mtime（成员摘要变了才重算），未生成条目为 '?'。 */
export function groupSignature(catalog: WritingCatalog, memberPaths: string[]): string {
  return memberPaths.map(p => `${p}:${catalog.entries[p]?.mtimeMs ?? '?'}`).join('|')
}
