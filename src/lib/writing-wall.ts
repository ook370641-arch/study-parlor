import type { WritingRoot, WritingTreeNode } from '@shared/index'
import { sortNodesByOrder } from './writing-tree-utils'

export type WritingWallSort = 'default' | 'modified' | 'words'
export type WritingWallGroup = { key: string; label: string; files: WritingTreeNode[]; children: WritingWallGroup[] }

function sortFiles(files: WritingTreeNode[], sort: WritingWallSort) {
  if (sort === 'modified') files.sort((a, b) => (b.mtimeMs ?? 0) - (a.mtimeMs ?? 0) || a.name.localeCompare(b.name, 'zh'))
  if (sort === 'words') files.sort((a, b) => (b.wordCount ?? -1) - (a.wordCount ?? -1) || a.name.localeCompare(b.name, 'zh'))
}

export function buildWritingWallGroups(nodes: WritingTreeNode[], sort: WritingWallSort, order: Record<string, string[]>): WritingWallGroup[] {
  const root = nodes[0]?.path.split('/')[0] === 'repository' ? 'repository' : 'writing'
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
