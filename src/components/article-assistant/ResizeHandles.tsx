import { useRef } from 'react'

export type ResizeHandle = 'nw' | 'ne' | 'sw' | 'se'

export interface ResizeResult {
  width: number
  height: number
  x: number
  y: number
}

export function ResizeHandles({
  onResize,
  minWidth,
  minHeight,
}: {
  onResize: (next: ResizeResult) => void
  minWidth: number
  minHeight: number
}) {
  const startRef = useRef<{ x: number; y: number; left: number; top: number; width: number; height: number } | null>(null)

  const handlePointerDown = (dir: ResizeHandle) => (e: React.PointerEvent) => {
    e.preventDefault()
    e.stopPropagation()
    const el = (e.target as HTMLElement).parentElement!
    const rect = el.getBoundingClientRect()
    startRef.current = { x: e.clientX, y: e.clientY, left: rect.left, top: rect.top, width: rect.width, height: rect.height }
    ;(e.target as HTMLElement).setPointerCapture(e.pointerId)

    const onMove = (ev: PointerEvent) => {
      const s = startRef.current
      if (!s) return
      const dx = ev.clientX - s.x
      const dy = ev.clientY - s.y
      const fixedRight = s.left + s.width
      const fixedBottom = s.top + s.height

      let width = s.width + dx * (dir.includes('e') ? 1 : -1)
      let height = s.height + dy * (dir.includes('s') ? 1 : -1)

      // 最小尺寸；向左/向上最多扩展到视口边缘（固定边为界）
      width = Math.max(minWidth, width)
      if (dir.includes('w')) width = Math.min(width, fixedRight)
      height = Math.max(minHeight, height)
      if (dir.includes('n')) height = Math.min(height, fixedBottom)

      // handle 对边钉死、被拖边跟随光标：w/n 方向同步补偿 left/top
      const left = dir.includes('w') ? fixedRight - width : s.left
      const top = dir.includes('n') ? fixedBottom - height : s.top

      // 右/下不超出视口
      width = Math.min(width, window.innerWidth - left)
      height = Math.min(height, window.innerHeight - top)

      onResize({ width, height, x: left, y: top })
    }

    const onUp = () => {
      ;(e.target as HTMLElement).releasePointerCapture(e.pointerId)
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      startRef.current = null
    }

    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }

  const base = 'absolute w-3 h-3 z-10'
  return (
    <>
      <div data-testid="resize-handle-nw" className={`${base} top-0 left-0 cursor-nw-resize`} onPointerDown={handlePointerDown('nw')} />
      <div data-testid="resize-handle-ne" className={`${base} top-0 right-0 cursor-ne-resize`} onPointerDown={handlePointerDown('ne')} />
      <div data-testid="resize-handle-sw" className={`${base} bottom-0 left-0 cursor-sw-resize`} onPointerDown={handlePointerDown('sw')} />
      <div data-testid="resize-handle-se" className={`${base} bottom-0 right-0 cursor-se-resize`} onPointerDown={handlePointerDown('se')} />
    </>
  )
}
