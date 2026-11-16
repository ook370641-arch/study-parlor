import type { DragEvent, ReactNode } from 'react'

export function AlbumGroupSection({
  groupKey, testIdPrefix, label, count, collapsed, onToggle, draggable = false,
  onGroupDragStart, onGroupDragOver, onGroupDrop, headerClassName = '', children,
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
  children: ReactNode
}) {
  return (
    <section data-group-section={groupKey}>
      <div
        data-testid={`${testIdPrefix}-group-header-${groupKey}`}
        draggable={draggable}
        onDragStart={onGroupDragStart}
        onDragOver={onGroupDragOver}
        onDrop={onGroupDrop}
        className={`group/header flex select-none items-center gap-1.5 py-1 ${headerClassName}`}
      >
        {draggable && <span aria-hidden="true" data-testid={`${testIdPrefix}-group-handle-${groupKey}`} className="cursor-grab opacity-0 transition-opacity group-hover/header:opacity-100">⠿</span>}
        <button type="button" onClick={onToggle} aria-label={`${collapsed ? '展开' : '收起'}${label}`} className="hover:text-ember">
          {collapsed ? '▸' : '▾'}
        </button>
        <h3 className="font-serif">{label}</h3>
        <span className="opacity-50">{count}</span>
      </div>
      {!collapsed && <div data-testid={`${testIdPrefix}-group-content-${groupKey}`}>{children}</div>}
    </section>
  )
}
