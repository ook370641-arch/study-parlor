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

/**
 * scrollToBlockIndex 的顺滑版(2026-10-03 用户反馈:恢复定位瞬跳体感生硬,
 * 想要「应用主动帮我拖动过去」的动画)。easeInOutCubic 缓动,ms 时长;
 * 返回取消函数(用户滚轮/触摸介入时调用方应取消,不与用户抢滚动)。
 * prefers-reduced-motion / ms<=0 / 无 rAF 环境(jsdom)一律退化为瞬滚。
 */
export function scrollToBlockIndexSmooth(
  container: HTMLElement,
  blocks: ArrayLike<Element>,
  index: number,
  ms = 480,
): () => void {
  if (blocks.length === 0) return () => {}
  const reduced = typeof window !== 'undefined'
    && typeof window.matchMedia === 'function'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches
  if (ms <= 0 || reduced || typeof requestAnimationFrame !== 'function') {
    scrollToBlockIndex(container, blocks, index)
    return () => {}
  }
  const i = Math.max(0, Math.min(Math.round(index), blocks.length - 1))
  const delta = blocks[i].getBoundingClientRect().top - container.getBoundingClientRect().top
  if (Math.abs(delta) < 2) return () => {}
  const start = container.scrollTop
  const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2)
  // t0 取首帧 rAF 时间戳而非 performance.now():jsdom 下两者时钟原点不同会算出负进度
  let t0: number | null = null
  let raf = 0
  const step = (now: number) => {
    if (t0 === null) t0 = now
    const p = Math.min(1, Math.max(0, (now - t0) / ms))
    container.scrollTop = start + delta * ease(p)
    if (p < 1) raf = requestAnimationFrame(step)
  }
  raf = requestAnimationFrame(step)
  return () => cancelAnimationFrame(raf)
}
