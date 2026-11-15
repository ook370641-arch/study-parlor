import type { WritingRoot, WritingTreeNode } from '@shared/index'
import { sortNodesByOrder } from './writing-tree-utils'

export type WritingWallSort = 'default' | 'modified' | 'words'
export type WritingWallGroup = { key: string; label: string; files: WritingTreeNode[] }

export function buildWritingWallGroups(nodes: WritingTreeNode[], sort: WritingWallSort, order: Record<string, string[]>): WritingWallGroup[] {
  const groups: WritingWallGroup[] = []
  const byPath = new Map<string, WritingWallGroup>()

  const groupFor = (root: WritingRoot, dirPath: string, label: string) => {
    const key = dirPath || root
    const existing = byPath.get(key)
    if (existing) return existing
    const group = { key, label, files: [] }
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

  const root = nodes[0]?.path.split('/')[0] === 'repository' ? 'repository' : 'writing'
  walk(nodes, root, '', '未分组')

  for (const group of groups) {
    if (sort === 'modified') group.files.sort((a, b) => (b.mtimeMs ?? 0) - (a.mtimeMs ?? 0) || a.name.localeCompare(b.name, 'zh'))
    if (sort === 'words') group.files.sort((a, b) => (b.wordCount ?? -1) - (a.wordCount ?? -1) || a.name.localeCompare(b.name, 'zh'))
  }
  return groups
}
