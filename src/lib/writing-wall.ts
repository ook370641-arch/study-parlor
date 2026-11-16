import type { WritingRoot, WritingTreeNode } from '@shared/index'
import { sortNodesByOrder } from './writing-tree-utils'

export type WritingWallSort = 'default' | 'modified' | 'words'
export type WritingWallGroup = { key: string; label: string; files: WritingTreeNode[]; children: WritingWallGroup[] }

function sortFiles(files: WritingTreeNode[], sort: WritingWallSort) {
  if (sort === 'modified') files.sort((a, b) => (b.mtimeMs ?? 0) - (a.mtimeMs ?? 0) || a.name.localeCompare(b.name, 'zh'))
  if (sort === 'words') files.sort((a, b) => (b.wordCount ?? -1) - (a.wordCount ?? -1) || a.name.localeCompare(b.name, 'zh'))
}

export function buildWritingWallGroups(nodes: WritingTreeNode[], sort: WritingWallSort, order: Record<string, string[]>, hierarchical = false): WritingWallGroup[] {
  const root = nodes[0]?.path.split('/')[0] === 'repository' ? 'repository' : 'writing'
  if (hierarchical) {
    const buildDir = (items: WritingTreeNode[], dirPath: string, label: string): WritingWallGroup => {
      const group: WritingWallGroup = { key: dirPath, label, files: [], children: [] }
      for (const node of sortNodesByOrder(items, order[dirPath])) {
        if (node.kind === 'dir') {
          const child = buildDir(node.children ?? [], node.path, node.name)
          if (child.files.length > 0 || child.children.length > 0) group.children.push(child)
        } else {
          group.files.push(node)
        }
      }
      sortFiles(group.files, sort)
      return group
    }
    const rootGroup = buildDir(nodes, root, '未分组')
    return [...rootGroup.children, ...(rootGroup.files.length > 0 ? [{ ...rootGroup, children: [] }] : [])]
  }

  const groups: WritingWallGroup[] = []
  const byPath = new Map<string, WritingWallGroup>()

  const groupFor = (root: WritingRoot, dirPath: string, label: string) => {
    const key = dirPath || root
    const existing = byPath.get(key)
    if (existing) return existing
    const group = { key, label, files: [], children: [] }
    byPath.set(key, group)
    groups.push(group)
    return group
  }

  const walk = (items: WritingTreeNode[], root: WritingRoot, dirPath: string, label: string) => {
    for (const node of sortNodesByOrder(items, order[dirPath || root])) {
      if (node.kind === 'dir') {
        walk(node.children ?? [], root, node.path, node.path.split('/').slice(1).join(' / '))
      } else {
        groupFor(root, dirPath, label).files.push(node)
      }
    }
  }

  walk(nodes, root, '', '未分组')

  for (const group of groups) {
    sortFiles(group.files, sort)
  }
  return groups
}
