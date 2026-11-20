import { useEffect, useRef, useState } from 'react'
import type { DragEvent, MouseEvent, ReactNode } from 'react'

export function AlbumGroupSection({
  groupKey, testIdPrefix, label, count, collapsed, onToggle, draggable = false,
  onGroupDragStart, onGroupDragOver, onGroupDrop, headerClassName = '', headerAction, longPressDrag = false, children,
}: {
  groupKey: string
  testIdPrefix: string
  label: string
  count: number
  collapsed: boolean
  onToggle: () => void
  draggable?: boolean
  onGroupDragStart?: (event: DragEvent<HTMLElement>) => void
  onGroupDragOver?: (event: DragEvent<HTMLElement>) => void
  onGroupDrop?: (event: DragEvent<HTMLElement>) => void
  headerClassName?: string
  headerAction?: ReactNode
  longPressDrag?: boolean
  children: ReactNode
}) {
  const [pressReady, setPressReady] = useState(false)
  const pressTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const cancelPress = () => {
    if (pressTimer.current) clearTimeout(pressTimer.current)
    pressTimer.current = null
    setPressReady(false)
  }
  useEffect(() => () => { if (pressTimer.current) clearTimeout(pressTimer.current) }, [])
  const startPress = (event: MouseEvent<HTMLElement>) => {
    if (!longPressDrag || event.button !== 0 || (event.target as HTMLElement).closest('button, [role="button"]')) return
    pressTimer.current = setTimeout(() => {
      pressTimer.current = null
      setPressReady(true)
    }, 400)
  }

  return (
    <section data-group-section={groupKey}>
      <div
        data-testid={`${testIdPrefix}-group-header-${groupKey}`}
        draggable={draggable && (!longPressDrag || pressReady) ? true : undefined}
        title={longPressDrag ? '长按拖拽排序' : undefined}
        onMouseDown={startPress}
        onMouseUp={cancelPress}
        onMouseLeave={() => { if (pressTimer.current) clearTimeout(pressTimer.current); pressTimer.current = null }}
        onDragStart={event => {
          if (longPressDrag && !pressReady) { event.preventDefault(); return }
          onGroupDragStart?.(event)
        }}
        onDragEnd={cancelPress}
        onDragOver={onGroupDragOver}
        onDrop={onGroupDrop}
        className={`group/header flex select-none items-center gap-1.5 py-1 ${longPressDrag ? 'cursor-grab active:cursor-grabbing' : ''} ${headerClassName}`}
      >
        {draggable && !longPressDrag && <span aria-hidden="true" data-testid={`${testIdPrefix}-group-handle-${groupKey}`} className="cursor-grab opacity-0 transition-opacity group-hover/header:opacity-100">⠿</span>}
        <button type="button" onClick={onToggle} aria-label={`${collapsed ? '展开' : '收起'}${label}`} className="hover:text-ember">
          {collapsed ? '▸' : '▾'}
        </button>
        <h3 className="font-serif">{label}</h3>
        <span className="opacity-50">{count}</span>
        {!collapsed && headerAction && <div className="ml-auto flex items-center" onMouseDown={event => event.stopPropagation()}>{headerAction}</div>}
      </div>
      {!collapsed && <div data-testid={`${testIdPrefix}-group-content-${groupKey}`}>{children}</div>}
    </section>
  )
}
