import type { DragEvent, ReactNode } from 'react'
import type { BlogMineGroup } from '@shared/index'

interface Props {
  area: 'list' | 'wall'
  group: BlogMineGroup
  label: string
  count: number
  collapsed: boolean
  onToggle: () => void
  onGroupDragStart: (event: DragEvent<HTMLElement>) => void
  onGroupDragOver: (event: DragEvent<HTMLElement>) => void
  onGroupDrop: (event: DragEvent<HTMLElement>) => void
  recommendationTools?: ReactNode
  children: ReactNode
}

export function BlogMineGroupSection({
  area,
  group,
  label,
  count,
  collapsed,
  onToggle,
  onGroupDragStart,
  onGroupDragOver,
  onGroupDrop,
  recommendationTools,
  children,
}: Props) {
  return (
    <section data-group-section={group}>
      <div
        data-testid={`${area}-group-header-${group}`}
        draggable
        onDragStart={onGroupDragStart}
        onDragOver={onGroupDragOver}
        onDrop={onGroupDrop}
        className="group/header flex select-none items-center gap-1.5 py-1"
      >
        <span aria-hidden="true" data-testid={`${area}-group-handle-${group}`} className="cursor-grab opacity-0 transition-opacity group-hover/header:opacity-100">⠿</span>
        <button type="button" onClick={onToggle} aria-label={`${collapsed ? '展开' : '收起'}${label}`} className="hover:text-ember">
          {collapsed ? '▸' : '▾'}
        </button>
        <h3 className="font-serif">{label}</h3>
        <span className="opacity-50">{count}</span>
      </div>
      {!collapsed && (
        <>
          {recommendationTools}
          <div data-testid={`${area}-group-content-${group}`}>{children}</div>
        </>
      )}
    </section>
  )
}
