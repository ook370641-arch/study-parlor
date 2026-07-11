import { useRef } from 'react'

interface Props {
  collapsed: boolean
  onToggleCollapse: () => void
  onResize: (newWidth: number) => void
  theme?: 'academic' | 'newspaper'
}

export function ArticleDivider({ collapsed, onToggleCollapse, onResize, theme = 'academic' }: Props) {
  const isAcademic = theme !== 'newspaper'
  const dragging = useRef<{ startX: number; containerWidth: number; sidebarWidth: number } | null>(null)

  const handlePointerDown = (e: React.PointerEvent) => {
    const target = e.currentTarget
    target.setPointerCapture(e.pointerId)
    const container = target.parentElement
    const containerWidth = container?.getBoundingClientRect().width ?? window.innerWidth
    const sidebar = container?.lastElementChild as HTMLElement | null
    const sidebarWidth = sidebar?.getBoundingClientRect().width ?? 320
    dragging.current = { startX: e.clientX, containerWidth, sidebarWidth }

    const onMove = (ev: PointerEvent) => {
      if (!dragging.current) return
      const dx = ev.clientX - dragging.current.startX
      const nextWidth = dragging.current.sidebarWidth - dx
      onResize(nextWidth)
    }

    const onUp = () => {
      target.releasePointerCapture(e.pointerId)
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      dragging.current = null
    }

    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }

  return (
    <div
      data-testid="article-assistant-divider"
      className={`relative shrink-0 w-1.5 cursor-col-resize flex items-center justify-center transition-colors ${
        isAcademic ? 'bg-parchment/10 hover:bg-parchment/20' : 'bg-[#1a1a1a]/10 hover:bg-[#1a1a1a]/20'
      }`}
      onPointerDown={handlePointerDown}
      title={collapsed ? '展开导读' : '向左拖拽加宽文章'}
    >
      <div className={`w-0.5 h-6 rounded-full ${isAcademic ? 'bg-parchment/25' : 'bg-[#1a1a1a]/25'}`} />
      <button
        data-testid="article-assistant-divider-toggle"
        type="button"
        onClick={(e) => {
          e.stopPropagation()
          onToggleCollapse()
        }}
        className={`absolute top-1/2 -translate-y-1/2 -left-6 z-10 flex items-center justify-center w-5 h-8 rounded-l border border-r-0 text-[10px] ${
          isAcademic
            ? 'bg-ink/80 border-parchment/20 text-parchment/70 hover:text-parchment'
            : 'bg-white border-[#1a1a1a]/20 text-[#555] hover:text-[#1a1a1a]'
        }`}
        title={collapsed ? '展开导读' : '折叠导读'}
      >
        {collapsed ? '◀' : '▶'}
      </button>
    </div>
  )
}
