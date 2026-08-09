import type { WritingTreeNode, WritingRoot, WritingErrorCode } from '@shared/index'

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

/** 文件显示名：去掉 .md 后缀；目录名原样返回。 */
export function displayWritingName(node: { name: string; kind: 'file' | 'dir' }): string {
  return node.kind === 'file' && node.name.endsWith('.md') ? node.name.slice(0, -3) : node.name
}

/** 文件重命名/新建名归一化：文件补 .md（防 renameNode 丢扩展名），目录原样。 */
export function normalizeWritingFileName(name: string, isFile: boolean): string {
  if (!isFile) return name
  return name.endsWith('.md') ? name : `${name}.md`
}

/** 日记分组新建预填：仅 writing 根级「日记」分组直接子级，返回当天 M.D；已存在同名文件返回空串。 */
export function diaryPrefillName(
  root: WritingRoot,
  dir: string,
  children: WritingTreeNode[] | undefined,
  now = new Date(),
): string {
  if (root !== 'writing' || dir !== '日记') return ''
  const candidate = `${now.getMonth() + 1}.${now.getDate()}`
  const exists = children?.some(c => c.kind === 'file' && c.name === `${candidate}.md`)
  return exists ? '' : candidate
}

/**
 * 新文件（无序 file）在显示列表中的落盘槽位：
 * 有序节点在前 → 其后无序目录靠前 → 无序文件按 localeCompare zh 排序。
 * children 传扫描序（root 用 tree?.[root]，分组用 node.children），与 sortNodesByOrder 语义一致。
 * 空值 → 列表末尾。
 */
export function sortedInsertIndexForFile(
  children: WritingTreeNode[],
  order: string[] | undefined,
  value: string,
): number {
  if (!value.trim()) return children.length
  const ordered = new Set(order ?? [])
  const orderedCount = children.filter(c => ordered.has(c.path)).length
  const name = `${value.trim()}.md`
  let dirCount = 0
  for (const c of children) {
    if (ordered.has(c.path)) continue
    if (c.kind === 'dir') dirCount++
    else break
  }
  let filePos = 0
  for (const c of children) {
    if (ordered.has(c.path) || c.kind === 'dir') continue
    if (c.name.localeCompare(name, 'zh') > 0) break
    filePos++
  }
  return orderedCount + dirCount + filePos
}

/** 写作错误码 → 中文文案。 */
export function writingErrorText(code: WritingErrorCode): string {
  switch (code) {
    case 'WRITING_NAME_CONFLICT': return '同名文件已存在'
    case 'WRITING_PATH_FORBIDDEN': return '名称无效'
    case 'WRITING_NOT_FOUND': return '文件不存在'
    case 'WRITING_IO_ERROR': return '写入失败，请重试'
    default: return '操作失败'
  }
}
