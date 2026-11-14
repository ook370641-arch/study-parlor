import fs from 'node:fs'
import path from 'node:path'
import matter from 'gray-matter'
import type { WritingRoot, WritingTreeNode } from '@shared/index'
import { countTextWords } from './text-stats'
import { isNonMdPath } from './writing-tree'
import { loadCatalog, updateWallMetadata } from './writing-catalog'

export function attachWritingWallMetadata(lib: string, root: WritingRoot, nodes: WritingTreeNode[]): WritingTreeNode[] {
  const catalog = loadCatalog(lib, root)

  const attach = (node: WritingTreeNode): WritingTreeNode => {
    if (node.kind === 'dir') return { ...node, children: (node.children ?? []).map(attach) }

    const absolutePath = path.join(lib, node.path)
    let mtimeMs = 0
    try {
      mtimeMs = fs.statSync(absolutePath).mtimeMs
    } catch {
      return node
    }
    const withTime = { ...node, mtimeMs }
    if (isNonMdPath(node.path)) return withTime

    const cached = catalog.entries[node.path]
    if (cached?.wallMtimeMs === mtimeMs && typeof cached.wordCount === 'number') {
      return { ...withTime, wordCount: cached.wordCount }
    }

    try {
      const parsed = matter(fs.readFileSync(absolutePath, 'utf8'))
      const wordCount = countTextWords(parsed.content)
      const cover = typeof parsed.data.cover === 'string' ? parsed.data.cover : undefined
      updateWallMetadata(lib, root, node.path, { wallMtimeMs: mtimeMs, wordCount, cover })
      return { ...withTime, wordCount }
    } catch {
      return withTime
    }
  }

  return nodes.map(attach)
}
