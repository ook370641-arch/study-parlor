import { useRef } from 'react'

export type ResizeHandle = 'nw' | 'ne' | 'sw' | 'se'

export function ResizeHandles({
  onResize,
}: {
  onResize: (delta: { width: number; height: number }) => void
}) {
  const startRef = useRef<{ x: number; y: number; width: number; height: number } | null>(null)

  const handlePointerDown = (dir: ResizeHandle) => (e: React.PointerEvent) => {
    e.preventDefault()
    e.stopPropagation()
    const el = (e.target as HTMLElement).parentElement!
    const rect = el.getBoundingClientRect()
    startRef.current = { x: e.clientX, y: e.clientY, width: rect.width, height: rect.height }
    ;(e.target as HTMLElement).setPointerCapture(e.pointerId)

    const onMove = (ev: PointerEvent) => {
      if (!startRef.current) return
      const dx = ev.clientX - startRef.current.x
      const dy = ev.clientY - startRef.current.y
      const signX = dir.includes('e') ? 1 : -1
      const signY = dir.includes('s') ? 1 : -1
      onResize({
        width: startRef.current.width + dx * signX,
        height: startRef.current.height + dy * signY,
      })
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
      <div className={`${base} top-0 left-0 cursor-nw-resize`} onPointerDown={handlePointerDown('nw')} />
      <div className={`${base} top-0 right-0 cursor-ne-resize`} onPointerDown={handlePointerDown('ne')} />
      <div className={`${base} bottom-0 left-0 cursor-sw-resize`} onPointerDown={handlePointerDown('sw')} />
      <div className={`${base} bottom-0 right-0 cursor-se-resize`} onPointerDown={handlePointerDown('se')} />
    </>
  )
}
