// 注意:本文件被渲染进程使用,禁止引入 node 内置模块(ipc-state §5)。
// 浏览位置记忆(2026-09-22 用户反馈:博客/写作每次打开恢复到上次的文章与位置)。
// 粗粒度「首可见块索引」方案——记录滚动容器内第一个可见块在块集合中的索引,
// 恢复时把该块滚回容器顶部。块集合由调用方决定取哪一层(ArrayLike:HTMLCollection/
// NodeList/数组均可)——如写作取 .ProseMirror.children,博客取 .md-body > *(2026-09-29
// 修复:曾误取 <article> 直接子元素,只有 1 个包裹 div,首可见块恒为 0 → 恢复失效)。
// 不追求像素一致(图片懒加载/字号变化都会改偏移),块级粒度对用户已足够,
// 且对文档编辑(块增删)最稳健。

/**
 * 首可见块索引:第一个「底边在容器顶之下」的块——即骑跨容器顶边或
 * 第一个完整可见的块。全部滚过(容器在末尾)时返回最后一块。
 */
export function firstVisibleBlockIndex(container: HTMLElement, blocks: ArrayLike<Element>): number {
  if (blocks.length === 0) return 0
  const containerTop = container.getBoundingClientRect().top
  for (let i = 0; i < blocks.length; i++) {
    if (blocks[i].getBoundingClientRect().bottom > containerTop + 1) return i
  }
  return blocks.length - 1
}

/** 把第 index 个块滚动到容器顶部(索引越界自动钳制;无块不动) */
export function scrollToBlockIndex(container: HTMLElement, blocks: ArrayLike<Element>, index: number): void {
  if (blocks.length === 0) return
  const i = Math.max(0, Math.min(Math.round(index), blocks.length - 1))
  const delta = blocks[i].getBoundingClientRect().top - container.getBoundingClientRect().top
  container.scrollTop += delta
}
