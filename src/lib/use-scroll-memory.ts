// 注意:本文件被渲染进程使用,禁止引入 node 内置模块(ipc-state §5)。
// 滚动位置记忆 Hook(2026-09-29 设计:退出时落盘,不全程维护):
// 滚动停 400ms 只把首可见块索引算进 ref;set store + patchState 只发生在
// 切文档(effect cleanup)/组件卸载/窗口关闭(beforeunload)三个退出点。
import { useEffect, useRef, type RefObject } from 'react'
import { firstVisibleBlockIndex, scrollToBlockIndex } from './scroll-memory'

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

  // 恢复:等块渲染出来后滚到上次首可见块(最多等 ~2s)
  useEffect(() => {
    if (!memKey) return
    const saved = optsRef.current.readSaved(memKey)
    if (saved === undefined || saved <= 0) return
    let tries = 0
    const timer = setInterval(() => {
      const container = containerRef.current
      const blocks = optsRef.current.getBlocks()
      if (container && blocks && blocks.length > 0) {
        scrollToBlockIndex(container, blocks, saved)
        clearInterval(timer)
      } else if (++tries > 40) clearInterval(timer)
    }, 50)
    return () => clearInterval(timer)
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

  // 退出点 3:窗口关闭/刷新 —— fire-and-forget(主进程存活,不等回包)
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
