import { useEffect, useRef } from 'react'
import { useStore } from '@/store'

/** 沉浸模式行宽保持：非沉浸期间用 ResizeObserver 持续记录容器实际像素宽度，
 *  进入沉浸后按该宽度居中（窗口过窄时上限 95%），退出后恢复流式布局。 */
export function useImmersiveWidth<T extends HTMLElement>() {
  const immersive = useStore((s) => s.immersiveMode)
  const containerRef = useRef<T | null>(null)
  const widthRef = useRef<number | null>(null)

  useEffect(() => {
    if (immersive) return
    const el = containerRef.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const record = () => { widthRef.current = el.offsetWidth }
    record()
    const ro = new ResizeObserver(record)
    ro.observe(el)
    return () => ro.disconnect()
  }, [immersive])

  const immersiveStyle = immersive && widthRef.current
    ? { width: widthRef.current, maxWidth: '95%' } as const
    : undefined

  return { immersive, containerRef, immersiveStyle }
}
