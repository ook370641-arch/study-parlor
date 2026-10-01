// @vitest-environment jsdom
// 首可见块索引计算与恢复 —— src/lib/scroll-memory.ts
import { describe, it, expect } from 'vitest'
import { firstVisibleBlockIndex, scrollToBlockIndex } from '@/lib/scroll-memory'

/** 构造容器 + n 个块,每个块高 height,依次堆叠;容器顶在 containerTop,高 100 */
function makeDom(blockCount: number, height = 50, containerTop = 0) {
  const container = document.createElement('div')
  const root = document.createElement('div')
  container.appendChild(root)
  document.body.appendChild(container)
  const blocks: HTMLElement[] = []
  for (let i = 0; i < blockCount; i++) {
    const b = document.createElement('p')
    root.appendChild(b)
    blocks.push(b)
  }
  let scrollTop = 0
  const layout = () => {
    blocks.forEach((b, i) => {
      const top = containerTop + i * height - scrollTop
      b.getBoundingClientRect = () => ({ top, bottom: top + height }) as DOMRect
    })
    container.getBoundingClientRect = () => ({ top: containerTop, bottom: containerTop + 100 }) as DOMRect
  }
  layout()
  Object.defineProperty(container, 'scrollTop', {
    get: () => scrollTop,
    set: (v) => { scrollTop = v; layout() },
    configurable: true,
  })
  return { container, root, blocks, setScroll: (v: number) => { container.scrollTop = v } }
}

describe('scroll-memory', () => {
  it('未滚动时首可见块 = 0', () => {
    const { container, root } = makeDom(5)
    expect(firstVisibleBlockIndex(container, root.children)).toBe(0)
  })

  it('块骑跨容器顶边时返回该块(半块可见也算首可见)', () => {
    const { container, root, setScroll } = makeDom(5)
    setScroll(75) // 块1(50-100)骑跨顶边:可见 25px
    expect(firstVisibleBlockIndex(container, root.children)).toBe(1)
  })

  it('整块滚过顶边后返回下一块', () => {
    const { container, root, setScroll } = makeDom(5)
    setScroll(100) // 块0/1 全滚过,块2 贴顶
    expect(firstVisibleBlockIndex(container, root.children)).toBe(2)
  })

  it('滚到底返回最后一块', () => {
    const { container, root, setScroll } = makeDom(3)
    setScroll(500)
    expect(firstVisibleBlockIndex(container, root.children)).toBe(2)
  })

  it('空块集合 → 0,恢复为空操作', () => {
    const { container, root } = makeDom(0)
    expect(firstVisibleBlockIndex(container, root.children)).toBe(0)
    expect(() => scrollToBlockIndex(container, root.children, 3)).not.toThrow()
  })

  it('恢复:把指定块滚到容器顶部', () => {
    const { container, root } = makeDom(5)
    scrollToBlockIndex(container, root.children, 2)
    expect(container.scrollTop).toBe(100)
    expect(firstVisibleBlockIndex(container, root.children)).toBe(2)
  })

  it('恢复索引越界自动钳制到最后一块', () => {
    const { container, root } = makeDom(3)
    scrollToBlockIndex(container, root.children, 99)
    expect(container.scrollTop).toBe(100)
  })

  it('接受 NodeList(querySelectorAll 结果)与数组', () => {
    const { container, root, setScroll } = makeDom(5)
    setScroll(75)
    const nodeList = root.querySelectorAll('p') // NodeList,非 HTMLCollection
    expect(firstVisibleBlockIndex(container, nodeList)).toBe(1)
    expect(firstVisibleBlockIndex(container, Array.from(nodeList))).toBe(1)
    scrollToBlockIndex(container, nodeList, 2)
    expect(container.scrollTop).toBe(100)
  })

  it('空数组 → 0,恢复为空操作', () => {
    const { container } = makeDom(0)
    expect(firstVisibleBlockIndex(container, [])).toBe(0)
    expect(() => scrollToBlockIndex(container, [], 3)).not.toThrow()
  })
})
