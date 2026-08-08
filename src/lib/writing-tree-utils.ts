import type { WritingTreeNode } from '@shared/index'

/** 递归统计 WritingTreeNode 树中 file 节点的数量。 */
export function countFiles(nodes: WritingTreeNode[] | undefined): number {
  if (!nodes) return 0
  return nodes.reduce((sum, n) => sum + (n.kind === 'file' ? 1 : countFiles(n.children)), 0)
}

/** Sort nodes by a recorded order array. Nodes in the order list appear first in
 *  recorded sequence; nodes not in the list appear last in their original scan order. */
export function sortNodesByOrder<T extends { path: string }>(nodes: T[], order: string[] | undefined): T[] {
  if (!order || order.length === 0) return nodes
  const rank = new Map(order.map((p, i) => [p, i]))
  return [...nodes].sort((a, b) => {
    const ra = rank.get(a.path)
    const rb = rank.get(b.path)
    if (ra === undefined && rb === undefined) return 0
    if (ra === undefined) return 1
    if (rb === undefined) return -1
    return ra - rb
  })
}

/** 深度优先（按树顺序）找 nodes 中第一个 file 节点的 path；找不到返回 null。 */
export function firstWritingFilePath(nodes: WritingTreeNode[] | undefined): string | null {
  if (!nodes) return null
  for (const n of nodes) {
    if (n.kind === 'file') return n.path
    const found = firstWritingFilePath(n.children)
    if (found) return found
  }
  return null
}

/** 取 dirPath 直接子节点的 path 列表(按 order 排序)。根级传 'writing'/'repository'。 */
export function childrenPathsOf(
  tree: { writing: WritingTreeNode[]; repository: WritingTreeNode[] } | null,
  dirPath: string,
  order?: string[],
): string[] | null {
  if (!tree) return null
  let children: WritingTreeNode[] | null = null
  if (dirPath === 'writing') children = tree.writing
  else if (dirPath === 'repository') children = tree.repository
  else {
    const walk = (nodes: WritingTreeNode[]): WritingTreeNode[] | null => {
      for (const n of nodes) {
        if (n.path === dirPath) return n.children ?? []
        if (n.children) { const r = walk(n.children); if (r) return r }
      }
      return null
    }
    children = walk(tree.writing) ?? walk(tree.repository)
  }
  if (!children) return null
  return sortNodesByOrder(children, order).map(n => n.path)
}

/** 判断 path 是否仍存在于写作树（writing 或 repository 任意深度）。 */
export function writingTreeContainsPath(
  tree: { writing: WritingTreeNode[]; repository: WritingTreeNode[] } | null,
  path: string
): boolean {
  if (!tree) return false
  const walk = (nodes?: WritingTreeNode[]): boolean =>
    !!nodes?.some((n) => n.path === path || walk(n.children))
  return walk(tree.writing) || walk(tree.repository)
}
