// 注意:本文件被渲染进程使用,禁止引入 node 内置模块(ipc-state §5)。
// 滚动位置记忆 Hook(2026-09-29 设计:退出时落盘,不全程维护):
// 滚动停 400ms 只把首可见块索引算进 ref;set store + patchState 只发生在
// 切文档(effect cleanup)/组件卸载/窗口关闭(beforeunload)三个退出点。
import { useEffect, useRef, type RefObject } from 'react'
import { firstVisibleBlockIndex, scrollToBlockIndexSmooth } from './scroll-memory'

export interface ScrollMemoryOptions {
  /** 当前文档稳定 key(filePath);null = 未就绪,不恢复也不记录 */
  memKey: string | null
  containerRef: RefObject<HTMLElement | null>
  /** 取当前块集合;返回 null 或 length 0 = 块未渲染好(恢复轮询继续等) */
  getBlocks: () => ArrayLike<Element> | null
  /** 读已保存块索引 —— 必须读 getState() 快照,不能订阅(保存改它会反向触发恢复) */
  readSaved: (key: string) => number | undefined
  /** 退出点落盘:set store + 一次 patchState */
  flush: (key: string, blockIndex: number) => void
  /** 防抖窗内校验文档未切走(400ms 内切文档则丢弃本次记录) */
  isCurrent: (key: string) => boolean
  /** 恢复动画时长(ms);0 = 瞬滚(测试用)。默认 480 */
  animateMs?: number
}

export function useScrollMemory(opts: ScrollMemoryOptions): { onScroll: () => void } {
  const { memKey, containerRef } = opts
  // 回调经 ref 实时取,避免闭包捕获过期 props
  const optsRef = useRef(opts)
  optsRef.current = opts
  const pendingRef = useRef<{ key: string; index: number } | null>(null)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const flushPending = () => {
    const p = pendingRef.current
    pendingRef.current = null
    if (p) optsRef.current.flush(p.key, p.index)
  }

  // 恢复:轮询直到块数稳定(2026-10-03 修复:旧实现 blocks>0 即滚一次就停,
  // 博客分块渐进渲染下目标索引未渲染时钳制到浅位置 → 恢复不精准)。
  // 只在「首次覆盖目标索引」或「块数又增长」时重滚——块数不变时不碰容器,
  // 否则恢复窗口内会与用户滚动打架(e2e 实证:恢复把用户滚动的位置拉回 saved)。
  // 滚动走顺滑动画(用户滚轮/触摸一触即取消并停轮询,不与用户抢控制权);
  // 块数连续 3 次不变后停(未滚过则做一次钳制滚动兜底)。上限 ~6s。
  useEffect(() => {
    if (!memKey) return
    const saved = optsRef.current.readSaved(memKey)
    if (saved === undefined || saved <= 0) return
    const animateMs = optsRef.current.animateMs ?? 480
    let tries = 0, lastLen = -1, stable = 0, applied = false
    let cancelAnim: (() => void) | null = null
    const apply = (container: HTMLElement, blocks: ArrayLike<Element>) => {
      cancelAnim?.()
      cancelAnim = scrollToBlockIndexSmooth(container, blocks, saved, animateMs)
      applied = true
    }
    const timer = setInterval(() => {
      const container = containerRef.current
      const blocks = optsRef.current.getBlocks()
      if (!container || !blocks || blocks.length === 0) {
        if (++tries > 60) clearInterval(timer)
        return
      }
      const grew = blocks.length !== lastLen
      if (grew) { stable = 0; lastLen = blocks.length } else stable++
      if (blocks.length > saved && (!applied || grew)) apply(container, blocks)
      if (stable >= 3) {
        if (!applied) apply(container, blocks) // 文档变短:钳制到最后块
        clearInterval(timer)
      } else if (++tries > 60) clearInterval(timer)
    }, 100)
    // 用户主动滚动(滚轮/触摸/键盘)= 接管,取消动画与恢复轮询
    const container = containerRef.current
    const onUserScroll = () => { cancelAnim?.(); clearInterval(timer) }
    container?.addEventListener('wheel', onUserScroll, { passive: true })
    container?.addEventListener('touchstart', onUserScroll, { passive: true })
    window.addEventListener('keydown', onUserScroll, true)
    return () => {
      cancelAnim?.()
      clearInterval(timer)
      container?.removeEventListener('wheel', onUserScroll)
      container?.removeEventListener('touchstart', onUserScroll)
      window.removeEventListener('keydown', onUserScroll, true)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [memKey])

  // 退出点 1+2:切文档(cleanup 先于新 effect 跑)与组件卸载 —— 落盘待存位置
  useEffect(() => {
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current)
      flushPending()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [memKey])

  // 退出点 3:窗口关闭/刷新 —— sendSync 阻塞到主进程写完,保证卸载前必达
  useEffect(() => {
    const onUnload = () => flushPending()
    window.addEventListener('beforeunload', onUnload)
    return () => window.removeEventListener('beforeunload', onUnload)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const onScroll = () => {
    const key = optsRef.current.memKey
    if (!key) return
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => {
      if (!optsRef.current.isCurrent(key)) return // 防抖窗内文档已切走
      const container = containerRef.current
      const blocks = optsRef.current.getBlocks()
      if (container && blocks && blocks.length > 0) {
        pendingRef.current = { key, index: firstVisibleBlockIndex(container, blocks) }
      }
    }, 400)
  }

  return { onScroll }
}
