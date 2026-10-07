/**
 * 文章正文 DOM 重建（导读注入、标注 marker 拆分文本节点）会销毁正在进行的划选，
 * 表现为「拖不动」或「复制结果比拖动区域短」。重建前统一用此判定选区是否活跃。
 */

/** 选区是否正活跃于容器内：按住鼠标划选中，或选区未收敛且落在容器内 */
export function isSelectionActiveIn(container: HTMLElement | null, mouseDownInside = false): boolean {
  if (!container) return false
  if (mouseDownInside) return true
  const sel = window.getSelection()
  if (!sel || sel.rangeCount === 0 || sel.isCollapsed) return false
  return container.contains(sel.getRangeAt(0).commonAncestorContainer)
}
