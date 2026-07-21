import type { WritingTreeNode } from '@shared/index'

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
